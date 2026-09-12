"""MCCFR 训练器（冻结契约 `docs/INTERFACES.md` §3.1，算法 spec §26-§41）。

# 算法语义

与 `reference/xiuxian_ai_demo/xiuxian/mccfr.py` **逐步等价**：

- 一次 *outer iteration* = 每名玩家各做一次 update-player episode；
- Outcome-Sampling：每层只向下采样一个动作，不做整树展开；
- update-player 用 `epsilon` exploration（`sample_policy = eps*uniform + (1-eps)*policy`）；
- importance sampling 修正 sampled counterfactual value（除以 `sample_reach`）；
- 按 regret matching 更新策略，`strategy_sum` 用自身 reach 加权累加。

# 与参考实现的唯一差异

信息集 key 从 `repr(...)` **大字符串**换成 `game.state.GameState.infoset_key(player)`
返回的**紧凑 int/tuple**（§1.5）。这是模型体积从 ~124MB 降到个位数 MB 的核心。

`load()` 仍能读参考实现产出的旧模型（字符串 key）：
`migrate_legacy_key()` 把旧 key 无损翻译成新 tuple key（旧 key 的手牌是
「按中文名排序后的元组」，与新的长度 8 计数向量一一对应；`alive` 元组 ↔ 位掩码、
`pending (None,None)` ↔ `(-1,-1)` 也都是双射），因此迁移后旧模型可以**真正参与推理**
而不只是回落到 RuleAgent。翻译失败的 key 原样保留（字符串 key 也能正常做 dict 键）。
"""

from __future__ import annotations

import ast
import copy
import pickle
import random
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

from agents.common import regret_matching, sample_from_strategy
from game import Action, GameConfig, GameState
from game.cards import CARD_ORDER, CARD_TO_INDEX, Card
from game.state import PHASE_ORDER, PHASE_TO_INDEX

from . import codec
from ._table import merge_nested, table_size
from .logging_utils import DEFAULT_METRICS_PATH, append_metric, format_duration, log_info
from .parallel import mccfr_worker, split_batch

# 一局里同一玩家会多次决策，递归深度按参考实现放宽。
sys.setrecursionlimit(max(sys.getrecursionlimit(), 8000))

#: 当前模型文件格式版本（tuple key）
FORMAT_VERSION = 2

#: 旧模型文件（缺少 format_version 字段或值为 1）的版本号
LEGACY_FORMAT_VERSION = 1

#: 信息集编码标识，写进模型文件方便排查
INFOSET_FORMAT = "compact-tuple-v2"

#: 旧 key 里的中文阶段名 -> 新编码的阶段下标
_LEGACY_PHASE_INDEX: dict[str, int] = {phase.value: PHASE_TO_INDEX[phase] for phase in PHASE_ORDER}

#: 旧 key 里的中文卡名 -> 新编码的卡下标
_LEGACY_CARD_INDEX: dict[str, int] = {card.value: CARD_TO_INDEX[card] for card in Card}

#: 旧 key 的字段个数（spec §1.5 与参考实现一致，共 13 项）
_LEGACY_KEY_LENGTH = 13


def migrate_legacy_key(key: Any) -> Any:
    """把参考实现的旧信息集 key（`repr(tuple)` 字符串）翻译成紧凑 tuple key。

    旧格式（`reference/xiuxian_ai_demo/xiuxian/game.py::infoset_key`）::

        (player, phase_name, current_player, decision_player, actions_used, deck_size,
         hand_names, known_names, reorder_names, hand_sizes, alive_tuple,
         discard_sig, pending)

    新格式（`game.state.GameState.infoset_key`）::

        (player, phase_index, current_player, decision_player, actions_used, deck_size,
         hand_counts(8), known_index, reorder_index, hand_sizes, alive_mask,
         discard_sig, pending(-1,-1))

    这个映射是**双射**（手牌：排序名字元组 <-> 计数向量；存活元组 <-> 位掩码），
    所以迁移是无损的。任何无法解析的 key 原样返回（保持旧行为，不影响 dict 使用）。
    """
    if not isinstance(key, str):
        return key
    try:
        parts = ast.literal_eval(key)
    except (ValueError, SyntaxError, MemoryError):
        return key
    if not isinstance(parts, tuple) or len(parts) != _LEGACY_KEY_LENGTH:
        return key
    try:
        (
            player,
            phase,
            current_player,
            decision_player,
            actions_used,
            deck_size,
            hand,
            known,
            reorder_private,
            hand_sizes,
            alive,
            discard_sig,
            pending,
        ) = parts

        phase_index = (
            int(phase)
            if isinstance(phase, int)
            else _LEGACY_PHASE_INDEX[str(phase)]
        )
        hand_counts = _legacy_counts(hand)
        known_index = _legacy_card_indices(known)
        reorder_index = _legacy_card_indices(reorder_private)
        alive_mask = _legacy_alive_mask(alive)
        discard_counts = tuple(int(x) for x in discard_sig)
        pending_tuple = _legacy_pending(pending, phase_index)
        sizes = tuple(int(x) for x in hand_sizes)
    except (KeyError, TypeError, ValueError, IndexError):
        return key

    return (
        int(player),
        int(phase_index),
        int(current_player),
        int(decision_player),
        int(actions_used),
        int(deck_size),
        hand_counts,
        known_index,
        reorder_index,
        sizes,
        int(alive_mask),
        discard_counts,
        pending_tuple,
    )


#: 兼容别名（对外导出名）
LEGACY_KEY_MIGRATOR = migrate_legacy_key


def _legacy_counts(hand: Any) -> tuple[int, ...]:
    """手牌（旧：按名字排序的元组）-> 长度 8 的计数向量。"""
    counts = [0] * len(CARD_ORDER)
    if hand is None:
        return tuple(counts)
    for item in hand:
        if isinstance(item, int):
            index = int(item)
        else:
            index = _LEGACY_CARD_INDEX[str(item)]
        if not 0 <= index < len(counts):
            raise ValueError(f"非法卡下标：{index}")
        counts[index] += 1
    return tuple(counts)


def _legacy_card_indices(seq: Any) -> tuple[int, ...]:
    """卡名序列 -> 卡下标序列（保持顺序，观星序列的顺序有意义）。"""
    if not seq:
        return ()
    out: list[int] = []
    for item in seq:
        out.append(int(item) if isinstance(item, int) else _LEGACY_CARD_INDEX[str(item)])
    return tuple(out)


def _legacy_alive_mask(alive: Any) -> int:
    """存活布尔/0-1 元组 -> 位掩码（第 i 位为 1 表示 P{i} 存活）。"""
    mask = 0
    for index, ok in enumerate(alive or ()):
        if int(ok):
            mask |= 1 << index
    return mask


def _legacy_pending(pending: Any, phase_index: int) -> tuple[int, int]:
    """旧 pending（COUNTER 阶段为 (actor,target)，否则 (None,None)）-> (-1,-1) 占位。"""
    if not pending:
        return (-1, -1)
    actor, target = pending
    return (
        -1 if actor is None else int(actor),
        -1 if target is None else int(target),
    )


class MCCFRTrainer:
    """Outcome-Sampling MCCFR 训练器（教学实现 + 工程化并行 / checkpoint / 续训）。"""

    def __init__(
        self,
        config: GameConfig,
        seed: int = 0,
        exploration: float = 0.6,
        metrics_path: Optional[str] = DEFAULT_METRICS_PATH,
    ) -> None:
        self.config: GameConfig = copy.deepcopy(config)
        self.seed = int(seed)
        self.exploration = float(exploration)
        self.rng = random.Random(self.seed)

        #: 信息集 -> 动作 key -> 累积后悔值（key 为 `GameState.infoset_key()` 的 tuple）
        self.regret_sum: dict[object, dict[str, float]] = {}
        #: 信息集 -> 动作 key -> 累积策略权重（加权平均策略）
        self.strategy_sum: dict[object, dict[str, float]] = {}

        self.iterations_done: int = 0
        self.traversals_done: int = 0

        #: JSONL 指标文件路径；`None` 表示不写（Worker 进程 / 测试用）
        self.metrics_path: Optional[str] = str(metrics_path) if metrics_path else None

        #: 动作 key 字符串池。
        #: 整张表里「相同动作」共用同一个 `str` 对象，`pickle` 会走 memo 引用，
        #: 体积能再降 ~40%（实测 103.3MB -> 61.6MB，全模型只有 22 种动作 key）。
        #: 池化不改变 `dict[str, float]` 的语义（key 仍是 str，按值比较完全等价），
        #: 因此 `average_strategy()` 的返回类型与契约保持一致。
        self._action_key_pool: dict[str, str] = {}

        #: 迁移统计（旧模型加载时填充）
        self.migrated_keys: int = 0
        self.unmigrated_keys: int = 0

        #: v2 **懒加载**视图（`load(..., lazy=True)` 时填充）。非 None 时：
        #: 两张表保持为空（**不展开任何 Python dict**），查表走 `codec.PackedModel`
        #: 的二分 + 按需解码。见 `docs/INTERFACES.md` §3.5 与 `training/codec.py`。
        self._packed: Optional[codec.PackedModel] = None
        #: 懒加载时的原始 v2 容器（重新 save 时原样写回，不做二次编解码）
        self._packed_data: Optional[dict] = None

        self._elapsed_total: float = 0.0
        self._run_started_at: Optional[float] = None
        self._owns_timer: bool = False

    # ------------------------------------------------------------------ 计时

    def _begin_timer(self) -> None:
        """开始计时（可重入：外层已开计时则不重置）。"""
        if self._run_started_at is None:
            self._run_started_at = time.time()
            self._owns_timer = True
        else:
            self._owns_timer = False

    def _end_timer(self) -> None:
        """结束本层计时，把耗时累加进 `_elapsed_total`。"""
        if self._owns_timer and self._run_started_at is not None:
            self._elapsed_total += time.time() - self._run_started_at
            self._run_started_at = None
        self._owns_timer = False

    # ------------------------------------------------------------------ 基础表操作

    def _shared_key(self, key: str) -> str:
        """取该动作 key 的池化对象（保证整张表共用同一个 `str` 实例）。"""
        shared = self._action_key_pool.get(key)
        if shared is None:
            self._action_key_pool[key] = key
            return key
        return shared

    def intern_tables(self) -> int:
        """把两张表的动作 key 就地池化，返回池内动作 key 种类数。

        - 训练过程中已经在 `_ensure()` 里池化，本方法主要用于**载入旧模型后重新压实**；
        - 池化后 `pickle.dump` 的模型体积可再降 ~40%（memo 引用代替重复字符串）。
        """
        for table in (self.regret_sum, self.strategy_sum):
            for info, row in list(table.items()):
                pooled: dict[str, float] = {}
                for key, value in row.items():
                    pooled[self._shared_key(key)] = value
                table[info] = pooled
        return len(self._action_key_pool)

    def _ensure(self, info: object, legal: Sequence[Action]) -> None:
        """确保该信息集与合法动作在两张表里都有条目（初值 0.0）。"""
        regrets = self.regret_sum.setdefault(info, {})
        strategies = self.strategy_sum.setdefault(info, {})
        for action in legal:
            key = self._shared_key(action.key())
            regrets.setdefault(key, 0.0)
            strategies.setdefault(key, 0.0)

    def _strategy(self, info: object, legal: Sequence[Action]) -> dict[str, float]:
        """当前 regret matching 策略。"""
        self._ensure(info, legal)
        return regret_matching(self.regret_sum[info], legal)

    # ------------------------------------------------------------------ 单条 episode

    def episode(
        self,
        state: GameState,
        update_player: int,
        my_reach: float = 1.0,
        opp_reach: float = 1.0,
        sample_reach: float = 1.0,
    ) -> float:
        """采样一条终局轨迹，只更新 `update_player` 沿途访问到的信息集。

        返回值是 `update_player` 视角的采样回报估计。
        """
        if state.is_terminal():
            return float(state.utilities()[update_player])

        cur_player = state.decision_player()
        legal = state.legal_actions()
        info = state.infoset_key(cur_player)
        policy = self._strategy(info, legal)

        # update-player 用 epsilon exploration，保证所有合法动作都有采样概率。
        if cur_player == update_player:
            uniform = 1.0 / len(legal)
            sample_policy = {
                action.key(): self.exploration * uniform
                + (1.0 - self.exploration) * policy[action.key()]
                for action in legal
            }
        else:
            sample_policy = dict(policy)

        sampled_action = sample_from_strategy(self.rng, legal, sample_policy)
        sampled_key = sampled_action.key()
        sampled_prob = max(1e-15, sample_policy[sampled_key])

        if cur_player == update_player:
            new_my_reach = my_reach * policy[sampled_key]
            new_opp_reach = opp_reach
        else:
            new_my_reach = my_reach
            new_opp_reach = opp_reach * policy[sampled_key]

        new_sample_reach = sample_reach * sampled_prob

        child = state.clone()
        child.step(sampled_action)
        child_value = self.episode(
            child, update_player, new_my_reach, new_opp_reach, new_sample_reach
        )

        # 零 baseline 的 baseline-corrected 子节点估值：只有真正采样到的动作非零，
        # 并除以采样概率做 importance correction。
        child_values: dict[str, float] = {}
        for action in legal:
            if action.key() == sampled_key:
                child_values[action.key()] = child_value / sampled_prob
            else:
                child_values[action.key()] = 0.0

        value_estimate = sum(
            policy[action.key()] * child_values[action.key()] for action in legal
        )

        if cur_player == update_player:
            denom = max(1e-15, sample_reach)
            cf_value = value_estimate * opp_reach / denom

            # sampled counterfactual regret
            regrets = self.regret_sum[info]
            for action in legal:
                key = action.key()
                cf_action_value = child_values[key] * opp_reach / denom
                regrets[key] += cf_action_value - cf_value

            # 平均策略按自身 reach / sampling reach 加权累加。
            strategies = self.strategy_sum[info]
            for action in legal:
                key = action.key()
                strategies[key] += my_reach * policy[key] / denom

        return value_estimate

    # 参考实现里的私有命名，保留别名方便对照阅读。
    _episode = episode

    # ------------------------------------------------------------------ 顺序训练

    def run_sequential(
        self,
        iterations: int,
        verbose: bool = True,
        log_every: int = 1000,
        checkpoint_every: int = 0,
        checkpoint_prefix: Optional[str] = None,
        emit_metrics: bool = True,
    ) -> None:
        """顺序跑 `iterations` 个 outer iteration（`workers=1` 的严格基线）。"""
        if iterations <= 0:
            return
        self._begin_timer()
        try:
            self._run_sequential_inner(
                iterations,
                verbose=verbose,
                log_every=log_every,
                checkpoint_every=checkpoint_every,
                checkpoint_prefix=checkpoint_prefix,
                emit_metrics=emit_metrics,
            )
        finally:
            self._end_timer()

    def _run_sequential_inner(
        self,
        iterations: int,
        verbose: bool = True,
        log_every: int = 1000,
        checkpoint_every: int = 0,
        checkpoint_prefix: Optional[str] = None,
        emit_metrics: bool = True,
    ) -> None:
        start = time.time()
        for local_it in range(1, iterations + 1):
            # 一次 outer iteration = 每名玩家各做一次 update-player episode。
            for update_player in range(self.config.num_players):
                state = GameState(self.config, self.rng.randrange(1 << 30))
                self.episode(
                    state,
                    update_player,
                    my_reach=1.0,
                    opp_reach=1.0,
                    sample_reach=1.0,
                )
                self.traversals_done += 1
            self.iterations_done += 1

            should_log = (
                local_it == 1 or local_it % max(1, log_every) == 0 or local_it == iterations
            )
            checkpoint = None
            if (
                checkpoint_every > 0
                and checkpoint_prefix
                and self.iterations_done % checkpoint_every == 0
            ):
                checkpoint = f"{checkpoint_prefix}_{self.iterations_done}.pkl"
                self.save(checkpoint)

            if should_log and verbose:
                self._log_progress(local_it, iterations, time.time() - start, checkpoint)
            if should_log and emit_metrics:
                self._emit_metrics(time.time() - start, checkpoint)

    #: 参考实现命名
    _run_sequential = run_sequential

    def _log_progress(
        self, local_it: int, iterations: int, batch_elapsed: float, checkpoint: Optional[str]
    ) -> None:
        elapsed = max(1e-9, batch_elapsed)
        rate = local_it / elapsed
        log_info(
            f"总迭代 {self.iterations_done:,} | 本批 {local_it:,}/{iterations:,} | "
            f"信息集 {len(self.regret_sum):,} | 策略条目 {self.policy_size:,} | "
            f"{rate:,.1f} iter/s"
        )
        if checkpoint:
            log_info(f"已保存 checkpoint：{checkpoint}")

    def _emit_metrics(self, batch_elapsed: float, checkpoint: Optional[str]) -> None:
        elapsed = self.elapsed_seconds
        self._append_metric_line(
            {
                "iteration": self.iterations_done,
                "elapsed": round(elapsed, 3),
                "elapsed_batch": round(batch_elapsed, 3),
                "infosets": len(self.regret_sum),
                "iterations_per_second": round(
                    self.iterations_done / max(1e-9, elapsed), 3
                ),
                "traversals": self.traversals_done,
                "policy_size": self.policy_size,
                "checkpoint": checkpoint,
                "workers": 1,
                "players": self.config.num_players,
            }
        )

    def _append_metric_line(self, record: Mapping[str, Any]) -> None:
        if not self.metrics_path:
            return
        append_metric(record, self.metrics_path)

    def _merge_delta(self, table: dict, delta: Mapping) -> None:
        """把 Worker 返回的增量合并回主表（动作 key 走池化，避免模型体积膨胀）。"""
        for info, values in delta.items():
            row = table.setdefault(info, {})
            for action, value in values.items():
                key = self._shared_key(action)
                row[key] = row.get(key, 0.0) + value

    # ------------------------------------------------------------------ 并行训练

    def train_parallel(
        self,
        iterations: int,
        workers: int,
        sync_batch: int = 1000,
        checkpoint_every: int = 0,
        checkpoint_prefix: Optional[str] = None,
        log_every: int = 1000,
        progress: bool = True,
    ) -> None:
        """批量同步**近似**并行 MCCFR（spec §37-§38）。

        每轮：主进程把 `regret_sum` 快照分给 `workers` 个进程，各自训练
        `sync_batch / workers` 个 outer iteration，回传 delta 后合并。
        这不是严格等价于 `workers=1` 的算法（快照是滞后的），做算法对照请用 `workers=1`。
        """
        from concurrent.futures import ProcessPoolExecutor

        if sync_batch <= 0:
            raise ValueError("sync_batch 必须为正整数。")
        remaining = int(iterations)
        start = time.time()
        if progress and workers > 1:
            log_info(
                f"注意：workers={workers}>1 走的是「批量同步近似并行」，"
                "快照滞后会让结果与 workers=1 有偏差；严格算法对照请用 workers=1。"
            )

        self._begin_timer()
        try:
            with ProcessPoolExecutor(max_workers=workers) as executor:
                while remaining > 0:
                    batch = min(sync_batch, remaining)
                    shares = split_batch(batch, workers)
                    snapshot = self.regret_sum  # 本轮的只读快照

                    futures = [
                        executor.submit(
                            mccfr_worker,
                            self.config,
                            self.seed
                            + self.iterations_done * 997
                            + index * 7919,
                            self.exploration,
                            amount,
                            snapshot,
                        )
                        for index, amount in enumerate(shares)
                    ]

                    for future in futures:
                        regret_delta, strategy_delta, traversals = future.result()
                        self._merge_delta(self.regret_sum, regret_delta)
                        self._merge_delta(self.strategy_sum, strategy_delta)
                        self.traversals_done += traversals

                    self.iterations_done += batch
                    remaining -= batch

                    batch_elapsed = time.time() - start
                    checkpoint = None
                    if (
                        checkpoint_every > 0
                        and checkpoint_prefix
                        and self.iterations_done % checkpoint_every == 0
                    ):
                        checkpoint = f"{checkpoint_prefix}_{self.iterations_done}.pkl"
                        self.save(checkpoint)
                        if progress:
                            log_info(f"已保存 checkpoint：{checkpoint}")

                    is_log_step = (
                        self.iterations_done % max(1, log_every) == 0 or remaining <= 0
                    )
                    if progress and is_log_step:
                        elapsed = max(1e-9, self.elapsed_seconds)
                        log_info(
                            f"并行完成 {self.iterations_done:,} iter | workers={workers} | "
                            f"信息集={len(self.regret_sum):,} | "
                            f"平均={self.iterations_done / elapsed:,.1f} iter/s"
                        )
                    if is_log_step or checkpoint:
                        self._append_metric_line(
                            {
                                "iteration": self.iterations_done,
                                "elapsed": round(self.elapsed_seconds, 3),
                                "elapsed_batch": round(batch_elapsed, 3),
                                "infosets": len(self.regret_sum),
                                "iterations_per_second": round(
                                    self.iterations_done / max(1e-9, self.elapsed_seconds), 3
                                ),
                                "traversals": self.traversals_done,
                                "policy_size": self.policy_size,
                                "checkpoint": checkpoint,
                                "workers": int(workers),
                                "players": self.config.num_players,
                            }
                        )
        finally:
            self._end_timer()

    def _train_parallel(self, *args, **kwargs) -> None:  # 参考实现命名
        self.train_parallel(*args, **kwargs)

    # ------------------------------------------------------------------ 统一入口

    def train(
        self,
        iterations: int,
        workers: int = 1,
        sync_batch: int = 1000,
        checkpoint_every: int = 0,
        checkpoint_prefix: Optional[str] = None,
        log_every: int = 1000,
        progress: bool = True,
    ) -> None:
        """训练入口（契约签名，见 §3.1）。

        - `workers <= 1`：严格顺序基线；`checkpoint_every > 0` 时按 checkpoint 分块，
          每块结束落盘一次；
        - `workers > 1`：`ProcessPoolExecutor` 批量同步近似并行。
        """
        iterations = int(iterations)
        if iterations <= 0:
            return
        self._begin_timer()
        try:
            if workers <= 1:
                if checkpoint_every <= 0:
                    self.run_sequential(iterations, verbose=progress, log_every=log_every)
                    return
                remaining = iterations
                while remaining > 0:
                    next_cp = checkpoint_every - (self.iterations_done % checkpoint_every)
                    chunk = min(remaining, next_cp)
                    self.run_sequential(
                        chunk,
                        verbose=progress,
                        log_every=log_every,
                        checkpoint_every=checkpoint_every,
                        checkpoint_prefix=checkpoint_prefix,
                    )
                    remaining -= chunk
                    if (
                        checkpoint_prefix
                        and self.iterations_done % checkpoint_every == 0
                    ):
                        path = f"{checkpoint_prefix}_{self.iterations_done}.pkl"
                        self.save(path)
                        if progress:
                            log_info(f"已保存 checkpoint：{path}")
                return

            self.train_parallel(
                iterations,
                workers=workers,
                sync_batch=sync_batch,
                checkpoint_every=checkpoint_every,
                checkpoint_prefix=checkpoint_prefix,
                log_every=log_every,
                progress=progress,
            )
        finally:
            self._end_timer()

    # ------------------------------------------------------------------ 推理 / 统计

    def _rows_for(self, info: object) -> tuple[dict[str, float], dict[str, float]]:
        """取一个信息集的两行：`(后悔行, 平均策略权重行)`；不存在时返回两个空 dict。

        懒加载（v2 `strategy_only` 部署产物）时按需解码**只解这一行**，不展开整表。
        """
        if self._packed is not None:
            found = self._packed.lookup(info)
            if found is None:
                return {}, {}
            return found
        return self.regret_sum.get(info, {}), self.strategy_sum.get(info, {})

    def average_strategy(self, state: GameState, player: int) -> dict[str, float]:
        """按当前局面给出 `player` 的平均策略（`action.key() -> 概率`）。

        `strategy_sum` 为空（未见过的信息集）时退回 regret matching。
        """
        legal = state.legal_actions()
        info = state.infoset_key(player)
        regrets, sums = self._rows_for(info)
        values = {action.key(): max(0.0, sums.get(action.key(), 0.0)) for action in legal}
        total = sum(values.values())
        if total <= 1e-15:
            return regret_matching(regrets, legal)
        return {key: value / total for key, value in values.items()}

    def knows_infoset(self, state: GameState, player: int) -> bool:
        """该信息集是否出现在训练表里（MCCFRAgent 用它决定是否回落 RuleAgent）。"""
        return self.knows_key(state.infoset_key(player))

    def knows_key(self, info: object) -> bool:
        """信息集 key 是否在表里（懒加载模型走「二分 + 按需解码」）。"""
        if self._packed is not None:
            return self._packed.lookup(info) is not None
        return info in self.regret_sum or info in self.strategy_sum

    @property
    def lazy(self) -> bool:
        """是否是懒加载（v2 部署产物）：表未展开成 Python dict。"""
        return self._packed is not None

    @property
    def strategy_infoset_count(self) -> int:
        """平均策略表规模 = **推理时真正能查表的信息集数**。

        这是 `MCCFRAgent` 的实际覆盖面：命中率统计的分母就是它。
        """
        if self._packed is not None:
            return self._packed.n_infosets
        return len(self.strategy_sum)

    @property
    def regret_infoset_count(self) -> int:
        """后悔表规模。

        与 `strategy_infoset_count` **可能不等**：outcome sampling 只在某玩家当
        update-player 时写他的 regret，而策略表覆盖所有被访问到的信息集。
        参考实现的旧模型就是这个形态（regret 169,634 / strategy 433,870）：
        差值不影响推理，只是训练期写表策略不同，**不是缺陷**。
        """
        if self._packed is not None:
            return 0 if self._packed.strategy_only else self._packed.n_infosets
        return len(self.regret_sum)

    @property
    def infoset_count(self) -> int:
        """信息集数（**推理覆盖口径**，等价于 `strategy_infoset_count`）。

        刻意与 regret 表口径分开：推理/部署只关心「策略表覆盖了多少信息集」。
        两个口径可能不等（旧格式模型），要 regret 表规模请用 `regret_infoset_count`。
        """
        return self.strategy_infoset_count

    @property
    def policy_size(self) -> int:
        """策略条目数 = `sum(len(row) for row in strategy_sum.values())`（spec §56）。"""
        if self._packed is not None:
            return self._packed.n_strategy_entries or table_size(self.strategy_sum)
        return table_size(self.strategy_sum)

    @property
    def elapsed_seconds(self) -> float:
        """累计训练耗时（秒），含正在进行的一轮。"""
        extra = 0.0 if self._run_started_at is None else time.time() - self._run_started_at
        return self._elapsed_total + extra

    def stats(self) -> dict:
        """训练统计（§3.1）：iterations / traversals / infosets / iter_per_sec / elapsed。"""
        elapsed = max(1e-9, self.elapsed_seconds)
        return {
            "iterations": self.iterations_done,
            "traversals": self.traversals_done,
            "infosets": self.strategy_infoset_count,
            "strategy_infosets": self.strategy_infoset_count,
            "regret_infosets": self.regret_infoset_count,
            "policy_size": self.policy_size,
            "iter_per_sec": self.iterations_done / elapsed,
            "traversals_per_sec": self.traversals_done / elapsed,
            "elapsed": elapsed,
            "elapsed_hms": format_duration(elapsed),
            "players": self.config.num_players,
            "exploration": self.exploration,
            "seed": self.seed,
        }

    def report(self) -> str:
        """中文训练报表（spec §56 的推荐格式）。"""
        info = self.stats()
        return "\n".join(
            [
                "[MCCFR]",
                f"玩家数: {info['players']}",
                f"Seed: {info['seed']}  探索率: {info['exploration']}",
                f"Iterations: {info['iterations']:,}",
                f"Traversals: {info['traversals']:,}",
                f"InfoSets: {info['infosets']:,}",
                f"策略条目: {info['policy_size']:,}",
                f"Iterations/s: {info['iter_per_sec']:,.1f}",
                f"Elapsed: {info['elapsed_hms']}",
            ]
        )

    # ------------------------------------------------------------------ 存档 / 读档

    def to_payload(self) -> dict:
        """构造模型 payload（字段见 §3.1）。"""
        return {
            "format_version": FORMAT_VERSION,
            "infoset_format": INFOSET_FORMAT,
            "config": asdict(self.config),
            "seed": self.seed,
            "exploration": self.exploration,
            "iterations_done": self.iterations_done,
            "traversals_done": self.traversals_done,
            "regret_sum": self.regret_sum,
            "strategy_sum": self.strategy_sum,
            "stats": self.stats(),
        }

    def _strategy_table_for_deployment(self) -> dict:
        """部署产物（`strategy_only`）用的策略表：把「平均策略权重全 0」的信息集换成退路策略。

        为什么必须换：outcome sampling 下有些信息集只被对手采样到，权重永远是 0；
        `average_strategy()` 在全量模型上对这些信息集会**回退到 regret matching**。
        部署产物没有后悔表可回退，不换就会退化成均匀随机 —— 那与训练模型的行为不一致，
        而且恰好是最需要「像训练过一样」的局面。
        """
        out: dict = {}
        for info, row in self.strategy_sum.items():
            if sum(value for value in row.values() if value > 0.0) > 1e-15:
                out[info] = row
                continue
            regrets = self.regret_sum.get(info) or {}
            positive = {key: value for key, value in regrets.items() if value > 0.0}
            total = sum(positive.values())
            # `regret_matching` 的语义：正后悔值归一化；全非正则在行内均匀。
            # 信息集的行就是它的合法动作集合，所以这里可以脱开 state 直接算。
            out[info] = (
                {key: value / total for key, value in positive.items()}
                if total > 1e-15
                else {key: 1.0 / len(row) for key in row} if row else row
            )
        return out

    def to_container(self, strategy_only: bool = False) -> dict:
        """构造 v2 扁平容器（§3.5：只含 bytes / int / float / str / list / dict）。

        - 懒加载模型：直接复用载入时的容器（必要时把 regret 块丢掉派生出「仅策略」）；
        - 普通模型：把两张表压成 `key_blob` / `regret_blob` / `strategy_blob`。
        """
        if self._packed is not None:
            data = dict(self._packed_data or {})
            if strategy_only and not data.get("strategy_only"):
                return codec.as_strategy_only(data)
            return data
        strategy_table = self._strategy_table_for_deployment() if strategy_only else self.strategy_sum
        return codec.build_container(
            self.regret_sum,
            strategy_table,
            config=asdict(self.config),
            seed=self.seed,
            exploration=self.exploration,
            iterations_done=self.iterations_done,
            traversals_done=self.traversals_done,
            strategy_only=bool(strategy_only),
        )

    def save(self, path: str, strategy_only: bool = False, format: str = "v2") -> None:
        """保存模型（`pickle.HIGHEST_PROTOCOL`）。

        - `format="v2"`（默认，§3.5）：紧凑二进制扁平容器，全量 ≤30 MB / 仅策略 ≤20 MB；
        - `format="v1"`：旧的 plain dict（紧凑 tuple key + 池化动作 key），
          给需要旧格式的第三方工具；`strategy_only` 对 v1 无意义（忽略）。
        - `strategy_only=True`：只写平均策略（部署产物，`MCCFRAgent` 可直接推理）。
          注意：平均策略权重全 0 的信息集会写入**按后悔值归一化的退路策略**
          （见 `_strategy_table_for_deployment`），保证部署模型与全量模型的
          `average_strategy()` 行为一致（否则那些局面会退化成均匀随机）。

        签名向后兼容：`save(path)` 仍可用，只是现在默认写 v2。
        """
        fmt = str(format or "v2").strip().lower()
        if fmt in ("v1", "legacy", "dict", "compact-tuple"):
            if self._packed is not None:
                raise ValueError("懒加载的 v2 模型无法写成 v1（表未展开）；请先用 lazy=False 载入。")
            self.intern_tables()
            payload: dict = self.to_payload()
        elif fmt in ("v2", "packed", "packed-v2", "binary", "bin"):
            payload = self.to_container(strategy_only=bool(strategy_only))
        else:
            raise ValueError(f"未知的模型格式：{format}（可选 v2 / v1）")

        target = Path(path)
        if str(target.parent) not in ("", "."):
            target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as handle:
            pickle.dump(payload, handle, protocol=pickle.HIGHEST_PROTOCOL)

    def model_summary(self, size_bytes: int = 0) -> dict:
        """模型自描述（`main.py models` / 汇报用）。"""
        return {
            "format_version": FORMAT_VERSION,
            "encoding": codec.ENCODING,
            "lazy": self.lazy,
            "strategy_only": bool(self._packed.strategy_only) if self._packed is not None else False,
            "players": self.config.num_players,
            "iterations_done": self.iterations_done,
            "traversals_done": self.traversals_done,
            "n_infosets": self.infoset_count,
            "n_entries": self.policy_size,
            "size_bytes": int(size_bytes),
        }

    @classmethod
    def load(
        cls,
        path: str,
        migrate_legacy: bool = True,
        lazy: Optional[bool] = False,
    ) -> "MCCFRTrainer":
        """读模型；支持三代输入，行为一致：

        1. 旧的 plain dict（`repr(str)` 字符串 key，参考实现 124 MB 模型）；
        2. 紧凑 tuple key 的 plain dict（v1）；
        3. v2 紧凑二进制扁平容器（`encoding="packed-v2"`）。

        读到 1/2 时按 v1 处理（`migrate_legacy=True` 会把字符串 key 无损翻译成紧凑
        tuple），读到的模型都能继续训练（续训）。

        `lazy`：是否用**懒加载**（只留几块 bytes + 稀疏锚点，查表按需解码）。
        - `False`（默认）：展开成 `dict[tuple, dict[str, float]]`，训练 / 续训用；
        - `True`：不展开，适合部署推理（Render 512 MB 内存）；
        - `None`：自动——`strategy_only` 模型懒加载，全量模型展开。
        """
        with open(path, "rb") as handle:
            data = pickle.load(handle)
        if not isinstance(data, dict):  # pragma: no cover - 防御
            raise ValueError(f"模型文件格式无法识别：{path}")

        if codec.is_v2_container(data):
            return cls._from_container(data, lazy=lazy)

        config_dict = dict(data.get("config") or {})
        config_dict.pop("num_player", None)  # 容忍历史字段
        trainer = cls(
            GameConfig(**config_dict),
            seed=int(data.get("seed", 0) or 0),
            exploration=float(data.get("exploration", 0.6) or 0.6),
            metrics_path=None,
        )
        trainer.iterations_done = int(data.get("iterations_done", 0) or 0)
        trainer.traversals_done = int(data.get("traversals_done", 0) or 0)

        version = int(data.get("format_version", LEGACY_FORMAT_VERSION) or LEGACY_FORMAT_VERSION)
        regret_sum = data.get("regret_sum") or {}
        strategy_sum = data.get("strategy_sum") or {}

        if version < FORMAT_VERSION and migrate_legacy:
            trainer.regret_sum, migrated_r, failed_r = _migrate_table(regret_sum)
            trainer.strategy_sum, migrated_s, failed_s = _migrate_table(strategy_sum)
            trainer.migrated_keys = migrated_r + migrated_s
            trainer.unmigrated_keys = failed_r + failed_s
        else:
            trainer.regret_sum = regret_sum
            trainer.strategy_sum = strategy_sum
        # 载入后重新压实动作 key（旧模型里的动作 key 字符串是逐行新建的对象，
        # 池化后重新 save 体积可再降约 40%）。
        trainer.intern_tables()
        return trainer

    @classmethod
    def _from_container(cls, data: Mapping[str, Any], lazy: Optional[bool] = False) -> "MCCFRTrainer":
        """从 v2 容器构造训练器（`lazy=True` 时不展开表）。"""
        config_dict = dict(data.get("config") or {})
        config_dict.pop("num_player", None)
        trainer = cls(
            GameConfig(**config_dict),
            seed=int(data.get("seed", 0) or 0),
            exploration=float(data.get("exploration", 0.6) or 0.6),
            metrics_path=None,
        )
        trainer.iterations_done = int(data.get("iterations_done", 0) or 0)
        trainer.traversals_done = int(data.get("traversals_done", 0) or 0)

        packed = codec.PackedModel(data)
        codec.register_action_table(packed.action_table)
        use_lazy = packed.strategy_only if lazy is None else bool(lazy)
        if use_lazy:
            trainer._packed = packed
            trainer._packed_data = data
            log_info(
                f"已懒加载 v2 模型：信息集 {packed.n_infosets:,}（未展开成 Python dict）"
                f"{'，仅含平均策略' if packed.strategy_only else ''}"
            )
            return trainer

        regret_sum, strategy_sum = codec.unpack_tables(data)
        trainer.regret_sum = regret_sum
        trainer.strategy_sum = strategy_sum
        # 动作字符串池化（与 v1 载入后一致）：后续 save / 续训都复用同一批 str 对象。
        for name in packed.action_table:
            trainer._action_key_pool[name] = name
        log_info(
            f"已载入 v2 模型：信息集 {len(regret_sum):,} / 策略表 {len(strategy_sum):,}"
            f"{'（仅含平均策略）' if packed.strategy_only else ''}"
        )
        return trainer


def peek_model_players(path: str) -> Optional[int]:
    """只读模型元信息，返回**训练时的玩家数**；读不到返回 `None`。

    走 `codec.peek_model_header`（v2 容器只读头部，不展开几十 MB 的 blob），
    用于上层做「模型人数 ↔ 对局人数」一致性校验，避免用户把 2 人模型用进 3 人局
    （信息集键空间不重叠 → 命中率恒为 0，MCCFR 实际由 RuleAgent 代打）却毫无提示。
    """
    header = codec.peek_model_header(path)
    config = header.get("config")
    if not isinstance(config, dict):  # pragma: no cover - 防御
        return None
    players = config.get("num_players") or config.get("players")
    try:
        value = int(players)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _migrate_table(table: Mapping) -> tuple[dict, int, int]:
    """迁移一张表的所有 key，返回 `(新表, 成功数, 失败数)`。

    迁移映射是双射的（见 `migrate_legacy_key`），正常情况下不会发生碰撞；
    万一碰撞（不同旧 key 映到同一新 key）则把数值**相加**合并，不丢数据。
    """
    out: dict = {}
    migrated = 0
    failed = 0
    for key, row in table.items():
        new_key = migrate_legacy_key(key)
        if isinstance(key, str):
            if isinstance(new_key, str):
                failed += 1
            else:
                migrated += 1
        merge_nested(out, {new_key: row})
    return out, migrated, failed


__all__ = [
    "MCCFRTrainer",
    "FORMAT_VERSION",
    "LEGACY_FORMAT_VERSION",
    "INFOSET_FORMAT",
    "migrate_legacy_key",
    "LEGACY_KEY_MIGRATOR",
    "peek_model_players",
]

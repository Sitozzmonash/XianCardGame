from __future__ import annotations
from dataclasses import asdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import copy
import pickle
import random
import sys
import time
from typing import Optional
from .game import GameConfig, GameState, Action
from .agents import BaseAgent, RuleAgent

sys.setrecursionlimit(5000)

def _sample_from_strategy(rng: random.Random, actions: list[Action], probs: dict[str, float]) -> Action:
    x = rng.random()
    acc = 0.0
    for a in actions:
        acc += probs[a.key()]
        if x <= acc:
            return a
    return actions[-1]

def _regret_matching(regrets: dict[str, float], legal: list[Action]) -> dict[str, float]:
    positive = {a.key(): max(0.0, regrets.get(a.key(), 0.0)) for a in legal}
    total = sum(positive.values())
    if total <= 1e-15:
        p = 1.0 / len(legal)
        return {a.key(): p for a in legal}
    return {k: v / total for k, v in positive.items()}

class MCCFRTrainer:
    """Outcome-Sampling MCCFR 教学实现。

    参考经典 Outcome Sampling MCCFR 思路：
    - 每次 update-player 只采样一条终局轨迹，不展开整棵树；
    - update-player 使用 epsilon exploration，保证所有合法动作都有机会被采样；
    - 用 importance sampling 修正 sampled counterfactual value；
    - 根据 regret matching 更新策略。

    这比“External Sampling 在 traverser 节点展开所有动作”更适合本 Demo，
    因为修仙卡牌一局里同一玩家会多次决策，整树展开会非常快地爆炸。
    """

    def __init__(self, config: GameConfig, seed: int = 0, exploration: float = 0.6):
        self.config = copy.deepcopy(config)
        self.seed = seed
        self.exploration = exploration
        self.rng = random.Random(seed)
        self.regret_sum: dict[str, dict[str, float]] = {}
        self.strategy_sum: dict[str, dict[str, float]] = {}
        self.iterations_done = 0
        self.traversals_done = 0

    def _ensure(self, info: str, legal: list[Action]) -> None:
        r = self.regret_sum.setdefault(info, {})
        s = self.strategy_sum.setdefault(info, {})
        for a in legal:
            r.setdefault(a.key(), 0.0)
            s.setdefault(a.key(), 0.0)

    def _strategy(self, info: str, legal: list[Action]) -> dict[str, float]:
        self._ensure(info, legal)
        return _regret_matching(self.regret_sum[info], legal)

    def _episode(self, state: GameState, update_player: int,
                 my_reach: float, opp_reach: float, sample_reach: float) -> float:
        """采样一条终局轨迹，并更新 update_player 在沿途访问到的信息集。"""
        if state.is_terminal():
            return state.utilities()[update_player]

        cur_player = state.decision_player()
        legal = state.legal_actions()
        info = state.infoset_key(cur_player)
        policy = self._strategy(info, legal)

        # 更新玩家使用 epsilon exploration；其他玩家按当前策略采样。
        if cur_player == update_player:
            uniform = 1.0 / len(legal)
            sample_policy = {
                a.key(): self.exploration * uniform + (1.0 - self.exploration) * policy[a.key()]
                for a in legal
            }
        else:
            sample_policy = dict(policy)

        sampled_action = _sample_from_strategy(self.rng, legal, sample_policy)
        sampled_key = sampled_action.key()
        sampled_prob = max(1e-15, sample_policy[sampled_key])

        if cur_player == update_player:
            new_my_reach = my_reach * policy[sampled_key]
            new_opp_reach = opp_reach
        else:
            new_my_reach = my_reach
            new_opp_reach = opp_reach * policy[sampled_key]

        new_sample_reach = sample_reach * sampled_prob

        # Outcome Sampling 每层只向下走一个动作，因此不会出现整树爆炸。
        child = state.clone()
        child.step(sampled_action)
        child_value = self._episode(
            child, update_player, new_my_reach, new_opp_reach, new_sample_reach
        )

        # 零 baseline 的 baseline-corrected child value：
        # 只有真正采样到的动作有非零估计，并除以采样概率做 importance correction。
        child_values: dict[str, float] = {}
        for action in legal:
            if action.key() == sampled_key:
                child_values[action.key()] = child_value / sampled_prob
            else:
                child_values[action.key()] = 0.0

        value_estimate = sum(policy[a.key()] * child_values[a.key()] for a in legal)

        if cur_player == update_player:
            denom = max(1e-15, sample_reach)
            cf_value = value_estimate * opp_reach / denom

            # sampled counterfactual regret
            for action in legal:
                key = action.key()
                cf_action_value = child_values[key] * opp_reach / denom
                self.regret_sum[info][key] += cf_action_value - cf_value

            # average strategy：按自己的 reach / sampling reach 做随机加权。
            for action in legal:
                key = action.key()
                self.strategy_sum[info][key] += my_reach * policy[key] / denom

        return value_estimate

    def _run_sequential(self, iterations: int, verbose: bool = True, log_every: int = 1000) -> None:
        start = time.time()
        for local_it in range(1, iterations + 1):
            # 一次 outer iteration = 每名玩家各做一次 update-player episode。
            for update_player in range(self.config.num_players):
                state = GameState(self.config, self.rng.randrange(1 << 30))
                self._episode(state, update_player, my_reach=1.0, opp_reach=1.0, sample_reach=1.0)
                self.traversals_done += 1
            self.iterations_done += 1

            if verbose and (local_it == 1 or local_it % log_every == 0 or local_it == iterations):
                elapsed = max(1e-9, time.time() - start)
                rate = local_it / elapsed
                print(f"[MCCFR] 总迭代 {self.iterations_done:,} | 本批 {local_it:,}/{iterations:,} | "
                      f"信息集 {len(self.regret_sum):,} | {rate:,.1f} iter/s")

    def train(self, iterations: int, workers: int = 1, sync_batch: int = 1000,
              checkpoint_every: int = 0, checkpoint_prefix: Optional[str] = None,
              log_every: int = 1000) -> None:
        if workers <= 1:
            if checkpoint_every <= 0:
                self._run_sequential(iterations, verbose=True, log_every=log_every)
                return

            remaining = iterations
            while remaining > 0:
                next_cp = checkpoint_every - (self.iterations_done % checkpoint_every)
                chunk = min(remaining, next_cp)
                self._run_sequential(chunk, verbose=True, log_every=log_every)
                remaining -= chunk
                if checkpoint_prefix and self.iterations_done % checkpoint_every == 0:
                    path = f"{checkpoint_prefix}_{self.iterations_done}.pkl"
                    self.save(path)
                    print(f"[MCCFR] 已保存 checkpoint：{path}")
            return

        self._train_parallel(iterations, workers, sync_batch, checkpoint_every, checkpoint_prefix)

    def _train_parallel(self, iterations: int, workers: int, sync_batch: int,
                        checkpoint_every: int, checkpoint_prefix: Optional[str]) -> None:
        """批量同步近似并行 MCCFR。

        每个 Worker 使用同一 regret 快照训练一小批 episode，
        然后主进程合并 regret_delta / strategy_delta。
        这适合工程实验，但严格算法基线建议 workers=1。
        """
        remaining = iterations
        started = time.time()
        with ProcessPoolExecutor(max_workers=workers) as ex:
            while remaining > 0:
                batch = min(sync_batch, remaining)
                shares = [batch // workers] * workers
                for i in range(batch % workers):
                    shares[i] += 1
                shares = [x for x in shares if x > 0]

                snapshot = self.regret_sum
                futures = []
                for i, amount in enumerate(shares):
                    futures.append(ex.submit(
                        _parallel_worker,
                        self.config,
                        self.seed + self.iterations_done * 997 + i * 7919,
                        self.exploration,
                        amount,
                        snapshot,
                    ))

                for fut in futures:
                    regret_delta, strategy_delta, traversals = fut.result()
                    _merge_nested(self.regret_sum, regret_delta)
                    _merge_nested(self.strategy_sum, strategy_delta)
                    self.traversals_done += traversals

                self.iterations_done += batch
                remaining -= batch
                elapsed = max(1e-9, time.time() - started)
                print(f"[并行MCCFR] 完成 {self.iterations_done:,} iter | workers={workers} | "
                      f"信息集={len(self.regret_sum):,} | 平均={self.iterations_done/elapsed:,.1f} iter/s")

                if checkpoint_every > 0 and checkpoint_prefix and self.iterations_done % checkpoint_every == 0:
                    path = f"{checkpoint_prefix}_{self.iterations_done}.pkl"
                    self.save(path)
                    print(f"[并行MCCFR] 已保存 checkpoint：{path}")

    def average_strategy(self, state: GameState, player: int) -> dict[str, float]:
        legal = state.legal_actions()
        info = state.infoset_key(player)
        sums = self.strategy_sum.get(info, {})
        vals = {a.key(): max(0.0, sums.get(a.key(), 0.0)) for a in legal}
        total = sum(vals.values())
        if total <= 1e-15:
            regrets = self.regret_sum.get(info, {})
            return _regret_matching(regrets, legal)
        return {k: v / total for k, v in vals.items()}

    def save(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        data = {
            "config": asdict(self.config),
            "seed": self.seed,
            "exploration": self.exploration,
            "iterations_done": self.iterations_done,
            "traversals_done": self.traversals_done,
            "regret_sum": self.regret_sum,
            "strategy_sum": self.strategy_sum,
        }
        with open(path, "wb") as f:
            pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)

    @classmethod
    def load(cls, path: str) -> "MCCFRTrainer":
        with open(path, "rb") as f:
            data = pickle.load(f)
        trainer = cls(
            GameConfig(**data["config"]),
            data.get("seed", 0),
            data.get("exploration", 0.6),
        )
        trainer.iterations_done = data.get("iterations_done", 0)
        trainer.traversals_done = data.get("traversals_done", 0)
        trainer.regret_sum = data.get("regret_sum", {})
        trainer.strategy_sum = data.get("strategy_sum", {})
        return trainer

class MCCFRAgent(BaseAgent):
    name = "MCCFR"

    def __init__(self, trainer: MCCFRTrainer, seed: int = 0):
        self.trainer = trainer
        self.rng = random.Random(seed)
        self.fallback = RuleAgent(seed + 101)

    @classmethod
    def load(cls, path: str, seed: int = 0) -> "MCCFRAgent":
        return cls(MCCFRTrainer.load(path), seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        info = state.infoset_key(player)
        if info not in self.trainer.strategy_sum and info not in self.trainer.regret_sum:
            return self.fallback.act(state, player)
        probs = self.trainer.average_strategy(state, player)
        return _sample_from_strategy(self.rng, legal, probs)

def _merge_nested(dst: dict[str, dict[str, float]], delta: dict[str, dict[str, float]]) -> None:
    for info, values in delta.items():
        d = dst.setdefault(info, {})
        for action, value in values.items():
            d[action] = d.get(action, 0.0) + value

def _diff_nested(new: dict[str, dict[str, float]], old: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for info, values in new.items():
        base = old.get(info, {})
        row = {}
        for action, value in values.items():
            diff = value - base.get(action, 0.0)
            if abs(diff) > 1e-15:
                row[action] = diff
        if row:
            out[info] = row
    return out

def _parallel_worker(config: GameConfig, seed: int, exploration: float, iterations: int,
                     regret_snapshot: dict[str, dict[str, float]]):
    # 进程内单独持有快照，避免共享 dict 的锁竞争。
    base = regret_snapshot
    trainer = MCCFRTrainer(config, seed, exploration)
    trainer.regret_sum = copy.deepcopy(base)
    trainer.strategy_sum = {}
    trainer._run_sequential(iterations, verbose=False)
    regret_delta = _diff_nested(trainer.regret_sum, base)
    return regret_delta, trainer.strategy_sum, trainer.traversals_done

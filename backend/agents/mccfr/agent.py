"""MCCFR 推理解释器（spec §26-§33）。

推理流程：当前 Information Set → 查 `trainer.strategy_sum` → 归一化 → 按概率采样。
训练数据（`MCCFRTrainer`）由 C3 的 `training/trainer.py` 提供，本模块**不在导入期**
依赖 `training`，只在 `load()` 里延迟导入，避免和 C3 互相依赖。

隐藏信息纪律（spec §59）：只读 `legal_actions()` 与 `infoset_key(player)`（后者只含
自己可见信息）+ 训练好的策略表。
"""

from __future__ import annotations

import inspect
import random
from typing import TYPE_CHECKING, Optional

from game.actions import Action
from game.state import GameState

from ..base import BaseAgent
from ..common import sample_from_strategy
from ..rule_agent import RuleAgent

if TYPE_CHECKING:  # 只用于类型注解，运行期不导入 training
    from training.trainer import MCCFRTrainer


def _load_trainer(path: str):
    """延迟导入 C3 的 MCCFRTrainer，避免 agents <-> training 循环依赖。

    用 `lazy=None`（自动）载入：v2「仅策略」部署产物走**懒加载**（只留几块 bytes +
    稀疏锚点，查表按需解码，见 §3.5），全量模型/旧模型正常展开成 dict。
    先探测 `load()` 是否接受 `lazy`：测试替身 / 更早版本训练器的 `load(path)`
    不带这个参数，不能因为多了个「优化开关」就把它们打挂。
    """
    try:
        from training.trainer import MCCFRTrainer  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - 取决于 C3 是否就位
        raise ImportError(
            f"MCCFRAgent.load 需要 training.trainer.MCCFRTrainer（C3 负责），导入失败：{exc}"
        ) from exc
    try:
        accepts_lazy = "lazy" in inspect.signature(MCCFRTrainer.load).parameters
    except (TypeError, ValueError):  # pragma: no cover - 无法内省的极端情形
        accepts_lazy = False
    return MCCFRTrainer.load(path, lazy=None) if accepts_lazy else MCCFRTrainer.load(path)


class MCCFRAgent(BaseAgent):
    """加载训练好的平均策略（average strategy）做推理。

    - 未见过的 Information Set → 回落到 `RuleAgent`（spec §33）；
    - 训练阶段 CPU 成本高、推理阶段成本极低（spec §32）。

    **命中率统计**：训练覆盖度必须可观测——如果绝大多数决策都回落 RuleAgent，
    那么「MCCFR 赢了 X%」实际上衡量的是 RuleAgent，不能当算法强度的证据。
    因此这里累计 `decisions_total / decisions_trained / decisions_fallback`，
    由 `stats()` 暴露、`reset_stats()` 复位，评测报表会把它打出来。
    """

    name = "MCCFR"

    def __init__(self, trainer: MCCFRTrainer, seed: int = 0):
        self.trainer = trainer
        self.seed = int(seed)
        self.rng = random.Random(self.seed)
        self.fallback = RuleAgent(self.seed + 101)
        #: 决策总数
        self.decisions_total: int = 0
        #: 命中已训练信息集（用 MCCFR 策略）的次数
        self.decisions_trained: int = 0
        #: 回落 RuleAgent 的次数
        self.decisions_fallback: int = 0

    @classmethod
    def load(cls, path: str, seed: int = 0) -> MCCFRAgent:
        return cls(_load_trainer(path), seed)

    @property
    def trainer_players(self) -> Optional[int]:
        """模型训练时的玩家数（读不到返回 `None`）；只读，不影响 `act()` 语义。

        上层用它做「模型人数 ↔ 对局人数」一致性校验：`infoset_key` 里的
        `hand_sizes` / `alive_mask` 位宽随人数变化，2 人模型的键在 3 人局里**永不命中**。
        """
        config = getattr(self.trainer, "config", None)
        players = getattr(config, "num_players", None)
        try:
            value = int(players)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None

    # --------------------------------------------------------------- 命中率统计

    def reset_stats(self) -> None:
        """清零命中率统计（每次评测开始前调用，保证数字是本次评测的）。"""
        self.decisions_total = 0
        self.decisions_trained = 0
        self.decisions_fallback = 0

    def stats(self) -> dict:
        """返回 `{decisions, hit, fallback, hit_rate}`（`hit_rate` 为 0~1 的浮点）。"""
        return {
            "decisions": self.decisions_total,
            "hit": self.decisions_trained,
            "fallback": self.decisions_fallback,
            "hit_rate": (
                self.decisions_trained / self.decisions_total
                if self.decisions_total
                else 0.0
            ),
        }

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        info = state.infoset_key(player)
        self.decisions_total += 1
        self.decisions_trained += 1
        if not self._knows(info):
            self.decisions_trained -= 1
            self.decisions_fallback += 1
            return self.fallback.act(state, player)
        probs = self.trainer.average_strategy(state, player)
        return sample_from_strategy(self.rng, legal, probs)

    def _knows(self, info: object) -> bool:
        """该信息集是否有训练数据。

        优先用 trainer 的 `knows_key()`（v2 懒加载模型走二分 + 按需解码）；
        trainer 替身（测试用 Stub）没有该方法时回落到直接查两张表。
        """
        checker = getattr(self.trainer, "knows_key", None)
        if callable(checker):
            return bool(checker(info))
        return info in self.trainer.strategy_sum or info in self.trainer.regret_sum

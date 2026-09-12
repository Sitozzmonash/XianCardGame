"""Agent 共用的采样 / 后悔匹配工具（MCCFR 与 MCCFRAgent 共用）。

与 `reference/xiuxian_ai_demo/xiuxian/mccfr.py` 的私有实现等价，改为公开命名，
方便 C3 的 `training/trainer.py` 直接复用而不必复制代码。
"""

from __future__ import annotations

import random
from typing import Mapping, Sequence

from game.actions import Action


def sample_from_strategy(
    rng: random.Random, actions: Sequence[Action], probs: Mapping[str, float]
) -> Action:
    """按 `probs`（`action.key() -> 概率`）采样一个动作。"""
    if not actions:
        raise ValueError("没有可选动作。")
    x = rng.random()
    acc = 0.0
    for action in actions:
        acc += probs.get(action.key(), 0.0)
        if x <= acc:
            return action
    return actions[-1]


def regret_matching(regrets: Mapping[str, float], legal: Sequence[Action]) -> dict[str, float]:
    """Regret Matching：`max(regret, 0)` 归一化；全非正则均匀分布。"""
    if not legal:
        return {}
    positive = {a.key(): max(0.0, regrets.get(a.key(), 0.0)) for a in legal}
    total = sum(positive.values())
    if total <= 1e-15:
        p = 1.0 / len(legal)
        return {a.key(): p for a in legal}
    return {k: v / total for k, v in positive.items()}


#: 兼容别名（参考实现里的私有命名）
_sample_from_strategy = sample_from_strategy
_regret_matching = regret_matching

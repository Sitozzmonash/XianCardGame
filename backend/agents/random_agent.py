"""随机 AI（baseline）。"""

from __future__ import annotations

import random

from game.actions import Action
from game.state import GameState

from .base import BaseAgent


class RandomAgent(BaseAgent):
    """在合法动作里均匀随机选择。只依赖 `legal_actions()`，不看隐藏信息。"""

    name = "随机AI"

    def __init__(self, seed: int = 0):
        self.seed = int(seed)
        self.rng = random.Random(self.seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        return self.rng.choice(legal)

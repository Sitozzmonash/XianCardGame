"""规则 AI（人工 baseline，spec §19）。

策略（与参考实现逐条一致）：
- 被摄物术针对：有反制符则优先反制；
- 化解天劫后：攻击型策略，天劫尽量回插牌堆顶；
- 改命排序：顶部有天劫则把它尽量往后放；
- 已知下一张是天劫：优先遁术 > 洗牌 > 逆天改命 > 结束回合；
- 不知道牌顶且本回合还没用行动：优先观星术；
- 手牌 ≤ 5 时偷牌，目标选手牌最多的人。

严格不读取隐藏信息：只使用 `legal_actions()` / `phase` / 自己的 `known_top` /
自己的 `reorder_view` / 公开量（`hand_sizes()`、`actions_used`）。
"""

from __future__ import annotations

import random
from typing import Optional

from game.actions import Action, ActionKind
from game.cards import Card
from game.state import GameState, Phase

from .base import BaseAgent


class RuleAgent(BaseAgent):
    """简单规则 AI，用来做 baseline，不读取隐藏信息。"""

    name = "规则AI"

    def __init__(self, seed: int = 0):
        self.seed = int(seed)
        self.rng = random.Random(self.seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        if len(legal) == 1:
            return legal[0]

        if state.phase == Phase.COUNTER:
            counter = self._find(legal, ActionKind.PLAY_COUNTER)
            return counter or legal[0]

        if state.phase == Phase.REINSERT:
            # 攻击型策略：尽量把天劫放回顶部，让下一家承压。
            return next(a for a in legal if a.param == "TOP")

        if state.phase == Phase.REORDER:
            # `reorder_view` 是当前决策玩家自己的私有视图（owner == player）。
            cards = list(state.reorder_view)
            # 如果顶部三张里有天劫，把它尽量往后放。
            if Card.TRIBULATION in cards:
                idxs = list(range(len(cards)))
                idxs.sort(key=lambda i: cards[i] == Card.TRIBULATION)
                key = "".join(map(str, idxs))
                for a in legal:
                    if a.param == key:
                        return a
            return legal[0]

        known = state.known_top[player]
        if known and known[0] == Card.TRIBULATION:
            for kind in (
                ActionKind.PLAY_SKIP,
                ActionKind.PLAY_SHUFFLE,
                ActionKind.PLAY_REORDER,
            ):
                a = self._find(legal, kind)
                if a:
                    return a
            return self._find(legal, ActionKind.END_TURN) or legal[0]

        # 不知道牌顶时，优先花第一张行动获取信息。
        if not known and state.actions_used == 0:
            a = self._find(legal, ActionKind.PLAY_PEEK)
            if a:
                return a

        # 手牌偏少时尝试偷牌，目标选手牌最多的人（手牌数是公开信息）。
        steals = [a for a in legal if a.kind == ActionKind.PLAY_STEAL]
        hand_sizes = state.hand_sizes()
        if steals and hand_sizes[player] <= 5:
            return max(steals, key=lambda a: hand_sizes[a.target])

        return self._find(legal, ActionKind.END_TURN) or legal[0]

    @staticmethod
    def _find(actions: list[Action], kind: ActionKind) -> Optional[Action]:
        return next((a for a in actions if a.kind == kind), None)

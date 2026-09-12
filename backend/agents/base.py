"""Agent 基类（冻结契约 `docs/INTERFACES.md` §2）。

所有 Agent 的统一约束（spec §59，强约束）：
**不得读取** `state.deck` / `state.hands[other]` / `state.known_top[other]` 做决策。
搜索类算法只能通过 `state.determinize_for(player, seed)` 构造可能世界。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # 仅类型检查期导入，运行期保持零耦合
    from game.actions import Action
    from game.state import GameState


class BaseAgent:
    """所有 AI 的基类。"""

    name: str = "BaseAgent"

    def act(self, state: GameState, player: int) -> Action:
        raise NotImplementedError

    def __repr__(self) -> str:  # 便于日志
        return f"<{self.__class__.__name__} name={self.name}>"

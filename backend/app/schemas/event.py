"""事件 schema（API_CONTRACT §13 §14）。

事件是「该 viewer 可见」的结构化信息：

* 公共事件绝不携带私有信息（他人观星只发 `CARD_PLAYED`，不带牌面）；
* `DECK_PEEKED` 的牌面只对**观星者本人**可见（`private_for`）；
* `REORDER_TOP` 的排序细节**永不回传**（只发 `DECK_REORDERED`，不带顺序）。

事件最终形态::

    {"seq": 1, "type": "CARD_PLAYED", "actor": 0, "data": {"card_id": "STARGAZING"}}
"""

from __future__ import annotations

from enum import Enum


class EventKind(str, Enum):
    """API_CONTRACT §13 的事件类型（19 种）。

    其中 `TURN_SKIPPED` 为**历史保留**：遁术改为反制阶段的反应牌后，引擎不再产生该事件
    （前端可继续渲染历史日志，但新对局不会出现）。新增 `ESCAPE_DODGED` 表达「遁术避开法术」。
    """

    GAME_STARTED = "GAME_STARTED"
    TURN_STARTED = "TURN_STARTED"
    CARD_PLAYED = "CARD_PLAYED"
    CARD_DRAWN = "CARD_DRAWN"
    CARD_STOLEN = "CARD_STOLEN"
    COUNTER_OPENED = "COUNTER_OPENED"
    COUNTER_USED = "COUNTER_USED"
    COUNTER_PASSED = "COUNTER_PASSED"
    DECK_PEEKED = "DECK_PEEKED"
    DECK_REORDERED = "DECK_REORDERED"
    DECK_SHUFFLED = "DECK_SHUFFLED"
    TURN_SKIPPED = "TURN_SKIPPED"
    ESCAPE_DODGED = "ESCAPE_DODGED"
    TRIBULATION_DRAWN = "TRIBULATION_DRAWN"
    TRIBULATION_DEFUSED = "TRIBULATION_DEFUSED"
    TRIBULATION_REINSERTED = "TRIBULATION_REINSERTED"
    PLAYER_ELIMINATED = "PLAYER_ELIMINATED"
    TURN_ENDED = "TURN_ENDED"
    GAME_ENDED = "GAME_ENDED"


EVENT_TYPES: tuple[str, ...] = tuple(kind.value for kind in EventKind)

#: 只有 `actor` 自己可见的事件（private payload 键）
PRIVATE_EVENT_TYPES: tuple[str, ...] = (EventKind.DECK_PEEKED.value,)

__all__ = ["EventKind", "EVENT_TYPES", "PRIVATE_EVENT_TYPES"]

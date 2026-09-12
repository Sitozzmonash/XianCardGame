"""`game` 包：修仙卡牌规则与环境（冻结契约 `docs/INTERFACES.md` §1.8）。"""

from __future__ import annotations

from .actions import (
    API_ACTION_TYPE,
    CARD_TO_KIND,
    KIND_TO_CARD,
    REINSERT_REGIONS,
    Action,
    ActionKind,
    action_id,
)
from .cards import (
    API_CARD_ID,
    CARD_BY_API_ID,
    CARD_ORDER,
    CARD_SPECS,
    CARD_TO_INDEX,
    INDEX_TO_CARD,
    Card,
    CardSpec,
    card_spec,
)
from .config import GameConfig, default_deck_composition
from .state import (
    PHASE_API_NAME,
    PHASE_ORDER,
    PHASE_TO_INDEX,
    PLAYER_NAMES,
    GameState,
    Phase,
)

__all__ = [
    "Card",
    "CardSpec",
    "CARD_SPECS",
    "CARD_ORDER",
    "CARD_TO_INDEX",
    "INDEX_TO_CARD",
    "API_CARD_ID",
    "CARD_BY_API_ID",
    "card_spec",
    "GameConfig",
    "default_deck_composition",
    "Action",
    "ActionKind",
    "API_ACTION_TYPE",
    "KIND_TO_CARD",
    "CARD_TO_KIND",
    "REINSERT_REGIONS",
    "action_id",
    "GameState",
    "Phase",
    "PHASE_ORDER",
    "PHASE_TO_INDEX",
    "PHASE_API_NAME",
    "PLAYER_NAMES",
]

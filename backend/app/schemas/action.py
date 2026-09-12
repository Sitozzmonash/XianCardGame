"""执行动作 schema（API_CONTRACT §11 §12）。"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field

#: 各动作类型允许的 payload 键（用于忽略前端多余字段）
PAYLOAD_KEYS: dict[str, tuple[str, ...]] = {
    "REORDER_TOP": ("order",),
    "REINSERT_TRIBULATION": ("region",),
    "PLAY_CARD_TARGET": ("target_player",),
    "PLAY_CARD": ("card_instance_id",),
    "COUNTER": (),
    "PASS_COUNTER": (),
    "END_ACTION": (),
}


class ActionRequest(BaseModel):
    """`POST /games/{game_id}/actions` 请求体（API_CONTRACT §11）。

    前端**只发 action_id + payload**，后端用 `(revision, action_id)` 反查真实 Action。
    """

    model_config = ConfigDict(extra="ignore")

    revision: int = Field(..., description="前端视角的当前 revision，用于防重复提交")
    action_id: str = Field(..., min_length=1, description="legal_actions 里的 id")
    payload: dict[str, Any] = Field(default_factory=dict)


def resolve_action_payload(action_type: str, payload: Optional[Mapping[str, Any]]) -> dict:
    """按动作类型过滤 payload（多余键忽略，避免前端脏字段影响还原）。"""
    raw = dict(payload or {})
    allowed = PAYLOAD_KEYS.get(action_type)
    if allowed is None:
        return raw
    return {key: raw[key] for key in allowed if key in raw}


__all__ = ["ActionRequest", "PAYLOAD_KEYS", "resolve_action_payload"]

"""`app.services`：FastAPI 服务层（INTERFACES §4.1）。"""

from __future__ import annotations

from .agent_factory import (
    agent_spec_from_request,
    build_agent,
    build_agent_with_meta,
    normalize_agent_spec,
)
from .game_session import GameSession
from .model_registry import ModelRegistry, get_model_registry
from .session_store import SessionStore, get_session_store

__all__ = [
    "GameSession",
    "SessionStore",
    "get_session_store",
    "ModelRegistry",
    "get_model_registry",
    "agent_spec_from_request",
    "build_agent",
    "build_agent_with_meta",
    "normalize_agent_spec",
]

"""Agent / 模型列表（API_CONTRACT §5）。"""

from __future__ import annotations

from fastapi import APIRouter

from agents.registry import AGENT_INFOS

from ..services.model_registry import get_model_registry

router = APIRouter(tags=["agents"])

#: 非 MCCFR 的内置 agent（MCCFR 条目由 `models/index.json` 扩充）
_MCCFR_TYPE = "mccfr"


def base_agent_infos() -> list:
    """内置 agent 条目（random / rule / ismcts ...）。"""
    return [
        dict(info) for info in AGENT_INFOS if info.get("type") != _MCCFR_TYPE
    ]


def collect_agent_infos() -> list:
    """内置 agent + 模型清单里的 MCCFR 条目（index.json 缺失时给通用 mccfr 条目）。"""
    infos = base_agent_infos()
    registry = get_model_registry()
    models = registry.model_agent_infos()
    if models:
        infos.extend(models)
        return infos

    generic = next(
        (dict(info) for info in AGENT_INFOS if info.get("type") == _MCCFR_TYPE), None
    )
    if generic is not None:
        infos.append(generic)
    return infos


@router.get("/agents")
def list_agents() -> dict:
    """`GET /api/v1/agents` -> `{"agents": [...]}`（惰性读索引，带内存缓存）。"""
    return {"agents": collect_agent_infos()}


__all__ = ["router", "base_agent_infos", "collect_agent_infos"]

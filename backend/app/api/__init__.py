"""`app.api`：路由聚合（INTERFACES §4）。"""

from __future__ import annotations

from fastapi import APIRouter

from . import agents, cards, games, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(agents.router)
api_router.include_router(cards.router)
api_router.include_router(games.router)

__all__ = ["api_router"]

"""健康检查（API_CONTRACT §4）。"""

from __future__ import annotations

from fastapi import APIRouter

from ..core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """`GET /api/v1/health` -> `{"status": "ok", "version": "0.1.0"}`"""
    settings = get_settings()
    return {"status": "ok", "version": settings.app_version}


__all__ = ["router"]

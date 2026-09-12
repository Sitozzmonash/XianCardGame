"""卡牌定义（API_CONTRACT §18）。

前端不用硬编码文案：卡名 / 分类 / 效果说明 / 资源名都从这里取。
**规则效果仍由 Python 引擎控制。**
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter

from game import CARD_SPECS

router = APIRouter(tags=["cards"])


@router.get("/cards")
def list_cards() -> dict:
    """`GET /api/v1/cards` -> `{"cards": [{id, name, category, description, asset}, ...]}`"""
    return {"cards": [asdict(spec) for spec in CARD_SPECS]}


__all__ = ["router"]

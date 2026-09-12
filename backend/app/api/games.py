"""游戏生命周期路由（API_CONTRACT §6 §11 §15 §16）。

    POST   /api/v1/games                    创建游戏（AI 自动跑到人类决策点）
    GET    /api/v1/games/{game_id}          读取最新 GameView
    POST   /api/v1/games/{game_id}/actions  执行动作（返回 GameView + events[]）
    DELETE /api/v1/games/{game_id}          删除游戏
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Path

from game import GameConfig

from ..core.config import get_settings
from ..core.errors import BadRequest
from ..schemas.action import ActionRequest
from ..schemas.game import CreateGameRequest, validate_create_request
from ..services.session_store import get_session_store

log = logging.getLogger("app.api.games")

router = APIRouter(prefix="/games", tags=["games"])


@router.post("")
def create_game(request: CreateGameRequest) -> dict:
    """创建游戏：`{"game_id", "player_id", "state": GameView}`（API_CONTRACT §6）。"""
    data = validate_create_request(request)
    settings = get_settings()
    seed = data["seed"]

    config = GameConfig(
        num_players=int(data["players"]),
        max_decisions=int(settings.max_decisions),
        seed=int(seed) if seed is not None else 42,
    )

    store = get_session_store()
    session = store.create(
        config=config,
        seed=seed,
        human_player_id=data["human_player"],
        agent_specs=data["agent_specs"],
    )

    # 创建后如果不是人类先决策，服务端自动跑 AI 直到人类决策点 / 终局
    session.run_ai_until_human()

    viewer = session.human_player_id if session.human_player_id is not None else 0
    return {
        "game_id": session.game_id,
        "player_id": viewer,
        "state": session.view_for(viewer),
    }


@router.get("/{game_id}")
def get_game(game_id: str = Path(..., min_length=1)) -> dict:
    """最新 GameView（App 回前台 / reload / 网络恢复用）。"""
    session = get_session_store().get(game_id)
    viewer = session.human_player_id if session.human_player_id is not None else 0
    return session.view_for(viewer)


@router.post("/{game_id}/actions")
def post_action(
    request: ActionRequest, game_id: str = Path(..., min_length=1)
) -> dict:
    """执行动作：返回最新 GameView（含本次请求产生的 `events[]`）。"""
    session = get_session_store().get(game_id)
    if session.human_player_id is None:
        raise BadRequest("该局没有人类座位，无法提交动作")
    return session.act(request.action_id, request.payload, request.revision)


@router.delete("/{game_id}")
def delete_game(game_id: str = Path(..., min_length=1)) -> dict:
    """删除游戏（幂等，返回 `{"ok": true}`）。"""
    get_session_store().delete(game_id)
    return {"ok": True}


__all__ = ["router"]

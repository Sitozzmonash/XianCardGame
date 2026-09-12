"""创建游戏 / GameView 的 schema 与字段白名单（API_CONTRACT §6 §7 §8 §9 §10）。"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..core.errors import BadRequest

#: GameView **顶层字段白名单**（多一个都不允许，见 e2e_api.py 的 GAMEVIEW_KEYS）
GAMEVIEW_KEYS: tuple[str, ...] = (
    "game_id",
    "status",
    "revision",
    "viewer_player_id",
    "phase",
    "current_player",
    "decision_player",
    "observation",
    "public",
    "legal_actions",
    "events",
    "winner",
)

#: `public` 白名单（API_CONTRACT §7）
PUBLIC_KEYS: tuple[str, ...] = (
    "round",
    "deck_count",
    "discard_count",
    "players",
)

#: `public.players[]`（PlayerPublicView §8）白名单
PLAYER_PUBLIC_KEYS: tuple[str, ...] = (
    "player_id",
    "name",
    "alive",
    "hand_count",
    "is_current",
    "is_decision_player",
    "agent",
)

#: `observation` 白名单（API_CONTRACT §9 / INTERFACES §1.6）
OBSERVATION_KEYS: tuple[str, ...] = (
    "hand",
    "known_top",
    "actions_used",
    "max_actions_per_turn",
    "private_context",
)

#: 单条 LegalAction（API_CONTRACT §10）白名单
LEGAL_ACTION_KEYS: tuple[str, ...] = (
    "id",
    "type",
    "label",
    "enabled",
    "card_instance_id",
    "params",
)


class AgentRequest(BaseModel):
    """`POST /games` 里单个座位的 agent 配置。

    允许的字段（其余忽略，前端可能多传展示用字段）::

        {"type": "ismcts", "simulations": 500, "exploration": 1.4, "max_depth": 250}
        {"type": "mccfr", "model": "models/x.pkl"}  /  {"type": "mccfr", "path": "..."}
        {"type": "rule"} / {"type": "random"}
    """

    model_config = ConfigDict(extra="ignore")

    type: str = Field(default="rule", description="random | rule | ismcts | mccfr")
    simulations: Optional[int] = Field(default=None, ge=1)
    exploration: Optional[float] = Field(default=None, gt=0)
    max_depth: Optional[int] = Field(default=None, ge=1)
    model: Optional[str] = None
    path: Optional[str] = None

    def to_spec(self) -> dict:
        """转成 `agent_factory.build_agent` 认识的 dict（丢掉 None）。"""
        data = self.model_dump(exclude_none=True)
        return data


class CreateGameRequest(BaseModel):
    """`POST /games` 请求体（API_CONTRACT §6）。"""

    model_config = ConfigDict(extra="ignore")

    players: int = Field(default=3, ge=2, le=6)
    human_player: Optional[int] = Field(default=0, ge=0, le=5)
    agents: list[Optional[AgentRequest]] = Field(default_factory=list)
    seed: Optional[int] = None


def validate_create_request(req: CreateGameRequest) -> dict:
    """校验 §6 的三条规则，返回规范化后的 dict。

    规则::

        players == agents.length
        human_player 对应位置必须为 null
        其他座位必须指定 agent

    违反 → 400（参数错误）；schema 层面的错误由 FastAPI 自动给出 422。
    """
    players = int(req.players)
    agents = list(req.agents)

    if len(agents) != players:
        raise BadRequest(
            f"players({players}) 必须等于 agents 长度({len(agents)})",
            details={"players": players, "agents": len(agents)},
        )

    human = req.human_player
    if human is not None and not (0 <= int(human) < players):
        raise BadRequest(
            f"human_player({human}) 越界（0..{players - 1}）",
            details={"human_player": human, "players": players},
        )

    specs: list[Optional[dict]] = []
    for seat, entry in enumerate(agents):
        if entry is None:
            if human is None or seat != int(human):
                raise BadRequest(
                    f"座位 {seat} 缺少 agent 配置（只有 human_player 座位可以为 null）",
                    details={"seat": seat, "human_player": human},
                )
            specs.append(None)
            continue
        if human is not None and seat == int(human):
            raise BadRequest(
                f"座位 {seat} 是 human_player，agents[{seat}] 必须为 null",
                details={"seat": seat, "human_player": human},
            )
        specs.append(entry.to_spec())

    return {
        "players": players,
        "human_player": None if human is None else int(human),
        "agent_specs": specs,
        "seed": req.seed,
    }


__all__ = [
    "GAMEVIEW_KEYS",
    "PUBLIC_KEYS",
    "PLAYER_PUBLIC_KEYS",
    "OBSERVATION_KEYS",
    "LEGAL_ACTION_KEYS",
    "AgentRequest",
    "CreateGameRequest",
    "validate_create_request",
]

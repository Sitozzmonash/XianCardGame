"""API 测试公共工具（无测试用例，只有常量与机器人）。

只为 `tests/test_api_*.py` 服务，**不属于** `app/` 的生产代码。
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi.testclient import TestClient

from app.main import app
from app.services.session_store import get_session_store, reset_session_store

BASE = "/api/v1"

#: GameView 顶层字段白名单（API_CONTRACT §7）
GAMEVIEW_KEYS = {
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
}
#: Observation 白名单（§9 / INTERFACES §1.6）
OBSERVATION_KEYS = {
    "hand",
    "known_top",
    "actions_used",
    "max_actions_per_turn",
    "private_context",
}
#: public 白名单（§7）—— 严格 5 个键（父裁决：turn_no 允许，deck_size/alive/hand_sizes 一律禁止）
PUBLIC_KEYS = {"round", "deck_count", "discard_count", "players", "turn_no"}
#: PlayerPublicView 白名单（§8）—— **绝不出现手牌内容**
PLAYER_PUBLIC_KEYS = {
    "player_id",
    "name",
    "alive",
    "hand_count",
    "is_current",
    "is_decision_player",
    "agent",
}
#: LegalAction 白名单（§10）
LEGAL_ACTION_KEYS = {"id", "type", "label", "enabled", "card_instance_id", "params"}

#: 事件类型全集（§13）
EVENT_TYPES = {
    "GAME_STARTED", "TURN_STARTED", "CARD_PLAYED", "CARD_DRAWN", "CARD_STOLEN",
    "COUNTER_OPENED", "COUNTER_USED", "COUNTER_PASSED", "DECK_PEEKED",
    "DECK_REORDERED", "DECK_SHUFFLED", "TURN_SKIPPED", "TRIBULATION_DRAWN",
    "TRIBULATION_DEFUSED", "TRIBULATION_REINSERTED", "PLAYER_ELIMINATED",
    "TURN_ENDED", "GAME_ENDED",
}

#: 4 种特殊决策（API_CONTRACT §12）对应的 action type 分组
SPECIAL_ACTION_GROUPS = {
    "COUNTER": {"COUNTER", "PASS_COUNTER"},          # 12.3 反制决策
    "PLAY_CARD_TARGET": {"PLAY_CARD_TARGET"},        # 12.2 摄物术选目标
    "REORDER_TOP": {"REORDER_TOP"},                  # 12.4 逆天改命排序
    "REINSERT_TRIBULATION": {"REINSERT_TRIBULATION"},  # 12.5 天劫回插
}

#: e2e_api.py 里用于挑选动作的优先级
ACTION_PRIORITY = {
    "PASS_COUNTER": 0,
    "COUNTER": 1,
    "REORDER_TOP": 2,
    "REINSERT_TRIBULATION": 3,
    "PLAY_CARD_TARGET": 4,
    "PLAY_CARD": 5,
    "END_ACTION": 9,
}


def compact(obj: Any) -> str:
    """与 FastAPI 默认响应一致的紧凑 JSON（用于「隐藏信息不得出现」子串断言）。"""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def new_client() -> TestClient:
    return TestClient(app)


def reset_backend() -> None:
    """清空进程内 session（测试隔离）。"""
    reset_session_store()


def store():
    return get_session_store()


def create_game(
    client: TestClient,
    *,
    players: int = 3,
    seed: Optional[int] = 20260912,
    human: int = 0,
    agents: Optional[list] = None,
):
    if agents is None:
        agents = [None] + [
            {"type": "rule"} if i % 2 == 0 else {"type": "ismcts", "simulations": 30}
            for i in range(players - 1)
        ]
    return client.post(
        f"{BASE}/games",
        json={"players": players, "human_player": human, "agents": agents, "seed": seed},
    )


def default_agents(players: int, human: int = 0) -> list:
    """与 e2e_api.py 相同的座位配置（Human + Rule + ISMCTS）。"""
    agents: list = [None] + [
        {"type": "rule"} if i % 2 == 0 else {"type": "ismcts", "simulations": 30}
        for i in range(players - 1)
    ]
    if human != 0:
        agents[human] = None
    return agents


def bot_pick(view: dict, step: int) -> tuple:
    """复刻 e2e_api.py 的机器人：优先挑能触发特殊 Phase 的动作。"""
    legal = view.get("legal_actions") or []
    if not legal:
        raise AssertionError("legal_actions 为空但游戏未结束")
    ordered = sorted(legal, key=lambda a: ACTION_PRIORITY.get(a.get("type", ""), 6))
    action = ordered[step % max(1, min(3, len(ordered)))]
    atype = action.get("type", "")
    payload: dict = {}

    if atype == "REORDER_TOP":
        cards = ((view.get("observation") or {}).get("private_context") or {}).get(
            "cards"
        ) or []
        assert cards, "REORDER_TOP 必须给 private_context.cards"
        payload = {"order": list(reversed([c["token"] for c in cards]))}
    elif atype == "REINSERT_TRIBULATION":
        options = ((action.get("params") or {}).get("region") or {}).get("options") or []
        payload = {"region": options[0] if options else "NEAR_TOP"}
    elif atype == "PLAY_CARD_TARGET":
        options = ((action.get("params") or {}).get("target_player") or {}).get(
            "options"
        ) or []
        assert options, "PLAY_CARD_TARGET 必须给 target_player.options"
        payload = {"target_player": options[0]}
    return action["id"], payload


def play_game(
    client: TestClient,
    *,
    players: int = 3,
    seed: int = 20260912,
    human: int = 0,
    agents: Optional[list] = None,
    max_steps: int = 200,
    check_dup: bool = True,
    collect: Optional[dict] = None,
) -> dict:
    """用机器人完整打一局（HTTP API），返回 {view, decisions, specials, events}。"""
    created_resp = create_game(
        client, players=players, seed=seed, human=human,
        agents=agents if agents is not None else default_agents(players, human),
    )
    assert created_resp.status_code == 200, created_resp.text
    created = created_resp.json()
    game_id = created["game_id"]
    seat = created["player_id"]
    view = created["state"]

    specials: set = set()
    seen_events: list = []
    steps = 0

    while steps < max_steps:
        steps += 1
        seen_events.extend(view.get("events") or [])
        if view.get("status") == "ended":
            break
        assert view.get("decision_player") == seat, (
            f"服务端应自动跑完 AI：decision_player={view.get('decision_player')} "
            f"!= 人类座位 {seat}"
        )

        action_id, payload = bot_pick(view, steps)
        atype = next(
            a.get("type") for a in view["legal_actions"] if a["id"] == action_id
        )
        specials.add(atype)

        if check_dup:
            dup = client.post(
                f"{BASE}/games/{game_id}/actions",
                json={
                    "revision": view["revision"] - 1 if view["revision"] > 1 else -1,
                    "action_id": action_id,
                    "payload": payload,
                },
            )
            assert dup.status_code == 409, (
                f"旧 revision 必须被拒（防重复提交），实际 {dup.status_code}: {dup.text[:200]}"
            )

        resp = client.post(
            f"{BASE}/games/{game_id}/actions",
            json={"revision": view["revision"], "action_id": action_id, "payload": payload},
        )
        assert resp.status_code == 200, (
            f"动作失败 {resp.status_code}: {resp.text[:300]} (action_id={action_id} type={atype})"
        )
        new_view = resp.json()
        assert new_view.get("revision", 0) > view.get("revision", 0), "revision 必须递增"
        view = new_view

    if collect is not None:
        collect.setdefault("specials", set()).update(specials)
        collect.setdefault("events", []).extend(seen_events)

    client.delete(f"{BASE}/games/{game_id}")
    return {"view": view, "decisions": steps, "specials": specials, "events": seen_events}


def special_groups_hit(specials) -> set:
    """把命中的 action type 归并到 4 种特殊决策分组。"""
    hit = set()
    for group, types in SPECIAL_ACTION_GROUPS.items():
        if specials & types:
            hit.add(group)
    return hit


def hidden_hand_fragments(state, viewer: int) -> list:
    """返回「绝不允许出现在响应里的 JSON 片段」：真实牌堆 / 他人手牌 / 他人观星结果。"""
    from game import API_CARD_ID

    fragments: list = []
    deck_ids = [API_CARD_ID[card] for card in state.deck]
    if deck_ids:
        fragments.append(("真实牌堆顺序", compact(deck_ids)))
    for seat in range(state.num_players):
        if seat == viewer:
            continue
        hand_ids = [API_CARD_ID[card] for card in state.hands[seat]]
        if hand_ids:
            fragments.append((f"P{seat} 手牌内容", compact(hand_ids)))
        known_ids = [API_CARD_ID[card] for card in state.known_top[seat]]
        if known_ids:
            fragments.append((f"P{seat} 私有观星结果", compact(known_ids)))
    return fragments

"""API 契约测试：健康检查 / agents / cards / 创建游戏 / 错误码 / revision 防重。

对应 API_CONTRACT §3-§7、§10、§15-§18 与 INTERFACES §4.2。
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.errors import AppError, GameNotFound, ModelLoadError
from app.services.agent_factory import build_agent_with_meta
from app.services.model_registry import ModelRegistry
from app.services.session_store import SessionStore
from game import CARD_SPECS, GameConfig

from test_api_support import (
    BASE,
    GAMEVIEW_KEYS,
    LEGAL_ACTION_KEYS,
    OBSERVATION_KEYS,
    PLAYER_PUBLIC_KEYS,
    PUBLIC_KEYS,
    create_game,
    default_agents,
    new_client,
    reset_backend,
    store,
)


@pytest.fixture()
def client():
    reset_backend()
    with new_client() as c:
        yield c
    reset_backend()


# --------------------------------------------------------------------- §4 §5 §18


def test_health_schema(client):
    resp = client.get(f"{BASE}/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str) and body["version"]


def test_agents_schema(client):
    resp = client.get(f"{BASE}/agents")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert isinstance(agents, list) and agents

    ids = {entry["id"] for entry in agents}
    assert {"random", "rule", "ismcts"} <= ids

    for entry in agents:
        assert set(entry) <= {"id", "name", "type", "configurable", "defaults", "model"}
        assert isinstance(entry["id"], str) and entry["id"]
        assert isinstance(entry["name"], str) and entry["name"]
        assert entry["type"] in {"random", "rule", "ismcts", "mccfr"}
        assert isinstance(entry["configurable"], bool)
        if entry["type"] == "ismcts":
            assert entry["configurable"] is True
            assert entry["defaults"]["simulations"] >= 1
            assert entry["defaults"]["exploration"] > 0
        if entry["type"] == "mccfr" and "model" in entry:
            assert entry["model"].endswith(".pkl")


def test_agents_lists_models_from_index(client, monkeypatch):
    """`models/index.json` 存在时，MCCFR 模型必须出现在 /agents 里。"""
    from app.api import agents as agents_api
    from app.services.model_registry import ModelEntry

    fake = ModelRegistry(model_dir=Path("models"))
    monkeypatch.setattr(
        fake,
        "list_models",
        lambda force=False: [
            ModelEntry(
                id="mccfr_2p_10k",
                name="MCCFR 2P 10K",
                path="models/mccfr_2p_10k.pkl",
                players=2,
                iterations=10000,
            )
        ],
    )
    monkeypatch.setattr(agents_api, "get_model_registry", lambda: fake)
    body = client.get(f"{BASE}/agents").json()
    model_entry = next(e for e in body["agents"] if e["id"] == "mccfr_2p_10k")
    assert model_entry == {
        "id": "mccfr_2p_10k",
        "name": "MCCFR 2P 10K",
        "type": "mccfr",
        "configurable": False,
        "model": "models/mccfr_2p_10k.pkl",
    }


def test_cards_schema(client):
    resp = client.get(f"{BASE}/cards")
    assert resp.status_code == 200
    cards = resp.json()["cards"]
    assert len(cards) == len(CARD_SPECS) == 8
    for card in cards:
        assert set(card) == {"id", "name", "category", "description", "asset"}
        assert card["asset"] == card["asset"].lower()
    by_id = {card["id"]: card for card in cards}
    # INTERFACES §1.7 冻结映射表
    assert by_id["STARGAZING"]["category"] == "ACTIVE"
    assert by_id["STARGAZING"]["asset"] == "stargazing"
    assert by_id["REWRITE_FATE"]["name"] == "逆天改命"
    assert by_id["COUNTER"]["category"] == "REACTIVE"
    assert by_id["TRIBULATION"]["category"] == "TRIBULATION"


def test_cards_never_leak_runtime_state(client):
    """卡牌定义是静态的：不能因为某局进行中就掺入状态。"""
    create_game(client, players=3)
    first = client.get(f"{BASE}/cards").json()["cards"]
    create_game(client, players=4, seed=7)
    second = client.get(f"{BASE}/cards").json()["cards"]
    assert first == second


# ------------------------------------------------------------------------- §6 §7


def test_create_game_response_schema(client):
    resp = create_game(client, players=3, seed=20260912)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"game_id", "player_id", "state"}
    assert body["player_id"] == 0
    assert isinstance(body["game_id"], str) and body["game_id"]

    view = body["state"]
    assert set(view) == GAMEVIEW_KEYS
    assert view["game_id"] == body["game_id"]
    assert view["viewer_player_id"] == 0
    # 创建后 AI 必须已经被服务端跑完（或直接终局）
    assert view["status"] == "ended" or view["decision_player"] == 0
    assert view["revision"] >= 1
    assert isinstance(view["winner"], (int, type(None)))

    obs = view["observation"]
    assert set(obs) == OBSERVATION_KEYS
    for card in obs["hand"]:
        assert set(card) == {"instance_id", "card_id", "name"}
        assert card["instance_id"].startswith("h_0_")
    assert set(view["public"]) == PUBLIC_KEYS
    for player in view["public"]["players"]:
        assert set(player) == PLAYER_PUBLIC_KEYS
    for action in view["legal_actions"]:
        assert set(action) == LEGAL_ACTION_KEYS
        assert action["enabled"] is True
    assert any(ev["type"] == "GAME_STARTED" for ev in view["events"])


def test_create_game_first_player_may_be_ai(client):
    """AI 先手时服务端必须自动行动到人类决策点（交给人类决策）。"""
    fast = [None, {"type": "rule"}, {"type": "rule"}]
    for seed in range(24):
        resp = create_game(client, players=3, seed=seed, agents=fast)
        assert resp.status_code == 200, resp.text
        view = resp.json()["state"]
        assert view["status"] == "ended" or view["decision_player"] == 0
        client.delete(f"{BASE}/games/{resp.json()['game_id']}")


@pytest.mark.parametrize(
    "payload",
    [
        {"players": 3, "human_player": 0, "agents": [None, {"type": "rule"}]},          # 长度不符
        {"players": 3, "human_player": 0, "agents": [{"type": "rule"}, None, {"type": "rule"}]},  # human 位非 null
        {"players": 3, "human_player": 0, "agents": [None, None, {"type": "rule"}]},    # 其他座位缺 agent
        {"players": 2, "human_player": 0, "agents": [None, None]},                      # 其他座位缺 agent
        {"players": 3, "human_player": 5, "agents": [None, {"type": "rule"}, {"type": "rule"}]},
    ],
)
def test_create_game_bad_request(client, payload):
    resp = client.post(f"{BASE}/games", json=payload)
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "BAD_REQUEST"
    assert body["error"]["message"]
    assert "details" in body["error"]


def test_create_game_unknown_agent_type_400(client):
    resp = client.post(
        f"{BASE}/games",
        json={"players": 3, "human_player": 0, "agents": [None, {"type": "nope"}, {"type": "rule"}]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_AGENT"


@pytest.mark.parametrize(
    "payload",
    [
        {"players": "three", "human_player": 0, "agents": [None, None, None]},
        {"players": 3, "human_player": 0, "agents": "not-a-list"},
        {"players": 3, "agents": [None, {"type": "ismcts", "simulations": 0}]},
        {"players": 3, "human_player": 0, "agents": [None, {"type": "ismcts", "simulations": "abc"}]},
        {"players": 3, "human_player": 0, "agents": [None, {"type": "rule"}, None], "seed": "x"},
    ],
)
def test_create_game_schema_422(client, payload):
    resp = client.post(f"{BASE}/games", json=payload)
    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "errors" in body["error"]["details"]


def test_create_game_with_mccfr_without_model_400(client):
    resp = client.post(
        f"{BASE}/games",
        json={"players": 2, "human_player": 0, "agents": [None, {"type": "mccfr"}], "seed": 1},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_AGENT"


# ---------------------------------------------------------------- §15 §16 §3


def test_get_and_delete_game(client):
    game_id = create_game(client, players=3).json()["game_id"]

    got = client.get(f"{BASE}/games/{game_id}")
    assert got.status_code == 200
    assert set(got.json()) == GAMEVIEW_KEYS
    assert got.json()["game_id"] == game_id

    deleted = client.delete(f"{BASE}/games/{game_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}

    assert client.get(f"{BASE}/games/{game_id}").status_code == 404


def test_unknown_game_404(client):
    resp = client.get(f"{BASE}/games/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "GAME_NOT_FOUND"
    assert body["error"]["details"].get("game_id") == "does-not-exist"


def test_delete_unknown_game_is_ok(client):
    resp = client.delete(f"{BASE}/games/does-not-exist")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_unknown_route_uses_error_envelope(client):
    resp = client.get(f"{BASE}/nope")
    assert resp.status_code == 404
    assert set(resp.json()) == {"error"}
    assert resp.json()["error"]["code"]


def test_unhandled_exception_returns_500_envelope(monkeypatch):
    """500 也要走统一错误体，且不带任何内部信息。"""
    from app.api import games as games_api
    from app.main import app

    class Boom:
        def get(self, game_id):
            raise RuntimeError("内部炸了：不要泄漏这句话")

    monkeypatch.setattr(games_api, "get_session_store", lambda: Boom())
    with TestClient(app, raise_server_exceptions=False) as c:
        resp = c.get(f"{BASE}/games/whatever")
    assert resp.status_code == 500
    body = resp.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["details"] == {}
    assert "内部炸了" not in resp.text


# ------------------------------------------------------------------- §11 §12


def test_stale_revision_409_and_no_state_leak(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, view = created["game_id"], created["state"]
    if view["status"] == "ended":
        pytest.skip("该 seed 下开局即终局")

    action_id = view["legal_actions"][0]["id"]
    resp = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"] - 1, "action_id": action_id, "payload": {}},
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"] == "STALE_REVISION"
    # 不得带任何状态信息（details 必须为空，且不能回灌局面）
    assert body["error"]["details"] == {}
    assert set(body) == {"error"}
    assert "observation" not in resp.text and "legal_actions" not in resp.text


def test_invalid_action_id_409(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, view = created["game_id"], created["state"]
    if view["status"] == "ended":
        pytest.skip("该 seed 下开局即终局")

    resp = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"], "action_id": "a_deadbeef", "payload": {}},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "INVALID_ACTION"


def test_foreign_card_instance_id_409(client):
    """hand instance_id 必须属于当前决策者，不允许拿别人座位的手牌 id 试探。"""
    created = create_game(client, players=3, seed=20260912).json()
    game_id, view = created["game_id"], created["state"]
    if view["status"] == "ended":
        pytest.skip("该 seed 下开局即终局")

    action = next(
        (a for a in view["legal_actions"] if a["type"] == "PLAY_CARD"), None
    )
    if action is None:
        pytest.skip("本步没有 PLAY_CARD 动作")

    entry = dict(action)
    entry["card_instance_id"] = "h_1_0"
    session = store().get(game_id)
    # 直接走 session 层：用「他人座位的 instance_id」构造一个同 id 的条目
    session._action_entries[entry["id"]] = entry
    resp = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"], "action_id": entry["id"], "payload": {}},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "INVALID_ACTION"


def test_actions_requires_revision_and_action_id(client):
    game_id = create_game(client, players=3).json()["game_id"]
    resp = client.post(f"{BASE}/games/{game_id}/actions", json={"action_id": "a_x"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# ------------------------------------------------------------- §4.2 环境变量


def test_ismcts_simulations_are_clamped():
    settings = get_settings()
    cap = int(settings.ismcts_max_simulations)
    agent, meta = build_agent_with_meta({"type": "ismcts", "simulations": cap + 12345}, 7)
    assert meta["simulations"] == cap
    assert meta["requested_simulations"] == cap + 12345
    assert meta["clamped"] is True
    assert agent.simulations == cap

    small, small_meta = build_agent_with_meta({"type": "ismcts", "simulations": 3}, 7)
    assert small_meta["simulations"] == 3 and small_meta["clamped"] is False
    assert small.simulations == 3


def test_ismcts_max_depth_is_forwarded():
    """`max_depth` 不在冻结 spec 语法里，但请求给了就必须真的生效。"""
    agent, meta = build_agent_with_meta(
        {"type": "ismcts", "simulations": 4, "exploration": 1.1, "max_depth": 11}, 3
    )
    assert agent.simulations == 4
    assert agent.exploration == 1.1
    assert agent.max_depth == 11
    assert meta["max_depth"] == 11

    default_agent, default_meta = build_agent_with_meta({"type": "ismcts", "simulations": 4}, 3)
    assert default_agent.max_depth == 250  # ISMCTSAgent 默认
    assert "max_depth" not in default_meta

    with pytest.raises(AppError):
        build_agent_with_meta({"type": "ismcts", "simulations": 4, "max_depth": 0}, 3)


def test_clamped_simulations_visible_in_game_view(client):
    """钳位结果必须能在响应里看到（public.players[].agent）。"""
    settings = get_settings()
    store_ = store()
    session = store_.create(
        config=GameConfig(num_players=2, seed=5, max_decisions=settings.max_decisions),
        seed=5,
        human_player_id=1,
        agent_specs=[{"type": "ismcts", "simulations": settings.ismcts_max_simulations + 999}, None],
    )
    meta = session.agent_meta[0]
    assert meta["simulations"] == settings.ismcts_max_simulations
    assert meta["clamped"] is True

    view = session.view_for(1)
    seat_agent = view["public"]["players"][0]["agent"]
    assert seat_agent["type"] == "ismcts"
    assert seat_agent["simulations"] == settings.ismcts_max_simulations
    assert seat_agent["clamped"] is True
    assert view["public"]["players"][1]["agent"] is None
    store_.delete(session.game_id)


def test_settings_defaults_without_env():
    """没有 .env / 环境变量时也必须能构造配置（pytest 下不能崩）。"""
    settings = Settings.from_env()
    assert settings.session_ttl_seconds > 0
    assert settings.max_sessions >= 1
    assert settings.ismcts_max_simulations >= 1
    assert settings.cors_origins


def test_cors_origin_parsing():
    from app.core.config import parse_cors_origins

    assert parse_cors_origins("*") == ("*",)
    assert parse_cors_origins("") == ("*",)
    assert parse_cors_origins("http://a, http://b") == ("http://a", "http://b")


def test_cors_headers_present(client):
    resp = client.get(f"{BASE}/health", headers={"Origin": "http://localhost:8081"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "*"


# ------------------------------------------------------------ session 生命周期


def test_session_ttl_expires():
    settings = Settings(session_ttl_seconds=0.01, max_sessions=5)
    store_ = SessionStore(settings=settings)
    session = store_.create(
        config=GameConfig(num_players=2, seed=1),
        seed=1,
        human_player_id=0,
        agent_specs=[None, {"type": "rule"}],
    )
    assert store_.get(session.game_id) is session
    time.sleep(0.05)
    with pytest.raises(GameNotFound):
        store_.get(session.game_id)
    assert len(store_) == 0


def test_session_store_max_sessions_evicts_oldest():
    settings = Settings(session_ttl_seconds=3600, max_sessions=2)
    store_ = SessionStore(settings=settings)
    ids = []
    for i in range(4):
        session = store_.create(
            config=GameConfig(num_players=2, seed=i),
            seed=i,
            human_player_id=0,
            agent_specs=[None, {"type": "rule"}],
        )
        ids.append(session.game_id)
    assert len(store_) == 2
    assert not store_.has(ids[0])
    assert store_.has(ids[-1])


def test_session_destroyed_game_404(client):
    created = create_game(client, players=3).json()
    game_id = created["game_id"]
    store().get(game_id).destroy()
    resp = client.get(f"{BASE}/games/{game_id}")
    assert resp.status_code == 404


# ------------------------------------------------------------- 模型注册表 §9


def test_model_registry_without_index(tmp_path):
    registry = ModelRegistry(model_dir=tmp_path)
    assert registry.list_models() == []
    assert registry.model_agent_infos() == []


def test_model_registry_reads_index_and_caches(tmp_path):
    (tmp_path / "index.json").write_text(
        json.dumps(
            {
                "models": [
                    {
                        "id": "mccfr_2p_10k",
                        "name": "MCCFR 2P 10K",
                        "path": "models/mccfr_2p_10k.pkl",
                        "players": 2,
                        "iterations": 10000,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    registry = ModelRegistry(model_dir=tmp_path)
    first = registry.list_models()
    assert [entry.id for entry in first] == ["mccfr_2p_10k"]
    # 第二次不应重新读盘（返回同一批缓存结果）
    assert registry.list_models() == first
    assert registry.model_agent_infos() == [
        {
            "id": "mccfr_2p_10k",
            "name": "MCCFR 2P 10K",
            "type": "mccfr",
            "configurable": False,
            "model": "models/mccfr_2p_10k.pkl",
        }
    ]


def test_model_registry_broken_index_is_empty(tmp_path):
    (tmp_path / "index.json").write_text("{ not json", encoding="utf-8")
    registry = ModelRegistry(model_dir=tmp_path)
    assert registry.list_models() == []


def test_model_registry_missing_file_raises(tmp_path):
    registry = ModelRegistry(model_dir=tmp_path)
    with pytest.raises(ModelLoadError):
        registry.get_trainer(str(tmp_path / "nope.pkl"))


def test_agents_endpoint_works_without_index(client):
    """目录里没有 index.json 时 /agents 也必须 200（返回通用 mccfr 条目）。"""
    body = client.get(f"{BASE}/agents").json()["agents"]
    assert any(entry["type"] == "mccfr" for entry in body)


def test_no_decision_request_for_ai_seats(client):
    """核心不变量：HTTP 响应永远只代表人类座位的决策点。"""
    from game import Phase

    created = create_game(client, players=4, seed=99).json()
    game_id, view = created["game_id"], created["state"]
    session = store().get(game_id)

    # 人类不是决策者时，人类视角根本没有 legal_actions
    session.state.current_player = 1 if session.human_player_id != 1 else 2
    session.state.phase = Phase.ACTION
    session._rebuild_actions()
    view_ai = session.view_for(session.human_player_id)
    assert view_ai["decision_player"] != session.human_player_id
    assert view_ai["legal_actions"] == []

    session.run_ai_until_human()
    assert session.is_terminal() or session.state.decision_player() == session.human_player_id

    # HTTP 层：GET 回来的视图同样是人类视角，且不会给出「替别人决策」的机会
    got = client.get(f"{BASE}/games/{game_id}").json()
    assert got["viewer_player_id"] == 0
    assert got["status"] == "ended" or got["decision_player"] == 0
    assert store().get(game_id).human_player_id == 0
    client.delete(f"{BASE}/games/{game_id}")


def test_agents_default_seats(client):
    """未指定 agents 的玩家数也必须能开局（3 人默认配置）。"""
    resp = create_game(client, players=3, agents=default_agents(3))
    assert resp.status_code == 200
    body = resp.json()
    agents = {
        p["player_id"]: p["agent"] for p in body["state"]["public"]["players"]
    }
    assert agents[0] is None
    assert agents[1]["type"] == "rule"

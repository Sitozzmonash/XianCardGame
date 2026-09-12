"""完整一局 API 测试 + 4 种特殊决策覆盖 + 事件流（API_CONTRACT §11 §12 §13 §14）。

策略：
1. 「真打」——用与 `scripts/e2e_api.py` 相同的机器人跑完整局，断言终局 / revision /
   事件 / 特殊决策覆盖；
2. 「定向注入」——直接构造特殊 Phase 的 state，走真实 HTTP 路径把 4 种特殊决策
   （反制 / 摄物术选目标 / 逆天改命排序 / 天劫回插）逐个打一遍，不依赖抽牌运气。
"""

from __future__ import annotations

import pytest

from game import Action, ActionKind, Card, Phase

from test_api_support import (
    BASE,
    EVENT_TYPES,
    create_game,
    new_client,
    play_game,
    reset_backend,
    special_groups_hit,
    store,
)


@pytest.fixture()
def client():
    reset_backend()
    with new_client() as c:
        yield c
    reset_backend()


# --------------------------------------------------------------- 「真打」完整局


def test_full_game_reaches_terminal(client):
    result = play_game(client, players=3, seed=20260912, max_steps=200)
    view = result["view"]

    assert view["status"] == "ended", f"一局未正常结束：{view['status']}"
    assert isinstance(view["winner"], int)
    assert 0 <= view["winner"] < 3
    assert view["decision_player"] == view["current_player"]
    assert view["revision"] > 1
    # 自然终局（而非 max_decisions 强制结束）
    ended = [ev for ev in view["events"] if ev["type"] == "GAME_ENDED"]
    assert ended, "终局必须发 GAME_ENDED"
    assert ended[-1]["data"]["forced_stop"] is False
    # 人类座位以外不发决策请求：每一步都停在人类座位
    assert result["decisions"] >= 1
    assert view["legal_actions"] == []


def test_full_game_4_players(client):
    result = play_game(client, players=4, seed=20260912, max_steps=200)
    assert result["view"]["status"] == "ended"
    assert isinstance(result["view"]["winner"], int)


@pytest.mark.parametrize("players", [2, 3])
def test_full_game_multiple_seeds(client, players):
    for seed in (11, 23):
        result = play_game(
            client,
            players=players,
            seed=seed,
            agents=[None] + [{"type": "rule"}] * (players - 1),
            max_steps=250,
        )
        assert result["view"]["status"] == "ended"
        assert result["view"]["revision"] > 1


def test_special_decisions_covered_across_games(client):
    """4 种特殊决策都要被真实走通（跨多局汇总）。"""
    hits: set = set()
    for seed in (20260912, 20260912 + 977, 20260912 + 1954):
        result = play_game(client, players=3, seed=seed, max_steps=250)
        hits |= special_groups_hit(result["specials"])
    assert hits == {
        "COUNTER",
        "PLAY_CARD_TARGET",
        "REORDER_TOP",
        "REINSERT_TRIBULATION",
    }, f"特殊决策覆盖不全：{sorted(hits)}"


def test_events_are_structured_and_sequential(client):
    result = play_game(client, players=3, seed=20260912, max_steps=250)
    events = result["events"]
    assert events, "整局必须至少产出事件"
    assert events[0]["type"] == "GAME_STARTED"

    seqs = [ev["seq"] for ev in events]
    assert seqs == sorted(seqs), "seq 必须单调递增"
    assert seqs[0] == 1, "seq 从 1 开始"

    actors = set()
    for ev in events:
        assert set(ev) == {"seq", "type", "actor", "data"}
        assert ev["type"] in EVENT_TYPES, f"未约定的事件类型：{ev['type']}"
        assert isinstance(ev["data"], dict)
        actors.add(ev["actor"])
    # AI 的行动也必须产生事件（一次请求可能返回多个事件）
    assert 1 in actors or 2 in actors

    assert {"TURN_STARTED", "TURN_ENDED", "GAME_ENDED"} <= {ev["type"] for ev in events}


def test_single_action_response_can_contain_ai_events(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, view = created["game_id"], created["state"]
    if view["status"] == "ended":
        pytest.skip("开局即终局")

    from test_api_support import bot_pick

    action_id, payload = bot_pick(view, 1)
    resp = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"], "action_id": action_id, "payload": payload},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["events"], "每次状态变化都必须至少产出一条事件"
    assert body["revision"] > view["revision"]
    # 事件 seq 严格递增
    seqs = [ev["seq"] for ev in body["events"]]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)


def test_get_returns_latest_view(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, view = created["game_id"], created["state"]
    if view["status"] == "ended":
        pytest.skip("开局即终局")

    from test_api_support import bot_pick

    action_id, payload = bot_pick(view, 1)
    posted = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"], "action_id": action_id, "payload": payload},
    ).json()

    got = client.get(f"{BASE}/games/{game_id}").json()
    assert got["revision"] == posted["revision"]
    assert got["status"] == posted["status"]
    assert got["decision_player"] == posted["decision_player"]
    assert got["viewer_player_id"] == 0


def test_action_after_game_end_409(client):
    game_id, session = _force(client, players=2, seed=11)
    session.state.phase = Phase.ENDED
    session.state.winner = 0
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    assert view["status"] == "ended"
    assert view["legal_actions"] == []

    resp = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"], "action_id": "a_any", "payload": {}},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "GAME_ENDED"


# ------------------------------------------------------- 定向注入：4 种特殊决策


def _force(client, players=3, seed=20260912):
    """建一局并把 session 拿出来（测试内部用：注入特殊 Phase）。"""
    created = create_game(client, players=players, seed=seed).json()
    return created["game_id"], store().get(created["game_id"])


def _post(client, game_id, session, action_id, payload):
    return client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": session.revision, "action_id": action_id, "payload": payload},
    )


def _entry(view, action_type):
    for action in view["legal_actions"]:
        if action["type"] == action_type:
            return action
    return None


def test_reorder_top_decision_over_http(client):
    game_id, session = _force(client)
    state = session.state
    if len(state.deck) < 3:
        pytest.skip("牌堆不足 3 张")

    state.phase = Phase.REORDER
    state.reorder_owner = 0
    state.reorder_view = list(state.deck[:3])
    state.known_top[0] = list(state.reorder_view)
    state.current_player = 0
    state.actions_used = 0
    state.pending_actor = state.pending_target = None
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    assert view["phase"] == "REORDER_TOP"
    assert view["decision_player"] == 0

    private = view["observation"]["private_context"]
    assert private and len(private["cards"]) == 3
    tokens = [card["token"] for card in private["cards"]]
    assert tokens == ["private_1", "private_2", "private_3"]
    for card in private["cards"]:
        # 只暴露 token + card_id + name，绝不暴露真实 deck index
        assert set(card) == {"token", "card_id", "name"}

    action = _entry(view, "REORDER_TOP")
    assert action is not None
    assert action["params"]["order"]["type"] == "token_order"
    assert action["params"]["order"]["options"] == tokens
    assert action["card_instance_id"] is None

    resp = _post(client, game_id, session, action["id"], {"order": list(reversed(tokens))})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(ev["type"] == "DECK_REORDERED" for ev in body["events"])
    # 排序结果绝不回传
    for ev in body["events"]:
        if ev["type"] == "DECK_REORDERED":
            assert ev["data"] == {}
    assert body["phase"] in {"ACTION", "ENDED"}


def test_reinsert_tribulation_decision_over_http(client):
    game_id, session = _force(client)
    state = session.state
    state.phase = Phase.REINSERT
    state.reinsert_player = 0
    state.current_player = 0
    state.pending_actor = state.pending_target = None
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    assert view["phase"] == "REINSERT_TRIBULATION"
    assert view["decision_player"] == 0

    regions = sorted(
        entry["params"]["region"]["options"][0]
        for entry in view["legal_actions"]
        if entry["type"] == "REINSERT_TRIBULATION"
    )
    assert regions == ["BOTTOM", "MIDDLE", "NEAR_TOP", "TOP"]

    action = _entry(view, "REINSERT_TRIBULATION")
    resp = _post(client, game_id, session, action["id"], {"region": "BOTTOM"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(
        ev["type"] == "TRIBULATION_REINSERTED" and ev["data"]["region"] == "BOTTOM"
        for ev in body["events"]
    )
    # 插入位置只以「区域桶名」公开
    assert "deck_index" not in resp.text and "position" not in resp.text

    # session 层验证：回插确实把天劫放回了牌堆（不受随后 AI 抽牌干扰）
    _game_id2, session2 = _force(client)
    state2 = session2.state
    state2.phase = Phase.REINSERT
    state2.reinsert_player = 0
    deck_before = len(state2.deck)
    trib_before = state2.deck.count(Card.TRIBULATION)
    state2.step(Action(ActionKind.REINSERT, param="BOTTOM"))
    assert len(state2.deck) == deck_before + 1
    assert state2.deck.count(Card.TRIBULATION) == trib_before + 1
    assert state2.phase != Phase.REINSERT


def test_counter_and_pass_counter_decisions_over_http(client):
    # --- 反制：人类手里有反制符，Phase.COUNTER 等他决定
    game_id, session = _force(client)
    state = session.state
    state.hands[0].append(Card.COUNTER)
    state.phase = Phase.COUNTER
    state.pending_actor = 1
    state.pending_target = 0
    state.current_player = 1
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    assert view["phase"] == "COUNTER"
    assert view["decision_player"] == 0
    assert {a["type"] for a in view["legal_actions"]} == {"COUNTER", "PASS_COUNTER"}
    assert _entry(view, "COUNTER")["label"] == "使用反制符"
    assert _entry(view, "PASS_COUNTER")["label"] == "不反制"

    resp = _post(client, game_id, session, _entry(view, "COUNTER")["id"], {})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(ev["type"] == "COUNTER_USED" for ev in body["events"])
    assert not any(ev["type"] == "CARD_STOLEN" for ev in body["events"])
    assert body["phase"] in {"ACTION", "ENDED"}

    # --- 不反制：人类手里没有反制符 → 只能 PASS，且被偷的牌面不得公开
    game_id2, session2 = _force(client)
    state2 = session2.state
    while Card.COUNTER in state2.hands[0]:
        state2.hands[0].remove(Card.COUNTER)
    state2.hands[1].append(Card.DEFUSE)  # 保证被偷方有牌
    state2.phase = Phase.COUNTER
    state2.pending_actor = 1
    state2.pending_target = 0
    state2.current_player = 1
    session2._rebuild_actions()

    view2 = client.get(f"{BASE}/games/{game_id2}").json()
    assert {a["type"] for a in view2["legal_actions"]} == {"PASS_COUNTER"}
    resp2 = _post(client, game_id2, session2, _entry(view2, "PASS_COUNTER")["id"], {})
    assert resp2.status_code == 200, resp2.text
    body2 = resp2.json()
    stolen = [ev for ev in body2["events"] if ev["type"] == "CARD_STOLEN"]
    assert stolen, "不反制必须产生 CARD_STOLEN"
    assert stolen[0]["actor"] == 1 and stolen[0]["data"]["target"] == 0
    assert "card_id" not in stolen[0]["data"], "被偷的牌面属于私有信息"


def test_play_card_target_decision_over_http(client):
    game_id, session = _force(client)
    state = session.state
    state.phase = Phase.ACTION
    state.current_player = 0
    state.actions_used = 0
    state.pending_actor = state.pending_target = None
    state.hands[0].append(Card.STEAL)
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    action = _entry(view, "PLAY_CARD_TARGET")
    assert action is not None, "手上有摄物术时必须给出 PLAY_CARD_TARGET"
    assert action["card_instance_id"].startswith("h_0_")
    options = action["params"]["target_player"]["options"]
    assert options and all(target != 0 for target in options)

    resp = _post(client, game_id, session, action["id"], {"target_player": options[0]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(
        ev["type"] == "COUNTER_OPENED" and ev["data"]["target"] == options[0]
        for ev in body["events"]
    )
    # 目标的反制决策由服务端自动跑完（AI 不会把决策甩给人类）
    assert body["status"] == "ended" or body["decision_player"] == 0

    # 越界目标 → 409
    game_id3, session3 = _force(client)
    session3.state.phase = Phase.ACTION
    session3.state.current_player = 0
    session3.state.actions_used = 0
    session3.state.hands[0].append(Card.STEAL)
    session3._rebuild_actions()
    view3 = client.get(f"{BASE}/games/{game_id3}").json()
    entry3 = _entry(view3, "PLAY_CARD_TARGET")
    bad = _post(client, game_id3, session3, entry3["id"], {"target_player": 0})
    assert bad.status_code == 409
    assert bad.json()["error"]["code"] == "INVALID_ACTION"


def test_play_card_peek_private_events(client):
    game_id, session = _force(client)
    state = session.state
    state.phase = Phase.ACTION
    state.current_player = 0
    state.actions_used = 0
    state.pending_actor = state.pending_target = None
    state.hands[0].append(Card.PEEK)
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    action = _entry(view, "PLAY_CARD")
    assert action is not None and action["card_instance_id"].startswith("h_0_")

    resp = _post(client, game_id, session, action["id"], {})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    peeked = [ev for ev in body["events"] if ev["type"] == "DECK_PEEKED"]
    assert peeked, "观星必须产生 DECK_PEEKED"
    assert peeked[0]["actor"] == 0
    # 自己看的牌自己可见（否则观星术就没有意义了）
    assert "cards" in peeked[0]["data"]
    assert len(peeked[0]["data"]["cards"]) <= 3
    for item in peeked[0]["data"]["cards"]:
        assert set(item) == {"position", "card_id", "name"}

    # 后续 AI 洗牌 / 抽牌会让「已知牌顶」失效，只有没被打断时才与事件一致
    invalidators = {"DECK_SHUFFLED", "DECK_REORDERED", "TRIBULATION_REINSERTED", "CARD_DRAWN"}
    if not any(ev["type"] in invalidators for ev in body["events"]):
        known = body["observation"]["known_top"]
        assert [item["card_id"] for item in known] == [
            item["card_id"] for item in peeked[0]["data"]["cards"]
        ]

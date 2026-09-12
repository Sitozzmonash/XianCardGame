"""隐藏信息泄漏测试（API_CONTRACT §8 §9 §13 §19 —— 强约束）。

断言口径（逐层）：

1. **字段白名单**：GameView / public / public.players / observation / legal_actions
   只允许契约里写死的字段（多一个都不行 —— 手牌泄漏的入口被堵死）；
2. **他人手牌 / 真实牌堆 / 他人观星结果**：把「上帝视角」的真实数据序列化成紧凑
   JSON 片段（如 `["DEFUSE","ESCAPE","STEAL"]`），断言它**不是**响应体的子串；
3. **observation 只含观众自己的信息**：hand 的多重集 == 自己真实手牌，known_top ==
   自己的已知牌顶，instance_id 必须是 `h_<自己座位>_<下标>`；
4. **事件**：他人观星只发 `CARD_PLAYED`（不带牌面）；`CARD_STOLEN` 不带被偷的牌；
   `DECK_REORDERED` 不带顺序；
5. **调试日志**：上游 `state.logs` 里有「（调试可见：天劫）」这类泄漏，绝不能下发；
6. **错误响应**：409/404 的错误体里不能夹带局面信息；
7. **检测器自检**：人为注入一个泄漏，检测函数必须能抓到（防止断言空转）。
"""

from __future__ import annotations

import pytest

from game import API_CARD_ID, Action, ActionKind, Card, GameConfig, GameState, Phase

from test_api_support import (
    BASE,
    GAMEVIEW_KEYS,
    LEGAL_ACTION_KEYS,
    OBSERVATION_KEYS,
    PLAYER_PUBLIC_KEYS,
    PUBLIC_KEYS,
    bot_pick,
    compact,
    create_game,
    hidden_hand_fragments,
    new_client,
    reset_backend,
    store,
)

#: 他人事件里绝不允许出现的键
FORBIDDEN_EVENT_KEYS = ("known_top", "seen_cards", "peeked", "revealed", "cards", "card_ids")

#: 响应体里绝不允许出现的可疑字段名
FORBIDDEN_SUBSTRINGS = (
    "deck_order",
    "full_deck",
    "opponent_hand",
    "hidden_hand",
    "all_hands",
    "logs",
)


@pytest.fixture()
def client():
    reset_backend()
    with new_client() as c:
        yield c
    reset_backend()


# --------------------------------------------------------------------- 检查器


def assert_view_is_clean(session, seat: int, view: dict) -> None:
    """对单个 GameView 做全量泄漏检查（含与上帝视角的真实状态逐一比对）。"""
    blob = compact(view)
    state = session.state

    # 1. 字段白名单
    assert set(view) == GAMEVIEW_KEYS, f"GameView 字段越界：{sorted(set(view) - GAMEVIEW_KEYS)}"
    assert set(view["observation"]) == OBSERVATION_KEYS, "Observation 字段越界"
    assert set(view["public"]) == PUBLIC_KEYS, "public 字段越界"
    for player in view["public"]["players"]:
        assert set(player) == PLAYER_PUBLIC_KEYS, "PlayerPublicView 字段越界（手牌泄漏入口）"
        assert "hand" not in player and "cards" not in player
    for action in view["legal_actions"]:
        assert set(action) == LEGAL_ACTION_KEYS, "LegalAction 字段越界"

    # 2. 上帝视角数据不得作为子串出现
    for label, fragment in hidden_hand_fragments(state, seat):
        assert fragment not in blob, f"响应体泄漏：{label} -> {fragment}"
    for bad in FORBIDDEN_SUBSTRINGS:
        assert bad not in blob, f"响应体包含未约定字段名：{bad}"

    # 5. 上游调试日志（含「调试可见：<牌名>」）绝不能外传
    assert "调试可见" not in blob
    assert "手牌数=" not in blob

    # 3. observation 只含观众自己的信息
    hand = view["observation"]["hand"]
    assert [card["instance_id"] for card in hand] == [
        f"h_{seat}_{index}" for index in range(len(hand))
    ], "hand.instance_id 必须形如 h_<seat>_<index>"
    assert sorted(card["card_id"] for card in hand) == sorted(
        API_CARD_ID[card] for card in state.hands[seat]
    ), "observation.hand 与观众真实手牌不一致"
    assert [item["card_id"] for item in view["observation"]["known_top"]] == [
        API_CARD_ID[card] for card in state.known_top[seat]
    ], "observation.known_top 掺入了别人的观星结果"

    # 手牌数可以公开，牌面绝不行
    for player in view["public"]["players"]:
        seat_id = player["player_id"]
        assert player["hand_count"] == len(state.hands[seat_id])

    # 4. 事件
    for event in view["events"]:
        assert set(event) == {"seq", "type", "actor", "data"}
        data = event["data"] or {}
        if event["actor"] != seat:
            if event["type"] == "DECK_PEEKED":
                for key in ("cards", "card_ids", "known_top"):
                    assert key not in data, f"他人观星事件泄漏牌面：{event}"
            if event["type"] == "CARD_PLAYED":
                for key in ("seen_cards", "peeked", "known_top", "revealed"):
                    assert key not in data, f"他人出牌事件泄漏牌面：{event}"
            for key in ("opponent_hand", "all_hands"):
                assert key not in data
        if event["type"] == "CARD_STOLEN":
            assert "card_id" not in data and "cards" not in data, "被偷的牌面属于私有信息"
        if event["type"] == "DECK_REORDERED":
            assert data == {}, "排序结果不得回传"


def play_and_check_every_step(client, *, players: int, seed: int, max_steps: int = 200) -> dict:
    """真打一局，POST / GET 的每个 GameView 都过一遍泄漏检查。"""
    created = create_game(client, players=players, seed=seed).json()
    game_id, seat, view = created["game_id"], created["player_id"], created["state"]
    session = store().get(game_id)

    steps = 0
    while steps < max_steps:
        steps += 1
        assert_view_is_clean(session, seat, view)
        if view["status"] == "ended":
            break
        action_id, payload = bot_pick(view, steps)
        resp = client.post(
            f"{BASE}/games/{game_id}/actions",
            json={"revision": view["revision"], "action_id": action_id, "payload": payload},
        )
        assert resp.status_code == 200, resp.text
        view = resp.json()

        got = client.get(f"{BASE}/games/{game_id}")
        assert got.status_code == 200
        assert_view_is_clean(session, seat, got.json())

    client.delete(f"{BASE}/games/{game_id}")
    return {"view": view, "steps": steps}


# -------------------------------------------------------------------- 真打整局


def test_no_hidden_information_leaks_during_full_game(client):
    result = play_and_check_every_step(client, players=3, seed=20260912)
    assert result["steps"] >= 1
    assert result["view"]["status"] == "ended"


def test_no_hidden_information_leaks_4_players(client):
    play_and_check_every_step(client, players=4, seed=20260912, max_steps=250)


def test_no_hidden_information_leaks_many_seeds(client):
    for seed in (11, 23, 20260912 + 977):
        play_and_check_every_step(client, players=3, seed=seed, max_steps=250)


def test_no_hidden_information_leaks_2_players(client):
    play_and_check_every_step(client, players=2, seed=20260912, max_steps=250)


# --------------------------------------------------------------- 定向：他人观星


def test_other_player_peek_stays_private(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, seat = created["game_id"], created["player_id"]
    session = store().get(game_id)
    state = session.state

    # 让 AI 座位 1 真的观星（走 session 的正规推进路径，事件流照常产出）
    state.current_player = 1
    state.phase = Phase.ACTION
    state.actions_used = 0
    state.hands[1].append(Card.PEEK)
    session._apply(Action(ActionKind.PLAY_PEEK), 1)
    assert state.known_top[1], "前置条件：AI 必须看到了牌堆顶部"

    resp = client.get(f"{BASE}/games/{game_id}")
    view = resp.json()

    # 人类视角：什么都没看到
    assert view["observation"]["known_top"] == []
    # 他人观星事件不带牌面
    peeked = [ev for ev in view["events"] if ev["type"] == "DECK_PEEKED"]
    assert peeked and all(ev["actor"] == 1 for ev in peeked)
    for event in peeked:
        assert "cards" not in event["data"] and "card_ids" not in event["data"]
    # 响应体里不能出现「P1 看到的那几张牌」
    blob = compact(view)
    assert compact([API_CARD_ID[card] for card in state.known_top[1]]) not in blob
    assert_view_is_clean(session, seat, view)


def test_reorder_private_context_has_no_deck_index(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, seat = created["game_id"], created["player_id"]
    session = store().get(game_id)
    state = session.state
    if len(state.deck) < 3:
        pytest.skip("牌堆不足 3 张")

    state.phase = Phase.REORDER
    state.reorder_owner = 0
    state.reorder_view = list(state.deck[:3])
    state.known_top[0] = list(state.reorder_view)
    state.current_player = 0
    session._rebuild_actions()

    resp = client.get(f"{BASE}/games/{game_id}")
    view = resp.json()
    cards = view["observation"]["private_context"]["cards"]
    assert [card["token"] for card in cards] == ["private_1", "private_2", "private_3"]
    for card in cards:
        assert set(card) == {"token", "card_id", "name"}, (
            "private_context 只允许 token/card_id/name（不得带 deck index）"
        )
    assert "deck_index" not in resp.text
    reorder = next(a for a in view["legal_actions"] if a["type"] == "REORDER_TOP")
    assert reorder["params"]["order"]["options"] == ["private_1", "private_2", "private_3"]
    assert_view_is_clean(session, seat, view)


def test_stolen_card_face_is_private(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, seat = created["game_id"], created["player_id"]
    session = store().get(game_id)
    state = session.state

    while Card.COUNTER in state.hands[0]:
        state.hands[0].remove(Card.COUNTER)
    victim_cards = list(state.hands[0])
    state.phase = Phase.COUNTER
    state.pending_actor = 1
    state.pending_target = 0
    state.current_player = 1
    session._rebuild_actions()

    view = client.get(f"{BASE}/games/{game_id}").json()
    pass_entry = next(a for a in view["legal_actions"] if a["type"] == "PASS_COUNTER")
    resp = client.post(
        f"{BASE}/games/{game_id}/actions",
        json={"revision": view["revision"], "action_id": pass_entry["id"], "payload": {}},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    stolen = [ev for ev in body["events"] if ev["type"] == "CARD_STOLEN"]
    assert stolen and stolen[0]["data"] == {"target": 0}
    assert "card_id" not in stolen[0]["data"]

    # 被偷的牌进入了 P1 的手牌：人类响应里不得出现 P1 手牌内容
    blob = compact(body)
    assert compact([API_CARD_ID[card] for card in session.state.hands[1]]) not in blob
    assert_view_is_clean(session, seat, body)


def test_error_responses_carry_no_state(client):
    created = create_game(client, players=3, seed=20260912).json()
    game_id, view = created["game_id"], created["state"]

    if view["status"] != "ended":
        stale = client.post(
            f"{BASE}/games/{game_id}/actions",
            json={
                "revision": view["revision"] - 1,
                "action_id": view["legal_actions"][0]["id"],
                "payload": {},
            },
        )
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "STALE_REVISION"
        assert stale.json()["error"]["details"] == {}
        assert set(stale.json()) == {"error"}
        assert "observation" not in stale.text and "legal_actions" not in stale.text

        bad = client.post(
            f"{BASE}/games/{game_id}/actions",
            json={"revision": view["revision"], "action_id": "a_nope", "payload": {}},
        )
        assert bad.status_code == 409
        assert "observation" not in bad.text

    not_found = client.get(f"{BASE}/games/{game_id}-missing")
    assert not_found.status_code == 404
    assert "observation" not in not_found.text


# --------------------------------------------------------------------- 自检


def test_leak_detector_is_not_vacuous():
    """注入一个真实泄漏，检测函数必须抓到（证明上面的断言不是空转）。"""
    state = GameState(GameConfig(num_players=3, seed=5), 5)
    leaky = {
        "game_id": "leaky",
        "observation": {"hand": []},
        "debug": {
            "deck_order": [API_CARD_ID[card] for card in state.deck],
            "opponent_hand": [API_CARD_ID[card] for card in state.hands[1]],
            "all_hands": [[API_CARD_ID[card] for card in hand] for hand in state.hands],
        },
    }
    blob = compact(leaky)

    caught = [label for label, fragment in hidden_hand_fragments(state, 0) if fragment in blob]
    assert any("牌堆" in label for label in caught), "检测器漏掉了真实牌堆泄漏"
    assert any("P1 手牌" in label for label in caught), "检测器漏掉了他人手牌泄漏"
    for bad in ("deck_order", "opponent_hand", "all_hands"):
        assert bad in blob  # 与 e2e_api.py 的 FORBIDDEN_SUBSTRINGS 同款检查一致


# ------------------------------------------------------- 上游多余字段必须被投影掉


def test_upstream_extra_public_fields_are_stripped(client, monkeypatch):
    """上游 `public_state()` 若附加便利字段（deck_size / hand_sizes / alive /
    甚至手牌明细），app 层必须投影掉 —— `public` 只留 5 个规范键。"""
    created = create_game(client, players=3, seed=20260912).json()
    game_id = created["game_id"]
    session = store().get(game_id)
    real_public = GameState.public_state

    def polluted(self, player):
        data = dict(real_public(self, player))
        data.update(
            {
                "deck_size": len(self.deck),
                "hand_sizes": [len(hand) for hand in self.hands],
                "alive": list(self.alive),
                "deck_order": [API_CARD_ID[card] for card in self.deck],
                "all_hands": [[API_CARD_ID[card] for card in hand] for hand in self.hands],
            }
        )
        return data

    monkeypatch.setattr(GameState, "public_state", polluted)
    view = client.get(f"{BASE}/games/{game_id}").json()

    assert set(view["public"]) == PUBLIC_KEYS, "public 必须严格 5 个键"
    for player in view["public"]["players"]:
        assert set(player) == PLAYER_PUBLIC_KEYS, "PlayerPublicView 必须严格 7 个键"
    blob = compact(view)
    assert "deck_size" not in blob and "hand_sizes" not in blob
    assert compact([API_CARD_ID[card] for card in session.state.deck]) not in blob


def test_upstream_extra_observation_fields_are_stripped(client, monkeypatch):
    """上游 `observation()` 若附加调试字段，app 层必须投影掉。"""
    created = create_game(client, players=3, seed=20260912).json()
    game_id = created["game_id"]
    real_observation = GameState.observation

    def polluted(self, player):
        data = dict(real_observation(self, player))
        data.update(
            {
                "deck_size": len(self.deck),
                "hand_sizes": [len(hand) for hand in self.hands],
                "all_hands": [[API_CARD_ID[card] for card in hand] for hand in self.hands],
            }
        )
        return data

    monkeypatch.setattr(GameState, "observation", polluted)
    view = client.get(f"{BASE}/games/{game_id}").json()

    assert set(view["observation"]) == OBSERVATION_KEYS, "Observation 必须严格 5 个键"
    for card in view["observation"]["hand"]:
        assert set(card) == {"instance_id", "card_id", "name"}
    for item in view["observation"]["known_top"]:
        assert set(item) == {"position", "card_id", "name"}
    assert "all_hands" not in compact(view) and "hand_sizes" not in compact(view)


def test_upstream_extra_legal_action_fields_are_stripped(client, monkeypatch):
    """LegalAction 也必须投影成 6 个键（不许透传上游新加的字段）。"""
    created = create_game(client, players=3, seed=20260912).json()
    game_id = created["game_id"]
    session = store().get(game_id)
    real_dicts = GameState.legal_action_dicts

    def polluted(self, player):
        entries = []
        for entry in real_dicts(self, player):
            item = dict(entry)
            item["debug_deck_top"] = [API_CARD_ID[card] for card in self.deck[:3]]
            entries.append(item)
        return entries

    monkeypatch.setattr(GameState, "legal_action_dicts", polluted)
    # 强制人类处于决策点，保证 legal_actions 非空
    session.state.current_player = session.human_player_id
    session._rebuild_actions()
    got = client.get(f"{BASE}/games/{game_id}").json()
    for action in got["legal_actions"]:
        assert set(action) == LEGAL_ACTION_KEYS
    assert "debug_deck_top" not in compact(got)

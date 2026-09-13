"""Observation / public_state / legal_action_dicts 契约测试（§1.6 / §1.7 / API §7-§12）。

重点：**不泄露隐藏信息** + private token 绝不暴露真实 deck index。
"""

from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from game.actions import Action, ActionKind  # noqa: E402
from game.cards import API_CARD_ID, CARD_BY_API_ID, Card  # noqa: E402
from game.config import GameConfig  # noqa: E402
from game.state import GameState, Phase  # noqa: E402


def _fresh(num_players: int = 3, seed: int = 42, **kwargs) -> GameState:
    return GameState(GameConfig(num_players=num_players, seed=seed, **kwargs), seed=seed)


def _ids(cards) -> list[str]:
    return [API_CARD_ID[c] for c in cards]


# ------------------------------------------------------------------ observation


def test_observation_structure_matches_contract():
    state = _fresh(seed=42)
    obs = state.observation(0)
    assert set(obs) == {
        "hand",
        "known_top",
        "actions_used",
        "max_actions_per_turn",
        "private_context",
    }
    assert obs["actions_used"] == state.actions_used
    assert obs["max_actions_per_turn"] == state.config.max_actions_per_turn
    assert obs["private_context"] is None

    # instance_id 规则：h_{player}_{index}
    for index, entry in enumerate(obs["hand"]):
        assert entry["instance_id"] == f"h_0_{index}"
        assert set(entry) == {"instance_id", "card_id", "name"}
        assert CARD_BY_API_ID[entry["card_id"]].value == entry["name"]
    assert [e["card_id"] for e in obs["hand"]] == _ids(state.hands[0])


def test_observation_known_top_positions_and_own_only():
    state = _fresh(seed=7)
    p = state.current_player
    state.hands[p] = [Card.PEEK]
    state.step(Action(ActionKind.PLAY_PEEK))
    obs = state.observation(p)
    assert [e["position"] for e in obs["known_top"]] == list(
        range(len(state.known_top[p]))
    )
    assert [e["card_id"] for e in obs["known_top"]] == _ids(state.known_top[p])
    # 其他玩家的观星结果不属于自己
    other = (p + 1) % 3
    state.known_top[other] = [Card.TRIBULATION]
    assert [e["card_id"] for e in state.observation(p)["known_top"]] == _ids(
        state.known_top[p]
    )


def test_observation_never_leaks_hidden_information():
    """observation 里出现的卡 id 必须恰好等于"自己手牌 + 自己已知牌顶 + 私有上下文"。"""
    for seed in range(20):
        state = _fresh(seed=seed)
        rng = random.Random(seed)
        while not state.is_terminal():
            for player in range(state.num_players):
                if not state.alive[player]:
                    continue
                obs = state.observation(player)
                visible = [e["card_id"] for e in obs["hand"]]
                visible += [e["card_id"] for e in obs["known_top"]]
                if obs["private_context"]:
                    visible += [e["card_id"] for e in obs["private_context"]["cards"]]

                expected = _ids(state.hands[player])
                expected += _ids(state.known_top[player])
                if (
                    state.phase == Phase.REORDER
                    and state.reorder_owner == player
                ):
                    expected += _ids(state.reorder_view)

                assert sorted(visible) == sorted(expected), (seed, player, visible, expected)
                # 该断言等价于："完全没见过的牌堆顺序 / 他人手牌 / 他人观星结果不会出现"：
                # 一旦泄露，visible 就会多出不在 expected 里的 card_id。
                assert "deck" not in obs and "players" not in obs
                json.dumps(obs)  # 必须可 JSON 序列化
            state.step(rng.choice(state.legal_actions()))


def test_observation_private_context_only_for_reorder_owner():
    state = _fresh(seed=31)
    owner = state.current_player
    state.hands[owner] = [Card.REORDER]
    state.step(Action(ActionKind.PLAY_REORDER))
    assert state.phase == Phase.REORDER

    owner_obs = state.observation(owner)
    ctx = owner_obs["private_context"]
    assert ctx is not None
    tokens = [e["token"] for e in ctx["cards"]]
    assert tokens == ["private_1", "private_2", "private_3"]
    assert [e["card_id"] for e in ctx["cards"]] == _ids(state.reorder_view)
    assert set(ctx["cards"][0]) == {"token", "card_id", "name"}

    for other in range(state.num_players):
        if other != owner:
            assert state.observation(other)["private_context"] is None


def test_observation_private_context_after_peek():
    """规则改动：观星术现在也会进入 REORDER，因此同样下发 private_context。"""
    state = _fresh(seed=31)
    owner = state.current_player
    state.hands[owner] = [Card.PEEK]
    state.step(Action(ActionKind.PLAY_PEEK))
    assert state.phase == Phase.REORDER

    ctx = state.observation(owner)["private_context"]
    assert ctx is not None
    assert [e["token"] for e in ctx["cards"]] == ["private_1", "private_2", "private_3"]
    assert [e["card_id"] for e in ctx["cards"]] == _ids(state.reorder_view)
    for other in range(state.num_players):
        if other != owner:
            assert state.observation(other)["private_context"] is None


# ------------------------------------------------------------------ public_state


def test_public_state_is_exactly_the_frozen_whitelist():
    """冻结白名单：public_state 只允许 5 个键，players[] 每项只允许 7 个键。"""
    state = _fresh(num_players=4, seed=43)
    public = state.public_state(0)
    assert set(public) == {
        "round",
        "deck_count",
        "discard_count",
        "players",
        "turn_no",
    }
    assert public["round"] == state.turn_no
    assert public["turn_no"] == state.turn_no
    assert public["deck_count"] == len(state.deck)
    assert public["discard_count"] == len(state.discard)
    # 不允许出现同义/多余字段
    for forbidden in ("deck_size", "hand_sizes", "alive", "deck_order", "all_hands", "hands"):
        assert forbidden not in public
    assert len(public["players"]) == 4
    for i, entry in enumerate(public["players"]):
        assert set(entry) == {
            "player_id",
            "name",
            "alive",
            "hand_count",
            "is_current",
            "is_decision_player",
            "agent",
        }
        assert entry["player_id"] == i
        assert entry["hand_count"] == len(state.hands[i])  # 手牌数公开、手牌内容不公开
        assert entry["alive"] is True
        assert entry["is_current"] == (i == state.current_player)
        assert entry["is_decision_player"] == (i == state.decision_player())
        assert isinstance(entry["name"], str) and entry["name"]
    serialized = json.dumps(public, ensure_ascii=False)
    for card in Card:
        assert card.value not in serialized  # 不能出现任何牌名
    assert state.public_state(1) == public  # 公共信息对所有 viewer 一致


def test_debug_public_state_carries_flat_public_fields_only():
    state = _fresh(num_players=3, seed=44)
    debug = state.debug_public_state(0)
    assert set(debug) == {
        "round",
        "deck_count",
        "discard_count",
        "players",
        "turn_no",
        "deck_size",
        "hand_sizes",
        "alive",
    }
    assert debug["deck_size"] == len(state.deck)
    assert debug["hand_sizes"] == [len(h) for h in state.hands]
    assert debug["alive"] == list(state.alive)
    # 仍然不允许出现任何牌面
    serialized = json.dumps(debug, ensure_ascii=False)
    for card in Card:
        assert card.value not in serialized


# --------------------------------------------------------- legal_action_dicts


def test_legal_action_dicts_structure_and_ids():
    state = _fresh(seed=42)
    player = state.decision_player()
    entries = state.legal_action_dicts(player)
    legal = state.legal_actions()
    assert len(entries) == len(legal)  # 行动阶段 1:1
    ids = [entry["id"] for entry in entries]
    assert all(re.fullmatch(r"a_[0-9a-f]{8}", i) for i in ids)
    assert len(set(ids)) == len(ids)
    assert ids == [action.action_id() for action in legal]
    for entry in entries:
        assert set(entry) == {
            "id",
            "type",
            "label",
            "enabled",
            "card_instance_id",
            "params",
        }
        assert entry["enabled"] is True
        assert isinstance(entry["label"], str) and entry["label"]
    # 同一 revision 内重复调用稳定
    assert state.legal_action_dicts(player) == entries
    # 非决策玩家 / 终局 -> 空
    assert state.legal_action_dicts((player + 1) % 3) == []
    state.winner = player
    state.phase = Phase.ENDED
    assert state.legal_action_dicts(player) == []


def test_legal_action_dicts_card_instance_ids_and_labels():
    state = _fresh(seed=42)
    player = state.decision_player()
    entries = {entry["type"]: entry for entry in state.legal_action_dicts(player)}
    assert entries["END_ACTION"]["label"] == "结束行动并抽牌"
    assert entries["END_ACTION"]["card_instance_id"] is None
    play_entries = [
        entry
        for entry in state.legal_action_dicts(player)
        if entry["type"] == "PLAY_CARD"
    ]
    for entry in play_entries:
        assert entry["card_instance_id"] is not None
        parts = entry["card_instance_id"].split("_")
        assert parts[0] == "h" and int(parts[1]) == player
        card = state.hands[player][int(parts[2])]
        assert entry["label"] == f"使用{card.value}"


def test_legal_action_dicts_steal_split_per_target():
    state = _fresh(seed=44)
    player = state.current_player
    state.hands[player] = [Card.STEAL, Card.SKIP]
    entries = [e for e in state.legal_action_dicts(player) if e["type"] == "PLAY_CARD_TARGET"]
    targets = sorted(
        e["params"]["target_player"]["options"][0] for e in entries
    )
    expected = sorted(
        a.target for a in state.legal_actions() if a.kind == ActionKind.PLAY_STEAL
    )
    assert targets == expected and len(entries) == len(expected)
    for entry in entries:
        assert entry["params"]["target_player"]["type"] == "enum"
        assert len(entry["params"]["target_player"]["options"]) == 1
        assert entry["label"].startswith("使用摄物术 → P")
    assert len({e["id"] for e in entries}) == len(entries)  # 每个目标一条、id 不同


def test_legal_action_dicts_reinsert_split_into_four():
    state = _fresh(seed=4)
    p = state.current_player
    state.hands[p] = [Card.DEFUSE]
    state.deck = [Card.TRIBULATION, Card.SKIP]
    state.step(Action(ActionKind.END_TURN))
    assert state.phase == Phase.REINSERT
    entries = state.legal_action_dicts(p)
    assert len(entries) == 4
    regions = [e["params"]["region"]["options"][0] for e in entries]
    assert regions == ["TOP", "NEAR_TOP", "MIDDLE", "BOTTOM"]
    assert all(e["type"] == "REINSERT_TRIBULATION" for e in entries)
    assert all(e["params"]["region"]["type"] == "enum" for e in entries)
    for entry, label in zip(entries, ["牌堆顶", "靠近顶部", "牌堆中部", "牌堆底部"]):
        assert entry["label"] == f"回插：{label}"
    assert len({e["id"] for e in entries}) == 4


def test_legal_action_dicts_reorder_single_entry_with_private_tokens():
    state = _fresh(seed=31)
    owner = state.current_player
    state.hands[owner] = [Card.REORDER]
    state.step(Action(ActionKind.PLAY_REORDER))
    entries = state.legal_action_dicts(owner)
    assert len(entries) == 1  # 一条，而不是 3! 条
    entry = entries[0]
    assert entry["type"] == "REORDER_TOP"
    assert entry["label"] == "调整顶部牌序"
    assert entry["card_instance_id"] is None
    assert set(entry["params"]) == {"order"}
    assert entry["params"]["order"]["type"] == "token_order"
    tokens = entry["params"]["order"]["options"]
    assert tokens == ["private_1", "private_2", "private_3"]
    # 与 observation 的 private_context 完全一致
    obs_tokens = [c["token"] for c in state.observation(owner)["private_context"]["cards"]]
    assert tokens == obs_tokens
    # 绝不暴露真实 deck index：options 全部是 token 字符串，且不含牌面/下标
    assert all(re.fullmatch(r"private_\d+", t) for t in tokens)
    assert not any(isinstance(t, int) for t in tokens)
    raw = json.dumps(entry)
    assert str(state.deck[0].value) not in raw
    # 真实 index 并未出现在 payload 里（0/1/2 只作为 token 后缀出现）
    assert set(re.findall(r"private_(\d+)", raw)) == {"1", "2", "3"}

    # 其他玩家可以看到"有人在使用改命"，但拿不到 token 映射
    assert state.legal_action_dicts((owner + 1) % 3) == []
    assert state.observation((owner + 1) % 3)["private_context"] is None


def test_action_from_dict_round_trip_every_entry():
    for seed in range(12):
        state = _fresh(seed=seed)
        rng = random.Random(seed)
        while not state.is_terminal():
            player = state.decision_player()
            legal = state.legal_actions()
            for entry in state.legal_action_dicts(player):
                action = state.action_from_dict(entry)
                if entry["type"] == "REORDER_TOP":
                    # 默认（恒等 token 顺序）必须是合法动作
                    assert action in legal
                    continue
                assert action in legal, (entry, action, [str(a) for a in legal])
            state.step(rng.choice(legal))


def test_action_from_dict_reorder_tokens_map_to_real_permutation():
    state = _fresh(seed=31)
    owner = state.current_player
    state.hands[owner] = [Card.REORDER]
    view = list(state.deck[:3])
    state.step(Action(ActionKind.PLAY_REORDER))
    entry = state.legal_action_dicts(owner)[0]
    tokens = entry["params"]["order"]["options"]

    # 提交 private_3, private_1, private_2 -> 排列 2,0,1
    action = state.action_from_dict(entry, {"order": [tokens[2], tokens[0], tokens[1]]})
    assert action == Action(ActionKind.REORDER_TOP, param="201")
    assert action in state.legal_actions()
    state.step(action)
    assert state.deck[:3] == [view[2], view[0], view[1]]

    with pytest.raises(ValueError):
        state.action_from_dict(entry, {"order": ["private_9"]})


def test_action_from_dict_reinsert_and_target_payload():
    state = _fresh(seed=4)
    p = state.current_player
    state.hands[p] = [Card.DEFUSE]
    state.deck = [Card.TRIBULATION, Card.SKIP]
    state.step(Action(ActionKind.END_TURN))
    entry = state.legal_action_dicts(p)[2]
    action = state.action_from_dict(entry)
    assert action == Action(ActionKind.REINSERT, param="MIDDLE")
    assert action in state.legal_actions()
    assert state.action_from_dict(entry, {"region": "BOTTOM"}) == Action(
        ActionKind.REINSERT, param="BOTTOM"
    )

    state2 = _fresh(seed=45)
    p2 = state2.current_player
    state2.hands[p2] = [Card.STEAL]
    entries = [e for e in state2.legal_action_dicts(p2) if e["type"] == "PLAY_CARD_TARGET"]
    for entry in entries:
        action = state2.action_from_dict(entry)
        assert action in state2.legal_actions()
        other = (entry["params"]["target_player"]["options"][0] + 1) % state2.num_players
        assert state2.action_from_dict(entry, {"target_player": other}) == Action(
            ActionKind.PLAY_STEAL, target=other
        )


def test_all_api_dicts_are_json_serializable():
    state = _fresh(seed=47)
    rng = random.Random(1)
    for _ in range(60):
        if state.is_terminal():
            break
        player = state.decision_player()
        json.dumps(
            {
                "observation": state.observation(player),
                "public": state.public_state(player),
                "legal_actions": state.legal_action_dicts(player),
            },
            ensure_ascii=False,
        )
        state.step(rng.choice(state.legal_actions()))

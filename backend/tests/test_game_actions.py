"""`game/actions.py` 契约测试（INTERFACES §1.3 / §1.7）。"""

from __future__ import annotations

import re

from game.actions import (
    API_ACTION_TYPE,
    ACTION_LABELS,
    CARD_TO_KIND,
    KIND_TO_CARD,
    REINSERT_REGIONS,
    Action,
    ActionKind,
    action_id,
)
from game.cards import Card

EXPECTED_TYPES = {
    ActionKind.END_TURN: "END_ACTION",
    ActionKind.PLAY_PEEK: "PLAY_CARD",
    ActionKind.PLAY_REORDER: "PLAY_CARD",
    ActionKind.PLAY_SHUFFLE: "PLAY_CARD",
    ActionKind.PLAY_SKIP: "PLAY_CARD",
    ActionKind.PLAY_STEAL: "PLAY_CARD_TARGET",
    ActionKind.PASS_COUNTER: "PASS_COUNTER",
    ActionKind.PLAY_COUNTER: "COUNTER",
    ActionKind.REORDER_TOP: "REORDER_TOP",
    ActionKind.REINSERT: "REINSERT_TRIBULATION",
}


def test_action_kind_members_english_values_chinese():
    assert [k.name for k in ActionKind] == [
        "END_TURN",
        "PLAY_PEEK",
        "PLAY_REORDER",
        "PLAY_SHUFFLE",
        "PLAY_SKIP",
        "PLAY_STEAL",
        "PASS_COUNTER",
        "PLAY_COUNTER",
        "REORDER_TOP",
        "REINSERT",
    ]
    assert ActionKind.END_TURN.value == "结束回合"
    assert ActionKind.REINSERT.value == "回插天劫"


def test_api_type_mapping_matches_frozen_table():
    assert API_ACTION_TYPE == EXPECTED_TYPES
    for kind, api_type in EXPECTED_TYPES.items():
        assert Action(kind).api_type() == api_type


def test_action_key_and_str_are_chinese_and_stable():
    assert Action(ActionKind.END_TURN).key() == "结束回合|-1|"
    assert Action(ActionKind.PLAY_STEAL, target=2).key() == "使用摄物术|2|"
    assert Action(ActionKind.REINSERT, param="TOP").key() == "回插天劫|-1|TOP"
    assert str(Action(ActionKind.END_TURN)) == "结束回合"
    assert str(Action(ActionKind.PLAY_STEAL, target=2)) == "使用摄物术(目标=P2)"
    assert str(Action(ActionKind.REORDER_TOP, param="102")) == "调整顶部牌序(102)"
    assert str(Action(ActionKind.PLAY_STEAL, target=1, param="x")) == "使用摄物术(目标=P1, x)"


def test_action_is_hashable_and_comparable():
    a = Action(ActionKind.PLAY_STEAL, target=1)
    b = Action(ActionKind.PLAY_STEAL, target=1)
    c = Action(ActionKind.PLAY_STEAL, target=2)
    assert a == b and hash(a) == hash(b)
    assert a != c
    assert len({a, b, c}) == 2
    assert a in [b]  # 合法动作校验依赖 `in`
    assert {Action(ActionKind.END_TURN): 1}[Action(ActionKind.END_TURN)] == 1


def test_action_id_is_blake2b_8_hex_and_stable():
    action = Action(ActionKind.PLAY_PEEK)
    ident = action.action_id()
    assert re.fullmatch(r"a_[0-9a-f]{8}", ident), ident
    assert ident == action_id(action) == action.action_id()
    # 内容不同 -> id 不同
    assert Action(ActionKind.PLAY_STEAL, target=1).action_id() != Action(
        ActionKind.PLAY_STEAL, target=2
    ).action_id()
    assert Action(ActionKind.REINSERT, param="TOP").action_id() != Action(
        ActionKind.REINSERT, param="MIDDLE"
    ).action_id()


def test_card_kind_tables_are_inverse():
    assert KIND_TO_CARD[ActionKind.PLAY_PEEK] is Card.PEEK
    assert KIND_TO_CARD[ActionKind.PLAY_STEAL] is Card.STEAL
    assert CARD_TO_KIND[Card.SHUFFLE] is ActionKind.PLAY_SHUFFLE
    for kind, card in KIND_TO_CARD.items():
        assert CARD_TO_KIND[card] is kind
    # 天劫 / 护劫符 / 反制符不是"行动阶段出牌"（反制符走 COUNTER 动作）
    assert Card.TRIBULATION not in CARD_TO_KIND
    assert Card.DEFUSE not in CARD_TO_KIND
    assert Card.COUNTER not in CARD_TO_KIND


def test_reinsert_regions_are_frozen():
    assert REINSERT_REGIONS == ("TOP", "NEAR_TOP", "MIDDLE", "BOTTOM")


def test_labels():
    assert ACTION_LABELS[ActionKind.END_TURN] == "结束行动并抽牌"
    assert ACTION_LABELS[ActionKind.PLAY_PEEK] == "使用观星术"
    assert ACTION_LABELS[ActionKind.PLAY_COUNTER] == "使用反制符"
    assert ACTION_LABELS[ActionKind.PASS_COUNTER] == "不反制"
    assert Action(ActionKind.PLAY_STEAL, target=2).label() == "使用摄物术 → P2"
    assert Action(ActionKind.REINSERT, param="TOP").label() == "回插：牌堆顶"
    assert Action(ActionKind.REINSERT, param="BOTTOM").label() == "回插：牌堆底部"

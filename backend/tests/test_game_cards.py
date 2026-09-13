"""`game/cards.py` 契约测试（INTERFACES §1.1 / §1.7）。"""

from __future__ import annotations

from game.cards import (
    API_CARD_ID,
    CARD_BY_API_ID,
    CARD_ORDER,
    CARD_SPECS,
    CARD_TO_INDEX,
    INDEX_TO_CARD,
    Card,
    CardSpec,
    alive_mask_from,
    card_spec,
    counts_vector,
)

#: §1.7 映射表（冻结）
EXPECTED = {
    Card.TRIBULATION: ("TRIBULATION", "天劫", "TRIBULATION", "tribulation"),
    Card.DEFUSE: ("DEFUSE", "护劫符", "DEFUSE", "defuse"),
    Card.PEEK: ("STARGAZING", "观星术", "ACTIVE", "stargazing"),
    Card.REORDER: ("REWRITE_FATE", "逆天改命", "ACTIVE", "rewrite_fate"),
    Card.SHUFFLE: ("SHUFFLE", "扰乱天机", "ACTIVE", "shuffle"),
    Card.SKIP: ("ESCAPE", "遁术", "REACTIVE", "escape"),
    Card.STEAL: ("STEAL", "摄物术", "ACTIVE", "steal"),
    Card.COUNTER: ("COUNTER", "反制符", "REACTIVE", "counter"),
}


def test_card_member_names_are_english_and_values_chinese():
    assert [c.name for c in Card] == [
        "TRIBULATION",
        "DEFUSE",
        "PEEK",
        "REORDER",
        "SHUFFLE",
        "SKIP",
        "STEAL",
        "COUNTER",
    ]
    assert [c.value for c in Card] == [
        "天劫",
        "护劫符",
        "观星术",
        "逆天改命",
        "扰乱天机",
        "遁术",
        "摄物术",
        "反制符",
    ]


def test_card_order_and_index_tables_are_frozen():
    assert len(CARD_ORDER) == 8
    assert CARD_ORDER[0] is Card.TRIBULATION
    assert CARD_ORDER[7] is Card.COUNTER
    assert [CARD_TO_INDEX[c] for c in CARD_ORDER] == list(range(8))
    for idx, card in INDEX_TO_CARD.items():
        assert CARD_TO_INDEX[card] == idx


def test_api_id_mapping_matches_frozen_table():
    assert len(API_CARD_ID) == 8
    assert len(set(API_CARD_ID.values())) == 8
    for card, (api_id, name, _category, _asset) in EXPECTED.items():
        assert API_CARD_ID[card] == api_id
        assert card.value == name
        assert CARD_BY_API_ID[api_id] is card


def test_card_specs_order_and_fields():
    assert len(CARD_SPECS) == 8
    assert all(isinstance(spec, CardSpec) for spec in CARD_SPECS)
    for card, (api_id, name, category, asset) in EXPECTED.items():
        spec = card_spec(card)
        assert spec.id == api_id
        assert spec.name == name
        assert spec.category == category
        assert spec.asset == asset
        assert spec.description.strip(), "每张牌必须有中文效果说明"

    # CARD_SPECS 顺序必须与 CARD_ORDER 一致
    assert [spec.id for spec in CARD_SPECS] == [API_CARD_ID[c] for c in CARD_ORDER]
    # asset 必须是小写下划线
    for spec in CARD_SPECS:
        assert spec.asset == spec.asset.lower()
        assert " " not in spec.asset and "-" not in spec.asset


def test_card_descriptions_follow_the_prototype_text():
    """三张改动牌的文案以用户提供的前端原型为准（docs/CARD_RULES_DELTA.md §1）。"""
    assert card_spec(Card.PEEK).description == "查看牌堆顶部最多 3 张牌，并重新调整顺序。"
    assert card_spec(Card.SKIP).description == "避开一次指向你的法术，并立即结束当前结算。"
    assert card_spec(Card.COUNTER).description == "反制一次指向你的法术，令其效果转向施术者。"
    # 摄物术的说明必须与新规则一致（反制是反弹，不是取消）
    assert "反弹" in card_spec(Card.STEAL).description
    assert "取消" not in card_spec(Card.STEAL).description
    # 遁术现在是反应牌
    assert card_spec(Card.SKIP).category == "REACTIVE"


def test_counts_vector_and_alive_mask():
    assert counts_vector([]) == (0,) * 8
    vec = counts_vector([Card.TRIBULATION, Card.TRIBULATION, Card.COUNTER])
    assert vec == (2, 0, 0, 0, 0, 0, 0, 1)
    assert sum(vec) == 3
    # 顺序无关（手牌顺序对决策无意义）
    assert counts_vector([Card.PEEK, Card.SKIP]) == counts_vector([Card.SKIP, Card.PEEK])
    assert alive_mask_from([True, False, True]) == 0b101
    assert alive_mask_from([False] * 6) == 0

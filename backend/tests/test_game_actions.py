"""`game/actions.py` 契约测试（INTERFACES §1.3 / §1.7）。"""

from __future__ import annotations

import re

import pytest

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
from game.config import GameConfig
from game.state import GameState, Phase

EXPECTED_TYPES = {
    ActionKind.END_TURN: "END_ACTION",
    ActionKind.PLAY_PEEK: "PLAY_CARD",
    ActionKind.PLAY_REORDER: "PLAY_CARD",
    ActionKind.PLAY_SHUFFLE: "PLAY_CARD",
    # 遁术改为反制阶段的反应牌 → 独立的 api type（docs/CARD_RULES_DELTA.md §2.2）
    ActionKind.PLAY_SKIP: "ESCAPE",
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
    assert KIND_TO_CARD[ActionKind.PLAY_SKIP] is Card.SKIP
    assert KIND_TO_CARD[ActionKind.PLAY_STEAL] is Card.STEAL
    assert CARD_TO_KIND[Card.SHUFFLE] is ActionKind.PLAY_SHUFFLE
    for kind, card in KIND_TO_CARD.items():
        assert CARD_TO_KIND[card] is kind
    # 天劫与护劫符没有「出牌类动作」（天劫不可主动使用、护劫符是自动生效的），不在表里。
    assert Card.TRIBULATION not in CARD_TO_KIND
    assert Card.DEFUSE not in CARD_TO_KIND
    # 反制符**在**表里（INTERFACES 附录 A15）：这张表回答的是「这个动作消耗哪张牌」，
    # 而它同时决定 ① legal_action_dicts() 要不要带 card_instance_id
    # ② 事件层补不补 CARD_PLAYED。反制符是**反应牌**，但反应牌一样要消耗牌、一样要有这两样。
    # 「不能主动使用」由相位把关（见下面的 test_reactive_cards_are_phase_gated），
    # 所以这里不断言「不在表里」。
    assert KIND_TO_CARD[ActionKind.PLAY_COUNTER] is Card.COUNTER
    assert CARD_TO_KIND[Card.COUNTER] is ActionKind.PLAY_COUNTER


def test_reactive_cards_are_phase_gated():
    """反应牌（反制符 / 遁术）**只能**在 Phase.COUNTER 出现：靠相位把关，不靠「不在 KIND_TO_CARD 里」。

    这条断言取代了旧版「Card.COUNTER not in CARD_TO_KIND」那种以表格成员身份间接表达意图的写法 ——
    那样写会与「反应牌也要消耗牌/要有 CARD_PLAYED」冲突，且真正的不变量（行动阶段拿不到它们）根本没被断言。
    """
    state = GameState(GameConfig(num_players=2, seed=7), seed=7)
    # 行动阶段：既没有 PLAY_COUNTER 也没有 PLAY_SKIP
    action_phase_kinds = {a.kind for a in state.legal_actions()}
    assert ActionKind.PLAY_COUNTER not in action_phase_kinds
    assert ActionKind.PLAY_SKIP not in action_phase_kinds

    # 反制窗口：两条都在（前提是本人手里有这两张牌 —— 构造一个确定的局面）
    state.hands[0] = [Card.COUNTER, Card.SKIP]
    state.phase = Phase.COUNTER
    state.pending_actor = 1
    state.pending_target = 0
    counter_phase_kinds = {a.kind for a in state.legal_actions()}
    assert ActionKind.PLAY_COUNTER in counter_phase_kinds
    assert ActionKind.PLAY_SKIP in counter_phase_kinds
    assert ActionKind.PASS_COUNTER in counter_phase_kinds

    # 直接构造一个 PLAY_COUNTER 在行动阶段提交 → 必须被拒绝。
    # 实测拦在 `step()` 的合法集校验上（`ValueError: 非法动作：使用反制符`）——
    # 比 `_step_action` 里的「未处理动作」守卫更早一层；两道都在，这里断言前一道。
    with pytest.raises(ValueError, match="非法动作"):
        GameState(GameConfig(num_players=2, seed=7), seed=7).step(
            Action(ActionKind.PLAY_COUNTER)
        )


def test_reinsert_regions_are_frozen():
    assert REINSERT_REGIONS == ("TOP", "NEAR_TOP", "MIDDLE", "BOTTOM")


def test_labels():
    assert ACTION_LABELS[ActionKind.END_TURN] == "结束行动并抽牌"
    assert ACTION_LABELS[ActionKind.PLAY_PEEK] == "使用观星术"
    assert ACTION_LABELS[ActionKind.PLAY_COUNTER] == "使用反制符"
    assert ACTION_LABELS[ActionKind.PASS_COUNTER] == "不反制"
    assert ACTION_LABELS[ActionKind.PLAY_SKIP] == "使用遁术（避开并结束结算）"
    assert Action(ActionKind.PLAY_STEAL, target=2).label() == "使用摄物术 → P2"
    assert Action(ActionKind.REINSERT, param="TOP").label() == "回插：牌堆顶"
    assert Action(ActionKind.REINSERT, param="BOTTOM").label() == "回插：牌堆底部"

"""规则语义测试（INTERFACES §1.4 / spec §4-§8、§16、§58）。

覆盖：初始设置、轮转、天劫 / 护劫符 / 回插、观星、改命、洗牌、遁术、摄物术 + 反制、
淘汰与终局、max_actions_per_turn、max_decisions / forced_stop、utilities、非法动作。
"""

from __future__ import annotations

import random

import pytest

from game.actions import Action, ActionKind
from game.cards import Card
from game.config import GameConfig, default_deck_composition
from game.state import GameState, Phase


def fresh(num_players: int = 3, seed: int = 42, **kwargs) -> GameState:
    return GameState(GameConfig(num_players=num_players, seed=seed, **kwargs), seed=seed)


def force_action_phase(state: GameState, player: int) -> None:
    """把状态直接摆成"P{player} 的行动阶段"。"""
    state.phase = Phase.ACTION
    state.current_player = player
    state.actions_used = 0


# --------------------------------------------------------------------- 初始设置


def test_setup_invariants():
    for n in range(2, 7):
        state = fresh(num_players=n, seed=n * 13)
        assert len(state.hands) == n
        assert state.alive == [True] * n
        assert state.phase == Phase.ACTION
        assert state.decision_count == 0
        assert state.winner is None and state.forced_stop is False
        for p in range(n):
            # 每人保证 1 张护劫符（额外牌堆里可能再发到，因此是 >= 1）
            assert state.hands[p].count(Card.DEFUSE) >= 1
            # 初始手牌 = initial_hand，且不含天劫
            assert len(state.hands[p]) == state.config.initial_hand
            assert Card.TRIBULATION not in state.hands[p]
        assert 0 <= state.current_player < n

        # 全量卡牌组成 == composition（初始阶段没有弃牌）
        # 注意：护劫符每人**开局必得 1 张**（参考实现语义），composition["DEFUSE"] 是
        # 除这 N 张之外额外放进牌堆的数量。
        total = {}
        for pile in [*state.hands, state.deck]:
            for card in pile:
                total[card] = total.get(card, 0) + 1
        expected = default_deck_composition(n)
        for api_id, count in expected.items():
            card = next(c for c in Card if c.value == _name_of(api_id))
            want = count + (n if api_id == "DEFUSE" else 0)
            assert total.get(card, 0) == want, (n, api_id, want, total.get(card, 0))


def _name_of(api_id: str) -> str:
    from game.cards import API_CARD_ID

    return next(c.value for c, a in API_CARD_ID.items() if a == api_id)


def test_setup_is_seed_deterministic():
    a = fresh(seed=123)
    b = fresh(seed=123)
    assert a.hands == b.hands and a.deck == b.deck
    assert a.current_player == b.current_player
    assert a.logs == b.logs
    # 不同 seed 至少有一次不同的发牌（避免偶然）
    differs = False
    for seed in range(1, 12):
        c = fresh(seed=seed)
        if c.deck != a.deck or c.hands != a.hands:
            differs = True
            break
    assert differs


def test_custom_deck_composition_is_honored():
    # 部分覆盖之外的卡显式清零 -> 完全自定义牌堆
    cfg = GameConfig(
        num_players=3,
        seed=5,
        deck_composition={
            "DEFUSE": 1,
            "STARGAZING": 2,
            "TRIBULATION": 2,
            "REWRITE_FATE": 0,
            "SHUFFLE": 0,
            "ESCAPE": 0,
            "STEAL": 0,
            "COUNTER": 0,
        },
    )
    state = GameState(cfg, seed=5)
    total = {}
    for pile in [*state.hands, state.deck]:
        for card in pile:
            total[card] = total.get(card, 0) + 1
    # 护劫符 = 每人开局 1 张（3 张）+ composition 额外 1 张
    assert total == {Card.DEFUSE: 4, Card.PEEK: 2, Card.TRIBULATION: 2}
    # 部分覆盖：只改天劫数量，其余保持默认线性缩放
    partial = GameState(GameConfig(num_players=3, seed=5, deck_composition={"TRIBULATION": 5}), seed=5)
    trib_count = partial.deck.count(Card.TRIBULATION) + sum(
        h.count(Card.TRIBULATION) for h in partial.hands
    )
    assert trib_count == 5


# --------------------------------------------------------------------- 轮转 / 抽牌


def test_end_turn_draws_and_advances():
    state = fresh(num_players=3, seed=7)
    p = state.current_player
    deck_before = list(state.deck)
    hand_before = len(state.hands[p])
    state.actions_used = 1
    state.step(Action(ActionKind.END_TURN))
    assert len(state.deck) == len(deck_before) - 1
    assert len(state.hands[p]) == hand_before + 1
    assert state.actions_used == 0  # 新回合重置
    assert state.turn_no == 2
    assert state.current_player == (p + 1) % 3
    assert state.phase == Phase.ACTION
    assert state.decision_count == 1
    assert state.logs[-1].endswith("回合结束。")


def test_turn_rotation_skips_eliminated_players():
    state = fresh(num_players=3, seed=3)
    state.alive[1] = False
    state.hands[1] = []
    force_action_phase(state, 0)
    state.step(Action(ActionKind.END_TURN))
    assert state.current_player == 2
    state.step(Action(ActionKind.END_TURN))
    assert state.current_player == 0
    assert state.turn_no == 3


def test_known_top_shifts_when_deck_top_is_drawn():
    state = fresh(num_players=3, seed=9)
    state.deck = [Card.SKIP, Card.STEAL, Card.PEEK, Card.SHUFFLE]
    state.hands[state.current_player] = [Card.REORDER]
    state.known_top[0] = list(state.deck[:3])
    state.known_top[2] = list(state.deck[:2])
    state.step(Action(ActionKind.END_TURN))
    # 牌堆顶部被抽走 1 张，所有玩家曾看到的序列整体前移
    assert len(state.known_top[0]) == 2
    assert len(state.known_top[2]) == 1
    assert state.known_top[0] == [Card.STEAL, Card.PEEK]


# ------------------------------------------------------------ 天劫 / 护劫符 / 回插


def test_tribulation_without_defuse_eliminates_player():
    state = fresh(num_players=3, seed=4)
    p = state.current_player
    state.hands[p] = [Card.PEEK]
    state.deck = [Card.TRIBULATION, Card.SKIP]
    state.step(Action(ActionKind.END_TURN))
    assert state.alive[p] is False
    assert state.hands[p] == []
    assert Card.TRIBULATION in state.discard
    assert state.winner is None  # 还有 2 人存活
    assert state.current_player != p
    assert "淘汰" in state.logs[-2] or "淘汰" in state.logs[-1]


def test_tribulation_with_defuse_triggers_reinsert():
    state = fresh(num_players=3, seed=4)
    p = state.current_player
    state.hands[p] = [Card.DEFUSE, Card.PEEK]
    state.deck = [Card.TRIBULATION, Card.SKIP]
    state.step(Action(ActionKind.END_TURN))
    assert state.phase == Phase.REINSERT
    assert state.reinsert_player == p
    assert state.decision_player() == p
    assert Card.DEFUSE not in state.hands[p]
    assert Card.DEFUSE in state.discard
    assert len(state.legal_actions()) == 4
    assert {a.param for a in state.legal_actions()} == {
        "TOP",
        "NEAR_TOP",
        "MIDDLE",
        "BOTTOM",
    }
    assert "回插" in state.logs[-1] or "护劫符" in state.logs[-1]


@pytest.mark.parametrize("region", ["TOP", "NEAR_TOP", "MIDDLE", "BOTTOM"])
def test_reinsert_positions(region):
    state = fresh(num_players=3, seed=4)
    p = state.current_player
    state.hands[p] = [Card.DEFUSE]
    state.deck = [Card.TRIBULATION, Card.SKIP, Card.PEEK, Card.SHUFFLE, Card.STEAL]
    state.step(Action(ActionKind.END_TURN))
    assert state.phase == Phase.REINSERT
    for _ in range(20):  # 随机位置也要落在规定区域
        probe = state.clone()
        probe.step(Action(ActionKind.REINSERT, param=region))
        deck = probe.deck
        pos = deck.index(Card.TRIBULATION)
        n = len(deck) - 1  # 插回之前的牌堆长度
        if region == "TOP":
            assert pos == 0
        elif region == "BOTTOM":
            assert pos == len(deck) - 1
        elif region == "NEAR_TOP":
            assert 1 <= pos <= 3
        else:
            assert n // 3 <= pos <= max(n // 3, (2 * n) // 3)
        assert probe.known_top == [[] for _ in range(3)]  # 知识失效
        assert probe.reinsert_player is None
        assert probe.phase == Phase.ACTION
        assert probe.current_player == (p + 1) % 3
        assert probe.turn_no == 2


def test_elimination_of_second_player_ends_game():
    state = fresh(num_players=3, seed=4)
    state.alive = [True, False, True]
    state.hands[1] = []
    p = 0
    force_action_phase(state, p)
    state.hands[p] = []
    state.deck = [Card.TRIBULATION]
    state.step(Action(ActionKind.END_TURN))
    assert state.phase == Phase.ENDED
    assert state.winner == 2
    assert state.is_terminal()
    assert state.utilities() == [-0.5, -0.5, 1.0]
    assert state.legal_actions() == []


# --------------------------------------------------------------------- 观星术


def test_peek_sets_known_top_and_opens_reorder():
    """观星术 = 查看 + 改序：进入 REORDER 决策，提交排列后顶部顺序生效。

    规则改动（原型文案）：`docs/CARD_RULES_DELTA.md` §2.1。
    """
    state = fresh(num_players=3, seed=6)
    p = state.current_player
    state.hands[p] = [Card.PEEK, Card.SKIP]
    top3 = list(state.deck[:3])
    state.step(Action(ActionKind.PLAY_PEEK))
    assert state.known_top[p] == top3
    assert state.known_top[(p + 1) % 3] == []
    assert Card.PEEK not in state.hands[p] and Card.PEEK in state.discard
    assert state.actions_used == 1
    # 不再直接结束动作，而是进入排序阶段（与逆天改命同一条私有 token 决策）
    assert state.phase == Phase.REORDER
    assert state.reorder_owner == p
    assert state.reorder_view == top3
    assert state.reorder_card is Card.PEEK
    assert len(state.legal_actions()) == 6  # 3! 个排列
    assert "观星术" in state.logs[-1]

    state.step(Action(ActionKind.REORDER_TOP, param="210"))
    assert state.deck[:3] == [top3[2], top3[1], top3[0]]  # 排列真的生效
    assert state.known_top[p] == [top3[2], top3[1], top3[0]]
    assert state.phase == Phase.ACTION  # 提交后回到正常阶段
    assert state.reorder_owner is None and state.reorder_view == []
    assert state.reorder_card is None
    assert "完成【观星术】" in state.logs[-1]


def test_peek_with_short_deck():
    state = fresh(num_players=3, seed=6)
    p = state.current_player
    state.hands[p] = [Card.PEEK]
    state.deck = [Card.SKIP, Card.STEAL]
    state.step(Action(ActionKind.PLAY_PEEK))
    assert state.known_top[p] == [Card.SKIP, Card.STEAL]
    assert state.phase == Phase.REORDER
    assert state.reorder_view == [Card.SKIP, Card.STEAL]
    assert len(state.legal_actions()) == 2  # 2! 个排列
    state.step(Action(ActionKind.REORDER_TOP, param="10"))
    assert state.deck == [Card.STEAL, Card.SKIP]


def test_peek_not_legal_without_card_or_deck():
    state = fresh(num_players=3, seed=6)
    p = state.current_player
    state.hands[p] = [Card.SKIP]
    state.deck = [Card.STEAL]
    assert Action(ActionKind.PLAY_PEEK) not in state.legal_actions()
    state.hands[p] = [Card.PEEK]
    state.deck = []
    assert Action(ActionKind.PLAY_PEEK) not in state.legal_actions()


# --------------------------------------------------------------------- 逆天改命


def test_reorder_flow_and_knowledge_clearing():
    state = fresh(num_players=3, seed=8)
    p = state.current_player
    state.hands[p] = [Card.REORDER, Card.SKIP]
    state.known_top[(p + 1) % 3] = [Card.DEFUSE]
    view = list(state.deck[:3])
    state.step(Action(ActionKind.PLAY_REORDER))
    assert state.phase == Phase.REORDER
    assert state.decision_player() == p
    assert state.reorder_view == view
    assert state.known_top[p] == view
    legal = state.legal_actions()
    assert len(legal) == 6  # 3! 个排列
    assert all(a.kind == ActionKind.REORDER_TOP for a in legal)

    reversed_perm = "210"
    state.step(Action(ActionKind.REORDER_TOP, param=reversed_perm))
    assert state.deck[:3] == [view[2], view[1], view[0]]
    assert state.known_top[p] == [view[2], view[1], view[0]]
    assert state.known_top[(p + 1) % 3] == []  # 他人知识被清空
    assert state.phase == Phase.ACTION
    assert state.reorder_owner is None and state.reorder_view == []


def test_reorder_invalid_permutation_rejected():
    state = fresh(num_players=3, seed=8)
    p = state.current_player
    state.hands[p] = [Card.REORDER]
    state.step(Action(ActionKind.PLAY_REORDER))
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.REORDER_TOP, param="12"))  # 长度/内容不对
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.REORDER_TOP, param="999"))


def test_reorder_with_single_card_deck():
    state = fresh(num_players=3, seed=8)
    p = state.current_player
    state.hands[p] = [Card.REORDER]
    state.deck = [Card.SKIP]
    state.step(Action(ActionKind.PLAY_REORDER))
    assert state.phase == Phase.REORDER
    assert state.legal_actions() == [Action(ActionKind.REORDER_TOP, param="0")]
    state.step(Action(ActionKind.REORDER_TOP, param="0"))
    assert state.deck == [Card.SKIP]


# --------------------------------------------------------------------- 扰乱天机


def test_shuffle_clears_all_knowledge():
    state = fresh(num_players=3, seed=10)
    p = state.current_player
    state.hands[p] = [Card.SHUFFLE, Card.SKIP]
    for i in range(3):
        state.known_top[i] = [Card.DEFUSE, Card.PEEK]
    deck_before = sorted(c.value for c in state.deck)
    state.step(Action(ActionKind.PLAY_SHUFFLE))
    assert state.known_top == [[] for _ in range(3)]
    assert sorted(c.value for c in state.deck) == deck_before
    assert Card.SHUFFLE in state.discard
    assert state.phase == Phase.ACTION


def test_shuffle_not_legal_with_single_card_deck():
    state = fresh(num_players=3, seed=10)
    p = state.current_player
    state.hands[p] = [Card.SHUFFLE]
    state.deck = [Card.SKIP]
    assert Action(ActionKind.PLAY_SHUFFLE) not in state.legal_actions()


# --------------------------------------------------------------------- 遁术

# 遁术已从「行动阶段主动跳过抽牌」改为「反制窗口的反应牌」（`docs/CARD_RULES_DELTA.md` §2.2）：
# 行动阶段不再出现，被法术指向时可用以避开法术并立即结束本次结算。


def test_escape_is_not_playable_in_action_phase():
    state = fresh(num_players=3, seed=12)
    p = state.current_player
    state.hands[p] = [Card.SKIP]
    kinds = {a.kind for a in state.legal_actions()}
    assert ActionKind.PLAY_SKIP not in kinds
    assert kinds == {ActionKind.END_TURN}
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.PLAY_SKIP))


def test_escape_dodges_steal_and_ends_settlement():
    state = fresh(num_players=3, seed=12)
    p = state.current_player
    target = (p + 1) % 3
    state.hands[p] = [Card.STEAL]
    state.hands[target] = [Card.SKIP, Card.PEEK]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    assert state.phase == Phase.COUNTER
    assert {a.kind for a in state.legal_actions()} == {
        ActionKind.PASS_COUNTER,
        ActionKind.PLAY_SKIP,
    }

    deck_before = list(state.deck)
    state.step(Action(ActionKind.PLAY_SKIP))
    # 法术完全无效：目标一张牌都不丢
    assert state.hands[target] == [Card.PEEK]
    assert state.hands[p] == []  # 施术者也没得到牌
    assert Card.SKIP in state.discard  # 遁术进弃牌堆
    assert Card.STEAL in state.discard  # 摄物术已打出，同样进弃牌堆
    # 立即结束本次结算：施术者的回合结束，按 _advance_turn_from 推进（不抽牌）
    assert state.phase == Phase.ACTION
    assert state.pending_actor is None and state.pending_target is None
    assert state.current_player != p
    assert state.current_player == (p + 1) % 3  # 轮到施术者的下一家（本例即遁术使用者）
    assert state.turn_no == 2
    assert state.deck == deck_before
    assert state.logs[-1] == f"P{target} 使用【遁术】，避开了 P{p} 的【摄物术】，本次结算立即结束。"


# --------------------------------------------------------------------- 摄物术 / 反制


def test_steal_opens_counter_phase_and_counter_redirects():
    """反制符 = 反弹：原施术者反被偷 1 张（`docs/CARD_RULES_DELTA.md` §2.3）。"""
    state = fresh(num_players=3, seed=14)
    p = state.current_player
    target = (p + 1) % 3
    state.hands[p] = [Card.STEAL, Card.SKIP]
    state.hands[target] = [Card.COUNTER, Card.PEEK]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    assert state.phase == Phase.COUNTER
    assert state.pending_actor == p and state.pending_target == target
    assert state.decision_player() == target
    assert state.legal_actions() == [
        Action(ActionKind.PASS_COUNTER),
        Action(ActionKind.PLAY_COUNTER),
    ]
    state.step(Action(ActionKind.PLAY_COUNTER))
    assert state.phase == Phase.ACTION
    assert state.current_player == p  # 回到使用者（他的行动阶段继续）
    assert Card.COUNTER in state.discard
    # 原目标没被偷，反而反偷了施术者一张
    assert len(state.hands[target]) == 2
    assert Card.PEEK in state.hands[target] and Card.SKIP in state.hands[target]
    assert state.hands[p] == []  # 施术者的 SKIP 被反偷走
    assert state.logs[-1] == (
        f"P{target} 使用【反制符】，P{p} 的【摄物术】被反弹，P{target} 反偷走 P{p} 1 张手牌。"
    )


def test_counter_with_empty_caster_hand_steals_nothing():
    """施术者手里已经没牌时，反弹没有任何牌可偷（不能凭空造牌）。"""
    state = fresh(num_players=3, seed=14)
    p = state.current_player
    target = (p + 1) % 3
    state.hands[p] = [Card.STEAL]
    state.hands[target] = [Card.COUNTER]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    state.step(Action(ActionKind.PLAY_COUNTER))
    assert state.hands[p] == []
    assert state.hands[target] == []
    assert state.phase == Phase.ACTION
    assert state.logs[-1] == (
        f"P{target} 使用【反制符】，P{p} 的【摄物术】被反弹，但 P{p} 已无手牌可偷。"
    )


def test_steal_transfers_random_card_when_not_countered():
    state = fresh(num_players=3, seed=15)
    p = state.current_player
    target = (p + 1) % 3
    state.hands[p] = [Card.STEAL]
    state.hands[target] = [Card.PEEK, Card.SKIP]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    state.step(Action(ActionKind.PASS_COUNTER))
    assert len(state.hands[target]) == 1
    assert len(state.hands[p]) == 1
    stolen = state.hands[p][0]
    assert stolen in (Card.PEEK, Card.SKIP)
    assert stolen not in state.hands[target]
    assert state.phase == Phase.ACTION
    assert state.logs[-1] == f"P{target} 未反制，P{p} 随机偷走 1 张手牌。"


def test_steal_needs_living_target_with_cards():
    state = fresh(num_players=3, seed=16)
    p = state.current_player
    state.hands[p] = [Card.STEAL]
    state.hands[(p + 1) % 3] = []  # 空手牌不可偷
    state.alive[(p + 2) % 3] = False  # 淘汰者不可偷
    targets = [a.target for a in state.legal_actions() if a.kind == ActionKind.PLAY_STEAL]
    assert targets == []


def test_counter_chain_depth_is_one():
    """反制链深度固定 1：COUNTER 阶段只有「不反制 / 反制符 / 遁术」三个反应选项。"""
    state = fresh(num_players=3, seed=17)
    p = state.current_player
    target = (p + 1) % 3
    state.hands[p] = [Card.STEAL, Card.COUNTER]
    state.hands[target] = [Card.COUNTER]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    kinds = {a.kind for a in state.legal_actions()}
    assert kinds == {ActionKind.PASS_COUNTER, ActionKind.PLAY_COUNTER}
    state.step(Action(ActionKind.PLAY_COUNTER))
    # 反制立即结算完成，不会再给施术者一个「反制反制」的窗口
    assert state.phase == Phase.ACTION
    assert state.current_player == p
    after = {a.kind for a in state.legal_actions()}
    assert ActionKind.PLAY_COUNTER not in after
    assert ActionKind.PASS_COUNTER not in after
    assert ActionKind.END_TURN in after
    # 反弹把施术者手里唯一那张牌拿走了（施术者手里本来就只有 STEAL + COUNTER）
    assert state.hands[p] == []
    assert state.hands[target] == [Card.COUNTER]

    # 目标手里有遁术时，反制窗口多出「遁术」这一条反应选项（链深度仍为 1）
    state2 = fresh(num_players=3, seed=17)
    p2 = state2.current_player
    target2 = (p2 + 1) % 3
    state2.hands[p2] = [Card.STEAL]
    state2.hands[target2] = [Card.COUNTER, Card.SKIP]
    state2.step(Action(ActionKind.PLAY_STEAL, target=target2))
    kinds2 = {a.kind for a in state2.legal_actions()}
    assert kinds2 == {
        ActionKind.PASS_COUNTER,
        ActionKind.PLAY_COUNTER,
        ActionKind.PLAY_SKIP,
    }


# ----------------------------------------------------- 行动次数上限 / 强制结束


def test_max_actions_per_turn_limits_legal_actions():
    state = fresh(num_players=3, seed=18, max_actions_per_turn=2)
    p = state.current_player
    state.hands[p] = [Card.PEEK, Card.SHUFFLE, Card.STEAL, Card.REORDER]
    state.step(Action(ActionKind.PLAY_PEEK))
    assert state.actions_used == 1
    # 观星术现在会进入排序阶段：排序决策本身不计入行动数
    assert state.phase == Phase.REORDER
    state.step(Action(ActionKind.REORDER_TOP, param="012"))
    assert state.actions_used == 1
    assert state.phase == Phase.ACTION
    kinds = {a.kind for a in state.legal_actions()}
    assert ActionKind.END_TURN in kinds
    assert ActionKind.PLAY_SHUFFLE in kinds  # 第二张主动牌仍然可用

    state = fresh(num_players=3, seed=18, max_actions_per_turn=1)
    p = state.current_player
    state.hands[p] = [Card.PEEK, Card.SHUFFLE]
    state.step(Action(ActionKind.PLAY_PEEK))
    state.step(Action(ActionKind.REORDER_TOP, param="012"))
    assert state.actions_used == 1
    assert state.legal_actions() == [Action(ActionKind.END_TURN)]


def test_max_decisions_forces_stop_and_draw():
    state = fresh(num_players=3, seed=19, max_decisions=5)
    steps = 0
    while not state.is_terminal():
        state.step(state.legal_actions()[0])
        steps += 1
        assert steps < 20
    assert state.forced_stop is True
    assert state.phase == Phase.ENDED
    assert state.winner is None
    assert state.decision_count == 6
    assert state.utilities() == [0.0, 0.0, 0.0]
    assert state.logs[-1] == "达到最大决策步数，强制结束，本局按平局处理。"


def test_empty_deck_forces_draw():
    state = fresh(num_players=3, seed=20)
    state.deck = []
    state.step(Action(ActionKind.END_TURN))
    assert state.forced_stop is True
    assert state.phase == Phase.ENDED
    assert state.winner is None
    assert state.utilities() == [0.0, 0.0, 0.0]
    assert state.logs[-1] == "牌堆为空，Demo 按平局结束。"


def test_utilities_constant_sum():
    state = fresh(num_players=4, seed=21)
    state.alive = [True, False, False, False]
    state.winner = 0
    state.phase = Phase.ENDED
    utils = state.utilities()
    assert utils[0] == 1.0
    assert all(u == pytest.approx(-1.0 / 3) for u in utils[1:])
    assert sum(utils) == pytest.approx(0.0)


# --------------------------------------------------------------------- 非法动作


def test_illegal_action_raises_value_error():
    state = fresh(num_players=3, seed=22)
    p = state.current_player
    state.hands[p] = [Card.SKIP]
    with pytest.raises(ValueError) as exc:
        state.step(Action(ActionKind.PLAY_PEEK))
    assert "非法动作" in str(exc.value)
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.PLAY_STEAL, target=p))  # 不能偷自己
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.REINSERT, param="TOP"))  # 阶段不对
    # 遁术已改为反应牌：行动阶段打出即非法（即使手里有遁术）
    assert Action(ActionKind.PLAY_SKIP) not in state.legal_actions()
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.PLAY_SKIP))


def test_terminal_state_has_no_legal_actions():
    state = fresh(num_players=3, seed=23)
    state.winner = 0
    state.phase = Phase.ENDED
    assert state.legal_actions() == []
    with pytest.raises(ValueError):
        state.step(Action(ActionKind.END_TURN))
    assert state.decision_player() == state.current_player


def test_full_random_game_reaches_terminal_with_winner():
    """seed 固定 + 随机合法动作：一局必然打到终局（除非 max_decisions 触发）。"""
    for seed in range(1, 6):
        state = fresh(num_players=3, seed=seed, max_decisions=500)
        rng = random.Random(seed)
        while not state.is_terminal():
            state.step(rng.choice(state.legal_actions()))
        assert state.decision_count <= state.config.max_decisions + 1
        if not state.forced_stop:
            assert state.winner in state.alive_players()
            assert len(state.alive_players()) == 1

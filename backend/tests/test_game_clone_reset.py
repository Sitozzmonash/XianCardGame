"""clone / reset / seed 可复现测试（INTERFACES §1.4、spec §14-§15）。"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _game_test_utils import diff_snapshot, snapshot  # noqa: E402

from game.actions import Action, ActionKind  # noqa: E402
from game.cards import Card  # noqa: E402
from game.config import GameConfig  # noqa: E402
from game.state import GameState, Phase  # noqa: E402


def _fresh(num_players: int = 3, seed: int = 42, **kwargs) -> GameState:
    return GameState(GameConfig(num_players=num_players, seed=seed, **kwargs), seed=seed)


# ------------------------------------------------------------------ clone


def test_clone_copies_rng_state_and_stays_in_lockstep_for_20_steps():
    state = _fresh(seed=101)
    clone = state.clone()
    assert clone is not state
    assert clone.rng.getstate() == state.rng.getstate()
    assert snapshot(clone) == snapshot(state)

    rng = random.Random(7)
    for step in range(20):
        assert clone.rng.getstate() == state.rng.getstate(), f"第 {step} 步前 rng 已不同"
        legal = state.legal_actions()
        assert [a.key() for a in legal] == [a.key() for a in clone.legal_actions()]
        if not legal:
            break
        action = rng.choice(legal)
        state.step(action)
        clone.step(action)
        assert diff_snapshot(snapshot(state), snapshot(clone)) == [], f"第 {step} 步状态不同"
        assert clone.rng.getstate() == state.rng.getstate(), f"第 {step} 步后 rng 不同"


def test_clone_rng_stays_aligned_through_random_consuming_actions():
    """随机偷牌 / NEAR_TOP 回插都会消耗 rng，clone 后必须保持一致。"""
    state = _fresh(seed=202)
    # 构造一个会消耗 rng 的场景：P0 偷 P1
    p = state.current_player
    target = (p + 1) % state.num_players
    state.hands[p] = [Card.STEAL]
    state.hands[target] = [Card.PEEK, Card.SKIP, Card.COUNTER]
    clone = state.clone()
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    clone.step(Action(ActionKind.PLAY_STEAL, target=target))
    state.step(Action(ActionKind.PASS_COUNTER))
    clone.step(Action(ActionKind.PASS_COUNTER))
    assert snapshot(state) == snapshot(clone)
    assert state.rng.getstate() == clone.rng.getstate()
    assert state.hands[p] == clone.hands[p]

    # 反弹（规则改动）同样消耗 rng：从施术者手里随机拿一张
    state3 = _fresh(seed=204)
    p3 = state3.current_player
    t3 = (p3 + 1) % 3
    state3.hands[p3] = [Card.STEAL, Card.PEEK, Card.SHUFFLE, Card.REORDER]
    state3.hands[t3] = [Card.COUNTER]
    clone3 = state3.clone()
    for s in (state3, clone3):
        s.step(Action(ActionKind.PLAY_STEAL, target=t3))
        s.step(Action(ActionKind.PLAY_COUNTER))
    assert snapshot(state3) == snapshot(clone3)
    assert state3.rng.getstate() == clone3.rng.getstate()
    assert len(state3.hands[t3]) == 1 and len(state3.hands[p3]) == 2

    # REINSERT 的 NEAR_TOP 位置也消耗 rng
    state2 = _fresh(seed=203)
    p2 = state2.current_player
    state2.hands[p2] = [Card.DEFUSE]
    state2.deck = [Card.TRIBULATION, Card.SKIP, Card.PEEK]
    state2.step(Action(ActionKind.END_TURN))
    clone2 = state2.clone()
    state2.step(Action(ActionKind.REINSERT, param="NEAR_TOP"))
    clone2.step(Action(ActionKind.REINSERT, param="NEAR_TOP"))
    assert state2.deck == clone2.deck
    assert state2.rng.getstate() == clone2.rng.getstate()


def test_clone_does_not_share_mutable_state():
    state = _fresh(seed=303)
    clone = state.clone()
    clone.hands[0].append(Card.TRIBULATION)
    clone.deck.pop()
    clone.discard.append(Card.PEEK)
    clone.known_top[1].append(Card.SKIP)
    clone.alive[2] = False
    clone.logs.append("污染")
    clone.config.deck_composition = {"STARGAZING": 0}
    clone.config.num_players = 6
    clone.reorder_view.append(Card.COUNTER)
    assert Card.TRIBULATION not in state.hands[0]
    assert len(clone.deck) == len(state.deck) - 1
    assert state.discard == []
    assert state.known_top[1] == []
    assert state.alive[2] is True
    assert len(state.logs) == 1 and state.logs[0].startswith("游戏开始：")
    assert state.config.deck_composition is None
    assert state.config.num_players == 3
    assert state.reorder_view == []
    # 反向：改原状态不影响 clone
    state.hands[1].append(Card.PEEK)
    assert Card.PEEK not in clone.hands[1]


@pytest.mark.parametrize("phase_kind", ["COUNTER", "COUNTER_DODGE", "REORDER", "REINSERT"])
def test_clone_preserves_pending_phase_fields(phase_kind):
    state = _fresh(seed=404)
    p = state.current_player
    if phase_kind == "COUNTER":
        state.hands[p] = [Card.STEAL]
        state.hands[(p + 1) % 3] = [Card.COUNTER]
        state.step(Action(ActionKind.PLAY_STEAL, target=(p + 1) % 3))
        follow = Action(ActionKind.PLAY_COUNTER)
    elif phase_kind == "COUNTER_DODGE":
        # 遁术是反应牌：COUNTER 阶段 clone 后打出必须与原件一致（含回合推进）
        state.hands[p] = [Card.STEAL]
        state.hands[(p + 1) % 3] = [Card.SKIP, Card.PEEK]
        state.step(Action(ActionKind.PLAY_STEAL, target=(p + 1) % 3))
        follow = Action(ActionKind.PLAY_SKIP)
    elif phase_kind == "REORDER":
        state.hands[p] = [Card.REORDER]
        state.step(Action(ActionKind.PLAY_REORDER))
        follow = Action(ActionKind.REORDER_TOP, param="210")
    else:
        state.hands[p] = [Card.DEFUSE]
        state.deck = [Card.TRIBULATION, Card.SKIP]
        state.step(Action(ActionKind.END_TURN))
        follow = Action(ActionKind.REINSERT, param="BOTTOM")

    clone = state.clone()
    assert diff_snapshot(snapshot(state), snapshot(clone)) == []
    assert clone.pending_actor == state.pending_actor
    assert clone.pending_target == state.pending_target
    assert clone.reorder_owner == state.reorder_owner
    assert clone.reorder_view == state.reorder_view
    assert clone.reorder_card == state.reorder_card
    assert clone.reinsert_player == state.reinsert_player
    state.step(follow)
    clone.step(follow)
    assert diff_snapshot(snapshot(state), snapshot(clone)) == []


def test_clone_copies_reorder_card_and_peek_reorder_state():
    """观星术开的 REORDER 也要能被 clone（含触发牌 `reorder_card`）。"""
    state = _fresh(seed=405)
    p = state.current_player
    state.hands[p] = [Card.PEEK]
    state.step(Action(ActionKind.PLAY_PEEK))
    assert state.reorder_card is Card.PEEK

    clone = state.clone()
    assert clone.reorder_card is Card.PEEK
    assert clone.reorder_view == state.reorder_view
    clone.reorder_card = Card.REORDER  # 改 clone 不影响原件
    assert state.reorder_card is Card.PEEK
    clone.reorder_card = Card.PEEK  # 复原（否则两侧日志会不同）

    for s in (state, clone):
        s.step(Action(ActionKind.REORDER_TOP, param="210"))
    assert snapshot(state) == snapshot(clone)


def test_clone_of_terminal_state():
    state = _fresh(seed=505)
    state.winner = 1
    state.phase = Phase.ENDED
    state.forced_stop = False
    clone = state.clone()
    assert clone.is_terminal() and clone.winner == 1
    assert clone.utilities() == state.utilities()


def test_two_clones_diverge_independently():
    state = _fresh(seed=606)
    a = state.clone()
    b = state.clone()
    a.step(Action(ActionKind.END_TURN))
    assert snapshot(a) != snapshot(b)  # a 前进了
    assert snapshot(b) == snapshot(state)  # b 未受影响

    legal_b = b.legal_actions()
    assert len(legal_b) > 1
    b.step(legal_b[-1])  # 走一个不同动作
    assert snapshot(a) != snapshot(b)
    assert snapshot(a) != snapshot(state)

    # 另外两个 clone 走同一动作 -> 结果与 rng 完全一致（clone 独立且可复现）
    c, d = state.clone(), state.clone()
    c.step(Action(ActionKind.END_TURN))
    d.step(Action(ActionKind.END_TURN))
    assert snapshot(c) == snapshot(d)
    assert c.rng.getstate() == d.rng.getstate()


# ------------------------------------------------------------------ reset


def test_reset_returns_self_and_restores_initial_deal():
    state = _fresh(seed=707)
    initial = snapshot(state)
    rng = random.Random(3)
    for _ in range(12):
        state.step(rng.choice(state.legal_actions()))
    assert snapshot(state) != initial

    returned = state.reset()
    assert returned is state
    assert snapshot(state) == initial
    assert state.decision_count == 0
    assert len(state.logs) == 1 and state.logs[0].startswith("游戏开始：")
    assert state.rng.getstate() == _fresh(seed=707).rng.getstate()


def test_reset_after_terminal_restores_playable_state():
    state = _fresh(seed=808, max_decisions=4)
    while not state.is_terminal():
        state.step(state.legal_actions()[0])
    assert state.forced_stop is True
    state.reset()
    assert not state.is_terminal() and state.forced_stop is False
    assert state.winner is None and state.decision_count == 0
    assert all(state.alive) and len(state.legal_actions()) >= 1


def test_reset_on_clone_uses_original_seed():
    state = _fresh(seed=909)
    clone = state.clone()
    clone.step(clone.legal_actions()[0])
    clone.reset()
    assert snapshot(clone) == snapshot(_fresh(seed=909))


# ------------------------------------------------------------- seed 可复现


def test_same_seed_same_actions_same_terminal_state_and_logs():
    def play(seed: int) -> GameState:
        state = _fresh(seed=seed)
        rng = random.Random(1234)  # 与 seed 无关的动作选择器
        while not state.is_terminal():
            state.step(rng.choice(state.legal_actions()))
        return state

    a, b = play(31), play(31)
    assert snapshot(a) == snapshot(b)
    assert a.logs == b.logs
    assert a.utilities() == b.utilities()
    assert a.winner == b.winner

    c = play(32)
    assert snapshot(c) != snapshot(a)


def test_seed_argument_overrides_config_seed():
    a = GameState(GameConfig(num_players=3, seed=42), seed=7)
    b = GameState(GameConfig(num_players=3, seed=7), seed=7)
    assert a.hands == b.hands and a.deck == b.deck
    assert a.current_player == b.current_player


def test_seed_reproducibility_survives_clone_and_step():
    """clone 分支重放同一动作序列，等价于原始重放。"""
    state = _fresh(seed=111)
    actions = []
    rng = random.Random(222)
    probe = state.clone()
    while not probe.is_terminal() and len(actions) < 25:
        action = rng.choice(probe.legal_actions())
        actions.append(action)
        probe.step(action)

    replay = state.clone()
    for action in actions:
        replay.step(action)
    assert diff_snapshot(snapshot(probe), snapshot(replay)) == []
    assert probe.logs == replay.logs

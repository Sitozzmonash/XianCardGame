"""AI 不得作弊测试（spec §59、INTERFACES §2 硬约束）。

用 `HiddenInfoProbe`（包装 GameState 的访问监控代理）断言：所有 Agent 在 `act()`
期间除自己的 `hands[p]` / `known_top[p]`（以及自己有权限的 `reorder_view`）外，
从不读取 `deck` / `hands[other]` / `known_top[other]`。

同时用**故意作弊**的假 Agent 做反向验证，证明检测器真的能拦住（而不是永远返回"通过"）。
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _agent_test_utils import (  # noqa: E402
    DeckPeekingAgent,
    HandPeekingAgent,
    HiddenInfoProbe,
    KnownTopPeekingAgent,
    OwnInfoOnlyAgent,
    StubMCCFRTrainer,
    probe_once,
    run_probed_game,
)

from agents import ISMCTSAgent, MCCFRAgent, RandomAgent, RuleAgent  # noqa: E402
from game.actions import Action, ActionKind  # noqa: E402
from game.cards import Card  # noqa: E402
from game.config import GameConfig  # noqa: E402
from game.state import GameState, Phase  # noqa: E402


def _fresh(num_players: int = 3, seed: int = 42, **kwargs) -> GameState:
    return GameState(GameConfig(num_players=num_players, seed=seed, **kwargs), seed=seed)


def _mccfr_factory(seed: int):
    trainer = StubMCCFRTrainer(seed)
    trainer.register_from_game(seed)
    return lambda _seed: MCCFRAgent(trainer, seed)


# --------------------------------------------------------- 反向验证：检测器有效


def test_detector_catches_deck_peeking_agent():
    state = _fresh(seed=1)
    player = state.decision_player()
    violations, _ = probe_once(DeckPeekingAgent(0), state, player)
    assert violations, "读牌堆的作弊 Agent 必须被检测出来"
    assert any(label == "deck" for label, _ in violations)


def test_detector_catches_other_hands_peeking_agent():
    state = _fresh(seed=2)
    player = state.decision_player()
    violations, _ = probe_once(HandPeekingAgent(0), state, player)
    assert violations, "读他人手牌的作弊 Agent 必须被检测出来"
    assert any(label == "hands" for label, _ in violations)


def test_detector_catches_other_known_top_peeking_agent():
    state = _fresh(seed=3)
    player = state.decision_player()
    state.known_top[(player + 1) % 3] = [Card.TRIBULATION]
    violations, _ = probe_once(KnownTopPeekingAgent(0), state, player)
    assert violations, "读他人观星结果的作弊 Agent 必须被检测出来"
    assert any(label == "known_top" for label, _ in violations)


def test_detector_allows_reading_own_hand_and_known_top():
    """正对照：只读自己的信息不应误报。"""
    result = run_probed_game(lambda _seed: OwnInfoOnlyAgent(0), seed=5)
    assert result["violations"] == []
    assert result["steps"] > 10


def test_detector_catches_flag_all_three_hidden_channels():
    state = _fresh(seed=4)
    player = state.decision_player()
    probe = HiddenInfoProbe(state, player)
    _ = probe.deck
    _ = probe.hands[(player + 1) % 3]
    _ = probe.known_top[(player + 1) % 3]
    _ = probe.hands[player]  # 自己的手牌不算违规
    _ = probe.known_top[player]
    labels = sorted(label for label, _ in probe.violations)
    assert labels == ["deck", "hands", "known_top"]


# --------------------------------------------------------- 真实 Agent：零违规


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_random_agent_never_touches_hidden_info(seed):
    result = run_probed_game(lambda _seed: RandomAgent(seed), seed=seed)
    assert result["violations"] == [], result["violations"]
    assert result["steps"] > 10


@pytest.mark.parametrize("seed", [1, 2, 3])
@pytest.mark.parametrize("num_players", [2, 3, 6])
def test_rule_agent_never_touches_hidden_info(seed, num_players):
    result = run_probed_game(
        lambda _seed: RuleAgent(seed), seed=seed, num_players=num_players
    )
    assert result["violations"] == [], result["violations"]
    assert result["steps"] > 5


@pytest.mark.parametrize("seed", [1, 2])
def test_ismcts_never_touches_hidden_info_and_only_determinizes(seed):
    result = run_probed_game(
        lambda _seed: ISMCTSAgent(simulations=10, seed=seed), seed=seed
    )
    assert result["violations"] == [], result["violations"]
    assert result["steps"] > 10
    # 只能通过 determinize_for 构造可能世界，且观察者必须是自己
    assert result["determinize_calls"], "ISMCTS 必须使用 determinize_for"
    assert set(result["determinize_calls"]) <= set(range(3))


def test_ismcts_uses_determinize_only_for_itself():
    state = _fresh(seed=8)
    player = state.decision_player()
    probe = HiddenInfoProbe(state, player)
    agent = ISMCTSAgent(simulations=8, seed=1)
    action = agent.act(probe, player)
    assert action in state.legal_actions()
    assert probe.violations == []
    # 每次 determinization 的观察者都是自己
    assert probe.determinize_calls and all(o == player for o in probe.determinize_calls)


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_mccfr_agent_never_touches_hidden_info(seed):
    result = run_probed_game(_mccfr_factory(seed), seed=seed)
    assert result["violations"] == [], result["violations"]
    assert result["steps"] > 10


def test_mccfr_agent_fallback_path_also_clean():
    """未见过 info set -> 回落 RuleAgent，仍然不能碰隐藏信息。"""
    trainer = StubMCCFRTrainer(0)  # 空表 -> 全部走 fallback
    result = run_probed_game(lambda _seed: MCCFRAgent(trainer, 0), seed=6)
    assert result["violations"] == []
    assert len(trainer.strategy_sum) == 0
    assert result["steps"] > 10


def test_ismcts_determinization_keeps_observer_view_and_hides_truth():
    """determinize_for 生成的可能是世界：自己的手牌/已知牌顶与观察一致，
    但其他玩家的手牌不能恒等于真相（否则等于直接偷看）。"""
    state = _fresh(num_players=4, seed=12)
    player = state.decision_player()
    real_other = [list(state.hands[p]) for p in range(4) if p != player]
    differ = 0
    for seed in range(30):
        world = state.determinize_for(player, seed)
        assert world.hands[player] == state.hands[player]
        assert world.known_top[player] == state.known_top[player]
        assert len(world.deck) == len(state.deck)
        # 其他人的手牌数量必须一致（公开信息）
        assert [len(world.hands[p]) for p in range(4)] == [
            len(state.hands[p]) for p in range(4)
        ]
        others = [world.hands[p] for p in range(4) if p != player]
        if others != real_other:
            differ += 1
    assert differ >= 25, f"determinization 疑似暴露真实隐藏信息（仅 {differ}/30 与真相不同）"

    # 显式 seed 时可复现
    a = state.determinize_for(player, 123)
    b = state.determinize_for(player, 123)
    assert a.hands == b.hands and a.deck == b.deck


def test_agents_are_given_no_direct_state_access_when_probed():
    """再次确认：把 probe 传给 agent 后，agent 拿到的不是真实 GameState。"""
    state = _fresh(seed=13)
    player = state.decision_player()
    probe = HiddenInfoProbe(state, player)
    assert isinstance(probe, HiddenInfoProbe) and probe is not state
    # probe 本身不暴露 deck 的"非法访问豁免"
    assert probe.legal_actions() == state.legal_actions()
    assert probe.phase == state.phase
    assert probe.hand_sizes() == state.hand_sizes()
    assert probe.decision_player() == state.decision_player()
    _ = probe.discard  # 弃牌是公开信息
    assert probe.violations == []

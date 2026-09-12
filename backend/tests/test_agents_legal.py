"""四种 AI 的行为契约测试（INTERFACES §2、spec §18-§19、§23-§24、§32-§33）。

- 每个 Agent 在所有阶段都返回**合法动作**；
- RandomAgent 可复现；
- RuleAgent 的策略规则逐条对应 spec §19；
- ISMCTS 参数可调（simulations / exploration / max_depth / rollout_agent）；
- MCCFRAgent 查表采样、未见信息集回落 RuleAgent。
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _agent_test_utils import StubMCCFRTrainer  # noqa: E402

from agents import ISMCTSAgent, MCCFRAgent, RandomAgent, RuleAgent  # noqa: E402
from agents.base import BaseAgent  # noqa: E402
from agents.common import regret_matching, sample_from_strategy  # noqa: E402
from game.actions import Action, ActionKind  # noqa: E402
from game.cards import Card  # noqa: E402
from game.config import GameConfig  # noqa: E402
from game.state import GameState, Phase  # noqa: E402


def _fresh(num_players: int = 3, seed: int = 42, **kwargs) -> GameState:
    return GameState(GameConfig(num_players=num_players, seed=seed, **kwargs), seed=seed)


def _phase_states() -> dict[str, GameState]:
    """构造 ACTION / COUNTER / REORDER / REINSERT 四个阶段的决策点。"""
    states: dict[str, GameState] = {}

    action_state = _fresh(seed=1)
    states["ACTION"] = action_state

    counter_state = _fresh(seed=2)
    p = counter_state.current_player
    counter_state.hands[p] = [Card.STEAL]
    counter_state.hands[(p + 1) % 3] = [Card.COUNTER, Card.PEEK]
    counter_state.step(Action(ActionKind.PLAY_STEAL, target=(p + 1) % 3))
    states["COUNTER"] = counter_state

    reorder_state = _fresh(seed=3)
    p = reorder_state.current_player
    reorder_state.hands[p] = [Card.REORDER]
    reorder_state.step(Action(ActionKind.PLAY_REORDER))
    states["REORDER"] = reorder_state

    reinsert_state = _fresh(seed=4)
    p = reinsert_state.current_player
    reinsert_state.hands[p] = [Card.DEFUSE]
    reinsert_state.deck = [Card.TRIBULATION, Card.SKIP]
    reinsert_state.step(Action(ActionKind.END_TURN))
    states["REINSERT"] = reinsert_state

    return states


def _agent_list(seed: int = 0):
    trainer = StubMCCFRTrainer(seed)
    trainer.register_from_game(seed)
    return [
        RandomAgent(seed),
        RuleAgent(seed),
        ISMCTSAgent(simulations=8, seed=seed),
        MCCFRAgent(trainer, seed),
    ]


# ------------------------------------------------------------------ 合法性


def test_base_agent_act_raises():
    with pytest.raises(NotImplementedError):
        BaseAgent().act(_fresh(), 0)
    assert BaseAgent.name == "BaseAgent"


def test_agent_names():
    assert RandomAgent().name == "随机AI"
    assert RuleAgent().name == "规则AI"
    assert ISMCTSAgent().name == "ISMCTS"
    assert MCCFRAgent(StubMCCFRTrainer()).name == "MCCFR"


@pytest.mark.parametrize("phase_name", ["ACTION", "COUNTER", "REORDER", "REINSERT"])
def test_every_agent_returns_legal_action_in_every_phase(phase_name):
    state = _phase_states()[phase_name]
    player = state.decision_player()
    legal = state.legal_actions()
    assert state.phase.name == phase_name
    for agent in _agent_list(seed=0):
        action = agent.act(state, player)
        assert action in legal, f"{agent.name} 在 {phase_name} 给了非法动作 {action}"


@pytest.mark.parametrize(
    "factory",
    [
        lambda seed: RandomAgent(seed),
        lambda seed: RuleAgent(seed),
        lambda seed: ISMCTSAgent(simulations=8, seed=seed),
        lambda seed: MCCFRAgent(StubMCCFRTrainer(seed), seed),
    ],
)
def test_full_game_with_each_agent_reaches_terminal(factory):
    for seed in (1, 2):
        state = _fresh(seed=seed)
        agents = [factory(seed + i) for i in range(3)]
        steps = 0
        while not state.is_terminal() and steps < 600:
            player = state.decision_player()
            action = agents[player].act(state, player)
            assert action in state.legal_actions()
            state.step(action)
            steps += 1
        assert state.is_terminal(), f"seed={seed} 没打完"
        assert state.decision_count <= state.config.max_decisions + 1


def test_mixed_agents_game_runs_to_terminal():
    state = _fresh(seed=9)
    agents = [RuleAgent(1), ISMCTSAgent(simulations=10, seed=2), RandomAgent(3)]
    while not state.is_terminal():
        player = state.decision_player()
        state.step(agents[player].act(state, player))
    assert state.is_terminal()
    assert state.winner is None or state.winner in state.alive_players()


# ------------------------------------------------------------------ Random


def test_random_agent_is_seed_reproducible():
    def run(seed: int) -> list[str]:
        state = _fresh(seed=21)
        agent = RandomAgent(seed)
        trace = []
        while not state.is_terminal():
            action = agent.act(state, state.decision_player())
            trace.append(action.key())
            state.step(action)
        return trace

    assert run(5) == run(5)
    assert run(5) != run(6)
    assert RandomAgent(5).rng.random() == RandomAgent(5).rng.random()


# ------------------------------------------------------------------ Rule


def test_rule_agent_avoids_known_tribulation_with_skip():
    state = _fresh(seed=31)
    p = state.current_player
    state.hands[p] = [Card.SKIP, Card.PEEK, Card.STEAL]
    state.known_top[p] = [Card.TRIBULATION, Card.PEEK]
    state.deck = [Card.TRIBULATION, Card.PEEK, Card.SKIP]
    action = RuleAgent(0).act(state, p)
    assert action == Action(ActionKind.PLAY_SKIP)


def test_rule_agent_prefers_peek_when_ignorant_and_first_action():
    state = _fresh(seed=32)
    p = state.current_player
    state.hands[p] = [Card.PEEK, Card.SKIP]
    state.known_top[p] = []
    state.actions_used = 0
    assert RuleAgent(0).act(state, p) == Action(ActionKind.PLAY_PEEK)


def test_rule_agent_counters_when_able():
    state = _fresh(seed=33)
    p = state.current_player
    target = (p + 1) % 3
    state.hands[p] = [Card.STEAL]
    state.hands[target] = [Card.COUNTER, Card.PEEK]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    assert RuleAgent(0).act(state, target) == Action(ActionKind.PLAY_COUNTER)
    # 没有反制符时只能不反制
    state.hands[target] = [Card.PEEK]
    assert RuleAgent(0).act(state, target) == Action(ActionKind.PASS_COUNTER)


def test_rule_agent_reinserts_tribulation_on_top():
    state = _fresh(seed=34)
    p = state.current_player
    state.hands[p] = [Card.DEFUSE]
    state.deck = [Card.TRIBULATION, Card.SKIP]
    state.step(Action(ActionKind.END_TURN))
    assert RuleAgent(0).act(state, p) == Action(ActionKind.REINSERT, param="TOP")


def test_rule_agent_pushes_tribulation_to_the_back_when_reordering():
    state = _fresh(seed=35)
    p = state.current_player
    state.hands[p] = [Card.REORDER]
    state.deck = [Card.TRIBULATION, Card.SKIP, Card.PEEK]
    state.step(Action(ActionKind.PLAY_REORDER))
    action = RuleAgent(0).act(state, p)
    assert action.kind == ActionKind.REORDER_TOP
    order = [int(x) for x in action.param]
    # 天劫在下标 0，应被排到最后：期望排列 [1, 2, 0]
    assert order == [1, 2, 0]
    assert order.index(0) == len(order) - 1


def test_rule_agent_steals_from_richest_when_hand_is_small():
    state = _fresh(seed=36)
    p = state.current_player
    state.hands[p] = [Card.STEAL]
    state.hands[(p + 1) % 3] = [Card.PEEK] * 2
    state.hands[(p + 2) % 3] = [Card.PEEK] * 6
    action = RuleAgent(0).act(state, p)
    assert action.kind == ActionKind.PLAY_STEAL
    assert action.target == (p + 2) % 3


def test_rule_agent_only_skips_identically_with_reference_state_shape():
    """RuleAgent 不读隐藏信息时也必须保持确定性（同状态同决策）。"""
    state = _fresh(seed=37)
    agent = RuleAgent(0)
    p = state.decision_player()
    assert agent.act(state, p) == agent.act(state, p)


# ------------------------------------------------------------------ ISMCTS


def test_ismcts_parameter_validation_and_plumbing():
    assert ISMCTSAgent().simulations == 500
    assert ISMCTSAgent().exploration == pytest.approx(1.4)
    assert ISMCTSAgent().max_depth == 250
    assert isinstance(ISMCTSAgent().rollout_agent, RuleAgent)
    custom = RandomAgent(3)
    assert ISMCTSAgent(rollout_agent=custom).rollout_agent is custom
    with pytest.raises(ValueError):
        ISMCTSAgent(simulations=0)
    with pytest.raises(ValueError):
        ISMCTSAgent(max_depth=0)
    for simulations in (1, 10):
        for exploration in (0.5, 0.8, 1.0, 1.4, 2.0):
            agent = ISMCTSAgent(simulations=simulations, exploration=exploration, seed=1)
            state = _fresh(seed=41)
            action = agent.act(state, state.decision_player())
            assert action in state.legal_actions()


def test_ismcts_seed_reproducible_for_same_state():
    state = _fresh(seed=42)
    player = state.decision_player()
    a = ISMCTSAgent(simulations=30, seed=7)
    b = ISMCTSAgent(simulations=30, seed=7)
    assert a.act(state, player) == b.act(state, player)


def test_ismcts_returns_single_legal_action_without_searching():
    state = _fresh(seed=43)
    p = state.current_player
    state.hands[p] = [Card.PEEK]
    state.actions_used = state.config.max_actions_per_turn
    assert state.legal_actions() == [Action(ActionKind.END_TURN)]
    agent = ISMCTSAgent(simulations=50, seed=1)
    assert agent.act(state, p) == Action(ActionKind.END_TURN)


# ------------------------------------------------------------------ MCCFR


def test_mccfr_agent_samples_from_trained_strategy():
    state = _fresh(seed=51)
    player = state.decision_player()
    legal = state.legal_actions()
    trainer = StubMCCFRTrainer(0)
    info = state.infoset_key(player)
    # 概率全给第一个动作 -> 必须总是选它
    trainer.strategy_sum[info] = {a.key(): 0.0 for a in legal}
    trainer.strategy_sum[info][legal[0].key()] = 1.0
    trainer.regret_sum[info] = {a.key(): 0.1 for a in legal}
    for seed in range(5):
        agent = MCCFRAgent(trainer, seed)
        assert agent.act(state, player) == legal[0]


def test_mccfr_agent_falls_back_to_rule_agent_for_unseen_infoset():
    state = _fresh(seed=52)
    player = state.decision_player()
    trainer = StubMCCFRTrainer(0)  # 空表
    agent = MCCFRAgent(trainer, 0)
    assert state.infoset_key(player) not in trainer.strategy_sum
    assert state.infoset_key(player) not in trainer.regret_sum
    expected = RuleAgent(0).act(state, player)
    assert agent.act(state, player) == expected


def test_mccfr_agent_known_infoset_uses_strategy_not_fallback():
    state = _fresh(seed=53)
    player = state.decision_player()
    trainer = StubMCCFRTrainer(0)
    trainer.register(state, player, uniform=True)
    agent = MCCFRAgent(trainer, 0)
    actions = {agent.act(state, player).key() for _ in range(30)}
    assert actions, "必须给出动作"
    assert actions <= {a.key() for a in state.legal_actions()}


def test_mccfr_agent_seed_reproducible():
    state = _fresh(seed=54)
    player = state.decision_player()
    trainer = StubMCCFRTrainer(0)
    trainer.register(state, player, uniform=True)
    a, b = MCCFRAgent(trainer, 11), MCCFRAgent(trainer, 11)
    trace_a = [a.act(state, player).key() for _ in range(20)]
    trace_b = [b.act(state, player).key() for _ in range(20)]
    assert trace_a == trace_b


# ------------------------------------------------------------------ 采样工具


def test_sample_from_strategy_and_regret_matching():
    state = _fresh(seed=55)
    legal = state.legal_actions()
    rng = random.Random(0)
    assert sample_from_strategy(rng, legal, {legal[0].key(): 1.0}) == legal[0]
    assert sample_from_strategy(rng, legal, {}) == legal[-1]
    with pytest.raises(ValueError):
        sample_from_strategy(rng, [], {})
    probs = regret_matching({legal[0].key(): 1.0, legal[1].key(): 3.0}, legal)
    assert probs[legal[0].key()] == pytest.approx(0.25)
    assert probs[legal[1].key()] == pytest.approx(0.75)
    uniform = regret_matching({}, legal)
    assert uniform[legal[0].key()] == pytest.approx(1.0 / len(legal))
    assert sum(regret_matching({legal[0].key(): -5.0}, legal).values()) == pytest.approx(1.0)

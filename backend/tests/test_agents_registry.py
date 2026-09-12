"""Agent 注册表与 spec 解析测试（INTERFACES §2、API_CONTRACT §5）。"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _agent_test_utils import StubMCCFRTrainer  # noqa: E402

from agents import (  # noqa: E402
    AGENT_INFOS,
    AGENT_TYPES,
    ISMCTSAgent,
    MCCFRAgent,
    RandomAgent,
    RuleAgent,
    agent_info,
    parse_agent,
)
from game.config import GameConfig  # noqa: E402
from game.state import GameState  # noqa: E402


def test_agent_infos_shape_matches_api_contract():
    assert isinstance(AGENT_INFOS, list) and len(AGENT_INFOS) >= 4
    for info in AGENT_INFOS:
        assert {"id", "name", "type", "configurable"} <= set(info)
        assert isinstance(info["id"], str) and info["id"]
        assert isinstance(info["name"], str) and info["name"]
        assert info["type"] in AGENT_TYPES
        assert isinstance(info["configurable"], bool)

    ismcts = agent_info("ismcts")
    assert ismcts is not None
    assert ismcts["configurable"] is True
    assert ismcts["defaults"]["simulations"] == 500
    assert ismcts["defaults"]["exploration"] == pytest.approx(1.4)
    assert agent_info("mccfr")["type"] == "mccfr"
    assert agent_info("random")["configurable"] is False
    assert agent_info("rule")["configurable"] is False
    assert AGENT_TYPES == ("random", "rule", "ismcts", "mccfr")


def test_parse_agent_simple_types():
    assert isinstance(parse_agent("random"), RandomAgent)
    assert isinstance(parse_agent("rule"), RuleAgent)
    assert isinstance(parse_agent(" RULE "), RuleAgent)
    assert isinstance(parse_agent("Random"), RandomAgent)


def test_parse_agent_ismcts_variants():
    default = parse_agent("ismcts")
    assert isinstance(default, ISMCTSAgent)
    assert default.simulations == 500
    assert default.exploration == pytest.approx(1.4)

    overridden = parse_agent("ismcts:120")
    assert overridden.simulations == 120 and overridden.exploration == pytest.approx(1.4)

    both = parse_agent("ismcts:500:1.4")
    assert both.simulations == 500 and both.exploration == pytest.approx(1.4)

    explore = parse_agent("ismcts:1000:0.8")
    assert explore.simulations == 1000 and explore.exploration == pytest.approx(0.8)

    assert parse_agent("ismcts:50:").simulations == 50
    with pytest.raises(ValueError):
        parse_agent("ismcts:abc")
    with pytest.raises(ValueError):
        parse_agent("ismcts:100:xyz")


def test_parse_agent_seed_is_passed_through():
    agent = parse_agent("random", seed=99)
    other = parse_agent("random", seed=99)
    assert agent.rng.random() == other.rng.random()
    assert parse_agent("ismcts:10", seed=5).seed == 5


def test_parse_agent_rejects_unknown_specs():
    for bad in ("", "   ", "nope", "mcts:10", "mccfr", "mccfr:"):
        with pytest.raises(ValueError):
            parse_agent(bad)
    with pytest.raises(ValueError):
        parse_agent(None)  # type: ignore[arg-type]


# ------------------------------------------------------------ mccfr 模型加载


def test_parse_agent_mccfr_loads_model(monkeypatch, tmp_path):
    seen: list[str] = []
    trainer = StubMCCFRTrainer(0)

    class FakeTrainer:
        @classmethod
        def load(cls, path):
            seen.append(path)
            return trainer

    package = types.ModuleType("training")
    package.__path__ = []  # type: ignore[attr-defined]
    module = types.ModuleType("training.trainer")
    module.MCCFRTrainer = FakeTrainer  # type: ignore[attr-defined]
    package.trainer = module  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "training", package)
    monkeypatch.setitem(sys.modules, "training.trainer", module)

    model = tmp_path / "models" / "x.pkl"
    agent = parse_agent(f"mccfr:{model}", seed=3)
    assert isinstance(agent, MCCFRAgent)
    assert agent.trainer is trainer
    assert seen == [str(model)]

    # Windows 盘符里的冒号必须原样保留
    agent2 = parse_agent("mccfr:D:/models/a.pkl")
    assert seen[-1] == "D:/models/a.pkl"
    assert isinstance(agent2, MCCFRAgent)


def test_mccfr_agent_load_classmethod(monkeypatch, tmp_path):
    trainer = StubMCCFRTrainer(0)

    class FakeTrainer:
        @classmethod
        def load(cls, path):
            return trainer

    module = types.ModuleType("training.trainer")
    module.MCCFRTrainer = FakeTrainer  # type: ignore[attr-defined]
    package = types.ModuleType("training")
    package.__path__ = []  # type: ignore[attr-defined]
    package.trainer = module  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "training", package)
    monkeypatch.setitem(sys.modules, "training.trainer", module)

    agent = MCCFRAgent.load("models/whatever.pkl", seed=1)
    assert isinstance(agent, MCCFRAgent) and agent.trainer is trainer

    state = GameState(GameConfig(num_players=3, seed=1), seed=1)
    assert agent.act(state, state.decision_player()) in state.legal_actions()


def test_mccfr_agent_load_without_training_package_raises_helpful_error(monkeypatch):
    monkeypatch.setitem(sys.modules, "training.trainer", None)
    monkeypatch.setitem(sys.modules, "training", None)
    try:
        with pytest.raises(ImportError) as exc:
            MCCFRAgent.load("models/missing.pkl")
        assert "training.trainer" in str(exc.value)
    finally:
        pass


def test_parse_agent_mccfr_with_real_training_package(tmp_path):
    """如果 C3 的 training 包已就位，则端到端验证（否则跳过）。"""
    try:
        from training.trainer import MCCFRTrainer  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - 取决于 C3 进度
        pytest.skip(f"training.trainer 不可用：{exc}")

    config = GameConfig(num_players=2, max_decisions=60)
    trainer = MCCFRTrainer(config, seed=1)
    trainer.train(iterations=1, workers=1, log_every=1)
    path = tmp_path / "mccfr_2p.pkl"
    trainer.save(str(path))

    agent = parse_agent(f"mccfr:{path}", seed=2)
    assert isinstance(agent, MCCFRAgent)
    state = GameState(config, seed=4)
    player = state.decision_player()
    assert agent.act(state, player) in state.legal_actions()

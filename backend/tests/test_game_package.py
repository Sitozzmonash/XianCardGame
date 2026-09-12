"""包导出契约测试（INTERFACES §1.8 / §2）。

下游（training / evaluation / app）只依赖这些名字，缺一个都会导致集成失败。
"""

from __future__ import annotations

import importlib
import inspect


def test_game_package_exports_frozen_names():
    game = importlib.import_module("game")
    for name in (
        "Card",
        "CardSpec",
        "CARD_SPECS",
        "CARD_ORDER",
        "API_CARD_ID",
        "card_spec",
        "GameConfig",
        "Action",
        "ActionKind",
        "GameState",
        "Phase",
    ):
        assert hasattr(game, name), f"game/__init__.py 缺少导出：{name}"
    # §1.1 里还冻结了索引映射表
    for name in ("CARD_TO_INDEX", "INDEX_TO_CARD", "CARD_BY_API_ID"):
        assert hasattr(game, name), f"game 包缺少：{name}"
    # 下游额外用到的（app/services/events.py 等）
    for name in ("KIND_TO_CARD", "API_ACTION_TYPE", "action_id", "PHASE_API_NAME"):
        assert hasattr(game, name), f"game 包缺少：{name}"


def test_agents_package_exports_frozen_names():
    agents = importlib.import_module("agents")
    for name in (
        "BaseAgent",
        "RandomAgent",
        "RuleAgent",
        "ISMCTSAgent",
        "MCCFRAgent",
        "AGENT_INFOS",
        "parse_agent",
    ):
        assert hasattr(agents, name), f"agents/__init__.py 缺少导出：{name}"
    # 子模块路径也必须按契约存在
    from agents.ismcts.agent import ISMCTSAgent  # noqa: F401
    from agents.mccfr.agent import MCCFRAgent as MCCFRAgentFromModule  # noqa: F401
    from agents.random_agent import RandomAgent  # noqa: F401
    from agents.rule_agent import RuleAgent as RuleAgentFromModule  # noqa: F401
    from agents.registry import AGENT_INFOS as AGENT_INFOS_FROM_REGISTRY  # noqa: F401


def test_base_agent_signature_matches_contract():
    from agents import BaseAgent

    signature = inspect.signature(BaseAgent.act)
    assert list(signature.parameters) == ["self", "state", "player"]
    assert hasattr(BaseAgent, "name")
    # 冻结签名：act(self, state: GameState, player: int) -> Action
    # （源文件用了 `from __future__ import annotations`，因此注解是字符串）
    annotations = inspect.get_annotations(BaseAgent.act)
    assert annotations == {"state": "GameState", "player": "int", "return": "Action"}

    # 用 agents.base 的类型检查命名空间解析注解，验证指向的就是冻结的类型
    import agents.base as base_module
    import game.actions
    import game.state

    resolved = inspect.get_annotations(
        BaseAgent.act,
        eval_str=True,
        globals={
            **base_module.__dict__,
            "GameState": game.state.GameState,
            "Action": game.actions.Action,
            "int": int,
        },
    )
    assert resolved["state"] is game.state.GameState
    assert resolved["player"] is int
    assert resolved["return"] is game.actions.Action


def test_game_state_frozen_signatures_exist():
    from game import GameState

    for name in (
        "reset",
        "clone",
        "is_terminal",
        "decision_player",
        "legal_actions",
        "step",
        "utilities",
        "infoset_key",
        "observation",
        "public_state",
        "legal_action_dicts",
        "determinize_for",
        "debug_string",
    ):
        assert callable(getattr(GameState, name, None)), f"GameState 缺少方法：{name}"

    assert list(inspect.signature(GameState.__init__).parameters) == [
        "self",
        "config",
        "seed",
    ]
    assert list(inspect.signature(GameState.infoset_key).parameters) == ["self", "player"]
    assert list(inspect.signature(GameState.determinize_for).parameters) == [
        "self",
        "observer",
        "seed",
    ]
    assert list(inspect.signature(GameState.debug_string).parameters) == [
        "self",
        "reveal_all",
    ]
    assert list(inspect.signature(GameState.step).parameters) == ["self", "action"]
    assert list(inspect.signature(GameState.observation).parameters) == ["self", "player"]
    assert list(inspect.signature(GameState.legal_action_dicts).parameters) == [
        "self",
        "player",
    ]


def test_ismcts_and_mccfr_signatures():
    from agents import ISMCTSAgent, MCCFRAgent, RandomAgent, RuleAgent

    params = inspect.signature(ISMCTSAgent.__init__).parameters
    assert list(params) == [
        "self",
        "simulations",
        "exploration",
        "max_depth",
        "seed",
        "rollout_agent",
    ]
    assert params["simulations"].default == 500
    assert params["exploration"].default == 1.4
    assert params["max_depth"].default == 250

    assert list(inspect.signature(MCCFRAgent.__init__).parameters) == [
        "self",
        "trainer",
        "seed",
    ]
    assert list(inspect.signature(MCCFRAgent.load).parameters) == ["path", "seed"]
    assert list(inspect.signature(RandomAgent.__init__).parameters) == ["self", "seed"]
    assert list(inspect.signature(RuleAgent.__init__).parameters) == ["self", "seed"]
    assert inspect.signature(RandomAgent.__init__).parameters["seed"].default == 0
    assert inspect.signature(RuleAgent.__init__).parameters["seed"].default == 0


def test_parse_agent_signature():
    from agents import parse_agent

    assert list(inspect.signature(parse_agent).parameters) == ["spec", "seed"]
    assert inspect.signature(parse_agent).parameters["seed"].default == 0

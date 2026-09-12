"""命中率（训练覆盖度）统计测试。

**为什么必须有这一组测试**：`MCCFRAgent` 在未见过的信息集上会回落到 `RuleAgent`
（spec §33）。如果一次评测里 80%+ 的决策都是回落，那么「MCCFR 胜率 X%」衡量的是
RuleAgent，而不是 MCCFR——没有命中率，胜率数字就不能用来判断训练是否让 AI 变强。

这里用两个极端情形（**全部命中** / **全部未命中**）把统计口径钉死。
"""

from __future__ import annotations

import pytest

from agents import MCCFRAgent, RandomAgent
from evaluation import format_mccfr_coverage, run_tournament
from evaluation.match import play_game
from evaluation.metrics import HIT_RATE_WARNING_THRESHOLD, hit_rate
from game import GameConfig, GameState


class _AlwaysContains(dict):
    """`in` 永远为 True 的 dict：模拟「训练表覆盖了所有信息集」。"""

    def __contains__(self, key) -> bool:  # type: ignore[override]
        return True


class _StubTrainer:
    """最小 trainer 替身：只实现 MCCFRAgent 需要的接口。

    `deterministic=True` 时给出「永远选第一个合法动作」的退化策略，
    这样同一 seed 的两局完全一致，方便断言「统计没有跨评测累计」。
    """

    def __init__(self, always_hit: bool, deterministic: bool = False) -> None:
        self.strategy_sum = _AlwaysContains() if always_hit else {}
        self.regret_sum = {}
        self.knows_all = always_hit
        self.deterministic = deterministic

    def average_strategy(self, state: GameState, player: int) -> dict[str, float]:
        legal = state.legal_actions()
        if self.deterministic:
            return {action.key(): (1.0 if index == 0 else 0.0) for index, action in enumerate(legal)}
        prob = 1.0 / len(legal)
        return {action.key(): prob for action in legal}


# --------------------------------------------------------------------- 单元口径


def test_hit_rate_math() -> None:
    assert hit_rate(0, 0) == 0.0
    assert hit_rate(41, 247) == pytest.approx(41 / 247)
    assert hit_rate(10, 10) == 1.0
    assert hit_rate(0, 10) == 0.0
    assert hit_rate(99, 10) == 1.0  # 越界输入被裁剪


def test_agent_stats_extremes() -> None:
    """全部命中 / 全部未命中两个极端。"""
    config = GameConfig(num_players=2, seed=42)

    hit_agent = MCCFRAgent(_StubTrainer(always_hit=True), seed=1)
    miss_agent = MCCFRAgent(_StubTrainer(always_hit=False), seed=2)

    result = play_game(config, [hit_agent, miss_agent], seed=7)

    hit_stats = hit_agent.stats()
    miss_stats = miss_agent.stats()

    assert hit_stats["decisions"] > 0
    assert hit_stats["hit"] == hit_stats["decisions"]
    assert hit_stats["fallback"] == 0
    assert hit_stats["hit_rate"] == 1.0

    assert miss_stats["decisions"] > 0
    assert miss_stats["hit"] == 0
    assert miss_stats["fallback"] == miss_stats["decisions"]
    assert miss_stats["hit_rate"] == 0.0

    # 两名玩家各自的决策数之和 = 本局总决策数（口径对齐）
    assert hit_stats["decisions"] + miss_stats["decisions"] == result.decisions


def test_reset_stats() -> None:
    config = GameConfig(num_players=2, seed=42)
    agent = MCCFRAgent(_StubTrainer(always_hit=False), seed=3)
    play_game(config, [agent, RandomAgent(1)], seed=1)
    assert agent.stats()["decisions"] > 0

    agent.reset_stats()
    stats = agent.stats()
    assert stats == {"decisions": 0, "hit": 0, "fallback": 0, "hit_rate": 0.0}

    play_game(config, [agent, RandomAgent(1)], seed=2)
    assert agent.stats()["decisions"] > 0


def test_fresh_trainer_means_all_fallback() -> None:
    """未训练过的 trainer：每个决策都回落 RuleAgent。"""
    from training import MCCFRTrainer

    config = GameConfig(num_players=2, seed=42)
    agent = MCCFRAgent(MCCFRTrainer(config, seed=1, metrics_path=None), seed=1)
    play_game(config, [agent, RandomAgent(1)], seed=11)
    stats = agent.stats()
    assert stats["decisions"] > 0
    assert stats["hit_rate"] == 0.0


# --------------------------------------------------------------------- 报表格式


def test_coverage_report_empty() -> None:
    assert format_mccfr_coverage({}) == ""


def test_coverage_report_warns_when_low() -> None:
    text = format_mccfr_coverage(
        {"0:MCCFR-10K": {"decisions": 247, "hit": 41, "fallback": 206, "hit_rate": 0.166}}
    )
    assert "MCCFR 命中率（训练覆盖度）" in text
    assert "决策 247" in text
    assert "命中训练信息集 41 (16.6%)" in text
    assert "回落 Rule 206 (83.4%)" in text
    assert "⚠" in text
    assert "不能据此判断 MCCFR 强度" in text


def test_coverage_report_no_warning_when_high() -> None:
    text = format_mccfr_coverage(
        {"0:MCCFR": {"decisions": 100, "hit": 90, "fallback": 10, "hit_rate": 0.9}}
    )
    assert "90.0%" in text
    assert "⚠" not in text


def test_coverage_report_no_warning_for_zero_decisions() -> None:
    text = format_mccfr_coverage(
        {"0:MCCFR": {"decisions": 0, "hit": 0, "fallback": 0, "hit_rate": 0.0}}
    )
    assert text
    assert "⚠" not in text


def test_warning_threshold_value() -> None:
    assert HIT_RATE_WARNING_THRESHOLD == 0.5


# --------------------------------------------------------------------- 端到端


def test_tournament_reports_all_hit_rate() -> None:
    config = GameConfig(num_players=2, seed=42)
    agents = [MCCFRAgent(_StubTrainer(always_hit=True), seed=1), RandomAgent(2)]
    result = run_tournament(
        config, ["mccfr:stub-hit", "random"], games=3, seed=1, agents=agents
    )
    label = "0:mccfr:stub-hit"
    assert result["hit_rates"] == {label: 1.0}
    assert result["mccfr_stats"][label]["fallback"] == 0
    # 非 MCCFR agent 不进命中率统计
    assert "1:random" not in result["hit_rates"]
    assert "命中率（训练覆盖度）" in result["report"]
    assert "⚠" not in result["report"]


def test_tournament_reports_all_fallback_rate() -> None:
    config = GameConfig(num_players=2, seed=42)
    agents = [MCCFRAgent(_StubTrainer(always_hit=False), seed=1), RandomAgent(2)]
    result = run_tournament(
        config, ["mccfr:stub-miss", "random"], games=3, seed=1, agents=agents
    )
    label = "0:mccfr:stub-miss"
    assert result["hit_rates"] == {label: 0.0}
    stats = result["mccfr_stats"][label]
    assert stats["hit"] == 0
    assert stats["fallback"] == stats["decisions"] > 0
    assert "⚠" in result["report"]
    assert "不能据此判断 MCCFR 强度" in result["report"]


def test_tournament_resets_stats_between_runs() -> None:
    """同一批 agent 跑两次评测，第二次的数字不应叠加第一次的。

    两个座位都用确定性 stub（永远选第一个合法动作），保证两次评测的对局完全一致，
    于是「已复位」意味着两次的决策数严格相等（未复位则第二次约为 2 倍）。
    """
    config = GameConfig(num_players=2, seed=42)
    agents = [
        MCCFRAgent(_StubTrainer(always_hit=True, deterministic=True), seed=1),
        MCCFRAgent(_StubTrainer(always_hit=True, deterministic=True), seed=2),
    ]
    first = run_tournament(config, ["mccfr:s", "mccfr:t"], games=3, seed=1, agents=agents)
    before = first["mccfr_stats"]["0:mccfr:s"]["decisions"]

    second = run_tournament(config, ["mccfr:s", "mccfr:t"], games=3, seed=1, agents=agents)
    after = second["mccfr_stats"]["0:mccfr:s"]["decisions"]

    assert before > 0
    assert after == before, f"命中率统计未在评测开始时复位：before={before} after={after}"


def test_mixed_tournament_hit_rate_keys() -> None:
    """多 MCCFR agent 时，hit_rates 的键必须与 labels 对齐。"""
    config = GameConfig(num_players=2, seed=42)
    agents = [
        MCCFRAgent(_StubTrainer(always_hit=True), seed=1),
        MCCFRAgent(_StubTrainer(always_hit=False), seed=2),
    ]
    result = run_tournament(config, ["mccfr:a", "mccfr:b"], games=2, seed=3, agents=agents)
    assert set(result["hit_rates"]) == set(result["labels"])
    assert result["hit_rates"]["0:mccfr:a"] == 1.0
    assert result["hit_rates"]["1:mccfr:b"] == 0.0

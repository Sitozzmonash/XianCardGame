"""`evaluation/tournament.py` 单元测试：批量对局、座位随机化、Wilson CI、Elo 汇总。"""

from __future__ import annotations

import pytest

from agents import RandomAgent, RuleAgent
from evaluation import format_tournament, run_tournament
from game import GameConfig


def test_tournament_basic_shape() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["random", "rule"], games=20, seed=1)

    assert result["games"] == 20
    assert result["labels"] == ["0:random", "1:rule"]
    assert set(result["wins"]) == set(result["labels"])
    assert set(result["win_rates"]) == set(result["labels"])
    assert set(result["ci95"]) == set(result["labels"])
    assert result["draws"] >= 0
    assert result["avg_decisions"] > 0
    assert result["players"] == 2

    # 胜场 + 平局 = 总局数
    assert sum(result["wins"].values()) + result["draws"] == 20
    for label in result["labels"]:
        low, high = result["ci95"][label]
        assert 0.0 <= low <= high <= 1.0
        assert result["win_rates"][label] == pytest.approx(result["wins"][label] / 20)


def test_tournament_ci95_is_wilson() -> None:
    from evaluation.metrics import wilson_ci

    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["random", "rule"], games=12, seed=5)
    label = result["labels"][0]
    assert result["ci95"][label] == pytest.approx(list(wilson_ci(result["wins"][label], 12)))


def test_rule_beats_random_by_a_clear_margin() -> None:
    """spec §61 问题 1：RuleAgent 应明显强于 RandomAgent（500 局，2 人）。"""
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["random", "rule"], games=300, seed=2024)
    random_rate = result["win_rates"]["0:random"]
    rule_rate = result["win_rates"]["1:rule"]
    assert rule_rate > random_rate, f"规则 AI 胜率 {rule_rate} 应高于随机 AI {random_rate}"
    assert rule_rate > 0.6, f"300 局下规则 AI 胜率应显著高于 60%，实际 {rule_rate:.2%}"


def test_seat_randomization_stats() -> None:
    config = GameConfig(num_players=3, seed=42)
    result = run_tournament(config, ["random", "rule", "random"], games=30, seed=8)

    assert set(result["seat_win_rates"]) == set(result["labels"])
    for label in result["labels"]:
        rates = result["seat_win_rates"][label]
        assert set(rates) == {0, 1, 2}
        # 座位随机化后每个 Agent 每个座位都应坐到（局数足够时）
        assert sum(result["seat_games"][label].values()) == 30
    # 座位偏差表覆盖所有座位
    assert set(result["seat_bias"]) == {0, 1, 2}
    assert sum(result["seat_bias_games"].values()) == 30 * 3


def test_seat_randomization_can_be_disabled() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(
        config, ["random", "rule"], games=10, seed=3, seat_randomize=False
    )
    # 不换座位时，agent i 永远坐 seat i
    assert result["seat_games"]["0:random"] == {0: 10, 1: 0}
    assert result["seat_games"]["1:rule"] == {0: 0, 1: 10}


def test_agent_count_mismatch() -> None:
    config = GameConfig(num_players=3, seed=42)
    with pytest.raises(ValueError, match="agent_specs"):
        run_tournament(config, ["random", "rule"], games=5)


def test_negative_games_rejected() -> None:
    config = GameConfig(num_players=2, seed=42)
    with pytest.raises(ValueError, match="games"):
        run_tournament(config, ["random", "rule"], games=-1)


def test_zero_games_is_safe() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["random", "rule"], games=0, seed=1)
    assert result["games"] == 0
    assert result["draws"] == 0
    assert result["avg_decisions"] == 0.0
    assert all(rate == 0.0 for rate in result["win_rates"].values())


def test_accepts_agent_instances() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(
        config,
        [RuleAgent(1), RandomAgent(2)],
        games=6,
        seed=2,
        agents=[RuleAgent(1), RandomAgent(2)],
    )
    assert result["games"] == 6
    assert result["labels"] == ["0:规则AI", "1:随机AI"]


def test_elo_in_result() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["random", "rule"], games=20, seed=4)
    elo = result["elo"]
    assert elo["matches"] == 20
    assert set(elo["ratings"]) == set(result["labels"])
    assert "Elo" in result["elo_report"]


def test_decisions_histogram() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["random", "rule"], games=15, seed=6)
    hist = result["decisions_histogram"]
    assert sum(hist.values()) == 15
    assert all(isinstance(key, int) for key in hist)


def test_report_contains_required_sections() -> None:
    config = GameConfig(num_players=3, seed=42)
    result = run_tournament(config, ["random", "rule", "random"], games=10, seed=7)
    report = result["report"]
    assert "AI 对战结果" in report
    assert "总局数" in report
    assert "平均决策步数" in report
    assert "座位胜率表" in report
    assert "置信区间" in report
    assert "Elo" in report
    assert format_tournament(result) == report


def test_full_tournament_uses_ismcts() -> None:
    """至少跑一次真实的 ISMCTS 对局，确认 spec 解析链路可用。"""
    config = GameConfig(num_players=2, seed=42)
    result = run_tournament(config, ["ismcts:20", "random"], games=4, seed=11)
    assert result["games"] == 4
    assert sum(result["wins"].values()) + result["draws"] == 4


def test_progress_output(capsys) -> None:
    config = GameConfig(num_players=2, seed=42)
    run_tournament(config, ["random", "rule"], games=20, seed=1, progress=True)
    out = capsys.readouterr().out
    assert "已完成" in out

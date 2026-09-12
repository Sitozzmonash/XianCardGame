"""`evaluation/match.py` 单元测试：单局执行、日志、可复现、异常。"""

from __future__ import annotations

import pytest

from agents import RandomAgent, RuleAgent
from evaluation import play_game, play_series
from game import GameConfig, Phase


def test_play_game_two_players_random() -> None:
    config = GameConfig(num_players=2, seed=42)
    agents = [RandomAgent(1), RandomAgent(2)]
    result = play_game(config, agents, seed=123)

    assert result.state.is_terminal()
    assert result.state.phase is Phase.ENDED
    assert result.decisions > 0
    assert result.winner_seat in (0, 1, None)
    assert result.players == 2
    assert result.seed == 123
    assert isinstance(result.forced_stop, bool)


def test_play_game_three_players() -> None:
    config = GameConfig(num_players=3, seed=42)
    agents = [RuleAgent(1), RandomAgent(2), RandomAgent(3)]
    result = play_game(config, agents, seed=77)
    assert result.state.is_terminal()
    assert result.winner_seat in (0, 1, 2, None)


def test_play_game_agent_count_mismatch() -> None:
    config = GameConfig(num_players=3, seed=42)
    with pytest.raises(ValueError, match="Agent 数量"):
        play_game(config, [RandomAgent(1), RandomAgent(2)], seed=1)


def test_play_game_is_reproducible() -> None:
    config = GameConfig(num_players=2, seed=42)
    first = play_game(config, [RandomAgent(5), RuleAgent(6)], seed=2024)
    second = play_game(config, [RandomAgent(5), RuleAgent(6)], seed=2024)
    assert first.winner_seat == second.winner_seat
    assert first.decisions == second.decisions
    assert first.state.logs == second.state.logs


def test_play_game_different_seed_differs() -> None:
    config = GameConfig(num_players=2, seed=42)
    first = play_game(config, [RandomAgent(5), RandomAgent(6)], seed=1)
    second = play_game(config, [RandomAgent(5), RandomAgent(6)], seed=2)
    assert (first.winner_seat, first.decisions) != (second.winner_seat, second.decisions)


def test_log_sink_receives_chinese_lines() -> None:
    config = GameConfig(num_players=2, seed=42)
    lines: list[str] = []
    play_game(config, [RandomAgent(1), RandomAgent(2)], seed=9, log_sink=lines.append)
    assert lines, "log_sink 应收到日志"
    assert any("决策" in line for line in lines)
    assert lines[0].startswith("=== 开局")


def test_verbose_prints(capsys) -> None:
    config = GameConfig(num_players=2, seed=42)
    play_game(config, [RandomAgent(1), RandomAgent(2)], seed=3, verbose=True)
    out = capsys.readouterr().out
    assert "赢家" in out
    assert "[决策]" in out


def test_play_series() -> None:
    config = GameConfig(num_players=2, seed=42)
    results = play_series(config, [RandomAgent(1), RandomAgent(2)], games=5, seed=11)
    assert len(results) == 5
    assert all(result.state.is_terminal() for result in results)
    # seed 派生：同一批参数应当可复现
    again = play_series(config, [RandomAgent(1), RandomAgent(2)], games=5, seed=11)
    assert [r.winner_seat for r in results] == [r.winner_seat for r in again]


def test_result_is_draw_flag() -> None:
    config = GameConfig(num_players=2, seed=42)
    result = play_game(config, [RandomAgent(1), RandomAgent(2)], seed=1)
    assert result.is_draw == (result.winner_seat is None)

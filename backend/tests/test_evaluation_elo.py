"""`evaluation/elo.py` 单元测试：Elo 更新、多人对局、报表。"""

from __future__ import annotations

import pytest

from evaluation.elo import DEFAULT_INITIAL, EloTable, MatchOutcome


def test_default_rating() -> None:
    table = EloTable()
    assert table.rating("未知") == DEFAULT_INITIAL
    assert table.table == {}
    assert len(table) == 0


def test_two_player_win_updates_both() -> None:
    table = EloTable()
    table.update([MatchOutcome(("a", "b"), "a")])
    assert table.rating("a") > DEFAULT_INITIAL
    assert table.rating("b") < DEFAULT_INITIAL
    # 两人对局是零和的：分数变化之和为 0
    assert table.rating("a") + table.rating("b") == pytest.approx(2 * DEFAULT_INITIAL)
    assert table.wins == {"a": 1}
    assert table.games == {"a": 1, "b": 1}
    assert table.matches == 1


def test_draw_leaves_ratings_close() -> None:
    table = EloTable()
    table.update([MatchOutcome(("a", "b"), None)])
    assert table.rating("a") == pytest.approx(DEFAULT_INITIAL)
    assert table.rating("b") == pytest.approx(DEFAULT_INITIAL)
    assert table.wins.get("a", 0) == 0


def test_upset_moves_more_than_expected() -> None:
    table = EloTable()
    # 先让 a 变强
    for _ in range(20):
        table.update([MatchOutcome(("a", "b"), "a")])
    strong_before, weak_before = table.rating("a"), table.rating("b")
    assert strong_before > weak_before

    # 弱者爆冷赢一局：强者掉分、弱者大涨（涨分幅度远大于「强者按预期取胜」）
    table.update([MatchOutcome(("a", "b"), "b")])
    upset_gain = table.rating("b") - weak_before
    assert upset_gain > 20.0
    assert strong_before > table.rating("a")

    strong_before = table.rating("a")
    table.update([MatchOutcome(("a", "b"), "a")])
    expected_gain = table.rating("a") - strong_before
    assert expected_gain < upset_gain


def test_three_players_all_decided() -> None:
    table = EloTable()
    table.update([MatchOutcome(("a", "b", "c"), "a")])
    assert table.rating("a") > DEFAULT_INITIAL
    assert table.rating("b") < DEFAULT_INITIAL
    assert table.rating("c") < DEFAULT_INITIAL
    # 多人局不是零和的（被第三方击败的那对双方都算负），因此只要求总和不增加
    assert sum(table.table.values()) <= 3 * DEFAULT_INITIAL


def test_multiplayer_draw_is_neutral_sum() -> None:
    table = EloTable()
    table.update([MatchOutcome(("a", "b", "c"), None)])
    assert sum(table.table.values()) == pytest.approx(3 * DEFAULT_INITIAL)


def test_accepts_tuple_and_dict_results() -> None:
    table = EloTable()
    table.update([(("a", "b"), "a")])
    table.update([{"players": ("a", "b"), "winner": "b"}])
    assert table.matches == 2
    # 一胜一负后回到初始分附近（第二次失利时对手分已更高，所以略低）
    assert table.rating("a") == pytest.approx(DEFAULT_INITIAL, abs=3.0)
    assert table.rating("b") == pytest.approx(DEFAULT_INITIAL, abs=3.0)
    assert table.wins == {"a": 1, "b": 1}


def test_match_outcome_validation() -> None:
    with pytest.raises(ValueError):
        MatchOutcome(("a",), "a")
    with pytest.raises(ValueError):
        MatchOutcome(("a", "b"), "c")


def test_bad_result_type_raises() -> None:
    table = EloTable()
    with pytest.raises(TypeError):
        table.update([42])


def test_report_contains_labels_and_title() -> None:
    table = EloTable()
    table.update([MatchOutcome(("rule", "random"), "rule")])
    text = table.report()
    assert "Elo" in text
    assert "rule" in text and "random" in text
    assert "局数" in text


def test_to_dict() -> None:
    table = EloTable()
    table.update([MatchOutcome(("a", "b"), "a")])
    payload = table.to_dict()
    assert payload["matches"] == 1
    assert set(payload["ratings"]) == {"a", "b"}
    assert payload["k"] == table.k


def test_table_sorted_desc() -> None:
    table = EloTable()
    for _ in range(10):
        table.update([MatchOutcome(("a", "b"), "a")])
    ratings = list(table.table.values())
    assert ratings == sorted(ratings, reverse=True)

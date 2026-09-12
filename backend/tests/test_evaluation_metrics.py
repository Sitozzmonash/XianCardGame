"""`evaluation/metrics.py` 单元测试：Wilson 置信区间与报表格式。"""

from __future__ import annotations

import math

import pytest

from evaluation.metrics import (
    Z_95,
    ci95_label,
    decisions_histogram,
    format_table,
    mean,
    stderr,
    summarize,
    wilson_ci,
    win_rate,
)


def test_wilson_ci_empty_sample() -> None:
    assert wilson_ci(0, 0) == (0.0, 0.0)


def test_wilson_ci_known_value() -> None:
    """50/100 的 Wilson 95% 区间约为 [40.38%, 59.62%]（教科书数值）。"""
    low, high = wilson_ci(50, 100)
    assert low == pytest.approx(0.4038, abs=1e-3)
    assert high == pytest.approx(0.5962, abs=1e-3)


def test_wilson_ci_bounds_inside_unit_interval() -> None:
    for wins, n in ((0, 10), (10, 10), (1, 3), (37, 40), (0, 1), (1, 1)):
        low, high = wilson_ci(wins, n)
        assert 0.0 <= low <= high <= 1.0


def test_wilson_ci_extremes() -> None:
    low, high = wilson_ci(0, 20)
    assert low == 0.0
    assert 0.0 < high < 0.2
    low, high = wilson_ci(20, 20)
    assert high == 1.0
    assert 0.8 < low < 1.0


def test_wilson_ci_shrinks_with_more_games() -> None:
    small = wilson_ci(50, 100)
    large = wilson_ci(5000, 10000)
    assert (large[1] - large[0]) < (small[1] - small[0])


def test_wilson_ci_centered_on_sample_mean() -> None:
    low, high = wilson_ci(30, 100)
    assert low < 0.30 < high


def test_wilson_ci_clamps_invalid_counts() -> None:
    assert wilson_ci(-5, 10) == wilson_ci(0, 10)
    assert wilson_ci(50, 10) == wilson_ci(10, 10)


def test_wilson_ci_z_parameter() -> None:
    narrow = wilson_ci(50, 100, z=1.0)
    wide = wilson_ci(50, 100, z=Z_95)
    assert (narrow[1] - narrow[0]) < (wide[1] - wide[0])


def test_win_rate() -> None:
    assert win_rate(3, 4) == 0.75
    assert win_rate(0, 0) == 0.0


def test_ci95_label_format() -> None:
    text = ci95_label(55, 100)
    assert "%" in text and "[" in text
    assert "55.00%" in text


def test_decisions_histogram() -> None:
    hist = decisions_histogram([20, 20, 30, 25, 20])
    assert hist == {20: 3, 25: 1, 30: 1}
    assert list(hist) == sorted(hist)


def test_mean_and_stderr() -> None:
    assert mean([]) == 0.0
    assert mean([1, 2, 3]) == 2.0
    assert stderr(0.5, 100) == pytest.approx(0.05)
    assert stderr(0.5, 0) == 0.0
    assert math.isclose(stderr(0.5, 4), 0.25)


def test_summarize() -> None:
    out = summarize({"a": 60, "b": 40}, 100)
    assert out["a"]["wins"] == 60
    assert out["a"]["win_rate"] == pytest.approx(0.6)
    assert len(out["a"]["ci95"]) == 2
    assert out["a"]["ci95"][0] < 0.6 < out["a"]["ci95"][1]


def test_format_table_aligns_chinese_and_ascii() -> None:
    text = format_table(["Agent", "胜率"], [["rule", "60%"], ["random", "40%"]])
    lines = text.splitlines()
    assert len(lines) == 4  # 表头 + 分隔线 + 2 行
    assert "Agent" in lines[0]
    assert set(lines[1]) == {"-", " "}
    # 中文按 2 字符宽对齐：可见宽度一致
    widths = {_visible_width(line) for line in (lines[0], lines[2], lines[3])}
    assert len(widths) == 1


def _visible_width(text: str) -> int:
    return sum(2 if ord(char) > 0x2000 else 1 for char in text)

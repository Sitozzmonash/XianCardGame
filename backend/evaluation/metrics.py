"""评测指标：Wilson 置信区间、胜率、决策步数直方图（spec §45 / §64）。

统计原则（spec §64）：**不要用 5 / 20 / 50 局下结论**，正式评测建议 1000–10000 局，
并给出 95% 置信区间，避免把随机波动当成算法强弱。
"""

from __future__ import annotations

import math
from typing import Iterable, Mapping, Sequence

#: 95% 置信度对应的标准正态分位数
Z_95 = 1.96


def win_rate(wins: int, n: int) -> float:
    """胜率；`n=0` 时返回 0.0（而不是抛 ZeroDivisionError）。"""
    if n <= 0:
        return 0.0
    return float(wins) / float(n)


def wilson_ci(wins: int, n: int, z: float = Z_95) -> tuple[float, float]:
    """Wilson score interval（比正态近似更稳，小样本 / 极端胜率都不会越界）。

    - `n == 0` → `(0.0, 0.0)`；
    - 返回 `(下界, 上界)`，均已裁剪到 `[0, 1]`。
    """
    wins = int(wins)
    n = int(n)
    if n <= 0:
        return (0.0, 0.0)
    if wins < 0:
        wins = 0
    if wins > n:
        wins = n

    p = wins / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p + z2 / (2.0 * n)) / denom
    half = (z * math.sqrt(p * (1.0 - p) / n + z2 / (4.0 * n * n))) / denom
    low = max(0.0, center - half)
    high = min(1.0, center + half)
    return (low, high)


def ci95_label(wins: int, n: int, z: float = Z_95) -> str:
    """把 Wilson 区间格式化成 `55.7% [50.1%, 61.2%]` 形式（中文报表用）。"""
    low, high = wilson_ci(wins, n, z)
    return f"{win_rate(wins, n) * 100:5.2f}% [{low * 100:5.2f}%, {high * 100:5.2f}%]"


def decisions_histogram(decisions: Iterable[int]) -> dict[int, int]:
    """决策步数直方图：`{决策步数: 局数}`（按步数升序）。"""
    hist: dict[int, int] = {}
    for value in decisions:
        key = int(value)
        hist[key] = hist.get(key, 0) + 1
    return dict(sorted(hist.items()))


def mean(values: Sequence[float]) -> float:
    """算术平均；空序列返回 0.0。"""
    if not values:
        return 0.0
    return sum(values) / len(values)


def stderr(p: float, n: int) -> float:
    """二项分布比例的标准误（画学习曲线时用）。"""
    if n <= 0:
        return 0.0
    return math.sqrt(max(0.0, p * (1.0 - p)) / n)


def format_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    """按等宽字体对齐的纯文本表格（中文列宽按 2 个字符宽估算）。"""
    widths = [
        max(_display_width(str(headers[i])), *[_display_width(str(r[i])) for r in rows])
        if rows
        else _display_width(str(headers[i]))
        for i in range(len(headers))
    ]
    lines = [
        "  ".join(_pad(str(headers[i]), widths[i]) for i in range(len(headers))),
        "  ".join("-" * widths[i] for i in range(len(headers))),
    ]
    for row in rows:
        lines.append("  ".join(_pad(str(row[i]), widths[i]) for i in range(len(row))))
    return "\n".join(lines)


def _display_width(text: str) -> int:
    """显示宽度：中日韩全角字符按 2 计。"""
    width = 0
    for char in text:
        width += 2 if _is_wide(char) else 1
    return width


def _is_wide(char: str) -> bool:
    code = ord(char)
    return (
        0x1100 <= code <= 0x115F
        or 0x2E80 <= code <= 0xA4CF
        or 0xAC00 <= code <= 0xD7A3
        or 0xF900 <= code <= 0xFAFF
        or 0xFE30 <= code <= 0xFE6F
        or 0xFF00 <= code <= 0xFF60
        or 0xFFE0 <= code <= 0xFFE6
    )


def _pad(text: str, width: int) -> str:
    return text + " " * max(0, width - _display_width(text))


def summarize(wins: Mapping[str, int], games: int, z: float = Z_95) -> dict:
    """把 `{label: wins}` 汇成 `{label: {wins, games, win_rate, ci95}}`。"""
    out: dict[str, dict] = {}
    for label, count in wins.items():
        low, high = wilson_ci(count, games, z)
        out[label] = {
            "wins": int(count),
            "games": int(games),
            "win_rate": win_rate(count, games),
            "ci95": [low, high],
        }
    return out


# --------------------------------------------------------------------------- 命中率

#: 命中率低于该值时，胜率不能作为「MCCFR 强度」的证据（只会是 RuleAgent 打出来的）
HIT_RATE_WARNING_THRESHOLD: float = 0.50


def hit_rate(hit: int, total: int) -> float:
    """命中率 = 命中已训练信息集的决策数 / 总决策数；`total=0` 时返回 0.0。"""
    if total <= 0:
        return 0.0
    return max(0.0, min(1.0, float(hit) / float(total)))


def format_mccfr_coverage(
    entries: Mapping[str, Mapping],
    title: str = "MCCFR 命中率（训练覆盖度）",
    threshold: float = HIT_RATE_WARNING_THRESHOLD,
) -> str:
    """中文命中率报表；命中率过低时追加一行 ⚠ 警告。

    `entries` 形如 `{label: {"decisions": 247, "hit": 41, "fallback": 206, "hit_rate": 0.166}}`
    （即 `MCCFRAgent.stats()` 的返回值）。空 `entries` 返回空字符串。
    """
    rows = [(label, dict(stats)) for label, stats in entries.items()]
    if not rows:
        return ""
    width = max(_display_width(label) for label, _ in rows)
    lines = [f"=== {title} ==="]
    warned = False
    for label, stats in rows:
        decisions = int(stats.get("decisions", 0))
        hit = int(stats.get("hit", 0))
        fallback = int(stats.get("fallback", decisions - hit))
        rate = hit_rate(hit, decisions)
        miss = hit_rate(fallback, decisions)
        lines.append(
            f"{_pad(label, width)}  决策 {decisions} | 命中训练信息集 {hit} ({rate:.1%}) | "
            f"回落 Rule {fallback} ({miss:.1%})"
        )
        if decisions > 0 and rate < threshold:
            warned = True
    if warned:
        lines.append(
            f"⚠ 命中率过低（<{threshold:.0%}）：胜率主要由 RuleAgent 决定，"
            "不能据此判断 MCCFR 强度"
        )
    return "\n".join(lines)


__all__ = [
    "Z_95",
    "wilson_ci",
    "ci95_label",
    "win_rate",
    "decisions_histogram",
    "mean",
    "stderr",
    "format_table",
    "summarize",
    "hit_rate",
    "format_mccfr_coverage",
    "HIT_RATE_WARNING_THRESHOLD",
]

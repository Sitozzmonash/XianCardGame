"""`evaluation` 包：对局、锦标赛、指标（Wilson CI）、Elo（冻结契约 §3.3）。"""

from __future__ import annotations

from .elo import DEFAULT_INITIAL, DEFAULT_K, EloTable, MatchOutcome
from .match import GameResult, LogSink, play_game, play_series
from .metrics import (
    HIT_RATE_WARNING_THRESHOLD,
    Z_95,
    ci95_label,
    decisions_histogram,
    format_mccfr_coverage,
    format_table,
    hit_rate,
    mean,
    stderr,
    summarize,
    wilson_ci,
    win_rate,
)
from .tournament import format_tournament, run_tournament

__all__ = [
    "GameResult",
    "play_game",
    "play_series",
    "LogSink",
    "run_tournament",
    "format_tournament",
    "wilson_ci",
    "ci95_label",
    "win_rate",
    "decisions_histogram",
    "summarize",
    "format_table",
    "hit_rate",
    "format_mccfr_coverage",
    "HIT_RATE_WARNING_THRESHOLD",
    "mean",
    "stderr",
    "Z_95",
    "EloTable",
    "MatchOutcome",
    "DEFAULT_K",
    "DEFAULT_INITIAL",
]

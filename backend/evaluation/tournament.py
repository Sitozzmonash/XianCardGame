"""锦标赛 / 批量对局（冻结契约 `docs/INTERFACES.md` §3.3，spec §42-§45）。

要点：

- **座位随机化**（spec §44）：每局把 Agent 随机分配到座位，避免「P0 永远先手」带来的偏差；
  同时统计每个 Agent 在各座位上的胜率，可以产出 Seat Bias Report。
- **多人终局**：`winner_seat=None` 记平局。
- **Wilson 95% 置信区间**：见 `evaluation/metrics.py`。
- **Elo**：按两两对阵更新（见 `evaluation/elo.py`）。
"""

from __future__ import annotations

import random
from typing import Any, Mapping, Optional, Sequence

from agents import BaseAgent, parse_agent
from game import GameConfig

from .elo import EloTable, MatchOutcome
from .match import GameResult, play_game
from .metrics import (
    ci95_label,
    decisions_histogram,
    format_mccfr_coverage,
    format_table,
    hit_rate,
    win_rate,
    wilson_ci,
)


def _label(index: int, spec: Any) -> str:
    """报表标签：`0:rule`、`1:ismcts:500`……（与参考实现一致）。"""
    text = spec if isinstance(spec, str) else getattr(spec, "name", repr(spec))
    return f"{index}:{text}"


def _build_agents(agent_specs: Sequence[Any], seed: int) -> list[BaseAgent]:
    """构造 Agent（每局复用同一批实例；`mccfr:<pkl>` 只从磁盘加载一次）。"""
    agents: list[BaseAgent] = []
    for index, spec in enumerate(agent_specs):
        if isinstance(spec, BaseAgent):
            agents.append(spec)
        else:
            agents.append(parse_agent(str(spec), seed + index * 104_729 + 13))
    return agents


def run_tournament(
    config: GameConfig,
    agent_specs: Sequence[Any],
    games: int,
    seed: int = 0,
    seat_randomize: bool = True,
    agents: Optional[Sequence[BaseAgent]] = None,
    progress: bool = False,
) -> dict:
    """跑 `games` 局多人对局并汇总指标。

    - `agent_specs` 支持 spec 字符串（`random` / `rule` / `ismcts:500` / `mccfr:x.pkl`），
      也支持直接传 `BaseAgent` 实例（测试与 benchmark 用）；
    - `agents` 可以给现成实例，跳过解析与加载；
    - `seat_randomize=True`（默认）每局随机换座位。
    """
    num_players = int(config.num_players)
    if len(agent_specs) != num_players:
        raise ValueError(
            f"agent_specs 数量（{len(agent_specs)}）必须等于 num_players（{num_players}）。"
        )
    games = int(games)
    if games < 0:
        raise ValueError("games 不能为负数。")

    labels = [_label(index, spec) for index, spec in enumerate(agent_specs)]
    roster: list[BaseAgent] = list(agents) if agents is not None else _build_agents(agent_specs, seed)

    # 命中率统计必须只反映本次评测：先把 roster 里的计数清零。
    for agent in roster:
        resetter = getattr(agent, "reset_stats", None)
        if callable(resetter):
            resetter()

    rng = random.Random(int(seed))
    wins: dict[str, int] = {label: 0 for label in labels}
    draws = 0
    forced_stops = 0
    total_decisions = 0
    decisions_seen: list[int] = []

    seat_games: dict[int, int] = {seat: 0 for seat in range(num_players)}
    seat_wins: dict[int, int] = {seat: 0 for seat in range(num_players)}
    agent_seat_games: dict[str, dict[int, int]] = {
        label: {seat: 0 for seat in range(num_players)} for label in labels
    }
    agent_seat_wins: dict[str, dict[int, int]] = {
        label: {seat: 0 for seat in range(num_players)} for label in labels
    }

    elo = EloTable()
    outcomes: list[MatchOutcome] = []

    for game_index in range(games):
        if seat_randomize and num_players > 1:
            permutation = list(range(num_players))
            rng.shuffle(permutation)
        else:
            permutation = list(range(num_players))
        # seat -> 参赛者下标（permutation[seat]）
        seat_agents = [roster[permutation[seat]] for seat in range(num_players)]

        for seat in range(num_players):
            seat_games[seat] += 1
            agent_seat_games[labels[permutation[seat]]][seat] += 1

        result: GameResult = play_game(
            config, seat_agents, seed + game_index * 7919 + 17
        )
        total_decisions += result.decisions
        decisions_seen.append(result.decisions)
        if result.forced_stop:
            forced_stops += 1

        if result.winner_seat is None:
            draws += 1
            winner_label: Optional[str] = None
        else:
            seat_wins[result.winner_seat] += 1
            winner_label = labels[permutation[result.winner_seat]]
            wins[winner_label] += 1
            agent_seat_wins[winner_label][result.winner_seat] += 1

        outcomes.append(MatchOutcome(tuple(labels), winner_label))

        if progress and games >= 20 and (game_index + 1) % max(1, games // 10) == 0:
            print(f"[评测] 已完成 {game_index + 1}/{games} 局", flush=True)

    elo.update(outcomes)

    win_rates = {label: win_rate(wins[label], games) for label in labels}
    ci95 = {label: list(wilson_ci(wins[label], games)) for label in labels}
    seat_win_rates = {
        label: {
            seat: win_rate(agent_seat_wins[label][seat], agent_seat_games[label][seat])
            for seat in range(num_players)
        }
        for label in labels
    }
    seat_bias = {
        seat: win_rate(seat_wins[seat], seat_games[seat]) for seat in range(num_players)
    }

    # 训练覆盖度：MCCFR 类 Agent 的命中率（没有 stats() 的 Agent 不参与统计）。
    mccfr_stats: dict[str, dict] = {}
    for label, agent in zip(labels, roster):
        stats_fn = getattr(agent, "stats", None)
        if callable(stats_fn):
            stats = dict(stats_fn())
            stats["hit_rate"] = hit_rate(
                int(stats.get("hit", 0)), int(stats.get("decisions", 0))
            )
            mccfr_stats[label] = stats
    hit_rates = {label: stats["hit_rate"] for label, stats in mccfr_stats.items()}

    payload: dict[str, Any] = {
        "games": games,
        "wins": wins,
        "win_rates": win_rates,
        "draws": draws,
        "forced_stops": forced_stops,
        "avg_decisions": (total_decisions / games) if games else 0.0,
        "avg_game_length": (total_decisions / games) if games else 0.0,
        "seat_win_rates": seat_win_rates,
        "seat_games": agent_seat_games,
        "seat_bias": seat_bias,
        "seat_bias_games": seat_games,
        "ci95": ci95,
        "decisions_histogram": decisions_histogram(decisions_seen),
        "hit_rates": hit_rates,
        "mccfr_stats": mccfr_stats,
        "elo": elo.to_dict(),
        "elo_report": elo.report(),
        "labels": labels,
        "agent_specs": [spec if isinstance(spec, str) else _label(i, spec) for i, spec in enumerate(agent_specs)],
        "seed": int(seed),
        "players": num_players,
        "seat_randomize": bool(seat_randomize),
    }
    payload["report"] = format_tournament(payload)
    return payload


def format_tournament(result: Mapping[str, Any]) -> str:
    """中文评测报表（spec §57）。"""
    games = int(result.get("games", 0))
    players = int(result.get("players", 2))
    lines: list[str] = []
    lines.append("=== AI 对战结果 ===")
    lines.append("")
    lines.append(f"总局数：{games}")
    lines.append(f"平局：{int(result.get('draws', 0))}")
    lines.append(f"平均决策步数：{float(result.get('avg_decisions', 0.0)):.1f}")
    if result.get("forced_stops"):
        lines.append(f"触发步数上限（强制平局）：{int(result['forced_stops'])}")
    lines.append("")
    lines.append("每名 Agent 的胜率与 Wilson 95% 置信区间：")
    rows = []
    for label in result.get("labels", []):
        wins = int(result["wins"].get(label, 0))
        low_high = result.get("ci95", {}).get(label, [0.0, 0.0])
        rows.append(
            [
                label[:40],
                str(wins),
                f"{result['win_rates'].get(label, 0.0) * 100:6.2f}%",
                f"[{low_high[0] * 100:5.2f}%, {low_high[1] * 100:5.2f}%]",
            ]
        )
    lines.append(format_table(["Agent", "胜场", "胜率", "95% 置信区间"], rows))
    lines.append("")
    lines.append("座位胜率表（每局随机换座位，spec §44）：")
    seat_rows = []
    for label in result.get("labels", []):
        rates = result.get("seat_win_rates", {}).get(label, {})
        seat_rows.append(
            [label[:28]] + [f"{rates.get(s, 0.0) * 100:6.2f}%" for s in range(players)]
        )
    lines.append(
        format_table(["Agent"] + [f"座位{s}" for s in range(players)], seat_rows)
    )
    lines.append("")
    bias_rows = [
        [f"座位{seat}", f"{rate * 100:6.2f}%", str(result.get("seat_bias_games", {}).get(seat, 0))]
        for seat, rate in sorted(result.get("seat_bias", {}).items())
    ]
    lines.append("座位偏差（所有 Agent 汇总）：")
    lines.append(format_table(["座位", "胜率", "局数"], bias_rows))
    ci_line = "、".join(
        f"{label.split(':', 1)[0]}号 {ci95_label(int(result['wins'].get(label, 0)), games)}"
        for label in result.get("labels", [])
    )
    if ci_line:
        lines.append("")
        lines.append(f"置信区间速览：{ci_line}")
    lines.append("")
    lines.append(str(result.get("elo_report", "")))
    coverage = format_mccfr_coverage(result.get("mccfr_stats") or {})
    if coverage:
        lines.append("")
        lines.append(coverage)
    return "\n".join(lines)


__all__ = ["run_tournament", "format_tournament"]

"""单局对局执行（冻结契约 `docs/INTERFACES.md` §3.3）。

`play_game()` 与参考实现 `reference/xiuxian_ai_demo/xiuxian/eval.py::play_game` 语义一致，
额外支持 `log_sink`（把中文事件流交给调用方，例如写文件或推给前端）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

from agents import BaseAgent
from game import GameConfig, GameState

#: 事件 / 决策日志回调
LogSink = Callable[[str], None]


@dataclass
class GameResult:
    """一局的结果。"""

    winner_seat: Optional[int]
    decisions: int
    forced_stop: bool
    state: GameState
    #: 便于报表的附加信息（有默认值，不破坏冻结契约）
    seed: int = 0
    players: int = 0
    turns: int = 0
    logs: list[str] = field(default_factory=list)

    @property
    def is_draw(self) -> bool:
        """无胜者（`max_decisions` 触发 forced_stop 或多人同归于尽）即平局。"""
        return self.winner_seat is None


def play_game(
    config: GameConfig,
    agents: Sequence[BaseAgent],
    seed: int,
    verbose: bool = False,
    log_sink: Optional[LogSink] = None,
) -> GameResult:
    """用 `agents`（按座位顺序）跑一局，返回 `GameResult`。

    - `len(agents)` 必须等于 `config.num_players`；
    - `verbose=True` 打印中文决策 / 事件流；
    - `log_sink` 每行都被调用一次（`verbose` 与 `log_sink` 可同时使用）。
    """
    if len(agents) != config.num_players:
        raise ValueError(
            f"Agent 数量（{len(agents)}）必须等于玩家数量（{config.num_players}）。"
        )

    def emit(line: str) -> None:
        if verbose:
            print(line)
        if log_sink is not None:
            log_sink(line)

    state = GameState(config, seed)
    emit(f"=== 开局：{config.num_players} 人，seed={seed} ===")

    while not state.is_terminal():
        player = state.decision_player()
        action = agents[player].act(state, player)
        emit(f"[决策] P{player} {agents[player].name} -> {action}")
        state.step(action)
        if state.logs:
            emit(f"[事件] {state.logs[-1]}")

    if verbose:
        emit("")
        emit("=" * 60)
        emit(state.debug_string(reveal_all=True))
        emit(f"赢家：{state.winner if state.winner is not None else '平局'}")

    return GameResult(
        winner_seat=state.winner,
        decisions=int(state.decision_count),
        forced_stop=bool(state.forced_stop),
        state=state,
        seed=int(seed),
        players=int(config.num_players),
        turns=int(state.turn_no),
        logs=list(state.logs),
    )


def play_series(
    config: GameConfig,
    agents: Sequence[BaseAgent],
    games: int,
    seed: int = 0,
) -> list[GameResult]:
    """连跑 `games` 局（每局 seed 由 `seed` 派生，可复现）。"""
    return [
        play_game(config, agents, seed + game * 7919 + 17)
        for game in range(int(games))
    ]


__all__ = ["GameResult", "play_game", "play_series", "LogSink"]

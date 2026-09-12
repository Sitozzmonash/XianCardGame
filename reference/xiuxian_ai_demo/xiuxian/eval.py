from __future__ import annotations
from dataclasses import dataclass
import random
from typing import Sequence
from .game import GameConfig, GameState
from .agents import BaseAgent, RandomAgent, RuleAgent, ISMCTSAgent
from .mccfr import MCCFRAgent

@dataclass
class GameResult:
    winner_seat: int | None
    decisions: int
    forced_stop: bool
    state: GameState

def play_game(config: GameConfig, agents: Sequence[BaseAgent], seed: int, verbose: bool = False) -> GameResult:
    if len(agents) != config.num_players:
        raise ValueError("Agent 数量必须等于玩家数量。")
    state = GameState(config, seed)

    while not state.is_terminal():
        p = state.decision_player()
        action = agents[p].act(state, p)
        if verbose:
            print(f"[决策] P{p} {agents[p].name} -> {action}")
        state.step(action)
        if verbose and state.logs:
            print(f"[事件] {state.logs[-1]}")

    if verbose:
        print("\n" + "=" * 60)
        print(state.debug_string(reveal_all=True))
        print(f"赢家：{state.winner if state.winner is not None else '平局'}")
    return GameResult(state.winner, state.decision_count, state.forced_stop, state)

def parse_agent(spec: str, seed: int = 0) -> BaseAgent:
    if spec == "random":
        return RandomAgent(seed)
    if spec == "rule":
        return RuleAgent(seed)
    if spec.startswith("ismcts"):
        parts = spec.split(":", 1)
        sims = int(parts[1]) if len(parts) == 2 else 500
        return ISMCTSAgent(simulations=sims, seed=seed)
    if spec.startswith("mccfr:"):
        path = spec.split(":", 1)[1]
        return MCCFRAgent.load(path, seed=seed)
    raise ValueError(f"未知 Agent：{spec}")

def run_tournament(config: GameConfig, agent_specs: list[str], games: int, seed: int = 0) -> dict:
    if len(agent_specs) != config.num_players:
        raise ValueError("agent_specs 数量必须等于 num_players。")

    rng = random.Random(seed)
    labels = [f"{i}:{spec}" for i, spec in enumerate(agent_specs)]
    wins = {label: 0 for label in labels}
    draws = 0
    total_decisions = 0

    for g in range(games):
        # 每局随机换座位，降低先手/座位偏差。
        perm = list(range(config.num_players))
        rng.shuffle(perm)
        seat_to_original = {seat: original for seat, original in enumerate(perm)}
        agents = [parse_agent(agent_specs[original], seed + g * 1009 + seat) for seat, original in seat_to_original.items()]
        result = play_game(config, agents, seed + g * 7919 + 17)
        total_decisions += result.decisions
        if result.winner_seat is None:
            draws += 1
        else:
            original = seat_to_original[result.winner_seat]
            wins[labels[original]] += 1

    return {
        "games": games,
        "wins": wins,
        "win_rates": {k: v / games for k, v in wins.items()},
        "draws": draws,
        "avg_decisions": total_decisions / max(1, games),
    }

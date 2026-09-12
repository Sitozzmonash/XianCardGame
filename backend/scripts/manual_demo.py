"""Demo 级验证脚本：Rule vs ISMCTS(50) vs Random 跑一局到终局，打印中文日志。

用法：
    cd D:/Documents/Hermes/xiuxian-card/backend
    .venv/Scripts/python.exe scripts/manual_demo.py            # 默认 seed=42
    .venv/Scripts/python.exe scripts/manual_demo.py 7 50       # seed=7, simulations=50

成功条件（脚本会自行断言）：
- 对局进入终局（`is_terminal()`）；
- `winner` 非 None（正常分出胜负，而不是强制结束的平局）；
- `decision_count < max_decisions`。
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from agents import ISMCTSAgent, RandomAgent, RuleAgent  # noqa: E402
from game import API_CARD_ID, GameConfig, GameState  # noqa: E402
from game.state import PHASE_API_NAME  # noqa: E402


def run(seed: int = 42, simulations: int = 50, num_players: int = 3, verbose: bool = True) -> dict:
    config = GameConfig(num_players=num_players, seed=seed)
    state = GameState(config, seed=seed)
    agents = [
        RuleAgent(seed + 1),
        ISMCTSAgent(simulations=simulations, seed=seed + 2),
        RandomAgent(seed + 3),
    ]
    labels = [f"P{i}={agent.name}" for i, agent in enumerate(agents)]

    if verbose:
        print("=== 修仙卡牌 AI Demo：规则AI vs ISMCTS vs 随机AI ===")
        print(f"seed={seed}  players={num_players}  simulations={simulations}")
        print("座位：" + "  ".join(labels))
        print(state.debug_string())
        print("-" * 72)

    steps = 0
    while not state.is_terminal():
        player = state.decision_player()
        action = agents[player].act(state, player)
        if action not in state.legal_actions():
            raise AssertionError(f"P{player} 给出非法动作：{action}")
        before = len(state.logs)
        state.step(action)
        steps += 1
        if verbose:
            for line in state.logs[before:]:
                print(f"  {line}")

    if verbose:
        print("-" * 72)
        print(state.debug_string(reveal_all=True))
        winner = "平局" if state.winner is None else f"P{state.winner}（{agents[state.winner].name}）"
        print(
            f"终局：winner={winner}  phase={PHASE_API_NAME[state.phase]}  "
            f"decisions={state.decision_count}  forced_stop={state.forced_stop}  "
            f"turn_no={state.turn_no}  日志{len(state.logs)}条"
        )
        print(f"收益 utilities={state.utilities()}")

    return {
        "state": state,
        "steps": steps,
        "winner": state.winner,
        "decision_count": state.decision_count,
    }


def main(argv: list[str]) -> int:
    seed = int(argv[1]) if len(argv) > 1 else 42
    simulations = int(argv[2]) if len(argv) > 2 else 50
    result = run(seed=seed, simulations=simulations)
    state = result["state"]

    assert state.is_terminal(), "对局未进入终局"
    assert result["winner"] is not None, "winner 为 None（强制结束/平局）"
    assert result["decision_count"] < state.config.max_decisions, (
        f"decision_count={result['decision_count']} 未小于 max_decisions={state.config.max_decisions}"
    )
    print()
    print(
        f"[OK] seed={seed} winner=P{result['winner']} "
        f"decisions={result['decision_count']} (< max_decisions={state.config.max_decisions})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

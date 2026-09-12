"""Single-Observer ISMCTS（教学版，spec §20-§25）。

算法定性完全保留参考实现：
1. 每次决策先 `state.determinize_for(player, seed)` 采样一个与当前观察一致的"可能世界"；
2. 在共享搜索树上做 UCT（`exploration` 控制探索）；
3. 到 `max_depth` 或终局后用 `rollout_agent`（默认 RuleAgent）加速 rollout；
4. 多次模拟后选择根节点访问次数最多的动作。

隐藏信息纪律（spec §59）：**唯一**接触隐藏信息的通道是 `determinize_for()`，
本模块从不读 `state.deck` / `state.hands[other]` / `state.known_top[other]`
（由 `tests/test_agents_no_cheat.py` 用访问监控代理自动断言）。
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional

from game.actions import Action
from game.state import GameState

from ..base import BaseAgent
from ..rule_agent import RuleAgent


@dataclass
class _Node:
    num_players: int
    visits: int = 0
    value_sum: list[float] = field(default_factory=list)
    children: dict[str, "_Node"] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.value_sum:
            self.value_sum = [0.0] * self.num_players


class ISMCTSAgent(BaseAgent):
    """Single-Observer ISMCTS 教学实现（不是工业级 MO-ISMCTS）。"""

    name = "ISMCTS"

    def __init__(
        self,
        simulations: int = 500,
        exploration: float = 1.4,
        max_depth: int = 250,
        seed: int = 0,
        rollout_agent: Optional[BaseAgent] = None,
    ):
        if simulations < 1:
            raise ValueError("simulations 至少为 1。")
        if max_depth < 1:
            raise ValueError("max_depth 至少为 1。")
        self.simulations = int(simulations)
        self.exploration = float(exploration)
        self.max_depth = int(max_depth)
        self.seed = int(seed)
        self.rng = random.Random(self.seed)
        self.rollout_agent: BaseAgent = (
            rollout_agent if rollout_agent is not None else RuleAgent(self.seed + 991)
        )

    def act(self, state: GameState, player: int) -> Action:
        legal_root = state.legal_actions()
        if len(legal_root) == 1:
            return legal_root[0]

        root = _Node(state.num_players)
        root_actions = {a.key(): a for a in legal_root}

        for _ in range(self.simulations):
            # 可能的真实世界：只通过 determinize_for 获得，不看真实隐藏信息。
            sim = state.determinize_for(player, self.rng.randrange(1 << 30))
            node = root
            path = [node]
            depth = 0

            while not sim.is_terminal() and depth < self.max_depth:
                legal = sim.legal_actions()
                if not legal:
                    break
                legal_map = {a.key(): a for a in legal}
                unexpanded = [a for a in legal if a.key() not in node.children]

                if unexpanded:
                    action = self.rng.choice(unexpanded)
                    child = _Node(sim.num_players)
                    node.children[action.key()] = child
                    sim.step(action)
                    node = child
                    path.append(node)
                    depth += 1
                    break

                acting = sim.decision_player()
                log_parent = math.log(max(1, node.visits))
                best_score = -1e18
                best_action: Optional[Action] = None
                best_child: Optional[_Node] = None
                for key, action in legal_map.items():
                    child = node.children.get(key)
                    if child is None:
                        continue
                    mean = child.value_sum[acting] / max(1, child.visits)
                    bonus = self.exploration * math.sqrt(log_parent / max(1, child.visits))
                    score = mean + bonus
                    if score > best_score:
                        best_score, best_action, best_child = score, action, child
                if best_action is None:
                    best_action = self.rng.choice(legal)
                    best_child = node.children.setdefault(
                        best_action.key(), _Node(sim.num_players)
                    )
                sim.step(best_action)
                node = best_child
                path.append(node)
                depth += 1

            # Rollout：用简单规则 AI 加速结束，而不是完全随机。
            while not sim.is_terminal() and depth < self.max_depth:
                acting = sim.decision_player()
                action = self.rollout_agent.act(sim, acting)
                sim.step(action)
                depth += 1

            values = sim.utilities()
            for n in path:
                n.visits += 1
                for i, v in enumerate(values):
                    n.value_sum[i] += v

        candidates = []
        for key, action in root_actions.items():
            child = root.children.get(key)
            if child:
                mean = child.value_sum[player] / max(1, child.visits)
                candidates.append((child.visits, mean, action))
        if not candidates:
            return self.rng.choice(legal_root)
        candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return candidates[0][2]

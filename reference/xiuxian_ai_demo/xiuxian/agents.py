from __future__ import annotations
from dataclasses import dataclass, field
import math
import random
from typing import Optional
from .game import GameState, Action, ActionKind, Card, Phase

class BaseAgent:
    name = "BaseAgent"
    def act(self, state: GameState, player: int) -> Action:
        raise NotImplementedError

class RandomAgent(BaseAgent):
    name = "随机AI"
    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        return self.rng.choice(legal)

class RuleAgent(BaseAgent):
    """简单规则 AI，用来做 baseline，不读取隐藏信息。"""
    name = "规则AI"

    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        if len(legal) == 1:
            return legal[0]

        if state.phase == Phase.COUNTER:
            counter = self._find(legal, ActionKind.PLAY_COUNTER)
            return counter or legal[0]

        if state.phase == Phase.REINSERT:
            # Demo 里的攻击型策略：尽量把天劫放回顶部，让下一家承压。
            return next(a for a in legal if a.param == "TOP")

        if state.phase == Phase.REORDER:
            cards = list(state.reorder_view)
            # 如果顶部三张里有天劫，把它尽量往后放。
            if Card.TRIBULATION in cards:
                idxs = list(range(len(cards)))
                idxs.sort(key=lambda i: cards[i] == Card.TRIBULATION)
                key = "".join(map(str, idxs))
                for a in legal:
                    if a.param == key:
                        return a
            return legal[0]

        known = state.known_top[player]
        if known and known[0] == Card.TRIBULATION:
            for kind in (ActionKind.PLAY_SKIP, ActionKind.PLAY_SHUFFLE, ActionKind.PLAY_REORDER):
                a = self._find(legal, kind)
                if a:
                    return a
            return self._find(legal, ActionKind.END_TURN) or legal[0]

        # 不知道牌顶时，优先花第一张行动获取信息。
        if not known and state.actions_used == 0:
            a = self._find(legal, ActionKind.PLAY_PEEK)
            if a:
                return a

        # 手牌偏少时尝试偷牌，目标选手牌最多的人。
        steals = [a for a in legal if a.kind == ActionKind.PLAY_STEAL]
        if steals and len(state.hands[player]) <= 5:
            return max(steals, key=lambda a: len(state.hands[a.target]))

        return self._find(legal, ActionKind.END_TURN) or legal[0]

    @staticmethod
    def _find(actions: list[Action], kind: ActionKind) -> Optional[Action]:
        return next((a for a in actions if a.kind == kind), None)

@dataclass
class _Node:
    num_players: int
    visits: int = 0
    value_sum: list[float] = field(default_factory=list)
    children: dict[str, "_Node"] = field(default_factory=dict)

    def __post_init__(self):
        if not self.value_sum:
            self.value_sum = [0.0] * self.num_players

class ISMCTSAgent(BaseAgent):
    """Single-Observer ISMCTS Demo。

    每次决策：
    1. 根据当前 Observation 采样一个可能世界；
    2. 在共享搜索树上做 UCT；
    3. 多次模拟后，选择根节点访问次数最多的动作。

    这是教学/实验实现，不是工业级 MO-ISMCTS。
    """
    name = "ISMCTS"

    def __init__(self, simulations: int = 500, exploration: float = 1.4, max_depth: int = 250, seed: int = 0):
        self.simulations = simulations
        self.exploration = exploration
        self.max_depth = max_depth
        self.rng = random.Random(seed)
        self.rollout_agent = RuleAgent(seed + 991)

    def act(self, state: GameState, player: int) -> Action:
        legal_root = state.legal_actions()
        if len(legal_root) == 1:
            return legal_root[0]

        root = _Node(state.num_players)
        root_actions = {a.key(): a for a in legal_root}

        for _ in range(self.simulations):
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
                best_action = None
                best_child = None
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
                    best_child = node.children.setdefault(best_action.key(), _Node(sim.num_players))
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

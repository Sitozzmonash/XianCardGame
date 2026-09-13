"""Agent 测试共用工具（不是 test_ 文件，pytest 不会收集）。

- `HiddenInfoProbe`：包装 GameState 的访问监控代理（作弊检测器）；
- 一组"故意作弊"的假 Agent（反向验证检测器真的能拦住）；
- `StubMCCFRTrainer`：鸭子类型的 MCCFRTrainer，让 MCCFRAgent 的测试不依赖 C3 的
  `training/` 包（两者接口一致：regret_sum / strategy_sum / average_strategy）。
"""

from __future__ import annotations

import random
from typing import Any, Callable, Optional

from agents.base import BaseAgent
from agents.common import regret_matching
from game.actions import Action, ActionKind
from game.cards import Card
from game.config import GameConfig
from game.state import GameState, Phase


# --------------------------------------------------------------- 作弊检测器


class _HiddenSequence:
    """按玩家下标的隐藏信息序列包装（hands / known_top）。"""

    def __init__(self, data, player: int, violations: list, label: str):
        object.__setattr__(self, "_data", data)
        object.__setattr__(self, "_player", player)
        object.__setattr__(self, "_violations", violations)
        object.__setattr__(self, "_label", label)

    def __getitem__(self, index):
        if not isinstance(index, int) or index != object.__getattribute__(self, "_player"):
            object.__getattribute__(self, "_violations").append(
                (object.__getattribute__(self, "_label"), f"读取了下标 {index!r}")
            )
        return object.__getattribute__(self, "_data")[index]

    def __iter__(self):
        object.__getattribute__(self, "_violations").append(
            (object.__getattribute__(self, "_label"), "整体遍历")
        )
        return iter(object.__getattribute__(self, "_data"))

    def __len__(self):  # 玩家数量是公开信息
        return len(object.__getattribute__(self, "_data"))


class HiddenInfoProbe:
    """把 GameState 包一层，记录 **agent** 对隐藏信息的每一次访问。

    - `state.deck`：任何访问都记为违规；
    - `state.hands[i]` / `state.known_top[i]`：`i != player` 记为违规；
    - 其他属性/方法（`legal_actions()`、`phase`、`hand_sizes()` ...）原样放行，
      因为规则引擎内部读牌堆是合法的，不应当归咎于 agent；
    - `determinize_for()` 是搜索类 AI 的合法通道，只记录观察者下标。
    """

    HIDDEN_ATTRS = ("deck", "hands", "known_top")

    def __init__(self, state: GameState, player: int):
        object.__setattr__(self, "_state", state)
        object.__setattr__(self, "_player", player)
        object.__setattr__(self, "violations", [])
        object.__setattr__(self, "determinize_calls", [])

    # -- 记录 ----------------------------------------------------------
    def _state_ref(self) -> GameState:
        return object.__getattribute__(self, "_state")

    def _player_ref(self) -> int:
        return object.__getattribute__(self, "_player")

    def _flag(self, label: str, detail: str) -> None:
        object.__getattribute__(self, "violations").append((label, detail))

    # -- 代理 ----------------------------------------------------------
    def __getattr__(self, name: str) -> Any:
        state = self._state_ref()
        player = self._player_ref()

        if name == "deck":
            self._flag("deck", "读取了真实牌堆")
            return state.deck
        if name == "hands":
            return _HiddenSequence(state.hands, player, object.__getattribute__(self, "violations"), "hands")
        if name == "known_top":
            return _HiddenSequence(
                state.known_top, player, object.__getattribute__(self, "violations"), "known_top"
            )
        if name == "reorder_view":
            if state.phase == Phase.REORDER and state.reorder_owner != player:
                self._flag("reorder_view", "读取了别人的改命私有视图")
            return state.reorder_view
        if name == "determinize_for":
            def _determinize(observer: int, seed: Optional[int] = None) -> GameState:
                object.__getattribute__(self, "determinize_calls").append(observer)
                return state.determinize_for(observer, seed)

            return _determinize
        return getattr(state, name)


# --------------------------------------------------------------- 反向验证用假 Agent


class DeckPeekingAgent(BaseAgent):
    """故意作弊：根据真实牌堆顶决定要不要洗牌（旧版是「要不要用遁术」）。

    遁术已改为反制阶段的反应牌，行动阶段不再可用，因此作弊点改为「洗牌 / 结束回合」。
    """

    name = "作弊-偷看牌堆"

    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        top = state.deck[0] if state.deck else None
        if top is Card.TRIBULATION:
            for action in legal:
                if action.kind == ActionKind.PLAY_SHUFFLE:
                    return action
        return legal[0]


class HandPeekingAgent(BaseAgent):
    """故意作弊：看别人手牌里有没有反制符。"""

    name = "作弊-偷看他人手牌"

    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        other = (player + 1) % len(state.hands)
        if state.hands[other]:
            return legal[0]
        return legal[-1]


class KnownTopPeekingAgent(BaseAgent):
    """故意作弊：读取别人的观星结果。"""

    name = "作弊-偷看他人观星"

    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        other = (player + 1) % state.num_players
        if state.known_top[other]:
            return legal[-1]
        return legal[0]


class OwnInfoOnlyAgent(BaseAgent):
    """只读自己的信息（合法），用于证明检测器不会误报。"""

    name = "合法-只读自己"

    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, state: GameState, player: int) -> Action:
        legal = state.legal_actions()
        own_hand = state.hands[player]
        own_known = state.known_top[player]
        sizes = state.hand_sizes()
        assert sizes[player] == len(own_hand)
        if own_known and own_known[0] == Card.TRIBULATION:
            return legal[-1]
        return legal[0]


# --------------------------------------------------------------- 驱动辅助


def run_probed_game(
    agent_factory: Callable[[int], BaseAgent],
    seed: int,
    num_players: int = 3,
    max_steps: int = 600,
) -> dict:
    """用监控代理跑完一局，收集违规记录。"""
    state = GameState(GameConfig(num_players=num_players, seed=seed), seed=seed)
    agents = {p: agent_factory(p) for p in range(num_players)}
    violations: list[tuple[str, str]] = []
    determinize_calls: list[int] = []
    steps = 0
    while not state.is_terminal() and steps < max_steps:
        player = state.decision_player()
        probe = HiddenInfoProbe(state, player)
        action = agents[player].act(probe, player)
        assert action in state.legal_actions(), f"P{player} 给了非法动作：{action}"
        violations.extend(probe.violations)
        determinize_calls.extend(probe.determinize_calls)
        assert all(o == player for o in probe.determinize_calls), (
            f"P{player} 用别的观察者做 determinization：{probe.determinize_calls}"
        )
        state.step(action)
        steps += 1
    return {
        "violations": violations,
        "determinize_calls": determinize_calls,
        "steps": steps,
        "state": state,
    }


def probe_once(agent: BaseAgent, state: GameState, player: int) -> tuple[list, list]:
    """对单个决策点做一次监控。"""
    probe = HiddenInfoProbe(state, player)
    action = agent.act(probe, player)
    assert action in state.legal_actions()
    return probe.violations, probe.determinize_calls


# --------------------------------------------------------------- 假 MCCFRTrainer


class StubMCCFRTrainer:
    """与 C3 的 MCCFRTrainer 接口一致的测试替身（不依赖 training 包）。"""

    def __init__(self, seed: int = 0, exploration: float = 0.6):
        self.seed = int(seed)
        self.exploration = float(exploration)
        self.regret_sum: dict[tuple, dict[str, float]] = {}
        self.strategy_sum: dict[tuple, dict[str, float]] = {}
        self.iterations_done = 0
        self.traversals_done = 0
        self.rng = random.Random(self.seed)

    def average_strategy(self, state: GameState, player: int) -> dict[str, float]:
        legal = state.legal_actions()
        info = state.infoset_key(player)
        sums = self.strategy_sum.get(info, {})
        values = {a.key(): max(0.0, sums.get(a.key(), 0.0)) for a in legal}
        total = sum(values.values())
        if total <= 1e-15:
            return regret_matching(self.regret_sum.get(info, {}), legal)
        return {k: v / total for k, v in values.items()}

    def register(self, state: GameState, player: int, uniform: bool = False) -> None:
        """人为登记一个信息集，让 MCCFRAgent 走"已知信息集"分支。"""
        legal = state.legal_actions()
        info = state.infoset_key(player)
        weights = {a.key(): 1.0 for a in legal} if uniform else {
            a.key(): float(i + 1) for i, a in enumerate(legal)
        }
        self.regret_sum[info] = {a.key(): 0.2 for a in legal}
        self.strategy_sum[info] = weights

    def register_from_game(self, seed: int, num_players: int = 3) -> int:
        """用 RuleAgent 自对弈一局，登记沿途所有信息集。"""
        from agents.rule_agent import RuleAgent

        state = GameState(GameConfig(num_players=num_players, seed=seed), seed=seed)
        agent = RuleAgent(seed)
        while not state.is_terminal():
            player = state.decision_player()
            self.register(state, player)
            state.step(agent.act(state, player))
        self.iterations_done += 1
        self.traversals_done += num_players
        return len(self.strategy_sum)

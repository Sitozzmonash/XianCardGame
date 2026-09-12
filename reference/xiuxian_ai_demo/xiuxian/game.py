from __future__ import annotations
from dataclasses import dataclass, asdict
from enum import Enum
from collections import Counter
from itertools import permutations
import copy
import random
from typing import Optional

class Card(str, Enum):
    TRIBULATION = "天劫"
    DEFUSE = "护劫符"
    PEEK = "观星术"
    REORDER = "逆天改命"
    SHUFFLE = "扰乱天机"
    SKIP = "遁术"
    STEAL = "摄物术"
    COUNTER = "反制符"

class Phase(str, Enum):
    ACTION = "行动"
    COUNTER = "反制"
    REORDER = "改命排序"
    REINSERT = "天劫回插"
    ENDED = "结束"

class ActionKind(str, Enum):
    END_TURN = "结束回合"
    PLAY_PEEK = "使用观星术"
    PLAY_REORDER = "使用逆天改命"
    PLAY_SHUFFLE = "使用扰乱天机"
    PLAY_SKIP = "使用遁术"
    PLAY_STEAL = "使用摄物术"
    PASS_COUNTER = "不反制"
    PLAY_COUNTER = "使用反制符"
    REORDER_TOP = "调整顶部牌序"
    REINSERT = "回插天劫"

@dataclass(frozen=True)
class Action:
    kind: ActionKind
    target: int = -1
    param: str = ""

    def key(self) -> str:
        return f"{self.kind.value}|{self.target}|{self.param}"

    def __str__(self) -> str:
        if self.target >= 0:
            return f"{self.kind.value}(目标=P{self.target}{', '+self.param if self.param else ''})"
        return f"{self.kind.value}{f'({self.param})' if self.param else ''}"

@dataclass
class GameConfig:
    num_players: int = 3
    initial_hand: int = 5
    max_actions_per_turn: int = 2
    max_decisions: int = 500
    seed: int = 42

    def validate(self) -> None:
        if not 2 <= self.num_players <= 6:
            raise ValueError("Demo 支持 2~6 名玩家。")
        if self.initial_hand < 2:
            raise ValueError("initial_hand 至少为 2。")
        if self.max_actions_per_turn < 1:
            raise ValueError("max_actions_per_turn 至少为 1。")

class GameState:
    """纯 Python 修仙卡牌环境。

    设计目标：
    1. 隐藏手牌、隐藏牌堆；
    2. 玩家只能根据自己的 Observation / Information Set 决策；
    3. 规则尽量小，便于 MCCFR / ISMCTS 做算法实验。
    """

    def __init__(self, config: GameConfig, seed: Optional[int] = None):
        config.validate()
        self.config = copy.deepcopy(config)
        self.rng = random.Random(config.seed if seed is None else seed)
        self.num_players = config.num_players
        self.hands: list[list[Card]] = [[] for _ in range(self.num_players)]
        self.deck: list[Card] = []
        self.discard: list[Card] = []
        self.alive: list[bool] = [True] * self.num_players
        self.known_top: list[list[Card]] = [[] for _ in range(self.num_players)]
        self.current_player = 0
        self.phase = Phase.ACTION
        self.actions_used = 0
        self.turn_no = 1
        self.decision_count = 0
        self.winner: Optional[int] = None
        self.forced_stop = False
        self.pending_actor: Optional[int] = None
        self.pending_target: Optional[int] = None
        self.reorder_owner: Optional[int] = None
        self.reorder_view: list[Card] = []
        self.reinsert_player: Optional[int] = None
        self.logs: list[str] = []
        self._setup()

    def _setup(self) -> None:
        n = self.num_players

        # 每人保证 1 张护劫符，避免开局第一次天劫直接退场。
        for p in range(n):
            self.hands[p].append(Card.DEFUSE)

        # 牌数量随玩家人数线性缩放，确保 2~6 人都能运行。
        safe_cards: list[Card] = []
        safe_cards += [Card.DEFUSE] * max(1, n // 2)
        safe_cards += [Card.PEEK] * (2 * n)
        safe_cards += [Card.REORDER] * n
        safe_cards += [Card.SHUFFLE] * n
        safe_cards += [Card.SKIP] * (2 * n)
        safe_cards += [Card.STEAL] * n
        safe_cards += [Card.COUNTER] * n
        self.rng.shuffle(safe_cards)

        # 初始手牌不发天劫。
        for _ in range(self.config.initial_hand - 1):
            for p in range(n):
                if safe_cards:
                    self.hands[p].append(safe_cards.pop())

        # N-1 张天劫，理论上最终只剩 1 名玩家。
        safe_cards += [Card.TRIBULATION] * (n - 1)
        self.rng.shuffle(safe_cards)
        self.deck = safe_cards
        self.current_player = self.rng.randrange(n)
        self._log(f"游戏开始：{n} 名修仙者，P{self.current_player} 先手，牌堆 {len(self.deck)} 张。")

    def clone(self) -> "GameState":
        """深拷贝状态，同时复制随机数状态，便于树搜索分支。"""
        new = object.__new__(GameState)
        new.config = copy.deepcopy(self.config)
        new.rng = random.Random()
        new.rng.setstate(self.rng.getstate())
        new.num_players = self.num_players
        new.hands = [list(h) for h in self.hands]
        new.deck = list(self.deck)
        new.discard = list(self.discard)
        new.alive = list(self.alive)
        new.known_top = [list(x) for x in self.known_top]
        new.current_player = self.current_player
        new.phase = self.phase
        new.actions_used = self.actions_used
        new.turn_no = self.turn_no
        new.decision_count = self.decision_count
        new.winner = self.winner
        new.forced_stop = self.forced_stop
        new.pending_actor = self.pending_actor
        new.pending_target = self.pending_target
        new.reorder_owner = self.reorder_owner
        new.reorder_view = list(self.reorder_view)
        new.reinsert_player = self.reinsert_player
        new.logs = list(self.logs)
        return new

    def is_terminal(self) -> bool:
        return self.phase == Phase.ENDED

    def decision_player(self) -> int:
        if self.phase == Phase.COUNTER:
            assert self.pending_target is not None
            return self.pending_target
        if self.phase == Phase.REORDER:
            assert self.reorder_owner is not None
            return self.reorder_owner
        if self.phase == Phase.REINSERT:
            assert self.reinsert_player is not None
            return self.reinsert_player
        return self.current_player

    def utilities(self) -> list[float]:
        """多人 constant-sum 终局收益：赢家 +1，其他人平分 -1。"""
        if self.forced_stop or self.winner is None:
            return [0.0] * self.num_players
        lose = -1.0 / max(1, self.num_players - 1)
        return [1.0 if p == self.winner else lose for p in range(self.num_players)]

    def legal_actions(self) -> list[Action]:
        if self.is_terminal():
            return []
        p = self.decision_player()

        if self.phase == Phase.COUNTER:
            actions = [Action(ActionKind.PASS_COUNTER)]
            if Card.COUNTER in self.hands[p]:
                actions.append(Action(ActionKind.PLAY_COUNTER))
            return actions

        if self.phase == Phase.REINSERT:
            return [
                Action(ActionKind.REINSERT, param="TOP"),
                Action(ActionKind.REINSERT, param="NEAR_TOP"),
                Action(ActionKind.REINSERT, param="MIDDLE"),
                Action(ActionKind.REINSERT, param="BOTTOM"),
            ]

        if self.phase == Phase.REORDER:
            k = len(self.reorder_view)
            if k <= 1:
                return [Action(ActionKind.REORDER_TOP, param="0")]
            return [Action(ActionKind.REORDER_TOP, param="".join(map(str, perm))) for perm in permutations(range(k))]

        # 正常行动阶段。
        actions = [Action(ActionKind.END_TURN)]
        if self.actions_used >= self.config.max_actions_per_turn:
            return actions
        hand = self.hands[p]
        if Card.PEEK in hand and self.deck:
            actions.append(Action(ActionKind.PLAY_PEEK))
        if Card.REORDER in hand and self.deck:
            actions.append(Action(ActionKind.PLAY_REORDER))
        if Card.SHUFFLE in hand and len(self.deck) > 1:
            actions.append(Action(ActionKind.PLAY_SHUFFLE))
        if Card.SKIP in hand:
            actions.append(Action(ActionKind.PLAY_SKIP))
        if Card.STEAL in hand:
            for target in range(self.num_players):
                if target != p and self.alive[target] and self.hands[target]:
                    actions.append(Action(ActionKind.PLAY_STEAL, target=target))
        return actions

    def step(self, action: Action) -> None:
        legal = self.legal_actions()
        if action not in legal:
            raise ValueError(f"非法动作：{action}；合法动作：{[str(a) for a in legal]}")
        self.decision_count += 1
        if self.decision_count > self.config.max_decisions:
            self.forced_stop = True
            self.phase = Phase.ENDED
            self._log("达到最大决策步数，强制结束，本局按平局处理。")
            return

        if self.phase == Phase.COUNTER:
            self._step_counter(action)
        elif self.phase == Phase.REORDER:
            self._step_reorder(action)
        elif self.phase == Phase.REINSERT:
            self._step_reinsert(action)
        else:
            self._step_action(action)

    def _step_action(self, action: Action) -> None:
        p = self.current_player
        if action.kind == ActionKind.END_TURN:
            self._draw_and_finish_turn(p)
            return

        if action.kind == ActionKind.PLAY_PEEK:
            self._consume(p, Card.PEEK)
            self.actions_used += 1
            self.known_top[p] = list(self.deck[:3])
            self._log(f"P{p} 使用【观星术】，查看牌堆顶部 {len(self.known_top[p])} 张。")
            return

        if action.kind == ActionKind.PLAY_REORDER:
            self._consume(p, Card.REORDER)
            self.actions_used += 1
            self.reorder_owner = p
            self.reorder_view = list(self.deck[: min(3, len(self.deck))])
            self.known_top[p] = list(self.reorder_view)
            self.phase = Phase.REORDER
            self._log(f"P{p} 使用【逆天改命】，准备调整顶部牌序。")
            return

        if action.kind == ActionKind.PLAY_SHUFFLE:
            self._consume(p, Card.SHUFFLE)
            self.actions_used += 1
            self.rng.shuffle(self.deck)
            self._clear_all_knowledge()
            self._log(f"P{p} 使用【扰乱天机】，牌堆被重新洗牌。")
            return

        if action.kind == ActionKind.PLAY_SKIP:
            self._consume(p, Card.SKIP)
            self.actions_used += 1
            self._log(f"P{p} 使用【遁术】，本回合不抽牌。")
            self._advance_turn_from(p)
            return

        if action.kind == ActionKind.PLAY_STEAL:
            self._consume(p, Card.STEAL)
            self.actions_used += 1
            self.pending_actor = p
            self.pending_target = action.target
            self.phase = Phase.COUNTER
            self._log(f"P{p} 对 P{action.target} 使用【摄物术】，等待目标决定是否反制。")
            return

        raise RuntimeError(f"未处理动作：{action}")

    def _step_counter(self, action: Action) -> None:
        actor, target = self.pending_actor, self.pending_target
        assert actor is not None and target is not None
        if action.kind == ActionKind.PLAY_COUNTER:
            self._consume(target, Card.COUNTER)
            self._log(f"P{target} 使用【反制符】，取消 P{actor} 的【摄物术】。")
        else:
            if self.hands[target]:
                idx = self.rng.randrange(len(self.hands[target]))
                card = self.hands[target].pop(idx)
                self.hands[actor].append(card)
                self._log(f"P{target} 未反制，P{actor} 随机偷走 1 张手牌。")
        self.pending_actor = self.pending_target = None
        self.current_player = actor
        self.phase = Phase.ACTION

    def _step_reorder(self, action: Action) -> None:
        owner = self.reorder_owner
        assert owner is not None
        k = len(self.reorder_view)
        order = [int(x) for x in action.param] if action.param else list(range(k))
        if sorted(order) != list(range(k)):
            raise ValueError("非法牌序。")
        old = list(self.deck[:k])
        self.deck[:k] = [old[i] for i in order]
        self._clear_all_knowledge()
        self.known_top[owner] = list(self.deck[:k])
        self._log(f"P{owner} 完成【逆天改命】，顶部 {k} 张牌的顺序已改变。")
        self.reorder_owner = None
        self.reorder_view = []
        self.phase = Phase.ACTION

    def _step_reinsert(self, action: Action) -> None:
        p = self.reinsert_player
        assert p is not None
        pos = self._reinsert_position(action.param)
        self.deck.insert(pos, Card.TRIBULATION)
        self._clear_all_knowledge()
        self._log(f"P{p} 使用【护劫符】后，将天劫秘密放回牌堆区域：{action.param}。")
        self.reinsert_player = None
        self._advance_turn_from(p)

    def _reinsert_position(self, bucket: str) -> int:
        n = len(self.deck)
        if bucket == "TOP":
            return 0
        if bucket == "NEAR_TOP":
            return min(n, 1 + self.rng.randrange(max(1, min(3, n + 1))))
        if bucket == "MIDDLE":
            lo, hi = n // 3, max(n // 3, (2 * n) // 3)
            return self.rng.randint(lo, hi) if hi >= lo else lo
        return n

    def _draw_and_finish_turn(self, p: int) -> None:
        if not self.deck:
            self.forced_stop = True
            self.phase = Phase.ENDED
            self._log("牌堆为空，Demo 按平局结束。")
            return
        card = self.deck.pop(0)
        self._shift_all_known_top()
        if card == Card.TRIBULATION:
            self._log(f"P{p} 抽到了【天劫】！")
            if Card.DEFUSE in self.hands[p]:
                self.hands[p].remove(Card.DEFUSE)
                self.discard.append(Card.DEFUSE)
                self.reinsert_player = p
                self.phase = Phase.REINSERT
                self._log(f"P{p} 自动消耗 1 张【护劫符】，需要选择天劫回插位置。")
                return
            self._eliminate(p, Card.TRIBULATION)
            return

        self.hands[p].append(card)
        self._log(f"P{p} 抽到 1 张牌（调试可见：{card.value}），回合结束。")
        self._advance_turn_from(p)

    def _eliminate(self, p: int, tribulation: Card) -> None:
        self.alive[p] = False
        self.discard.append(tribulation)
        self.discard.extend(self.hands[p])
        self.hands[p] = []
        self.known_top[p] = []
        self._log(f"P{p} 无法化解天劫，淘汰。")
        alive_players = [i for i, ok in enumerate(self.alive) if ok]
        if len(alive_players) == 1:
            self.winner = alive_players[0]
            self.phase = Phase.ENDED
            self._log(f"游戏结束，P{self.winner} 成为最后存活的修仙者。")
        else:
            self._advance_turn_from(p)

    def _advance_turn_from(self, p: int) -> None:
        if self.is_terminal():
            return
        for d in range(1, self.num_players + 1):
            q = (p + d) % self.num_players
            if self.alive[q]:
                self.current_player = q
                self.actions_used = 0
                self.phase = Phase.ACTION
                self.pending_actor = self.pending_target = None
                self.reorder_owner = None
                self.reorder_view = []
                self.turn_no += 1
                return

    def _consume(self, p: int, card: Card) -> None:
        self.hands[p].remove(card)
        self.discard.append(card)

    def _shift_all_known_top(self) -> None:
        # 只要牌堆顶部被抽走，所有玩家曾看到的顶部序列都向前移动 1 张。
        for p in range(self.num_players):
            if self.known_top[p]:
                self.known_top[p] = self.known_top[p][1:]

    def _clear_all_knowledge(self) -> None:
        self.known_top = [[] for _ in range(self.num_players)]

    def _log(self, msg: str) -> None:
        self.logs.append(msg)

    def card_count(self, p: int, card: Card) -> int:
        return self.hands[p].count(card)

    def infoset_key(self, player: int) -> str:
        """构造 MCCFR 使用的信息集 Key，只放该玩家当前可知的信息。"""
        hand = tuple(sorted(c.value for c in self.hands[player]))
        known = tuple(c.value for c in self.known_top[player])
        hand_sizes = tuple(len(h) for h in self.hands)
        alive = tuple(int(x) for x in self.alive)
        discard_counts = Counter(self.discard)
        discard_sig = tuple(discard_counts[c] for c in Card)
        reorder_private = ()
        if self.phase == Phase.REORDER and self.reorder_owner == player:
            reorder_private = tuple(c.value for c in self.reorder_view)
        public_pending = (self.pending_actor, self.pending_target) if self.phase == Phase.COUNTER else (None, None)
        return repr((
            player, self.phase.value, self.current_player, self.decision_player(),
            self.actions_used, len(self.deck), hand, known, reorder_private,
            hand_sizes, alive, discard_sig, public_pending
        ))

    def observation(self, player: int) -> dict:
        """方便调试/以后接 RL 的结构化 Observation。"""
        return {
            "player": player,
            "phase": self.phase.value,
            "current_player": self.current_player,
            "decision_player": self.decision_player(),
            "actions_used": self.actions_used,
            "deck_size": len(self.deck),
            "own_hand": [c.value for c in self.hands[player]],
            "known_top": [c.value for c in self.known_top[player]],
            "hand_sizes": [len(h) for h in self.hands],
            "alive": list(self.alive),
            "discard": [c.value for c in self.discard],
            "pending_actor": self.pending_actor,
            "pending_target": self.pending_target,
        }

    def determinize_for(self, observer: int, seed: Optional[int] = None) -> "GameState":
        """为 ISMCTS 生成一个与当前观察一致的“可能世界”。

        这是 Single-Observer 风格的近似：
        - 保留观察者自己的手牌；
        - 保留观察者已知的顶部牌；
        - 重新随机分配其他玩家隐藏手牌和未知牌堆。
        """
        s = self.clone()
        rng = random.Random(seed if seed is not None else self.rng.randrange(1 << 30))

        # 未知池 = 实际牌堆 + 其他玩家手牌。其总卡牌组成由公开初始牌表和公开弃牌决定，
        # 观察者可以知道“剩余未见牌的总组成”，但不知道它们在哪里。
        pool = list(self.deck)
        other_sizes = {}
        for p in range(self.num_players):
            if p != observer:
                other_sizes[p] = len(self.hands[p])
                pool.extend(self.hands[p])

        # 观察者已经知道的顶部牌必须固定在牌堆顶部。
        fixed_top = list(self.known_top[observer])
        for card in fixed_top:
            try:
                pool.remove(card)
            except ValueError:
                fixed_top = []
                break

        rng.shuffle(pool)
        for p in range(self.num_players):
            if p == observer:
                continue
            count = other_sizes[p]
            s.hands[p] = [pool.pop() for _ in range(min(count, len(pool)))]
        rng.shuffle(pool)
        s.deck = fixed_top + pool

        # 观察者的私有知识保留；其他人的私有观星结果对观察者未知，先清空。
        s.known_top = [[] for _ in range(self.num_players)]
        s.known_top[observer] = fixed_top

        # 如果当前正处于“改命排序”，真正做决定的玩家会看到顶部牌。
        if s.phase == Phase.REORDER and s.reorder_owner is not None:
            k = min(3, len(s.deck))
            s.reorder_view = list(s.deck[:k])
            s.known_top[s.reorder_owner] = list(s.reorder_view)

        s.rng = rng
        s.logs = []
        return s

    def debug_string(self, reveal_all: bool = False) -> str:
        lines = [
            f"回合={self.turn_no} 阶段={self.phase.value} 当前=P{self.current_player} 决策=P{self.decision_player()}",
            f"存活={self.alive} 手牌数={[len(h) for h in self.hands]} 牌堆={len(self.deck)} 弃牌={len(self.discard)}",
        ]
        if reveal_all:
            lines.append("手牌：" + " | ".join(f"P{i}:{[c.value for c in h]}" for i, h in enumerate(self.hands)))
            lines.append("牌堆顶部：" + str([c.value for c in self.deck[:8]]))
        return "\n".join(lines)

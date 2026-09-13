"""游戏状态与环境（冻结契约 `docs/INTERFACES.md` §1.4 / §1.5 / §1.6 / §1.7）。

规则语义是 `reference/xiuxian_ai_demo/xiuxian/game.py` 的**等价工程化版本**：
牌堆构成、回合流程、天劫 / 护劫符 / 回插 / 观星 / 改命 / 洗牌 / 遁术 / 摄物术 / 反制、
淘汰与终局判定、`forced_stop`、`max_decisions` 全部逐步保留（同 seed 同动作序列下与参考
实现状态与日志完全一致，见 `tests/test_game_reference_parity.py`）。

相对参考实现的三处契约化改动：
1. 枚举成员名英文（value 仍为中文）；
2. `infoset_key()` 从 `repr(...)` 大字符串改为**紧凑 int/tuple 编码**（§1.5）；
3. `observation()` 改为 API_CONTRACT §9 结构（含 instance_id / private_context token），
   并新增 `public_state()` / `legal_action_dicts()` / `reset()` / `action_from_dict()`。

**与参考实现有意偏离的三条卡牌规则**（用户提供的前端原型文案为准，详见
`docs/CARD_RULES_DELTA.md` 与 `docs/INTERFACES.md` 附录 A13）：

* 观星术 `PLAY_PEEK` = 查看 + 改序（进入 `Phase.REORDER`，与逆天改命同一条私有 token 决策）；
* 遁术 `PLAY_SKIP` = **反应牌**：只能在 `Phase.COUNTER` 打出，令该次法术完全无效并立即结束
  本次结算（施术者回合结束）；行动阶段不再可用；
* 反制符 `PLAY_COUNTER` = **反弹**：被反制时原施术者反被偷 1 张手牌（不再只是「取消」）。

因此 `tests/test_game_reference_parity.py` 只对**未改动的牌型分支**保持逐步零差异，
偏离点在该文件里以白名单显式列出（不再是「全量零差异」）。

隐藏信息纪律（spec §59）：`GameState` 是上帝视角对象，只有环境本身可以完整访问；
任何 AI 只允许读 `legal_actions()` / `phase` / 自己的 `hands[p]` / 自己的 `known_top[p]` /
自己的 `reorder_view` / 公开量（手牌数、存活、弃牌、牌堆大小）。
"""

from __future__ import annotations

import copy
import random
from enum import Enum
from typing import Any, Mapping, Optional

from .actions import (
    ACTION_LABELS,
    CARD_TO_KIND,
    KIND_TO_CARD,
    REINSERT_REGION_LABELS,
    REINSERT_REGIONS,
    Action,
    ActionKind,
)
from .cards import (
    API_CARD_ID,
    CARD_BY_API_ID,
    CARD_TO_INDEX,
    Card,
    alive_mask_from,
    counts_vector,
)
from .config import SAFE_CARD_BUILD_ORDER, GameConfig, default_deck_composition


class Phase(str, Enum):
    ACTION = "行动"
    COUNTER = "反制"
    REORDER = "改命排序"
    REINSERT = "天劫回插"
    ENDED = "结束"


#: Phase -> 0..4（信息集紧凑编码用）
PHASE_ORDER: tuple[Phase, ...] = (
    Phase.ACTION,
    Phase.COUNTER,
    Phase.REORDER,
    Phase.REINSERT,
    Phase.ENDED,
)
PHASE_TO_INDEX: dict[Phase, int] = {phase: idx for idx, phase in enumerate(PHASE_ORDER)}
INDEX_TO_PHASE: dict[int, Phase] = {idx: phase for phase, idx in PHASE_TO_INDEX.items()}

#: 展示用道号（仅 `public_state()` 使用；app 层可以覆盖）
PLAYER_NAMES: tuple[str, ...] = (
    "玄墨真人",
    "青梧散人",
    "赤霄道人",
    "白芷仙子",
    "苍岚剑客",
    "紫微星君",
)

#: 阶段 -> API 展示用英文名（GameView.phase）
PHASE_API_NAME: dict[Phase, str] = {
    Phase.ACTION: "ACTION",
    Phase.COUNTER: "COUNTER",
    Phase.REORDER: "REORDER_TOP",
    Phase.REINSERT: "REINSERT_TRIBULATION",
    Phase.ENDED: "ENDED",
}


def _player_name(player: int) -> str:
    if 0 <= player < len(PLAYER_NAMES):
        return PLAYER_NAMES[player]
    return f"P{player}"


class GameState:
    """纯 Python 修仙卡牌环境（上帝视角状态 + 规则引擎）。

    设计目标：
    1. 隐藏手牌、隐藏牌堆；
    2. 玩家只能根据自己的 Observation / Information Set 决策；
    3. 规则尽量小，便于 MCCFR / ISMCTS 做算法实验。
    """

    def __init__(self, config: GameConfig, seed: Optional[int] = None):
        config.validate()
        self.config: GameConfig = copy.deepcopy(config)
        self.num_players: int = int(config.num_players)
        #: 本局初始 seed（`reset()` 用它重新发牌，保证可复现）
        self.init_seed: int = int(config.seed if seed is None else seed)
        self.rng: random.Random = random.Random(self.init_seed)

        self._reset_fields()
        self._setup()

    # ------------------------------------------------------------------ 生命周期

    def _reset_fields(self) -> None:
        n = self.num_players
        self.hands: list[list[Card]] = [[] for _ in range(n)]
        self.deck: list[Card] = []
        self.discard: list[Card] = []
        self.alive: list[bool] = [True] * n
        self.known_top: list[list[Card]] = [[] for _ in range(n)]
        self.current_player: int = 0
        self.phase: Phase = Phase.ACTION
        self.actions_used: int = 0
        self.turn_no: int = 1
        self.decision_count: int = 0
        self.winner: Optional[int] = None
        self.forced_stop: bool = False
        self.pending_actor: Optional[int] = None
        self.pending_target: Optional[int] = None
        self.reorder_owner: Optional[int] = None
        self.reorder_view: list[Card] = []
        #: 本次 REORDER 决策由哪张牌触发（`Card.PEEK` / `Card.REORDER`），仅用于日志与语义区分。
        self.reorder_card: Optional[Card] = None
        self.reinsert_player: Optional[int] = None
        self.logs: list[str] = []

    def reset(self) -> GameState:
        """重新发牌（回到本局初始 seed 的全新牌局），返回自身。"""
        self.rng = random.Random(self.init_seed)
        self._reset_fields()
        self._setup()
        return self

    def _setup(self) -> None:
        n = self.num_players
        composition = self.config.composition()

        # 每人保证 1 张护劫符，避免开局第一次天劫直接退场。
        for p in range(n):
            self.hands[p].append(Card.DEFUSE)

        # 牌数量随玩家人数线性缩放，确保 2~6 人都能运行。
        # 拼接顺序必须与参考实现一致，否则同 seed 的 rng 序列不同。
        safe_cards: list[Card] = []
        for api_id in SAFE_CARD_BUILD_ORDER:
            card = CARD_BY_API_ID[api_id]
            safe_cards += [card] * int(composition.get(api_id, 0))
        self.rng.shuffle(safe_cards)

        # 初始手牌不发天劫。
        for _ in range(int(self.config.initial_hand) - 1):
            for p in range(n):
                if safe_cards:
                    self.hands[p].append(safe_cards.pop())

        # N-1 张天劫（默认），理论上最终只剩 1 名玩家。
        safe_cards += [Card.TRIBULATION] * int(composition.get("TRIBULATION", 0))
        self.rng.shuffle(safe_cards)
        self.deck = safe_cards
        self.current_player = self.rng.randrange(n)
        self._log(f"游戏开始：{n} 名修仙者，P{self.current_player} 先手，牌堆 {len(self.deck)} 张。")

    # ------------------------------------------------------------------ 克隆

    def clone(self) -> GameState:
        """深拷贝状态，同时复制随机数状态，便于树搜索分支。"""
        new = object.__new__(GameState)
        new.config = copy.deepcopy(self.config)
        new.rng = random.Random()
        new.rng.setstate(self.rng.getstate())
        new.num_players = self.num_players
        new.init_seed = self.init_seed
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
        new.reorder_card = self.reorder_card
        new.reinsert_player = self.reinsert_player
        new.logs = list(self.logs)
        return new

    # ------------------------------------------------------------ 查询 / 工具

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

    def hand_sizes(self) -> list[int]:
        """各玩家手牌数量（公开信息，AI 只能通过它了解他人手牌规模）。"""
        return [len(h) for h in self.hands]

    def card_count(self, p: int, card: Card) -> int:
        """统计 P{p} 手中某张牌的数量（只有 p 自己有权限调用）。"""
        return self.hands[p].count(card)

    def alive_players(self) -> list[int]:
        return [i for i, ok in enumerate(self.alive) if ok]

    def reorder_tokens(self) -> list[str]:
        """REORDER 阶段的 private token 列表：`private_1..private_k`。"""
        return [f"private_{i + 1}" for i in range(len(self.reorder_view))]

    def reorder_token_map(self) -> dict[str, int]:
        """token -> `reorder_view` 下标。**绝不暴露真实 deck index。**"""
        return {token: idx for idx, token in enumerate(self.reorder_tokens())}

    # ------------------------------------------------------------------ 合法动作

    def legal_actions(self) -> list[Action]:
        if self.is_terminal():
            return []
        p = self.decision_player()

        if self.phase == Phase.COUNTER:
            # 反制窗口的三个选项（遁术是反应牌，见 docs/CARD_RULES_DELTA.md §2.2）：
            # 不反制 / 反制符（反弹） / 遁术（避开并结束结算）。反制链深度固定为 1。
            actions = [Action(ActionKind.PASS_COUNTER)]
            if Card.COUNTER in self.hands[p]:
                actions.append(Action(ActionKind.PLAY_COUNTER))
            if Card.SKIP in self.hands[p]:
                actions.append(Action(ActionKind.PLAY_SKIP))
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
            from itertools import permutations

            return [
                Action(ActionKind.REORDER_TOP, param="".join(map(str, perm)))
                for perm in permutations(range(k))
            ]

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
        # `Card.SKIP`（遁术）已改为反应牌，只在 `Phase.COUNTER` 可用，行动阶段不再出现。
        if Card.STEAL in hand:
            for target in range(self.num_players):
                if target != p and self.alive[target] and self.hands[target]:
                    actions.append(Action(ActionKind.PLAY_STEAL, target=target))
        return actions

    # ------------------------------------------------------------------ 推进

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
            # 观星术 = 查看 + 改序：与逆天改命共用 REORDER 决策（private_1..k token）。
            self._consume(p, Card.PEEK)
            self.actions_used += 1
            self.reorder_owner = p
            self.reorder_view = list(self.deck[: min(3, len(self.deck))])
            self.known_top[p] = list(self.reorder_view)
            self.reorder_card = Card.PEEK
            self.phase = Phase.REORDER
            self._log(
                f"P{p} 使用【观星术】，查看牌堆顶部 {len(self.reorder_view)} 张，准备调整顺序。"
            )
            return

        if action.kind == ActionKind.PLAY_REORDER:
            self._consume(p, Card.REORDER)
            self.actions_used += 1
            self.reorder_owner = p
            self.reorder_view = list(self.deck[: min(3, len(self.deck))])
            self.known_top[p] = list(self.reorder_view)
            self.reorder_card = Card.REORDER
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
            # 遁术已改为 COUNTER 阶段的反应牌；行动阶段出现即非法（legal_actions 不再返回它）。
            raise RuntimeError("【遁术】只能在反制窗口（Phase.COUNTER）作为反应牌使用。")

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
            # 反制 = 反弹：原施术者反被偷 1 张（见 docs/CARD_RULES_DELTA.md §2.3）。
            self._consume(target, Card.COUNTER)
            if self.hands[actor]:
                idx = self.rng.randrange(len(self.hands[actor]))
                card = self.hands[actor].pop(idx)
                self.hands[target].append(card)
                self._log(
                    f"P{target} 使用【反制符】，P{actor} 的【摄物术】被反弹，"
                    f"P{target} 反偷走 P{actor} 1 张手牌。"
                )
            else:
                self._log(
                    f"P{target} 使用【反制符】，P{actor} 的【摄物术】被反弹，但 P{actor} 已无手牌可偷。"
                )
        elif action.kind == ActionKind.PLAY_SKIP:
            # 遁术（反应牌）：法术完全无效，且立即结束本次结算（施术者回合结束）。
            self._consume(target, Card.SKIP)
            self._log(f"P{target} 使用【遁术】，避开了 P{actor} 的【摄物术】，本次结算立即结束。")
            self.pending_actor = self.pending_target = None
            self._advance_turn_from(actor)
            return
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
        source = "观星术" if self.reorder_card == Card.PEEK else "逆天改命"
        self._log(f"P{owner} 完成【{source}】，顶部 {k} 张牌的顺序已改变。")
        self.reorder_owner = None
        self.reorder_view = []
        self.reorder_card = None
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
                self.reorder_card = None
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

    # ------------------------------------------------------- 紧凑 Information Set

    def infoset_key(self, player: int) -> tuple:
        """MCCFR 用的信息集 Key：**全部由 int / tuple[int] 组成**（§1.5）。

        相对参考实现的 `repr(...)` 大字符串，本编码：
        - 手牌用长度 8 的计数向量（顺序对决策无意义）；
        - 存活状态用位掩码；
        - 阶段用 0..4 下标，pending 用 (-1,-1) 占位；
        - 无 str / Card / float，可哈希、可 pickle，模型体积大幅下降。
        """
        hand_sig = counts_vector(self.hands[player])
        known = tuple(CARD_TO_INDEX[c] for c in self.known_top[player])
        reorder_private: tuple[int, ...] = ()
        if self.phase == Phase.REORDER and self.reorder_owner == player:
            reorder_private = tuple(CARD_TO_INDEX[c] for c in self.reorder_view)
        hand_sizes = tuple(len(h) for h in self.hands)
        alive_mask = alive_mask_from(self.alive)
        discard_sig = counts_vector(self.discard)
        if self.phase == Phase.COUNTER:
            pending = (
                -1 if self.pending_actor is None else int(self.pending_actor),
                -1 if self.pending_target is None else int(self.pending_target),
            )
        else:
            pending = (-1, -1)
        return (
            int(player),
            PHASE_TO_INDEX[self.phase],
            int(self.current_player),
            int(self.decision_player()),
            int(self.actions_used),
            len(self.deck),
            hand_sig,
            known,
            reorder_private,
            hand_sizes,
            alive_mask,
            discard_sig,
            pending,
        )

    # ------------------------------------------------------------- Observation

    def observation(self, player: int) -> dict:
        """API_CONTRACT §9 结构：只含 viewer 自己可见的信息。"""
        hand = [
            {
                "instance_id": self.card_instance_id(player, index),
                "card_id": API_CARD_ID[card],
                "name": card.value,
            }
            for index, card in enumerate(self.hands[player])
        ]
        known_top = [
            {
                "position": pos,
                "card_id": API_CARD_ID[card],
                "name": card.value,
            }
            for pos, card in enumerate(self.known_top[player])
        ]
        private_context: Optional[dict] = None
        if self.phase == Phase.REORDER and self.reorder_owner == player:
            private_context = {
                "cards": [
                    {
                        "token": token,
                        "card_id": API_CARD_ID[card],
                        "name": card.value,
                    }
                    for token, card in zip(self.reorder_tokens(), self.reorder_view)
                ]
            }
        return {
            "hand": hand,
            "known_top": known_top,
            "actions_used": self.actions_used,
            "max_actions_per_turn": self.config.max_actions_per_turn,
            "private_context": private_context,
        }

    def public_state(self, player: int) -> dict:
        """API_CONTRACT §7 `public` + §8 PlayerPublicView（不含任何隐藏信息）。

        **冻结白名单**：只允许返回 5 个键 —— `round` / `deck_count` / `discard_count` /
        `players` / `turn_no`；`players[]` 每项只允许 7 个键（§8 PlayerPublicView）。
        不要在这里塞 `deck_size` / `hand_sizes` / `alive` 等同义或多余字段：
        两个名字表达同一信息会扩大隐藏信息泄漏面、并让前端契约不稳定。
        调试便利字段见 `debug_public_state()`。
        """
        return {
            "round": self.turn_no,
            "deck_count": len(self.deck),
            "discard_count": len(self.discard),
            "players": [
                {
                    "player_id": i,
                    "name": _player_name(i),
                    "alive": bool(self.alive[i]),
                    "hand_count": len(self.hands[i]),
                    "is_current": i == self.current_player,
                    "is_decision_player": i == self.decision_player(),
                    # agent 归属属于 app 层知识，环境不知道；由 C4 覆盖该字段。
                    "agent": None,
                }
                for i in range(self.num_players)
            ],
            "turn_no": self.turn_no,
        }

    def debug_public_state(self, player: int) -> dict:
        """调试/CLI 便利视图：`public_state()` + 平铺的公开量。

        这不是冻结契约的一部分，**不要**用它驱动前端；仅供终端渲染 / 人工排查。
        返回的附加字段（deck_size / hand_sizes / alive）都只含公开信息。
        """
        state = self.public_state(player)
        state.update(
            {
                "deck_size": len(self.deck),
                "hand_sizes": [len(h) for h in self.hands],
                "alive": list(self.alive),
            }
        )
        return state

    def card_instance_id(self, player: int, index: int) -> str:
        """§1.6：`f"h_{player}_{index}"`（index = 手牌列表下标，不要求跨 revision 稳定）。"""
        return f"h_{player}_{index}"

    # --------------------------------------------------------- 前端驱动动作列表

    def legal_action_dicts(self, player: int) -> list[dict]:
        """由 app 层调用的前端动作列表（§1.7）。

        拆分规则：
        - `PLAY_CARD_TARGET`：每个可选目标一条；
        - `REINSERT_TRIBULATION`：TOP/NEAR_TOP/MIDDLE/BOTTOM 四条；
        - `REORDER_TOP`：**一条**（`params.order` 给 token 枚举，提交时带 `payload.order`）。
          因为 `legal_actions()` 在改命阶段返回的是全部排列，这里用"恒等排列"作为
          该条目的稳定 id（恒等排列本身也是合法动作），C4 必须用
          `state.action_from_dict(entry, payload)` 把 token 顺序还原成真实 Action。
        - 非该玩家的决策点 / 终局：返回空列表。
        """
        if self.is_terminal() or player != self.decision_player():
            return []

        entries: list[dict] = []
        seen: set[str] = set()
        for action in self.legal_actions():
            if action.kind == ActionKind.REORDER_TOP:
                k = len(self.reorder_view)
                canonical = Action(
                    ActionKind.REORDER_TOP, param="".join(str(i) for i in range(k))
                )
                if canonical.key() in seen:
                    continue
                seen.add(canonical.key())
                entries.append(self._action_dict(canonical, player))
                continue
            if action.key() in seen:
                continue
            seen.add(action.key())
            entries.append(self._action_dict(action, player))
        return entries

    def _action_dict(self, action: Action, player: int) -> dict:
        kind = action.kind
        params: Optional[dict] = None
        card_instance_id: Optional[str] = None

        if kind in KIND_TO_CARD:
            card = KIND_TO_CARD[kind]
            card_instance_id = self.card_instance_id(player, self.hands[player].index(card))

        if kind == ActionKind.PLAY_STEAL:
            params = {"target_player": {"type": "enum", "options": [int(action.target)]}}
        elif kind == ActionKind.REINSERT:
            params = {"region": {"type": "enum", "options": [action.param]}}
        elif kind == ActionKind.REORDER_TOP:
            params = {
                "order": {"type": "token_order", "options": list(self.reorder_tokens())}
            }

        return {
            "id": action.action_id(),
            "type": action.api_type(),
            "label": action.label(),
            "enabled": True,
            "card_instance_id": card_instance_id,
            "params": params,
        }

    def action_from_dict(
        self, entry: Mapping[str, Any], payload: Optional[Mapping[str, Any]] = None
    ) -> Action:
        """把 `legal_action_dicts()` 的条目 + 前端 payload 还原成真实 Action。

        这是给 C4 的便利函数（不是冻结签名的一部分）：
        - `REORDER_TOP`：用 `payload.order`（token 串）还原排列；
        - `REINSERT_TRIBULATION`：用 `payload.region`（或条目里的唯一候选）；
        - `PLAY_CARD_TARGET`：用 `payload.target_player`（或条目里的唯一候选）；
        - 其余：按 `type` / `card_instance_id` 直接还原。
        """
        payload = payload or {}
        api_type = entry.get("type")
        params = entry.get("params") or {}

        if api_type == "REORDER_TOP":
            options = list((params.get("order") or {}).get("options") or self.reorder_tokens())
            order = list(payload.get("order") or options)
            indices = []
            for token in order:
                if token not in options:
                    raise ValueError(f"非法 token：{token}；可选：{options}")
                indices.append(options.index(token))
            return Action(ActionKind.REORDER_TOP, param="".join(str(i) for i in indices))

        if api_type == "REINSERT_TRIBULATION":
            options = list((params.get("region") or {}).get("options") or REINSERT_REGIONS)
            region = payload.get("region", options[0] if options else "TOP")
            if region not in REINSERT_REGIONS:
                raise ValueError(f"非法回插区域：{region}")
            return Action(ActionKind.REINSERT, param=str(region))

        if api_type == "PLAY_CARD_TARGET":
            options = list((params.get("target_player") or {}).get("options") or [])
            target = payload.get("target_player", options[0] if options else -1)
            return Action(ActionKind.PLAY_STEAL, target=int(target))

        if api_type == "END_ACTION":
            return Action(ActionKind.END_TURN)
        if api_type == "COUNTER":
            return Action(ActionKind.PLAY_COUNTER)
        if api_type == "ESCAPE":
            # 反应牌「遁术」：只在 COUNTER 阶段出现（见 docs/CARD_RULES_DELTA.md §2.2）。
            return Action(ActionKind.PLAY_SKIP)
        if api_type == "PASS_COUNTER":
            return Action(ActionKind.PASS_COUNTER)
        if api_type == "PLAY_CARD":
            instance_id = entry.get("card_instance_id") or ""
            parts = str(instance_id).split("_")
            if len(parts) != 3:
                raise ValueError(f"非法 card_instance_id：{instance_id}")
            player_idx, hand_idx = int(parts[1]), int(parts[2])
            card = self.hands[player_idx][hand_idx]
            return Action(CARD_TO_KIND[card])
        raise ValueError(f"未知动作类型：{api_type}")

    # ------------------------------------------------------------ Determinization

    def determinize_for(self, observer: int, seed: Optional[int] = None) -> GameState:
        """为 ISMCTS 生成一个与当前观察一致的“可能世界”。

        这是 Single-Observer 风格的近似：
        - 保留观察者自己的手牌；
        - 保留观察者已知的顶部牌；
        - 重新随机分配其他玩家隐藏手牌和未知牌堆。

        这是**唯一**允许搜索类 AI 接触隐藏信息的通道（spec §59）。
        """
        s = self.clone()
        rng = random.Random(seed if seed is not None else self.rng.randrange(1 << 30))

        # 未知池 = 实际牌堆 + 其他玩家手牌。其总卡牌组成由公开初始牌表和公开弃牌决定，
        # 观察者可以知道“剩余未见牌的总组成”，但不知道它们在哪里。
        pool = list(self.deck)
        other_sizes: dict[int, int] = {}
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

    # ------------------------------------------------------------------ 调试

    def debug_string(self, reveal_all: bool = False) -> str:
        lines = [
            f"回合={self.turn_no} 阶段={self.phase.value} 当前=P{self.current_player} 决策=P{self.decision_player()}",
            f"存活={self.alive} 手牌数={[len(h) for h in self.hands]} 牌堆={len(self.deck)} 弃牌={len(self.discard)}",
        ]
        if reveal_all:
            lines.append("手牌：" + " | ".join(f"P{i}:{[c.value for c in h]}" for i, h in enumerate(self.hands)))
            lines.append("牌堆顶部：" + str([c.value for c in self.deck[:8]]))
            lines.append("已知牌顶：" + " | ".join(f"P{i}:{[c.value for c in k]}" for i, k in enumerate(self.known_top)))
        return "\n".join(lines)


__all__ = [
    "GameState",
    "Phase",
    "PHASE_ORDER",
    "PHASE_TO_INDEX",
    "INDEX_TO_PHASE",
    "PHASE_API_NAME",
    "PLAYER_NAMES",
    "default_deck_composition",
]

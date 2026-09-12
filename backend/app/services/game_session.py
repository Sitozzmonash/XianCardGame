"""GameSession：一局游戏的进程内会话（INTERFACES §3 TECH_ARCHITECTURE §7 §8）。

职责：

* 持有 `GameState` 上帝视角对象（**绝不下发**）、各座位 agent、revision、事件流；
* `view_for(player)` 只产出白名单字段的 `GameView`；
* `act(action_id, payload, revision)`：校验 revision（不匹配 → 409 `STALE_REVISION`）
  与动作合法性（→ 409 `INVALID_ACTION`），执行人类动作后**自动跑 AI 直到人类决策点**；
* `{action_id: 条目}` 映射**每次 revision 变化重建**（§4.1）。
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Mapping, Optional

from game import Action, ActionKind, GameConfig, GameState, PHASE_API_NAME, Phase

from ..core.config import Settings, get_settings
from ..core.errors import GameEnded, InvalidAction, StaleRevision
from ..schemas.game import GAMEVIEW_KEYS  # noqa: F401  （文档性导入：白名单唯一来源）
from .agent_factory import build_seat_agents
from .events import render_event, snapshot, synthesize_events

log = logging.getLogger("app.services.game_session")

#: `status` 取值（API_CONTRACT §7）
STATUS_PLAYING = "playing"
STATUS_ENDED = "ended"


class GameSession:
    """单局会话（线程安全：内部 RLock 串行化所有状态变更）。"""

    def __init__(
        self,
        game_id: str,
        *,
        config: GameConfig,
        seed: Optional[int],
        human_player_id: Optional[int],
        agent_specs: list,
        settings: Optional[Settings] = None,
    ) -> None:
        self.game_id = str(game_id)
        self.settings = settings or get_settings()
        self.human_player_id = None if human_player_id is None else int(human_player_id)

        self.state: GameState = GameState(config, config.seed if seed is None else int(seed))
        self.agents, self.agent_meta = build_seat_agents(
            agent_specs, int(self.state.init_seed), self.settings
        )

        self.revision: int = 1
        self.created_at: float = time.time()
        self.last_active_at: float = time.monotonic()
        self.destroyed: bool = False

        self._lock = threading.RLock()
        self._events: list = []
        self._seq: int = 0
        self._event_cursor: int = 0
        self._action_entries: dict = {}
        self.ai_steps_total: int = 0
        self.warnings: list = []

        # GAME_STARTED + 第一个 TURN_STARTED
        self._emit(
            [
                {
                    "type": "GAME_STARTED",
                    "actor": None,
                    "data": {
                        "players": self.state.num_players,
                        "human_player": self.human_player_id,
                        "first_player": self.state.current_player,
                        "seed": int(self.state.init_seed),
                    },
                    "private_for": None,
                    "private_data": None,
                },
                {
                    "type": "TURN_STARTED",
                    "actor": int(self.state.current_player),
                    "data": {"turn_no": int(self.state.turn_no)},
                    "private_for": None,
                    "private_data": None,
                },
            ]
        )
        self._rebuild_actions()

    # ------------------------------------------------------------------ 事件流

    def _emit(self, events: list) -> None:
        for event in events or []:
            self._seq += 1
            self._events.append({**event, "seq": self._seq})
        if len(self._events) > self.settings.event_history_limit:
            keep = self.settings.event_history_limit
            dropped = len(self._events) - keep
            self._events = self._events[dropped:]
            self._event_cursor = max(0, self._event_cursor - dropped)

    def _new_events(self, start_index: int) -> list:
        return self._events[start_index:]

    def events_since_cursor(self) -> list:
        """GET 用：拿到上次请求之后的新事件（并推进游标）。"""
        events = self._events[self._event_cursor :]
        self._event_cursor = len(self._events)
        return events

    # -------------------------------------------------------------- 动作映射表

    def _rebuild_actions(self) -> None:
        """按当前 revision 重建 `{action_id: 条目}`（§4.1）。"""
        entries: dict = {}
        if not self.state.is_terminal():
            player = self.state.decision_player()
            for entry in self.state.legal_action_dicts(player):
                entries[str(entry["id"])] = entry
        self._action_entries = entries

    def legal_action_ids(self) -> list:
        return list(self._action_entries)

    def entry_for(self, action_id: str) -> Optional[dict]:
        return self._action_entries.get(str(action_id))

    # -------------------------------------------------------------------- 视图

    def is_terminal(self) -> bool:
        return self.state.is_terminal()

    @property
    def status(self) -> str:
        return STATUS_ENDED if self.is_terminal() else STATUS_PLAYING

    # ------------------------------------------------------------ 白名单投影
    #
    # 上游 `game/state.py` 可能在标准字段之外附加「便利字段」（例如
    # `public_state()` 里的 deck_size / hand_sizes / alive）。冻结契约
    # （API_CONTRACT §7 §8 §9 §10 + INTERFACES §4.1）只允许固定字段集，
    # 因此 app 层在这里做**严格投影**：多出来的字段一律丢弃，绝不透传。

    def _observation_view(self, player: int) -> dict:
        """Observation：严格 5 个键（hand / known_top / actions_used /
        max_actions_per_turn / private_context），元素字段也逐个投影。"""
        raw = self.state.observation(player) or {}
        hand = [
            {
                "instance_id": str(item.get("instance_id") or self.state.card_instance_id(player, index)),
                "card_id": str(item.get("card_id") or ""),
                "name": str(item.get("name") or ""),
            }
            for index, item in enumerate(raw.get("hand") or [])
        ]
        known_top = [
            {
                "position": int(item.get("position", index)),
                "card_id": str(item.get("card_id") or ""),
                "name": str(item.get("name") or ""),
            }
            for index, item in enumerate(raw.get("known_top") or [])
        ]

        private_context = None
        raw_private = raw.get("private_context")
        if isinstance(raw_private, dict):
            private_context = {
                "cards": [
                    {
                        "token": str(item.get("token") or f"private_{index + 1}"),
                        "card_id": str(item.get("card_id") or ""),
                        "name": str(item.get("name") or ""),
                    }
                    for index, item in enumerate(raw_private.get("cards") or [])
                ]
            }

        return {
            "hand": hand,
            "known_top": known_top,
            "actions_used": int(raw.get("actions_used", self.state.actions_used)),
            "max_actions_per_turn": int(
                raw.get("max_actions_per_turn", self.state.config.max_actions_per_turn)
            ),
            "private_context": private_context,
        }

    def _public_view(self, player: int) -> dict:
        """`public`：严格 5 个键 + PlayerPublicView 严格 7 个键。"""
        raw = self.state.public_state(player) or {}
        turn_no = int(raw.get("turn_no", raw.get("round", self.state.turn_no)))

        players = []
        for item in raw.get("players") or []:
            seat = int(item.get("player_id", -1))
            players.append(
                {
                    "player_id": seat,
                    "name": str(item.get("name") or f"P{seat}"),
                    "alive": bool(item.get("alive", True)),
                    "hand_count": int(item.get("hand_count", 0)),
                    "is_current": bool(item.get("is_current", False)),
                    "is_decision_player": bool(item.get("is_decision_player", False)),
                    "agent": self.agent_meta.get(seat),
                }
            )

        return {
            "round": int(raw.get("round", turn_no)),
            "deck_count": int(raw.get("deck_count", len(self.state.deck))),
            "discard_count": int(raw.get("discard_count", len(self.state.discard))),
            "players": players,
            "turn_no": turn_no,
        }

    def _legal_actions_view(self, player: int) -> list:
        """LegalAction：严格 6 个键（id / type / label / enabled /
        card_instance_id / params）。"""
        entries = []
        for raw in self.state.legal_action_dicts(player):
            entries.append(
                {
                    "id": str(raw.get("id")),
                    "type": str(raw.get("type")),
                    "label": str(raw.get("label") or ""),
                    "enabled": bool(raw.get("enabled", True)),
                    "card_instance_id": raw.get("card_instance_id"),
                    "params": raw.get("params"),
                }
            )
        return entries

    def build_view(self, player: int, events: Optional[list] = None) -> dict:
        """产出 GameView（顶层字段严格等于 §7 白名单）。"""
        state = self.state
        terminal = state.is_terminal()
        viewer = int(player)

        observation = self._observation_view(viewer)
        legal_actions = (
            []
            if terminal or viewer != state.decision_player()
            else self._legal_actions_view(viewer)
        )

        view = {
            "game_id": self.game_id,
            "status": self.status,
            "revision": int(self.revision),
            "viewer_player_id": viewer,
            "phase": PHASE_API_NAME[state.phase],
            "current_player": int(state.current_player),
            "decision_player": int(state.decision_player()),
            "observation": observation,
            "public": self._public_view(viewer),
            "legal_actions": legal_actions,
            "events": [
                render_event(event, viewer, event.get("seq", index + 1))
                for index, event in enumerate(events or [])
            ],
            "winner": state.winner,
        }
        return view

    def view_for(self, player: int, events: Optional[list] = None) -> dict:
        """INTERFACES §4.1 冻结签名：`view_for(player) -> GameView`。

        `events=None` 时取「上次请求之后的新事件」（并推进事件游标）。
        """
        with self._lock:
            if events is None:
                events = self.events_since_cursor()
            return self.build_view(player, events)

    # -------------------------------------------------------------------- 推进

    def _apply(self, action: Action, actor: int) -> None:
        """执行一步：状态变化 + revision +1 + 事件 + 重建动作表。"""
        before = snapshot(self.state)
        self.state.step(action)
        self.revision += 1
        self._emit(synthesize_events(actor, action, before, self.state))
        self._rebuild_actions()
        self.last_active_at = time.monotonic()

    def _ai_action(self, seat: int) -> Optional[Action]:
        legal = self.state.legal_actions()
        if not legal:
            return None
        agent = self.agents.get(seat)
        action: Optional[Action] = None
        if agent is not None:
            try:
                action = agent.act(self.state, seat)
            except Exception as exc:  # agent 出问题不能把整局拖死
                self.warnings.append(f"P{seat} agent 异常：{exc}")
                log.warning("P%s agent 决策异常：%s", seat, exc, exc_info=False)
                action = None
        if action is None or action not in legal:
            if action is not None:
                self.warnings.append(f"P{seat} 返回非法动作 {action}，已回退")
                log.warning("P%s 返回非法动作 %s，回退到安全动作", seat, action)
            action = next(
                (item for item in legal if item.kind == ActionKind.END_TURN), legal[0]
            )
        return action

    def run_ai_until_human(self) -> int:
        """AI 连续行动，直到人类决策点 / 终局（返回 AI 步数）。

        人类已被淘汰（或本局无人类）时，直接跑到终局 —— 前端只会收到最终 GameView。
        """
        with self._lock:
            return self._run_ai_locked()

    def _run_ai_locked(self) -> int:
        steps = 0
        cap = int(self.settings.max_ai_steps_per_request)
        human = self.human_player_id
        while not self.state.is_terminal():
            decision_player = self.state.decision_player()
            if (
                human is not None
                and decision_player == human
                and self.state.alive[human]
            ):
                break
            if decision_player not in self.agents:
                self.warnings.append(f"P{decision_player} 没有 agent，停止自动行动")
                log.error("P%s 没有 agent（human=%s），停止自动行动", decision_player, human)
                break
            action = self._ai_action(decision_player)
            if action is None:
                break
            self._apply(action, decision_player)
            steps += 1
            if steps >= cap:
                self.warnings.append(f"AI 连续行动超过上限 {cap}，已中断")
                log.error("AI 连续行动超过上限 %s，已中断以避免请求挂死", cap)
                break
        self.ai_steps_total += steps
        return steps

    # -------------------------------------------------------------------- 动作

    def act(self, action_id: str, payload: Optional[Mapping[str, Any]], revision: int) -> dict:
        """执行人类动作并自动跑完 AI，返回新的 GameView（INTERFACES §4.1）。"""
        with self._lock:
            if self.state.is_terminal():
                raise GameEnded("游戏已结束，无法继续执行动作")

            try:
                submitted = int(revision)
            except (TypeError, ValueError) as exc:
                raise StaleRevision() from exc
            if submitted != self.revision:
                # 防重复提交：details 一律为空，不泄漏任何状态信息
                raise StaleRevision()

            entry = self._action_entries.get(str(action_id))
            if entry is None:
                raise InvalidAction(
                    "action_id 无效或已过期，请重新拉取最新局面",
                    details={"action_id": str(action_id)},
                )

            # 手牌 instance_id 必须属于当前决策者（防止拿别人座位的手牌 id 试探）
            instance_id = entry.get("card_instance_id")
            if instance_id:
                expected_prefix = f"h_{self.state.decision_player()}_"
                if not str(instance_id).startswith(expected_prefix):
                    raise InvalidAction(
                        "card_instance_id 不属于当前决策者",
                        details={"card_instance_id": str(instance_id)},
                    )

            try:
                action = self.state.action_from_dict(entry, payload or {})
            except Exception as exc:
                raise InvalidAction(f"payload 与动作不匹配：{exc}") from exc

            if action not in self.state.legal_actions():
                raise InvalidAction(
                    "当前阶段不能执行该动作", details={"action_id": str(action_id)}
                )

            actor = self.state.decision_player()
            start = len(self._events)
            self._apply(action, actor)
            self.run_ai_until_human()

            events = self._new_events(start)
            self._event_cursor = len(self._events)
            return self.build_view(
                self.human_player_id if self.human_player_id is not None else 0, events
            )

    # ------------------------------------------------------------------ 其它

    def snapshot_view(self) -> dict:
        """GET 用视图（人类视角，含新事件）。"""
        viewer = self.human_player_id if self.human_player_id is not None else 0
        return self.view_for(viewer)

    def idle_seconds(self, now: Optional[float] = None) -> float:
        return (now if now is not None else time.monotonic()) - self.last_active_at

    def is_expired(self, ttl_seconds: float, now: Optional[float] = None) -> bool:
        return self.idle_seconds(now) > float(ttl_seconds)

    def destroy(self) -> None:
        with self._lock:
            self.destroyed = True
            self._action_entries = {}
            self._events = []
            self.agents = {}

    def __repr__(self) -> str:  # pragma: no cover - 调试用
        return (
            f"<GameSession {self.game_id} rev={self.revision} status={self.status} "
            f"human={self.human_player_id}>"
        )


__all__ = ["GameSession", "STATUS_PLAYING", "STATUS_ENDED", "Phase"]

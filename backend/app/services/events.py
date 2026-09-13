"""结构化事件流（API_CONTRACT §13 §14 / INTERFACES §4.1）。

上游 `GameState` 只给中文 `logs`，这里用**动作 + 前后状态差**合成结构化事件，
让前端能按序播放动画。

隐藏信息纪律：

* `DECK_PEEKED` 的牌面只对观星者本人可见 → 以 `private_for / private_data` 暂存，
  `render_event()` 只为该 viewer 合并；
* `CARD_STOLEN` 不回传被偷的牌（偷牌方自己看手牌就知道，其他人不该知道）；
* `DECK_REORDERED` 不回传排序结果，`TRIBULATION_REINSERTED` 只回传区域桶名；
* 每个事件只允许 `seq / type / actor / data` 四个键。

卡牌规则改动后的三条事件语义（`docs/CARD_RULES_DELTA.md`）：

* 观星术 = 查看 + 改序：先 `CARD_PLAYED`(STARGAZING) + `DECK_PEEKED`（私有牌面），
  玩家提交排列后再 `DECK_REORDERED`（与逆天改命同形）；
* 遁术（反应牌）= `CARD_PLAYED`(ESCAPE) + `ESCAPE_DODGED`
  （`actor` = 使用遁术者，`data.target` = 被避开的法术施术者，`data.card_id` = 被避开的法术）
  + `TURN_ENDED`（`actor` = 施术者，其回合被立即结束）+ 随后的 `TURN_STARTED`；
* 反制符 = 反弹：`CARD_PLAYED`(COUNTER) + `COUNTER_USED`(`data.redirected=true`,
  `data.stolen=bool`) + 若真的偷到牌则 `CARD_STOLEN`（`actor` = 反弹方，
  `data.target` = 被反偷的原施术者，`data.redirected=true`）；不反制（`PASS_COUNTER`）产生的
  `CARD_STOLEN` 形状不变（无 `redirected` 键）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

from game import API_CARD_ID, KIND_TO_CARD, Action, ActionKind, Card, GameState, Phase

from ..schemas.event import EventKind

#: 出牌类动作 -> API card_id
KIND_API_CARD: dict = {kind: API_CARD_ID[card] for kind, card in KIND_TO_CARD.items()}


@dataclass(frozen=True)
class StateSnapshot:
    """一次 `step()` 前后的最小状态快照（只用于差异检测，不对外）。"""

    alive: tuple
    hand_sizes: tuple
    deck_len: int
    discard_len: int
    turn_no: int
    current_player: int
    decision_player: int
    phase: Phase
    winner: Optional[int]
    pending_actor: Optional[int]
    pending_target: Optional[int]


def snapshot(state: GameState) -> StateSnapshot:
    return StateSnapshot(
        alive=tuple(bool(x) for x in state.alive),
        hand_sizes=tuple(len(h) for h in state.hands),
        deck_len=len(state.deck),
        discard_len=len(state.discard),
        turn_no=int(state.turn_no),
        current_player=int(state.current_player),
        decision_player=int(state.decision_player()),
        phase=state.phase,
        winner=state.winner,
        pending_actor=state.pending_actor,
        pending_target=state.pending_target,
    )


def _event(
    etype: str,
    actor: Optional[int],
    data: Optional[Mapping[str, Any]] = None,
    *,
    private_for: Optional[int] = None,
    private_data: Optional[Mapping[str, Any]] = None,
) -> dict:
    return {
        "type": etype,
        "actor": actor,
        "data": dict(data or {}),
        "private_for": private_for,
        "private_data": dict(private_data) if private_data else None,
    }


def _known_top_payload(state: GameState, player: int) -> list:
    """观星者本人可见的牌顶信息（token/位置 = 公开位置序号，不是 deck index）。"""
    return [
        {
            "position": index,
            "card_id": API_CARD_ID[card],
            "name": card.value,
        }
        for index, card in enumerate(state.known_top[player])
    ]


def synthesize_events(
    actor: int, action: Action, before: StateSnapshot, state: GameState
) -> list:
    """由「动作 + 前后状态差」合成事件列表（顺序即前端播放顺序）。"""
    events: list = []
    kind = action.kind

    # ---------------------------------------------------------- 动作直接产生
    if kind in KIND_API_CARD:
        card = KIND_TO_CARD[kind]
        events.append(
            _event(
                EventKind.CARD_PLAYED.value,
                actor,
                {"card_id": API_CARD_ID[card], "name": card.value},
            )
        )

    if kind == ActionKind.PLAY_PEEK:
        events.append(
            _event(
                EventKind.DECK_PEEKED.value,
                actor,
                {"count": len(state.known_top[actor])},
                private_for=actor,
                private_data={"cards": _known_top_payload(state, actor)},
            )
        )

    elif kind == ActionKind.PLAY_REORDER:
        events.append(
            _event(
                EventKind.DECK_PEEKED.value,
                actor,
                {"count": len(state.reorder_view)},
                private_for=actor,
                private_data={"cards": _known_top_payload(state, actor)},
            )
        )

    elif kind == ActionKind.PLAY_SHUFFLE:
        events.append(_event(EventKind.DECK_SHUFFLED.value, actor, {}))

    elif kind == ActionKind.PLAY_SKIP:
        # 遁术（反应牌）：法术完全无效，且立即结束本次结算（施术者回合结束）。
        caster = before.pending_actor
        events.append(
            _event(
                EventKind.ESCAPE_DODGED.value,
                actor,
                {
                    "target": int(caster) if caster is not None else None,
                    "card_id": API_CARD_ID[Card.STEAL],
                    "name": Card.STEAL.value,
                },
            )
        )
        events.append(
            _event(
                EventKind.TURN_ENDED.value,
                int(caster) if caster is not None else actor,
                {},
            )
        )

    elif kind == ActionKind.PLAY_STEAL:
        events.append(
            _event(EventKind.COUNTER_OPENED.value, actor, {"target": int(action.target)})
        )

    elif kind == ActionKind.PLAY_COUNTER:
        # 反制 = 反弹：反制符使用者的手牌必须增加 1 张（原施术者反被偷）。
        caster = before.pending_actor
        stolen = (
            caster is not None
            and caster != actor
            and before.hand_sizes[caster] > len(state.hands[caster])
        )
        events.append(
            _event(
                EventKind.COUNTER_USED.value,
                actor,
                {"redirected": True, "stolen": bool(stolen)},
            )
        )
        if stolen:
            # `actor` 是反弹方（原目标），`data.target` 是被反偷的施术者。
            events.append(
                _event(
                    EventKind.CARD_STOLEN.value,
                    actor,
                    {"target": int(caster), "redirected": True},
                )
            )

    elif kind == ActionKind.PASS_COUNTER:
        events.append(_event(EventKind.COUNTER_PASSED.value, actor, {}))
        stealer = before.pending_actor
        victim = before.pending_target
        if stealer is not None and victim is not None:
            # 不回传被偷的牌面（谁被偷是公开的，偷到什么是私有的）。
            events.append(
                _event(EventKind.CARD_STOLEN.value, int(stealer), {"target": int(victim)})
            )

    elif kind == ActionKind.REORDER_TOP:
        events.append(_event(EventKind.DECK_REORDERED.value, actor, {}))

    elif kind == ActionKind.REINSERT:
        events.append(
            _event(
                EventKind.TRIBULATION_REINSERTED.value,
                actor,
                {"region": str(action.param)},
            )
        )
        events.append(_event(EventKind.TURN_ENDED.value, actor, {}))

    # ------------------------------------------------------- 抽牌 / 天劫判定
    if kind == ActionKind.END_TURN:
        drew = before.deck_len > len(state.deck)
        eliminated = before.alive[actor] and not state.alive[actor]
        defused = (
            state.phase == Phase.REINSERT
            and state.reinsert_player == actor
            and not eliminated
        )
        if drew and (eliminated or defused):
            events.append(_event(EventKind.TRIBULATION_DRAWN.value, actor, {}))
            if defused:
                events.append(
                    _event(
                        EventKind.TRIBULATION_DEFUSED.value,
                        actor,
                        {"consumed_card": API_CARD_ID[Card.DEFUSE]},
                    )
                )
        elif drew:
            events.append(
                _event(
                    EventKind.CARD_DRAWN.value,
                    actor,
                    {"hand_count": len(state.hands[actor])},
                )
            )
        events.append(_event(EventKind.TURN_ENDED.value, actor, {}))

    # ------------------------------------------------------------- 淘汰 / 终局
    for seat, was_alive in enumerate(before.alive):
        if was_alive and not state.alive[seat]:
            events.append(_event(EventKind.PLAYER_ELIMINATED.value, seat, {}))

    if state.is_terminal():
        events.append(
            _event(
                EventKind.GAME_ENDED.value,
                None,
                {"winner": state.winner, "forced_stop": bool(state.forced_stop)},
            )
        )

    # ------------------------------------------------------------------ 换手
    if not state.is_terminal() and state.turn_no != before.turn_no:
        events.append(
            _event(
                EventKind.TURN_STARTED.value,
                int(state.current_player),
                {"turn_no": int(state.turn_no)},
            )
        )

    return events


def render_event(event: Mapping[str, Any], viewer: int, seq: int) -> dict:
    """把内部事件渲染成 viewer 可见的对外事件（只含 seq/type/actor/data）。"""
    data = dict(event.get("data") or {})
    private_for = event.get("private_for")
    private_data = event.get("private_data")
    if private_data and (private_for is None or int(private_for) == int(viewer)):
        data.update(dict(private_data))
    return {
        "seq": int(seq),
        "type": str(event["type"]),
        "actor": event.get("actor"),
        "data": data,
    }


__all__ = ["StateSnapshot", "snapshot", "synthesize_events", "render_event"]

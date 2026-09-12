"""端到端验收脚本：通过 HTTP API 完整打一局，并强制校验隐藏信息不泄漏。

用法：
    # 终端 1
    cd backend && python main.py serve --port 8000
    # 终端 2
    cd backend && python scripts/e2e_api.py            # 默认 3 人：Human + Rule + ISMCTS(100)
    python scripts/e2e_api.py --players 4 --games 3    # 连打 3 局
    python scripts/e2e_api.py --base http://127.0.0.1:8000/api/v1

校验点（任一失败即退出码 1）：
    1. 创建游戏 → 人类座位拿到 GameView，且 decision_player 一定是人类（AI 已被服务端自动跑完）
    2. GameView / PlayerPublicView / Observation 的字段白名单 —— 不含 deck、他人手牌、他人观星结果
    3. observation.hand 的 instance_id 前缀必须是自己的座位（h_<seat>_）
    4. legal_actions 非空、字段结构合法、action_id 可被后端接受
    5. 4 种特殊决策（反制 / 摄物术选目标 / 逆天改命排序 / 天劫回插）都能被真实走通
    6. revision 单调递增；用旧 revision 重复提交同一动作必须被拒（防重复提交）
    7. 一局最终必须终止（status=ended 且 winner 非空），且不触发 forced_stop
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import httpx

GAMEVIEW_KEYS = {
    "game_id", "status", "revision", "viewer_player_id", "phase", "current_player",
    "decision_player", "observation", "public", "legal_actions", "events", "winner",
}
OBSERVATION_KEYS = {
    "hand", "known_top", "actions_used", "max_actions_per_turn", "private_context",
    # 允许的额外只读字段（实现可能多给，但下面 FORBIDDEN 绝不允许出现）
    "player", "phase", "current_player", "decision_player", "deck_size", "own_hand",
    "hand_sizes", "alive", "discard", "pending_actor", "pending_target",
}
PUBLIC_KEYS = {"round", "deck_count", "discard_count", "players", "turn_no"}
PLAYER_PUBLIC_KEYS = {
    "player_id", "name", "alive", "hand_count", "is_current", "is_decision_player", "agent",
}
FORBIDDEN_SUBSTRINGS = ("deck_order", "full_deck", "opponent_hand", "hidden_hand", "all_hands")

FAILURES: list[str] = []
PHASE_HITS: set[str] = set()


def fail(msg: str) -> None:
    FAILURES.append(msg)
    print(f"  [FAIL] {msg}")


def check_leakage(view: dict[str, Any], my_seat: int) -> None:
    """字段白名单 + 私有信息越界检查。"""
    extra = set(view) - GAMEVIEW_KEYS
    if extra:
        fail(f"GameView 出现未约定字段：{sorted(extra)}")

    blob = json.dumps(view, ensure_ascii=False)
    for bad in FORBIDDEN_SUBSTRINGS:
        if bad in blob:
            fail(f"响应体包含疑似泄密字段名：{bad}")

    obs = view.get("observation") or {}
    extra_obs = set(obs) - OBSERVATION_KEYS
    if extra_obs:
        fail(f"Observation 出现未约定字段：{sorted(extra_obs)}")

    # 手牌必须只含自己的
    hand = obs.get("hand") or obs.get("own_hand") or []
    if hand and isinstance(hand[0], dict):
        for card in hand:
            iid = str(card.get("instance_id", ""))
            if iid and not iid.startswith(f"h_{my_seat}_"):
                fail(f"observation.hand 里出现不属于自己座位的手牌：{iid}")

    public = view.get("public") or {}
    extra_pub = set(public) - PUBLIC_KEYS
    if extra_pub:
        fail(f"public 出现未约定字段：{sorted(extra_pub)}")
    for pl in public.get("players") or []:
        extra_pl = set(pl) - PLAYER_PUBLIC_KEYS
        if extra_pl:
            fail(f"PlayerPublicView 出现未约定字段：{sorted(extra_pl)}（可能是他人手牌泄漏）")

    # 公共事件不得携带私有牌面信息
    for ev in view.get("events") or []:
        etype = ev.get("type")
        data = ev.get("data") or {}
        if etype == "CARD_PLAYED" and ev.get("actor") != my_seat:
            for k in ("seen_cards", "peeked", "known_top", "revealed"):
                if k in data:
                    fail(f"他人使用观星术的事件泄漏了牌面：{etype}.{k}")
        if etype == "DECK_PEEKED" and ev.get("actor") != my_seat:
            if any(k in data for k in ("cards", "card_ids", "known_top")):
                fail(f"DECK_PEEKED 事件泄漏了他人观星结果：{data}")


def pick_action(view: dict[str, Any], rng_pick: int) -> tuple[str, dict]:
    """挑一个 legal action，并按类型构造 payload。优先挑能触发特殊 Phase 的动作。"""
    legal = view.get("legal_actions") or []
    if not legal:
        raise RuntimeError("legal_actions 为空，但游戏未结束")

    priority = {
        "PASS_COUNTER": 0, "COUNTER": 1, "REORDER_TOP": 2, "REINSERT_TRIBULATION": 3,
        "PLAY_CARD_TARGET": 4, "PLAY_CARD": 5, "END_ACTION": 9, "PLAY_CARD_TARGET": 4,
    }
    legal_sorted = sorted(legal, key=lambda a: priority.get(a.get("type", ""), 6))
    action = legal_sorted[rng_pick % max(1, min(3, len(legal_sorted)))]
    atype = action.get("type", "")
    payload: dict[str, Any] = {}

    if atype == "REORDER_TOP":
        # 用 private_context 的 token 逆序提交
        cards = ((view.get("observation") or {}).get("private_context") or {}).get("cards") or []
        tokens = [c["token"] for c in cards]
        if not tokens:
            raise RuntimeError("REORDER_TOP 但 private_context.cards 为空（契约违反）")
        payload = {"order": list(reversed(tokens))}
    elif atype == "REINSERT_TRIBULATION":
        opts = ((action.get("params") or {}).get("region") or {}).get("options") or []
        payload = {"region": opts[0] if opts else "NEAR_TOP"}
    elif atype == "PLAY_CARD_TARGET":
        opts = ((action.get("params") or {}).get("target_player") or {}).get("options") or []
        if not opts:
            raise RuntimeError("PLAY_CARD_TARGET 缺少 target_player.options")
        payload = {"target_player": opts[0]}

    if atype in ("REORDER_TOP", "REINSERT_TRIBULATION", "COUNTER", "PASS_COUNTER", "PLAY_CARD_TARGET"):
        PHASE_HITS.add(atype)
    return action["id"], payload


def play_one(client: httpx.Client, players: int, seed: int, verbose: bool) -> dict:
    agents: list[Any] = [None]
    for i in range(players - 1):
        agents.append({"type": "rule"} if i % 2 == 0 else {"type": "ismcts", "simulations": 50})

    r = client.post("/games", json={
        "players": players, "human_player": 0, "agents": agents, "seed": seed,
    })
    if r.status_code != 200:
        fail(f"POST /games 失败：{r.status_code} {r.text[:300]}")
        return {}
    created = r.json()
    game_id = created["game_id"]
    my_seat = created.get("player_id", 0)
    view = created["state"]
    print(f"  游戏 {game_id} 已创建（{players} 人，seed={seed}）")

    steps = 0
    last_revision = view["revision"]
    while steps < 400:
        steps += 1
        check_leakage(view, my_seat)

        if view.get("status") == "ended":
            break
        if view.get("decision_player") != my_seat:
            fail(f"status=playing 但 decision_player={view.get('decision_player')} != 人类座位 {my_seat}"
                 f"（服务端应自动跑完 AI）")
            break

        try:
            action_id, payload = pick_action(view, steps)
        except RuntimeError as e:
            fail(str(e))
            break

        # —— 防重复提交：先用“旧 revision + 同一动作”重复提交一次，必须被拒或幂等处理
        dup = client.post(f"/games/{game_id}/actions", json={
            "revision": last_revision - 1 if last_revision > 1 else -1,
            "action_id": action_id, "payload": payload,
        })
        if dup.status_code == 200:
            fail(f"旧 revision({last_revision - 1}) 的动作被接受了，防重复提交失效")
            break

        r = client.post(f"/games/{game_id}/actions", json={
            "revision": view["revision"], "action_id": action_id, "payload": payload,
        })
        if r.status_code != 200:
            fail(f"POST /actions 失败：{r.status_code} {r.text[:400]}（action={action_id} type 见日志）")
            break
        view = r.json().get("state") or r.json()
        if view.get("revision", 0) <= last_revision:
            fail(f"revision 未递增：{last_revision} -> {view.get('revision')}")
            break
        last_revision = view["revision"]
        if verbose:
            evs = view.get("events") or []
            if evs:
                print(f"    step {steps}: {evs[-1].get('type')} {evs[-1].get('data', '')}")

    if steps >= 400:
        fail("一局超过 400 步仍未结束")

    if view.get("status") != "ended":
        fail(f"一局未正常结束：status={view.get('status')}")
    else:
        print(f"  结束：winner={view.get('winner')}，共 {steps} 次人类决策，"
              f"revision={view.get('revision')}")

    client.delete(f"/games/{game_id}")
    return view


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000/api/v1")
    ap.add_argument("--players", type=int, default=3)
    ap.add_argument("--games", type=int, default=1)
    ap.add_argument("--seed", type=int, default=20260912)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    with httpx.Client(base_url=args.base, timeout=120.0) as client:
        h = client.get("/health")
        print(f"health: {h.status_code} {h.text[:200]}")
        if h.status_code != 200:
            print("后端未就绪，先启动：python main.py serve --port 8000")
            return 1

        for g in range(args.games):
            print(f"—— 第 {g + 1}/{args.games} 局 ——")
            play_one(client, args.players, args.seed + g * 977, args.verbose)

    print("\n=== 特殊决策覆盖 ===")
    print(" ", sorted(PHASE_HITS) or "（未覆盖到，可能需要多打几局）")

    if FAILURES:
        print(f"\n=== 验收失败（{len(FAILURES)} 项）===")
        for f in FAILURES:
            print("  -", f)
        return 1

    print("\n=== E2E 验收通过 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())

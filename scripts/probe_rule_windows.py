#!/usr/bin/env python3
"""探测真实后端在各「特殊决策窗口」给出的可选动作（用于验证规则改动是否真的生效）。

为什么需要它：卡牌交互窗口（反制 / 排序 / 天劫回插）依赖对局随机性，UI 点按很难稳定复现；
本脚本直接驱动 API 跑若干局，抓住每个窗口的**原始 legal_actions**，作为规则生效的硬证据。

用法::

    python scripts/probe_rule_windows.py --base http://127.0.0.1:8030/api/v1 --games 10

注意请求体形状（易错，已踩过）::

    POST /games               {"players": 2, "human_player": 0, "agents": [null, {"type": "random"}], "seed": N}
    POST /games/{id}/actions  {"revision": R, "action_id": "a_xxx", "payload": {...}}
    # 响应形如 {"game_id":..., "player_id":..., "state": {GameView}}；actions 直接返回 GameView

只发 `action_id` + `payload`，后端用 `(revision, action_id)` 反查真实动作（API_CONTRACT §11）。
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request

WINDOWS = {
    "COUNTER": "反制窗口（含反制符 / 遁术）",
    "REORDER_TOP": "排序窗口",
    "REINSERT_TRIBULATION": "天劫回插窗口",
}

PRIORITY = (
    "PLAY_CARD_TARGET", "PLAY_CARD", "COUNTER", "ESCAPE",
    "REORDER_TOP", "REINSERT_TRIBULATION", "PASS_COUNTER", "END_ACTION",
)


def req(base: str, method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{base}{path}", data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as f:
            return json.load(f)
    except urllib.error.HTTPError as e:
        return {"__error": e.code, "body": e.read().decode()[:220]}


def build_payload(action: dict) -> dict:
    """把 legal_action 的 params.options 转成提交用的 payload（取第一个候选）。"""
    params = action.get("params") or {}
    payload: dict = {}
    tp = params.get("target_player")
    if tp and tp.get("options"):
        payload["target_player"] = tp["options"][0]
    if action["type"] == "REORDER_TOP":
        order = (params.get("order") or {}).get("options")
        if order:
            payload["order"] = order[0] if isinstance(order[0], list) else order
    if action["type"] == "REINSERT_TRIBULATION":
        regions = (params.get("region") or {}).get("options")
        if regions:
            payload["region"] = regions[0]
    return payload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8030/api/v1")
    ap.add_argument("--games", type=int, default=10)
    ap.add_argument("--players", type=int, default=2)
    ap.add_argument("--max-steps", type=int, default=300)
    args = ap.parse_args()

    found: dict[str, list[str]] = {}
    for seed in range(1, args.games + 1):
        agents = [None] + [{"type": "random"}] * (args.players - 1)
        g = req(args.base, "POST", "/games",
                {"players": args.players, "human_player": 0, "agents": agents, "seed": seed * 977})
        if "__error" in g:
            print("创建失败:", g)
            return 1
        gid, st = g["game_id"], g.get("state", g)

        for _ in range(args.max_steps):
            if st.get("phase") == "ENDED" or st.get("winner") is not None:
                break
            actions, phase = st["legal_actions"], st["phase"]
            if phase in WINDOWS and phase not in found:
                found[phase] = sorted({a["label"] for a in actions})
                print(f"★ seed={seed} {WINDOWS[phase]}：{found[phase]}", flush=True)

            pick = next((a for t in PRIORITY for a in actions
                         if a["type"] == t and a.get("enabled", True)), None)
            if pick is None:
                break
            res = req(args.base, "POST", f"/games/{gid}/actions",
                      {"revision": st["revision"], "action_id": pick["id"],
                       "payload": build_payload(pick)})
            if "__error" in res:
                print(f"  ! {pick['type']} → {res['__error']} {res['body'][:140]}", flush=True)
                break
            st = res.get("state", res)

    print("\n=== 结果 ===")
    ok = True
    for phase, label in WINDOWS.items():
        got = found.get(phase)
        print(f"  {label}: {got}")
        if not got:
            ok = False
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

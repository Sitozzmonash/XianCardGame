"""Agent 构造与 spec 转换（INTERFACES §4.1）。

* `agent_spec_from_request({"type": "ismcts", "simulations": 500}) -> "ismcts:500"`
* `build_agent(spec, seed) -> BaseAgent`
* ISMCTS 模拟次数**强制钳位**到 `ISMCTS_MAX_SIMULATIONS`（默认 2000），
  钳位结果通过 `normalize_agent_spec()` 的 meta 回传（写进 `public.players[].agent`）
  并写日志，绝不静默超时。
"""

from __future__ import annotations

import logging
from typing import Any, Mapping, Optional, Tuple

from agents import BaseAgent, parse_agent

from ..core.config import Settings, get_settings
from ..core.errors import InvalidAgentSpec

log = logging.getLogger("app.services.agent_factory")

#: 允许的 agent 类型
AGENT_KINDS: tuple[str, ...] = ("random", "rule", "ismcts", "mccfr")

#: 各座位 agent seed 派生步长（固定常量，保证同 seed 完全可复现）
SEAT_SEED_STRIDE: int = 7919


def _fmt_number(value: float) -> str:
    """`1.4 -> "1.4"`、`500.0 -> "500"`（spec 字符串必须干净）。"""
    if float(value).is_integer():
        return str(int(value))
    return repr(float(value))


def agent_spec_from_request(req_agent: Any) -> str:
    """把请求里的 agent 配置转成 `parse_agent` 的 spec 字符串。"""
    if req_agent is None:
        raise InvalidAgentSpec("座位缺少 agent 配置（human 座位才允许为 null）")

    if isinstance(req_agent, str):
        text = req_agent.strip()
        if not text:
            raise InvalidAgentSpec("agent spec 不能为空")
        kind = text.split(":")[0].strip().lower()
        if kind not in AGENT_KINDS:
            raise InvalidAgentSpec(f"未知 agent 类型：{kind}；支持 {' | '.join(AGENT_KINDS)}")
        return text

    if not isinstance(req_agent, Mapping):
        raise InvalidAgentSpec(f"agent 配置必须是对象或字符串，收到：{type(req_agent).__name__}")

    kind = str(req_agent.get("type") or req_agent.get("kind") or "").strip().lower()
    if not kind:
        raise InvalidAgentSpec("agent 配置缺少 type 字段")
    if kind not in AGENT_KINDS:
        raise InvalidAgentSpec(f"未知 agent 类型：{kind}；支持 {' | '.join(AGENT_KINDS)}")

    if kind in ("random", "rule"):
        return kind

    if kind == "ismcts":
        simulations = req_agent.get("simulations", req_agent.get("sims"))
        exploration = req_agent.get("exploration")
        parts = ["ismcts"]
        if simulations is not None:
            try:
                parts.append(str(int(simulations)))
            except (TypeError, ValueError) as exc:
                raise InvalidAgentSpec(f"simulations 必须是整数：{simulations}") from exc
        elif exploration is not None:
            parts.append(str(int(get_settings().default_ismcts_simulations)))
        if exploration is not None:
            try:
                parts.append(_fmt_number(float(exploration)))
            except (TypeError, ValueError) as exc:
                raise InvalidAgentSpec(f"exploration 必须是数字：{exploration}") from exc
        return ":".join(parts)

    # mccfr
    path = req_agent.get("model") or req_agent.get("path") or req_agent.get("model_path")
    if not path:
        raise InvalidAgentSpec("mccfr 需要 model / path 字段指向 .pkl")
    return f"mccfr:{str(path).strip()}"


def normalize_agent_spec(
    spec: Any, settings: Optional[Settings] = None
) -> Tuple[str, dict]:
    """规范化 spec 并返回 `(parse_agent 用的 spec 字符串, 公开 meta)`。

    meta 会写进 `GameView.public.players[].agent`，其中 `clamped` 表示
    `simulations` 是否被上限钳位过（可观测、可日志追踪）。
    """
    st = settings or get_settings()
    spec_str = agent_spec_from_request(spec)
    parts = spec_str.split(":")
    kind = parts[0].strip().lower()

    if kind == "ismcts":
        requested_raw = parts[1].strip() if len(parts) > 1 and parts[1].strip() else ""
        try:
            requested = int(requested_raw) if requested_raw else int(st.default_ismcts_simulations)
        except ValueError as exc:
            raise InvalidAgentSpec(f"simulations 非法：{spec_str}") from exc
        if requested < 1:
            raise InvalidAgentSpec(f"simulations 至少为 1：{spec_str}")

        effective = max(1, min(requested, int(st.ismcts_max_simulations)))
        clamped = effective != requested
        if clamped:
            log.warning(
                "ISMCTS simulations=%s 超过上限 %s，已钳位为 %s",
                requested,
                st.ismcts_max_simulations,
                effective,
            )

        exploration = st.default_ismcts_exploration
        if len(parts) > 2 and parts[2].strip():
            try:
                exploration = float(parts[2])
            except ValueError as exc:
                raise InvalidAgentSpec(f"exploration 非法：{spec_str}") from exc

        meta = {
            "type": "ismcts",
            "simulations": effective,
            "exploration": exploration,
            "requested_simulations": requested,
            "clamped": clamped,
        }
        # `max_depth` 不在冻结 spec 语法里（"ismcts:<sims>[:<exploration>]"），
        # 只能走 dict 请求传；这里带上，构造时直接喂给 ISMCTSAgent。
        if isinstance(spec, Mapping) and spec.get("max_depth") is not None:
            try:
                depth = int(spec["max_depth"])
            except (TypeError, ValueError) as exc:
                raise InvalidAgentSpec(f"max_depth 必须是整数：{spec['max_depth']}") from exc
            if depth < 1:
                raise InvalidAgentSpec(f"max_depth 至少为 1：{depth}")
            meta["max_depth"] = depth
        return f"ismcts:{effective}:{_fmt_number(exploration)}", meta

    if kind == "mccfr":
        path = ":".join(parts[1:]).strip()
        if not path:
            raise InvalidAgentSpec("mccfr 需要模型路径，例如 mccfr:models/mccfr_3p_100k.pkl")
        return f"mccfr:{path}", {"type": "mccfr", "model": path, "clamped": False}

    return kind, {"type": kind, "clamped": False}


def build_agent_with_meta(
    spec: Any, seed: int = 0, settings: Optional[Settings] = None
) -> Tuple[BaseAgent, dict]:
    """构造 agent 实例并返回 `(agent, public meta)`。"""
    st = settings or get_settings()
    spec_str, meta = normalize_agent_spec(spec, st)
    try:
        if meta.get("type") == "ismcts" and meta.get("max_depth"):
            # 冻结 spec 语法没有 max_depth 槽位，需要 dict 请求时直接构造
            from agents import ISMCTSAgent

            agent: BaseAgent = ISMCTSAgent(
                simulations=int(meta["simulations"]),
                exploration=float(meta["exploration"]),
                max_depth=int(meta["max_depth"]),
                seed=int(seed),
            )
        else:
            agent = parse_agent(spec_str, int(seed))
    except InvalidAgentSpec:
        raise
    except Exception as exc:  # 模型缺失 / 参数非法都归一到 400
        raise InvalidAgentSpec(f"无法构造 agent（{spec_str}）：{exc}") from exc
    return agent, meta


def build_agent(spec: dict, seed: int) -> BaseAgent:
    """INTERFACES §4.1 冻结签名：`build_agent(spec, seed) -> BaseAgent`。"""
    agent, _meta = build_agent_with_meta(spec, seed)
    return agent


def build_seat_agents(
    agent_specs: list, seed: int, settings: Optional[Settings] = None
) -> Tuple[dict, dict]:
    """为每个非空座位构造 agent，返回 `({seat: agent}, {seat: meta})`。

    座位 seed 派生：`game_seed + seat * SEAT_SEED_STRIDE`（固定常量 → 完全可复现；
    同一 seed 下每次跑出的对局逐帧一致，便于前端联调与回归）。
    """
    st = settings or get_settings()
    agents: dict = {}
    metas: dict = {}
    for seat, spec in enumerate(agent_specs):
        if spec is None:
            continue
        agent, meta = build_agent_with_meta(
            spec, int(seed) + seat * SEAT_SEED_STRIDE, st
        )
        agents[seat] = agent
        metas[seat] = meta
    return agents, metas


__all__ = [
    "AGENT_KINDS",
    "agent_spec_from_request",
    "normalize_agent_spec",
    "build_agent",
    "build_agent_with_meta",
    "build_seat_agents",
]

"""Agent 注册表与 spec 解析（冻结契约 `docs/INTERFACES.md` §2）。

spec 语法：
```text
"random" | "rule" | "ismcts" | "ismcts:<sims>" | "ismcts:<sims>:<exploration>" | "mccfr:<path.pkl>"
```
缺省：`simulations=500`、`exploration=1.4`（spec §23）。
"""

from __future__ import annotations

from typing import Optional

from .base import BaseAgent
from .ismcts import ISMCTSAgent
from .mccfr import MCCFRAgent
from .random_agent import RandomAgent
from .rule_agent import RuleAgent

#: 供 `GET /agents` 使用（API_CONTRACT §5）
AGENT_INFOS: list[dict] = [
    {
        "id": "random",
        "name": "Random",
        "type": "random",
        "configurable": False,
    },
    {
        "id": "rule",
        "name": "Rule",
        "type": "rule",
        "configurable": False,
    },
    {
        "id": "ismcts",
        "name": "ISMCTS",
        "type": "ismcts",
        "configurable": True,
        "defaults": {
            "simulations": 500,
            "exploration": 1.4,
            "max_depth": 250,
        },
    },
    {
        "id": "mccfr",
        "name": "MCCFR",
        "type": "mccfr",
        "configurable": True,
        "defaults": {
            "model": None,
        },
    },
]

#: spec 支持的类型名
AGENT_TYPES: tuple[str, ...] = ("random", "rule", "ismcts", "mccfr")

DEFAULT_ISMCTS_SIMULATIONS: int = 500
DEFAULT_ISMCTS_EXPLORATION: float = 1.4


def parse_agent(spec: str, seed: int = 0) -> BaseAgent:
    """把 spec 字符串解析成 Agent 实例。

    - `"random"` / `"rule"`
    - `"ismcts"` / `"ismcts:500"` / `"ismcts:500:1.4"`
    - `"mccfr:models/x.pkl"`（路径里的冒号会原样保留，兼容 `D:/...`）
    """
    if not isinstance(spec, str) or not spec.strip():
        raise ValueError("agent spec 不能为空。")

    raw = spec.strip()
    parts = raw.split(":")
    kind = parts[0].strip().lower()

    if kind == "random":
        return RandomAgent(seed)
    if kind == "rule":
        return RuleAgent(seed)
    if kind == "ismcts":
        simulations = (
            _parse_int(parts[1], raw)
            if len(parts) > 1 and parts[1].strip()
            else DEFAULT_ISMCTS_SIMULATIONS
        )
        exploration = (
            _parse_float(parts[2], raw)
            if len(parts) > 2 and parts[2].strip()
            else DEFAULT_ISMCTS_EXPLORATION
        )
        return ISMCTSAgent(
            simulations=simulations, exploration=exploration, seed=seed
        )
    if kind == "mccfr":
        if len(parts) < 2 or not parts[1].strip():
            raise ValueError("mccfr 需要模型路径，例如 mccfr:models/mccfr_3p_100k.pkl")
        path = ":".join(parts[1:]).strip()
        return MCCFRAgent.load(path, seed)

    raise ValueError(
        f"未知 agent spec：{spec}；支持 {' | '.join(AGENT_TYPES)} 与 "
        "ismcts:<sims>[:<exploration>] / mccfr:<path.pkl>"
    )


def agent_info(agent_type: str) -> Optional[dict]:
    """按 type 查 AGENT_INFOS 条目。"""
    return next((info for info in AGENT_INFOS if info["type"] == agent_type), None)


def _parse_int(text: str, raw: str) -> int:
    try:
        return int(text)
    except ValueError as exc:
        raise ValueError(f"spec 里的整数非法：{raw}") from exc


def _parse_float(text: str, raw: str) -> float:
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(f"spec 里的浮点数非法：{raw}") from exc

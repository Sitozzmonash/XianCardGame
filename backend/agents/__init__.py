"""`agents` 包：random / rule / ismcts / mccfr 四种 AI（冻结契约 `docs/INTERFACES.md` §2）。"""

from __future__ import annotations

from .base import BaseAgent
from .common import regret_matching, sample_from_strategy
from .ismcts import ISMCTSAgent
from .mccfr import MCCFRAgent
from .random_agent import RandomAgent
from .registry import AGENT_INFOS, AGENT_TYPES, agent_info, parse_agent
from .rule_agent import RuleAgent

__all__ = [
    "BaseAgent",
    "RandomAgent",
    "RuleAgent",
    "ISMCTSAgent",
    "MCCFRAgent",
    "AGENT_INFOS",
    "AGENT_TYPES",
    "agent_info",
    "parse_agent",
    "sample_from_strategy",
    "regret_matching",
]

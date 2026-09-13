"""动作定义与对外 API 映射（冻结契约 `docs/INTERFACES.md` §1.3 / §1.7）。

- `ActionKind` 成员名英文，`value` 保持参考实现的中文（日志、`key()` 依赖）；
- `Action` 冻结 dataclass：可哈希、可相等比较，可直接放进 set 做合法性校验；
- `api_type()` 给出 API_CONTRACT §10-12 的 type 字符串。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from hashlib import blake2b
from typing import Optional

from .cards import Card


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


#: ActionKind -> API_CONTRACT 动作 type（§1.7 映射表，冻结）
#:
#: 注意 `PLAY_SKIP`：成员名与中文 value 保持与参考实现一致（enum 表面不变），
#: 但**语义已改**为反制阶段的反应牌「遁术：避开一次指向你的法术」，因此 api type
#: 从 `PLAY_CARD` 改为独立的 `ESCAPE`（见 docs/CARD_RULES_DELTA.md §2.2）。
API_ACTION_TYPE: dict[ActionKind, str] = {
    ActionKind.END_TURN: "END_ACTION",
    ActionKind.PLAY_PEEK: "PLAY_CARD",
    ActionKind.PLAY_REORDER: "PLAY_CARD",
    ActionKind.PLAY_SHUFFLE: "PLAY_CARD",
    ActionKind.PLAY_SKIP: "ESCAPE",
    ActionKind.PLAY_STEAL: "PLAY_CARD_TARGET",
    ActionKind.PASS_COUNTER: "PASS_COUNTER",
    ActionKind.PLAY_COUNTER: "COUNTER",
    ActionKind.REORDER_TOP: "REORDER_TOP",
    ActionKind.REINSERT: "REINSERT_TRIBULATION",
}

#: 出牌类动作 -> 消耗的卡。
#: `PLAY_COUNTER` 也在这里：它虽然是**反应牌**（合法性由 `Phase.COUNTER` 把关，见 `state.py`
#: 的 `legal_actions()`），但把它算作「会消耗卡的动作」才能让两处一致 ——
#: ① `legal_action_dicts()` 给「使用反制符」带上 `card_instance_id`
#: （否则与同为反应牌的遁术不一致：遁术有条目句柄、反制符是 null）；
#: ② 事件层为它补一条 `CARD_PLAYED`（契约 §13 / A13 规定「反制 = CARD_PLAYED(COUNTER) →
#: COUNTER_USED → …」，此前实现漏了，而离线 mock 反而发了）。
#: 安全性：引擎动作合法性由 phase 把关，且 `_step_action` 遇到 `PLAY_COUNTER` 会落到
#: `raise RuntimeError(f"未处理动作：{action}")`，因此这张表不会让反制符变成可主动使用。
KIND_TO_CARD: dict[ActionKind, Card] = {
    ActionKind.PLAY_PEEK: Card.PEEK,
    ActionKind.PLAY_REORDER: Card.REORDER,
    ActionKind.PLAY_SHUFFLE: Card.SHUFFLE,
    ActionKind.PLAY_SKIP: Card.SKIP,
    ActionKind.PLAY_STEAL: Card.STEAL,
    ActionKind.PLAY_COUNTER: Card.COUNTER,
}

#: 卡 -> 出牌类动作（KIND_TO_CARD 的反向表）
CARD_TO_KIND: dict[Card, ActionKind] = {card: kind for kind, card in KIND_TO_CARD.items()}

#: 回插区域（§8，固定 4 个）
REINSERT_REGIONS: tuple[str, ...] = ("TOP", "NEAR_TOP", "MIDDLE", "BOTTOM")

#: 回插区域 -> 中文标签（前端 label 用）
REINSERT_REGION_LABELS: dict[str, str] = {
    "TOP": "牌堆顶",
    "NEAR_TOP": "靠近顶部",
    "MIDDLE": "牌堆中部",
    "BOTTOM": "牌堆底部",
}

#: 默认中文 label（PLAY_STEAL / REINSERT 因带目标或区域，另行拼接）
ACTION_LABELS: dict[ActionKind, str] = {
    ActionKind.END_TURN: "结束行动并抽牌",
    ActionKind.PLAY_PEEK: "使用观星术",
    ActionKind.PLAY_REORDER: "使用逆天改命",
    ActionKind.PLAY_SHUFFLE: "使用扰乱天机",
    ActionKind.PLAY_SKIP: "使用遁术（避开并结束结算）",
    ActionKind.PLAY_COUNTER: "使用反制符",
    ActionKind.PASS_COUNTER: "不反制",
    ActionKind.REORDER_TOP: "调整顶部牌序",
}


@dataclass(frozen=True)
class Action:
    kind: ActionKind
    target: int = -1
    param: str = ""

    # ---------------------------------------------------------------- 契约 API

    def key(self) -> str:
        """`f"{kind.value}|{target}|{param}"`：中文值，稳定可比。"""
        return f"{self.kind.value}|{self.target}|{self.param}"

    def __str__(self) -> str:  # 保持参考实现风格的中文可读形式
        if self.target >= 0:
            extra = f", {self.param}" if self.param else ""
            return f"{self.kind.value}(目标=P{self.target}{extra})"
        return f"{self.kind.value}{f'({self.param})' if self.param else ''}"

    def api_type(self) -> str:
        return API_ACTION_TYPE[self.kind]

    # ------------------------------------------------------------ 便捷扩展

    def action_id(self) -> str:
        """`f"a_{blake2b(action.key().encode(), digest_size=4).hexdigest()}"`（8 位 hex）。"""
        return action_id(self)

    def playable_card(self) -> Optional[Card]:
        """出牌类动作消耗的卡；其他动作返回 None。"""
        return KIND_TO_CARD.get(self.kind)

    def label(self) -> str:
        """中文 label（带目标/区域的动作会拼接上下文）。"""
        if self.kind == ActionKind.PLAY_STEAL:
            return f"{self.kind.value} → P{self.target}"
        if self.kind == ActionKind.REINSERT:
            return f"回插：{REINSERT_REGION_LABELS.get(self.param, self.param)}"
        return ACTION_LABELS[self.kind]


def action_id(action: Action) -> str:
    """按 §1.7 生成稳定的 8 位 hex action id（同一 revision 内稳定）。"""
    digest = blake2b(action.key().encode("utf-8"), digest_size=4).hexdigest()
    return f"a_{digest}"

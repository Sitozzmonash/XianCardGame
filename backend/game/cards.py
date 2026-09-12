"""卡牌定义与编码辅助。

本模块是 **冻结契约** `docs/INTERFACES.md` §1.1 的实现：
- 枚举成员名一律英文（代码里用），`value` 保持中文（日志 / 前端文案依赖）；
- 8 张牌的**固定顺序**用于信息集与模型的紧凑编码，发布后不得变更。

注意：`Card` 继承 `str`，因此 `Card.TRIBULATION == "天劫"` 且 hash 相同，
字典查找用中文串或枚举都行。

额外提供两个紧凑编码辅助（信息集编码用，见 §1.5）：
- `counts_vector()`：`list[Card] -> tuple[int, ...]` 长度 8 的计数向量；
- `alive_mask_from()`：`list[bool] -> int` 存活位掩码。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Sequence


class Card(str, Enum):
    """8 张牌。成员名英文，value 中文。"""

    TRIBULATION = "天劫"
    DEFUSE = "护劫符"
    PEEK = "观星术"
    REORDER = "逆天改命"
    SHUFFLE = "扰乱天机"
    SKIP = "遁术"
    STEAL = "摄物术"
    COUNTER = "反制符"


#: 固定顺序，用于编码：TRIBULATION=0 ... COUNTER=7。一旦发布不得变更。
CARD_ORDER: tuple[Card, ...] = (
    Card.TRIBULATION,
    Card.DEFUSE,
    Card.PEEK,
    Card.REORDER,
    Card.SHUFFLE,
    Card.SKIP,
    Card.STEAL,
    Card.COUNTER,
)

#: Card -> 0..7
CARD_TO_INDEX: dict[Card, int] = {card: idx for idx, card in enumerate(CARD_ORDER)}

#: 0..7 -> Card
INDEX_TO_CARD: dict[int, Card] = {idx: card for card, idx in CARD_TO_INDEX.items()}

#: Card -> 对外 API 卡 id（§1.7 映射表，前后端共用）
API_CARD_ID: dict[Card, str] = {
    Card.TRIBULATION: "TRIBULATION",
    Card.DEFUSE: "DEFUSE",
    Card.PEEK: "STARGAZING",
    Card.REORDER: "REWRITE_FATE",
    Card.SHUFFLE: "SHUFFLE",
    Card.SKIP: "ESCAPE",
    Card.STEAL: "STEAL",
    Card.COUNTER: "COUNTER",
}

#: 对外 API 卡 id -> Card
CARD_BY_API_ID: dict[str, Card] = {api_id: card for card, api_id in API_CARD_ID.items()}


@dataclass(frozen=True)
class CardSpec:
    """供 `GET /cards` 使用的卡牌静态描述。"""

    id: str  # "STARGAZING"
    name: str  # "观星术"
    category: str  # "TRIBULATION" | "DEFUSE" | "ACTIVE" | "REACTIVE"
    description: str  # 中文效果说明
    asset: str  # 前端资源名，小写下划线


CARD_SPECS: tuple[CardSpec, ...] = (
    CardSpec(
        id="TRIBULATION",
        name="天劫",
        category="TRIBULATION",
        description="抽到后必须渡劫；手中没有护劫符则立即淘汰。天劫不进入手牌。",
        asset="tribulation",
    ),
    CardSpec(
        id="DEFUSE",
        name="护劫符",
        category="DEFUSE",
        description="自动化解一次天劫，并把天劫秘密回插到牌堆的指定区域。",
        asset="defuse",
    ),
    CardSpec(
        id="STARGAZING",
        name="观星术",
        category="ACTIVE",
        description="查看牌堆顶部最多 3 张牌，只有自己知道看到的内容。",
        asset="stargazing",
    ),
    CardSpec(
        id="REWRITE_FATE",
        name="逆天改命",
        category="ACTIVE",
        description="查看牌堆顶部最多 3 张牌，并重新调整它们的顺序，只有自己知道最终排序。",
        asset="rewrite_fate",
    ),
    CardSpec(
        id="SHUFFLE",
        name="扰乱天机",
        category="ACTIVE",
        description="重新洗牌，所有玩家此前获得的牌顶知识全部失效。",
        asset="shuffle",
    ),
    CardSpec(
        id="ESCAPE",
        name="遁术",
        category="ACTIVE",
        description="立即结束自己的回合，且本回合不抽牌。",
        asset="escape",
    ),
    CardSpec(
        id="STEAL",
        name="摄物术",
        category="ACTIVE",
        description="指定另一名存活玩家，随机偷取对方 1 张手牌；目标可以使用反制符取消。",
        asset="steal",
    ),
    CardSpec(
        id="COUNTER",
        name="反制符",
        category="REACTIVE",
        description="取消一次针对自己的摄物术；反制链深度固定为 1，不可反制反制。",
        asset="counter",
    ),
)

#: Card -> CardSpec
_SPEC_BY_CARD: dict[Card, CardSpec] = {
    CARD_BY_API_ID[spec.id]: spec for spec in CARD_SPECS
}


def card_spec(card: Card) -> CardSpec:
    """返回某张牌的 API 描述（CardSpec）。"""
    return _SPEC_BY_CARD[card]


def counts_vector(cards: Iterable[Card]) -> tuple[int, ...]:
    """把一串牌压成长度 8 的计数向量（按 CARD_ORDER 顺序）。

    手牌顺序对决策无意义，因此信息集里用计数向量而不是 tuple(卡)：
    既能进一步压缩模型体积，又不会丢失可区分性。
    """
    counts = [0] * len(CARD_ORDER)
    for card in cards:
        counts[CARD_TO_INDEX[card]] += 1
    return tuple(counts)


def alive_mask_from(alive: Sequence[bool]) -> int:
    """把存活状态压成位掩码：第 i 位为 1 表示 P{i} 存活。"""
    mask = 0
    for idx, ok in enumerate(alive):
        if ok:
            mask |= 1 << idx
    return mask

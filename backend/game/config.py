"""游戏配置（冻结契约 `docs/INTERFACES.md` §1.2）。

规则语义与 `reference/xiuxian_ai_demo/xiuxian/game.py::GameConfig` 保持一致，
仅新增 `deck_composition` 覆盖项与序列化辅助。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

#: `deck_composition` / YAML 里允许的键（对外 API 卡 id）
DEFAULT_DECK_COMPOSITION_KEYS: tuple[str, ...] = (
    "DEFUSE",
    "STARGAZING",
    "REWRITE_FATE",
    "SHUFFLE",
    "ESCAPE",
    "STEAL",
    "COUNTER",
    "TRIBULATION",
)

#: 建立初始 safe-cards 列表时的拼接顺序（必须与参考实现一致，否则 rng 序列不同）
SAFE_CARD_BUILD_ORDER: tuple[str, ...] = (
    "DEFUSE",
    "STARGAZING",
    "REWRITE_FATE",
    "SHUFFLE",
    "ESCAPE",
    "STEAL",
    "COUNTER",
)


def default_deck_composition(num_players: int) -> dict[str, int]:
    """参考实现的线性缩放的等价写法（键为 API 卡 id）。

    - 护劫符：每人开局 1 张，另外 `max(1, N//2)` 张进牌堆；
    - 观星术 `2N`、逆天改命 `N`、扰乱天机 `N`、遁术 `2N`、摄物术 `N`、反制符 `N`；
    - 天劫固定 `N-1` 张。
    """
    n = num_players
    return {
        "DEFUSE": max(1, n // 2),
        "STARGAZING": 2 * n,
        "REWRITE_FATE": n,
        "SHUFFLE": n,
        "ESCAPE": 2 * n,
        "STEAL": n,
        "COUNTER": n,
        "TRIBULATION": n - 1,
    }


#: 兼容别名（YAML 里可能写成 players / max_actions）
_FIELD_ALIASES: dict[str, str] = {
    "players": "num_players",
    "num_player": "num_players",
    "initial_hand_size": "initial_hand",
    "max_actions": "max_actions_per_turn",
    "max_decision": "max_decisions",
    "deck": "deck_composition",
    "deck_composition_override": "deck_composition",
}


@dataclass
class GameConfig:
    num_players: int = 3
    initial_hand: int = 5
    max_actions_per_turn: int = 2
    max_decisions: int = 500
    seed: int = 42
    deck_composition: Optional[dict[str, int]] = None

    # ------------------------------------------------------------------ 校验

    def validate(self) -> None:
        if not 2 <= int(self.num_players) <= 6:
            raise ValueError("Demo 支持 2~6 名玩家。")
        if int(self.initial_hand) < 2:
            raise ValueError("initial_hand 至少为 2。")
        if int(self.max_actions_per_turn) < 1:
            raise ValueError("max_actions_per_turn 至少为 1。")
        if int(self.max_decisions) < 1:
            raise ValueError("max_decisions 至少为 1。")
        if self.deck_composition is not None:
            if not isinstance(self.deck_composition, Mapping):
                raise TypeError("deck_composition 必须是 dict[str, int]。")
            # 延迟导入，避免 cards <-> config 的循环依赖。
            from .cards import CARD_BY_API_ID

            for key, value in self.deck_composition.items():
                if not isinstance(key, str):
                    raise TypeError("deck_composition 的键必须是 API 卡 id 字符串。")
                if key not in CARD_BY_API_ID:
                    raise ValueError(
                        f"未知卡 id：{key}；可用：{sorted(CARD_BY_API_ID)}"
                    )
                if int(value) < 0:
                    raise ValueError(f"卡牌数量不能为负：{key}={value}")

    def composition(self) -> dict[str, int]:
        """返回本局实际使用的牌堆组成（键为 API 卡 id）。

        `deck_composition` 是**部分覆盖**：只覆盖给出的键，其余按 `default_deck_composition()`
        的线性缩放取值（例如只想改天劫数量时，其余牌数保持不变）。
        """
        base = default_deck_composition(int(self.num_players))
        if self.deck_composition is not None:
            for key, value in self.deck_composition.items():
                base[key] = int(value)
        # 固定键顺序，便于序列化 / 对比
        return {key: base.get(key, 0) for key in DEFAULT_DECK_COMPOSITION_KEYS}

    # ------------------------------------------------------------ 序列化辅助

    def to_dict(self) -> dict:
        return {
            "num_players": int(self.num_players),
            "initial_hand": int(self.initial_hand),
            "max_actions_per_turn": int(self.max_actions_per_turn),
            "max_decisions": int(self.max_decisions),
            "seed": int(self.seed),
            "deck_composition": (
                None
                if self.deck_composition is None
                else {str(k): int(v) for k, v in self.deck_composition.items()}
            ),
        }

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "GameConfig":
        if not isinstance(d, Mapping):
            raise TypeError("GameConfig.from_dict 需要 mapping。")
        kwargs: dict[str, Any] = {}
        for raw_key, value in d.items():
            key = _FIELD_ALIASES.get(raw_key, raw_key)
            if key not in (
                "num_players",
                "initial_hand",
                "max_actions_per_turn",
                "max_decisions",
                "seed",
                "deck_composition",
            ):
                raise ValueError(f"GameConfig 未知字段：{raw_key}")
            kwargs[key] = value
        if kwargs.get("deck_composition") is not None:
            kwargs["deck_composition"] = {
                str(k): int(v) for k, v in dict(kwargs["deck_composition"]).items()
            }
        cfg = cls(**kwargs)
        cfg.validate()
        return cfg

    @classmethod
    def from_yaml(cls, path: str) -> "GameConfig":
        """读取 YAML；既支持 `game: {...}` 嵌套（spec §39），也支持平铺配置。"""
        import yaml  # 延迟导入：只有用到 YAML 时才需要 PyYAML

        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if not isinstance(data, Mapping):
            raise ValueError(f"配置文件格式错误（应为 mapping）：{path}")
        if "game" in data and isinstance(data["game"], Mapping):
            data = data["game"]
        return cls.from_dict(data)

"""Elo 评分表（spec §45「后续建议增加 Elo」）。

多人局按**两两对阵**更新（winner 击败其余全部；平局算 0.5；被第三方击败时双方都算负），
这是多人 Elo 的常用近似。只用于「训练越久是否越强」的相对比较。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Optional

#: 默认 K 因子与初始分
DEFAULT_K = 32.0
DEFAULT_INITIAL = 1500.0


@dataclass(frozen=True)
class MatchOutcome:
    """一局的对阵结果：`players` 是参与者的标签（按座位顺序），`winner` 为 None 表示平局。"""

    players: tuple[str, ...]
    winner: Optional[str] = None

    def __post_init__(self) -> None:
        if len(self.players) < 2:
            raise ValueError("Elo 对局至少需要 2 名参与者。")
        if self.winner is not None and self.winner not in self.players:
            raise ValueError(f"胜者 {self.winner} 不在参与者 {self.players} 中。")


def _coerce(outcome) -> MatchOutcome:
    """把多种写法统一成 `MatchOutcome`。"""
    if isinstance(outcome, MatchOutcome):
        return outcome
    if isinstance(outcome, Mapping):
        return MatchOutcome(
            tuple(outcome.get("players") or ()), outcome.get("winner")  # type: ignore[arg-type]
        )
    if isinstance(outcome, (tuple, list)) and len(outcome) == 2:
        players, winner = outcome
        return MatchOutcome(tuple(players), winner)
    raise TypeError(f"无法识别的对局结果：{outcome!r}")


class EloTable:
    """维护 `label -> Elo 分` 的表，支持增量更新与中文报表。"""

    def __init__(self, k: float = DEFAULT_K, initial: float = DEFAULT_INITIAL) -> None:
        self.k = float(k)
        self.initial = float(initial)
        self._ratings: dict[str, float] = {}
        self._games: dict[str, int] = {}
        self._wins: dict[str, int] = {}
        self._matches: int = 0

    # ------------------------------------------------------------------ 查询

    def rating(self, label: str) -> float:
        """取某个 label 的当前 Elo（未出现过的 label 返回初始分）。"""
        return self._ratings.get(label, self.initial)

    @property
    def table(self) -> dict[str, float]:
        """`{label: Elo}`（按分数降序）。"""
        return dict(sorted(self._ratings.items(), key=lambda item: item[1], reverse=True))

    @property
    def games(self) -> dict[str, int]:
        """`{label: 参与局数}`。"""
        return dict(self._games)

    @property
    def wins(self) -> dict[str, int]:
        """`{label: 胜场}`。"""
        return dict(self._wins)

    @property
    def matches(self) -> int:
        """已处理的对局数。"""
        return self._matches

    # ------------------------------------------------------------------ 更新

    def update(self, results: Iterable) -> None:
        """按一批对局结果更新 Elo。

        同一局内所有参与者的分数**同时**更新（用局前的分数算期望），避免顺序偏差。
        """
        for raw in results:
            outcome = _coerce(raw)
            self._apply(outcome)
            self._matches += 1

    def _apply(self, outcome: MatchOutcome) -> None:
        players = list(dict.fromkeys(outcome.players))  # 去重且保持顺序
        for label in players:
            self._ratings.setdefault(label, self.initial)
            self._games[label] = self._games.get(label, 0) + 1
        if outcome.winner is not None and outcome.winner in self._games:
            self._wins[outcome.winner] = self._wins.get(outcome.winner, 0) + 1

        def actual(label: str) -> float:
            """该 label 在本局的得分：胜 1、平 0.5、负（含被第三方击败）0。"""
            if outcome.winner is None:
                return 0.5
            return 1.0 if label == outcome.winner else 0.0

        deltas: dict[str, float] = {label: 0.0 for label in players}
        pairs = 0
        for i in range(len(players)):
            for j in range(i + 1, len(players)):
                left, right = players[i], players[j]
                pairs += 1
                expected_left = 1.0 / (
                    1.0 + 10.0 ** ((self._ratings[right] - self._ratings[left]) / 400.0)
                )
                deltas[left] += self.k * (actual(left) - expected_left)
                deltas[right] += self.k * (actual(right) - (1.0 - expected_left))

        for label, delta in deltas.items():
            self._ratings[label] += delta / max(1, pairs)

    # ------------------------------------------------------------------ 报表

    def report(self, title: str = "Elo 评分表") -> str:
        """中文报表（按分数降序）。"""
        from .metrics import format_table

        rows = [
            [
                label,
                f"{score:8.1f}",
                f"{score - self.initial:+7.1f}",
                str(self._games.get(label, 0)),
                str(self._wins.get(label, 0)),
            ]
            for label, score in self.table.items()
        ]
        body = format_table(["Agent", "Elo", "相对初始", "局数", "胜场"], rows) if rows else "（无数据）"
        return f"=== {title} ===\n{body}"

    def to_dict(self) -> dict:
        """序列化（供 CLI / 测试使用）。"""
        return {
            "k": self.k,
            "initial": self.initial,
            "matches": self._matches,
            "ratings": self.table,
            "games": self.games,
            "wins": self.wins,
        }

    def __len__(self) -> int:
        return len(self._ratings)


__all__ = ["EloTable", "MatchOutcome", "DEFAULT_K", "DEFAULT_INITIAL"]

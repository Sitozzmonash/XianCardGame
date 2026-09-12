"""InfoSet 后悔表 / 平均策略表的合并与差分工具。

被 `training/trainer.py`（主进程合并）与 `training/parallel.py`（Worker 进程算 delta）
共用，独立成模块以避免 `trainer <-> parallel` 的循环导入。

表结构统一为：
```python
{infoset_key: {action_key: float}}
```
- 新版 `infoset_key` 是 `tuple`（`game.state.GameState.infoset_key()`）；
- 旧版参考实现的 `infoset_key` 是 `repr(tuple)` 字符串（见 `migrate_legacy_key`）。
"""

from __future__ import annotations

from typing import Mapping, MutableMapping

#: 类型别名：{信息集 key: {动作 key: 数值}}
Table = MutableMapping[object, MutableMapping[str, float]]

#: 视为 0 的浮点阈值
EPSILON = 1e-15


def merge_nested(dst: Table, delta: Mapping) -> None:
    """把 `delta` 累加进 `dst`（原地修改）。

    用于并行训练：Worker 返回的 `regret_delta` / `strategy_delta` 合并回主表。
    """
    for info, values in delta.items():
        row = dst.setdefault(info, {})
        for action, value in values.items():
            row[action] = row.get(action, 0.0) + value


def diff_nested(new: Mapping, old: Mapping) -> dict:
    """计算 `new - old`，只保留差异超过 `EPSILON` 的条目。

    Worker 拿的是主进程的 regret 快照，训练完成后用本函数算出净增量，
    避免把整张表（可能几十万条）回传主进程。
    """
    out: dict = {}
    for info, values in new.items():
        base = old.get(info, {})
        row: dict[str, float] = {}
        for action, value in values.items():
            delta = value - base.get(action, 0.0)
            if abs(delta) > EPSILON:
                row[action] = delta
        if row:
            out[info] = row
    return out


def merge_tables(dst: Table, src: Mapping) -> int:
    """合并两张表并返回发生 key 碰撞（同一 key 出现在两边）的次数。

    仅用于旧格式迁移：例如两个旧字符串 key 恰好映射到同一个新 tuple key。
    """
    collisions = 0
    for info, values in src.items():
        existed = info in dst
        row = dst.setdefault(info, {})
        for action, value in values.items():
            if existed and action in row:
                collisions += 1
            row[action] = row.get(action, 0.0) + value
    return collisions


def table_size(table: Mapping) -> int:
    """表的条目总数：`sum(len(row) for row in table.values())`。"""
    return sum(len(row) for row in table.values())

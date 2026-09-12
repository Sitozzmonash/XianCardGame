"""信息集体积实测脚本（真实模型文件 vs 紧凑编码）。

用只读的参考模型 `reference/xiuxian_ai_demo/models/mccfr_2p_10k.pkl`（旧的
`repr(...)` 字符串 key）现场转换成本项目的紧凑 int/tuple 编码，然后对比
pickle 后的字节数与"字节/key"。

用法：
    cd D:/Documents/Hermes/xiuxian-card/backend
    .venv/Scripts/python.exe scripts/infoset_size_report.py
"""

from __future__ import annotations

import ast
import pickle
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from game.cards import CARD_ORDER, CARD_TO_INDEX  # noqa: E402

REF_MODEL = (
    BACKEND.parent / "reference" / "xiuxian_ai_demo" / "models" / "mccfr_2p_10k.pkl"
)

PHASE_INDEX = {"行动": 0, "反制": 1, "改命排序": 2, "天劫回插": 3, "结束": 4}


def counts(names) -> tuple[int, ...]:
    vec = [0] * 8
    for name in names:
        vec[CARD_TO_INDEX[name]] += 1
    return tuple(vec)


def to_index_tuple(names) -> tuple[int, ...]:
    return tuple(CARD_TO_INDEX[name] for name in names)


def alive_mask(alive) -> int:
    mask = 0
    for idx, ok in enumerate(alive):
        if ok:
            mask |= 1 << idx
    return mask


def convert_key(old_key: str) -> tuple:
    """旧 repr 字符串 key -> 紧凑 int/tuple key（§1.5 编码）。"""
    (
        player,
        phase_value,
        current,
        decision,
        actions_used,
        deck_size,
        hand,
        known,
        reorder_private,
        hand_sizes,
        alive,
        discard_sig,
        pending,
    ) = ast.literal_eval(old_key)
    pending_compact = (
        (-1, -1)
        if pending[0] is None or pending[1] is None
        else (int(pending[0]), int(pending[1]))
    )
    return (
        int(player),
        PHASE_INDEX[phase_value],
        int(current),
        int(decision),
        int(actions_used),
        int(deck_size),
        counts(hand),
        to_index_tuple(known),
        to_index_tuple(reorder_private),
        tuple(int(x) for x in hand_sizes),
        alive_mask(alive),
        tuple(int(x) for x in discard_sig),
        pending_compact,
    )


def measure(tables: dict) -> int:
    return len(pickle.dumps(tables, protocol=pickle.HIGHEST_PROTOCOL))


def main() -> None:
    if not REF_MODEL.exists():
        raise SystemExit(f"参考模型不存在：{REF_MODEL}")

    print(f"参考模型：{REF_MODEL}")
    print(f"文件大小：{REF_MODEL.stat().st_size:,} bytes "
          f"({REF_MODEL.stat().st_size / 1024 / 1024:.1f} MB)")
    with open(REF_MODEL, "rb") as fh:
        data = pickle.load(fh)

    old_regret, old_strategy = data["regret_sum"], data["strategy_sum"]
    print(f"regret_sum: {len(old_regret):,} 个信息集；strategy_sum: {len(old_strategy):,} 个")

    # 1) 旧格式原样重新 pickle（作为公平基线，排除原始文件版本差异）
    old_payload = {"regret_sum": old_regret, "strategy_sum": old_strategy}
    old_bytes = measure(old_payload)

    # 2) 只把 key 换成紧凑编码，value 表原样保留
    new_payload = {
        "regret_sum": {convert_key(k): v for k, v in old_regret.items()},
        "strategy_sum": {convert_key(k): v for k, v in old_strategy.items()},
    }
    new_bytes = measure(new_payload)

    total_keys = len(old_regret) + len(old_strategy)
    print()
    print("=== key 编码替换前后（value 表完全不变）===")
    print(f"  旧格式（repr 大字符串）: {old_bytes:,} bytes  = "
          f"{old_bytes / total_keys:.1f} 字节/key")
    print(f"  新格式（紧凑 int/tuple）: {new_bytes:,} bytes  = "
          f"{new_bytes / total_keys:.1f} 字节/key")
    print(f"  体积比 old/new = {old_bytes / new_bytes:.2f}x，"
          f"节省 {(1 - new_bytes / old_bytes) * 100:.1f}%")

    # 3) 仅 key 本身（不含 value 表）
    old_keys = list(old_regret.keys())
    new_keys = [convert_key(k) for k in old_keys]
    old_key_only = len(pickle.dumps(old_keys, protocol=pickle.HIGHEST_PROTOCOL)) / len(old_keys)
    new_key_only = len(pickle.dumps(new_keys, protocol=pickle.HIGHEST_PROTOCOL)) / len(new_keys)
    print()
    print("=== 仅 key 本身（regret_sum 的 169,634 个 key）===")
    print(f"  旧：{old_key_only:.1f} 字节/key；新：{new_key_only:.1f} 字节/key；"
          f"key 体积比 = {old_key_only / new_key_only:.2f}x")

    # 4) 参考估算：如果连 value 表也换成「紧凑 key -> 浮点数组」（C3 的实现空间）
    def to_arrays(table: dict) -> dict:
        out = {}
        for key, values in table.items():
            ordered = [values[a] for a in sorted(values)]
            out[convert_key(key)] = tuple(ordered)
        return out

    arrays_payload = {
        "regret_sum": to_arrays(old_regret),
        "strategy_sum": to_arrays(old_strategy),
    }
    arrays_bytes = measure(arrays_payload)
    action_keys = set()
    for table in (old_regret, old_strategy):
        for values in table.values():
            action_keys.update(values.keys())
    print()
    print("=== 说明：value 表（动作字符串 key + float）在旧格式里占大头 ===")
    print(f"  全表不同动作字符串 {len(action_keys)} 个，例如 {sorted(action_keys)[:4]}")
    print(f"  旧 key + 旧 value            : {old_bytes:,} bytes")
    print(f"  紧凑 key + 旧 value          : {new_bytes:,} bytes  <- 本次 C2 改动")
    print(f"  紧凑 key + 浮点数组 value(参考估算，属 C3 范围): {arrays_bytes:,} bytes "
          f"({arrays_bytes / 1024 / 1024:.1f} MB)")

    # 5) 观察 key 长度分布
    lengths = [len(k) for k in old_keys]
    print()
    print(f"旧 key 字符串长度：平均 {sum(lengths)/len(lengths):.1f} 字符，"
          f"最短 {min(lengths)}，最长 {max(lengths)}")
    print("示例（旧 -> 新）：")
    print("  ", old_keys[0])
    print("  ", new_keys[0])


if __name__ == "__main__":
    main()

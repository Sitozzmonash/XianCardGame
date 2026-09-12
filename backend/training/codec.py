"""MCCFR 模型 **v2 紧凑二进制**编解码（冻结契约 `docs/INTERFACES.md` §3.5）。

# 为什么需要它

实测（2 人 10K：433,819 个信息集 / 1,177,036 条目）：

- 旧 `repr(str)` key 的 plain dict：124.0 MB
- 紧凑 tuple key：102.5 MB
- 紧凑 tuple key + 动作 key 字符串池化：**61.2 MB**（现表示的最好结果）

`dict[tuple, dict[str, float]]` 的地板约 40~50 MB（每个 tuple key 一个对象 + 每个
`dict[str, float]` 行一个对象 + 每个 float 一个对象），**不可能**再往下降。
所以 v2 不再用 Python 对象存表，而是把整张表压成几块 `bytes`：

```
key_blob       每信息集 uint16 payload_len + 打包 key（按打包后的字节序排序）
regret_blob    每信息集 uint8 n + n×uint16 action_id + n×float32 后悔值
strategy_blob  同上，值为平均策略权重
action_table   去重后的动作 key 字符串（实测全模型只有 22 种），行数据只存 uint16 id
key_anchor     每 stride 个信息集一个 uint32 偏移（用于二分 + 按需解码）
regret_anchor / strategy_anchor  同上，指向行数据（按需解码行）
```

# 三个刻意的设计决定

1. **key 打包 ≤ 32 B/key（目标）**：标量走 LEB128；`hand_counts` / `discard_sig`
   是定长 8 元组，分别用 4 bit 打包（值 ≤ 15）与「非零位掩码 + 非零值」表示；
   `known` / `reorder` 通常为空；`pending` 常见值 `(-1,-1)` 压进 1 字节。
   实测平均 ~20 B/key（见 `__main__` 自检）。
2. **稀疏锚点（每 `stride` 个信息集 4 字节）**：体积开销 < 1 B/key，但让
   「懒加载推理」可以在**不展开任何 Python dict** 的前提下二分查找信息集：
   二分到锚点所在块后，块内顺序跳过（≤ stride 次）即可命中。Render 免费档
   只有 512 MB 内存，部署产物（`strategy_only=True`）必须能只靠这几块 bytes 推理。
3. **打包必须是双射**：`pack_infoset_key` / `unpack_infoset_key` 对任意 key 无损
   （13 元组走紧凑编码；其它对象走 `str` / `pickle` 兜底），否则「按打包字节排序 +
   二分」就不成立。

# 与 §3.5 的差异（超集，已在汇报里说明）

- 多写了 `key_anchor` / `regret_anchor` / `strategy_anchor`（稀疏索引）与
  `key_layout` / `n_entries` / `n_strategy_entries` / `anchor_stride` /
  `packed_key_bytes` 统计字段；都是扁平标量或 bytes，不改变任何既有字段的语义。
  （`n_entries` = 容器里所有行的条目总数：全量 = 后悔表 + 策略表；`n_strategy_entries`
  只数策略表，与训练器 `policy_size` 同口径。）
- 保留了 `infoset_format` 与 `regret_sum` / `strategy_sum` 三个**兼容键**：
  前者是旧文件的自描述字段，后两者是旧工具按键名取值的占位（值就是同一份
  packed bytes，`pickle` 的 memo 会让它不额外占体积）。
"""

from __future__ import annotations

import gc
import pickle
import struct
import sys
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Optional, Sequence

# --------------------------------------------------------------------------- 常量

#: 当前模型文件格式版本
FORMAT_VERSION = 2

#: 旧（v1）模型文件版本：plain dict + 紧凑 tuple 或 `repr(str)` key
LEGACY_FORMAT_VERSION = 1

#: v2 编码标识（写进容器，便于排查）
ENCODING = "packed-v2"

#: key 打包布局版本（容器里显式记录；布局变了要一起改，读到不认识的布局要报错而不是乱解）
KEY_LAYOUT = 2

#: 信息集 key 编码标识（键仍是紧凑 tuple，只是打包成了二进制）
INFOSET_FORMAT = "compact-tuple-v2"

#: key 打包的目标上限（§3.5：≤ 32 B/key）；超过只用于打印告警，不阻断
KEY_BYTES_TARGET = 32

#: 稀疏锚点默认步长（每 stride 个信息集存一个 uint32 偏移）
DEFAULT_ANCHOR_STRIDE = 16

#: 容器里的三块二进制数据与对应的锚点键名
KEY_BLOB = "key_blob"
REGRET_BLOB = "regret_blob"
STRATEGY_BLOB = "strategy_blob"
ANCHOR_KEY = {KEY_BLOB: "key_anchor", REGRET_BLOB: "regret_anchor", STRATEGY_BLOB: "strategy_anchor"}

#: 单条 key 打包后的最大长度（uint16 长度前缀）
MAX_PACKED_KEY = 0xFFFF

#: 单行最大动作数（uint8 计数）
MAX_ROW_ACTIONS = 0xFF

#: 动作 id 上限（uint16）
MAX_ACTION_ID = 0xFFFF

# --------------------------------------------------------------------------- 动作 key 表

#: 动作 key 字符串 -> uint16 id（进程内全局表；模型文件里的 `action_table` 才是权威）
ACTION_ID: dict[str, int] = {}

#: 动作 id -> 动作 key 字符串（反查表）
ACTION_KEY: list[str] = []


def register_action_table(action_table: Sequence[str]) -> None:
    """把一张动作表登记为进程内全局表（`ACTION_ID` / `ACTION_KEY`）。

    字符串统一 `sys.intern`：v2 里动作字符串只出现在 `action_table` 一份，
    但 v1 兼容写盘与内存中的表仍能共享同一个 `str` 对象（§3.5 要求 0）。
    """
    ACTION_KEY.clear()
    ACTION_ID.clear()
    for index, name in enumerate(action_table):
        interned = sys.intern(str(name))
        ACTION_KEY.append(interned)
        ACTION_ID[interned] = index


def build_action_table(action_keys: Iterable[str]) -> list[str]:
    """去重 + 排序后返回动作 key 表（顺序稳定 ⇒ 文件字节可复现）。

    实测全模型只有 22 种动作 key，所以这张表本身可以忽略不计。
    """
    unique = {sys.intern(str(name)) for name in action_keys if name is not None}
    return sorted(unique)


def action_ids(action_table: Sequence[str]) -> dict[str, int]:
    """动作表 -> `{动作 key: id}`（行数据只写 id）。"""
    return {name: index for index, name in enumerate(action_table)}


# --------------------------------------------------------------------------- varint


def write_uvarint(out: bytearray, value: int) -> None:
    """LEB128 无符号整数（非负）。"""
    if value < 0:
        raise ValueError(f"write_uvarint 只接受非负整数：{value}")
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return


def read_uvarint(data: bytes, pos: int) -> tuple[int, int]:
    """读 LEB128 无符号整数，返回 `(值, 新位置)`。"""
    result = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise ValueError("打包数据在读取 varint 时意外结束")
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7
        if shift > 63:
            raise ValueError("varint 超过 64 位，数据可能已损坏")


def _zigzag(value: int) -> int:
    """有符号 -> 无符号（负数也能进 varint）。"""
    return (value << 1) ^ (value >> 63) if value < 0 else value << 1


def _unzigzag(value: int) -> int:
    return (value >> 1) ^ -(value & 1)


# --------------------------------------------------------------------------- key 打包
#
# 布局（kind 0：紧凑 13 元组）：**逐字节标定过**，实测 433,870 个真实信息集平均 18.0 B/key
# （旧 tuple 表示 63 B/key，`sys.getsizeof` 意义上的紧凑表示在地板上）。
#
#   1 byte   kind(2 bit) + flags(6 bit)
#   标量     flag SCALARS_4B：player/phase/cur/dec 各 3 bit + actions_used 4 bit +
#            deck_size 16 bit = 4 B；否则 6 个 varint
#   hand_counts   flag COUNTS_NIBBLE：8 个 4 bit（4 B，长度恒为 8）；否则 varint 长度 + varint×8
#   discard_sig   flag COUNTS_NIBBLE：8 个 4 bit（4 B）；否则 1 B 非零位掩码 + 非零项 varint
#   known/reorder flag EMPTY_SEQ：两者皆空则不写；否则：
#                  flag SEQ_ONE_BYTE：1 B（`k<<1|1`，要求 reorder 为空且 k ≤ 14）+ k 个 varint；
#                  否则 1 B(=0) + k varint + r varint + 值
#   hand_sizes    flag SIZES_NIBBLE：1 B 长度 + ceil(n/2) B（值 ≤ 15）；否则 varint 长度 + varints
#   alive_mask    varint（2 人局恒为 3 → 1 B）
#   pending       flag PENDING_1B：1 B（两维各 4 bit，+1 偏移）；否则 2 个 zigzag varint
#
# 该布局是双射：解析路径完全由 flags 决定，每个字段要么定长要么带长度前缀。
# 无法满足紧凑前提（例如 13 元组里塞了非 int、长度不是 8 的计数向量）的 key 一律走
# kind 2 的 `pickle` 兜底，**永不丢数据**。

_KIND_TUPLE = 0
_KIND_STR = 1
_KIND_PICKLE = 2

_FLAG_SIZES_NIBBLE = 1 << 0
_FLAG_PENDING_1B = 1 << 1
_FLAG_EMPTY_SEQ = 1 << 2
_FLAG_SCALARS_4B = 1 << 3
_FLAG_SEQ_ONE_BYTE = 1 << 4
_FLAG_COUNTS_NIBBLE = 1 << 5

_CARD_COUNT = 8  # len(game.cards.CARD_ORDER)

#: 标量 4 字节打包的字段位宽（超出就退回 varint 形式）
_SCALAR_BITS = (3, 3, 3, 3, 4, 16)

#: 解码快路径识别的两种 flags 组合（其余组合一律走通用解析器）：
#: 都是 SIZES_NIBBLE | PENDING_1B | SCALARS_4B | COUNTS_NIBBLE，再叠加
#: EMPTY_SEQ（=47）或 SEQ_ONE_BYTE（=59）——实测这两类占全部 key 的 93%。
_FAST_FLAGS_EMPTY_SEQ = (
    _FLAG_SIZES_NIBBLE | _FLAG_PENDING_1B | _FLAG_EMPTY_SEQ | _FLAG_SCALARS_4B | _FLAG_COUNTS_NIBBLE
)
_FAST_FLAGS_SEQ_ONE_BYTE = (
    _FLAG_SIZES_NIBBLE | _FLAG_PENDING_1B | _FLAG_SEQ_ONE_BYTE | _FLAG_SCALARS_4B | _FLAG_COUNTS_NIBBLE
)


def _is_int_seq(value: Any, *, length: Optional[int] = None) -> bool:
    """是否是「非负 int 元组」（可选校验长度）。"""
    if not isinstance(value, tuple):
        return False
    if length is not None and len(value) != length:
        return False
    for item in value:
        if isinstance(item, bool) or not isinstance(item, int):
            return False
        if item < 0 or item >= (1 << 62):
            return False
    return True


def _is_signed_pair(value: Any) -> bool:
    """`pending` 是**有符号**二元组（非 COUNTER 阶段是 `(-1, -1)`）。"""
    if not isinstance(value, tuple) or len(value) != 2:
        return False
    for item in value:
        if isinstance(item, bool) or not isinstance(item, int):
            return False
        if not -(1 << 62) < item < (1 << 62):
            return False
    return True


def _is_compact_tuple(key: Any) -> bool:
    """是否是 `GameState.infoset_key()` 产出的紧凑 13 元组（可走紧凑编码）。"""
    if type(key) is not tuple or len(key) != 13:
        return False
    for index, part in enumerate(key):
        if index in (6, 11):  # 手牌计数 / 弃牌计数：定长 8
            if not _is_int_seq(part, length=_CARD_COUNT):
                return False
        elif index in (7, 8, 9):  # known / reorder / hand_sizes：变长
            if not _is_int_seq(part):
                return False
        elif index == 12:
            if not _is_signed_pair(part):
                return False
        else:
            if isinstance(part, bool) or not isinstance(part, int):
                return False
            if part < 0 or part >= (1 << 62):
                return False
    return True


def _nibbles_to_bytes(seq: Sequence[int]) -> bytes:
    """8 个 ≤ 15 的计数压成 4 字节（每字节两个 4 bit）。"""
    out = bytearray(4)
    for index, value in enumerate(seq):
        if index % 2:
            out[index // 2] |= (int(value) & 0x0F) << 4
        else:
            out[index // 2] = int(value) & 0x0F
    return bytes(out)


def _bytes_to_nibbles8(data: bytes, pos: int) -> tuple[tuple[int, ...], int]:
    """读回 8 个 4 bit 计数（固定 4 字节）。"""
    values = []
    for index in range(_CARD_COUNT):
        byte = data[pos + index // 2]
        values.append((byte & 0x0F) if index % 2 == 0 else ((byte >> 4) & 0x0F))
    return tuple(values), pos + _CARD_COUNT // 2


def _write_scalars(out: bytearray, values: Sequence[int], packed: bool) -> None:
    """6 个标量：4 字节定点打包，或 6 个 varint。"""
    if packed:
        word = 0
        shift = 0
        for value, bits in zip(values, _SCALAR_BITS):
            word |= (int(value) & ((1 << bits) - 1)) << shift
            shift += bits
        out.extend(struct.pack("<I", word))
        return
    for value in values:
        write_uvarint(out, int(value))


def _read_scalars(data: bytes, pos: int, packed: bool) -> tuple[list[int], int]:
    if packed:
        (word,) = struct.unpack_from("<I", data, pos)
        pos += 4
        values = []
        shift = 0
        for bits in _SCALAR_BITS:
            values.append((word >> shift) & ((1 << bits) - 1))
            shift += bits
        return values, pos
    values = []
    for _ in range(6):
        value, pos = read_uvarint(data, pos)
        values.append(value)
    return values, pos


def _write_varint_seq(out: bytearray, seq: Sequence[int]) -> None:
    """写一个变长整数序列（长度前缀 + 逐项 varint）。"""
    write_uvarint(out, len(seq))
    for value in seq:
        write_uvarint(out, int(value))
    return None


def _read_varint_seq(data: bytes, pos: int) -> tuple[tuple[int, ...], int]:
    """读「长度前缀 + 逐项 varint」的整数序列。"""
    length, pos = read_uvarint(data, pos)
    return _read_values(data, pos, length)


def _read_values(data: bytes, pos: int, count: int) -> tuple[tuple[int, ...], int]:
    """读 `count` 个 varint 值。"""
    values = []
    for _ in range(count):
        value, pos = read_uvarint(data, pos)
        values.append(value)
    return tuple(values), pos


def pack_infoset_key(key: Any) -> bytes:
    """把信息集 key 打包成 bytes（**双射**，见模块头部说明）。

    - 紧凑 13 元组（`GameState.infoset_key()`）→ 紧凑二进制（目标 ≤ 32 B/key）；
    - 其它 `str` → kind 1（UTF-8）；其它对象 → kind 2（`pickle` 兜底）。
      旧模型里无法迁移的字符串 key 也能安全往返，不丢数据。
    """
    if _is_compact_tuple(key):
        return _pack_compact_tuple(key)  # type: ignore[arg-type]
    kind = _KIND_STR if isinstance(key, str) else _KIND_PICKLE
    payload = key.encode("utf-8") if kind == _KIND_STR else pickle.dumps(key, protocol=pickle.HIGHEST_PROTOCOL)
    out = bytearray()
    out.append((kind << 6) & 0xC0)
    write_uvarint(out, len(payload))
    out.extend(payload)
    return bytes(out)


def _pack_compact_tuple(key: Sequence[Any]) -> bytes:
    (
        player,
        phase,
        current_player,
        decision_player,
        actions_used,
        deck_size,
        hand_counts,
        known,
        reorder,
        hand_sizes,
        alive_mask,
        discard_sig,
        pending,
    ) = key

    flags = 0
    counts_nibble = max(hand_counts) <= 15 and max(discard_sig) <= 15
    sizes_nibble = bool(hand_sizes) and len(hand_sizes) <= 15 and max(hand_sizes) <= 15
    pending_1b = -1 <= pending[0] <= 14 and -1 <= pending[1] <= 14
    empty_seq = not known and not reorder
    scalars = (int(player), int(phase), int(current_player), int(decision_player), int(actions_used), int(deck_size))
    scalars_4b = all(value < (1 << bits) for value, bits in zip(scalars, _SCALAR_BITS))
    seq_one_byte = (not empty_seq) and not reorder and len(known) <= 14

    if sizes_nibble:
        flags |= _FLAG_SIZES_NIBBLE
    if pending_1b:
        flags |= _FLAG_PENDING_1B
    if empty_seq:
        flags |= _FLAG_EMPTY_SEQ
    if scalars_4b:
        flags |= _FLAG_SCALARS_4B
    if seq_one_byte:
        flags |= _FLAG_SEQ_ONE_BYTE
    if counts_nibble:
        flags |= _FLAG_COUNTS_NIBBLE

    out = bytearray()
    out.append((_KIND_TUPLE << 6) | flags)
    _write_scalars(out, scalars, scalars_4b)

    if counts_nibble:
        out.extend(_nibbles_to_bytes(hand_counts))
        out.extend(_nibbles_to_bytes(discard_sig))
    else:
        _write_varint_seq(out, hand_counts)
        mask = 0
        for index, value in enumerate(discard_sig):
            if value:
                mask |= 1 << index
        out.append(mask)
        for index, value in enumerate(discard_sig):
            if mask & (1 << index):
                write_uvarint(out, int(value))

    if not empty_seq:
        if seq_one_byte:
            out.append((len(known) << 1) | 1)
        else:
            out.append(0)  # 扩展形式标记（LSB=0）；(k<<1)|1 形式必定 LSB=1
            write_uvarint(out, len(known))
            write_uvarint(out, len(reorder))
        for value in known:
            write_uvarint(out, int(value))
        for value in reorder:
            write_uvarint(out, int(value))

    if sizes_nibble:
        out.append(len(hand_sizes))
        half = (len(hand_sizes) + 1) // 2
        for index in range(half):
            low = hand_sizes[index * 2]
            high = hand_sizes[index * 2 + 1] if index * 2 + 1 < len(hand_sizes) else 0
            out.append((low & 0x0F) | ((high & 0x0F) << 4))
    else:
        _write_varint_seq(out, hand_sizes)

    write_uvarint(out, int(alive_mask))

    if pending_1b:
        out.append((int(pending[0]) + 1) | ((int(pending[1]) + 1) << 4))
    else:
        write_uvarint(out, _zigzag(int(pending[0])))
        write_uvarint(out, _zigzag(int(pending[1])))
    return bytes(out)


def unpack_infoset_key(blob: bytes) -> Any:
    """`pack_infoset_key` 的逆运算（任意 key 都能无损还原）。"""
    header = blob[0]
    kind = (header >> 6) & 0x03
    if kind == _KIND_TUPLE:
        return _unpack_compact_tuple(blob)
    pos = 1
    length, pos = read_uvarint(blob, pos)
    payload = blob[pos : pos + length]
    if kind == _KIND_STR:
        return payload.decode("utf-8")
    return pickle.loads(payload)


def _unpack_common_flags(blob: bytes, flags: int) -> tuple:
    """flags == 47 / 59 的定长快路径（实测覆盖 93% 的真实 key）。

    这两类布局里所有字段都是定长或长度可预知（无 varint 解析循环），所以能
    绕开 `read_uvarint`，把「433,819 个 key 的解码」从 ~2.6 s 压到亚秒级。
    任何与预期不符（长度不吻合、出现多字节 varint）都会抛异常，由
    `_unpack_compact_tuple` 退回通用解析器处理 —— 快路径只做加速，不做裁决。
    """
    (word,) = _U32.unpack_from(blob, 1)
    b0, b1, b2, b3 = blob[5], blob[6], blob[7], blob[8]
    hand = (b0 & 15, b0 >> 4, b1 & 15, b1 >> 4, b2 & 15, b2 >> 4, b3 & 15, b3 >> 4)
    c0, c1, c2, c3 = blob[9], blob[10], blob[11], blob[12]
    discard = (c0 & 15, c0 >> 4, c1 & 15, c1 >> 4, c2 & 15, c2 >> 4, c3 & 15, c3 >> 4)

    pos = 13
    if flags == _FAST_FLAGS_SEQ_ONE_BYTE:
        head = blob[pos]
        pos += 1
        if not head & 1:
            raise ValueError("known 头字节不是 (k<<1)|1 形式")
        length = head >> 1
        known = tuple(blob[pos : pos + length])
        if len(known) != length or (known and max(known) > 127):
            raise ValueError("known 段非法（长度不足或出现多字节 varint）")
        pos += length
        reorder: tuple[int, ...] = ()
    else:
        known = ()
        reorder = ()

    sizes_len = blob[pos]
    pos += 1
    sizes = []
    for index in range(sizes_len):
        byte = blob[pos + index // 2]
        sizes.append((byte & 15) if index % 2 == 0 else (byte >> 4))
    pos += (sizes_len + 1) // 2
    alive = blob[pos]
    pos += 1
    pending_byte = blob[pos]
    pos += 1
    if pos != len(blob) or alive > 127:
        raise ValueError("快路径解析后长度不吻合（alive 多字节或有多余字节）")
    return (
        word & 7,
        (word >> 3) & 7,
        (word >> 6) & 7,
        (word >> 9) & 7,
        (word >> 12) & 15,
        word >> 16,
        hand,
        known,
        reorder,
        tuple(sizes),
        alive,
        discard,
        ((pending_byte & 15) - 1, (pending_byte >> 4) - 1),
    )


def _unpack_compact_tuple(blob: bytes) -> tuple:
    flags = blob[0] & 0x3F
    if flags == _FAST_FLAGS_EMPTY_SEQ or flags == _FAST_FLAGS_SEQ_ONE_BYTE:
        # 实测 93% 的 key 走这两条布局（全部定长/可预知），用无 varint 的快路径；
        # 只要有任何一点不符合预期（含字节数不吻合）就退回下面的通用解析器。
        try:
            return _unpack_common_flags(blob, flags)
        except (IndexError, ValueError):
            pass
    pos = 1
    scalars, pos = _read_scalars(blob, pos, packed=bool(flags & _FLAG_SCALARS_4B))

    if flags & _FLAG_COUNTS_NIBBLE:
        hand_counts, pos = _bytes_to_nibbles8(blob, pos)
        discard_sig, pos = _bytes_to_nibbles8(blob, pos)
    else:
        hand_counts, pos = _read_varint_seq(blob, pos)
        mask = blob[pos]
        pos += 1
        values = [0] * _CARD_COUNT
        for index in range(_CARD_COUNT):
            if mask & (1 << index):
                value, pos = read_uvarint(blob, pos)
                values[index] = value
        discard_sig = tuple(values)

    if flags & _FLAG_EMPTY_SEQ:
        known: tuple[int, ...] = ()
        reorder: tuple[int, ...] = ()
    elif flags & _FLAG_SEQ_ONE_BYTE:
        length = blob[pos] >> 1
        pos += 1
        values = []
        for _ in range(length):
            value, pos = read_uvarint(blob, pos)
            values.append(value)
        known = tuple(values)
        reorder = ()
    else:
        if blob[pos] != 0:
            raise ValueError("known/reorder 头字节非法")
        pos += 1
        # 编码端把两个长度写在一起（marker + k + r + 值），这里必须一致
        known_len, pos = read_uvarint(blob, pos)
        reorder_len, pos = read_uvarint(blob, pos)
        known, pos = _read_values(blob, pos, known_len)
        reorder, pos = _read_values(blob, pos, reorder_len)

    if flags & _FLAG_SIZES_NIBBLE:
        length = blob[pos]
        pos += 1
        half = (length + 1) // 2
        values = []
        for index in range(half):
            byte = blob[pos]
            pos += 1
            values.append(byte & 0x0F)
            if len(values) < length:
                values.append((byte >> 4) & 0x0F)
        hand_sizes = tuple(values)
    else:
        hand_sizes, pos = _read_varint_seq(blob, pos)

    alive_mask, pos = read_uvarint(blob, pos)
    if flags & _FLAG_PENDING_1B:
        byte = blob[pos]
        pos += 1
        pending = ((byte & 0x0F) - 1, ((byte >> 4) & 0x0F) - 1)
    else:
        first, pos = read_uvarint(blob, pos)
        second, pos = read_uvarint(blob, pos)
        pending = (_unzigzag(first), _unzigzag(second))
    if pos != len(blob):
        raise ValueError(f"打包 key 存在多余字节：{len(blob) - pos} B")
    return (
        scalars[0],
        scalars[1],
        scalars[2],
        scalars[3],
        scalars[4],
        scalars[5],
        tuple(hand_counts),
        tuple(known),
        tuple(reorder),
        tuple(hand_sizes),
        alive_mask,
        tuple(discard_sig),
        pending,
    )


# --------------------------------------------------------------------------- 行打包


def pack_row(values: Sequence[float], ids: Sequence[int]) -> bytes:
    """打包一行：`uint8 n + n×uint16 action_id + n×float32 值`。

    `ids` 需按升序（调用方保证），这样文件字节可复现、也便于人工比对。
    """
    count = len(ids)
    if count > MAX_ROW_ACTIONS:
        raise ValueError(f"单行动作数超过 {MAX_ROW_ACTIONS}：{count}")
    if count == 0:
        return b"\x00"
    out = bytearray()
    out.append(count)
    out.extend(struct.pack(f"<{count}H", *ids))
    out.extend(struct.pack(f"<{count}f", *values))
    return bytes(out)


def unpack_row(blob: bytes, pos: int, action_table: Sequence[str]) -> tuple[dict[str, float], int]:
    """从 `pos` 解出一行，返回 `({动作 key: float32 值}, 新位置)`。"""
    return _row_tuple(blob, pos, action_table)


#: 常用 Struct 预先编译（`struct.unpack_from(f"<{n}H")` 每次都要查格式缓存，热路径上省下来）
_U16 = struct.Struct("<H")
_U32 = struct.Struct("<I")
_ROW_STRUCTS: dict[int, tuple[struct.Struct, struct.Struct]] = {}


def _row_structs(count: int) -> tuple[struct.Struct, struct.Struct]:
    pair = _ROW_STRUCTS.get(count)
    if pair is None:
        pair = (struct.Struct(f"<{count}H"), struct.Struct(f"<{count}f"))
        _ROW_STRUCTS[count] = pair
    return pair


def _row_tuple(
    blob: bytes,
    pos: int,
    action_table: Sequence[str],
    key_cache: Optional[dict[tuple[int, ...], tuple[str, ...]]] = None,
) -> tuple[dict[str, float], int]:
    """热路径上的行礼解码（不做参数校验，`unpack_row` 与 `unpack_tables` 共用）。

    `key_cache`：`ids 元组 -> 动作 key 元组` 的缓存。整张表里动作组合只有几十种，
    缓存后每行省掉 3 次 `list.__getitem__` + 一次 `map`，87 万行上能省约 0.3 s。
    """
    count = blob[pos]
    pos += 1
    if not count:
        return {}, pos
    id_struct, value_struct = _row_structs(count)
    ids = id_struct.unpack_from(blob, pos)
    pos += 2 * count
    values = value_struct.unpack_from(blob, pos)
    if key_cache is None:
        names: tuple[str, ...] = tuple(map(action_table.__getitem__, ids))
    else:
        cached = key_cache.get(ids)
        if cached is None:
            cached = tuple(map(action_table.__getitem__, ids))
            key_cache[ids] = cached
        names = cached
    return dict(zip(names, values)), pos + 4 * count


def row_size(count: int) -> int:
    """一行占用的字节数（`uint8 n + n×uint16 + n×float32`）。"""
    return 1 + count * 6


def count_entries(blob: bytes) -> int:
    """数一块行 blob 里的条目总数（只读每行首字节的 `n`，不解码数值）。"""
    total = 0
    pos = 0
    size = len(blob)
    while pos < size:
        count = blob[pos]
        total += count
        pos += row_size(count)
    return total


def as_strategy_only(data: Mapping[str, Any]) -> dict[str, Any]:
    """从全量 v2 容器派生「仅策略」容器（丢掉 regret 块，**不展开**整表）。

    用于「先训好全量模型，再另存一份部署产物」且不想二次展开表的场景。
    """
    out = dict(data)
    out["strategy_only"] = True
    out[REGRET_BLOB] = b""
    out[ANCHOR_KEY[REGRET_BLOB]] = b""
    out["regret_sum"] = b""  # 兼容别名保持一致
    strategy_entries = count_entries(out.get(STRATEGY_BLOB) or b"")
    out["n_entries"] = strategy_entries
    out["n_strategy_entries"] = strategy_entries
    return out


# --------------------------------------------------------------------------- 容器


def _anchor_bytes(offsets: Sequence[int]) -> bytes:
    """把锚点偏移写成 uint32 小端 blob。"""
    if not offsets:
        return b""
    return struct.pack(f"<{len(offsets)}I", *offsets)


def build_container(
    regret_sum: Mapping[Any, Mapping[str, float]],
    strategy_sum: Mapping[Any, Mapping[str, float]],
    *,
    config: Mapping[str, Any],
    seed: int,
    exploration: float,
    iterations_done: int,
    traversals_done: int,
    strategy_only: bool = False,
    anchor_stride: int = DEFAULT_ANCHOR_STRIDE,
) -> dict[str, Any]:
    """把两张表压成 v2 扁平容器（只含 bytes / int / float / str / list / dict）。

    `strategy_only=True` 时不写后悔表（部署产物），体积最小。
    """
    stride = max(1, int(anchor_stride))
    tables: list[tuple[Mapping[Any, Mapping[str, float]], str]] = (
        [(strategy_sum, STRATEGY_BLOB)]
        if strategy_only
        else [(regret_sum, REGRET_BLOB), (strategy_sum, STRATEGY_BLOB)]
    )

    # 1) 打包所有 key，按打包字节排序（二分查找 + 流式还原都依赖这个顺序）。
    packed: dict[bytes, Any] = {}
    for table, _ in tables:
        for key in table:
            blob = pack_infoset_key(key)
            if len(blob) > MAX_PACKED_KEY:
                raise ValueError(f"打包后的 key 超过 {MAX_PACKED_KEY} B：{len(blob)} B")
            packed.setdefault(blob, key)
    ordered = sorted(packed)
    index_of = {blob: index for index, blob in enumerate(ordered)}

    # 2) 动作表（去重；行里只写 uint16 id）。
    action_names: set[str] = set()
    for table, _ in tables:
        for row in table.values():
            action_names.update(row.keys())
    action_table = build_action_table(action_names)
    if len(action_table) > MAX_ACTION_ID:
        raise ValueError(f"动作 key 种类超过 {MAX_ACTION_ID}：{len(action_table)}")
    ids = action_ids(action_table)

    # 3) key_blob（uint16 长度前缀）。
    key_out = bytearray()
    key_anchor: list[int] = []
    for index, blob in enumerate(ordered):
        if index % stride == 0:
            key_anchor.append(len(key_out))
        key_out.extend(struct.pack("<H", len(blob)))
        key_out.extend(blob)

    # 4) 行 blob（regret / strategy），并在同一顺序下给行数据也加锚点。
    blobs: dict[str, bytes] = {}
    anchors: dict[str, bytes] = {}
    entries_by_name: dict[str, int] = {}
    n_entries = 0
    for table, name in tables:
        out = bytearray()
        anchor: list[int] = []
        table_entries = 0
        for index, blob in enumerate(ordered):
            if index % stride == 0:
                anchor.append(len(out))
            row = table.get(packed[blob]) or {}
            if row:
                pairs = sorted((ids[key], float(value)) for key, value in row.items())
                row_ids = [pair[0] for pair in pairs]
                row_values = [pair[1] for pair in pairs]
                n_entries += len(row_ids)
                table_entries += len(row_ids)
                out.extend(pack_row(row_values, row_ids))
            else:
                out.append(0)
        blobs[name] = bytes(out)
        anchors[name] = _anchor_bytes(anchor)
        entries_by_name[name] = table_entries

    container: dict[str, Any] = {
        "format_version": FORMAT_VERSION,
        "encoding": ENCODING,
        "key_layout": KEY_LAYOUT,
        # 兼容键：旧文件用 `infoset_format` 自描述；v2 的 key 仍是紧凑 tuple，只是打包了。
        "infoset_format": INFOSET_FORMAT,
        "config": dict(config),
        "seed": int(seed),
        "exploration": float(exploration),
        "iterations_done": int(iterations_done),
        "traversals_done": int(traversals_done),
        "n_infosets": len(ordered),
        "n_entries": int(n_entries),
        "n_strategy_entries": int(entries_by_name.get(STRATEGY_BLOB, 0)),
        "action_table": list(action_table),
        "strategy_only": bool(strategy_only),
        "anchor_stride": stride,
        "packed_key_bytes": sum(len(blob) for blob in ordered),
        KEY_BLOB: bytes(key_out),
        ANCHOR_KEY[KEY_BLOB]: _anchor_bytes(key_anchor),
        REGRET_BLOB: blobs.get(REGRET_BLOB, b""),
        ANCHOR_KEY[REGRET_BLOB]: anchors.get(REGRET_BLOB, b""),
        STRATEGY_BLOB: blobs.get(STRATEGY_BLOB, b""),
        ANCHOR_KEY[STRATEGY_BLOB]: anchors.get(STRATEGY_BLOB, b""),
    }
    # 兼容别名：旧工具/旧测试会按键名取值；值与 *_blob 是同一个对象，
    # `pickle` 的 memo 会让它不重复占体积（§3.5 的容器是这几个键的超集）。
    container["regret_sum"] = container[REGRET_BLOB]
    container["strategy_sum"] = container[STRATEGY_BLOB]
    return container


def is_v2_container(data: Any) -> bool:
    """是否是 v2 容器（认 `encoding`，缺省时退回 `key_blob` 探测）。"""
    if not isinstance(data, dict):
        return False
    if data.get("encoding") == ENCODING:
        return True
    return KEY_BLOB in data and isinstance(data.get(KEY_BLOB), (bytes, bytearray))


def check_layout(data: Mapping[str, Any]) -> None:
    """校验 key 打包布局版本（不认识就**报错**，绝不让二进制乱解出错误的值）。"""
    layout = data.get("key_layout")
    if layout is None:
        return  # 缺省按当前布局处理（早期手工构造的容器）
    if int(layout) != KEY_LAYOUT:
        raise ValueError(
            f"未知的 key 打包布局：{layout}（当前代码支持 {KEY_LAYOUT}）。"
            "请用同版本的代码重新转换模型。"
        )


def container_tables(data: Mapping[str, Any]) -> tuple[list[tuple[str, bytes, bytes]], int]:
    """返回 `([(表名, 行 blob, 锚点), ...], 信息集数)`。"""
    n_infosets = int(data.get("n_infosets") or 0)
    out: list[tuple[str, bytes, bytes]] = []
    for name in (REGRET_BLOB, STRATEGY_BLOB):
        blob = data.get(name) or b""
        if not blob:
            continue
        out.append((name, blob, data.get(ANCHOR_KEY[name]) or b""))
    return out, n_infosets


def unpack_tables(data: Mapping[str, Any]) -> tuple[dict[Any, dict[str, float]], dict[Any, dict[str, float]]]:
    """把 v2 容器展开成 `{信息集: {动作 key: 值}}` 两张表（**顺序**解码，最快路径）。

    行的动作数 `n == 0` 视为「该信息集在这张表里不存在」（训练器两张表的 key
    集合始终一致，所以这与原表完全等价）。

    # 为什么在解码期间关掉循环 GC

    这里会一次性建 ~200 万个 Python 容器（dict / tuple / str / float），**全部无引用环**，
    纯引用计数就够。而开着 GC 时每条净分配都会推进计数器，每 ~700 次就触发一轮 gen-0
    收集，收集成本与**进程里活对象总数**成正比：进程里已经躺着 40 万信息集的表时
    （模型注册表同时持有全量与仅策略模型、pytest 里先加载过 124 MB 旧模型…），
    实测同一份仅策略模型的 eager 载入会从 1.9 s 变成 29.4 s（12 倍）。
    关闭后回到正常量级；`finally` 一定恢复原来的 GC 状态。
    """
    check_layout(data)
    gc_was_enabled = gc.isenabled()
    if gc_was_enabled:
        gc.disable()
    try:
        return _unpack_tables_inner(data)
    finally:
        if gc_was_enabled:
            gc.enable()


def _unpack_tables_inner(data: Mapping[str, Any]) -> tuple[dict[Any, dict[str, float]], dict[Any, dict[str, float]]]:
    """`unpack_tables` 的实际解码循环（GC 已在调用方按需关闭）。"""
    action_table = list(data.get("action_table") or [])
    key_blob = bytes(data.get(KEY_BLOB) or b"")
    n_infosets = int(data.get("n_infosets") or 0)
    regret_blob = bytes(data.get(REGRET_BLOB) or b"")
    strategy_blob = bytes(data.get(STRATEGY_BLOB) or b"")
    regret: dict[Any, dict[str, float]] = {}
    strategy: dict[Any, dict[str, float]] = {}
    unpack_key = unpack_infoset_key
    decode_row = _row_tuple
    unpack_u16 = _U16.unpack_from
    key_cache: dict[tuple[int, ...], tuple[str, ...]] = {}
    key_pos = regret_pos = strategy_pos = 0
    for _ in range(n_infosets):
        length = unpack_u16(key_blob, key_pos)[0]
        key_pos += 2
        key = unpack_key(key_blob[key_pos : key_pos + length])
        key_pos += length
        if regret_blob:
            regret_row, regret_pos = decode_row(regret_blob, regret_pos, action_table, key_cache)
            if regret_row:
                regret[key] = regret_row
        if strategy_blob:
            strategy_row, strategy_pos = decode_row(strategy_blob, strategy_pos, action_table, key_cache)
            if strategy_row:
                strategy[key] = strategy_row
    return regret, strategy


def decode_key_at(data: Mapping[str, Any], index: int) -> Any:
    """按序号解出一个信息集 key（顺序扫描；供流式工具使用）。"""
    key_blob = bytes(data.get(KEY_BLOB) or b"")
    pos = 0
    for _ in range(index):
        (length,) = _U16.unpack_from(key_blob, pos)
        pos += 2 + length
    (length,) = _U16.unpack_from(key_blob, pos)
    pos += 2
    return unpack_infoset_key(key_blob[pos : pos + length])


def iter_container(
    data: Mapping[str, Any], limit: Optional[int] = None
) -> Iterator[tuple[Any, dict[str, float], dict[str, float]]]:
    """流式遍历 `(key, 后悔行, 策略行)`，不一次性展开整表（大模型友好）。"""
    check_layout(data)
    action_table = list(data.get("action_table") or [])
    key_blob = bytes(data.get(KEY_BLOB) or b"")
    tables, n_infosets = container_tables(data)
    pos_by_name = {name: 0 for name, _, _ in tables}
    key_cache: dict[tuple[int, ...], tuple[str, ...]] = {}
    key_pos = 0
    produced = 0
    for _ in range(n_infosets):
        if limit is not None and produced >= limit:
            return
        (length,) = _U16.unpack_from(key_blob, key_pos)
        key_pos += 2
        key = unpack_infoset_key(key_blob[key_pos : key_pos + length])
        key_pos += length
        rows: dict[str, dict[str, float]] = {}
        for name, blob, _anchor in tables:
            pos = pos_by_name[name]
            row, pos = _row_tuple(blob, pos, action_table, key_cache)
            pos_by_name[name] = pos
            rows[name] = row
        produced += 1
        yield key, rows.get(REGRET_BLOB, {}), rows.get(STRATEGY_BLOB, {})


# --------------------------------------------------------------------------- 懒加载


class PackedModel:
    """v2 容器的**懒加载**视图：只保留几块 bytes + 稀疏锚点，**不展开任何 Python dict**。

    用途：Render 免费档只有 512 MB 内存，部署产物（`strategy_only=True`）必须能在
    不展开整表的前提下推理。查找流程：

    1. `pack_infoset_key(query)`；
    2. 在锚点上二分（每次比较读一个锚点指向的 key）；
    3. 块内顺序跳过 ≤ `stride` 个 key 命中；
    4. 用行锚点 + `n` 推进行偏移，只解出命中信息集的那一行。
    """

    def __init__(self, data: Mapping[str, Any]) -> None:
        check_layout(data)
        self.data = data
        self.strategy_only = bool(data.get("strategy_only", False))
        self.config: dict[str, Any] = dict(data.get("config") or {})
        self.seed = int(data.get("seed", 0) or 0)
        self.exploration = float(data.get("exploration", 0.6) or 0.6)
        self.iterations_done = int(data.get("iterations_done", 0) or 0)
        self.traversals_done = int(data.get("traversals_done", 0) or 0)
        self.n_infosets = int(data.get("n_infosets", 0) or 0)
        self.n_entries = int(data.get("n_entries", 0) or 0)
        #: 策略表的条目数（= 训练器 `policy_size` 的口径；全量时 `n_entries` 是两张表之和）
        self.n_strategy_entries = int(data.get("n_strategy_entries", self.n_entries) or 0)
        self.action_table: list[str] = list(data.get("action_table") or [])
        self.stride = max(1, int(data.get("anchor_stride", DEFAULT_ANCHOR_STRIDE) or DEFAULT_ANCHOR_STRIDE))
        self.key_blob = bytes(data.get(KEY_BLOB) or b"")
        self.key_anchor = bytes(data.get(ANCHOR_KEY[KEY_BLOB]) or b"")
        self.rows_blob = {
            REGRET_BLOB: bytes(data.get(REGRET_BLOB) or b""),
            STRATEGY_BLOB: bytes(data.get(STRATEGY_BLOB) or b""),
        }
        self.rows_anchor = {
            REGRET_BLOB: bytes(data.get(ANCHOR_KEY[REGRET_BLOB]) or b""),
            STRATEGY_BLOB: bytes(data.get(ANCHOR_KEY[STRATEGY_BLOB]) or b""),
        }
        self._cache: dict[int, Any] = {}
        self._key_cache: dict[int, Any] = {}
        self.lookups = 0
        self.cache_hits = 0

    # ------------------------------------------------------------- 基础读取

    def __len__(self) -> int:
        return self.n_infosets

    def _anchor_offset(self, anchor: bytes, block: int) -> int:
        return _U32.unpack_from(anchor, block * 4)[0]

    def key_bytes_at(self, index: int) -> bytes:
        """读第 `index` 个信息集的打包 key（块内顺序跳过，最多 `stride` 次）。"""
        if not self.key_anchor:
            # 没有锚点（手工构造的退化容器）：只能从头顺序扫描
            pos = 0
            for current in range(index + 1):
                if pos + 2 > len(self.key_blob):
                    raise IndexError(index)
                (length,) = struct.unpack_from("<H", self.key_blob, pos)
                pos += 2
                if current == index:
                    return self.key_blob[pos : pos + length]
                pos += length
            raise IndexError(index)  # pragma: no cover - 防御
        block = index // self.stride
        pos = self._anchor_offset(self.key_anchor, block)
        for current in range(block * self.stride, index + 1):
            (length,) = struct.unpack_from("<H", self.key_blob, pos)
            pos += 2
            if current == index:
                return self.key_blob[pos : pos + length]
            pos += length
        raise IndexError(index)  # pragma: no cover - 防御

    def key_at(self, index: int) -> Any:
        """解出第 `index` 个信息集 key（带小缓存）。"""
        cached = self._key_cache.get(index)
        if cached is None:
            cached = unpack_infoset_key(self.key_bytes_at(index))
            self._key_cache[index] = cached
        return cached

    def row_offset(self, name: str, index: int) -> int:
        """第 `index` 行在行 blob 里的字节偏移（块内按 `1+6n` 推进行长度）。"""
        blob = self.rows_blob.get(name) or b""
        if not blob:
            return -1
        anchor = self.rows_anchor.get(name) or b""
        if not anchor:
            pos = 0
            for _ in range(index):
                pos += row_size(blob[pos])
            return pos
        block = index // self.stride
        pos = self._anchor_offset(anchor, block)
        for _ in range(block * self.stride, index):
            pos += row_size(blob[pos])
        return pos

    def row_at(self, name: str, index: int) -> dict[str, float]:
        """按序号解出一行（只解命中那行，不碰其它行）。"""
        blob = self.rows_blob.get(name) or b""
        if not blob:
            return {}
        pos = self.row_offset(name, index)
        row, _ = unpack_row(blob, pos, self.action_table)
        return row

    # ------------------------------------------------------------- 查找

    def find_index(self, packed_key: bytes) -> Optional[int]:
        """在打包 key 序列里二分查找（序列按打包字节升序）。"""
        if self.n_infosets <= 0:
            return None
        blocks = (self.n_infosets - 1) // self.stride
        lo, hi = 0, blocks
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self.key_bytes_at(mid * self.stride) <= packed_key:
                lo = mid
            else:
                hi = mid - 1
        index = lo * self.stride
        end = min(self.n_infosets, index + self.stride + 1)
        while index < end:
            current = self.key_bytes_at(index)
            if current == packed_key:
                return index
            if current > packed_key:
                return None
            index += 1
        return None

    def lookup(self, key: Any) -> Optional[tuple[dict[str, float], dict[str, float]]]:
        """查一个信息集，返回 `(后悔行, 策略行)`；不存在返回 `None`。

        只解码命中的那两行（命中率极低时几乎无成本）；带 LRU 式小缓存
        （同一局面/同一信息集连续查询很常见）。
        """
        self.lookups += 1
        packed_key = pack_infoset_key(key)
        index = self.find_index(packed_key)
        if index is None:
            return None
        hit = self._cache.get(index)
        if hit is not None:
            self.cache_hits += 1
            return hit
        regrets = self.row_at(REGRET_BLOB, index)
        strategies = self.row_at(STRATEGY_BLOB, index)
        result = (regrets, strategies)
        if len(self._cache) < 4096:
            self._cache[index] = result
        return result

    def clear_cache(self) -> None:
        self._cache.clear()
        self._key_cache.clear()


# --------------------------------------------------------------------------- 元信息


def container_summary(path: str, data: Mapping[str, Any]) -> dict[str, Any]:
    """汇总容器体积构成（打包脚本 / `main.py models` 用）。"""
    size = Path(path).stat().st_size if Path(path).exists() else 0
    n_infosets = int(data.get("n_infosets") or 0)
    n_entries = int(data.get("n_entries") or 0)
    blob_sizes = {
        "key_blob": len(data.get(KEY_BLOB) or b""),
        "regret_blob": len(data.get(REGRET_BLOB) or b""),
        "strategy_blob": len(data.get(STRATEGY_BLOB) or b""),
        "anchor_blob": sum(
            len(data.get(ANCHOR_KEY[name]) or b"") for name in (KEY_BLOB, REGRET_BLOB, STRATEGY_BLOB)
        ),
    }
    return {
        "path": str(path),
        "size_bytes": size,
        "size_mb": size / 1024 / 1024,
        "format_version": int(data.get("format_version", LEGACY_FORMAT_VERSION) or LEGACY_FORMAT_VERSION),
        "encoding": str(data.get("encoding") or "legacy-dict"),
        "strategy_only": bool(data.get("strategy_only", False)),
        "n_infosets": n_infosets,
        "n_entries": n_entries,
        "n_strategy_entries": int(data.get("n_strategy_entries") or 0),
        "blob_sizes": blob_sizes,
        "bytes_per_infoset": (size / n_infosets) if n_infosets else 0.0,
    }


def inspect_model(path: str, *, max_unpickle_bytes: int = 96 * 1024 * 1024) -> dict[str, Any]:
    """只看模型元信息（`main.py models` 用），失败不抛异常而是把原因放进结果里。

    - v2 文件很小（~20 MB），直接 `pickle.load` 后读头部字段；
    - 旧 v1 文件可能上百 MB（实测参考模型 124 MB），超过 `max_unpickle_bytes`
      时不展开，只按文件名/体积报告，避免一条 CLI 命令吃满内存。
    """
    target = Path(path)
    info: dict[str, Any] = {
        "path": str(target),
        "name": target.name,
        "size_bytes": target.stat().st_size if target.exists() else 0,
        "format_version": None,
        "encoding": None,
        "strategy_only": None,
        "players": None,
        "iterations_done": None,
        "n_infosets": None,
        "readable": False,
        "note": "",
    }
    info["size_mb"] = info["size_bytes"] / 1024 / 1024
    if not target.exists():
        info["note"] = "文件不存在"
        return info
    if info["size_bytes"] > max_unpickle_bytes:
        info["note"] = f"体积 {info['size_mb']:.1f} MB 超过 {max_unpickle_bytes // 1024 // 1024} MB，未展开元信息"
        info["readable"] = is_v2_container(_peek_header(target))
        return info

    # v2 容器：元信息（config / n_infosets …）都写在 blob 之前，只读头部即可，
    # 不为了「列个清单」把几十 MB 的 blob 拉进内存。
    header = peek_model_header(path)
    if header.get("encoding") and header["encoding"] != "legacy-dict":
        header_config = dict(header.get("config") or {})
        info["format_version"] = int(header.get("format_version") or FORMAT_VERSION)
        info["encoding"] = str(header["encoding"])
        info["strategy_only"] = bool(header.get("strategy_only", False))
        info["players"] = header_config.get("num_players") or header_config.get("players")
        info["iterations_done"] = int(header.get("iterations_done") or 0)
        info["n_infosets"] = int(header.get("n_infosets") or 0)
        info["n_entries"] = int(header.get("n_entries") or 0)
        info["n_strategy_entries"] = int(header.get("n_strategy_entries") or 0)
        info["n_regret_infosets"] = 0 if info["strategy_only"] else int(info["n_infosets"])
        info["readable"] = True
        return info

    try:
        with target.open("rb") as handle:
            data = pickle.load(handle)
    except Exception as exc:  # noqa: BLE001 - CLI 要给中文提示而不是 traceback
        info["note"] = f"无法读取：{exc}"
        return info
    if not isinstance(data, dict):
        info["note"] = "顶层不是 dict，格式无法识别"
        return info
    config = dict(data.get("config") or {})
    info["format_version"] = int(data.get("format_version", LEGACY_FORMAT_VERSION) or LEGACY_FORMAT_VERSION)
    info["encoding"] = str(data.get("encoding") or "legacy-dict")
    info["strategy_only"] = bool(data.get("strategy_only", False))
    info["players"] = config.get("num_players") or config.get("players")
    info["iterations_done"] = int(data.get("iterations_done", 0) or 0)
    if is_v2_container(data):
        info["n_infosets"] = int(data.get("n_infosets") or 0)
        info["n_entries"] = int(data.get("n_entries") or 0)
        info["n_strategy_entries"] = int(data.get("n_strategy_entries") or 0)
        info["n_regret_infosets"] = 0 if info["strategy_only"] else int(info["n_infosets"])
    else:
        # v1（plain dict）：口径与 `MCCFRTrainer.infoset_count` 一致 ——
        # 「信息集数」= 推理覆盖（平均策略表规模）；regret 表规模单独给。
        strategy_rows = data.get("strategy_sum") or {}
        regret_rows = data.get("regret_sum") or {}
        info["n_infosets"] = len(strategy_rows) or len(regret_rows)
        info["n_regret_infosets"] = len(regret_rows)
        info["n_strategy_entries"] = sum(len(row) for row in strategy_rows.values())
    info["readable"] = True
    return info


def _peek_header(path: Path) -> dict[str, Any]:
    """只读文件开头的一小段，用于在超大旧模型上粗略判断是否 v2。"""
    try:
        with path.open("rb") as handle:
            head = handle.read(4096)
    except OSError:
        return {}
    if b"packed-v2" in head:
        return {"encoding": ENCODING}
    return {}


# --------------------------------------------------------------------------- 头部速读


class _SkippedBlob:
    """占位对象：只记 blob 长度，不 materialize（读元信息时省掉几十 MB 内存/时间）。"""

    __slots__ = ("length",)

    def __init__(self, length: int) -> None:
        self.length = length

    def __len__(self) -> int:
        return self.length

    def __repr__(self) -> str:  # pragma: no cover - 调试用
        return f"<skipped blob {self.length} B>"


def _make_skipping_unpickler() -> Any:
    """返回一个「碰到大 bytes 就跳过」的纯 Python Unpickler（不可用时返回 None）。

    v2 容器把元信息（`config` / `seed` / `n_infosets` …）写在 blob 之前，所以
    读完头部就可以停手；C 版 `pickle.Unpickler` 不支持这种钩子，故用 `pickle._Unpickler`。
    """
    base = getattr(pickle, "_Unpickler", None)
    if base is None:  # pragma: no cover - 非 CPython 实现
        return None

    class _SkippingUnpickler(base):  # type: ignore[misc, valid-type]
        #: 小于该长度的 bytes 直接读进来（`action_table` 之类的小对象要真值）
        MAX_INLINE = 1 << 16
        #: 跳过时每次读取的块大小
        CHUNK = 1 << 20

        def _take(self, length: int) -> Optional[bytes]:
            if length <= self.MAX_INLINE:
                return self.read(length)
            remaining = length
            while remaining > 0:
                chunk = min(remaining, self.CHUNK)
                self.read(chunk)
                remaining -= chunk
            return None

        def _skip_or_keep(self, length: int) -> None:
            data = self._take(length)
            self.append(data if data is not None else _SkippedBlob(length))

        def load_binbytes(self) -> None:  # type: ignore[override]
            (length,) = _U32.unpack(self.read(4))
            self._skip_or_keep(length)

        def load_binbytes8(self) -> None:  # type: ignore[override]
            (length,) = struct.unpack("<Q", self.read(8))
            self._skip_or_keep(length)

        def load_short_binbytes(self) -> None:  # type: ignore[override]
            self._skip_or_keep(self.read(1)[0])

    return _SkippingUnpickler


def peek_model_header(path: str, *, max_bytes: int = 64 * 1024 * 1024) -> dict[str, Any]:
    """只读模型**头部元信息**（不展开表），拿玩家数 / 迭代数 / 格式 / blob 长度。

    - v2 容器：几毫秒（大 blob 被跳过，`config` 等在 blob 之前）；
    - v1 / 旧 plain dict：体积超过 `max_bytes` 时直接放弃（返回 `{}`），
      免得为了一行「模型是几人」把 100 MB+ 的 dict-of-dict 拉进内存。
    """
    target = Path(path)
    header: dict[str, Any] = {"path": str(target)}
    try:
        size = target.stat().st_size
    except OSError:
        return header
    header["size_bytes"] = size
    looks_v2 = bool(_peek_header(target).get("encoding"))
    if size > max_bytes and not looks_v2:
        header["note"] = f"体积 {size / 1024 / 1024:.1f} MB 且不是 v2，跳过头部读取"
        return header
    factory = _make_skipping_unpickler()
    try:
        with target.open("rb") as handle:
            data = factory(handle).load() if factory is not None else pickle.load(handle)
    except Exception as exc:  # noqa: BLE001 - 速读失败就退回「不知道」
        header["note"] = f"头部读取失败：{exc}"
        return header
    if not isinstance(data, dict):
        header["note"] = "顶层不是 dict"
        return header
    header["encoding"] = str(data.get("encoding") or "legacy-dict")
    header["format_version"] = int(data.get("format_version", LEGACY_FORMAT_VERSION) or LEGACY_FORMAT_VERSION)
    header["config"] = dict(data.get("config") or {})
    header["seed"] = data.get("seed")
    header["iterations_done"] = int(data.get("iterations_done", 0) or 0)
    header["strategy_only"] = bool(data.get("strategy_only", False))
    header["n_infosets"] = int(data.get("n_infosets") or 0)
    header["n_entries"] = int(data.get("n_entries") or 0)
    header["n_strategy_entries"] = int(data.get("n_strategy_entries") or 0)
    header["packed_key_bytes"] = int(data.get("packed_key_bytes") or 0)
    action_table = data.get("action_table")
    header["n_actions"] = len(action_table) if isinstance(action_table, list) else 0
    blob = data.get(KEY_BLOB)
    header["key_blob_bytes"] = len(blob) if blob is not None else 0
    return header


__all__ = [
    "FORMAT_VERSION",
    "LEGACY_FORMAT_VERSION",
    "ENCODING",
    "INFOSET_FORMAT",
    "KEY_LAYOUT",
    "DEFAULT_ANCHOR_STRIDE",
    "KEY_BYTES_TARGET",
    "ACTION_ID",
    "ACTION_KEY",
    "PackedModel",
    "register_action_table",
    "build_action_table",
    "action_ids",
    "pack_infoset_key",
    "unpack_infoset_key",
    "pack_row",
    "unpack_row",
    "row_size",
    "count_entries",
    "as_strategy_only",
    "build_container",
    "is_v2_container",
    "check_layout",
    "container_tables",
    "container_summary",
    "decode_key_at",
    "iter_container",
    "unpack_tables",
    "inspect_model",
    "peek_model_header",
]


if __name__ == "__main__":  # pragma: no cover - 手动自检：python -m training.codec
    import random as _random

    from game import GameConfig as _GameConfig
    from game import GameState as _GameState

    _rng = _random.Random(2026)
    _sizes: list[int] = []
    for _players in (2, 3, 4):
        _config = _GameConfig(num_players=_players, seed=42)
        for _ in range(6):
            _state = _GameState(_config, _rng.randrange(1 << 30))
            while not _state.is_terminal():
                _player = _state.decision_player()
                _key = _state.infoset_key(_player)
                _blob = pack_infoset_key(_key)
                assert unpack_infoset_key(_blob) == _key, f"往返失败：{_key}"
                _sizes.append(len(_blob))
                _actions = _state.legal_actions()
                _state.step(_actions[_rng.randrange(len(_actions))])
    print(
        f"[codec 自检] {len(_sizes):,} 个真实信息集：平均 {sum(_sizes) / len(_sizes):.2f} B/key、"
        f"最大 {max(_sizes)} B（目标 ≤ {KEY_BYTES_TARGET} B）"
    )

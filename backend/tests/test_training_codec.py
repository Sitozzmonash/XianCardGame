"""`training/codec.py`（模型格式 v2 紧凑二进制，§3.5）单元测试。

覆盖：key 打包/解包**双射**（含越界与退化 key）、打包体积目标、动作表去重、
行打包、空表容器、确定性排序、稀疏锚点的块边界、懒加载查表（命中/未命中）。
"""

from __future__ import annotations

import random

import pytest

from game import GameConfig, GameState
from training import codec


# --------------------------------------------------------------------------- 工具


def collect_keys(players: int = 2, games: int = 4, seed: int = 2026) -> list[tuple]:
    """随机对局里出现过的真实信息集 key。"""
    rng = random.Random(seed)
    keys: list[tuple] = []
    for game in range(games):
        config = GameConfig(num_players=players, seed=42)
        state = GameState(config, rng.randrange(1 << 30) + game)
        while not state.is_terminal():
            player = state.decision_player()
            keys.append(state.infoset_key(player))
            actions = state.legal_actions()
            state.step(actions[rng.randrange(len(actions))])
    return keys


def sample_key(player: int = 0, **overrides) -> tuple:
    """手工紧凑 key（默认值接近开局），方便逐字段构造边界用例。"""
    base = {
        "player": player,
        "phase": 0,
        "current_player": 1,
        "decision_player": 1,
        "actions_used": 0,
        "deck_size": 12,
        "hand_counts": (1, 0, 1, 0, 0, 0, 1, 0),
        "known": (),
        "reorder": (),
        "hand_sizes": (5, 6),
        "alive_mask": 0b11,
        "discard_sig": (0, 0, 0, 0, 0, 0, 0, 0),
        "pending": (-1, -1),
    }
    base.update(overrides)
    return (
        base["player"],
        base["phase"],
        base["current_player"],
        base["decision_player"],
        base["actions_used"],
        base["deck_size"],
        base["hand_counts"],
        base["known"],
        base["reorder"],
        base["hand_sizes"],
        base["alive_mask"],
        base["discard_sig"],
        base["pending"],
    )


# --------------------------------------------------------------------------- key 往返


@pytest.mark.parametrize("players", [2, 3, 4])
def test_pack_unpack_roundtrip_real_keys(players: int) -> None:
    """真实对局里的信息集 key 必须**逐个**无损往返（打包是双射）。"""
    keys = collect_keys(players=players)
    assert len(keys) > 50, f"样本太少：{len(keys)}"
    for key in keys:
        blob = codec.pack_infoset_key(key)
        assert codec.unpack_infoset_key(blob) == key, f"往返失败：{key}"


def test_pack_unpack_roundtrip_edge_cases() -> None:
    """边界：空序列、非空 known / reorder、pending 有值、计数 > 15、大 deck。"""
    cases = [
        sample_key(),
        sample_key(known=(0,), reorder=(3, 1)),
        sample_key(phase=1, pending=(1, 0)),
        sample_key(phase=1, pending=(-1, 2)),
        sample_key(hand_counts=(3, 3, 3, 3, 3, 3, 3, 3), discard_sig=(16, 0, 0, 20, 0, 0, 0, 17)),
        sample_key(known=(0, 1, 2, 3, 4, 5, 6, 7) * 3, hand_sizes=(9, 9, 9)),
        sample_key(player=5, phase=4, current_player=5, decision_player=5, actions_used=2),
        sample_key(alive_mask=0b101101, hand_sizes=(4, 5, 6)),
        sample_key(hand_counts=(0,) * 8, discard_sig=(0,) * 8),
    ]
    for key in cases:
        blob = codec.pack_infoset_key(key)
        assert codec.unpack_infoset_key(blob) == key, f"往返失败：{key}"


def test_pack_unpack_str_and_foreign_keys() -> None:
    """旧模型里的字符串 key / 其它对象也要能无损往返（pickle 兜底）。"""
    keys = [
        "(0, '行动', 1, 1, 0, 12, (), (), (), (5, 6), (1, 1), (0,) * 8, (None, None))",
        "不是 tuple 的字符串",
        "",
        42,
        None,
        ("带着", 1, 2),
    ]
    for key in keys:
        blob = codec.pack_infoset_key(key)
        restored = codec.unpack_infoset_key(blob)
        assert restored == key and type(restored) is type(key), f"往返失败：{key!r}"


def test_pack_is_injective_on_large_sample() -> None:
    """不同 key 不能打包成同一串字节（否则二分查找会串台）。"""
    keys = collect_keys(players=2, games=6) + collect_keys(players=3, games=3)
    packed = {}
    for key in keys:
        blob = codec.pack_infoset_key(key)
        assert packed.setdefault(blob, key) == key, "出现哈希碰撞（打包不是双射）"


def test_out_of_range_key_falls_back_but_roundtrips() -> None:
    """超范围（≥2^62）或非 int 字段不参与紧凑编码，但必须无损往返。"""
    big = sample_key(deck_size=(1 << 62) + 1)
    blob = codec.pack_infoset_key(big)
    assert blob[0] >> 6 == 2, "应回落到 pickle 兜底"
    assert codec.unpack_infoset_key(blob) == big

    weird = sample_key(hand_counts=(1, 2, 3, 4, 5, 6, 7, "x"))  # type: ignore[arg-type]
    assert codec.unpack_infoset_key(codec.pack_infoset_key(weird)) == weird


def test_unpack_rejects_corrupted_blob() -> None:
    """多出来的字节必须报错，而不是悄悄丢数据。"""
    blob = codec.pack_infoset_key(sample_key())
    with pytest.raises(ValueError):
        codec.unpack_infoset_key(blob + b"\x00")
    with pytest.raises(ValueError):
        codec.unpack_infoset_key(b"\x00")  # 截断的紧凑 key


def test_packed_key_size_meets_target() -> None:
    """§3.5 目标：打包后 ≤ 32 B/key（旧 tuple 是 63 B/key）。"""
    keys = collect_keys(players=2, games=12) + collect_keys(players=3, games=4)
    sizes = [len(codec.pack_infoset_key(key)) for key in keys]
    average = sum(sizes) / len(sizes)
    assert average <= codec.KEY_BYTES_TARGET, f"平均 {average:.2f} B/key 超过目标"
    assert max(sizes) <= 48, f"最大值 {max(sizes)} B 过大（key 里可能混进了 pickle 兜底）"


# --------------------------------------------------------------------------- 动作表


def test_build_action_table_dedups_and_sorts() -> None:
    table = codec.build_action_table(["b|1|0", "a|0|0", "b|1|0", "a|0|0", ""])
    assert table == ["", "a|0|0", "b|1|0"]
    ids = codec.action_ids(table)
    assert ids["b|1|0"] == 2 and ids[""] == 0
    assert len(set(ids.values())) == len(table)


def test_register_action_table_sets_globals() -> None:
    codec.register_action_table(["x", "y"])
    assert codec.ACTION_KEY == ["x", "y"]
    assert codec.ACTION_ID == {"x": 0, "y": 1}
    codec.register_action_table([])  # 清空也要能工作


# --------------------------------------------------------------------------- 行打包


def test_pack_row_roundtrip() -> None:
    table = ["a", "b", "c"]
    blob = codec.pack_row([1.5, -2.25, 0.0], [0, 1, 2])
    assert len(blob) == codec.row_size(3)
    row, pos = codec.unpack_row(blob, 0, table)
    assert pos == len(blob)
    assert row == {"a": 1.5, "b": -2.25, "c": 0.0}
    assert codec.count_entries(blob) == 3


def test_pack_row_empty() -> None:
    blob = codec.pack_row([], [])
    assert blob == b"\x00"
    row, pos = codec.unpack_row(blob, 0, [])
    assert row == {} and pos == 1
    assert codec.count_entries(blob) == 0


def test_pack_row_too_many_actions() -> None:
    with pytest.raises(ValueError):
        codec.pack_row([0.0] * 300, list(range(300)))


# --------------------------------------------------------------------------- 容器


def _mini_container(rows: int = 40) -> dict:
    """构造一个小容器（行数据用中文动作 key，模拟真实表）。"""
    regret = {}
    strategy = {}
    rng = random.Random(7)
    for index in range(rows):
        key = sample_key(
            player=index % 2,
            deck_size=index,
            known=(index % 8,) if index % 3 == 0 else (),
            hand_counts=(index % 3, 0, 0, 0, 0, 0, 0, 0),
            discard_sig=(index % 4, 0, 0, 0, 0, 0, 0, 0),
        )
        regret[key] = {"出牌|1|0": rng.random(), "过|-1|0": rng.random()}
        strategy[key] = {"出牌|1|0": rng.random(), "过|-1|0": rng.random()}
    return codec.build_container(
        regret,
        strategy,
        config={"num_players": 2},
        seed=3,
        exploration=0.6,
        iterations_done=10,
        traversals_done=20,
    )


def test_build_container_is_flat() -> None:
    """容器只允许 bytes / int / float / str / list / dict（且不含 dict-of-dict 表）。"""
    container = _mini_container()
    assert container["encoding"] == codec.ENCODING
    assert container["format_version"] == codec.FORMAT_VERSION
    assert container["strategy_only"] is False
    assert codec.is_v2_container(container)
    for key, value in container.items():
        assert isinstance(
            value, (bytes, int, float, str, list, dict, bool, type(None))
        ), f"{key} 类型非法"
    assert isinstance(container["action_table"], list)
    assert len(container["action_table"]) == 2  # 去重：只有两种动作 key
    assert container["n_infosets"] == 40
    assert container["n_strategy_entries"] == 80  # 40 行 × 2 个动作
    assert container["n_entries"] == 160  # 后悔表 + 策略表
    # 兼容别名：旧工具按键名取值时不至于 KeyError（值就是同一份 packed bytes）
    assert container["regret_sum"] is container["regret_blob"]
    assert container["strategy_sum"] is container["strategy_blob"]


def test_container_roundtrip_tables() -> None:
    container = _mini_container()
    regret, strategy = codec.unpack_tables(container)
    assert len(regret) == len(strategy) == 40
    assert set(regret) == set(strategy)
    for key, row in regret.items():
        assert set(row) == {"出牌|1|0", "过|-1|0"}
    # 流式遍历与一次性展开一致
    streamed = {key: (r, s) for key, r, s in codec.iter_container(container)}
    assert set(streamed) == set(regret)
    for key, (r, s) in streamed.items():
        assert r == regret[key] and s == strategy[key]
    # 按序号解码
    ordered = sorted(regret, key=codec.pack_infoset_key)
    for index, key in enumerate(ordered):
        assert codec.decode_key_at(container, index) == key


def test_container_empty_tables() -> None:
    container = codec.build_container(
        {},
        {},
        config={"num_players": 2},
        seed=0,
        exploration=0.6,
        iterations_done=0,
        traversals_done=0,
    )
    assert container["n_infosets"] == 0
    assert container["key_blob"] == b"" and container["strategy_blob"] == b""
    assert codec.unpack_tables(container) == ({}, {})
    assert list(codec.iter_container(container)) == []
    model = codec.PackedModel(container)
    assert len(model) == 0
    assert model.lookup(sample_key()) is None


def test_strategy_only_container_drops_regret() -> None:
    container = _mini_container()
    only = codec.as_strategy_only(container)
    assert only["strategy_only"] is True
    assert only["regret_blob"] == b""
    assert only["regret_sum"] == b""
    assert only["n_strategy_entries"] == 80  # 只剩策略表（40 行 × 2 动作）
    assert only["n_entries"] == 80
    regret, strategy = codec.unpack_tables(only)
    assert regret == {} and len(strategy) == 40


# --------------------------------------------------------------------------- 懒加载


def test_packed_model_lookup_hits_and_misses() -> None:
    container = _mini_container(rows=64)
    eager_regret, eager_strategy = codec.unpack_tables(container)
    model = codec.PackedModel(container)
    assert len(model) == 64

    for key in eager_strategy:
        found = model.lookup(key)
        assert found is not None, f"漏查：{key}"
        assert found[1] == eager_strategy[key]
        assert found[0] == eager_regret[key]

    miss = sample_key(deck_size=12345, known=(7, 7))
    assert model.lookup(miss) is None


def test_packed_model_anchor_block_boundaries() -> None:
    """稀疏锚点的块边界：每个 key 都要能找到（含跨块的最后几个）。"""
    container = codec.build_container(
        {sample_key(deck_size=i): {"a|0|0": 1.0} for i in range(70)},
        {sample_key(deck_size=i): {"a|0|0": 2.0} for i in range(70)},
        config={"num_players": 2},
        seed=0,
        exploration=0.6,
        iterations_done=1,
        traversals_done=1,
        anchor_stride=4,  # 故意用很小的步长，逼出块边界 bug
    )
    model = codec.PackedModel(container)
    assert model.stride == 4
    for i in range(70):
        found = model.lookup(sample_key(deck_size=i))
        assert found is not None, f"块边界漏查：{i}"
        assert found[1] == {"a|0|0": 2.0}


def test_packed_model_without_anchors_still_works() -> None:
    """没有锚点的退化容器（手工构造）也要能顺序查表。"""
    container = _mini_container(rows=6)
    container["key_anchor"] = b""
    container["strategy_anchor"] = b""
    container["regret_anchor"] = b""
    model = codec.PackedModel(container)
    regret, strategy = codec.unpack_tables(container)
    for key in strategy:
        assert model.lookup(key) is not None
    assert model.key_at(0) == sorted(strategy, key=codec.pack_infoset_key)[0]


def test_container_summary_and_inspect(tmp_path) -> None:
    import pickle

    container = _mini_container()
    path = tmp_path / "mini.pkl"
    with path.open("wb") as handle:
        pickle.dump(container, handle, protocol=pickle.HIGHEST_PROTOCOL)

    summary = codec.container_summary(str(path), container)
    assert summary["n_infosets"] == 40
    assert summary["blob_sizes"]["key_blob"] > 0
    assert summary["bytes_per_infoset"] > 0

    info = codec.inspect_model(str(path))
    assert info["readable"] is True
    assert info["format_version"] == 2
    assert info["encoding"] == codec.ENCODING
    assert info["n_infosets"] == 40
    assert info["players"] == 2

    missing = codec.inspect_model(str(tmp_path / "nope.pkl"))
    assert missing["readable"] is False and "不存在" in missing["note"]

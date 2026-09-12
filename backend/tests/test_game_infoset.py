"""紧凑 Information Set 测试（INTERFACES §1.5，硬指标）。

覆盖：
- 只能由 int / tuple[int] 组成（递归检查，无 str / Card / float / bool）；
- 同一状态两次调用相等、可哈希、可放进 set / dict、可 pickle；
- 对 `player` 不可区分的状态必须映射到同一个 key（隐藏信息置换不改变 key）；
- 可区分的状态不应大量碰撞（采样 N 局，"不同可观察状态 -> 同 key" 比例 < 1%）；
- 体积实测：3000 个不同 key 的 MCCFR 风格 dict，pickle 后 < 200 字节/key，
  并与旧 `repr(...)` 格式现场对比。
"""

from __future__ import annotations

import pickle
import random
import sys
from collections import defaultdict
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _game_test_utils import legacy_repr_key  # noqa: E402

from game.actions import Action, ActionKind  # noqa: E402
from game.config import GameConfig  # noqa: E402
from game.cards import Card  # noqa: E402
from game.state import GameState, Phase  # noqa: E402

#: §1.5 规定的 13 段编码
EXPECTED_LEN = 13


def _fresh(num_players: int = 3, seed: int = 42, **kwargs) -> GameState:
    return GameState(GameConfig(num_players=num_players, seed=seed, **kwargs), seed=seed)


def _walk(value):
    yield value
    if isinstance(value, tuple):
        for item in value:
            yield from _walk(item)


def _collect_samples(target: int = 3200, num_players: int = 3, max_games: int = 400):
    """采样大量 (new_key, legacy_key) 对，按 new_key 去重。"""
    pairs: dict[tuple, str] = {}
    seed = 0
    while len(pairs) < target and seed < max_games:
        state = GameState(
            GameConfig(num_players=num_players, seed=seed), seed=seed
        )
        rng = random.Random(seed * 31 + 7)
        while not state.is_terminal():
            for p in range(state.num_players):
                if state.alive[p]:
                    key = state.infoset_key(p)
                    if key not in pairs:
                        pairs[key] = legacy_repr_key(state, p)
            if len(pairs) >= target:
                break
            state.step(rng.choice(state.legal_actions()))
        seed += 1
    return pairs


# ------------------------------------------------------------------ 类型 / 结构


def test_infoset_contains_only_ints_and_tuples():
    state = _fresh(seed=77)
    rng = random.Random(3)
    for _ in range(120):
        if state.is_terminal():
            break
        for p in range(state.num_players):
            key = state.infoset_key(p)
            assert isinstance(key, tuple)
            for item in _walk(key):
                assert isinstance(item, (int, tuple)), f"非法类型：{type(item)} {item!r}"
                assert not isinstance(item, bool), "不允许 bool（应显式用 int）"
                assert not isinstance(item, (str, Card, float)), f"不允许 {type(item)}"
        state.step(rng.choice(state.legal_actions()))


def test_infoset_shape_matches_contract():
    state = _fresh(num_players=4, seed=5)
    key = state.infoset_key(0)
    assert len(key) == EXPECTED_LEN
    (
        player,
        phase_index,
        current_player,
        decision_player,
        actions_used,
        deck_size,
        hand_sig,
        known_top,
        reorder_private,
        hand_sizes,
        alive_mask,
        discard_sig,
        pending,
    ) = key
    assert player == 0
    assert 0 <= phase_index <= 4
    assert 0 <= current_player < 4 and 0 <= decision_player < 4
    assert actions_used >= 0 and deck_size >= 0
    assert isinstance(hand_sig, tuple) and len(hand_sig) == 8
    assert isinstance(discard_sig, tuple) and len(discard_sig) == 8
    assert isinstance(known_top, tuple)
    assert isinstance(reorder_private, tuple)
    assert isinstance(hand_sizes, tuple) and len(hand_sizes) == 4
    assert isinstance(alive_mask, int) and alive_mask == 0b1111
    assert isinstance(pending, tuple) and pending == (-1, -1)
    # hand_sig 之和 == 自己的手牌数
    assert sum(hand_sig) == len(state.hands[0])
    assert sum(hand_sig) == hand_sizes[0]


def test_infoset_phase_index_and_pending_encoding():
    state = _fresh(seed=8)
    state.hands[state.current_player] = [Card.STEAL, Card.SKIP]
    target = (state.current_player + 1) % 3
    state.hands[target] = [Card.PEEK]
    state.step(Action(ActionKind.PLAY_STEAL, target=target))
    assert state.phase == Phase.COUNTER
    key = state.infoset_key(target)
    assert key[1] == 1  # COUNTER -> 1
    assert key[12] == (state.current_player, target)  # pending 真实值

    key_action = state.clone().infoset_key(state.current_player)
    assert key_action[1] == 1
    assert key_action[12] == (state.current_player, target)

    # 非 COUNTER（且非 REORDER）阶段 pending 恒为 (-1, -1)
    fresh_key = _fresh(seed=8).infoset_key(0)
    assert fresh_key[1] == 0  # ACTION -> 0
    assert fresh_key[12] == (-1, -1)


def test_infoset_reorder_private_only_for_owner():
    state = _fresh(seed=11)
    owner = state.current_player
    state.hands[owner] = [Card.REORDER]
    state.step(Action(ActionKind.PLAY_REORDER))
    assert state.phase == Phase.REORDER
    owner_key = state.infoset_key(owner)
    other_key = state.infoset_key((owner + 1) % 3)
    assert owner_key[1] == 2  # REORDER -> 2
    assert len(owner_key[8]) == len(state.reorder_view) == 3  # 私有视图进 key
    assert other_key[8] == ()  # 其他人看不到


# ------------------------------------------------------------ 一致性 / 可哈希


def test_infoset_is_deterministic_hashable_and_picklable():
    state = _fresh(seed=13)
    rng = random.Random(1)
    for _ in range(50):
        if state.is_terminal():
            break
        p = state.decision_player()
        a = state.infoset_key(p)
        b = state.infoset_key(p)
        assert a == b and hash(a) == hash(b)
        assert a in {a, b}
        assert {a: "x"}[b] == "x"
        assert len({a, b}) == 1
        assert pickle.loads(pickle.dumps(a)) == a
        state.step(rng.choice(state.legal_actions()))


def test_identical_states_far_apart_share_key():
    """同 seed 的两局在相同动作序列下必须落在同一个 key。"""
    a = _fresh(seed=99)
    b = _fresh(seed=99)
    rng = random.Random(5)
    for _ in range(40):
        if a.is_terminal():
            break
        p = a.decision_player()
        assert a.infoset_key(p) == b.infoset_key(p)
        action = rng.choice(a.legal_actions())
        a.step(action)
        b.step(action)


def test_hidden_information_permutation_keeps_key():
    """隐藏信息（他人手牌顺序、未知牌堆顺序、弃牌顺序）置换不影响 key。"""
    state = _fresh(seed=21)
    state.step(Action(ActionKind.END_TURN))
    player = state.current_player
    before = state.infoset_key(player)

    clone = state.clone()
    clone.deck = list(reversed(clone.deck))
    clone.discard = list(reversed(clone.discard))
    for p in range(clone.num_players):
        if p != player:
            clone.hands[p] = list(reversed(clone.hands[p]))
    assert clone.infoset_key(player) == before

    # 自己手牌顺序也不影响（计数向量）
    clone2 = state.clone()
    if len(clone2.hands[player]) > 1:
        clone2.hands[player] = list(reversed(clone2.hands[player]))
    assert clone2.infoset_key(player) == before

    # 但可观察量变化必须改变 key
    clone3 = state.clone()
    clone3.deck.pop()
    assert clone3.infoset_key(player) != before
    clone4 = state.clone()
    clone4.alive[(player + 1) % clone4.num_players] = False
    assert clone4.infoset_key(player) != before
    clone5 = state.clone()
    clone5.actions_used += 1
    assert clone5.infoset_key(player) != before


# ------------------------------------------------------------ 碰撞率（< 1%）


def _observable_descriptor(state: GameState, player: int) -> tuple:
    """测试侧**独立**实现的可观察描述（比 infoset_key 更细、写法不同）。"""
    reorder = ()
    if state.phase == Phase.REORDER and state.reorder_owner == player:
        reorder = tuple(c.value for c in state.reorder_view)
    pending = (
        (state.pending_actor, state.pending_target) if state.phase == Phase.COUNTER else (-1, -1)
    )
    return (
        player,
        state.phase.name,
        state.current_player,
        state.decision_player(),
        state.actions_used,
        len(state.deck),
        tuple(sorted(c.value for c in state.hands[player])),
        tuple(c.value for c in state.known_top[player]),
        reorder,
        tuple(len(h) for h in state.hands),
        tuple(state.alive),
        tuple(sorted(c.value for c in state.discard)),
        pending,
    )


def test_collision_rate_below_one_percent_and_abstraction_is_sound():
    samples: list[tuple[tuple, tuple]] = []
    for seed in range(60):
        state = _fresh(seed=seed * 3 + 1)
        rng = random.Random(seed)
        while not state.is_terminal():
            for p in range(state.num_players):
                if state.alive[p]:
                    samples.append(
                        (state.infoset_key(p), _observable_descriptor(state, p))
                    )
            state.step(rng.choice(state.legal_actions()))
    assert len(samples) > 2000, len(samples)

    by_key: dict[tuple, set] = defaultdict(set)
    by_observable: dict[tuple, set] = defaultdict(set)
    for key, observable in samples:
        by_key[key].add(observable)
        by_observable[observable].add(key)

    # 1) key -> 可观察描述必须唯一（不同可观察状态撞到同一个 key 的比例）
    improper = sum(len(v) for v in by_key.values() if len(v) > 1)
    ratio = improper / len(samples)
    print(
        f"[infoset] 采样 {len(samples)} 个 (state,player)，不同 key {len(by_key)} 个，"
        f"不同可观察状态 {len(by_observable)} 个；不当碰撞比例 = {ratio:.6%}"
    )
    assert ratio < 0.01, f"碰撞率过高：{ratio:.4%}"

    # 2) 可观察描述相同 -> key 必须相同（抽象正确性，100%）
    inconsistent = sum(len(v) for v in by_observable.values() if len(v) > 1)
    assert inconsistent == 0, f"同一可观察状态映射到多个 key：{inconsistent}"

    # 3) 抽象确实在压缩：key 数量 == 可观察状态数量（因为本编码无损）
    assert len(by_key) == len(by_observable)


# ------------------------------------------------------------------ 体积实测


def test_pickle_size_per_key_under_budget_and_better_than_legacy(capsys):
    pairs = _collect_samples(target=3200)
    assert len(pairs) >= 3000, f"只采集到 {len(pairs)} 个不同 key"
    pairs = dict(list(pairs.items())[:3000])

    def table(keys):
        # 模仿 MCCFR 的 regret/strategy 表：key -> {action_key: float}
        return {k: {"a_1": 0.0, "a_2": 0.0, "a_3": 0.0, "a_4": 0.0} for k in keys}

    new_keys = list(pairs.keys())
    old_keys = list(pairs.values())

    new_table_bytes = len(pickle.dumps(table(new_keys), protocol=pickle.HIGHEST_PROTOCOL))
    old_table_bytes = len(pickle.dumps(table(old_keys), protocol=pickle.HIGHEST_PROTOCOL))
    new_key_only = len(
        pickle.dumps(new_keys, protocol=pickle.HIGHEST_PROTOCOL)
    ) / len(new_keys)
    old_key_only = len(
        pickle.dumps(old_keys, protocol=pickle.HIGHEST_PROTOCOL)
    ) / len(old_keys)

    new_per_key = new_table_bytes / len(new_keys)
    old_per_key = old_table_bytes / len(old_keys)

    with capsys.disabled():
        print(
            f"\n[infoset 体积] 3000 个不同 key（含 4 个动作的 MCCFR 表）\n"
            f"  新格式（紧凑 int/tuple）: {new_table_bytes} bytes / 3000 key = {new_per_key:.1f} 字节/key\n"
            f"  旧格式（repr 大字符串）  : {old_table_bytes} bytes / 3000 key = {old_per_key:.1f} 字节/key\n"
            f"  仅 key 本身            : 新 {new_key_only:.1f} 字节/key, 旧 {old_key_only:.1f} 字节/key\n"
            f"  表体积比 old/new = {old_per_key / new_per_key:.2f}x，"
            f"key 体积比 = {old_key_only / new_key_only:.2f}x"
        )

    assert new_per_key < 200, f"新格式 {new_per_key:.1f} 字节/key 超出预算（上限 200）"
    assert new_key_only < old_key_only, "新 key 应比旧 repr 字符串更紧凑"
    assert new_per_key < old_per_key, "新表应比旧表更紧凑"


def test_key_pool_is_reusable_across_policies():
    """相同 seed 下，无论后续用什么策略，早期状态必然落在同一批信息集。"""

    def collect(seeds, first_legal: bool) -> set:
        keys: set = set()
        for seed in seeds:
            state = _fresh(seed=seed)
            rng = random.Random(seed)
            while not state.is_terminal():
                for p in range(state.num_players):
                    if state.alive[p]:
                        keys.add(state.infoset_key(p))
                legal = state.legal_actions()
                state.step(legal[0] if first_legal else rng.choice(legal))
        return keys

    random_keys = collect(range(0, 12), first_legal=False)
    greedy_keys = collect(range(0, 12), first_legal=True)
    shared = random_keys & greedy_keys
    assert shared, "相同 seed 的不同策略应产生重合信息集"
    assert len(shared) >= 12, f"至少每个 seed 的初始信息集应重合，实际 {len(shared)}"

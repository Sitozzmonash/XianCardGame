"""旧格式（参考实现字符串 key）兼容性测试。

两件事必须成立：

1. `migrate_legacy_key()` 能把参考实现 `infoset_key()` 产出的 `repr(...)` 字符串
   **无损**翻译成新版的紧凑 tuple（逐字段对照，包含 COUNTER / REORDER 等特殊阶段）；
2. 参考实现产出的旧 `.pkl` 模型能被 `MCCFRTrainer.load()` 读入，并且 `MCCFRAgent`
   能真正用它推理（不是每步都回落 RuleAgent）。
"""

from __future__ import annotations

import pickle
import random
from collections import Counter
from pathlib import Path

import pytest

from agents import MCCFRAgent, RandomAgent
from evaluation import play_game
from game import Card, GameConfig, GameState, Phase
from training import MCCFRTrainer
from training.trainer import migrate_legacy_key

#: 参考实现产出的 124MB 旧模型（只读，不进本仓库 git）
REFERENCE_MODEL = (
    Path(__file__).resolve().parents[2]
    / "reference"
    / "xiuxian_ai_demo"
    / "models"
    / "mccfr_2p_10k.pkl"
)


def reference_infoset_key(state: GameState, player: int) -> str:
    """参考实现 `xiuxian/game.py::infoset_key` 的逐字重写（用于构造旧 key）。"""
    hand = tuple(sorted(c.value for c in state.hands[player]))
    known = tuple(c.value for c in state.known_top[player])
    hand_sizes = tuple(len(h) for h in state.hands)
    alive = tuple(int(x) for x in state.alive)
    discard_counts = Counter(state.discard)
    discard_sig = tuple(discard_counts[c] for c in Card)
    reorder_private: tuple[str, ...] = ()
    if state.phase == Phase.REORDER and state.reorder_owner == player:
        reorder_private = tuple(c.value for c in state.reorder_view)
    public_pending = (
        (state.pending_actor, state.pending_target)
        if state.phase == Phase.COUNTER
        else (None, None)
    )
    return repr(
        (
            player,
            state.phase.value,
            state.current_player,
            state.decision_player(),
            state.actions_used,
            len(state.deck),
            hand,
            known,
            reorder_private,
            hand_sizes,
            alive,
            discard_sig,
            public_pending,
        )
    )


# --------------------------------------------------------------------------- 迁移函数


def test_migrate_non_string_passthrough() -> None:
    key = (0, 0, 0, 0, 0, 9, (0,) * 8, (), (), (5, 6), 3, (0,) * 8, (-1, -1))
    assert migrate_legacy_key(key) is key


def test_migrate_malformed_string_passthrough() -> None:
    assert migrate_legacy_key("not-a-tuple") == "not-a-tuple"
    assert migrate_legacy_key("(1, 2, 3)") == "(1, 2, 3)"


def test_migrate_known_example() -> None:
    """手工构造的旧 key（含中文卡名 / 阶段名 / None pending）应翻译成紧凑 tuple。"""
    legacy = (
        "(0, '行动', 1, 1, 1, 9, ('护劫符', '反制符'), ('天劫',), (), (5, 6), "
        "(1, 0), (0, 0, 0, 0, 0, 0, 0, 0), (None, None))"
    )
    migrated = migrate_legacy_key(legacy)
    assert isinstance(migrated, tuple)
    assert migrated[0] == 0  # player
    assert migrated[1] == 0  # phase: 行动 -> 0
    assert migrated[5] == 9  # deck_size
    # 手牌计数向量（CARD_ORDER: 天劫,护劫符,观星,改命,扰乱,遁术,摄物,反制）
    assert migrated[6] == (0, 1, 0, 0, 0, 0, 0, 1)
    assert migrated[7] == (0,)  # 已知牌顶：天劫 -> 0
    assert migrated[9] == (5, 6)
    assert migrated[10] == 0b01  # 存活位掩码：只剩 P0
    assert migrated[12] == (-1, -1)  # 非 COUNTER 阶段


def test_migrate_matches_new_encoding_for_random_play() -> None:
    """同局面下：旧 key 的迁移结果必须**等于**新 `infoset_key()`。"""
    rng = random.Random(2026)
    checked = 0
    for players in (2, 3, 4):
        config = GameConfig(num_players=players, seed=42)
        for game in range(6):
            state = GameState(config, rng.randrange(1 << 30))
            while not state.is_terminal():
                player = state.decision_player()
                assert migrate_legacy_key(reference_infoset_key(state, player)) == state.infoset_key(player)
                checked += 1
                state.step(state.legal_actions()[rng.randrange(len(state.legal_actions()))])
    assert checked > 100, "样本太少，测试没有意义"


def test_migrate_covers_special_phases() -> None:
    """覆盖 COUNTER / REORDER / REINSERT / 淘汰 等阶段（随机对局自然会出现）。"""
    seen: set[str] = set()
    rng = random.Random(7)
    config = GameConfig(num_players=3, seed=42)
    for game in range(40):
        state = GameState(config, rng.randrange(1 << 30))
        while not state.is_terminal():
            player = state.decision_player()
            seen.add(state.phase.value)
            assert migrate_legacy_key(reference_infoset_key(state, player)) == state.infoset_key(player)
            actions = state.legal_actions()
            state.step(actions[rng.randrange(len(actions))])
    assert {"行动", "反制"} & seen, f"未覆盖到反制阶段：{seen}"


# --------------------------------------------------------------------------- 旧模型文件


def _build_legacy_model(state: GameState, player: int, path: Path) -> Path:
    """构造一个「参考实现格式」的小模型文件（字符串 key + 中文动作 key）。"""
    legal = state.legal_actions()
    key = reference_infoset_key(state, player)
    row = {action.key(): 1.0 / len(legal) for action in legal}
    regret_row = {action.key(): float(index + 1) for index, action in enumerate(legal)}
    data = {
        "config": {
            "num_players": state.num_players,
            "initial_hand": state.config.initial_hand,
            "max_actions_per_turn": state.config.max_actions_per_turn,
            "max_decisions": state.config.max_decisions,
            "seed": 42,
        },
        "seed": 42,
        "exploration": 0.6,
        "iterations_done": 10000,
        "traversals_done": 20000,
        "regret_sum": {key: regret_row},
        "strategy_sum": {key: row},
    }
    with path.open("wb") as handle:
        pickle.dump(data, handle, protocol=pickle.HIGHEST_PROTOCOL)
    return path


def test_load_synthetic_legacy_model_and_act(tmp_path: Path) -> None:
    """旧格式小模型：载入后 key 变 tuple，MCCFRAgent 命中信息集（不回落 RuleAgent）。"""
    config = GameConfig(num_players=2, seed=42)
    state = GameState(config, 4242)
    player = state.decision_player()
    path = _build_legacy_model(state, player, tmp_path / "legacy.pkl")

    trainer = MCCFRTrainer.load(str(path))
    assert trainer.iterations_done == 10000
    assert trainer.traversals_done == 20000
    assert trainer.migrated_keys == 2
    assert trainer.unmigrated_keys == 0
    assert all(isinstance(key, tuple) for key in trainer.regret_sum)

    assert trainer.knows_infoset(state, player), "迁移后应命中该信息集"
    agent = MCCFRAgent(trainer, seed=1)
    action = agent.act(state, player)
    assert action in state.legal_actions()


def test_load_legacy_model_without_migration(tmp_path: Path) -> None:
    """`migrate_legacy=False` 时保留字符串 key（旧行为，不丢数据）。"""
    config = GameConfig(num_players=2, seed=42)
    state = GameState(config, 4242)
    path = _build_legacy_model(state, state.decision_player(), tmp_path / "legacy2.pkl")
    trainer = MCCFRTrainer.load(str(path), migrate_legacy=False)
    assert all(isinstance(key, str) for key in trainer.regret_sum)


def test_legacy_agent_plays_a_full_game(tmp_path: Path) -> None:
    """旧格式模型（含人工策略表）载入后能完整打完一局。"""
    config = GameConfig(num_players=2, seed=42)
    state = GameState(config, 77)
    path = _build_legacy_model(state, state.decision_player(), tmp_path / "legacy3.pkl")
    agent = MCCFRAgent.load(str(path), seed=5)
    result = play_game(config, [RandomAgent(1), agent], seed=1234)
    assert result.state.is_terminal()
    assert result.decisions > 0


@pytest.mark.skipif(not REFERENCE_MODEL.exists(), reason="参考实现 124MB 旧模型不存在（跳过）")
def test_reference_124mb_model_loads_and_plays() -> None:
    """真实旧模型：`reference/xiuxian_ai_demo/models/mccfr_2p_10k.pkl`（约 124MB）。

    - 载入后全部 key 迁移为 tuple；
    - `MCCFRAgent.load(path)` 能 act，并跑完一整局 Random vs MCCFR；
    - 统计信息集命中率，证明它**真的在用**这份旧策略，而不是每步回落 RuleAgent。
    """
    size_mb = REFERENCE_MODEL.stat().st_size / (1024 * 1024)
    assert size_mb > 100

    trainer = MCCFRTrainer.load(str(REFERENCE_MODEL))
    assert trainer.config.num_players == 2
    assert trainer.iterations_done == 10000
    assert trainer.regret_sum and trainer.strategy_sum
    assert trainer.migrated_keys > 100_000, f"迁移条目过少：{trainer.migrated_keys}"
    assert trainer.unmigrated_keys == 0, "不应有无法解析的旧 key"

    sample_keys = list(trainer.regret_sum)[:200]
    assert all(isinstance(key, tuple) for key in sample_keys)
    assert all(
        all(isinstance(part, int) or isinstance(part, tuple) for part in key)
        for key in sample_keys
    )

    agent = MCCFRAgent.load(str(REFERENCE_MODEL), seed=3)
    assert isinstance(agent, MCCFRAgent)

    # 第一局：逐决策统计信息集命中率（同一 trainer 上查表，避免重复加载 124MB）
    config = GameConfig(num_players=2, seed=42)
    state = GameState(config, 202)
    hits = 0
    total = 0
    while not state.is_terminal():
        player = state.decision_player()
        legal = state.legal_actions()
        action = agent.act(state, player)
        assert action in legal, "MCCFRAgent 必须返回合法动作"
        total += 1
        if trainer.knows_infoset(state, player):
            hits += 1
        state.step(action)

    hit_rate = hits / max(1, total)
    print(f"\n[旧模型推理] 决策步数={total} 命中已训练信息集={hits} 命中率={hit_rate:.1%}")
    assert hits > 0, "迁移后的旧模型至少应命中一些信息集"

    # 第二局：Random vs MCCFR 完整对局（复用已加载的 agent，避免再次读盘）
    result = play_game(config, [RandomAgent(11), agent], seed=999)
    assert result.state.is_terminal()
    assert result.decisions > 0

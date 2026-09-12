"""与参考实现 `reference/xiuxian_ai_demo` 的逐步等价性测试（INTERFACES §1.4 硬指标）。

内容：
1. 同 seed 初始状态 / rng 状态完全一致；
2. 同 seed + 同动作序列逐步对比（phase / current_player / hands / deck / alive /
   known_top / winner / decision_count / discard / turn_no / pending / reorder /
   reinsert / 中文日志 / rng 内部状态），累计 ≥ 200 步无差异；
3. 用两侧同 seed 的 RandomAgent、RuleAgent 驱动，再各 ≥ 200 步；
4. 旧信息集格式（repr 大字符串）与新紧凑编码互为**双射**（信息划分完全一致）；
5. `determinize_for` 同 seed 生成同一个可能世界；
6. 参考实现自带的 smoke 测试场景在本环境仍然通过。

参考实现目录只读，本文件只 import、不修改。
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _game_test_utils import (  # noqa: E402
    legacy_repr_key,
    drive_lockstep,
    ensure_reference_importable,
    snapshot,
    diff_snapshot,
    to_ref_action,
)

from agents import RandomAgent, RuleAgent  # noqa: E402
from game import GameConfig, GameState  # noqa: E402
from game.actions import API_ACTION_TYPE, ActionKind  # noqa: E402
from game.cards import CARD_ORDER, API_CARD_ID, Card  # noqa: E402
from game.state import Phase  # noqa: E402

REF = ensure_reference_importable()

SEEDS = (1, 2, 3, 7, 11, 42, 99)
PLAYER_COUNTS = (2, 3, 4, 6)


def test_initial_state_and_rng_match_reference():
    for seed in SEEDS:
        for num_players in PLAYER_COUNTS:
            mine = GameState(GameConfig(num_players=num_players, seed=seed), seed=seed)
            other = REF["RefGameState"](
                REF["RefGameConfig"](num_players=num_players, seed=seed), seed=seed
            )
            diff = diff_snapshot(snapshot(mine), snapshot(other))
            assert diff == [], f"seed={seed} players={num_players} 初始化不同：{diff}"
            assert mine.rng.getstate() == other.rng.getstate()


def test_lockstep_random_walk_matches_reference_over_200_steps():
    total = 0
    for seed in SEEDS:
        for num_players in PLAYER_COUNTS:
            result = drive_lockstep(seed=seed, num_players=num_players)
            total += result["steps"]
    print(f"\n[等价性] 固定随机动作序列逐步对比：{total} 步全部一致")
    assert total >= 200, f"步数不足：{total}"


def test_lockstep_random_agent_matches_reference():
    total = 0
    for seed in SEEDS:
        for num_players in (3, 6):
            result = drive_lockstep(
                seed=seed,
                num_players=num_players,
                my_agent=RandomAgent(seed),
                ref_agent=REF["RefRandomAgent"](seed),
            )
            total += result["steps"]
    print(f"[等价性] RandomAgent 同 seed 驱动：{total} 步全部一致")
    assert total >= 200, f"步数不足：{total}"


def test_lockstep_rule_agent_matches_reference():
    total = 0
    for seed in SEEDS:
        for num_players in (2, 3, 4, 6):
            result = drive_lockstep(
                seed=seed,
                num_players=num_players,
                my_agent=RuleAgent(seed),
                ref_agent=REF["RefRuleAgent"](seed),
            )
            total += result["steps"]
    print(f"[等价性] RuleAgent 同 seed 驱动：{total} 步全部一致")
    assert total >= 200, f"步数不足：{total}"


def test_terminal_outcome_and_utilities_match_reference():
    decided = 0
    for seed in SEEDS:
        result = drive_lockstep(seed=seed, num_players=3)
        mine, other = result["my_state"], result["ref_state"]
        assert result["terminal"] is True
        assert mine.winner == other.winner
        assert mine.forced_stop == other.forced_stop
        assert mine.utilities() == other.utilities()
        assert mine.is_terminal() == other.is_terminal()
        assert mine.decision_player() == other.decision_player()
        if mine.winner is not None and not mine.forced_stop:
            decided += 1
    assert decided > 0, "至少应有一局分出胜负"


def test_compact_key_is_bijective_with_reference_repr_key():
    """新旧 key 必须互为双射：既不多撞（信息丢失），也不多分（信息冗余）。"""
    repr_to_tuple: dict[str, tuple] = {}
    tuple_to_repr: dict[tuple, str] = {}
    samples = 0
    for seed in (1, 2, 3, 5, 8, 13, 21):
        mine = GameState(GameConfig(num_players=3, seed=seed), seed=seed)
        other = REF["RefGameState"](
            REF["RefGameConfig"](num_players=3, seed=seed), seed=seed
        )
        chooser = random.Random(seed)
        while not mine.is_terminal():
            for player in range(mine.num_players):
                if not mine.alive[player]:
                    continue
                ref_key = other.infoset_key(player)
                new_key = mine.infoset_key(player)
                assert legacy_repr_key(mine, player) == ref_key, "旧格式复刻与参考实现不一致"
                repr_to_tuple.setdefault(ref_key, new_key)
                tuple_to_repr.setdefault(new_key, ref_key)
                assert repr_to_tuple[ref_key] == new_key
                assert tuple_to_repr[new_key] == ref_key
                samples += 1
            action = chooser.choice(mine.legal_actions())
            mine.step(action)
            other.step(to_ref_action(action))
    print(
        f"[等价性] 采样 {samples} 个 (state,player)：旧 key {len(repr_to_tuple)} 种，"
        f"新 key {len(tuple_to_repr)} 种，双射成立"
    )
    assert samples > 500
    assert len(repr_to_tuple) == len(tuple_to_repr)


def test_determinize_matches_reference_for_same_seed():
    for seed in (1, 4, 9, 17):
        mine = GameState(GameConfig(num_players=3, seed=seed), seed=seed)
        other = REF["RefGameState"](
            REF["RefGameConfig"](num_players=3, seed=seed), seed=seed
        )
        chooser = random.Random(seed + 1)
        for _ in range(12):  # 走到一半再对比
            if mine.is_terminal():
                break
            action = chooser.choice(mine.legal_actions())
            mine.step(action)
            other.step(to_ref_action(action))
        for observer in range(3):
            for det_seed in (0, 12345, 999):
                a = mine.determinize_for(observer, det_seed)
                b = other.determinize_for(observer, det_seed)
                diff = diff_snapshot(snapshot(a), snapshot(b))
                assert diff == [], (seed, observer, det_seed, diff)
                assert a.rng.getstate() == b.rng.getstate()
                assert a.logs == [] and b.logs == []


def test_enum_values_match_reference():
    assert [c.value for c in Card] == [c.value for c in REF["RefCard"]]
    assert [c.name for c in Card] == [c.name for c in REF["RefCard"]]
    assert [p.value for p in Phase] == [p.value for p in REF["RefPhase"]]
    assert [p.name for p in Phase] == [p.name for p in REF["RefPhase"]]
    assert [k.name for k in ActionKind] == [k.name for k in REF["RefActionKind"]]
    assert [k.value for k in ActionKind] == [k.value for k in REF["RefActionKind"]]
    # 每个 ActionKind 都有 API type 映射
    assert set(API_ACTION_TYPE) == set(ActionKind)
    # 牌顺序（编码用）与 8 张牌一致
    assert len(CARD_ORDER) == len(Card) == 8
    assert [API_CARD_ID[c] for c in CARD_ORDER] == [
        "TRIBULATION",
        "DEFUSE",
        "STARGAZING",
        "REWRITE_FATE",
        "SHUFFLE",
        "ESCAPE",
        "STEAL",
        "COUNTER",
    ]


def test_reference_smoke_scenarios_still_pass():
    """参考实现自带 tests/test_smoke.py 的三个场景（在本环境 import 后跑一遍）。"""
    from xiuxian.agents import (  # type: ignore[import-not-found]
        ISMCTSAgent as RefISMCTS,
        RandomAgent as RefRandom,
    )
    from xiuxian.eval import play_game as ref_play_game  # type: ignore[import-not-found]
    from xiuxian.game import (  # type: ignore[import-not-found]
        GameConfig as RefConfig,
        GameState as RefState,
    )
    from xiuxian.mccfr import (  # type: ignore[import-not-found]
        MCCFRAgent as RefMCCFRAgent,
        MCCFRTrainer as RefMCCFRTrainer,
    )

    # 1) 随机对局能打完
    cfg = RefConfig(num_players=3, max_decisions=400)
    result = ref_play_game(cfg, [RefRandom(1), RefRandom(2), RefRandom(3)], seed=123)
    assert result.state.is_terminal()

    # 2) ISMCTS 返回合法动作
    cfg = RefConfig(num_players=3)
    state = RefState(cfg, seed=123)
    player = state.decision_player()
    action = RefISMCTS(simulations=10, seed=7).act(state, player)
    assert action in state.legal_actions()

    # 3) MCCFR 小规模训练 + 推理
    cfg = RefConfig(num_players=2, max_decisions=200)
    trainer = RefMCCFRTrainer(cfg, seed=5)
    trainer.train(iterations=2, workers=1, log_every=100)
    assert len(trainer.regret_sum) > 0
    state = RefState(cfg, seed=321)
    player = state.decision_player()
    assert RefMCCFRAgent(trainer, seed=6).act(state, player) in state.legal_actions()

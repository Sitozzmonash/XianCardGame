"""与参考实现 `reference/xiuxian_ai_demo` 的逐步等价性测试（INTERFACES §1.4 硬指标）。

⚠ **有意偏离（2026-09-13，用户裁决）**：卡牌规则按用户提供的前端原型文案调整了三条
（`docs/CARD_RULES_DELTA.md`，裁决见 `docs/INTERFACES.md` 附录 A13），参考实现仍是旧规则：

| 牌型 | 旧（参考实现） | 新（本仓） |
|---|---|---|
| 观星术 `PLAY_PEEK` | 只看牌顶，动作结束 | 查看 + 改序（进入 `Phase.REORDER`） |
| 遁术 `PLAY_SKIP` | 行动阶段主动跳过抽牌 | `Phase.COUNTER` 反应牌：避开法术并立即结束结算 |
| 反制符 `PLAY_COUNTER` | 取消摄物术 | 反弹（原施术者反被偷 1 张） |

因此本文件**不再声称全量零差异**，而是「只对照未改动的规则分支」：

* 逐步对比（`drive_lockstep`）每一步都断言：两侧合法动作的对称差集 ⊆ {遁术}，
  去掉遁术后**集合与顺序完全一致**；动作序列固定在非偏离子集上，快照 / rng / 中文日志
  仍要求逐步零差异；
* agent 驱动时两侧都用 `DeviationFilteredAgent` 包一层（偏离选择换成第一个非偏离动作），
  因此动作序列逐条相同、对账能力保留；
* `test_intentional_deviations_are_real_and_whitelisted` 正向断言这三个偏离点确实存在
  （防止规则被悄悄改回参考实现）。

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
    DEVIATION_ACTION_KINDS,
    SKIP_ACTION_KEY,
    assert_action_parity,
    shared_actions,
    legacy_repr_key,
    drive_lockstep,
    ensure_reference_importable,
    snapshot,
    diff_snapshot,
    to_ref_action,
)

from agents import RandomAgent, RuleAgent  # noqa: E402
from game import GameConfig, GameState  # noqa: E402
from game.actions import API_ACTION_TYPE, Action, ActionKind  # noqa: E402
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
            # 只在未改动的规则分支上驱动（观星术/遁术/反制符已按原型改过，见文件头）
            assert_action_parity(mine, other)
            action = chooser.choice(shared_actions(mine.legal_actions()))
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
            action = chooser.choice(shared_actions(mine.legal_actions()))
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
    """枚举表面（成员名 / 中文 value）与参考实现一致 —— 有意偏离的是**语义**，不是枚举。

    `PLAY_SKIP` 仍然是 `"使用遁术"`，但已从行动阶段牌改为 COUNTER 阶段反应牌，
    api type 也由 `PLAY_CARD` 改为 `ESCAPE`（见 `test_intentional_deviations_are_real_and_whitelisted`）。
    """
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


def test_intentional_deviations_are_real_and_whitelisted():
    """三个偏离点必须「真的偏离」参考实现（防止规则被悄悄改回旧版）。

    白名单在 `tests/_game_test_utils.py`（`DEVIATION_ACTION_KINDS`），
    规则来源：用户提供的前端原型文案 + `docs/CARD_RULES_DELTA.md`。
    """
    assert DEVIATION_ACTION_KINDS == {"PLAY_PEEK", "PLAY_SKIP", "PLAY_COUNTER"}
    assert SKIP_ACTION_KEY == Action(ActionKind.PLAY_SKIP).key() == "使用遁术|-1|"
    assert API_ACTION_TYPE[ActionKind.PLAY_PEEK] == "PLAY_CARD"
    assert API_ACTION_TYPE[ActionKind.PLAY_SKIP] == "ESCAPE"  # 旧：PLAY_CARD
    assert API_ACTION_TYPE[ActionKind.PLAY_COUNTER] == "COUNTER"

    RefCard = REF["RefCard"]
    RefAction = REF["RefAction"]
    RefActionKind = REF["RefActionKind"]

    def pair(seed: int, num_players: int = 3):
        return (
            GameState(GameConfig(num_players=num_players, seed=seed), seed),
            REF["RefGameState"](
                REF["RefGameConfig"](num_players=num_players, seed=seed), seed
            ),
        )

    # ① 观星术：本仓「查看 + 改序」（进入 REORDER），参考实现看完就结束
    mine, other = pair(6)
    p = mine.current_player
    assert p == other.current_player
    mine.hands[p] = [Card.PEEK]
    other.hands[p] = [RefCard.PEEK]
    assert other.phase.name == "ACTION"
    mine.step(Action(ActionKind.PLAY_PEEK))
    other.step(RefAction(RefActionKind.PLAY_PEEK))
    assert mine.phase == Phase.REORDER and mine.reorder_owner == p
    assert len(mine.legal_actions()) == 6  # 3! 个排列
    assert other.phase.name == "ACTION"  # 旧规则：不进入排序
    assert all(a.kind.name != "REORDER_TOP" for a in other.legal_actions())

    # ② 遁术：行动阶段不再可用；COUNTER 阶段多出一条反应动作
    #    （两侧枚举是不同类，因此比较 `key()` 字符串）
    mine, other = pair(12)
    p = mine.current_player
    target = (p + 1) % 3
    mine.hands[p] = [Card.SKIP]
    other.hands[p] = [RefCard.SKIP]
    assert SKIP_ACTION_KEY in {a.key() for a in other.legal_actions()}
    assert SKIP_ACTION_KEY not in {a.key() for a in mine.legal_actions()}
    assert_action_parity(mine, other)

    mine, other = pair(12)
    p = mine.current_player
    target = (p + 1) % 3
    mine.hands[p] = [Card.STEAL]
    other.hands[p] = [RefCard.STEAL]
    mine.hands[target] = [Card.SKIP]
    other.hands[target] = [RefCard.SKIP]
    mine.step(Action(ActionKind.PLAY_STEAL, target=target))
    other.step(RefAction(RefActionKind.PLAY_STEAL, target))
    assert SKIP_ACTION_KEY in {a.key() for a in mine.legal_actions()}  # 新：遁术是反应牌
    assert SKIP_ACTION_KEY not in {a.key() for a in other.legal_actions()}  # 旧：反制阶段只有 2 个选项
    assert_action_parity(mine, other)

    # ③ 反制符：本仓反弹（施术者反被偷），参考实现只是取消
    mine, other = pair(14)
    p = mine.current_player
    target = (p + 1) % 3
    mine.hands[p] = [Card.STEAL, Card.PEEK]
    other.hands[p] = [RefCard.STEAL, RefCard.PEEK]
    mine.hands[target] = [Card.COUNTER]
    other.hands[target] = [RefCard.COUNTER]
    mine.step(Action(ActionKind.PLAY_STEAL, target=target))
    other.step(RefAction(RefActionKind.PLAY_STEAL, target))
    mine.step(Action(ActionKind.PLAY_COUNTER))
    other.step(RefAction(RefActionKind.PLAY_COUNTER))
    assert mine.hands[target] == [Card.PEEK]  # 反弹：原目标反而拿到 1 张
    assert mine.hands[p] == []  # 施术者被反偷
    assert other.hands[target] == []  # 旧规则：取消 → 双方都不动
    assert other.hands[p] == [RefCard.PEEK]


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

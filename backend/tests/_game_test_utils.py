"""C2 测试共用工具（不是 test_ 文件，pytest 不会收集）。

内容：
- `ensure_reference_importable()`：把只读的参考实现目录加入 sys.path，返回其模块；
- `snapshot()`：把 GameState 拍成"中文值"可比较快照（隐藏信息全量）；
- `to_ref_action()` / `make_ref_state()`：参考实现与新实现的同构转换；
- `legacy_repr_key()`：参考实现旧格式（repr 大字符串）信息集 key 的现场复刻；
- `drive_lockstep()`：同 seed、同动作序列、逐步对比两个实现的驱动器。
"""

from __future__ import annotations

import random
import sys
from collections import Counter
from pathlib import Path
from typing import Callable, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
REF_ROOT = REPO_ROOT / "reference" / "xiuxian_ai_demo"

_ref_modules: Optional[dict] = None


def ensure_reference_importable() -> dict:
    """导入只读参考实现（不修改其代码），返回需要的符号。"""
    global _ref_modules
    if _ref_modules is None:
        for path in (str(BACKEND_DIR), str(REF_ROOT)):
            if path not in sys.path:
                sys.path.insert(0, path)
        from xiuxian.agents import (  # type: ignore[import-not-found]
            Action as RefAction,
            ActionKind as RefActionKind,
            RandomAgent as RefRandomAgent,
            RuleAgent as RefRuleAgent,
            ISMCTSAgent as RefISMCTSAgent,
        )
        from xiuxian.game import (  # type: ignore[import-not-found]
            Card as RefCard,
            GameConfig as RefGameConfig,
            GameState as RefGameState,
            Phase as RefPhase,
        )

        _ref_modules = {
            "RefAction": RefAction,
            "RefActionKind": RefActionKind,
            "RefRandomAgent": RefRandomAgent,
            "RefRuleAgent": RefRuleAgent,
            "RefISMCTSAgent": RefISMCTSAgent,
            "RefCard": RefCard,
            "RefGameConfig": RefGameConfig,
            "RefGameState": RefGameState,
            "RefPhase": RefPhase,
        }
    return _ref_modules


def to_ref_action(action, ref: Optional[dict] = None):
    """新实现的 Action -> 参考实现 Action（枚举成员名一致，中文 value 一致）。"""
    ref = ref or ensure_reference_importable()
    RefAction = ref["RefAction"]
    RefActionKind = ref["RefActionKind"]
    return RefAction(getattr(RefActionKind, action.kind.name), action.target, action.param)


def snapshot(state) -> dict:
    """隐藏信息全量快照（值统一成中文串，便于跨实现比较）。"""
    return {
        "phase": state.phase.value,
        "current_player": state.current_player,
        "decision_player": state.decision_player(),
        "hands": [[c.value for c in h] for h in state.hands],
        "deck": [c.value for c in state.deck],
        "discard": [c.value for c in state.discard],
        "alive": list(state.alive),
        "known_top": [[c.value for c in k] for k in state.known_top],
        "actions_used": state.actions_used,
        "turn_no": state.turn_no,
        "decision_count": state.decision_count,
        "winner": state.winner,
        "forced_stop": state.forced_stop,
        "pending": (state.pending_actor, state.pending_target),
        "reorder": (state.reorder_owner, [c.value for c in state.reorder_view]),
        "reinsert_player": state.reinsert_player,
        "logs": list(state.logs),
    }


def diff_snapshot(a: dict, b: dict) -> list[str]:
    """返回两个快照的差异字段名。"""
    return [key for key in a if a[key] != b[key]]


def legacy_repr_key(state, player: int) -> str:
    """参考实现旧信息集格式（`repr(...)` 大字符串）的现场复刻。"""
    from game.cards import CARD_ORDER

    hand = tuple(sorted(c.value for c in state.hands[player]))
    known = tuple(c.value for c in state.known_top[player])
    hand_sizes = tuple(len(h) for h in state.hands)
    alive = tuple(int(x) for x in state.alive)
    discard_counts = Counter(state.discard)
    discard_sig = tuple(discard_counts[c] for c in CARD_ORDER)
    reorder_private: tuple = ()
    if state.phase.value == "改命排序" and state.reorder_owner == player:
        reorder_private = tuple(c.value for c in state.reorder_view)
    pending = (
        (state.pending_actor, state.pending_target)
        if state.phase.value == "反制"
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
            pending,
        )
    )


def drive_lockstep(
    seed: int,
    num_players: int = 3,
    max_steps: int = 1000,
    chooser_seed: Optional[int] = None,
    my_agent=None,
    ref_agent=None,
    ref_agent_factory: Optional[Callable[[int], object]] = None,
    my_agent_factory: Optional[Callable[[int], object]] = None,
    ref_common: Optional[dict] = None,
) -> dict:
    """同 seed 驱动两个实现，逐步比较（含 rng 内部状态与中文日志）。

    - 默认用一个独立的 `random.Random` 选合法动作下标（两侧动作序列必然一致）；
    - 也可以传 `my_agent` / `ref_agent`（或各自的 factory，参数为 seed）。
    返回 {"steps", "winner", "forced_stop", "terminal", "my_state", "ref_state"}。
    """
    from game import GameConfig, GameState

    ref = ref_common or ensure_reference_importable()
    RefGameConfig = ref["RefGameConfig"]
    RefGameState = ref["RefGameState"]

    my_agent = my_agent or (my_agent_factory(seed) if my_agent_factory else None)
    ref_agent = ref_agent or (ref_agent_factory(seed) if ref_agent_factory else None)

    config = GameConfig(num_players=num_players, seed=seed)
    ref_config = RefGameConfig(num_players=num_players, seed=seed)
    mine = GameState(config, seed=seed)
    other = RefGameState(ref_config, seed=seed)

    if diff_snapshot(snapshot(mine), snapshot(other)):
        raise AssertionError(
            f"初始状态就不一致：{diff_snapshot(snapshot(mine), snapshot(other))}"
        )

    chooser = random.Random(seed * 7919 + 13 if chooser_seed is None else chooser_seed)
    steps = 0
    while not mine.is_terminal() and steps < max_steps:
        my_legal = mine.legal_actions()
        ref_legal = other.legal_actions()
        assert [a.key() for a in my_legal] == [
            a.key() for a in ref_legal
        ], f"第 {steps} 步合法动作集合不一致"
        assert [str(a) for a in my_legal] == [
            str(a) for a in ref_legal
        ], f"第 {steps} 步合法动作展示不一致"

        if my_agent is not None:
            my_player = mine.decision_player()
            ref_player = other.decision_player()
            assert my_player == ref_player
            action = my_agent.act(mine, my_player)
            ref_action = ref_agent.act(other, ref_player)
            assert action.key() == ref_action.key(), f"第 {steps} 步 agent 选择不一致"
        else:
            action = my_legal[chooser.randrange(len(my_legal))]
            ref_action = to_ref_action(action, ref)

        mine.step(action)
        other.step(ref_action)
        steps += 1

        diff = diff_snapshot(snapshot(mine), snapshot(other))
        assert not diff, f"第 {steps} 步出现差异，字段：{diff}"
        assert mine.rng.getstate() == other.rng.getstate(), f"第 {steps} 步 rng 状态不一致"

    return {
        "steps": steps,
        "winner": mine.winner,
        "forced_stop": mine.forced_stop,
        "terminal": mine.is_terminal(),
        "my_state": mine,
        "ref_state": other,
    }


def play_with_agents(state, agents, max_decisions: Optional[int] = None) -> int:
    """用给定 agents 跑一局到底，返回步数（用于 agent 行为测试）。"""
    steps = 0
    limit = max_decisions or state.config.max_decisions + 10
    while not state.is_terminal() and steps < limit:
        player = state.decision_player()
        action = agents[player].act(state, player)
        assert action in state.legal_actions(), f"P{player} 给了非法动作：{action}"
        state.step(action)
        steps += 1
    return steps

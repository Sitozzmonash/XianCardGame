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
    """导入只读参考实现（不修改其代码），返回需要的符号。

    **用 `append` 而不是 `insert(0, …)`**：参考实现目录里也有一个 `main.py`
    （`reference/xiuxian_ai_demo/main.py`，且没有 `def main`），插到搜索路径最前面会
    遮蔽本仓 `backend/main.py` —— 之后任何 `import main as cli` 都会解析到参考实现那份，
    报 `AttributeError: module 'main' has no attribute 'main'`。
    参考实现只需要「可被找到」（`xiuxian` 包名在本仓不冲突），不需要「优先于本仓」。
    """
    global _ref_modules
    if _ref_modules is None:
        for path in (str(BACKEND_DIR), str(REF_ROOT)):
            if path not in sys.path:
                sys.path.append(path)
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


# ------------------------------------------------------- 与参考实现的有意偏离
#
# 卡牌规则按**用户提供的前端原型文案**调整（`docs/CARD_RULES_DELTA.md`，
# 裁决记录见 `docs/INTERFACES.md` 附录 A13）。参考实现 `reference/xiuxian_ai_demo`
# 仍是旧规则，因此三条牌型的合法性 / 语义**必然**不同：
#
# | 牌型 | 旧（参考实现） | 新（本仓） |
# |---|---|---|
# | `PLAY_PEEK` 观星术 | 只看牌顶，动作结束 | 查看 + 改序（进入 `Phase.REORDER`） |
# | `PLAY_SKIP` 遁术 | 行动阶段主动跳过抽牌 | `Phase.COUNTER` 的反应牌：避开法术并立即结束结算 |
# | `PLAY_COUNTER` 反制符 | 取消摄物术 | 反弹（原施术者反被偷 1 张） |
#
# 对照测试的处理方式：**其余部分仍要求逐步零差异**，这三条只在白名单里被显式排除；
# `tests/test_game_reference_parity.py` 另有一条正向断言证明这三个偏离点确实存在
# （防止有人把规则「修」回参考实现还不自知）。
DEVIATION_ACTION_KINDS: frozenset[str] = frozenset(
    {"PLAY_PEEK", "PLAY_SKIP", "PLAY_COUNTER"}
)

#: 遁术动作的中文 key（`Action.key()`）：两个实现的合法动作集合之间**唯一**允许的差异项。
SKIP_ACTION_KEY = "使用遁术|-1|"


def is_deviation(action) -> bool:
    """该动作是否属于「有意偏离参考实现」的牌型。"""
    return action.kind.name in DEVIATION_ACTION_KINDS


def shared_actions(actions) -> list:
    """过滤掉偏离牌型后的合法动作（两个实现必须给出完全一致的这份列表）。"""
    return [a for a in actions if not is_deviation(a)]


def assert_action_parity(mine, other) -> None:
    """断言「未改动部分」的合法动作完全一致，且差异只可能是白名单里的遁术。

    - 共同动作的**集合与相对顺序**必须一致；
    - 对称差集必须 ⊆ {`使用遁术|-1|`}：ACTION 阶段旧实现多一条「主动遁术」，
      COUNTER 阶段新实现多一条「遁术避开」（若目标手里有遁术）。
    """
    my_legal = mine.legal_actions()
    ref_legal = other.legal_actions()
    delta = {a.key() for a in my_legal} ^ {a.key() for a in ref_legal}
    assert delta <= {SKIP_ACTION_KEY}, f"超出白名单的合法动作差异：{sorted(delta)}"
    assert [a.key() for a in shared_actions(my_legal)] == [
        a.key() for a in shared_actions(ref_legal)
    ], "未改动部分的合法动作集合/顺序不一致"
    assert [str(a) for a in shared_actions(my_legal)] == [
        str(a) for a in shared_actions(ref_legal)
    ], "未改动部分的合法动作展示不一致"


class _SharedActionView:
    """把 `legal_actions()` 过滤成「非偏离动作」的只读代理（其余属性全部转发）。

    两侧 agent 因此看到**完全相同**的动作列表（长度与顺序都一致），
    `RandomAgent.rng.choice` / RuleAgent 的 `_find` 才会做出同样的选择。
    """

    def __init__(self, state):
        object.__setattr__(self, "_state", state)

    def legal_actions(self):
        state = object.__getattribute__(self, "_state")
        filtered = shared_actions(state.legal_actions())
        return filtered

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_state"), name)


class DeviationFilteredAgent:
    """把「有意偏离的牌型」从 agent 可见的动作列表里去掉的包装。

    这样两个实现（本仓引擎 / 参考实现）仍能拿**同一条动作序列**跑完整局，
    只对照未改动的规则分支：agent 只能从 `shared_actions()` 里选动作，
    因此两侧选择必然一致（ACTION 阶段去掉观星/遁术，COUNTER 阶段去掉反制/遁术）。
    """

    def __init__(self, agent):
        self.agent = agent
        self.name = getattr(agent, "name", self.__class__.__name__)

    def act(self, state, player):
        view = _SharedActionView(state)
        if not view.legal_actions():  # 全是偏离动作的极端情况：退回真实状态
            return self.agent.act(state, player)
        return self.agent.act(view, player)


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

    **只对照未改动的规则分支**：卡牌规则按原型文案改了三条（观星术 + 改序、遁术 → 反应牌、
    反制符 取消 → 反弹，见 `docs/CARD_RULES_DELTA.md`），参考实现仍是旧规则，因此：

    - 每一步先 `assert_action_parity()`：除了「遁术」那一条动作，两侧合法动作必须完全一致；
    - 随机选择器只在 `shared_actions()`（去掉偏离牌型）里挑动作；
    - 传 agent 时两侧都用 `DeviationFilteredAgent` 包一层（把偏离选择换成第一个非偏离动作），
      于是动作序列仍逐条相同，快照 / rng / 中文日志继续要求零差异。

    返回 {"steps", "winner", "forced_stop", "terminal", "my_state", "ref_state"}。
    """
    from game import GameConfig, GameState

    ref = ref_common or ensure_reference_importable()
    RefGameConfig = ref["RefGameConfig"]
    RefGameState = ref["RefGameState"]

    my_agent = my_agent or (my_agent_factory(seed) if my_agent_factory else None)
    ref_agent = ref_agent or (ref_agent_factory(seed) if ref_agent_factory else None)
    if my_agent is not None:
        my_agent = DeviationFilteredAgent(my_agent)
        ref_agent = DeviationFilteredAgent(ref_agent)

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
        assert_action_parity(mine, other)
        my_legal = shared_actions(mine.legal_actions())
        ref_legal = shared_actions(other.legal_actions())

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

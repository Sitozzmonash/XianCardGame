"""`training/` 单元测试：MCCFRTrainer 训练、统计、存档、续训、指标日志。"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import pytest

from game import GameConfig, GameState
from training import MCCFRTrainer, format_duration
from training._table import table_size


@pytest.fixture()
def config_2p() -> GameConfig:
    return GameConfig(num_players=2, seed=42)


@pytest.fixture()
def config_3p() -> GameConfig:
    return GameConfig(num_players=3, seed=42)


def assert_tables_close(got: dict, expected: dict, *, rel: float = 1e-6, abs_: float = 1e-6) -> None:
    """比较两张表：**键集合严格相等 + 数值近似**（两层，缺一不可）。

    为什么不能要求精确相等：v2 落盘时值存 `float32`（`docs/INTERFACES.md` §3.5），
    而内存里的 `dict[str, float]` 是 Python float（float64）；regret 累加若干轮后
    出现 float32 表示不了的小数尾，逐项 `==` **必然**不成立。
    键集合那一层是严格的，所以 1e-6 的容差不会掩盖「少 key / 多 key / 错行」这类结构缺陷。
    """
    assert set(got) == set(expected), "信息集键集合必须完全一致"
    for key, row in expected.items():
        actual = got[key]
        assert set(actual) == set(row), f"动作集合必须完全一致：{key}"
        for action, value in row.items():
            assert actual[action] == pytest.approx(value, rel=rel, abs=abs_), f"数值不一致：{key} / {action}"


def test_trainer_counts_iterations_and_traversals(config_2p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_2p, seed=1, metrics_path=None)
    trainer.train(iterations=15, workers=1, log_every=100, progress=False)

    assert trainer.iterations_done == 15
    # 一次 outer iteration = 每名玩家各一次 update-player episode
    assert trainer.traversals_done == 15 * 2
    assert trainer.regret_sum, "训练后后悔表不应为空"
    assert trainer.strategy_sum, "训练后平均策略表不应为空"


def test_infoset_keys_are_compact_tuples(config_2p: GameConfig) -> None:
    """信息集 key 必须是 tuple（不是旧的 repr 字符串）。"""
    trainer = MCCFRTrainer(config_2p, seed=2, metrics_path=None)
    trainer.train(iterations=5, workers=1, progress=False)
    for key in trainer.regret_sum:
        assert isinstance(key, tuple), f"key 应为 tuple：{type(key)}"
        assert all(
            isinstance(part, int) or isinstance(part, tuple) for part in key
        ), f"key 元素只能是 int/tuple：{key}"


def test_three_players_traversals(config_3p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_3p, seed=3, metrics_path=None)
    trainer.train(iterations=4, workers=1, progress=False)
    assert trainer.traversals_done == 4 * 3


def test_average_strategy_is_distribution(config_2p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_2p, seed=4, metrics_path=None)
    trainer.train(iterations=10, workers=1, progress=False)

    state = GameState(config_2p, 12345)
    player = state.decision_player()
    probs = trainer.average_strategy(state, player)

    legal = state.legal_actions()
    assert set(probs) == {action.key() for action in legal}
    assert all(prob >= 0.0 for prob in probs.values())
    assert sum(probs.values()) == pytest.approx(1.0)

    # 未见过的信息集：也应给出合法分布（退回 regret matching 的均匀分布）
    fresh = GameState(config_2p, 999)
    fresh_probs = trainer.average_strategy(fresh, fresh.decision_player())
    assert sum(fresh_probs.values()) == pytest.approx(1.0)


def test_same_seed_is_reproducible(config_2p: GameConfig) -> None:
    a = MCCFRTrainer(config_2p, seed=7, metrics_path=None)
    b = MCCFRTrainer(config_2p, seed=7, metrics_path=None)
    a.train(iterations=20, workers=1, progress=False)
    b.train(iterations=20, workers=1, progress=False)

    assert len(a.regret_sum) == len(b.regret_sum)
    assert a.regret_sum == b.regret_sum
    assert a.strategy_sum == b.strategy_sum


def test_different_seed_differs(config_2p: GameConfig) -> None:
    a = MCCFRTrainer(config_2p, seed=11, metrics_path=None)
    b = MCCFRTrainer(config_2p, seed=12, metrics_path=None)
    a.train(iterations=20, workers=1, progress=False)
    b.train(iterations=20, workers=1, progress=False)
    assert a.regret_sum != b.regret_sum


def test_stats_fields(config_2p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_2p, seed=5, metrics_path=None)
    trainer.train(iterations=10, workers=1, progress=False)
    stats = trainer.stats()
    for key in (
        "iterations",
        "traversals",
        "infosets",
        "iter_per_sec",
        "elapsed",
        "policy_size",
    ):
        assert key in stats
    assert stats["iterations"] == 10
    assert stats["policy_size"] == table_size(trainer.strategy_sum)
    assert stats["elapsed"] > 0
    assert "Iterations/s" in trainer.report()


def test_format_duration() -> None:
    assert format_duration(0) == "00:00:00"
    assert format_duration(61) == "00:01:01"
    assert format_duration(3661) == "01:01:01"


def test_save_load_roundtrip(config_2p: GameConfig, tmp_path: Path) -> None:
    trainer = MCCFRTrainer(config_2p, seed=9, exploration=0.5, metrics_path=None)
    trainer.train(iterations=25, workers=1, progress=False)
    path = tmp_path / "m.pkl"
    trainer.save(str(path))
    assert path.exists()

    with path.open("rb") as handle:
        raw = pickle.load(handle)
    assert raw["format_version"] == 2
    assert raw["infoset_format"] == "compact-tuple-v2"
    assert set(raw) >= {
        "format_version",
        "config",
        "seed",
        "exploration",
        "iterations_done",
        "traversals_done",
        "regret_sum",
        "strategy_sum",
    }

    loaded = MCCFRTrainer.load(str(path))
    assert loaded.iterations_done == trainer.iterations_done
    assert loaded.traversals_done == trainer.traversals_done
    assert loaded.exploration == 0.5
    assert loaded.seed == 9
    # 结构层 + 数值层分开断言：v2 的值是 float32，精确相等不成立（见 assert_tables_close）
    assert_tables_close(loaded.regret_sum, trainer.regret_sum)
    assert_tables_close(loaded.strategy_sum, trainer.strategy_sum)
    assert loaded.config.num_players == 2


def test_assert_tables_close_rejects_tampering(config_2p: GameConfig, tmp_path: Path) -> None:
    """容差保护：1e-6 的容差不许宽到吞掉结构性错误或 1e-3 量级的篡改。"""
    trainer = MCCFRTrainer(config_2p, seed=9, metrics_path=None)
    trainer.train(iterations=25, workers=1, progress=False)
    path = tmp_path / "m.pkl"
    trainer.save(str(path))
    loaded = MCCFRTrainer.load(str(path))

    # 1) 真实数据：比较逻辑本身必须通过
    assert_tables_close(loaded.regret_sum, trainer.regret_sum)
    assert_tables_close(loaded.strategy_sum, trainer.strategy_sum)

    # 2) 篡改单个数值（+1e-3，远大于 float32 尾差）→ 必须被发现
    key = next(iter(loaded.regret_sum))
    action = next(iter(loaded.regret_sum[key]))
    tampered = {info: dict(row) for info, row in loaded.regret_sum.items()}
    tampered[key][action] += 1e-3
    with pytest.raises(AssertionError):
        assert_tables_close(tampered, trainer.regret_sum)

    # 3) 篡改结构（少一个动作 / 多一个信息集）→ 也必须被发现
    shrunken = {info: dict(row) for info, row in loaded.regret_sum.items()}
    shrunken[key].pop(action)
    with pytest.raises(AssertionError):
        assert_tables_close(shrunken, trainer.regret_sum)

    extra = dict(loaded.regret_sum)
    extra[("bogus", "key")] = {action: 1.0}
    with pytest.raises(AssertionError):
        assert_tables_close(extra, trainer.regret_sum)


def test_save_creates_parent_dir(config_2p: GameConfig, tmp_path: Path) -> None:
    trainer = MCCFRTrainer(config_2p, seed=1, metrics_path=None)
    target = tmp_path / "deep" / "nested" / "m.pkl"
    trainer.save(str(target))
    assert target.exists()


def test_resume_continues_from_loaded_model(config_2p: GameConfig, tmp_path: Path) -> None:
    first = MCCFRTrainer(config_2p, seed=13, metrics_path=None)
    first.train(iterations=10, workers=1, progress=False)
    path = tmp_path / "a.pkl"
    first.save(str(path))
    infosets_before = len(first.regret_sum)

    resumed = MCCFRTrainer.load(str(path))
    assert resumed.iterations_done == 10
    resumed.metrics_path = None
    resumed.train(iterations=10, workers=1, progress=False)

    assert resumed.iterations_done == 20
    assert resumed.traversals_done == first.traversals_done + 20
    assert len(resumed.regret_sum) >= infosets_before


def test_checkpoint_files_are_written(config_2p: GameConfig, tmp_path: Path) -> None:
    trainer = MCCFRTrainer(config_2p, seed=17, metrics_path=None)
    prefix = str(tmp_path / "ck")
    trainer.train(
        iterations=30,
        workers=1,
        checkpoint_every=10,
        checkpoint_prefix=prefix,
        log_every=1000,
        progress=False,
    )
    assert trainer.iterations_done == 30
    for step in (10, 20, 30):
        assert Path(f"{prefix}_{step}.pkl").exists(), f"缺少 checkpoint {step}"
    # checkpoint 里也应带着当时的迭代数
    partial = MCCFRTrainer.load(f"{prefix}_{10}.pkl")
    assert partial.iterations_done == 10


def test_metrics_jsonl_appended(config_2p: GameConfig, tmp_path: Path) -> None:
    metrics = tmp_path / "logs" / "train_metrics.jsonl"
    trainer = MCCFRTrainer(config_2p, seed=21, metrics_path=str(metrics))
    trainer.train(iterations=20, workers=1, log_every=10, progress=False)

    assert metrics.exists(), "指标文件应被创建"
    lines = [json.loads(line) for line in metrics.read_text(encoding="utf-8").splitlines() if line]
    assert lines, "指标文件不应为空"
    for record in lines:
        for field in (
            "iteration",
            "elapsed",
            "infosets",
            "iterations_per_second",
            "policy_size",
            "checkpoint",
        ):
            assert field in record, f"缺少指标字段 {field}"
    assert lines[-1]["iteration"] == 20
    assert lines[-1]["infosets"] > 0
    assert lines[-1]["iterations_per_second"] > 0


def test_metrics_disabled_when_path_none(config_2p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_2p, seed=22, metrics_path=None)
    trainer.train(iterations=3, workers=1, progress=False)
    assert trainer.metrics_path is None  # 不写文件即可，不抛异常


def test_train_zero_iterations_is_noop(config_2p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_2p, seed=1, metrics_path=None)
    trainer.train(iterations=0, workers=1, progress=False)
    assert trainer.iterations_done == 0
    assert trainer.regret_sum == {}


def test_knows_infoset(config_2p: GameConfig) -> None:
    trainer = MCCFRTrainer(config_2p, seed=31, metrics_path=None)
    trainer.train(iterations=10, workers=1, progress=False)
    trained_state = None
    for seed in range(200):
        state = GameState(config_2p, seed)
        if trainer.knows_infoset(state, state.decision_player()):
            trained_state = state
            break
    assert trained_state is not None, "训练过 10 轮后至少应命中一个信息集"


def test_regret_matching_falls_back_to_uniform(config_2p: GameConfig) -> None:
    """全 0 后悔值 → 均匀分布（regret matching 的标准行为）。"""
    trainer = MCCFRTrainer(config_2p, seed=1, metrics_path=None)
    state = GameState(config_2p, 5)
    legal = state.legal_actions()
    probs = trainer.average_strategy(state, state.decision_player())
    assert len(probs) == len(legal)
    assert all(p == pytest.approx(1.0 / len(legal)) for p in probs.values())

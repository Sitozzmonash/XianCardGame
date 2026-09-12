"""`training/parallel.py` 单元测试：顶层 Worker 函数、批量切分、真实并行训练。"""

from __future__ import annotations

import pickle

import pytest

from game import GameConfig
from training import MCCFRTrainer
from training.parallel import mccfr_worker, split_batch


def test_worker_is_module_level_and_picklable() -> None:
    """Windows spawn 需要 Worker 函数定义在模块顶层且可 pickle。"""
    assert mccfr_worker.__module__ == "training.parallel"
    assert mccfr_worker.__qualname__ == "mccfr_worker"
    blob = pickle.dumps(mccfr_worker)
    assert pickle.loads(blob) is mccfr_worker


def test_split_batch_even() -> None:
    assert split_batch(10, 2) == [5, 5]
    assert sum(split_batch(1000, 8)) == 1000
    assert all(share > 0 for share in split_batch(1000, 8))


def test_split_batch_remainder() -> None:
    shares = split_batch(10, 3)
    assert sorted(shares, reverse=True) == [4, 3, 3]
    assert sum(shares) == 10


def test_split_batch_rejects_zero_workers() -> None:
    with pytest.raises(ValueError):
        split_batch(10, 0)


def test_split_batch_more_workers_than_items() -> None:
    shares = split_batch(2, 8)
    assert shares == [1, 1]


def test_worker_returns_delta_and_strategy() -> None:
    config = GameConfig(num_players=2, seed=42)
    regret_delta, strategy_sum, traversals = mccfr_worker(
        config, seed=1, exploration=0.6, iterations=2, regret_snapshot={}
    )
    assert traversals == 4  # 2 iter * 2 players
    assert regret_delta, "Worker 应产生非空 regret 增量"
    assert strategy_sum, "Worker 应产生非空平均策略表"
    for key in regret_delta:
        assert isinstance(key, tuple)


def test_parallel_training_matches_sequential_scale() -> None:
    """workers=2 的并行路径能跑通，且计数正确。"""
    config = GameConfig(num_players=2, seed=42)
    trainer = MCCFRTrainer(config, seed=3, metrics_path=None)
    trainer.train(
        iterations=40,
        workers=2,
        sync_batch=20,
        checkpoint_every=0,
        log_every=1000,
        progress=False,
    )
    assert trainer.iterations_done == 40
    assert trainer.traversals_done == 40 * 2
    assert trainer.regret_sum
    # 并行路径只回传「净变化非零」的 regret 增量，因此 regret 表可能少于
    # strategy 表（strategy 表是 Worker 全量回传的）——这是参考实现的既定行为。
    assert len(trainer.strategy_sum) >= len(trainer.regret_sum)
    for key in trainer.regret_sum:
        assert isinstance(key, tuple)
    for key in trainer.strategy_sum:
        assert isinstance(key, tuple)


def test_parallel_training_emits_metrics(tmp_path) -> None:
    config = GameConfig(num_players=2, seed=42)
    metrics = tmp_path / "p.jsonl"
    trainer = MCCFRTrainer(config, seed=4, metrics_path=str(metrics))
    trainer.train(iterations=20, workers=2, sync_batch=10, log_every=10, progress=False)
    text = metrics.read_text(encoding="utf-8")
    assert "iterations_per_second" in text
    assert '"workers": 2' in text


def test_parallel_checkpoint(tmp_path) -> None:
    from pathlib import Path

    config = GameConfig(num_players=2, seed=42)
    trainer = MCCFRTrainer(config, seed=5, metrics_path=None)
    prefix = str(tmp_path / "pc")
    trainer.train(
        iterations=20,
        workers=2,
        sync_batch=10,
        checkpoint_every=20,
        checkpoint_prefix=prefix,
        log_every=10,
        progress=False,
    )
    assert Path(f"{prefix}_20.pkl").exists()

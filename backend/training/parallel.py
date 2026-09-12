"""并行 MCCFR 的 Worker 函数（spec §37-§38）。

**本模块的函数必须定义在模块顶层**：Windows 上用 `ProcessPoolExecutor` 走的是
`spawn` 启动方式，子进程需要能按 `module:qualname` 重新 pickle 出这个函数，
闭包 / 局部函数 / `__main__` 里的函数都会失败。

算法定位：*批量同步近似并行 MCCFR*。
主进程拿一份 `regret_sum` 快照分发给各 Worker，Worker 各自训练一小批 episode，
返回 `regret_delta` / `strategy_sum`，主进程合并。严格算法对照实验请用 `workers=1`。
"""

from __future__ import annotations

from typing import Mapping

from game import GameConfig

from ._table import diff_nested


def mccfr_worker(
    config: GameConfig,
    seed: int,
    exploration: float,
    iterations: int,
    regret_snapshot: Mapping,
) -> tuple[dict, dict, int]:
    """Worker 进程：基于 regret 快照训练 `iterations` 个 outer iteration。

    返回 `(regret_delta, strategy_sum, traversals)`：
    - `regret_delta` 是相对快照的净增量（只回传有变化的条目）；
    - `strategy_sum` 直接回传（主进程累加），与参考实现一致；
    - `traversals` = `iterations * num_players`（每个玩家各一次 update-player episode）。
    """
    # 延迟导入：避免 parallel <- trainer 的循环导入（trainer 顶层 import 本模块）。
    from .trainer import MCCFRTrainer

    worker = MCCFRTrainer(
        config, seed=seed, exploration=exploration, metrics_path=None
    )
    # 进程内独占快照，避免与主进程共享 dict 的锁竞争 / 写冲突。
    worker.regret_sum = {info: dict(row) for info, row in regret_snapshot.items()}
    worker.strategy_sum = {}
    worker.iterations_done = 0
    worker.traversals_done = 0

    worker.run_sequential(iterations, verbose=False, emit_metrics=False)

    regret_delta = diff_nested(worker.regret_sum, regret_snapshot)
    return regret_delta, worker.strategy_sum, worker.traversals_done


def split_batch(total: int, workers: int) -> list[int]:
    """把一个 sync batch 尽量均匀地分给 `workers` 个 Worker（去掉 0 份额）。"""
    if workers <= 0:
        raise ValueError("workers 必须 >= 1")
    base, extra = divmod(max(0, int(total)), int(workers))
    shares = [base + (1 if i < extra else 0) for i in range(workers)]
    return [share for share in shares if share > 0]


__all__ = ["mccfr_worker", "split_batch"]

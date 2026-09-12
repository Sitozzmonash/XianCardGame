"""模型格式 v2（§3.5）端到端测试：v1/v2 互读、`strategy_only` 推理、体积断言、CLI。

关键断言（§3.5 要求 5，逐条落到测试里）：

- 全量 v2（regret + strategy）≤ 30 MB、仅策略 ≤ 20 MB（真实 10K 模型）
- 每信息集 ≤ 60 B（全量）/ ≤ 45 B（仅策略）
- `load()` ≤ 5 s，round-trip 数值一致（float32 允许 1e-6 误差）
- `MCCFRAgent` 能直接用 `strategy_only` 模型推理，不报错、不每步回落
"""

from __future__ import annotations

import pickle
import subprocess
import sys
import time
from pathlib import Path

import pytest

import main as cli
from agents import MCCFRAgent, RandomAgent
from evaluation import play_game
from game import GameConfig, GameState
from training import MCCFRTrainer
from training import codec

#: 参考实现产出的 124MB 旧模型（只读，不进本仓库 git）
REFERENCE_MODEL = (
    Path(__file__).resolve().parents[2]
    / "reference"
    / "xiuxian_ai_demo"
    / "models"
    / "mccfr_2p_10k.pkl"
)

#: 验收指标（§3.5）
FULL_MB_LIMIT = 30.0
STRATEGY_ONLY_MB_LIMIT = 20.0
FULL_BYTES_PER_INFOSET = 60.0
STRATEGY_ONLY_BYTES_PER_INFOSET = 45.0
#: 载入预算必须按**用途**拆开（见 §3.5）：
#: - 懒加载 = 部署 / 首请求路径（服务启动、按需解码），硬指标 ≤ 5 s（实测 0.01~0.15 s）；
#: - 全量展开 = 训练 / 续训路径：433k 信息集 × 2 张表变成 Python dict（约 200 万个对象），
#:   干净子进程实测 1.9~2.8 s，这里按 §3.5 卡 10 s。
#: 注意：全量展开的墙钟时间与进程内存状态强相关（同一份仅策略模型：干净进程 1.9 s、
#: 进程里已展开过一张同样大的表时 8.8 s、再叠加 CPU 争用可达 36 s），因为要一次性建
#: 数百万个容器对象。所以本测试对机器负载敏感，压测/CI 建议**单独跑**。
LAZY_LOAD_SECONDS_LIMIT = 5.0
EAGER_LOAD_SECONDS_LIMIT = 10.0


# --------------------------------------------------------------------------- 工具


def train_small(iterations: int = 300, players: int = 2, seed: int = 5) -> MCCFRTrainer:
    trainer = MCCFRTrainer(
        GameConfig(num_players=players, max_decisions=120, seed=42),
        seed=seed,
        metrics_path=None,
    )
    trainer.train(iterations=iterations, workers=1, progress=False)
    return trainer


def assert_tables_close(a: dict, b: dict, rel: float = 1e-5) -> None:
    """float32 落盘后的逐项对比（相对误差 + 绝对误差双保险）。"""
    assert set(a) == set(b), "信息集集合不一致"
    for key, row in a.items():
        other = b[key]
        assert set(row) == set(other), f"动作集合不一致：{key}"
        for action, value in row.items():
            assert other[action] == pytest.approx(value, rel=rel, abs=1e-6), f"{key} / {action}"


def measure_load_seconds(path: Path, lazy: bool = False) -> float:
    """在**独立子进程**里测一次载入耗时。

    为什么不用进程内计时：本测试前面已经吃掉几 GB（124 MB 旧模型 + 迁移后的表），
    在那种堆状态下再展开 433k 信息集，GC 会把计时放大好几倍（实测 4.3 s → 35.8 s）。
    两条路径必须分别测：
    - `lazy=True`：部署 / 推理路径（服务启动、按需解码）；
    - `lazy=False`：训练 / 续训路径（展开成 `dict[tuple, dict[str, float]]`）。
    """
    backend = str(Path(__file__).resolve().parents[1])
    code = (
        "import sys, time\n"
        f"sys.path.insert(0, {backend!r})\n"
        "from training import MCCFRTrainer\n"
        "t0 = time.perf_counter()\n"
        f"trainer = MCCFRTrainer.load({str(path)!r}, lazy={bool(lazy)!r})\n"
        "elapsed = time.perf_counter() - t0\n"
        "assert trainer.infoset_count >= 0\n"
        "print(f'LOAD_SECONDS={elapsed:.3f}')\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=backend,
        timeout=600,
    )
    assert proc.returncode == 0, f"子进程测量失败（lazy={lazy}）：\n{proc.stderr[-2000:]}"
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith("LOAD_SECONDS="):
            return float(line.split("=", 1)[1])
    raise AssertionError(f"子进程没有输出计时：\n{proc.stdout[-1000:]}")


# --------------------------------------------------------------------------- v2 基本往返


def test_save_default_is_v2_and_roundtrips(tmp_path: Path) -> None:
    trainer = train_small(iterations=120)
    path = tmp_path / "m.pkl"
    trainer.save(str(path))

    with path.open("rb") as handle:
        raw = pickle.load(handle)
    assert raw["format_version"] == codec.FORMAT_VERSION
    assert raw["encoding"] == codec.ENCODING
    assert raw["strategy_only"] is False
    assert raw["n_infosets"] == trainer.infoset_count
    assert raw["n_strategy_entries"] == trainer.policy_size
    assert raw["n_entries"] == 2 * trainer.policy_size  # 后悔表 + 策略表
    assert isinstance(raw["key_blob"], bytes) and raw["key_blob"]
    assert isinstance(raw["regret_blob"], bytes) and raw["regret_blob"]
    assert raw["action_table"], "动作表不应为空"

    loaded = MCCFRTrainer.load(str(path))
    assert loaded.iterations_done == trainer.iterations_done
    assert loaded.traversals_done == trainer.traversals_done
    assert loaded.config.num_players == trainer.config.num_players
    assert loaded.exploration == trainer.exploration
    assert loaded.lazy is False
    assert_tables_close(trainer.regret_sum, loaded.regret_sum)
    assert_tables_close(trainer.strategy_sum, loaded.strategy_sum)


def test_v2_model_can_resume_training(tmp_path: Path) -> None:
    """读到 v2 后能继续训练（契约要求 2：续训）。"""
    trainer = train_small(iterations=60)
    path = tmp_path / "a.pkl"
    trainer.save(str(path))
    before_infosets = trainer.infoset_count

    resumed = MCCFRTrainer.load(str(path))
    assert resumed.iterations_done == 60
    resumed.metrics_path = None
    resumed.train(iterations=60, workers=1, progress=False)
    assert resumed.iterations_done == 120
    assert resumed.traversals_done == trainer.traversals_done + 120
    assert resumed.infoset_count >= before_infosets

    # 续训后仍然可以写回 v2，并且能被读回
    again = tmp_path / "b.pkl"
    resumed.save(str(again))
    reloaded = MCCFRTrainer.load(str(again))
    assert reloaded.iterations_done == 120
    assert_tables_close(resumed.strategy_sum, reloaded.strategy_sum)


def test_v1_and_v2_are_mutually_readable(tmp_path: Path) -> None:
    """v1（旧 plain dict）与 v2 互相可读，数值一致（§3.5 要求 2）。"""
    trainer = train_small(iterations=120)
    v1_path = tmp_path / "v1.pkl"
    v2_path = tmp_path / "v2.pkl"
    trainer.save(str(v1_path), format="v1")
    trainer.save(str(v2_path), format="v2")

    with v1_path.open("rb") as handle:
        raw_v1 = pickle.load(handle)
    assert raw_v1["format_version"] == 2  # 旧格式的版本号仍是 2（紧凑 tuple key）
    assert raw_v1["infoset_format"] == "compact-tuple-v2"
    assert isinstance(raw_v1["regret_sum"], dict) and raw_v1["regret_sum"]
    assert codec.is_v2_container(raw_v1) is False

    from_v1 = MCCFRTrainer.load(str(v1_path))
    from_v2 = MCCFRTrainer.load(str(v2_path))
    assert_tables_close(from_v1.strategy_sum, from_v2.strategy_sum)
    assert_tables_close(from_v1.regret_sum, from_v2.regret_sum)

    # v1 读入后再写 v2 也必须成功（不能因为 intern 过 key 就崩）
    round_trip = tmp_path / "from_v1_v2.pkl"
    from_v1.save(str(round_trip))
    assert codec.is_v2_container(pickle.loads(round_trip.read_bytes()))
    assert_tables_close(MCCFRTrainer.load(str(round_trip)).regret_sum, trainer.regret_sum)


def test_lazy_and_eager_agree(tmp_path: Path) -> None:
    """懒加载（不展开表）与展开版在查表/策略上必须一致。"""
    trainer = train_small(iterations=120)
    path = tmp_path / "m.pkl"
    trainer.save(str(path))

    eager = MCCFRTrainer.load(str(path))
    lazy = MCCFRTrainer.load(str(path), lazy=True)
    assert lazy.lazy is True
    assert lazy.regret_sum == {} and lazy.strategy_sum == {}
    assert lazy.infoset_count == eager.infoset_count

    for key in list(eager.strategy_sum)[:200]:
        assert lazy.knows_key(key) is True
    assert lazy.knows_key((0, 0, 0, 0, 0, 999, (0,) * 8, (), (), (5, 6), 3, (0,) * 8, (-1, -1))) is False

    config = GameConfig(num_players=2, max_decisions=120, seed=42)
    state = GameState(config, 11)
    while not state.is_terminal():
        player = state.decision_player()
        assert eager.average_strategy(state, player) == pytest.approx(
            lazy.average_strategy(state, player), abs=1e-6
        )
        state.step(state.legal_actions()[0])


# --------------------------------------------------------------------------- strategy_only


def test_strategy_only_agent_inference(tmp_path: Path) -> None:
    """`strategy_only` 模型（部署产物）：`MCCFRAgent` 直接用，命中率 > 0。"""
    trainer = train_small(iterations=400)
    full_path = tmp_path / "full.pkl"
    only_path = tmp_path / "only.pkl"
    trainer.save(str(full_path))
    trainer.save(str(only_path), strategy_only=True)

    with only_path.open("rb") as handle:
        raw = pickle.load(handle)
    assert raw["strategy_only"] is True
    assert raw["regret_blob"] == b""
    assert only_path.stat().st_size < full_path.stat().st_size

    loaded = MCCFRTrainer.load(str(only_path))
    assert loaded.regret_sum == {}
    assert set(loaded.strategy_sum) == set(trainer.strategy_sum)

    # 平均策略归一化后必须与全量模型逐项一致（regret 只在兜底时才用到）
    config = GameConfig(num_players=2, max_decisions=120, seed=42)
    state = GameState(config, 33)
    while not state.is_terminal():
        player = state.decision_player()
        assert loaded.average_strategy(state, player) == pytest.approx(
            trainer.average_strategy(state, player), abs=1e-6
        )
        state.step(state.legal_actions()[0])

    # MCCFRAgent.load 对 strategy_only 模型走懒加载（不展开整表）
    agent = MCCFRAgent.load(str(only_path), seed=3)
    assert agent.trainer.lazy is True
    for game_seed in (7, 11, 13, 17, 19):
        result = play_game(config, [agent, RandomAgent(game_seed)], seed=game_seed)
        assert result.state.is_terminal()
    stats = agent.stats()
    assert stats["decisions"] > 0
    # 400 iter 的模型只覆盖早期信息集，深局命中率天然偏低，所以多打几局看总量
    assert stats["hit"] > 0, "至少应命中一些已训练信息集"
    assert stats["hit"] + stats["fallback"] == stats["decisions"]


def test_strategy_only_materializes_regret_fallback(tmp_path: Path) -> None:
    """平均策略权重全 0 的信息集必须写成「按后悔值归一化」的退路策略。

    否则部署产物没有后悔表可回退，会退化成均匀随机，与全量模型行为不一致。
    """
    trainer = train_small(iterations=30)
    key = next(iter(trainer.regret_sum))
    actions = sorted(trainer.regret_sum[key])
    assert len(actions) >= 2, "需要至少两个动作才能断言「不是均匀」"
    trainer.strategy_sum[key] = {action: 0.0 for action in actions}
    regret_row = {action: float(index + 1) for index, action in enumerate(actions)}
    trainer.regret_sum[key] = regret_row

    path = tmp_path / "only.pkl"
    trainer.save(str(path), strategy_only=True)
    loaded = MCCFRTrainer.load(str(path))
    row = loaded.strategy_sum[key]
    assert sum(row.values()) == pytest.approx(1.0)
    total = sum(regret_row.values())
    assert row == pytest.approx({action: value / total for action, value in regret_row.items()})
    assert row != pytest.approx({action: 1.0 / len(actions) for action in actions})


def test_strategy_only_cannot_resume(tmp_path: Path) -> None:
    """仅策略模型没有后悔表，CLI 续训时必须给出中文提示而不是静默重训。"""
    trainer = train_small(iterations=30)
    path = tmp_path / "only.pkl"
    trainer.save(str(path), strategy_only=True)
    code = cli.main(["train", "--players", "2", "--iterations", "3", "--resume", str(path), "--quiet"])
    assert code == 2  # CliError 的退出码


# --------------------------------------------------------------------------- 体积


def test_size_budget_per_infoset_small_model(tmp_path: Path) -> None:
    """小模型上的体积口径（与 10K 模型同构：2.7 条目/信息集）。"""
    trainer = train_small(iterations=400)
    full_path = tmp_path / "full.pkl"
    only_path = tmp_path / "only.pkl"
    v1_path = tmp_path / "v1.pkl"
    trainer.save(str(full_path))
    trainer.save(str(only_path), strategy_only=True)
    trainer.save(str(v1_path), format="v1")

    n_infosets = trainer.infoset_count
    assert n_infosets > 5_000, "样本太小，体积口径没有意义"
    full_per = full_path.stat().st_size / n_infosets
    only_per = only_path.stat().st_size / n_infosets
    v1_per = v1_path.stat().st_size / n_infosets

    assert only_path.stat().st_size < full_path.stat().st_size
    assert full_path.stat().st_size * 1.8 < v1_path.stat().st_size, (
        f"v2 应显著小于 v1（>1.8x）：v2={full_path.stat().st_size:,} v1={v1_path.stat().st_size:,}"
    )
    assert full_per <= FULL_BYTES_PER_INFOSET, f"全量 {full_per:.1f} B/信息集 超预算"
    assert only_per <= STRATEGY_ONLY_BYTES_PER_INFOSET, f"仅策略 {only_per:.1f} B/信息集 超预算"
    assert v1_per > full_per  # v1 作为对照确实更大


# --------------------------------------------------------------------------- CLI


def test_cli_models_lists_metadata(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """`main.py models` 必须打印每个模型的格式 / 体积 / 能否加载。"""
    trainer = train_small(iterations=30)
    trainer.save(str(tmp_path / "v2.pkl"))
    trainer.save(str(tmp_path / "only.pkl"), strategy_only=True)
    trainer.save(str(tmp_path / "v1.pkl"), format="v1")

    assert cli.main(["models", "--dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "packed-v2" in out and "v2 紧凑二进制" in out
    assert "仅策略" in out and "全量" in out
    assert "可加载" in out
    assert "v1.pkl" in out and "only.pkl" in out and "v2.pkl" in out

    # 空目录 / 不存在目录也要给中文提示而不是崩
    empty = tmp_path / "empty"
    empty.mkdir()
    assert cli.main(["models", "--dir", str(empty)]) == 0
    assert "没有任何模型文件" in capsys.readouterr().out
    assert cli.main(["models", "--dir", str(tmp_path / "nope")]) == 0
    assert "模型目录不存在" in capsys.readouterr().out


def test_cli_train_strategy_only_and_format_v1(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    out_v1 = tmp_path / "v1.pkl"
    out_only = tmp_path / "only.pkl"
    base = ["train", "--players", "2", "--iterations", "5", "--seed", "3", "--quiet"]

    assert cli.main([*base, "--out", str(out_v1), "--format", "v1"]) == 0
    assert codec.is_v2_container(pickle.loads(out_v1.read_bytes())) is False

    assert cli.main([*base, "--out", str(out_only), "--strategy-only"]) == 0
    raw = pickle.loads(out_only.read_bytes())
    assert raw["strategy_only"] is True and raw["regret_blob"] == b""

    with pytest.raises(SystemExit):  # argparse 直接拒绝非法格式
        cli.main([*base, "--out", str(tmp_path / "bad.pkl"), "--format", "v9"])


# --------------------------------------------------------------------------- 真实 10K 模型


@pytest.mark.skipif(not REFERENCE_MODEL.exists(), reason="参考实现 124MB 旧模型不存在（跳过）")
def test_real_10k_model_meets_size_and_load_budget(tmp_path: Path) -> None:
    """**验收指标**（§3.5 要求 5，真实 433,819 信息集 / 1,177,036 条目）：

    - 全量 v2 ≤ 30 MB、仅策略 ≤ 20 MB；
    - 每信息集 ≤ 60 B（全量）/ ≤ 45 B（仅策略）；
    - 载入按用途分开：懒加载（部署/首请求路径）≤ 5 s、全量展开（训练/续训路径）≤ 10 s；
    - round-trip 数值一致；`infoset_count`（推理覆盖）与 `regret_infoset_count` 分别断言
      —— 旧格式模型两者本来就**不等**（regret 169,634 / strategy 433,870）。
    """
    trainer = MCCFRTrainer.load(str(REFERENCE_MODEL))
    # 参考模型是「旧格式」形态：**regret 表只覆盖 169,634 个信息集，策略表覆盖 433,870 个**
    # （traverser 只在自己当 update-player 时写 regret，策略表覆盖所有被访问到的信息集）。
    # 两个口径不等是正常现象，不是缺陷 —— 所以分开断言，别拿一个数字套两边。
    n_infosets = trainer.strategy_infoset_count  # 推理覆盖口径（MCCFRAgent 实际能查到的）
    regret_infosets = trainer.regret_infoset_count  # regret 表口径
    assert n_infosets > 400_000, f"推理覆盖信息集数异常：{n_infosets:,}"
    assert trainer.infoset_count == n_infosets, "infoset_count 必须是「推理覆盖」口径"
    assert regret_infosets < n_infosets, "旧格式模型的两个口径本应不等"
    assert trainer.policy_size > 500_000, f"条目数异常：{trainer.policy_size:,}"

    full_path = tmp_path / "ref_full.pkl"
    only_path = tmp_path / "ref_only.pkl"
    trainer.save(str(full_path))
    trainer.save(str(only_path), strategy_only=True)

    with full_path.open("rb") as handle:
        container = pickle.load(handle)
    assert container["n_infosets"] == n_infosets
    n_infosets = container["n_infosets"]

    full_mb = full_path.stat().st_size / 1024 / 1024
    only_mb = only_path.stat().st_size / 1024 / 1024
    full_per = full_path.stat().st_size / n_infosets
    only_per = only_path.stat().st_size / n_infosets
    print(
        f"\n[v2 实测] 全量 {full_mb:.2f} MB（{full_per:.1f} B/信息集）| "
        f"仅策略 {only_mb:.2f} MB（{only_per:.1f} B/信息集）| 信息集 {n_infosets:,} | "
        f"条目 {trainer.policy_size:,}"
    )

    assert full_mb <= FULL_MB_LIMIT, f"全量 {full_mb:.2f} MB > {FULL_MB_LIMIT} MB"
    assert only_mb <= STRATEGY_ONLY_MB_LIMIT, f"仅策略 {only_mb:.2f} MB > {STRATEGY_ONLY_MB_LIMIT} MB"
    assert full_per <= FULL_BYTES_PER_INFOSET, f"全量 {full_per:.1f} B/信息集 > {FULL_BYTES_PER_INFOSET}"
    assert only_per <= STRATEGY_ONLY_BYTES_PER_INFOSET, (
        f"仅策略 {only_per:.1f} B/信息集 > {STRATEGY_ONLY_BYTES_PER_INFOSET}"
    )

    started = time.perf_counter()
    loaded = MCCFRTrainer.load(str(full_path))
    full_load_seconds = time.perf_counter() - started
    started = time.perf_counter()
    lazy = MCCFRTrainer.load(str(only_path), lazy=True)
    lazy_load_seconds = time.perf_counter() - started
    # 上面这两次是**同进程**计时（此时本进程已吃过几 GB，GC/分配压力会明显拖慢），
    # 真正要签字的指标在干净子进程里各测一遍（本地 SSD，见 §3.5）。
    # 注意：本测试对机器负载敏感（并发打包/前端 dev server 会明显放大数字），CI 上建议单独跑。
    clean_full = measure_load_seconds(full_path)
    clean_lazy = measure_load_seconds(only_path, lazy=True)
    print(
        f"[v2 实测] 载入：同进程 全量 {full_load_seconds:.2f}s / 懒加载 {lazy_load_seconds:.2f}s；"
        f"干净子进程 全量（训练/续训路径）{clean_full:.2f}s / 懒加载（部署/推理路径）{clean_lazy:.2f}s"
    )
    # 两条路径分开断言，失败信息里点名是哪条路径超时
    assert clean_lazy <= LAZY_LOAD_SECONDS_LIMIT, (
        f"[部署/推理路径] 懒加载载入 {clean_lazy:.2f}s > {LAZY_LOAD_SECONDS_LIMIT}s"
    )
    assert clean_full <= EAGER_LOAD_SECONDS_LIMIT, (
        f"[训练/续训路径] 全量展开载入 {clean_full:.2f}s > {EAGER_LOAD_SECONDS_LIMIT}s"
    )
    assert loaded.infoset_count == n_infosets
    assert loaded.strategy_infoset_count == n_infosets
    # regret 表口径**原样保留**（169,634）：v2 把缺失的行写成 `n = 0`，载入时视为
    # 「该信息集不在这张表里」，所以旧模型的不对称性不会被悄悄抹平。
    assert loaded.regret_infoset_count == regret_infosets
    assert lazy.lazy is True and lazy.infoset_count == n_infosets
    assert lazy.strategy_infoset_count == n_infosets
    assert lazy.regret_infoset_count == 0, "仅策略产物没有 regret 表"

    # round-trip：抽样对比（全表 117 万条逐个比会拖慢整套测试）
    keys = list(trainer.strategy_sum)
    for key in keys[::877]:
        assert_tables_close(
            {key: trainer.strategy_sum[key]},
            {key: loaded.strategy_sum[key]},
            rel=1e-4,
        )
        assert lazy.knows_key(key) is True

    # 懒加载推理：和展开版给出的策略一致
    config = GameConfig(num_players=2, max_decisions=60, seed=42)
    state = GameState(config, 2026)
    while not state.is_terminal():
        player = state.decision_player()
        assert lazy.average_strategy(state, player) == pytest.approx(
            loaded.average_strategy(state, player), abs=1e-6
        )
        state.step(state.legal_actions()[0])

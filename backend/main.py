"""修仙卡牌 CLI 入口（冻结契约 `docs/INTERFACES.md` §3.4）。

子命令：

```bash
python main.py demo   [--players 3] [--simulations 200] [--seed 42] [--agents rule ismcts:200 random]
python main.py train  [--config configs/train_2p.yaml] | [--players 2 --iterations 100000 --workers 8
                       --sync-batch 1000 --exploration 0.6 --checkpoint-every 10000 --out models/x.pkl]
                      [--resume models/x.pkl] [--format {v2,v1}] [--strategy-only]
python main.py models [--dir models] [--json]          # 模型元信息 / 体积 / 格式 / 能否加载
python main.py battle --players 2 --agents mccfr:models/a.pkl ismcts:500 --games 5000 [--seed 42]
python main.py benchmark --agents rule ismcts:100 ismcts:500 --opponent random --games 500
python main.py play   [--players 3] [--seed 42]
python main.py serve  [--host 0.0.0.0] [--port 8000] [--reload]
```

`train` 同时支持 YAML 与纯 CLI：**CLI 参数优先级高于 YAML**（用 `argparse.SUPPRESS` 判断
哪些参数是用户显式给的）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

from agents import BaseAgent, parse_agent
from evaluation import (
    format_mccfr_coverage,
    format_table,
    format_tournament,
    play_game,
    run_tournament,
)
from game import Action, GameConfig, GameState
from training import (
    DEFAULT_METRICS_PATH,
    MCCFRTrainer,
    checkpoint_prefix_for,
    load_train_config,
    normalize_train_config,
)
from training.codec import inspect_model, peek_model_header
from training.trainer import peek_model_players

#: Agent 数量与玩家数量不匹配时的统一提示
AGENT_COUNT_HINT = "必须满足：--agents 数量 == --players（spec §43）"


# --------------------------------------------------------------------------- 公共工具


def build_game_config(
    players: int,
    seed: int,
    initial_hand: int = 5,
    max_actions: int = 2,
    max_decisions: int = 500,
) -> GameConfig:
    """按 CLI 参数构造 `GameConfig`（会走 `GameConfig.validate()`）。"""
    return GameConfig(
        num_players=int(players),
        initial_hand=int(initial_hand),
        max_actions_per_turn=int(max_actions),
        max_decisions=int(max_decisions),
        seed=int(seed),
    )


def parse_agent_specs(specs: Sequence[str], base_seed: int) -> list[BaseAgent]:
    """按 spec 列表构造 Agent（每个座位一个独立 seed）。"""
    return [parse_agent(str(spec), base_seed + index + 1) for index, spec in enumerate(specs)]


def dump_json(payload: Any) -> None:
    """`--json` 时输出机器可读结果。"""
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


# --------------------------------------------------------------------------- 参数校验


class CliError(Exception):
    """命令行输入错误（模型/配置缺失等）：打印中文提示并以退出码 2 结束，**不打 traceback**。"""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise CliError(message)


#: 默认模型目录（相对 backend/）
DEFAULT_MODEL_DIR = "models"


def list_available_models(model_dir: str = DEFAULT_MODEL_DIR) -> list[str]:
    """列出可用模型：`文件名（体积）`，若能读到 `index.json` 元信息则一并显示。

    只做「文件名 + 体积」，不去 unpickle 大模型（读一个 60MB 模型要好几秒，
    而这里只是给用户看的提示）。`models/index.json`（C4 维护）存在时会补上
    玩家数 / 迭代数等元信息。
    """
    directory = Path(model_dir)
    if not directory.exists():
        return []

    meta: dict[str, dict] = {}
    index_file = directory / "index.json"
    if index_file.exists():
        try:
            raw = json.loads(index_file.read_text(encoding="utf-8"))
            entries = raw.get("models") if isinstance(raw, dict) else raw
            for item in entries or []:
                if not isinstance(item, dict):
                    continue
                # 兼容两种写法：`{"file": "x.pkl"}`（手工清单）与
                # `{"id": "x", "path": "models/x.pkl"}`（`main.py models --write-index` 生成）
                keys = [item.get("file"), item.get("id")]
                path_text = str(item.get("path") or "")
                if path_text:
                    keys.extend([Path(path_text).name, Path(path_text).stem])
                for key in keys:
                    if key:
                        meta.setdefault(str(key), item)
        except (OSError, ValueError):
            meta = {}

    out: list[str] = []
    for path in sorted(directory.glob("*.pkl")):
        size_mb = path.stat().st_size / (1024 * 1024)
        detail = f"{size_mb:.1f} MB"
        item = meta.get(path.name) or meta.get(path.stem)
        if item:
            players = item.get("players") or item.get("num_players")
            iterations = item.get("iterations") or item.get("iterations_done")
            parts = []
            if players:
                parts.append(f"{players} 人")
            if iterations:
                parts.append(f"{int(iterations):,} 迭代")
            if parts:
                detail = f"{' / '.join(parts)} / {size_mb:.1f} MB"
        out.append(f"{model_dir}/{path.name}（{detail}）")
    return out


class _MissingModelError(CliError):
    """`mccfr:<path>` 指向的模型文件不存在。"""


def model_path_from_spec(spec: Any) -> Optional[str]:
    """从 `mccfr:<path>` spec 里取出模型路径；不是 mccfr spec 时返回 None。"""
    if not isinstance(spec, str):
        return None
    text = spec.strip()
    if not text.lower().startswith("mccfr"):
        return None
    parts = text.split(":", 1)
    if len(parts) < 2 or not parts[1].strip():
        return ""
    return parts[1].strip()


def validate_agent_specs(specs: Sequence[Any], model_dir: str = DEFAULT_MODEL_DIR) -> None:
    """提前校验所有 `mccfr:<path>` 的模型文件是否存在。

    用户写错路径时应当看到中文提示 + 可用模型列表，而不是一长串 Python traceback。
    """
    missing: list[str] = []
    for spec in specs:
        path = model_path_from_spec(spec)
        if path is None:
            continue
        if not path:
            raise CliError(
                "mccfr 需要模型路径，例如 --agents mccfr:models/mccfr_2p_10k.pkl"
            )
        if not Path(path).exists():
            missing.append(path)
    if missing:
        raise _MissingModelError(_missing_model_message(missing[0], model_dir))


def _missing_model_message(
    path: str,
    model_dir: str = DEFAULT_MODEL_DIR,
    what: str = " MCCFR 模型",  # 前导空格是为了拼出「找不到 MCCFR 模型：」
    train_hint: Optional[str] = None,
) -> str:
    """模型缺失时的中文提示（含可用模型列表与训练命令）。"""
    lines = [f"找不到{what}：{path}", "       可用模型（models/ 下）："]
    available = list_available_models(model_dir)
    if available:
        lines.extend(f"         - {item}" for item in available)
    else:
        lines.append("         （models/ 下没有任何 .pkl 模型）")
    lines.append(
        train_hint
        or f"       先训练一个：python main.py train --players 2 --iterations 10000 --out {path}"
    )
    return "\n".join(lines)


def _available_configs(config_dir: str = "configs") -> list[str]:
    """列出 `configs/` 下的 YAML（给「配置缺失」提示用）。"""
    directory = Path(config_dir)
    if not directory.exists():
        return []
    return sorted(path.name for path in directory.glob("*.yaml"))


# --------------------------------------------------------------------------- demo


def default_demo_specs(players: int, simulations: int) -> list[str]:
    """demo 的默认对阵：规则 AI / ISMCTS / 随机 AI，按需要循环补齐到 N 个座位。"""
    base = ["rule", f"ismcts:{int(simulations)}", "random"]
    return [base[index % len(base)] for index in range(int(players))]


def cmd_demo(args: argparse.Namespace) -> int:
    specs = list(args.agents) if args.agents else default_demo_specs(args.players, args.simulations)
    _require(
        len(specs) == args.players,
        f"--agents 数量（{len(specs)}）与 --players（{args.players}）不一致；{AGENT_COUNT_HINT}",
    )
    validate_agent_specs(specs)
    config = build_game_config(args.players, args.seed)
    agents = parse_agent_specs(specs, args.seed)

    print("=== 修仙卡牌 AI Demo ===")
    print(f"玩家数：{args.players} | seed：{args.seed}")
    print(f"对阵：{' vs '.join(specs)}")
    print("-" * 60)

    result = play_game(config, agents, args.seed, verbose=True)
    print("-" * 60)
    print(
        f"对局结束：{'平局' if result.is_draw else f'P{result.winner_seat} 胜'}"
        f" | 决策步数：{result.decisions} | 触发上限：{result.forced_stop}"
    )
    return 0


# --------------------------------------------------------------------------- train


def _train_cli_overrides(args: argparse.Namespace) -> dict[str, dict]:
    """把用户显式给出的 CLI 参数整理成三段式覆盖 dict（未给出的键不出现在这里）。"""
    provided = {key: value for key, value in vars(args).items() if key != "func"}
    game: dict[str, Any] = {}
    training: dict[str, Any] = {}
    output: dict[str, Any] = {}

    if "players" in provided:
        game["players"] = int(provided["players"])
    if "initial_hand" in provided:
        game["initial_hand"] = int(provided["initial_hand"])
    if "max_actions" in provided:
        game["max_actions_per_turn"] = int(provided["max_actions"])
    if "max_decisions" in provided:
        game["max_decisions"] = int(provided["max_decisions"])
    if "seed" in provided:
        game["seed"] = int(provided["seed"])

    if "iterations" in provided:
        training["iterations"] = int(provided["iterations"])
    if "workers" in provided:
        training["workers"] = int(provided["workers"])
    if "sync_batch" in provided:
        training["sync_batch"] = int(provided["sync_batch"])
    if "checkpoint_every" in provided:
        training["checkpoint_every"] = int(provided["checkpoint_every"])
    if "exploration" in provided:
        training["exploration"] = float(provided["exploration"])
    if "log_every" in provided:
        training["log_every"] = int(provided["log_every"])
    if "metrics" in provided:
        training["metrics_path"] = provided["metrics"]

    if "out" in provided:
        output["out"] = provided["out"]
    if "checkpoint_prefix" in provided:
        output["checkpoint_prefix"] = provided["checkpoint_prefix"]

    overrides: dict[str, dict] = {}
    if game:
        overrides["game"] = game
    if training:
        overrides["training"] = training
    if output:
        overrides["output"] = output
    return overrides


def _merge_train_config(base: dict, overrides: dict[str, dict]) -> dict:
    """三段式深合并（CLI 覆盖 YAML），再跑一遍校验补齐。"""
    merged = {section: dict(base.get(section) or {}) for section in ("game", "training", "output")}
    for section, values in overrides.items():
        merged[section].update(values)
    return normalize_train_config(merged, source=base.get("source", "<cli>"))


def cmd_train(args: argparse.Namespace) -> int:
    config_path = getattr(args, "config", None)
    if config_path:
        try:
            base = load_train_config(config_path)
        except FileNotFoundError as exc:
            raise CliError(
                f"找不到训练配置：{config_path}\n"
                f"       可用配置（configs/ 下）：{'、'.join(_available_configs()) or '（无）'}\n"
                f"       也可以完全不用 YAML，直接给 CLI 参数：\n"
                f"       python main.py train --players 2 --iterations 10000 --out models/mccfr_2p.pkl"
            ) from exc
    else:
        base = normalize_train_config({})
    config = _merge_train_config(base, _train_cli_overrides(args))

    game_cfg_kwargs = dict(config["game"])
    game_cfg_kwargs["num_players"] = int(game_cfg_kwargs.pop("players", 3))
    config_obj = GameConfig(**game_cfg_kwargs)
    config_obj.validate()

    training = config["training"]
    output = config["output"]
    out_path = str(output["out"])
    # 指标默认写到 backend/logs/train_metrics.jsonl（spec §56 要求「同时保存机器可读」）。
    metrics_path = training.get("metrics_path") or DEFAULT_METRICS_PATH
    resume_path = getattr(args, "resume", None)
    quiet = bool(getattr(args, "quiet", False))
    explicit_players = "players" in vars(args)
    # §3.5：默认写 v2 紧凑二进制；`--strategy-only` 只写平均策略（部署产物）。
    strategy_only = bool(getattr(args, "strategy_only", False))
    out_format = str(getattr(args, "format", "v2") or "v2").lower()

    # ---------------------------------------------------------------- 载入 / 新建
    if resume_path:
        if not Path(resume_path).exists():
            raise _MissingModelError(
                _missing_model_message(
                    resume_path,
                    what="续训模型",
                    train_hint="       先训练一个：python main.py train --players 2 "
                    "--iterations 10000 --out models/mccfr_2p.pkl",
                )
            )
        trainer = MCCFRTrainer.load(resume_path)
        # 没显式给 --players 时以模型自带的玩家数为准（续训最常见的用法）。
        if explicit_players and trainer.config.num_players != config_obj.num_players:
            raise CliError(
                f"续训模型的玩家数（{trainer.config.num_players}）与本次配置"
                f"（{config_obj.num_players}）不一致，请改用 --players {trainer.config.num_players}。"
            )
        if not trainer.regret_sum and trainer.strategy_sum:
            raise CliError(
                f"{resume_path} 是「仅策略」（strategy_only）部署产物，没有后悔表，无法续训。\n"
                "       请用全量模型续训，或重新训练：python main.py train --players 2 --iterations 10000 "
                "--out models/mccfr_2p.pkl"
            )
        if trainer.migrated_keys:
            print(
                f"[MCCFR] 检测到旧格式模型（字符串 key）：已无损迁移 "
                f"{trainer.migrated_keys:,} 条信息集（失败 {trainer.unmigrated_keys} 条）。"
            )
        # 续训时以模型自带的 config 为准，避免规则参数被 YAML 悄悄改掉。
        config_obj = trainer.config
        trainer.exploration = float(training["exploration"])
        trainer.seed = int(config["game"]["seed"])
        print(
            f"[MCCFR] 已载入模型：{resume_path} | 已有迭代={trainer.iterations_done:,} | "
            f"信息集={len(trainer.regret_sum):,}"
        )
    else:
        trainer = MCCFRTrainer(
            config_obj,
            seed=int(config["game"]["seed"]),
            exploration=float(training["exploration"]),
            metrics_path=metrics_path,
        )
    if metrics_path:
        trainer.metrics_path = str(metrics_path)
    else:
        trainer.metrics_path = None

    checkpoint_every = int(training["checkpoint_every"])
    checkpoint_prefix = output.get("checkpoint_prefix") or (
        checkpoint_prefix_for(out_path) if checkpoint_every > 0 else None
    )

    # ---------------------------------------------------------------- 打印训练计划
    if not quiet:
        print("[MCCFR] === 训练计划 ===")
        print(f"[MCCFR] 配置来源: {config.get('source')}")
        print(
            f"[MCCFR] 玩家数: {config_obj.num_players} | Iterations: {int(training['iterations']):,} | "
            f"Workers: {int(training['workers'])} | SyncBatch: {int(training['sync_batch']):,}"
        )
        print(
            f"[MCCFR] 探索率: {float(training['exploration'])} | "
            f"CheckpointEvery: {checkpoint_every:,} | LogEvery: {int(training['log_every']):,}"
        )
        print(f"[MCCFR] 输出: {out_path}")
        print(f"[MCCFR] 模型格式: {out_format}{'（仅策略，部署产物）' if strategy_only else '（全量：regret + strategy）'}")
        print(f"[MCCFR] 指标: {trainer.metrics_path or '（关闭）'}")

    trainer.train(
        iterations=int(training["iterations"]),
        workers=int(training["workers"]),
        sync_batch=int(training["sync_batch"]),
        checkpoint_every=checkpoint_every,
        checkpoint_prefix=checkpoint_prefix,
        log_every=int(training["log_every"]),
        progress=not quiet,
    )

    trainer.save(out_path, strategy_only=strategy_only, format=out_format)
    size_mb = Path(out_path).stat().st_size / (1024 * 1024)
    n_infosets = max(1, trainer.infoset_count)
    per_infoset = Path(out_path).stat().st_size / n_infosets
    print(
        f"[MCCFR] 训练完成：{out_path}（{size_mb:.2f} MB，格式 {out_format}"
        f"{'，仅策略（部署产物）' if strategy_only else ''}，"
        f"每信息集 {per_infoset:.1f} B / {trainer.infoset_count:,} 信息集）"
    )
    print(trainer.report())
    return 0


# --------------------------------------------------------------------------- models

#: `models` 子命令里**完整加载**（展开成 dict）的体积上限
MAX_VERIFY_BYTES = 32 * 1024 * 1024
#: 超过上面的上限但不超过这里的，改用**懒加载**验证（结构可读、不展开整表）
MAX_LAZY_VERIFY_BYTES = 256 * 1024 * 1024


def _format_label(info: dict) -> str:
    """把模型元信息渲染成中文格式标签。"""
    version = info.get("format_version")
    if version == 2:
        label = "v2 紧凑二进制"
    elif version == 1:
        label = "v1 dict（紧凑 tuple key）"
    else:
        label = "未知格式"
    if info.get("encoding") and info["encoding"] != "legacy-dict":
        label = f"{label} / {info['encoding']}"
    return label


def humanize_model_name(filename: str) -> str:
    """`mccfr_6p_20k.pkl` -> `MCCFR 6P 20K`（`index.json` 里给人看的名字）。"""
    stem = Path(filename).stem
    parts = [part for part in re.split(r"[_\-\s]+", stem) if part]
    return " ".join(part.upper() for part in parts) or stem.upper()


def build_model_index(model_dir: str, files: Sequence[Path]) -> list[dict]:
    """扫描模型文件，生成 `models/index.json` 的条目（schema 见 `models/README.md`）。

    字段与 `app/services/model_registry.py::ModelEntry` 对齐：
    `id / name / path / players / iterations / created_at / note`；拿不到的字段**省略**
    （不写 null，前端按「未知」处理）。元信息走**只读文件头**的快速路径
    （`peek_model_header`），不为了写清单把几十 MB 的模型完整加载一遍。
    """
    directory = str(model_dir).replace("\\", "/").rstrip("/")
    entries: list[dict] = []
    for path in files:
        header = peek_model_header(str(path))
        config = header.get("config") or {}
        players = config.get("num_players") or config.get("players")
        iterations = header.get("iterations_done")

        entry: dict = {
            "id": path.stem,
            "name": humanize_model_name(path.name),
            "path": f"{directory}/{path.name}" if directory else path.name,
        }
        note_parts: list[str] = []
        if players:
            entry["players"] = int(players)
            note_parts.append(f"{int(players)} 人")
        if iterations:
            entry["iterations"] = int(iterations)
            note_parts.append(f"{int(iterations):,} 迭代")
        if header.get("encoding") == "packed-v2":
            note_parts.append("v2 紧凑二进制")
        elif header.get("format_version"):
            note_parts.append(f"v{int(header['format_version'])}")
        note_parts.append(
            "仅策略（部署产物，不能续训）"
            if header.get("strategy_only")
            else "全量（regret + strategy，可续训）"
        )
        if not header.get("config"):
            note_parts.append(str(header.get("note") or "元信息读取失败"))
        try:
            entry["created_at"] = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")
        except OSError:  # pragma: no cover - 文件刚被删掉
            pass
        entry["note"] = " / ".join(note_parts)
        entries.append(entry)
    entries.sort(key=lambda item: str(item["id"]))  # 稳定排序 ⇒ 写入幂等
    return entries


def write_model_index(model_dir: str, entries: Sequence[dict]) -> tuple[Path, bool]:
    """写 `index.json`，返回 `(路径, 是否改动)`。

    内容没变就不重写文件（幂等：同目录跑两次字节完全一致，也不会因为 mtime 抖动
    让 `ModelRegistry` 的 mtime 缓存失效）。
    """
    directory = Path(model_dir)
    directory.mkdir(parents=True, exist_ok=True)
    index_path = directory / "index.json"
    text = json.dumps({"models": list(entries)}, ensure_ascii=False, indent=2) + "\n"
    previous = index_path.read_text(encoding="utf-8") if index_path.exists() else None
    if previous == text:
        return index_path, False
    index_path.write_text(text, encoding="utf-8")
    return index_path, True


def cmd_models(args: argparse.Namespace) -> int:
    """`main.py models`：列出 `models/` 下每个模型的元信息、体积、格式、能否加载（§3.5）。

    `--write-index` 时顺带把元信息写成 `models/index.json`（默认只读列出，不碰文件）。
    """
    model_dir = str(getattr(args, "dir", None) or DEFAULT_MODEL_DIR)
    directory = Path(model_dir)
    if not directory.exists():
        print(f"模型目录不存在：{model_dir}")
        print("       先训练一个：python main.py train --players 2 --iterations 10000 --out models/mccfr_2p.pkl")
        return 0

    files = sorted({*directory.glob("*.pkl"), *directory.glob("*.bin")})
    write_index = bool(getattr(args, "write_index", False))
    entries: list[dict] = []
    if not files:
        print(f"模型目录 {model_dir}/ 下没有任何模型文件（*.pkl）。")
        print("       先训练一个：python main.py train --players 2 --iterations 10000 --out models/mccfr_2p.pkl")
        if write_index:
            index_path, changed = write_model_index(model_dir, [])
            print(f"       {'已写入' if changed else '已是最新'}空清单：{index_path}")
            if args.json:
                dump_json([])
        return 0

    rows: list[list[str]] = []
    payload: list[dict] = []
    for path in files:
        info = inspect_model(str(path))
        loadable = "未校验"
        note = str(info.get("note") or "")
        load_seconds = None
        # 「能否加载」分级验证，避免一条 CLI 命令把几 GB 内存吃满：
        #   ≤32 MB  → 完整加载（真的展开成 dict，最能说明问题）
        #   ≤256 MB → 懒加载（验证容器结构可读，不展开整表）
        #   更大     → 只报头部元信息
        if info["size_bytes"] <= MAX_VERIFY_BYTES:
            started = time.time()
            try:
                trainer = MCCFRTrainer.load(str(path), lazy=None)
                load_seconds = time.time() - started
                loadable = "可加载"
                note = (
                    f"{load_seconds:.2f}s / {trainer.infoset_count:,} 信息集"
                    f"{'（懒加载）' if trainer.lazy else ''}"
                )
                # 两个口径以训练器为准（旧格式模型可能不等）
                info["n_infosets"] = trainer.strategy_infoset_count
                info["n_regret_infosets"] = trainer.regret_infoset_count
            except Exception as exc:  # noqa: BLE001 - CLI 必须给中文提示而不是 traceback
                loadable = "加载失败"
                note = f"{type(exc).__name__}: {exc}"
        elif info["size_bytes"] <= MAX_LAZY_VERIFY_BYTES and info.get("encoding") != "legacy-dict":
            started = time.time()
            try:
                trainer = MCCFRTrainer.load(str(path), lazy=True)
                load_seconds = time.time() - started
                loadable = "可加载（懒加载验证）"
                note = f"{load_seconds:.2f}s / {trainer.infoset_count:,} 信息集（未展开整表）"
                info["n_infosets"] = trainer.strategy_infoset_count
                info["n_regret_infosets"] = trainer.regret_infoset_count
            except Exception as exc:  # noqa: BLE001
                loadable = "加载失败"
                note = f"{type(exc).__name__}: {exc}"

        n_infosets = info.get("n_infosets") or 0
        per_infoset = (info["size_bytes"] / n_infosets) if n_infosets else 0.0
        rows.append(
            [
                path.name,
                _format_label(info),
                "仅策略" if info.get("strategy_only") else "全量",
                str(info.get("players") or "-"),
                f"{int(info['iterations_done']):,}" if info.get("iterations_done") else "-",
                f"{int(n_infosets):,}" if n_infosets else "-",
                f"{info['size_mb']:.2f} MB",
                f"{per_infoset:.1f} B" if n_infosets else "-",
                loadable,
            ]
        )
        payload.append({**info, "loadable": loadable, "load_note": note, "load_seconds": load_seconds})

    print("=== 模型清单（docs/INTERFACES.md §3.5）===")
    print(f"目录：{model_dir}/ | 共 {len(files)} 个模型")
    print()
    print(
        format_table(
            ["文件", "格式", "内容", "玩家", "Iterations", "信息集", "体积", "每信息集", "能否加载"],
            rows,
        )
    )
    print()
    for entry in payload:
        note = entry.get("load_note") or ""
        print(
            f"  - {entry['name']}：{entry['size_mb']:.2f} MB | 格式 v{entry.get('format_version')} "
            f"| {note if note else '（无需加载）'}"
        )
        coverage = int(entry.get("n_infosets") or 0)
        regret_infosets = entry.get("n_regret_infosets")
        if (
            coverage
            and regret_infosets is not None
            and int(regret_infosets) != coverage
            and not entry.get("strategy_only")  # 仅策略产物本来就没有 regret 表
        ):
            # 旧格式模型：traverser 只在自己当 update-player 时写 regret，策略表覆盖更广
            print(
                f"      信息集 {coverage:,}（推理覆盖）｜regret 表 {int(regret_infosets):,}"
                f" —— 差值来自旧格式模型，不影响推理"
            )
    print()
    print("说明：『每信息集』=[文件字节数 / 信息集数]；v2 目标 ≤60 B（全量）/ ≤45 B（仅策略）。")
    if write_index:
        entries = build_model_index(model_dir, files)
        index_path, changed = write_model_index(model_dir, entries)
        action = "已写入" if changed else "内容未变，保持"
        print(f"{action}模型清单：{index_path}（{len(entries)} 个模型，字段见 models/README.md）")
    if args.json:
        dump_json(entries if entries else payload)
    return 0


# --------------------------------------------------------------------------- 人数一致性


def check_model_players(specs: Sequence[Any], players: int) -> list[dict]:
    """校验每个 `mccfr:<path>` 模型的训练人数与当前对局人数是否一致。

    **只读模型头部**（`peek_model_players`，v2 容器毫秒级），不为了拿一行人数去完整
    加载几十 MB 的模型。不一致时**不中断**对局（方便做对照实验），只把结果交给
    调用方去打印警告；读不到人数时 `model_players = players_match = None`。
    """
    checks: list[dict] = []
    for spec in specs:
        path = model_path_from_spec(spec)
        if not path:
            continue
        model_players = peek_model_players(path)
        checks.append(
            {
                "spec": str(spec),
                "model": path,
                "model_name": Path(path).name,
                "model_players": model_players,
                "game_players": int(players),
                "players_match": None if model_players is None else model_players == int(players),
            }
        )
    return checks


def format_player_mismatch(checks: Sequence[Any], header: str = "[警告]") -> str:
    """人数不匹配时的中文警告块（含可直接复制的训练命令）；没有不匹配则返回空串。"""
    lines: list[str] = []
    for item in checks:
        if item.get("players_match") is not False:
            continue
        players = item["game_players"]
        lines.append(
            f"{header} 模型 {item['model_name']} 是「{item['model_players']} 人」模型，"
            f"当前对局为「{players} 人」→ 信息集键空间不重叠，本次命中率将恒为 0%，"
            f"MCCFR 实际由 RuleAgent 代打。请训练 {players} 人模型："
        )
        lines.append(
            f"       python main.py train --players {players} --iterations 10000 "
            f"--out models/mccfr_{players}p_10k.pkl"
        )
    return "\n".join(lines)


def player_check_payload(checks: Sequence[Any], players: int) -> dict:
    """`--json` 里的人数一致性字段（顶层 + 逐模型明细）。"""
    known = [item for item in checks if item.get("players_match") is not None]
    return {
        "game_players": int(players),
        "model_players": checks[0]["model_players"] if checks else None,
        "players_match": all(item["players_match"] for item in known) if known else None,
        "player_checks": list(checks),
    }


def mismatch_result_note(result: Mapping[str, Any], checks: Sequence[Any]) -> str:
    """结果报表中再提醒一次：附上实测命中次数，让「白训」这件事有证据。"""
    block = format_player_mismatch(checks, header="[警告] 再次提醒：")
    if not block:
        return ""
    stats_by_label = result.get("mccfr_stats") or {}
    details = [
        f"{label} 命中 {int(stats.get('hit', 0))} 次 / 决策 {int(stats.get('decisions', 0))} 次"
        for label, stats in sorted(stats_by_label.items())
    ]
    return "\n".join([block, f"       实测：{'；'.join(details)}" if details else ""])


# --------------------------------------------------------------------------- battle


def cmd_battle(args: argparse.Namespace) -> int:
    specs = list(args.agents)
    players = int(args.players) if args.players else len(specs)
    _require(
        len(specs) == players,
        f"--agents 数量（{len(specs)}）与 --players（{players}）不一致；{AGENT_COUNT_HINT}",
    )
    validate_agent_specs(specs)
    config = build_game_config(players, args.seed)
    checks = check_model_players(specs, players)
    mismatch = format_player_mismatch(checks)

    if not args.quiet:
        print("=== 自动对战（spec §42-§44）===")
        print(f"玩家数：{players} | 局数：{args.games} | seed：{args.seed}")
        print(f"对阵：{' vs '.join(specs)}")
        print(f"座位随机化：{'开启' if not args.no_seat_randomize else '关闭'}")
        if mismatch:
            print()
            print(mismatch)
        print()

    result = run_tournament(
        config,
        specs,
        args.games,
        seed=args.seed,
        seat_randomize=not args.no_seat_randomize,
        progress=not args.quiet,
    )
    print(format_tournament(result))
    note = mismatch_result_note(result, checks)
    if note:
        print()
        print(note)
    if args.json:
        payload = {k: v for k, v in result.items() if k != "report"}
        payload.update(player_check_payload(checks, players))
        dump_json(payload)
    return 0


# --------------------------------------------------------------------------- benchmark


def cmd_benchmark(args: argparse.Namespace) -> int:
    opponents = list(args.opponent)
    candidates = list(args.agents)
    _require(len(opponents) >= 1, "--opponent 至少给一个 Agent spec")

    players = int(args.players) if args.players else len(opponents) + 1
    _require(
        players >= len(opponents) + 1,
        f"--players（{players}）至少要比 --opponent 多 1（留一个座位给候选 Agent）",
    )
    validate_agent_specs(candidates + opponents)

    config = build_game_config(players, args.seed)
    candidate_checks = check_model_players(candidates, players)
    mismatch = format_player_mismatch(candidate_checks)
    if not args.quiet:
        print("=== Benchmark：候选 Agent 分别对阵对手 ===")
        print(
            f"玩家数：{players} | 每项局数：{args.games} | seed：{args.seed} | "
            f"对手：{' '.join(opponents)}（补满其余座位）"
        )
        if mismatch:
            print()
            print(mismatch)
        print()

    check_by_spec = {item["spec"]: item for item in candidate_checks}

    rows: list[list[str]] = []
    payload: list[dict] = []
    coverage_entries: dict[str, dict] = {}
    for candidate in candidates:
        specs = [candidate] + [opponents[i % len(opponents)] for i in range(players - 1)]
        result = run_tournament(
            config,
            specs,
            args.games,
            seed=args.seed,
            seat_randomize=not args.no_seat_randomize,
        )
        label = result["labels"][0]
        wins = int(result["wins"][label])
        low, high = result["ci95"][label]
        candidate_stats = (result.get("mccfr_stats") or {}).get(label)
        rows.append(
            [
                candidate[:28],
                str(args.games),
                str(wins),
                f"{result['win_rates'][label] * 100:6.2f}%",
                f"[{low * 100:5.2f}%, {high * 100:5.2f}%]",
                f"{result['avg_decisions']:.1f}",
            ]
        )
        entry = {
            "candidate": candidate,
            "opponents": specs[1:],
            "games": args.games,
            "wins": wins,
            "win_rate": result["win_rates"][label],
            "ci95": [low, high],
            "draws": result["draws"],
            "avg_decisions": result["avg_decisions"],
        }
        check = check_by_spec.get(str(candidate))
        if check:
            # 模型人数与对局人数不一致时，胜率/命中率都必须能被解释清楚
            entry["model_players"] = check["model_players"]
            entry["game_players"] = check["game_players"]
            entry["players_match"] = check["players_match"]
        if candidate_stats is not None:
            # 命中率必须随胜率一起给出：命中率低时胜率其实是 RuleAgent 打出来的。
            entry["hit_rate"] = candidate_stats.get("hit_rate", 0.0)
            entry["mccfr_stats"] = candidate_stats
            coverage_entries[label] = candidate_stats
        payload.append(entry)
        if not args.quiet:
            print(
                f"  {candidate:<28} 胜率 {result['win_rates'][label] * 100:6.2f}% "
                f"（{wins}/{args.games}，95% CI [{low * 100:.2f}%, {high * 100:.2f}%]）"
            )

    print()
    print("=== 胜率对比表 ===")
    print(
        format_table(
            ["候选 Agent", "局数", "胜场", "胜率", "Wilson 95% CI", "平均决策步数"],
            rows,
        )
    )
    print()
    print("说明：对手胜率 = 1 - 候选胜率 - 平局率；局数越多置信区间越窄（spec §64）。")
    coverage = format_mccfr_coverage(coverage_entries)
    if coverage:
        print()
        print(coverage)
    if mismatch:
        print()
        print(format_player_mismatch(candidate_checks, header="[警告] 再次提醒："))
    if args.json:
        dump_json(payload)
    return 0


# --------------------------------------------------------------------------- play


def _render_state(state: GameState, player: int) -> str:
    """给人类玩家看的简化视图。

    只用 `observation()` + `debug_public_state()`（后者是 C2 提供的终端渲染便利视图，
    只含公开信息），**绝不**读取 `state.hands[other]` / `state.deck`。
    """
    obs = state.observation(player)
    # 优先用 CLI 便利视图；若上游精简了字段则退回 public_state + observation 推导。
    get_debug = getattr(state, "debug_public_state", None)
    pub = get_debug(player) if callable(get_debug) else state.public_state(player)

    hand = "、".join(item["name"] for item in obs["hand"]) or "（空）"
    known = "、".join(item["name"] for item in obs["known_top"]) or "（未知）"
    players_public = pub.get("players") or []
    others = "，".join(
        f"P{int(entry.get('player_id', index))} 手牌 {int(entry.get('hand_count', 0))} 张"
        f"{'（已淘汰）' if not entry.get('alive', True) else ''}"
        for index, entry in enumerate(players_public)
        if int(entry.get("player_id", index)) != player
    )
    deck_left = pub.get("deck_size", pub.get("deck_count", 0))
    lines = [
        "-" * 60,
        f"阶段：{state.phase.value} | 当前行动者：P{state.decision_player()} | 你的座位：P{player}",
        f"你的手牌：{hand}",
        f"你已知的牌堆顶：{known}",
        f"牌堆剩余：{deck_left} 张 | {others}",
    ]
    return "\n".join(lines)


def _ask_human(state: GameState, player: int) -> Optional[Action]:
    """交互式让人类选动作；返回 `None` 表示退出。"""
    legal = state.legal_actions()
    print(_render_state(state, player))
    print("可选动作：")
    for index, action in enumerate(legal):
        print(f"  [{index}] {action.label()}")
    while True:
        try:
            raw = input("请输入编号（q 退出）：").strip()
        except EOFError:
            raise
        if raw.lower() in ("q", "quit", "exit"):
            return None
        try:
            choice = int(raw)
        except ValueError:
            print("  请输入数字编号。")
            continue
        if 0 <= choice < len(legal):
            return legal[choice]
        print(f"  编号需在 0..{len(legal) - 1} 之间。")


def cmd_play(args: argparse.Namespace) -> int:
    config = build_game_config(args.players, args.seed)
    human_seat = int(args.human_seat)
    _require(0 <= human_seat < args.players, f"--human-seat 需在 0..{args.players - 1}")

    ai_spec = args.ai
    validate_agent_specs([ai_spec])
    ai_agents = parse_agent_specs([ai_spec] * args.players, args.seed)
    fallback = parse_agent_specs(["rule"] * args.players, args.seed + 555)[human_seat]

    interactive = bool(sys.stdin is not None and sys.stdin.isatty()) and not args.auto
    if not interactive:
        reason = "指定了 --auto" if args.auto else "stdin 不是交互终端（CI / 后台运行）"
        print(f"[提示] {reason}：人类座位 P{human_seat} 自动由 RuleAgent 接管，不会挂死等待输入。")

    print("=== 终端人机对战（spec §3.4 play）===")
    print(f"玩家数：{args.players} | 你坐在 P{human_seat} | 对手：{ai_spec} | seed：{args.seed}")

    state = GameState(config, args.seed)
    while not state.is_terminal():
        player = state.decision_player()
        if player == human_seat and interactive:
            try:
                action = _ask_human(state, player)
            except (EOFError, KeyboardInterrupt):
                print("\n[提示] 输入流结束，人类座位改由 RuleAgent 接管。")
                interactive = False
                action = fallback.act(state, player)
            if action is None:
                print("你已退出本局。")
                return 0
        elif player == human_seat:
            action = fallback.act(state, player)
        else:
            action = ai_agents[player].act(state, player)
            print(f"[AI] P{player} {ai_agents[player].name} -> {action}")
        state.step(action)
        if state.logs:
            print(f"[事件] {state.logs[-1]}")

    print("=" * 60)
    print(state.debug_string(reveal_all=True))
    print(f"结果：{('平局' if state.winner is None else f'P{state.winner} 胜')} | 决策步数：{state.decision_count}")
    return 0


# --------------------------------------------------------------------------- serve


def cmd_serve(args: argparse.Namespace) -> int:
    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - 取决于环境
        print(
            "启动失败：缺少 uvicorn。请先安装依赖：\n"
            '  python -m pip install -r requirements.txt\n'
            f"（原始错误：{exc}）"
        )
        return 1

    try:
        import app.main  # noqa: F401  延迟导入：app/ 由 C4 负责，可能此刻还不存在
    except ImportError as exc:
        print(
            "启动失败：无法导入 `app.main:app`（FastAPI 服务层由 C4 负责）。\n"
            "请确认 app/ 目录已就绪、且当前工作目录是 backend/。\n"
            f"（原始错误：{exc}）"
        )
        return 1

    print(f"启动 FastAPI：http://{args.host}:{args.port}（reload={args.reload}）")
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=int(args.port),
        reload=bool(args.reload),
    )
    return 0


# --------------------------------------------------------------------------- 参数解析


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="main.py",
        description="修仙卡牌：MCCFR 训练 / Agent 对战 / 评测 / 终端试玩 / 后端服务",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # -------- demo
    demo = sub.add_parser("demo", help="跑 1 局中文日志演示")
    demo.add_argument("--players", type=int, default=3, help="玩家数量（2-6，默认 3）")
    demo.add_argument("--simulations", type=int, default=200, help="ISMCTS 每步模拟次数")
    demo.add_argument("--seed", type=int, default=42)
    demo.add_argument(
        "--agents",
        nargs="+",
        default=None,
        help="自定义对阵，例如 rule ismcts:200 random",
    )
    demo.set_defaults(func=cmd_demo)

    # -------- train（用 SUPPRESS 区分「用户显式给出」与「默认值」）
    train = sub.add_parser(
        "train",
        help="训练 MCCFR（支持 YAML 配置 / 纯 CLI / 续训 / checkpoint）",
        argument_default=argparse.SUPPRESS,
    )
    train.add_argument("--config", type=str, help="YAML 配置路径，例如 configs/train_2p.yaml")
    train.add_argument("--players", type=int, help="玩家数量（2-6）")
    train.add_argument("--iterations", type=int, help="本次训练的 outer iterations")
    train.add_argument("--workers", type=int, help="并行进程数（>1 为近似并行）")
    train.add_argument("--sync-batch", type=int, help="并行训练每次同步的 outer iterations")
    train.add_argument("--exploration", type=float, help="epsilon 探索率（0-1）")
    train.add_argument("--checkpoint-every", type=int, help="每多少 iter 存一次 checkpoint（0=关闭）")
    train.add_argument("--checkpoint-prefix", type=str, help="checkpoint 文件名前缀")
    train.add_argument("--log-every", type=int, help="每多少 iter 打印一次中文日志")
    train.add_argument("--out", type=str, help="模型输出路径，例如 models/mccfr_2p.pkl")
    train.add_argument("--resume", type=str, help="续训：载入已有模型继续训练")
    train.add_argument("--initial-hand", type=int, help="初始手牌数")
    train.add_argument("--max-actions", type=int, help="每回合最多行动次数")
    train.add_argument("--max-decisions", type=int, help="单局最大决策步数")
    train.add_argument("--seed", type=int, help="随机种子")
    train.add_argument("--metrics", type=str, help="训练指标 JSONL 路径")
    train.add_argument(
        "--format",
        type=str,
        choices=("v2", "v1"),
        default="v2",
        help="模型格式：v2 紧凑二进制（默认，§3.5）/ v1 旧 plain dict",
    )
    train.add_argument(
        "--strategy-only",
        action="store_true",
        default=False,
        help="只保存平均策略（部署产物，体积最小；该模型不能续训）",
    )
    train.add_argument("--quiet", action="store_true", help="不打印训练进度（仍写指标文件）")
    train.set_defaults(func=cmd_train)

    # -------- models
    models = sub.add_parser("models", help="列出 models/ 下模型的元信息 / 体积 / 格式 / 能否加载")
    models.add_argument("--dir", type=str, default=DEFAULT_MODEL_DIR, help="模型目录（默认 models/）")
    models.add_argument(
        "--write-index",
        action="store_true",
        default=False,
        help="顺带刷新 models/index.json（前端 GET /agents 的模型清单数据源；默认只读列出）",
    )
    models.add_argument("--json", action="store_true", help="额外输出 JSON 结果")
    models.set_defaults(func=cmd_models)

    # -------- battle
    battle = sub.add_parser("battle", help="多 Agent 自动对战并输出胜率 / 置信区间 / 座位表")
    battle.add_argument("--players", type=int, default=None, help="玩家数量（缺省=len(--agents)）")
    battle.add_argument(
        "--agents",
        nargs="+",
        required=True,
        help="例如 random rule ismcts:500 mccfr:models/mccfr_2p.pkl",
    )
    battle.add_argument("--games", type=int, default=100, help="对局数量")
    battle.add_argument("--seed", type=int, default=42)
    battle.add_argument("--no-seat-randomize", action="store_true", help="关闭每局随机换座位")
    battle.add_argument("--json", action="store_true", help="额外输出 JSON 结果")
    battle.add_argument("--quiet", action="store_true", help="不打印进度")
    battle.set_defaults(func=cmd_battle)

    # -------- benchmark
    bench = sub.add_parser("benchmark", help="候选 Agent 分别对阵同一对手，输出胜率对比表")
    bench.add_argument("--agents", nargs="+", required=True, help="候选 Agent（可多个）")
    bench.add_argument("--opponent", nargs="+", required=True, help="对手 Agent（可多个，循环补位）")
    bench.add_argument("--players", type=int, default=None, help="玩家数量（缺省=对手数+1）")
    bench.add_argument("--games", type=int, default=100, help="每个候选的对局数")
    bench.add_argument("--seed", type=int, default=42)
    bench.add_argument("--no-seat-randomize", action="store_true", help="关闭每局随机换座位")
    bench.add_argument("--json", action="store_true", help="额外输出 JSON 结果")
    bench.add_argument("--quiet", action="store_true", help="不打印进度")
    bench.set_defaults(func=cmd_benchmark)

    # -------- play
    play = sub.add_parser("play", help="终端人机对战（stdin 非 tty 时自动用 RuleAgent 接管）")
    play.add_argument("--players", type=int, default=3)
    play.add_argument("--seed", type=int, default=42)
    play.add_argument("--ai", type=str, default="rule", help="AI 对手 spec，例如 rule / ismcts:200")
    play.add_argument("--human-seat", type=int, default=0, help="人类玩家座位")
    play.add_argument("--auto", action="store_true", help="强制自动模式（不做人类输入）")
    play.set_defaults(func=cmd_play)

    # -------- serve
    serve = sub.add_parser("serve", help="启动 FastAPI 服务（uvicorn app.main:app）")
    serve.add_argument("--host", type=str, default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true", help="开发模式热重载")
    serve.set_defaults(func=cmd_serve)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return 2
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        print("\n已中断。")
        return 130
    except CliError as exc:
        # 友好中文提示 + 退出码 2；绝不让用户看到 traceback。
        print(f"[错误] {exc}", file=sys.stderr)
        return 2
    except FileNotFoundError as exc:
        print(f"[错误] 文件不存在：{exc.filename or exc}", file=sys.stderr)
        return 2
    except ImportError as exc:
        print(f"[错误] 依赖缺失：{exc}", file=sys.stderr)
        return 2
    except ValueError as exc:
        print(f"[错误] 参数错误：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

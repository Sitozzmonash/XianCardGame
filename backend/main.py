"""修仙卡牌 CLI 入口（冻结契约 `docs/INTERFACES.md` §3.4）。

子命令：

```bash
python main.py demo   [--players 3] [--simulations 200] [--seed 42] [--agents rule ismcts:200 random]
python main.py train  [--config configs/train_2p.yaml] | [--players 2 --iterations 100000 --workers 8
                       --sync-batch 1000 --exploration 0.6 --checkpoint-every 10000 --out models/x.pkl]
                      [--resume models/x.pkl]
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
import sys
from pathlib import Path
from typing import Any, Optional, Sequence

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


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"参数错误：{message}")


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
    base = load_train_config(config_path) if config_path else normalize_train_config({})
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

    # ---------------------------------------------------------------- 载入 / 新建
    if resume_path:
        _require(Path(resume_path).exists(), f"续训模型不存在：{resume_path}")
        trainer = MCCFRTrainer.load(resume_path)
        # 没显式给 --players 时以模型自带的玩家数为准（续训最常见的用法）。
        if explicit_players and trainer.config.num_players != config_obj.num_players:
            raise SystemExit(
                f"续训模型的玩家数（{trainer.config.num_players}）与本次配置"
                f"（{config_obj.num_players}）不一致，请改用 --players {trainer.config.num_players}。"
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

    trainer.save(out_path)
    size_mb = Path(out_path).stat().st_size / (1024 * 1024)
    print(f"[MCCFR] 训练完成：{out_path}（{size_mb:.2f} MB）")
    print(trainer.report())
    return 0


# --------------------------------------------------------------------------- battle


def cmd_battle(args: argparse.Namespace) -> int:
    specs = list(args.agents)
    players = int(args.players) if args.players else len(specs)
    _require(
        len(specs) == players,
        f"--agents 数量（{len(specs)}）与 --players（{players}）不一致；{AGENT_COUNT_HINT}",
    )
    config = build_game_config(players, args.seed)

    if not args.quiet:
        print("=== 自动对战（spec §42-§44）===")
        print(f"玩家数：{players} | 局数：{args.games} | seed：{args.seed}")
        print(f"对阵：{' vs '.join(specs)}")
        print(f"座位随机化：{'开启' if not args.no_seat_randomize else '关闭'}")
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
    if args.json:
        dump_json({k: v for k, v in result.items() if k != "report"})
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

    config = build_game_config(players, args.seed)
    if not args.quiet:
        print("=== Benchmark：候选 Agent 分别对阵对手 ===")
        print(
            f"玩家数：{players} | 每项局数：{args.games} | seed：{args.seed} | "
            f"对手：{' '.join(opponents)}（补满其余座位）"
        )
        print()

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
    if args.json:
        dump_json(payload)
    return 0


# --------------------------------------------------------------------------- play


def _render_state(state: GameState, player: int) -> str:
    """给人类玩家看的简化视图（只用 observation + public_state，绝不泄露隐藏信息）。"""
    obs = state.observation(player)
    pub = state.public_state(player)
    hand = "、".join(item["name"] for item in obs["hand"]) or "（空）"
    known = "、".join(item["name"] for item in obs["known_top"]) or "（未知）"
    others = "，".join(
        f"P{index} 手牌 {entry['hand_count']} 张{'（已淘汰）' if not entry['alive'] else ''}"
        for index, entry in enumerate(pub["players"])
        if index != player
    )
    lines = [
        "-" * 60,
        f"阶段：{state.phase.value} | 当前行动者：P{state.decision_player()} | 你的座位：P{player}",
        f"你的手牌：{hand}",
        f"你已知的牌堆顶：{known}",
        f"牌堆剩余：{pub['deck_count']} 张 | {others}",
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
    train.add_argument("--quiet", action="store_true", help="不打印训练进度（仍写指标文件）")
    train.set_defaults(func=cmd_train)

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
    except ValueError as exc:
        print(f"参数错误：{exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

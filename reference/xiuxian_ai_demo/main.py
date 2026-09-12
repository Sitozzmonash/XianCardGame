from __future__ import annotations
import argparse
from pathlib import Path
from xiuxian.game import GameConfig
from xiuxian.agents import RandomAgent, RuleAgent, ISMCTSAgent
from xiuxian.mccfr import MCCFRTrainer
from xiuxian.eval import play_game, run_tournament

def cmd_demo(args):
    config = GameConfig(num_players=3, seed=args.seed)
    agents = [
        RuleAgent(args.seed + 1),
        ISMCTSAgent(simulations=args.simulations, seed=args.seed + 2),
        RandomAgent(args.seed + 3),
    ]
    print("=== 修仙卡牌 AI Demo：规则AI vs ISMCTS vs 随机AI ===")
    play_game(config, agents, args.seed, verbose=True)

def cmd_train(args):
    config = GameConfig(
        num_players=args.players,
        initial_hand=args.initial_hand,
        max_actions_per_turn=args.max_actions,
        seed=args.seed,
    )

    if args.resume:
        trainer = MCCFRTrainer.load(args.resume)
        if trainer.config.num_players != args.players:
            raise ValueError("续训模型的玩家数量和 --players 不一致。")
        print(f"已载入模型：{args.resume}，当前迭代={trainer.iterations_done:,}")
    else:
        trainer = MCCFRTrainer(config, args.seed)

    prefix = None
    if args.checkpoint_every > 0:
        out = Path(args.out)
        prefix = str(out.with_suffix("")) + "_ckpt"

    print(f"开始训练：players={args.players}, iterations={args.iterations:,}, workers={args.workers}")
    if args.workers > 1:
        print("注意：workers>1 使用批量同步的近似并行 MCCFR；做严格算法对照时建议 workers=1。")

    trainer.train(
        iterations=args.iterations,
        workers=args.workers,
        sync_batch=args.sync_batch,
        checkpoint_every=args.checkpoint_every,
        checkpoint_prefix=prefix,
        log_every=args.log_every,
    )
    trainer.save(args.out)
    print(f"训练完成：{args.out}")
    print(f"总 outer iterations={trainer.iterations_done:,}，traversals={trainer.traversals_done:,}，信息集={len(trainer.regret_sum):,}")

def cmd_battle(args):
    config = GameConfig(num_players=args.players, seed=args.seed)
    result = run_tournament(config, args.agents, args.games, args.seed)
    print("=== 对战结果 ===")
    print(f"局数：{result['games']} | 平局：{result['draws']} | 平均决策步数：{result['avg_decisions']:.1f}")
    for name, rate in sorted(result["win_rates"].items(), key=lambda x: x[1], reverse=True):
        print(f"{name:<45} 胜率 {rate*100:6.2f}% | 胜场 {result['wins'][name]}")

def build_parser():
    p = argparse.ArgumentParser(description="修仙卡牌：ISMCTS + MCCFR CPU 实验 Demo")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("demo", help="跑 1 局中文日志演示")
    d.add_argument("--simulations", type=int, default=200, help="ISMCTS 每步模拟次数")
    d.add_argument("--seed", type=int, default=42)
    d.set_defaults(func=cmd_demo)

    t = sub.add_parser("train", help="训练 MCCFR")
    t.add_argument("--players", type=int, default=2)
    t.add_argument("--iterations", type=int, default=10000)
    t.add_argument("--workers", type=int, default=1)
    t.add_argument("--sync-batch", type=int, default=500, help="并行训练每次同步的 outer iterations")
    t.add_argument("--initial-hand", type=int, default=5)
    t.add_argument("--max-actions", type=int, default=2)
    t.add_argument("--out", type=str, default="models/mccfr.pkl")
    t.add_argument("--resume", type=str, default="")
    t.add_argument("--checkpoint-every", type=int, default=0)
    t.add_argument("--log-every", type=int, default=1000)
    t.add_argument("--seed", type=int, default=42)
    t.set_defaults(func=cmd_train)

    b = sub.add_parser("battle", help="配置多个 AI 自动比赛")
    b.add_argument("--players", type=int, required=True)
    b.add_argument("--agents", nargs="+", required=True,
                   help="例如 random rule ismcts:500 mccfr:models/mccfr.pkl")
    b.add_argument("--games", type=int, default=100)
    b.add_argument("--seed", type=int, default=42)
    b.set_defaults(func=cmd_battle)
    return p

if __name__ == "__main__":
    args = build_parser().parse_args()
    args.func(args)

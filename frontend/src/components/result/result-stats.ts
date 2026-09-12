/**
 * 结算页数据推导 —— **只用真实 GameView 字段**，缺什么就标「不可得」，绝不编造。
 *
 * | 设计稿 | 数据来源 | 是否真实可得 |
 * |---|---|---|
 * | 回合 9 | `view.public.round` | ✅ 后端权威字段 |
 * | 出牌 14 | `view.public.discard_count`（弃牌堆张数） | ✅ 后端权威字段 |
 * | 渡劫 2 | 本局**事件流**里 TRIBULATION_* 事件计数 | ⚠️ 依赖本次会话累积的事件（store.battleLog）；无事件时显示「—」 |
 */
import type { GameEvent } from '@/types/event';
import type { GameView, PublicState } from '@/types/game';

/** 事件流里与「天劫」相关的文案标记（来自 utils/event-log.ts 的中文呈现） */
const TRIBULATION_MARKERS = ['天劫降临', '护劫符化解', '天劫回插'];

export interface ResultStat {
  key: 'round' | 'played' | 'tribulation';
  label: string;
  /** 展示值；不可得时为 '—' */
  value: string;
  /** 真实来源说明（供 UI 小字 / 汇报使用） */
  source: string;
  available: boolean;
}

export interface ResultStatsInput {
  view: Pick<GameView, 'public'>;
  /** store 累积的日志行（每条由真实事件渲染而来） */
  log?: readonly string[];
}

/** 事件流里天劫事件条数（本会话可见的真实事件） */
export function tribulationCountOf(events: readonly GameEvent[]): number {
  return events.filter((event) => String(event.type).startsWith('TRIBULATION_')).length;
}

export function tribulationCountOfLog(log: readonly string[] | undefined): number {
  if (!log || log.length === 0) return 0;
  return log.filter((line) => TRIBULATION_MARKERS.some((marker) => line.includes(marker))).length;
}

export function resultStatsOf({ view, log }: ResultStatsInput): ResultStat[] {
  const publicState: PublicState = view.public;
  const round = Number.isFinite(publicState.round) ? publicState.round : 0;
  const discard = Number.isFinite(publicState.discard_count) ? publicState.discard_count : 0;
  const hasLog = Array.isArray(log) && log.length > 0;
  const tribulation = tribulationCountOfLog(log);

  return [
    {
      key: 'round',
      label: '回合',
      value: String(round),
      source: 'view.public.round',
      available: true,
    },
    {
      key: 'played',
      label: '出牌',
      value: String(discard),
      source: 'view.public.discard_count（弃牌堆张数）',
      available: true,
    },
    {
      key: 'tribulation',
      label: '渡劫',
      value: hasLog ? String(tribulation) : '—',
      source: hasLog ? '本局事件流中的 TRIBULATION_* 事件数' : '事件流不可得（未记录本局事件）',
      available: hasLog,
    },
  ];
}

export interface RankedPlayer {
  rank: number;
  playerId: number;
  name: string;
  alive: boolean;
  isWinner: boolean;
  isViewer: boolean;
}

/**
 * 最终名次：胜者 → 存活者 → 淘汰者（同组内按座位号），
 * 排序依据只有 `view.winner` 与 `public.players[].alive` 两个真实字段。
 */
export function rankingOf(view: Pick<GameView, 'winner' | 'viewer_player_id' | 'public'>): RankedPlayer[] {
  const winnerId = typeof view.winner === 'number' && view.winner >= 0 ? view.winner : null;
  const ordered = [...view.public.players].sort((a, b) => {
    const rankOf = (playerId: number, alive: boolean) => {
      if (winnerId !== null && playerId === winnerId) return 0;
      return alive ? 1 : 2;
    };
    const diff =
      rankOf(a.player_id, a.alive) - rankOf(b.player_id, b.alive) || a.player_id - b.player_id;
    return diff;
  });

  return ordered.map((player, index) => ({
    rank: index + 1,
    playerId: player.player_id,
    name: player.name,
    alive: player.alive,
    isWinner: winnerId !== null && player.player_id === winnerId,
    isViewer: player.player_id === view.viewer_player_id,
  }));
}

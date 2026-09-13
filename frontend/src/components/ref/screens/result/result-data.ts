/**
 * 结算页的数据推导（**只从真实 `GameView` 派生，不编造任何数字**）。
 *
 * 对应参考原型 `components/screens/ResultScreen.tsx:19-23` 的 `stats` 与 `result.ranking`，
 * 但原型吃的是写死的 `MOCK_RESULT`，这里全部改从 `useGameStore().view` 现算：
 *
 * | 参考字段 | 移植后的真实来源 |
 * |---|---|
 * | `result.rounds` | `view.public.round`（后端权威） |
 * | `result.plays` | `view.public.discard_count`（弃牌堆张数，后端权威） |
 * | `result.tribulations` | `view.events` 里的 `TRIBULATION_DRAWN`（见下，无权威单字段） |
 * | `result.success` | `view.winner === view.viewer_player_id`（真人是否证道成功） |
 * | `result.winner` | `view.winner` → `view.public.players[]` 的名字（后端给的真名） |
 * | `result.ranking` | `view.winner` + `public.players[].alive` + `PLAYER_ELIMINATED` 的 seq |
 *
 * ⚠️ 渡劫次数：**没有单一权威字段**，且 `view.events` 不是「整局事件流」——
 * 后端实测（`app/api/games.py` 明写「含本次请求产生的 events[]」）只回**本次响应的增量**：
 * 3 人局实测整局 78 个事件（其中 `TRIBULATION_DRAWN` 6 次），而局末响应里只有 seq 58..78
 * （`TRIBULATION_DRAWN` 只剩 2 次，且不含 `GAME_STARTED`）。`GET /games/{id}` 的 `events` 恒为 `[]`。
 * 所以：能确证覆盖整局（事件流含 `GAME_STARTED`）才给精确值；否则只给**下界 `≥n`**；
 * 一个天劫事件都看不到就显示「—」。**任何情况下都不猜数、不放大。**
 *
 * 另：`TRIBULATION_DEFUSED` / `TRIBULATION_REINSERTED` 是**同一张天劫的后续**（实测 seq 89 抽到 →
 * 90 被护劫符化解 → 92 回插），把它们也算成「一次渡劫」会把 3 次遭遇显示成 5 次，
 * 因此口径定为 `TRIBULATION_DRAWN` 的条数。
 */

import type { GameEvent } from '@/types/event';
import type { GameView } from '@/types/game';

/** 未知值占位（参考原型没有这个态；拿不到数据时如实显示「—」） */
export const UNKNOWN_VALUE = '—';

export interface ResultStat {
  label: string;
  /** 已格式化的显示值：`'20'` / `'≥2'` / `'—'` */
  value: string;
  /** 无障碍说明：把推导口径讲清楚，界面不变形也不藏信息 */
  hint: string;
}

export interface TribulationTally {
  /** 可见事件流里的 TRIBULATION_DRAWN 条数（= 遭遇天劫次数） */
  drawn: number;
  /** 可见事件流里全部 TRIBULATION_* 条数（含同一张天劫的后续事件，仅用于自检/说明） */
  related: number;
  /** 可见事件流是否覆盖整局（含 GAME_STARTED） */
  complete: boolean;
  /** UI 用的值：`'3'` / `'≥2'` / `'—'` */
  value: string;
  hint: string;
}

export function isGameOver(view: GameView): boolean {
  return view.status === 'ended' || view.phase === 'ENDED';
}

export function winnerIdOf(view: GameView): number | null {
  return typeof view.winner === 'number' && view.winner >= 0 ? view.winner : null;
}

export function tribulationTally(events: readonly GameEvent[] | null | undefined): TribulationTally {
  const list = Array.isArray(events) ? events : [];
  let drawn = 0;
  let related = 0;
  let complete = false;

  for (const event of list) {
    const type = typeof event?.type === 'string' ? event.type : '';
    if (type === 'GAME_STARTED') complete = true;
    if (type.startsWith('TRIBULATION_')) {
      related += 1;
      if (type === 'TRIBULATION_DRAWN') drawn += 1;
    }
  }

  const value = drawn === 0 ? UNKNOWN_VALUE : complete ? String(drawn) : `≥${drawn}`;
  const basis = '口径：事件流里的 TRIBULATION_DRAWN 条数（同一张天劫的 DEFUSED / REINSERTED 不重复计）。';
  const hint =
    drawn === 0
      ? `渡劫次数未知：可见事件流里没有 TRIBULATION_* 事件，不猜数（显示「—」）。${basis}`
      : complete
        ? `渡劫 ${drawn} 次（事件流覆盖整局）。${basis}`
        : `渡劫至少 ${drawn} 次：可见事件流只包含最近一次响应的增量（不含 GAME_STARTED），所以只显示下界。${basis}`;

  return { drawn, related, complete, value, hint };
}

/** 统计三列（对应参考 `ResultScreen.tsx:19-23` + `58-65` 的渲染） */
export function resultStatsOf(view: GameView): ResultStat[] {
  const tally = tribulationTally(view.events);

  return [
    {
      label: '回合',
      value: String(view.public.round),
      hint: `回合：GameView.public.round = ${view.public.round}（后端权威字段）`,
    },
    {
      label: '出牌',
      value: String(view.public.discard_count),
      hint: `出牌：GameView.public.discard_count = ${view.public.discard_count}（弃牌堆张数，后端权威字段）`,
    },
    { label: '渡劫', value: tally.value, hint: tally.hint },
  ];
}

export interface RankEntry {
  rank: number;
  playerId: number;
  name: string;
  alive: boolean;
}

/**
 * 最终排名：从「胜者 + 存活 + 淘汰事件的先后」派生，不用座位号硬当名次。
 * - 存活者在前（胜者恒第一，其余按座位序）；
 * - 被淘汰者按各自的 `PLAYER_ELIMINATED.seq` 倒序（越晚出局名次越高）；
 * - 没有淘汰事件可依据的座位排在最后（按座位序），不发散猜测。
 */
export function rankingOf(view: GameView): RankEntry[] {
  const players = Array.isArray(view.public?.players) ? view.public.players : [];
  const events = Array.isArray(view.events) ? view.events : [];
  const winnerId = winnerIdOf(view);

  const eliminatedAt = new Map<number, number>();
  for (const event of events) {
    if (event?.type !== 'PLAYER_ELIMINATED') continue;
    // 铁律：PLAYER_ELIMINATED 把**被淘汰的座位**放在 actor（不是 target）
    const seat = typeof event.actor === 'number' ? event.actor : null;
    if (seat === null) continue;
    eliminatedAt.set(seat, Math.max(eliminatedAt.get(seat) ?? 0, event.seq));
  }

  const bySeat = (a: { player_id: number }, b: { player_id: number }) => a.player_id - b.player_id;
  const alive = players.filter((player) => player.alive).sort((a, b) => {
    if (a.player_id === winnerId) return -1;
    if (b.player_id === winnerId) return 1;
    return bySeat(a, b);
  });
  const out = players.filter((player) => !player.alive).sort((a, b) => {
    const seqA = eliminatedAt.get(a.player_id);
    const seqB = eliminatedAt.get(b.player_id);
    if (seqA !== undefined && seqB !== undefined && seqA !== seqB) return seqB - seqA;
    if (seqA !== undefined && seqB === undefined) return -1;
    if (seqA === undefined && seqB !== undefined) return 1;
    return bySeat(a, b);
  });

  return [...alive, ...out].map((player, index) => ({
    rank: index + 1,
    playerId: player.player_id,
    name: player.name,
    alive: player.alive,
  }));
}

export interface ResultOutcome {
  /** 对局还在进行（直接访问 /result 或提前跳转）：显示实时局面，不假装已分胜负 */
  live: boolean;
  /** 真人是否证道成功（参考 `result.success`） */
  success: boolean;
  /** TopBar 大标题：渡劫成功｜道消身殒（未分胜负时为「天机未定」） */
  title: string;
  /** 居中区展示的名字（胜者真名 / 自己 / 无人生还） */
  name: string;
  /** 居中区副标题（成功与失败都是「最后存活 · 证道成功」——描述的是下面这位胜者） */
  subtitle: string;
  /** 头像渐变按真实座位号轮转（原型写死 4） */
  seat: number;
  /** 法阵配色：成功金 / 失败与未定玉 */
  tone: 'gold' | 'jade';
}

export function resolveOutcome(view: GameView): ResultOutcome {
  const players = Array.isArray(view.public?.players) ? view.public.players : [];
  const viewerId = typeof view.viewer_player_id === 'number' ? view.viewer_player_id : 0;
  const viewer = players.find((player) => player.player_id === viewerId);
  const winnerId = winnerIdOf(view);
  const winner = winnerId === null ? undefined : players.find((player) => player.player_id === winnerId);

  if (!isGameOver(view)) {
    return {
      live: true,
      success: false,
      title: '天机未定',
      name: viewer?.name ?? `P${viewerId}`,
      subtitle: '对局进行中 · 尚未分晓',
      seat: viewerId,
      tone: 'jade',
    };
  }

  if (winnerId === null) {
    return {
      live: false,
      success: false,
      title: '天机未定',
      name: '无人生还',
      subtitle: '本局未产生胜者（后端未给 winner）',
      seat: 0,
      tone: 'jade',
    };
  }

  const success = winnerId === viewerId;
  return {
    live: false,
    success,
    title: success ? '渡劫成功' : '道消身殒',
    name: winner?.name ?? `P${winnerId}`,
    subtitle: '最后存活 · 证道成功',
    seat: winnerId,
    tone: success ? 'gold' : 'jade',
  };
}

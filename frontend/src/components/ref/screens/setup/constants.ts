/**
 * 对战配置页的静态常量与座位构造（对应参考 `BattleSetupScreen.tsx` 第 16–30 行与
 * `lib/game-data.ts` 的 `DEFAULT_SEATS` / `ISMCTS_SIM_OPTIONS`）。
 *
 * 参考里的座位名是原型写死的；本项目照抄这套名字，但**座位身份与 AI 类型来自真实 store**
 * （`setup.players` / `setup.humanPlayer` / `setup.agentTypes`），这样 POST /games 发的就是
 * 界面上看到的东西。
 */

import { AI_OPTIONS, type AIKind, type SeatView } from '@/components/ref/PlayerPanel';

/** `const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const`（参考第 16 行） */
export const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const;

/** `ISMCTS_SIM_OPTIONS`（参考 `lib/game-data.ts` 第 164 行） */
export const ISMCTS_SIM_OPTIONS = [100, 500, 1000] as const;

/**
 * 六个座位的名字（参考 `DEFAULT_SEATS` 第 148–155 行的顺序）。
 * 真人所坐的那一行统一显示「我」（参考 p0），其余座位按索引取名字。
 */
export const SEAT_NAMES: readonly string[] = [
  '太虚真君',
  '玄墨真人',
  '清月仙子',
  '赤霄散人',
  '青岚道友',
  '白露剑仙',
];

export const SELF_NAME = '我';

/** 后端 `agentTypes` 里的未知值一律回落 Rule（与 store 的 buildAgentSpec 一致） */
function normalizeKind(raw: string | undefined): AIKind {
  return raw && (AI_OPTIONS as readonly string[]).includes(raw) ? (raw as AIKind) : 'rule';
}

/**
 * 构造前 N 个座位（参考第 30 行 `seats.slice(0, playerCount)`）。
 *
 * - `humanSeat` 那一行：`kind = 'human'`，名字「我」，副标题 `玩家座位 · P{n}`
 *   （PlayerPanel 据此渲染右侧 `Human` 标签，不再给 AI 选择器）；
 * - 其余行：`kind` 取自 store 的 `agentTypes`，副标题 `P{n} · AI`。
 */
export function buildSeats(
  players: number,
  humanSeat: number,
  agentTypes: readonly string[],
): SeatView[] {
  return Array.from({ length: players }, (_, seat) => {
    const isHuman = seat === humanSeat;
    return {
      id: `p${seat}`,
      name: isHuman ? SELF_NAME : SEAT_NAMES[seat] ?? `道友 ${seat}`,
      title: isHuman ? `玩家座位 · P${seat}` : `P${seat} · AI`,
      seat,
      kind: isHuman ? 'human' : normalizeKind(agentTypes[seat]),
      // 配置阶段还没有手牌/存活信息（参考取的就是原型里的假数字，这里如实置 0/true，
      // 不编造对局数据；PlayerPanel 在这一屏也不用这两个字段）
      handCount: 0,
      alive: true,
      isSelf: isHuman,
    };
  });
}

/** 把某个座位的 AI 类型写回 `agentTypes` 数组（参考第 32–33 行的 `updateKind`） */
export function withKind(agentTypes: readonly string[], seat: number, kind: AIKind): string[] {
  return agentTypes.map((value, index) => (index === seat ? kind : value));
}

/**
 * 座位名单 —— 逐字取自参考原型 `docs/reference-next/lib/game-data.ts:148-155` 的 `DEFAULT_SEATS`
 * （名字是原型的固定名单，不是后端数据；后端只在 `GameView.public.players[]` 里给对局中的真名）。
 *
 * 参考 `AILabScreen.tsx:21` 把 `DEFAULT_SEATS` 的 kind 直接当初始策略，其中 human 位替换为 ismcts：
 *   `DEFAULT_SEATS.map((seat) => (seat.kind === 'human' ? 'ismcts' : seat.kind))`
 *   → ['ismcts','rule','ismcts','mccfr','random','ismcts']
 * 策略标签与可选集合一律复用冻结层 `@/components/ref/PlayerPanel` 的 `AI_LABEL` / `AI_OPTIONS`。
 */

import type { AIKind } from '@/components/ref/PlayerPanel';

export interface LabSeat {
  id: string;
  name: string;
  seat: number;
  kind: AIKind;
}

const RAW_SEATS: readonly { name: string; kind: AIKind }[] = [
  { name: '我', kind: 'human' },
  { name: '玄墨真人', kind: 'rule' },
  { name: '清月仙子', kind: 'ismcts' },
  { name: '赤霄散人', kind: 'mccfr' },
  { name: '青岚道友', kind: 'random' },
  { name: '白露剑仙', kind: 'ismcts' },
];

/** 实验室里没有真人座位：human 位换成 ISMCTS（与参考的初始策略一致） */
export const LAB_SEATS: readonly LabSeat[] = RAW_SEATS.map((seat, index) => ({
  id: `p${index}`,
  name: seat.name,
  seat: index,
  kind: seat.kind === 'human' ? 'ismcts' : seat.kind,
}));

/** 参考 `SegmentedSelector` 的玩家人数选项 */
export const LAB_PLAYER_COUNTS: readonly number[] = [2, 3, 4, 5, 6];

/** 参考 `ISMCTS_SIM_OPTIONS = [100, 500, 1000]`（都低于后端钳位上界 2000） */
export const LAB_SIM_OPTIONS: readonly number[] = [100, 500, 1000];

/** 参考 `GAMES_OPTIONS = [10, 50, 100, 500]`（批量对战的局数；当前功能未开放，仅作参数意图） */
export const LAB_GAMES_OPTIONS: readonly number[] = [10, 50, 100, 500];

/** 后端 ismcts 条目的默认 simulations 不在预设里时补一项，避免默认值在界面上“无选中项” */
export function simOptionsWith(fallback: number | null): number[] {
  const base = [...LAB_SIM_OPTIONS];
  if (fallback !== null && Number.isFinite(fallback) && fallback > 0 && !base.includes(fallback)) {
    base.push(fallback);
    base.sort((a, b) => a - b);
  }
  return base;
}

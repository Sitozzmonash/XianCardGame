/**
 * 对战配置页子组件与常量（参考 `components/screens/BattleSetupScreen.tsx`）。
 *
 * - `constants`：人数胶囊 / ISMCTS 预设 / 座位名与 `buildSeats`
 * - `models`：`GET /agents` → MCCFR 模型候选（按人数过滤）
 * - `SetupNotice`：后端不可用 / 演示数据 / 无可用模型等运行期提示条
 */

export {
  ISMCTS_SIM_OPTIONS,
  PLAYER_COUNTS,
  SEAT_NAMES,
  SELF_NAME,
  buildSeats,
  withKind,
} from '@/components/ref/screens/setup/constants';
export type { AgentEntry, MccfrOption } from '@/components/ref/screens/setup/models';
export {
  loadMccfrOptions,
  resolveMccfrSelection,
  toMccfrOptions,
  visibleMccfrOptions,
} from '@/components/ref/screens/setup/models';
export type { NoticeItem } from '@/components/ref/screens/setup/SetupNotice';
export { SetupNotice } from '@/components/ref/screens/setup/SetupNotice';

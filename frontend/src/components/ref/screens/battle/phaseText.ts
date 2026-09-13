/**
 * 阶段文案 + 「有效阶段」判定。
 *
 * 参考原型第 66-69 行是写死的「行动阶段 / 可使用卡牌或结束回合」（原型只有一屏静态画面）。
 * 真后端有 5 个阶段，其中 ACTION 阶段与参考文案完全一致，其余阶段必须说真话。
 *
 * ⚠️ 为什么不能只看 `view.phase`：
 *   后端 `game/state.py` 的 `PHASE_API_NAME` 把 REORDER 阶段下发为 **`"REORDER_TOP"`**
 *   （`docs/API_CONTRACT.md` §12.4 第 425 行也是这个值），而前端 `types/game.ts` 的 `Phase`
 *   只列了 `'REORDER'`，`api/game.ts:normalizePhase()` 遇到白名单外的值会**静默回落成 'ACTION'**。
 *   结果是真后端下 `view.phase === 'REORDER'` 永远为 false —— 按 phase 判断会让排序弹窗永不弹出。
 *   因此这里以**后端给没给该阶段专属动作**为准（`legal_actions` 才是铁律 1 的权威），
 *   并把 phase 只当作佐证。
 */

import type { Phase } from '@/types/game';

export interface PhaseSignals {
  /** 反制窗口：legal_actions 里有 COUNTER / PASS_COUNTER / ESCAPE */
  counter: boolean;
  /** 排序决策：legal_actions 里有 REORDER_TOP */
  reorder: boolean;
  /** 天劫回插：legal_actions 里有 REINSERT_TRIBULATION */
  reinsert: boolean;
}

const KNOWN: readonly string[] = ['ACTION', 'COUNTER', 'REORDER', 'REORDER_TOP', 'REINSERT', 'REINSERT_TRIBULATION', 'ENDED'];

/** 综合 `view.phase` 与动作信号，得出可以放心展示的阶段 */
export function effectivePhaseOf(phase: Phase | string | undefined, signals: PhaseSignals): Phase | string {
  const raw = typeof phase === 'string' ? phase : 'ACTION';
  if (raw === 'ENDED') return 'ENDED';
  if (signals.reorder) return 'REORDER';
  if (signals.reinsert) return 'REINSERT';
  if (signals.counter) return 'COUNTER';
  return KNOWN.includes(raw) ? raw : 'ACTION';
}

export function phaseLabelOf(phase: Phase | string | undefined): string {
  switch (phase) {
    case 'COUNTER':
      return '反制阶段';
    case 'REORDER':
    case 'REORDER_TOP':
      return '逆天改命';
    case 'REINSERT':
    case 'REINSERT_TRIBULATION':
      return '天劫回插';
    case 'ENDED':
      return '终局';
    default:
      return '行动阶段';
  }
}

export function phaseHintOf(params: {
  phase: Phase | string | undefined;
  isMyDecision: boolean;
  decisionPlayerName: string;
  locked: boolean;
  animatingCount: number;
}): string {
  const { phase, isMyDecision, decisionPlayerName, locked, animatingCount } = params;
  // 铁律 2：提交中 / 动画播放中锁定输入，并且要**告诉玩家为什么点不动**
  if (locked) {
    return animatingCount > 0
      ? `事件播放中（剩余 ${animatingCount}）· 输入已锁定`
      : '正在提交动作 · 输入已锁定';
  }
  if (!isMyDecision) return `等待 ${decisionPlayerName} 决策…`;

  switch (phase) {
    case 'COUNTER':
      return '是否反制（见弹窗）';
    case 'REORDER':
    case 'REORDER_TOP':
      return '调整牌堆顶顺序后确认';
    case 'REINSERT':
    case 'REINSERT_TRIBULATION':
      return '选择天劫回插的位置';
    case 'ENDED':
      return '本局已结束';
    default:
      return '可使用卡牌或结束回合';
  }
}

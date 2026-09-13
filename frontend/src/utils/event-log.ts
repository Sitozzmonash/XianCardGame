/**
 * 事件 → 中文文案 / 动画基调（API_CONTRACT.md §13/§14）。
 * 只负责「怎么显示」，不参与任何规则判断。
 */

import type { GameEvent, GameEventType } from '@/types/event';
import { REGION_LABELS, cardNameOf } from './card-catalog';

export type EventTone = 'jade' | 'gold' | 'danger' | 'neutral' | 'muted';

export interface EventPresentation {
  tone: EventTone;
  /** 大字标题（动画层） */
  title: string;
  /** 副标题（动画层 / 日志） */
  detail: string;
  /** 动画时长（毫秒） */
  durationMs: number;
  /** 是否需要一个强调性的全屏效果 */
  impact: boolean;
}

type NameResolver = (playerId: number | null | undefined) => string;

const DEFAULT_DURATION = 700;

function regionLabelOf(event: GameEvent): string {
  const region = (event.data?.region as string | undefined) ?? '';
  return REGION_LABELS[region] ?? (region || '牌堆');
}

export function presentEvent(event: GameEvent, nameOf: NameResolver): EventPresentation {
  // 后端只下发 seq/type/actor/data 四键（见 backend/app/services/events.py:render_event），
  // 牌名、受害者、区域全在 data 里 —— 读顶层字段会恒为 null（曾导致「未知牌」「天机」）。
  const data = event.data ?? {};
  const actor = nameOf(event.actor);
  const other = nameOf(typeof data.target === 'number' ? data.target : null);
  const card = cardNameOf(typeof data.card_id === 'string' ? data.card_id : undefined);
  /** CARD_PLAYED 后端直接给中文牌名，优先用它；兜底用本地卡表 */
  const playedName = typeof data.name === 'string' && data.name ? data.name : card;

  const build = (
    tone: EventTone,
    title: string,
    detail: string,
    durationMs = DEFAULT_DURATION,
    impact = false,
  ): EventPresentation => ({ tone, title, detail, durationMs, impact });

  switch (event.type as GameEventType) {
    case 'GAME_STARTED':
      return build('gold', '天劫试炼开始', '天命已定，各安其位', 1000, true);
    case 'TURN_STARTED':
      return build('jade', `${actor} 的回合`, '轮到其行动', 520);
    case 'CARD_PLAYED':
      return build('jade', `${actor} 打出【${playedName}】`, '灵光一闪', 760);
    case 'CARD_DRAWN':
      return build('muted', `${actor} 抽了一张牌`, '牌面仅本人可见', 520);
    case 'CARD_STOLEN': {
      // 后端故意不回传被偷的牌面（谁被偷是公开的，偷到什么是私有的）——这里绝不能显示牌名。
      // 新规则下反制符会**反弹**，反弹造成的夺取带 redirected=true（actor=反弹方，target=原施术者）。
      return data.redirected === true
        ? build('danger', `${actor} 反夺了 ${other} 的一张牌`, '反制符反弹', 900, true)
        : build('danger', `${actor} 夺走了 ${other} 的一张牌`, '摄物术得手', 900, true);
    }
    case 'COUNTER_OPENED':
      return build('gold', '反制时机', `${other} 是否打出【反制符】？`, 900, true);
    case 'COUNTER_USED':
      // 新规则：反制符 = 令法术效果**转向施术者**（反弹），不再是「取消」
      return data.redirected === true
        ? build('gold', '反制符反弹', `法术效果转向 ${other}`, 1000, true)
        : build('gold', '反制符', `${actor} 打出反制符，效果被挡下`, 900, true);
    case 'COUNTER_PASSED':
      return build('muted', '未反制', `${actor} 选择承受`, 620);
    case 'ESCAPE_DODGED':
      // 新规则：遁术是反制窗口里的反应牌 —— 法术完全无效 + 立即结束本次结算
      return build('jade', '遁术闪避', `${actor} 遁走，${other} 的法术落空`, 900, true);
    case 'DECK_PEEKED':
      return build('jade', '观星术', `${actor} 窥得牌堆顶部`, 700);
    case 'DECK_REORDERED':
      return build('jade', '逆天改命', '牌堆顶顺序已被改写', 900, true);
    case 'DECK_SHUFFLED':
      return build('jade', '扰乱天机', '众修已掌握的牌顶信息全部失效', 900, true);
    case 'TURN_SKIPPED':
      return build('muted', '遁术', `${actor} 遁走，跳过本次抽牌`, 700);
    case 'TRIBULATION_DRAWN':
      return build('danger', '天劫降临', `${actor} 抽到了【天劫】`, 1200, true);
    case 'TRIBULATION_DEFUSED':
      return build('gold', '护劫符化解', `${actor} 以护劫符挡下天劫`, 1100, true);
    case 'TRIBULATION_REINSERTED':
      return build('gold', '天劫回插', `回插至${regionLabelOf(event)}`, 900);
    case 'PLAYER_ELIMINATED':
      // 被淘汰者在 actor 里（backend/app/services/events.py 的 synth 用 _event(..., seat, {})）
      return build('danger', `${actor} 道消身殒`, '无护劫符，退出此局', 1300, true);
    case 'TURN_ENDED':
      return build('muted', `${actor} 结束回合`, '移步下一位道友', 420);
    case 'GAME_ENDED': {
      const winner = event.data?.winner;
      return build(
        'gold',
        typeof winner === 'number' && winner >= 0 ? `${nameOf(winner)} 证得长生` : '对局结束',
        '天劫试炼落幕',
        1400,
        true,
      );
    }
    default:
      return build('neutral', String(event.type), '…', DEFAULT_DURATION);
  }
}

/** 战斗日志单行文案 */
export function eventLogLine(event: GameEvent, nameOf: NameResolver): string {
  const presented = presentEvent(event, nameOf);
  return `[${String(event.seq).padStart(2, '0')}] ${presented.title}${
    presented.detail && presented.detail !== '…' ? ` · ${presented.detail}` : ''
  }`;
}

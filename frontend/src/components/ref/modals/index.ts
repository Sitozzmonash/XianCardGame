/**
 * 四个卡牌交互弹窗 + 两个必要的辅助层，统一出口。
 *
 * 放在 `src/components/ref/modals/*`（铁律：旧的 `src/components/dialogs/*` 一个字都不动）。
 * 每个弹窗对应参考原型的一个文件，逐行映射写在各自文件头。
 */

export { CardActionModal } from './CardActionModal';
export { CounterModal } from './CounterModal';
export { RewriteFateModal, type RewriteRow } from './RewriteFateModal';
export { SoftGlow, SelectionRing } from './SoftGlow';
export { BattleLogModal, SurrenderModal } from './SurrenderModal';
export { TargetSelectModal, type TargetCandidate } from './TargetSelectModal';
export {
  REINSERT_ZONES,
  TribulationReinsertModal,
  type ReinsertZoneId,
} from './TribulationReinsertModal';
export { cardNameOf, cardSubtitleOf, CARD_SUBTITLE } from './cardMeta';

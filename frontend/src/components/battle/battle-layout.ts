/**
 * 对局页响应式骨架（fig3_1）。
 *
 * 所有数值来自 `docs/design_measurements.md` 的颜色掩码实测（1x = 430×932 坐标系）：
 *   顶部鎏金线 y52 / y81 ｜ 轮次栏 y52-81 ｜ 对手区 y93-234 ｜ 阶段带 y234-315
 *   行动条 y381-395 ｜ 法阵 y395-508 ｜ 牌堆/弃牌堆标签 y526-537 ｜ 手牌 y709-817
 *   底部鎏金线 y830 ｜ 按钮区 y830-872 ｜ 手牌 5×70px + 4×8px 间距，左右边距 24
 *
 * 页面**不硬编码绝对像素**：这里把设计值统一乘一个宽度缩放系数 s，宽度方向按比例、
 * 高度方向让「日志 / 中区」弹性伸缩，因此 430×932 完全贴合设计图，其他尺寸也能自适应。
 */
import { useWindowDimensions } from 'react-native';

export const DESIGN = {
  width: 430,
  height: 932,
  /** 顶部轮次栏（上下各有 1px 鎏金线） */
  header: { top: 52, bottom: 81 },
  /** 对手面板 */
  opponents: { top: 93, bottom: 234, cardW: 101, cardH: 141 },
  /** 阶段提示带 */
  phase: { top: 234, bottom: 315 },
  /** 中央法阵 + 行动条 */
  meter: { top: 381, bottom: 395 },
  arena: { top: 395, bottom: 508, size: 118 },
  /** 牌堆 / 弃牌堆 */
  pile: { size: 58, labelTop: 526 },
  /** 手牌 */
  hand: { top: 709, bottom: 817, cardW: 70, gap: 8, margin: 24 },
  /** 底部按钮区 */
  buttons: { top: 830, bottom: 872, height: 42 },
} as const;

/** 卡牌宽高比（实测 70:108） */
export const CARD_ASPECT = 70 / 108;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface BattleLayout {
  width: number;
  height: number;
  /** 宽度缩放系数（设计基准 430） */
  s: number;
  isCompact: boolean;
  isWide: boolean;
  /** 左右安全边距（设计 24） */
  padH: number;
  contentW: number;
  /** 顶部轮次栏 */
  headerH: number;
  /** 对手面板 */
  opponentW: number;
  opponentH: number;
  /** 阶段带 */
  phaseH: number;
  /** 法阵 */
  arenaSize: number;
  /** 牌堆 */
  pileW: number;
  pileH: number;
  /** 手牌：按实际张数自适应（设计 5 张时正好 70×108） */
  handCardW: number;
  handCardH: number;
  handGap: number;
  /** 底部主按钮高 */
  buttonH: number;
  /** 迷你卡（排序弹窗等） */
  miniCardW: number;
  miniCardH: number;
  /** 详情大卡 */
  detailCardW: number;
}

/**
 * 由 `useWindowDimensions()` 推导的对局页尺寸。
 * 卡宽按「可用宽度 / 张数」算，因此手牌从 1 张到 8 张都能居中排布且不溢出。
 */
export function useBattleLayout(handCount = 5): BattleLayout {
  const { width, height } = useWindowDimensions();
  const s = clamp(width / DESIGN.width, 0.84, 1.24);

  const padH = DESIGN.hand.margin * s;
  const contentW = Math.min(width, 720) - padH * 2;
  const handGap = DESIGN.hand.gap * s;

  const count = Math.max(1, handCount);
  // 设计基准：5 张 70px → 350 + 4×8 = 382 = 430 - 2×24
  const rawCardW = (contentW - handGap * (count - 1)) / count;
  const handCardW = clamp(rawCardW, 34, 88 * s * 1.15);
  const handCardH = Math.round(handCardW / CARD_ASPECT);

  return {
    width,
    height,
    s,
    isCompact: width < 360,
    isWide: width >= 768,
    padH,
    contentW: handCardW * count + handGap * (count - 1),
    headerH: (DESIGN.header.bottom - DESIGN.header.top) * s,
    opponentW: DESIGN.opponents.cardW * s,
    opponentH: DESIGN.opponents.cardH * s,
    phaseH: (DESIGN.phase.bottom - DESIGN.phase.top) * s,
    arenaSize: DESIGN.arena.size * s,
    pileW: DESIGN.pile.size * s,
    pileH: DESIGN.pile.size * 1.42 * s,
    handCardW,
    handCardH,
    handGap,
    buttonH: DESIGN.buttons.height * s,
    miniCardW: clamp(34 * s, 30, 46),
    miniCardH: Math.round(clamp(34 * s, 30, 46) / CARD_ASPECT),
    detailCardW: clamp(width * 0.5, 150, 220),
  };
}

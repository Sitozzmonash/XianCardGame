/**
 * 手牌卡面（fig3_1 实测：70×108 @1x，宽高比 0.648，米黄卡面 + 鎏金描边）。
 *
 * 结构（自上而下）：
 *   ① 类型符点 —— 左上角小方块。设计图这里是「费用数字」，但**本游戏无费用**，
 *      按 DESIGN_SPEC §4 改为类型符点（主动 主 / 反制 反 / 天劫 劫 / 护劫 护）。
 *   ② 插画 —— 设计图裁切（见 theme/asset-map.ts）。
 *   ③ 卡名牌 —— 米黄底 + 深色衬线卡名。
 *
 * 四种状态 `idle / playable / selected / disabled` **不只靠颜色区分**（可访问性要求），
 * 每个状态同时改变：描边粗细（1 / 2 / 2.5）、右上角状态角标（无 / 可 / ✓ / ✕）、
 * 抬升位移（0 / -2 / -6）与插画蒙版（仅 disabled），因此色盲/灰度下依然可辨。
 *
 * `state` 由调用方从 `legal_actions` 推导（见 `utils/legal-actions.ts`），本组件不做任何规则判断。
 */
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';

import { nightColors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';
import type { CardCategory } from '@/types/card';
import { CATEGORY_LABELS, cardSpecOf } from '@/utils/card-catalog';
import type { CardVisualState } from '@/utils/legal-actions';

import { CardArt } from './CardArt';

export type CardSize = 'hand' | 'preview' | 'detail';

/** 设计图实测：70 × 108（1x） */
export const HAND_CARD_WIDTH = 70;
export const HAND_CARD_ASPECT = 70 / 108;

interface GameCardProps {
  cardId: string;
  name?: string;
  category?: CardCategory | string | null;
  state?: CardVisualState;
  size?: CardSize;
  width?: number;
  height?: number;
  onPress?: () => void;
  /** 置灰但仍可点开详情（手牌区需要：不可用 ≠ 不能查看说明） */
  pressableWhenDisabled?: boolean;
  footnote?: string;
  /** 右下角小标记，例如张数 */
  cornerLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** 类型符点（代替设计图的费用数字，DESIGN_SPEC §4） */
const TYPE_MARK: Record<CardCategory, { fill: string; text: string; glyph: string }> = {
  TRIBULATION: { fill: nightColors.danger, text: nightColors.card, glyph: '劫' },
  DEFUSE: { fill: '#D9B45C', text: '#1A1408', glyph: '护' },
  ACTIVE: { fill: nightColors.jade, text: '#04140F', glyph: '主' },
  REACTIVE: { fill: nightColors.celadon, text: '#04141A', glyph: '反' },
};

const STATE_RING: Record<CardVisualState, { border: number; color: string; translate: number }> = {
  idle: { border: 1, color: nightColors.cardEdgeSoft, translate: 0 },
  playable: { border: 2, color: nightColors.jade, translate: -2 },
  selected: { border: 2.5, color: '#E3CC91', translate: -7 },
  disabled: { border: 1, color: 'rgba(143, 163, 173, 0.42)', translate: 0 },
};

/** 右上角状态角标 —— 第二通道（形状/文字），不依赖颜色 */
const STATE_CHIP: Record<CardVisualState, { glyph: string; fill: string; text: string } | null> = {
  idle: null,
  playable: { glyph: '可', fill: '#2E7A63', text: '#EAFBF4' },
  selected: { glyph: '✓', fill: '#C9A65A', text: '#1A1408' },
  disabled: { glyph: '✕', fill: 'rgba(20, 32, 40, 0.92)', text: nightColors.muted },
};

export function GameCard({
  cardId,
  name,
  category,
  state = 'idle',
  size = 'hand',
  width,
  height,
  onPress,
  pressableWhenDisabled = false,
  footnote,
  cornerLabel,
  testID,
  style,
}: GameCardProps) {
  const spec = cardSpecOf(cardId);
  const resolvedName = name ?? spec?.name ?? cardId;
  const resolvedCategory = (category ?? spec?.category ?? 'ACTIVE') as CardCategory;
  const typeMark = TYPE_MARK[resolvedCategory] ?? TYPE_MARK.ACTIVE;

  const resolvedWidth = width ?? (size === 'detail' ? 168 : size === 'preview' ? 84 : HAND_CARD_WIDTH);
  const resolvedHeight = height ?? Math.round(resolvedWidth / HAND_CARD_ASPECT);

  const k = resolvedWidth / HAND_CARD_WIDTH;
  const ring = STATE_RING[state];
  const chip = STATE_CHIP[state];
  const radius = Math.max(5, 8 * k);
  const plateH = Math.max(16, resolvedHeight * 0.28);
  const badge = Math.max(12, resolvedWidth * 0.215);

  const interactive =
    typeof onPress === 'function' && (state !== 'disabled' || pressableWhenDisabled);

  const stateWords =
    state === 'disabled'
      ? pressableWhenDisabled
        ? '当前不可用，可查看详情'
        : '当前不可用'
      : state === 'playable'
        ? '可以使用'
        : state === 'selected'
          ? '已选中'
          : '';

  return (
    <Pressable
      testID={testID}
      accessibilityRole={interactive ? 'button' : 'image'}
      accessibilityLabel={`${resolvedName}（${CATEGORY_LABELS[resolvedCategory] ?? ''}）${stateWords}`}
      accessibilityState={{ disabled: !interactive, selected: state === 'selected' }}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrapper,
        { width: resolvedWidth, height: resolvedHeight },
        style,
        pressed && interactive ? styles.pressed : null,
      ]}
    >
      <View
        style={[
          styles.frame,
          {
            borderWidth: ring.border,
            borderColor: ring.color,
            borderRadius: radius,
            transform: [{ translateY: ring.translate }],
            shadowColor: state === 'selected' || state === 'playable' ? nightColors.gold : '#000000',
            shadowOpacity: state === 'selected' ? 0.62 : state === 'playable' ? 0.34 : 0.35,
          },
          state === 'disabled' ? styles.frameDisabled : null,
        ]}
      >
        {/* ① 类型符点 */}
        <View
          style={[
            styles.typeMark,
            {
              width: badge,
              height: badge,
              borderRadius: Math.max(2, badge * 0.24),
              backgroundColor: state === 'disabled' ? 'rgba(20, 34, 42, 0.9)' : typeMark.fill,
              borderColor: state === 'disabled' ? nightColors.disabled : 'rgba(7, 15, 20, 0.45)',
            },
          ]}
        >
          <Text
            style={[
              styles.typeGlyph,
              {
                fontSize: Math.max(8, badge * 0.62),
                color: state === 'disabled' ? nightColors.muted : typeMark.text,
              },
            ]}
            allowFontScaling={false}
          >
            {typeMark.glyph}
          </Text>
        </View>

        {/* ② 插画 */}
        <View style={[styles.artWrap, { marginTop: badge + 3, borderRadius: Math.max(3, radius - 3) }]}>
          <CardArt
            cardId={cardId}
            dimmed={state === 'disabled'}
            radius={Math.max(3, radius - 3)}
            glyphSize={Math.max(14, resolvedWidth * 0.34)}
          />
        </View>

        {/* ③ 卡名牌 */}
        <View style={[styles.plate, { height: plateH, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text
            style={[styles.name, { fontSize: Math.max(8, Math.min(11 * k, 13)) }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {resolvedName}
          </Text>
          {footnote ? (
            <Text style={[styles.meta, { fontSize: Math.max(7, 8 * k) }]} numberOfLines={1} allowFontScaling={false}>
              {footnote}
            </Text>
          ) : null}
        </View>

        {/* 第二通道：右上角状态角标 */}
        {chip ? (
          <View
            style={[
              styles.chip,
              {
                minWidth: badge * 0.92,
                height: badge * 0.92,
                borderRadius: Math.max(2, badge * 0.24),
                backgroundColor: chip.fill,
              },
            ]}
          >
            <Text
              style={[styles.chipText, { color: chip.text, fontSize: Math.max(8, badge * 0.55) }]}
              allowFontScaling={false}
            >
              {chip.glyph}
            </Text>
          </View>
        ) : null}

        {cornerLabel ? (
          <View style={[styles.corner, { borderRadius: badge * 0.3 }]}>
            <Text style={styles.cornerText} allowFontScaling={false}>
              {cornerLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // 尺寸由调用方给出（响应式：battle 用 useBattleLayout 算，cards 页给固定值）
  },
  pressed: {
    opacity: 0.86,
  },
  frame: {
    flex: 1,
    backgroundColor: nightColors.card,
    overflow: 'hidden',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  frameDisabled: {
    backgroundColor: nightColors.cardShade,
  },
  typeMark: {
    position: 'absolute',
    top: 3,
    left: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  typeGlyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
  },
  artWrap: {
    flex: 1,
    marginHorizontal: 3,
    marginBottom: 3,
    overflow: 'hidden',
  },
  plate: {
    borderTopColor: 'rgba(141, 122, 70, 0.55)',
    backgroundColor: nightColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  name: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: '#2A1E0B',
    letterSpacing: 1,
  },
  meta: {
    fontFamily: fontFamily.body,
    color: '#6B5620',
    marginTop: -1,
  },
  chip: {
    position: 'absolute',
    top: 3,
    right: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(7, 15, 20, 0.5)',
  },
  chipText: {
    fontFamily: fontFamily.body,
    fontWeight: '700',
  },
  corner: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(7, 15, 20, 0.86)',
  },
  cornerText: {
    fontFamily: fontFamily.body,
    fontSize: 8,
    color: nightColors.cardEdge,
  },
});

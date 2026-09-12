/**
 * 中央法阵（fig3_1 实测：圆心居中、外径约 118px 的玉绿辉光圆环，下方一行阶段提示）。
 *
 * 只表达「现在是谁的决策点」，不做任何规则判断：
 *   - 我在决策 → 实心玉绿法阵 + 阶段说明；
 *   - 别人在决策 → 虚线冷色法阵 + 「<名字> 正在决策，请稍候」。
 */
import { StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { Phase } from '@/types/game';

import { PHASE_HINTS, PHASE_LABELS } from './BattleHeader';

interface PhaseIndicatorProps {
  phase: Phase;
  /** 当前是否由真人决策（由 decision_player 与 viewer_player_id 比较得到） */
  isViewerDecision: boolean;
  decisionPlayerName?: string;
  /** 保留契约：行动已用 / 上限（现在由 ActionMeter 单独展示，这里仅为兼容调用方） */
  actionsUsed?: number;
  maxActions?: number;
  /** 设计基准 118 */
  size?: number;
  hint?: string;
}

const PHASE_GLYPH: Record<Phase, string> = {
  ACTION: '阵',
  COUNTER: '反',
  REORDER: '序',
  REINSERT: '插',
  ENDED: '终',
};

export function PhaseIndicator({
  phase,
  isViewerDecision,
  decisionPlayerName,
  size = 118,
  hint,
}: PhaseIndicatorProps) {
  const ring = Math.max(70, size);

  return (
    <View style={styles.wrapper}>
      <View
        accessibilityLabel={`${PHASE_LABELS[phase]}，${PHASE_HINTS[phase]}`}
        style={[
          styles.outer,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderColor: isViewerDecision ? 'rgba(78, 178, 148, 0.75)' : nightColors.hairline,
            borderStyle: isViewerDecision ? 'solid' : 'dashed',
          },
        ]}
      >
        <View
          style={[
            styles.mid,
            { width: ring * 0.82, height: ring * 0.82, borderRadius: ring * 0.41 },
          ]}
        >
          <View
            style={[
              styles.inner,
              {
                width: ring * 0.6,
                height: ring * 0.6,
                borderRadius: ring * 0.3,
                borderColor: isViewerDecision ? 'rgba(78, 178, 148, 0.55)' : nightColors.hairline,
              },
            ]}
          >
            <Text
              style={[
                styles.glyph,
                {
                  fontSize: ring * 0.2,
                  color: isViewerDecision ? '#8FE3C8' : nightColors.celadon,
                },
              ]}
              allowFontScaling={false}
            >
              {PHASE_GLYPH[phase]}
            </Text>
            <Text style={styles.phase} allowFontScaling={false}>
              {PHASE_LABELS[phase]}
            </Text>
          </View>
        </View>

        {/* 四角刻度：法阵的「符箓感」，纯装饰 */}
        <View style={[styles.tick, styles.tickTop, { left: ring / 2 - 5 }]} />
        <View style={[styles.tick, styles.tickBottom, { left: ring / 2 - 5 }]} />
        <View style={[styles.tickH, styles.tickLeft, { top: ring / 2 - 5 }]} />
        <View style={[styles.tickH, styles.tickRight, { top: ring / 2 - 5 }]} />
      </View>

      <Text style={styles.hint} numberOfLines={2} allowFontScaling={false}>
        {isViewerDecision ? (hint ?? PHASE_HINTS[phase]) : `${decisionPlayerName ?? '对方'} 正在决策，请稍候…`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  outer: {
    borderWidth: borderWidth.hair,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 32, 42, 0.42)',
  },
  mid: {
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(120, 178, 196, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 22, 29, 0.6)',
  },
  inner: {
    borderWidth: borderWidth.hair,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 15, 20, 0.78)',
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
  },
  phase: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadonLight,
    marginTop: 1,
    letterSpacing: 1,
  },
  tick: {
    position: 'absolute',
    width: 10,
    height: 1,
    backgroundColor: 'rgba(120, 178, 196, 0.5)',
  },
  tickTop: { top: -1 },
  tickBottom: { bottom: -1 },
  tickH: {
    position: 'absolute',
    width: 1,
    height: 10,
    backgroundColor: 'rgba(120, 178, 196, 0.5)',
  },
  tickLeft: { left: -1 },
  tickRight: { right: -1 },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: nightColors.celadon,
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.5,
    maxWidth: 260,
  },
});

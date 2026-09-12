import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';
import type { Phase } from '@/types/game';

import { PHASE_HINTS, PHASE_LABELS } from './BattleHeader';

interface PhaseIndicatorProps {
  phase: Phase;
  /** 当前是否由真人决策 */
  isViewerDecision: boolean;
  decisionPlayerName?: string;
  actionsUsed: number;
  maxActions: number;
  size?: number;
}

/** 战场中心的阶段指示法阵 */
export function PhaseIndicator({
  phase,
  isViewerDecision,
  decisionPlayerName,
  actionsUsed,
  maxActions,
  size = 132,
}: PhaseIndicatorProps) {
  return (
    <View style={styles.wrapper}>
      <View
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
        accessibilityLabel={`${PHASE_LABELS[phase]}，${PHASE_HINTS[phase]}`}
      >
        <View style={[styles.inner, { width: size * 0.76, height: size * 0.76, borderRadius: size * 0.38 }]}>
          <Text style={styles.glyph}>{isViewerDecision ? '阵' : '候'}</Text>
          <Text style={styles.phase}>{PHASE_LABELS[phase]}</Text>
          {isViewerDecision && phase === 'ACTION' ? (
            <Text style={styles.counter}>
              行动 {actionsUsed}/{maxActions}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.hint}>
        {isViewerDecision
          ? PHASE_HINTS[phase]
          : `${decisionPlayerName ?? '对方'} 正在决策，请稍候…`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  circle: {
    borderWidth: borderWidth.hair,
    borderColor: colors.jadeBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,41,41,0.55)',
  },
  inner: {
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,18,19,0.72)',
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontSize: 22,
    color: colors.goldLight,
  },
  phase: {
    ...text.label,
    color: colors.jadeLight,
    marginTop: 2,
  },
  counter: {
    ...text.label,
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  hint: {
    ...text.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});

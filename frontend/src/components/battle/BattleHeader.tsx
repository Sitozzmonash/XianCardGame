import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { GameStatus, Phase } from '@/types/game';

export const PHASE_LABELS: Record<Phase, string> = {
  ACTION: '行动阶段',
  COUNTER: '反制阶段',
  REORDER: '逆天改命',
  REINSERT: '天劫回插',
  ENDED: '对局结束',
};

export const PHASE_HINTS: Record<Phase, string> = {
  ACTION: '可以出牌，或结束行动并抽牌',
  COUNTER: '有人对你出手，决定是否打出反制符',
  REORDER: '为牌堆顶的牌指定新的顺序',
  REINSERT: '把天劫放回牌堆的某个位置',
  ENDED: '本局已经结束',
};

interface BattleHeaderProps {
  round: number;
  turnNo?: number;
  phase: Phase;
  revision: number;
  status: GameStatus;
  modeLabel: string;
  refreshing?: boolean;
  onRefresh: () => void;
  onLeave: () => void;
}

/** 顶部信息条：回合 / 阶段 / revision / 数据源（Round Header） */
export function BattleHeader({
  round,
  turnNo,
  phase,
  revision,
  status,
  modeLabel,
  refreshing = false,
  onRefresh,
  onLeave,
}: BattleHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回首页"
          onPress={onLeave}
          style={styles.iconButton}
        >
          <Text style={styles.iconText}>‹ 首页</Text>
        </Pressable>

        <View style={styles.center}>
          <Text style={styles.round}>第 {round} 回合</Text>
          <Text style={styles.phase}>{PHASE_LABELS[phase]}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新当前局面"
          accessibilityState={{ busy: refreshing }}
          onPress={onRefresh}
          style={styles.iconButton}
        >
          <Text style={styles.iconText}>{refreshing ? '同步中…' : '刷新 ⟳'}</Text>
        </Pressable>
      </View>

      <View style={styles.badges}>
        <Badge label={PHASE_LABELS[phase]} tone={phase === 'COUNTER' ? 'gold' : 'jade'} />
        <Badge label={`revision ${revision}`} tone="neutral" />
        {turnNo !== undefined ? <Badge label={`行动序 ${turnNo}`} tone="muted" /> : null}
        <Badge label={modeLabel} tone="muted" />
        <Badge
          label={status === 'playing' ? '进行中' : status === 'ended' ? '已结束' : String(status)}
          tone={status === 'playing' ? 'jade' : 'gold'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    flex: 1,
  },
  round: {
    ...text.heading,
    fontSize: 18,
  },
  phase: {
    ...text.label,
    color: colors.jadeLight,
  },
  iconButton: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
  },
  iconText: {
    ...text.label,
    color: colors.goldLight,
    fontSize: 11,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    justifyContent: 'center',
  },
});

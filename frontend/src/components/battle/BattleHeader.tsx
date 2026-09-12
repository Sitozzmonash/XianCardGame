/**
 * 顶部轮次栏（fig3_1 实测：上鎏金线 y52、下鎏金线 y81，中央深色胶囊放「第 N 轮 · 阶段」）。
 *
 * 设计图这一带没有返回按钮；但契约要求「认输 = DELETE + 回首页」且要能返回，
 * 因此在左右两端各加一个**低调的小胶囊**（左侧返回、右侧刷新），中间保持设计原样。
 * revision / 数据源 / 状态放在下面一行 9px 小字（不抢视觉，但排障必需）。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { GameStatus, Phase } from '@/types/game';

export const PHASE_LABELS: Record<Phase, string> = {
  ACTION: '行动阶段',
  COUNTER: '反制阶段',
  REORDER: '逆天改命',
  REINSERT: '天劫回插',
  ENDED: '对局结束',
};

export const PHASE_HINTS: Record<Phase, string> = {
  ACTION: '可使用卡牌 或结束回合',
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
  /** 响应式缩放系数（设计基准 1） */
  s?: number;
}

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
  s = 1,
}: BattleHeaderProps) {
  const barH = Math.max(26, 29 * s);

  return (
    <View>
      <View style={styles.rule} />

      <View style={[styles.row, { height: barH }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回首页"
          onPress={onLeave}
          style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
        >
          <Text style={styles.chipText} allowFontScaling={false}>
            ‹ 首页
          </Text>
        </Pressable>

        <View style={styles.pill}>
          <Text style={styles.round} allowFontScaling={false}>
            第 {round} 轮
          </Text>
          <View style={styles.pillDivider} />
          <Text style={styles.phase} allowFontScaling={false}>
            {PHASE_LABELS[phase]}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新当前局面"
          accessibilityState={{ busy: refreshing }}
          onPress={onRefresh}
          style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
        >
          <Text style={styles.chipText} allowFontScaling={false}>
            {refreshing ? '…' : '⟳'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.rule} />

      <Text style={styles.meta} numberOfLines={1} allowFontScaling={false}>
        revision {revision} · {modeLabel} ·{' '}
        {status === 'playing' ? '进行中' : status === 'ended' ? '已结束' : String(status)}
        {turnNo !== undefined ? ` · 行动序 ${turnNo}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rule: {
    height: 1,
    backgroundColor: 'rgba(201, 166, 90, 0.5)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  chip: {
    minWidth: 46,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.hairline,
    backgroundColor: 'rgba(7, 15, 20, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadonLight,
    letterSpacing: 0.5,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(201, 166, 90, 0.55)',
    backgroundColor: 'rgba(7, 15, 20, 0.86)',
  },
  round: {
    fontFamily: fontFamily.title,
    fontSize: 13,
    fontWeight: '700',
    color: nightColors.cardEdge,
    letterSpacing: 1,
  },
  pillDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(201, 166, 90, 0.35)',
  },
  phase: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: nightColors.celadon,
    letterSpacing: 1,
  },
  meta: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
    textAlign: 'center',
    marginTop: 3,
    opacity: 0.85,
  },
});

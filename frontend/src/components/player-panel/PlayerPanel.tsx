import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { PlayerPublicView } from '@/types/game';

interface PlayerPanelProps {
  player: PlayerPublicView;
  isViewer?: boolean;
  compact?: boolean;
}

/** 对手 / 自己面板：只有 PlayerPublicView 的公开信息（API_CONTRACT §8） */
export function PlayerPanel({ player, isViewer = false, compact = false }: PlayerPanelProps) {
  const name = player.name || `P${player.player_id}`;
  const initial = name.slice(0, 1);

  const statusLabel = !player.alive
    ? '已淘汰'
    : player.is_decision_player
      ? '待决策'
      : player.is_current
        ? '行动中'
        : '观战';

  const statusTone = !player.alive
    ? 'danger'
    : player.is_decision_player || player.is_current
      ? 'gold'
      : 'muted';

  const borderColor = !player.alive
    ? colors.disabled
    : player.is_decision_player
      ? colors.gold
      : player.is_current
        ? colors.jadeLight
        : colors.border;

  return (
    <View
      style={[
        styles.panel,
        { borderColor },
        compact ? styles.compact : null,
        !player.alive ? styles.dead : null,
        isViewer ? styles.viewer : null,
      ]}
      accessibilityLabel={`${name}，${statusLabel}，手牌 ${player.hand_count} 张`}
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { borderColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.titleArea}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
            {isViewer ? '（你）' : ''}
          </Text>
          <Text style={styles.agent} numberOfLines={1}>
            {player.agent?.type ? `AI: ${player.agent.type}` : '真人'}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Badge label={statusLabel} tone={statusTone} />
        <Badge label={`手牌 ${player.hand_count}`} tone="neutral" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: borderWidth.hair,
    borderRadius: radius.md,
    backgroundColor: 'rgba(11,41,41,0.82)',
    padding: spacing.sm,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    minWidth: 148,
  },
  compact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 132,
  },
  dead: {
    opacity: 0.55,
  },
  viewer: {
    backgroundColor: 'rgba(15,52,51,0.9)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: borderWidth.hair,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceSunken,
  },
  avatarText: {
    ...text.gold,
    fontSize: 14,
  },
  titleArea: {
    flex: 1,
  },
  name: {
    ...text.bodyStrong,
    fontSize: 13,
  },
  agent: {
    ...text.label,
    fontSize: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
});

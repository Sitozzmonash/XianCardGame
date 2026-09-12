import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

import { AGENT_TYPE_LABELS, agentGlyph, type LabAgent } from './agents';

interface AgentCardProps {
  agent: LabAgent;
  /** 可选中（用于 MCCFR 模型选择）；不传则是只读展示卡 */
  selected?: boolean;
  onSelect?: () => void;
}

function defaultsLine(agent: LabAgent): string | null {
  const parts: string[] = [];
  const { simulations, exploration, maxDepth } = agent.defaults;
  if (simulations !== null) parts.push(`simulations=${simulations}`);
  if (exploration !== null) parts.push(`exploration=${exploration}`);
  if (maxDepth !== null) parts.push(`max_depth=${maxDepth}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * 卡牌式 Agent 卡片：圆形圆章 + 名字 + 类型角标 + 后端给的默认参数。
 * 所有数值都来自 `GET /agents`，前端不编造。
 */
export function AgentCard({ agent, selected = false, onSelect }: AgentCardProps) {
  const typeLabel = AGENT_TYPE_LABELS[agent.type];
  const defaults = defaultsLine(agent);

  const body = (
    <>
      <View style={styles.avatar}>
        <Text style={styles.avatarGlyph}>{agentGlyph(agent.type)}</Text>
      </View>

      <View style={styles.main}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {agent.name}
          </Text>
          <Badge
            label={agent.configurable ? '可配置' : '固定'}
            tone={agent.configurable ? 'jade' : 'muted'}
          />
          {selected ? <Badge label="已选" tone="gold" /> : null}
        </View>

        <Text style={styles.metaLine}>
          {typeLabel ? `${typeLabel} · ` : ''}
          {agent.type} · id {agent.id}
        </Text>

        {defaults ? <Text style={styles.defaults}>后端默认：{defaults}</Text> : null}

        {agent.model ? (
          <Text style={styles.model} numberOfLines={1}>
            模型：{agent.model}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (!onSelect) {
    return <View style={styles.card}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`选用 ${agent.name}`}
      onPress={onSelect}
      style={[styles.card, selected ? styles.cardSelected : null]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    minHeight: minTouchTarget,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  cardSelected: {
    borderColor: colors.goldLight,
    backgroundColor: colors.surfaceRaised,
  },
  avatar: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    borderWidth: borderWidth.hair,
    borderColor: colors.borderStrong,
    marginRight: spacing.md,
  },
  avatarGlyph: {
    ...text.heading,
    fontSize: 18,
    color: colors.goldLight,
  },
  main: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  name: {
    ...text.bodyStrong,
    color: colors.paper,
    marginRight: spacing.xs,
  },
  metaLine: {
    ...text.label,
    color: colors.muted,
    marginTop: spacing.xxs,
  },
  defaults: {
    ...text.label,
    color: colors.jadeLight,
    marginTop: spacing.xxs,
  },
  model: {
    ...text.label,
    color: colors.goldLight,
    marginTop: spacing.xxs,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

interface LabNotesProps {
  notes: readonly { title: string; detail: string }[];
}

/**
 * 底部小字：算法限制。
 * 这些是**真实约束**（INTERFACES §2 / spec §33 / RUNBOOK §4.1），不是免责套话：
 * 用户据此才知道「AI 实验室」能给出什么、不能给出什么。
 */
export function LabNotes({ notes }: LabNotesProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.head}>算法限制（真实约束，非免责声明）</Text>
      {notes.map((note) => (
        <View key={note.title} style={styles.item}>
          <Text style={styles.title}>· {note.title}</Text>
          <Text style={styles.detail}>{note.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: borderWidth.hair,
    borderTopColor: colors.border,
    borderRadius: radius.sm,
  },
  head: {
    ...text.label,
    color: colors.gold,
    marginBottom: spacing.xs,
  },
  item: {
    marginBottom: spacing.xs,
  },
  title: {
    ...text.label,
    color: colors.muted,
  },
  detail: {
    ...text.label,
    color: colors.textFaint,
    lineHeight: 16,
  },
});

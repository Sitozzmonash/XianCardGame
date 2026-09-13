/**
 * 参考原型 `components/game/PlayerPanel.tsx` 的 RN 移植（1:1）。
 * 配置页的单个座位行：头像 + 名字 + 身份说明 + （真人显示 Human 标签 / AI 显示策略选择）。
 */

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PlayerAvatar } from '@/components/ref/PlayerAvatar';
import { AISelector, StatusTag } from '@/components/ref/primitives';
import { cream, creamFaint, gold, ink, jade, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export type AIKind = 'human' | 'random' | 'rule' | 'ismcts' | 'mccfr';

export const AI_LABEL: Record<AIKind, string> = {
  human: 'Human',
  random: 'Random',
  rule: 'Rule',
  ismcts: 'ISMCTS',
  mccfr: 'MCCFR',
};

export const AI_OPTIONS: AIKind[] = ['random', 'rule', 'ismcts', 'mccfr'];

export interface SeatView {
  id: string;
  name: string;
  title: string;
  seat: number;
  kind: AIKind;
  handCount: number;
  alive: boolean;
  isSelf?: boolean;
}

export function PlayerPanel({
  seat,
  onKindChange,
  style,
}: {
  seat: SeatView;
  onKindChange?: (kind: AIKind) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const isSelf = seat.kind === 'human';

  return (
    <View style={[styles.row, isSelf ? styles.rowSelf : styles.rowAI, style]}>
      <View style={styles.inner}>
        <PlayerAvatar name={seat.name} seat={seat.seat} size="md" />

        <View style={styles.textCol}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>
            {seat.name}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.title}>
            {seat.title}
          </Text>
        </View>

        {isSelf ? (
          <StatusTag tone="gold" style={styles.selfTag} textStyle={styles.selfTagText}>
            {AI_LABEL.human}
          </StatusTag>
        ) : null}
      </View>

      {!isSelf ? (
        <AISelector
          style={{ marginTop: sp(3) }}
          value={AI_LABEL[seat.kind]}
          options={AI_OPTIONS.map((kind) => AI_LABEL[kind])}
          onChange={(label) => {
            const kind = (Object.keys(AI_LABEL) as AIKind[]).find((k) => AI_LABEL[k] === label);
            if (kind) onKindChange?.(kind);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: sp(3),
  },
  rowSelf: { borderColor: rgba(gold[500], 0.45), backgroundColor: rgba(jade[800], 0.25) },
  rowAI: { borderColor: rgba(gold[500], 0.25), backgroundColor: rgba(ink[850], 0.6) },
  inner: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  textCol: { flex: 1, minWidth: 0 },
  name: { ...serif(600), fontSize: 15, letterSpacing: track(0.025, 15), color: cream },
  title: { ...sans(400), fontSize: 11, letterSpacing: track(0.025, 11), color: creamFaint, marginTop: 2 },
  selfTag: { paddingHorizontal: sp(3), paddingVertical: sp(1) },
  selfTagText: { fontSize: 12 },
});

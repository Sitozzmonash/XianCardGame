/**
 * 「座位策略」区 —— 1:1 复刻参考 `components/screens/AILabScreen.tsx:46-73`。
 *
 * 参考每行：`rounded-2xl border-gold-500/25 bg-ink-850/60 px-3.5 py-3`
 *   → 头像 sm + 名字（14px 衬线 600 tracking-wide, text-cream）+ `P{seat}`（10px 无衬线 faint）
 *   → 下方 `AISelector`（`mt-2.5`，方角小标签，选项 = Random/Rule/ISMCTS/MCCFR）。
 * 策略标签与可选集合复用冻结层的 `AI_LABEL` / `AI_OPTIONS`（与配置页同一套 1:1 文案）。
 */

import { StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/ref/PlayerAvatar';
import { AI_LABEL, AI_OPTIONS, type AIKind } from '@/components/ref/PlayerPanel';
import { AISelector } from '@/components/ref/primitives';
import type { LabSeat } from '@/components/ref/screens/ailab/lab-seats';
import { cream, creamFaint, gold, ink, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

const KIND_BY_LABEL = AI_LABEL as Record<AIKind, string>;

function kindFromLabel(label: string): AIKind | undefined {
  return (Object.keys(KIND_BY_LABEL) as AIKind[]).find((kind) => KIND_BY_LABEL[kind] === label);
}

export function SeatStrategyList({
  seats,
  kinds,
  onKindChange,
  warning,
}: {
  seats: readonly LabSeat[];
  kinds: readonly AIKind[];
  onKindChange: (index: number, kind: AIKind) => void;
  /** 数据条件下的提示（例如当前人数没有 MCCFR 模型）；正常情况为 undefined，不占位 */
  warning?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.list}>
        {seats.map((seat, index) => {
          const kind = kinds[index] ?? seat.kind;
          return (
            <View key={seat.id} style={styles.row}>
              <View style={styles.head}>
                <PlayerAvatar name={seat.name} seat={seat.seat} size="sm" />
                <View style={styles.textCol}>
                  <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>
                    {seat.name}
                  </Text>
                  <Text allowFontScaling={false} style={styles.seatLabel}>
                    P{seat.seat}
                  </Text>
                </View>
              </View>
              <AISelector
                style={styles.selector}
                value={KIND_BY_LABEL[kind]}
                options={AI_OPTIONS.map((option) => AI_LABEL[option])}
                onChange={(label) => {
                  const next = kindFromLabel(label);
                  if (next) onKindChange(index, next);
                }}
              />
            </View>
          );
        })}
      </View>
      {warning ? (
        <Text allowFontScaling={false} style={styles.warning}>
          {warning}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(2) },
  list: { gap: 10 },
  row: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.25),
    backgroundColor: rgba(ink[850], 0.6),
    paddingHorizontal: 14,
    paddingVertical: sp(3),
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  textCol: { flex: 1, minWidth: 0 },
  name: { ...serif(600), fontSize: 14, letterSpacing: track(0.025, 14), color: cream },
  seatLabel: { ...sans(400), fontSize: 10, letterSpacing: track(0.025, 10), color: creamFaint },
  selector: { marginTop: 10 },
  warning: { ...sans(400), fontSize: 10, lineHeight: 14, color: creamFaint },
});

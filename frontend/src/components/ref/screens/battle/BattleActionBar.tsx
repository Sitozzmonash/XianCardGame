/**
 * 底部两列按钮 —— 参考 `BattleScreen.tsx` 第 97–109 行原样移植。
 *
 *   第 98 行 `mt-3 grid grid-cols-2 gap-3 border-t border-gold-500/15 bg-ink-950/70 px-4 py-4 backdrop-blur-sm`
 *   第 99-101 行 `SecondaryButton`「认输」，`py-3 text-base`
 *   第 102-108 行 金色渐变按钮（`border-gold-500/60` + `linear-gradient(180deg,#d8bd85,#c9a86a 55%,#a8874a)`
 *                + 16px serif 600 `tracking-[0.18em]` 墨色字）「结束回合」
 *
 * `结束回合` 直接绑后端 `END_ACTION`：没有这个动作就 disable（铁律 1），不做假按钮。
 */

import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/ref/primitives';
import { creamFaint, gold, ink, rgba, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export function BattleActionBar({
  onSurrender,
  onEndTurn,
  endEnabled,
  endLabel,
  endHint,
  submitting,
}: {
  onSurrender: () => void;
  onEndTurn: () => void;
  endEnabled: boolean;
  endLabel?: string;
  endHint?: string;
  submitting: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(ink[950], 0.7) }]} />

      <View style={styles.row}>
        <SecondaryButton
          fullWidth={false}
          style={styles.item}
          textStyle={styles.secondaryText}
          disabled={submitting}
          onPress={onSurrender}
        >
          认输
        </SecondaryButton>

        <PrimaryButton
          tone="gold"
          fullWidth={false}
          style={styles.item}
          textStyle={styles.goldText}
          disabled={!endEnabled || submitting}
          onPress={onEndTurn}
        >
          {endLabel ?? '结束回合'}
        </PrimaryButton>
      </View>

      {!endEnabled && endHint ? (
        <Text style={styles.hint} allowFontScaling={false}>
          {endHint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: sp(3),
    borderTopWidth: 1,
    borderTopColor: rgba(gold[500], 0.15),
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(4) },
  item: { flex: 1, paddingVertical: sp(3) },
  secondaryText: { fontSize: 16, letterSpacing: track(0.18, 16) },
  goldText: { fontSize: 16, letterSpacing: track(0.18, 16) },
  hint: {
    ...sans(400),
    fontSize: 10,
    color: creamFaint,
    textAlign: 'center',
    paddingBottom: sp(3),
    marginTop: -sp(2),
  },
});

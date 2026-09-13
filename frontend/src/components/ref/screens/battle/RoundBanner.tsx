/**
 * 顶部轮次胶囊 —— 参考 `BattleScreen.tsx` 第 30–37 行原样移植。
 *
 *   第 31 行 `relative z-10 flex justify-center pt-5`
 *   第 32 行 `rounded-full border border-gold-500/50 bg-ink-950/80 px-5 py-1.5 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.9)]`
 *   第 33-35 行 13px serif 600 `tracking-[0.16em]` 金 300 的「第 N 轮（回合对决）」
 *
 * 额外：右上角放一个「战报」图标按钮（参考此处在竖屏手机上是空的；本仓库需要一个
 * 回看事件事实的入口，用它承载战报弹窗 —— 圆形金边 IconButton 与首页齿轮同族）。
 */

import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/ref/primitives';
import { gold, ink, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export function RoundBanner({ round, onLogPress }: { round: number; onLogPress?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.capsule}>
        <Text style={styles.text} allowFontScaling={false}>
          第 {round} 轮（回合对决）
        </Text>
      </View>

      {onLogPress ? (
        <IconButton label="战报" onPress={onLogPress} style={styles.logButton}>
          <Text style={styles.logGlyph} allowFontScaling={false}>
            报
          </Text>
        </IconButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', paddingTop: sp(5), position: 'relative' },
  capsule: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.5),
    backgroundColor: rgba(ink[950], 0.8),
    paddingHorizontal: sp(5),
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
    elevation: 6,
  },
  text: { ...serif(600), fontSize: 13, letterSpacing: track(0.16, 13), color: gold[300] },
  logButton: { position: 'absolute', right: sp(4), top: sp(5) - 4 },
  logGlyph: { ...serif(600), fontSize: 13, color: gold[300] },
});

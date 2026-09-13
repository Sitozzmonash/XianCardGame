/**
 * TopBar 右侧的小胶囊 —— 1:1 复用参考 `ResultScreen.tsx:32-40` 那颗 pill 的样式：
 *   `rounded-full border border-gold-500/30 px-3 py-1 font-sans text-[10px] tracking-wider text-cream-faint`
 *
 * ⚠️ 参考那颗 pill 的文案是「切换结局」，点一下把 `success` 取反 —— 那是原型用来演示两种结局的
 * **调试开关**（吃的是写死的 `MOCK_RESULT`）。真数据下没有「切换结局」这回事：胜者由后端裁定，
 * 前端不能伪造结局，所以这个槽位不做假按钮，只在**对局还没结束**时如实挂一个状态胶囊。
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { creamFaint, gold, radius, rgba, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <View style={styles.pill}>
      <Text allowFontScaling={false} style={styles.text}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.3),
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: { ...sans(400), fontSize: 10, letterSpacing: track(0.05, 10), color: creamFaint },
});

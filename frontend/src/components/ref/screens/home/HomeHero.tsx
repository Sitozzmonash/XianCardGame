/**
 * 首页居中标题组 —— 对应参考 `HomeScreen.tsx` 第 36–45 行（逐行）：
 *
 *   <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
 *     <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_42%_at_50%_50%,…)]" />
 *     <p className="relative font-sans text-[11px] font-medium tracking-[0.42em] text-jade-300">天命既定 · 亦可改之</p>
 *     <h1 className="relative mt-3 font-serif text-[52px] font-black leading-none tracking-[0.1em]
 *                    text-cream text-glow-gold">天劫战牌</h1>
 *     <div className="gold-hairline relative mt-4 h-px w-40" />
 *     <p className="relative mt-4 font-sans text-xs tracking-[0.24em] text-cream">2-6 人 · 策略卡牌 · 修仙主题</p>
 *   </div>
 *
 * 遮罩需要按容器尺寸算椭圆半径，所以这里自己 `onLayout` 量一次再画（参考里是 CSS 自动算的）。
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GoldHairline, glowGold } from '@/components/ref/primitives';
import { TitleScrim } from '@/components/ref/screens/home/TitleScrim';
import { cream, jade, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export function HomeHero() {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  return (
    <View
      style={styles.hero}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setBox((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
        }
      }}
    >
      {box ? <TitleScrim width={box.w} height={box.h} /> : null}

      <Text allowFontScaling={false} style={styles.subtitle}>
        天命既定 · 亦可改之
      </Text>
      <Text allowFontScaling={false} style={styles.title}>
        天劫战牌
      </Text>
      <GoldHairline style={styles.hairline} />
      <Text allowFontScaling={false} style={styles.tagline}>
        2-6 人 · 策略卡牌 · 修仙主题
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp(6),
  },
  subtitle: {
    ...sans(500),
    fontSize: 11,
    letterSpacing: track(0.42, 11),
    color: jade[300],
  },
  title: {
    ...serif(900),
    fontSize: 52,
    lineHeight: 52, // leading-none
    letterSpacing: track(0.1, 52),
    color: cream,
    marginTop: sp(3),
    ...glowGold(52),
  },
  hairline: { width: 160, marginTop: sp(4) },
  tagline: {
    ...sans(400),
    fontSize: 12,
    letterSpacing: track(0.24, 12),
    color: cream,
    marginTop: sp(4),
  },
});

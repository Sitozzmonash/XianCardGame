/**
 * 首页 —— 参考原型 `docs/reference-next/components/screens/HomeScreen.tsx` 的 1:1 移植。
 *
 * 参考行号 → 本文件：
 *   9          `relative flex h-full flex-col overflow-hidden` 根容器  → `styles.root`（flex / 底色 / overflow-hidden）
 *   10         `<GameBackdrop variant="home" />`                        → 第 42 行
 *   13–24      主角立绘 + `radial-gradient` 羽化遮罩（`inset-x-0 bottom-[150px] top-[92px]`）
 *                                                                       → 第 45 行 `<HeroArt />`
 *   25         法阵 300×300，居中于 `top 38%`，opacity .70              → 第 48 行 `<MagicCircle />`
 *   27–34      右上设置齿轮 `px-5 pt-6 justify-end`（36×36 圆形金边）    → 第 51–56 行
 *   36–45      居中标题组：标题遮罩 + 副标题 + 52px 主标 + 金发丝线 + 标签行
 *                                                                       → 第 59 行 `<HomeHero />`
 *   47–58      底部 `space-y-3 px-6 pb-6`：`开启对决` 主按钮 / 两列次按钮 / 排位赛小字
 *                                                                       → 第 61–97 行
 *
 * 说明（仅以下两处按项目实际调整，版式、字号、间距、文案均照抄参考）：
 *   - 参考里「AI 对战」跳 `ailab` 屏；本项目 AI 实验室在 `/ai-lab`，导航统一走 `/setup`
 *     （走向写在外层 accessible 容器的 `accessibilityLabel` 里）。
 *   - 「论道对战（排位赛）· 赛季结算倒计时：4 天」在参考里就是一句不可点的小字；本项目
 *     没有排位赛/赛季系统，故保持不可点并加「未开放」角标（移植规格 §7.5：不做假链接）。
 */

import Head from 'expo-router/head';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameBackdrop, MagicCircle } from '@/components/ref/Backdrop';
import { SettingsIcon } from '@/components/ref/Icons';
import { IconButton, PrimaryButton, SecondaryButton, StatusTag } from '@/components/ref/primitives';
import { HeroArt, HomeHero } from '@/components/ref/screens/home';
import { creamDim, creamFaint, ink, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <Head>
        <title>天劫战牌 · 修仙策略卡牌</title>
        <meta
          name="description"
          content="2–6 人隐藏信息修仙卡牌游戏：抽到天劫且无护劫符即淘汰，最后存活者获胜。"
        />
      </Head>

      <GameBackdrop variant="home" />

      {/* 主角立绘（`inset-x-0 bottom-[150px] top-[92px]`，opacity .9，径向羽化） */}
      <HeroArt />

      {/* 法阵：`left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 opacity-70` */}
      <MagicCircle size={300} style={styles.magicCircle} />

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        {/* `flex items-center justify-end px-5 pt-6`：设置齿轮 */}
        <View style={styles.topRow}>
          <IconButton label="设置（未开放）">
            <SettingsIcon size={16} color={creamDim} />
          </IconButton>
        </View>

        {/* `flex flex-1 flex-col items-center justify-center px-6 text-center` */}
        <HomeHero />

        {/* `space-y-3 px-6 pb-6` */}
        <View style={styles.bottom}>
          <PrimaryButton fullWidth onPress={() => router.push('/setup')}>
            开启对决
          </PrimaryButton>

          <View style={styles.buttonRow}>
            <SecondaryButton style={styles.flexButton} onPress={() => router.push('/cards')}>
              卡牌图鉴
            </SecondaryButton>
            {/*
              参考里这一格跳 `ailab` 屏；本项目 AI 实验室在 `/ai-lab`，导航统一走 `/setup`。
              冻结的 `SecondaryButton` 不接受 `accessibilityLabel`，所以把走向写在外层的
              accessible 容器上（视觉与文案仍与参考逐字一致）。
            */}
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="AI 对战（进入对战配置页；AI 实验室在 /ai-lab）"
              style={styles.flexButton}
            >
              <SecondaryButton fullWidth onPress={() => router.push('/setup')}>
                AI 对战
              </SecondaryButton>
            </View>
          </View>

          {/* `pt-1 text-center text-[10px] tracking-[0.16em] text-cream-faint` + 「未开放」角标 */}
          <View style={styles.rankedRow}>
            <Text allowFontScaling={false} style={styles.rankedText}>
              论道对战（排位赛）· 赛季结算倒计时：4 天
            </Text>
            <StatusTag tone="muted" style={styles.rankedTag} textStyle={styles.rankedTagText}>
              未开放
            </StatusTag>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ink[950], overflow: 'hidden' },
  safe: { flex: 1 },
  magicCircle: {
    position: 'absolute',
    left: '50%',
    top: '38%',
    marginLeft: -150,
    marginTop: -150,
    opacity: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: sp(5),
    paddingTop: sp(6),
  },
  bottom: { paddingHorizontal: sp(6), paddingBottom: sp(6), gap: sp(3) },
  buttonRow: { flexDirection: 'row', gap: sp(3) },
  flexButton: { flex: 1 },
  rankedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
    paddingTop: sp(1),
  },
  rankedText: {
    ...sans(400),
    fontSize: 10,
    letterSpacing: track(0.16, 10),
    color: creamFaint,
  },
  rankedTag: { alignSelf: 'center', paddingHorizontal: sp(2), paddingVertical: 0 },
  rankedTagText: { fontSize: 9, letterSpacing: track(0.1, 9) },
});

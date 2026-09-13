import { router, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';

import { TopBar } from '@/components/ref/primitives';
import { PrimaryButton, SecondaryButton } from '@/components/ref/primitives';
import { ScreenShell } from '@/components/ref/ScreenShell';
import { cream, creamDim, creamFaint, gold, ink, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

/**
 * 404 兜底页（`+not-found`）—— 参考原型里没有这一屏（它是纯原型，只有 7 个页面），
 * 因此按新设计体系的 token 自建，风格与其它页保持一致：夜蓝底 + 玉绿/鎏金 + 宋体标题。
 *
 * 印记位置显示出错路径，方便排查；入口列表与真实路由一致。
 */
export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <ScreenShell variant="plain">
      <Head>
        <title>此路不通 · 天劫试炼</title>
      </Head>

      <TopBar title="此路不通" eyebrow="天劫试炼" onBack={() => router.replace('/')} />

      <View style={styles.wrap}>
        <View style={styles.seal}>
          <Text style={styles.sealText}>迷</Text>
        </View>

        <Text style={styles.path} numberOfLines={1}>
          {pathname}
        </Text>

        <View style={styles.rule} />

        <Text style={styles.hint}>
          此界之外并无洞天。天劫试炼只有这几处入口：首页、对战配置、对局、结算、卡牌图鉴、卡牌详情、AI 实验室。
        </Text>

        <View style={styles.actions}>
          <PrimaryButton fullWidth onPress={() => router.replace('/')}>
            返回首页
          </PrimaryButton>
          <SecondaryButton fullWidth onPress={() => router.replace('/cards')}>
            卡牌图鉴
          </SecondaryButton>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  seal: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.5),
    backgroundColor: rgba(ink[900], 0.7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: {
    ...serif(700),
    fontSize: 40,
    color: gold[300],
    textShadowColor: rgba(gold[500], 0.45),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  path: {
    ...sans(400),
    marginTop: 20,
    fontSize: 11,
    letterSpacing: track(0.16, 11),
    color: creamFaint,
  },
  rule: {
    width: 160,
    height: 1,
    marginTop: 16,
    backgroundColor: rgba(gold[500], 0.45),
  },
  hint: {
    ...sans(400),
    marginTop: 16,
    maxWidth: 320,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 20,
    color: creamDim,
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    marginTop: 28,
    gap: 10,
  },
});

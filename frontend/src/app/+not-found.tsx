import { router, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { SectionRule } from '@/components/ai-lab';
import { Seal404 } from '@/components/not-found';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

/**
 * 404 兜底页（`+not-found`）—— 与「配置 / 工具」类页面同一套墨玉色板 `colors`：
 * 墨玉底 + 鎏金描边 + 米黄文字，印范式 404 印记。
 */
export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <ScreenBackground variant="home" contentStyle={styles.content}>
      <Head>
        <title>此路不通 · 修仙卡牌</title>
      </Head>

      <View style={styles.wrap}>
        <Seal404 path={pathname} />

        <Text style={styles.title}>此路不通</Text>
        <SectionRule />
        <Text style={styles.hint}>
          此界之外并无洞天。天劫试炼只有这几处入口：首页、对战配置、对局、结算、卡牌图鉴、AI 实验室。
        </Text>

        <View style={styles.actions}>
          <PrimaryButton
            label="返回首页"
            variant="jade"
            glyph="归"
            onPress={() => router.replace('/')}
            testID="not-found-home"
          />
          <PrimaryButton
            label="卡牌图鉴"
            variant="ghost"
            onPress={() => router.replace('/cards')}
            testID="not-found-cards"
          />
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  title: {
    ...text.title,
    marginTop: spacing.xl + spacing.lg,
    color: colors.paper,
  },
  hint: {
    ...text.caption,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});

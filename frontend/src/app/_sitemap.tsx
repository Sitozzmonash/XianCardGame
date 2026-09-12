import { router } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

const ROUTES = [
  { path: '/', label: '首页 Home' },
  { path: '/setup', label: '对局设置 Setup' },
  { path: '/battle', label: '对局中 Battle' },
  { path: '/cards', label: '卡牌图鉴 Cards' },
  { path: '/result', label: '对局结算 Result' },
  { path: '/ai-lab', label: 'AI 实验室' },
];

/** expo-router 默认生成的 /_sitemap 页面（导出时也会产出 HTML，因此补一个真实标题） */
export default function SitemapScreen() {
  return (
    <ScreenBackground variant="home" scroll contentStyle={styles.content}>
      <Head>
        <title>站点地图 · 修仙卡牌</title>
      </Head>
      <View style={styles.wrap}>
        <Text style={styles.title}>站点地图</Text>
        <Text style={styles.hint}>天劫试炼 V1 · 共 {ROUTES.length} 个页面</Text>
        {ROUTES.map((route) => (
          <View key={route.path} style={styles.row}>
            <PrimaryButton
              label={`${route.label}  ${route.path}`}
              variant="ghost"
              onPress={() => router.push(route.path as never)}
            />
          </View>
        ))}
        <PrimaryButton label="返回首页" variant="gold" onPress={() => router.replace('/')} />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  wrap: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    ...text.title,
    textAlign: 'center',
  },
  hint: {
    ...text.caption,
    textAlign: 'center',
    marginBottom: spacing.md,
    color: colors.muted,
  },
  row: {
    width: '100%',
  },
});

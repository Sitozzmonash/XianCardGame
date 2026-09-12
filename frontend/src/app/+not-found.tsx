import { router } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

export default function NotFoundScreen() {
  return (
    <ScreenBackground variant="home" contentStyle={styles.content}>
      <Head>
        <title>页面不存在 · 修仙卡牌</title>
      </Head>
      <View style={styles.wrap}>
        <Text style={styles.code}>404</Text>
        <Text style={styles.title}>此路不通</Text>
        <Text style={styles.hint}>该页不在天劫试炼之中，请返回首页重新择路。</Text>
        <View style={styles.actions}>
          <PrimaryButton label="返回首页" variant="gold" onPress={() => router.replace('/')} />
          <PrimaryButton label="卡牌图鉴" variant="ghost" onPress={() => router.replace('/cards')} />
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
    paddingHorizontal: spacing.lg,
  },
  code: {
    ...text.display,
    fontSize: 48,
    color: colors.danger,
    letterSpacing: 6,
  },
  title: {
    ...text.title,
    marginTop: spacing.sm,
  },
  hint: {
    ...text.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
  },
});

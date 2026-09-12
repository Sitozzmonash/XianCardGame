import { router } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

/**
 * AI 实验室：INTERFACES §5 允许的占位页（明确 disabled，不做假链接）。
 */
export default function AiLabScreen() {
  return (
    <ScreenBackground variant="home" scroll contentStyle={styles.content}>
      <Head>
        <title>AI 实验室 · 修仙卡牌</title>
      </Head>
      <View style={styles.header}>
        <View style={styles.back}>
          <PrimaryButton label="‹ 返回" variant="ghost" onPress={() => router.back()} />
        </View>
        <Text style={styles.title}>AI 实验室</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.badgeRow}>
        <Badge label="V1 未实现" tone="danger" />
        <Badge label="占位页" tone="muted" />
      </View>

      <Panel title="规划中的能力（本阶段全部 disabled）" tone="jade" style={styles.panel}>
        <Text style={styles.item}>· 单步骤自我对弈：随机 / rule / ISMCTS / MCCFR 互搏并回放棋谱</Text>
        <Text style={styles.item}>· 训练曲线查看：logs/train_metrics.jsonl 可视化（iter/s、信息集数量）</Text>
        <Text style={styles.item}>· Elo 与胜率置信区间：直接读 backend/evaluation 的输出</Text>
        <Text style={styles.item}>· 模型热切换：不改状态的情况下替换某个座位的 .pkl</Text>
      </Panel>

      <Panel title="为什么现在不做" style={styles.panel}>
        <Text style={styles.item}>
          V1 的目标是「先把完整一局做好」（TECH_ARCHITECTURE §13）：本阶段不做数据库、登录、排行榜、
          真人 PvP、服务端训练与复杂 WebSocket。
        </Text>
        <Text style={styles.item}>
          当前可用的替代路径：Setup 页选择 ISMCTS / MCCFR 座位，即可在真实对局里观察 AI 行为。
        </Text>
      </Panel>

      <View style={styles.actions}>
        <PrimaryButton
          label="去设置人机对局"
          variant="gold"
          onPress={() => router.replace('/setup')}
        />
        <PrimaryButton label="返回首页" variant="ghost" onPress={() => router.replace('/')} />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  back: {
    minWidth: 88,
  },
  title: {
    ...text.title,
    fontSize: 22,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  panel: {
    width: '100%',
    marginBottom: spacing.md,
  },
  item: {
    ...text.caption,
    marginBottom: spacing.sm,
    color: colors.textFaint,
    lineHeight: 20,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
});

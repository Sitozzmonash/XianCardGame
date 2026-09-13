import { router } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';

import { GoldHairline, PrimaryButton, SectionTitle, TopBar } from '@/components/ref/primitives';
import { ScreenShell, ScrollBody } from '@/components/ref/ScreenShell';
import { creamDim, creamFaint, gold, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

/** 真实路由（与 `src/app/**` 一致；`card/[cardId]` 有 8 个静态产物） */
const ROUTES: { path: string; label: string; note: string }[] = [
  { path: '/', label: '首页', note: '标题 / 主角立绘 / 三个入口' },
  { path: '/setup', label: '对战配置', note: '人数、座位与对手、AI 参数' },
  { path: '/battle', label: '对局', note: '轮次、对手、法阵、牌堆、手牌' },
  { path: '/cards', label: '卡牌图鉴', note: '按类目筛选的 8 张牌' },
  { path: '/card/STARGAZING', label: '卡牌详情', note: '效果 / 引语 / 相关牌 / 使用卡牌' },
  { path: '/result', label: '结算', note: '结局、统计、名次' },
  { path: '/ai-lab', label: 'AI 实验室', note: '模型清单、参数、开战' },
];

/** expo-router 默认生成的 /_sitemap 页面（静态导出也会产出 HTML，因此补真实标题与可读入口） */
export default function SitemapScreen() {
  return (
    <ScreenShell variant="plain">
      <Head>
        <title>站点地图 · 天劫试炼</title>
      </Head>

      <TopBar title="站点地图" eyebrow="天劫试炼" onBack={() => router.replace('/')} />

      <ScrollBody>
        <Text style={styles.hint}>共 {ROUTES.length} 个页面 · 点击直达</Text>

        <View style={styles.list}>
          {ROUTES.map((route) => (
            <View key={route.path} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.label}>{route.label}</Text>
                <Text style={styles.path}>{route.path}</Text>
                <Text style={styles.note}>{route.note}</Text>
              </View>
              <PrimaryButton onPress={() => router.push(route.path as never)}>
                进入
              </PrimaryButton>
            </View>
          ))}
        </View>

        <GoldHairline opacity={0.5} />

        <SectionTitle>说明</SectionTitle>
        <Text style={styles.foot}>
          静态导出时每页各产出一个 HTML；`/card/[cardId]` 由 `generateStaticParams()` 生成 8 个具体卡牌页。
        </Text>
      </ScrollBody>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...sans(400),
    fontSize: 12,
    letterSpacing: track(0.08, 12),
    color: creamFaint,
  },
  list: { gap: sp(2.5), marginTop: sp(3) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    paddingHorizontal: sp(3.5),
    paddingVertical: sp(3),
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.25),
    backgroundColor: rgba('#0a1e1c', 0.6),
  },
  rowText: { flex: 1 },
  label: { ...serif(600), fontSize: 15, color: gold[300], letterSpacing: track(0.08, 15) },
  path: { ...sans(400), marginTop: 2, fontSize: 11, color: creamDim },
  note: { ...sans(300), marginTop: 2, fontSize: 11, color: creamFaint },
  foot: { ...sans(300), fontSize: 12, lineHeight: 20, color: creamDim },
});

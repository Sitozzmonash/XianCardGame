/**
 * 「结算」（`/result`）—— 参考原型 `docs/reference-next/components/screens/ResultScreen.tsx` 的 1:1 RN 移植。
 *
 * 逐段对应（参考行号 → 本文件 / 组件）：
 *   29-41  TopBar(eyebrow 天劫试炼 / title 渡劫成功｜道消身殒 / 右侧胶囊)  → `<TopBar>` + `StatusPill`
 *   44-56  MagicCircle 240 + 胜者头像 80 + 名字 24px + 副标题 11px        → `<ResultHero>`
 *   58-65  Panel 统计三列（回合 / 出牌 / 渡劫，1px 分隔线）                → `<ResultStats>`
 *   67-83  最终排名（名次 + 名字 + 存活/淘汰 tag）                        → `<ResultRanking>`
 *   86-89  底栏两列「再来一局 / 返回主页」                                → `<BottomBar>` + 两个按钮
 *
 * 数据（**不编造**）：`useGameStore().view`（真实 `GameView`）。
 *   回合 = `public.round`；出牌 = `public.discard_count`；渡劫 = 事件流里的 `TRIBULATION_DRAWN`
 *   （无权威单字段，口径与下界说明见 `result-data.ts` 文件头）；胜负 = `winner` + `public.players[].alive`。
 * 两处与参考不同，都是因为原型吃写死的 `MOCK_RESULT`：
 *   ① 参考右侧「切换结局」是调试开关（取反 `success`）——真数据下胜者由后端裁定，不做假按钮，
 *      该槽位只在**对局尚未结束**时挂一个如实的「对局进行中」胶囊；
 *   ② 参考头像写死 `seat={4}`，这里用真实胜者座位（头像渐变按 seat 轮转）。
 *
 * 直接访问 `/result`（没有对局数据）→ 立即重定向回首页，绝不显示假数据。
 */

import Head from 'expo-router/head';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BottomBar,
  ScreenShell,
  ScrollBody,
} from '@/components/ref/ScreenShell';
import { PrimaryButton, SecondaryButton, TopBar } from '@/components/ref/primitives';
import {
  ResultHero,
  ResultRanking,
  ResultStats,
  StatusPill,
  rankingOf,
  resolveOutcome,
  resultStatsOf,
} from '@/components/ref/screens/result';
import { useGameStore } from '@/store/game-store';
import { sp } from '@/theme/ref';

export default function ResultScreen() {
  const view = useGameStore((state) => state.view);
  const clearGame = useGameStore((state) => state.clearGame);
  /** 主动离开（再来一局 / 返回主页）时不要把重定向又拉回首页 */
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!view && !leavingRef.current) router.replace('/');
  }, [view]);

  const outcome = view ? resolveOutcome(view) : null;
  const stats = view ? resultStatsOf(view) : [];
  const ranking = view ? rankingOf(view) : [];

  /** 再来一局：清掉旧对局（DELETE /games/{id} + 复位 store），回到配置页重新开局 */
  const replay = () => {
    leavingRef.current = true;
    clearGame();
    router.replace('/setup');
  };

  /** 返回主页：同样清掉旧对局 */
  const home = () => {
    leavingRef.current = true;
    clearGame();
    router.replace('/');
  };

  if (!view || !outcome) {
    // 没有对局数据：`useEffect` 正在重定向回首页，这里只渲染空壳（不显示假数据）
    return (
      <ScreenShell variant="plain">
        <Head>
          <title>对局结算 · 修仙卡牌</title>
        </Head>
        <TopBar eyebrow="天劫试炼" title="天机未定" />
        <ScrollBody>
          <View style={styles.placeholder} />
        </ScrollBody>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell variant="plain">
      <Head>
        <title>对局结算 · 修仙卡牌</title>
      </Head>

      <TopBar
        eyebrow="天劫试炼"
        title={outcome.title}
        right={outcome.live ? <StatusPill>对局进行中</StatusPill> : undefined}
      />

      <ScrollBody style={styles.body} contentStyle={styles.bodyContent}>
        <ResultHero
          name={outcome.name}
          subtitle={outcome.subtitle}
          seat={outcome.seat}
          tone={outcome.tone}
        />
        <ResultStats stats={stats} />
        <ResultRanking entries={ranking} />
      </ScrollBody>

      <BottomBar>
        <View style={styles.actions}>
          <PrimaryButton style={styles.action} onPress={replay}>
            再来一局
          </PrimaryButton>
          <SecondaryButton style={styles.action} onPress={home}>
            返回主页
          </SecondaryButton>
        </View>
      </BottomBar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  /** 参考主体是 `px-5 pb-6 pt-6`：`ScrollBody` 默认 pt-5，这里把 24px 交给 contentContainer */
  body: { paddingTop: 0 },
  bodyContent: { paddingTop: sp(6) },
  actions: { flexDirection: 'row', gap: sp(3) },
  action: { flex: 1 },
  placeholder: { height: 1 },
});

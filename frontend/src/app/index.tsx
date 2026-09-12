/**
 * 首页（fig3_0，夜蓝青瓷色板）—— 按设计原图 430×888 画布 1:1 还原。
 *
 * 结构（画布坐标来自 design.ts 的实测值）：
 *   顶部个人信息条（头像/名/等级/资源，资源是**静态演示占位**并小字标注「演示」）
 *   → 主视觉（晨雾天空 + 夜色渐层 + 法阵同心环 + 设计图裁切的立绘/云雾）
 *   → 主标题「天劫战牌」+ 副标题 + 标签行 + 两句 slogan
 *   → 主按钮「开启对决（开始斩劫）」/ 次入口「藏经阁（卡牌）」→ /cards
 *     「修仙之法（卡组）」+「论道对战（排位赛）·赛季倒计时：4天」→ disabled + 「未开放」角标
 *   → 底部免责小字
 *
 * 旧首页的功能一个都没丢：后端连通性检测、后端不可用横幅 + 一键切演示数据、
 * 数据源切换、继续/放弃当前对局、/cards 与 /ai-lab 入口。
 */
import Head from 'expo-router/head';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiBaseUrl, isRuntimeMockOverride } from '@/api/client';
import { fetchHealth } from '@/api/game';
import { Banner } from '@/components/ui/Banner';
import { useGameStore } from '@/store/game-store';
import { fontFamily } from '@/theme/typography';
import {
  DESIGN_HEIGHT,
  HOME_GEOMETRY,
  HomeBackdrop,
  HomeButton,
  HomeTextLink,
  HeroTitle,
  MedallionRow,
  PlayerStatusBar,
  useCanvas,
} from '@/components/home';

type BackendStatus = 'checking' | 'ok' | 'down';

/** 静态演示占位（DESIGN_SPEC §4：V1 无账号体系，版式保留 + 明确标注演示） */
const DEMO_PROFILE = {
  name: '太虚真君',
  level: '炼气九层',
  resources: ['12.4K+', '350+'] as const,
};

const HERO = {
  title: '天劫战牌',
  subtitle: '修仙策略卡牌对决',
  tags: ['2-6人', '策略卡牌', '修仙主题'] as const,
  slogans: ['天道无常唯我证道', '一念心战三千劫'] as const,
};

const SEASON_DAYS = 4;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  /** 页面可用宽度由根节点 onLayout 实测（静态导出下 useWindowDimensions 可能滞留 0） */
  const [availW, setAvailW] = useState(0);
  const canvas = useCanvas(insets.top, availW);

  const gameId = useGameStore((state) => state.gameId);
  const view = useGameStore((state) => state.view);
  const clearGame = useGameStore((state) => state.clearGame);
  const setSetup = useGameStore((state) => state.setSetup);
  const mockMode = useGameStore((state) => state.mockMode);
  const enableDemoMode = useGameStore((state) => state.enableDemoMode);
  const disableDemoMode = useGameStore((state) => state.disableDemoMode);
  const notice = useGameStore((state) => state.notice);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);

  const [status, setStatus] = useState<BackendStatus>('checking');
  const [version, setVersion] = useState('');

  const checkHealth = useCallback(() => {
    let mounted = true;
    setStatus('checking');
    fetchHealth()
      .then((health) => {
        if (!mounted) return;
        setStatus('ok');
        setVersion(health.version ?? '');
      })
      .catch(() => {
        if (mounted) setStatus('down');
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => checkHealth(), [checkHealth, mockMode]);

  const canResume = Boolean(gameId && view && view.status === 'playing');
  const backendDown = !mockMode && status === 'down';

  const startSetup = (preset: 'trial' | 'ai' | 'solo') => {
    if (preset === 'solo') {
      setSetup({ players: 3, humanPlayer: 0, agentTypes: ['human', 'rule', 'rule', 'random', 'rule', 'random'] });
    } else if (preset === 'ai') {
      setSetup({ players: 3, humanPlayer: 0, agentTypes: ['human', 'rule', 'ismcts', 'random', 'rule', 'random'] });
    }
    router.push('/setup');
  };

  const toggleSource = () => {
    if (mockMode) disableDemoMode();
    else enableDemoMode();
  };

  const { dp } = canvas;
  const g = HOME_GEOMETRY;
  const canvasHeight = Math.max(DESIGN_HEIGHT, g.disclaimer.y + g.disclaimer.h + 8);

  return (
    <View style={styles.root}>
      <Head>
        <title>天劫战牌 · 修仙策略卡牌</title>
        <meta name="description" content="2–6 人隐藏信息修仙卡牌游戏：抽到天劫且无护劫符即淘汰，最后存活者获胜。" />
      </Head>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: dp(insets.top), paddingBottom: dp(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={styles.measure}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 0 && next !== availW) setAvailW(next);
          }}
        />
        <View style={{ width: dp(canvas.width), height: dp(canvasHeight), marginLeft: dp(canvas.offsetX) }}>
          <HomeBackdrop canvas={{ ...canvas, offsetX: 0 }} />

          <PlayerStatusBar
            canvas={{ ...canvas, offsetX: 0 }}
            name={DEMO_PROFILE.name}
            level={DEMO_PROFILE.level}
            resources={DEMO_PROFILE.resources}
            sourceLabel={
              mockMode
                ? '演示数据'
                : status === 'ok'
                  ? `真后端 ${version}`.trim()
                  : status === 'checking'
                    ? '检测中…'
                    : '后端未连接'
            }
            sourceTone={mockMode ? 'mock' : status === 'ok' ? 'live' : 'down'}
            onPressSource={toggleSource}
          />

          <MedallionRow canvas={{ ...canvas, offsetX: 0 }} glyphs={['天', '劫', '战', '牌']} />

          <HeroTitle
            canvas={{ ...canvas, offsetX: 0 }}
            title={HERO.title}
            subtitle={HERO.subtitle}
            tags={HERO.tags}
            slogans={HERO.slogans}
          />

          {/* 主按钮 */}
          <HomeButton
            canvas={{ ...canvas, offsetX: 0 }}
            tone="jade"
            label={canResume ? '继续试炼' : '开启对决（开始斩劫）'}
            sublabel={
              canResume
                ? `revision ${view?.revision ?? 0} · 第 ${view?.public.round ?? 1} 回合`
                : '2-6 人 · 抽到天劫且无护劫符即淘汰'
            }
            glyph="⚔"
            x={g.primary.x}
            y={g.primary.y}
            w={g.primary.w}
            h={g.primary.h}
            testID="home-start"
            accessibilityHint={canResume ? '回到进行中的对局' : '进入对战配置页'}
            onPress={() => (canResume ? router.push('/battle') : startSetup('trial'))}
          />

          {/* 次入口：藏经阁可用；修仙之法 + 论道对战未开放（disabled，不做假链接） */}
          <HomeButton
            canvas={{ ...canvas, offsetX: 0 }}
            tone="panel"
            label="藏经阁（卡牌）"
            glyph="册"
            x={g.secondary.x}
            y={g.secondary.y}
            w={g.secondary.w}
            h={g.secondary.h}
            testID="home-cards"
            accessibilityHint="打开卡牌图鉴"
            onPress={() => router.push('/cards')}
          />
          <HomeButton
            canvas={{ ...canvas, offsetX: 0 }}
            tone="panel"
            label="修仙之法（卡组）"
            sublabel="V1 未开放"
            badge="未开放"
            x={g.secondary.x + g.secondary.w + g.secondary.gap}
            y={g.secondary.y}
            w={g.secondary.w}
            h={g.secondary.h}
            disabled
            accessibilityHint="V1 无卡组构筑功能，入口未开放"
          />
          <HomeButton
            canvas={{ ...canvas, offsetX: 0 }}
            tone="locked"
            label="论道对战（排位赛）"
            sublabel={`赛季结算倒计时：${SEASON_DAYS}天 · 排位/赛季 V1 未开放`}
            badge="未开放"
            x={g.ranked.x}
            y={g.ranked.y}
            w={g.ranked.w}
            h={g.ranked.h}
            disabled
            accessibilityHint="V1 无排位赛与赛季系统，入口未开放"
          />

          {/* 数据源 / 实验室 / 放弃对局 —— 设计图没有，旧首页的能力保留在这里 */}
          <HomeTextLink
            canvas={{ ...canvas, offsetX: 0 }}
            x={g.utility.x}
            y={g.utility.y}
            w={140}
            label={mockMode ? '数据源：演示数据（点击切回真后端）' : `数据源：${apiBaseUrl}`}
            tone={mockMode ? 'jade' : 'muted'}
            onPress={toggleSource}
            accessibilityHint="在真后端与内置演示数据之间切换"
          />
          <HomeTextLink
            canvas={{ ...canvas, offsetX: 0 }}
            x={g.utility.x + 120}
            y={g.utility.y}
            w={64}
            label="AI 实验室"
            onPress={() => router.push('/ai-lab')}
          />
          {canResume ? (
            <HomeTextLink
              canvas={{ ...canvas, offsetX: 0 }}
              x={g.utility.x + 190}
              y={g.utility.y}
              w={90}
              label="放弃当前对局"
              onPress={clearGame}
              accessibilityHint="销毁服务端 session 并清空本地对局"
            />
          ) : null}
          <HomeTextLink
            canvas={{ ...canvas, offsetX: 0 }}
            x={g.utility.x + (canResume ? 288 : 190)}
            y={g.utility.y}
            w={90}
            label="重新检测后端"
            onPress={checkHealth}
          />

          {/* 底部免责小字（设计图实测 1x y878–932，深色小字压在浅色云雾上） */}
          <Text
            style={[
              styles.disclaimer,
              { left: dp(g.disclaimer.x), top: dp(g.disclaimer.y), width: dp(g.disclaimer.w), fontSize: dp(10.5) },
            ]}
          >
            {'抵制不良游戏  拒绝盗版游戏\n注意自我保护  理性消费'}
          </Text>
        </View>

        {/* 运行时反馈：后端不可用 / mock 提示 / 错误，一律可见，绝不静默 */}
        <View style={[styles.banners, { width: dp(canvas.width), marginLeft: dp(canvas.offsetX) }]}>
          {backendDown ? (
            <Banner
              tone="error"
              message={`后端未连接（${apiBaseUrl}）：请启动 backend（cd backend && python main.py serve），或点右侧用演示数据体验完整一局。`}
              actionLabel="使用演示数据"
              onAction={enableDemoMode}
            />
          ) : null}
          {mockMode ? (
            <Banner
              tone="notice"
              message={
                isRuntimeMockOverride()
                  ? 'MOCK 模式（运行期切换）：真人固定坐在 P0，重启后回到真后端。'
                  : 'EXPO_PUBLIC_USE_MOCK 已开启：全部请求走内置 mock（src/api/mock.ts）。'
              }
            />
          ) : null}
          <Banner tone="error" message={error} onDismiss={clearError} />
          <Banner tone="notice" message={notice} onDismiss={clearError} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    /** 兜底色 = 设计图最底部的浅色云雾，避免画布之外的区域出现深色断层 */
    backgroundColor: '#ACA393',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'flex-start',
    paddingBottom: 24,
  },
  measure: {
    width: '100%',
    height: 0,
  },
  disclaimer: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    color: 'rgba(28,40,34,0.78)',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 1,
  },
  banners: {
    marginTop: 8,
    paddingHorizontal: 0,
  },
});

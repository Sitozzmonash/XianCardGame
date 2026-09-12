import Head from 'expo-router/head';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { apiBaseUrl, isRuntimeMockOverride } from '@/api/client';
import { fetchHealth } from '@/api/game';
import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useGameStore } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';

type BackendStatus = 'checking' | 'ok' | 'down';

export default function HomeScreen() {
  const gameId = useGameStore((state) => state.gameId);
  const view = useGameStore((state) => state.view);
  const clearGame = useGameStore((state) => state.clearGame);
  const setSetup = useGameStore((state) => state.setSetup);
  const mockMode = useGameStore((state) => state.mockMode);
  const enableDemoMode = useGameStore((state) => state.enableDemoMode);
  const disableDemoMode = useGameStore((state) => state.disableDemoMode);
  const notice = useGameStore((state) => state.notice);
  const clearError = useGameStore((state) => state.clearError);

  const [status, setStatus] = useState<BackendStatus>('checking');
  const [version, setVersion] = useState<string>('');

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

  // 数据源切换（真后端 ⇄ 演示数据）后重新探测
  useEffect(() => checkHealth(), [checkHealth, mockMode]);

  const canResume = Boolean(gameId && view && view.status === 'playing');
  const backendDown = !mockMode && status === 'down';

  const startSetup = (preset: 'trial' | 'ai' | 'solo') => {
    if (preset === 'solo') {
      setSetup({ players: 3, agentTypes: ['human', 'rule', 'rule', 'random', 'rule', 'random'] });
    } else if (preset === 'ai') {
      setSetup({ players: 3, agentTypes: ['human', 'rule', 'ismcts', 'random', 'rule', 'random'] });
    }
    router.push('/setup');
  };

  return (
    <ScreenBackground variant="home" scroll contentStyle={styles.content}>
      <Head>
        <title>修仙卡牌 · 天劫试炼</title>
        <meta name="description" content="3–6 人隐藏信息修仙卡牌游戏：抽到天劫且无护劫符即淘汰，最后存活者获胜。" />
      </Head>

      {/* 玩家条 */}
      <View style={styles.playerBar}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>青</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>青岚道友</Text>
          <Text style={styles.playerLevel}>Lv.20 · 筑基后期</Text>
        </View>
        <View style={styles.pills}>
          <Badge label="道行 3280" tone="gold" />
          <Badge label="符箓 12" tone="jade" />
        </View>
      </View>

      {/* 标题 */}
      <View style={styles.hero}>
        <Text style={styles.title}>修仙卡牌</Text>
        <View style={styles.titleRule} />
        <Text style={styles.subtitle}>天劫试炼</Text>
        <Text style={styles.tagline}>2–6 人 · 策略卡牌 · 修仙主题</Text>
      </View>

      <View style={styles.seal}>
        <Text style={styles.sealGlyph}>劫</Text>
      </View>

      {/* 后端不可用：明确报错 + 演示数据入口（不白屏、不静默失败） */}
      {backendDown ? (
        <Banner
          tone="error"
          message={`后端未连接（${apiBaseUrl}）：请启动 backend（cd backend && python main.py serve），或点右侧用演示数据体验完整一局。`}
          actionLabel="使用演示数据"
          onAction={enableDemoMode}
        />
      ) : null}
      <Banner tone="notice" message={notice} onDismiss={clearError} />

      {/* 数据源状态 */}
      <Panel tone="jade" style={styles.statusPanel}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>数据源</Text>
          <Badge
            label={mockMode ? 'MOCK 演示数据' : '真实后端'}
            tone={mockMode ? 'gold' : 'jade'}
          />
        </View>
        <Text style={styles.statusDetail} numberOfLines={3}>
          {mockMode
            ? isRuntimeMockOverride()
              ? '运行期已切到内置 mock：6 个页面与 4 种特殊决策都由演示数据驱动（重启后回到真后端）。'
              : 'EXPO_PUBLIC_USE_MOCK 已开启：全部请求走内置 mock（src/api/mock.ts）。'
            : `接口地址：${apiBaseUrl}`}
        </Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>连通性</Text>
          <Badge
            label={
              status === 'checking'
                ? '检测中…'
                : status === 'ok'
                  ? `已连接 ${version}`.trim()
                  : '未连接'
            }
            tone={status === 'ok' ? 'jade' : status === 'checking' ? 'muted' : 'danger'}
          />
        </View>

        <View style={styles.statusActions}>
          {mockMode ? (
            <PrimaryButton
              label="切回真后端"
              variant="ghost"
              compact
              onPress={disableDemoMode}
              accessibilityHint="清空当前对局并回到 EXPO_PUBLIC_API_BASE_URL"
            />
          ) : (
            <PrimaryButton
              label="使用演示数据"
              variant="ghost"
              compact
              onPress={enableDemoMode}
              accessibilityHint="无需后端即可体验完整一局（mock 数据）"
            />
          )}
          <View style={styles.statusActionsItem}>
            <PrimaryButton label="重新检测" variant="ghost" compact onPress={checkHealth} />
          </View>
        </View>
      </Panel>

      {/* 主按钮 */}
      <View style={styles.actions}>
        {canResume ? (
          <PrimaryButton
            label="继续试炼"
            variant="gold"
            glyph="续"
            hint={`revision ${view?.revision ?? 0} · 第 ${view?.public.round ?? 1} 回合`}
            onPress={() => router.push('/battle')}
          />
        ) : null}

        <PrimaryButton
          label="开始试炼"
          variant="gold"
          glyph="炼"
          onPress={() => startSetup('trial')}
          testID="home-start"
        />

        <View style={styles.actionRow}>
          <View style={styles.actionItem}>
            <PrimaryButton
              label="AI 对战"
              variant="jade"
              glyph="斗"
              onPress={() => startSetup('ai')}
            />
          </View>
          <View style={styles.actionItem}>
            <PrimaryButton
              label="单机练习"
              variant="jade"
              glyph="习"
              onPress={() => startSetup('solo')}
            />
          </View>
        </View>

        <View style={styles.actionRow}>
          <View style={styles.actionItem}>
            <PrimaryButton
              label="卡牌图鉴"
              variant="ghost"
              glyph="册"
              onPress={() => router.push('/cards')}
            />
          </View>
          <View style={styles.actionItem}>
            <PrimaryButton
              label="AI 实验室"
              variant="ghost"
              glyph="研"
              hint="V1 占位页"
              onPress={() => router.push('/ai-lab')}
            />
          </View>
        </View>

        {canResume ? (
          <PrimaryButton label="放弃当前对局" variant="ghost" onPress={clearGame} />
        ) : null}
      </View>

      <Text style={styles.footer}>问道长生 · 卡牌证道</Text>
      <Text style={styles.footerNote}>
        后端是唯一规则权威：所有可点击内容都来自 legal_actions
      </Text>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: borderWidth.thin,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  avatarText: {
    fontFamily: fontFamily.title,
    fontSize: 18,
    color: colors.goldLight,
  },
  playerInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  playerName: {
    ...text.bodyStrong,
    fontSize: 15,
  },
  playerLevel: {
    ...text.label,
  },
  pills: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: 40,
    fontWeight: '700',
    color: colors.paper,
    letterSpacing: 10,
    textAlign: 'center',
  },
  titleRule: {
    width: 140,
    height: 1,
    backgroundColor: colors.borderStrong,
    marginVertical: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.title,
    fontSize: 22,
    color: colors.goldLight,
    letterSpacing: 6,
  },
  tagline: {
    ...text.caption,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  seal: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: borderWidth.hair,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(164,66,61,0.14)',
    marginVertical: spacing.lg,
  },
  sealGlyph: {
    fontFamily: fontFamily.title,
    fontSize: 34,
    color: colors.danger,
  },
  statusPanel: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  statusLabel: {
    ...text.label,
    color: colors.goldLight,
  },
  statusDetail: {
    ...text.caption,
    marginBottom: spacing.sm,
  },
  statusActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  statusActionsItem: {
    flex: 1,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionItem: {
    flex: 1,
  },
  footer: {
    ...text.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
    letterSpacing: 3,
  },
  footerNote: {
    ...text.label,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  actionsPlaceholder: {
    height: 0,
    borderRadius: radius.md,
  },
});

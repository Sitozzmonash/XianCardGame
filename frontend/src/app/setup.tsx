import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isRuntimeMockOverride } from '@/api/client';
import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { DEFAULT_SETUP, MOCK_HUMAN_SEAT, useGameStore } from '@/store/game-store';
import type { SetupConfig } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

const AGENT_TYPES = ['random', 'rule', 'ismcts', 'mccfr'] as const;
const SIM_PRESETS = [200, 500, 1000, 2000];

const SEAT_NAMES = ['青岚道友（你）', '玄墨真人', '清月仙子', '玄机子', '赤霄君', '素心娘子'];

function Chip({
  label,
  active,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        active ? styles.chipActive : null,
        disabled ? styles.chipDisabled : null,
      ]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export default function SetupScreen() {
  const storedSetup = useGameStore((state) => state.setup);
  const setSetup = useGameStore((state) => state.setSetup);
  const createGame = useGameStore((state) => state.createGame);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  const mockMode = useGameStore((state) => state.mockMode);
  const enableDemoMode = useGameStore((state) => state.enableDemoMode);

  const [config, setConfig] = useState<SetupConfig>(storedSetup);
  const mock = mockMode;

  // 人数变化时，Human 座位不能越界
  useEffect(() => {
    if (config.humanPlayer >= config.players) {
      setConfig((current) => ({ ...current, humanPlayer: config.players - 1 }));
    }
  }, [config.humanPlayer, config.players]);

  const patch = (value: Partial<SetupConfig>) => setConfig((current) => ({ ...current, ...value }));

  const seats = useMemo(
    () => Array.from({ length: config.players }, (_, index) => index),
    [config.players],
  );

  const usesIsmcts = seats.some((seat) => seat !== config.humanPlayer && config.agentTypes[seat] === 'ismcts');
  const usesMccfr = seats.some((seat) => seat !== config.humanPlayer && config.agentTypes[seat] === 'mccfr');

  const requestPreview = useMemo(() => {
    const agents = seats.map((seat) =>
      seat === config.humanPlayer
        ? null
        : config.agentTypes[seat] === 'ismcts'
          ? { type: 'ismcts', simulations: config.ismctsSimulations }
          : config.agentTypes[seat] === 'mccfr'
            ? { type: 'mccfr', model: config.mccfrModel }
            : { type: config.agentTypes[seat] },
    );
    return JSON.stringify(
      {
        players: config.players,
        human_player: mock ? MOCK_HUMAN_SEAT : config.humanPlayer,
        agents,
        seed: config.seed.trim().length > 0 ? Number.parseInt(config.seed.trim(), 10) || null : null,
      },
      null,
      2,
    );
  }, [config, seats, mock]);

  const start = async () => {
    clearError();
    setSetup(config);
    const gameId = await createGame(config);
    if (gameId) {
      router.replace('/battle');
    }
  };

  return (
    <ScreenBackground variant="home" scroll contentStyle={styles.content}>
      <Head>
        <title>对局设置 · 修仙卡牌</title>
      </Head>

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回首页"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>对局设置</Text>
        <View style={styles.back} />
      </View>

      <Banner message={error} onDismiss={clearError} />

      {error && !mock ? (
        <Panel tone="jade" style={styles.panel}>
          <Text style={styles.fieldLabel}>后端连不上？</Text>
          <Text style={styles.hint}>
            启动 backend（cd backend && python main.py serve），或先用内置演示数据把流程走通。
          </Text>
          <View style={styles.demoButton}>
            <PrimaryButton
              label="使用演示数据"
              variant="gold"
              compact
              onPress={enableDemoMode}
              accessibilityHint="清空当前设置并切到内置 mock 数据源"
            />
          </View>
        </Panel>
      ) : null}

      {mock ? (
        <Banner
          tone="notice"
          message={
            isRuntimeMockOverride()
              ? 'MOCK 模式（运行期切换）：真人固定坐在 P0（mock 只产出该视角的 GameView）。'
              : 'MOCK 模式（EXPO_PUBLIC_USE_MOCK）：真人固定坐在 P0（mock 只产出该视角的 GameView）。'
          }
        />
      ) : null}

      {/* 人数 */}
      <Panel title="玩家人数" style={styles.panel}>
        <View style={styles.stepperRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="减少一名玩家"
            disabled={config.players <= 2}
            onPress={() => patch({ players: Math.max(2, config.players - 1) })}
            style={[styles.stepper, config.players <= 2 ? styles.chipDisabled : null]}
          >
            <Text style={styles.stepperText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{config.players} 人</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="增加一名玩家"
            disabled={config.players >= 6}
            onPress={() => patch({ players: Math.min(6, config.players + 1) })}
            style={[styles.stepper, config.players >= 6 ? styles.chipDisabled : null]}
          >
            <Text style={styles.stepperText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>支持 2–6 人；天劫固定为 N−1 张，抽到且无护劫符即淘汰。</Text>
      </Panel>

      {/* Human 座位 */}
      <Panel title="真人座位" style={styles.panel}>
        <View style={styles.chipRow}>
          {seats.map((seat) => (
            <Chip
              key={seat}
              label={`P${seat}`}
              active={(mock ? MOCK_HUMAN_SEAT : config.humanPlayer) === seat}
              disabled={mock && seat !== MOCK_HUMAN_SEAT}
              accessibilityLabel={`真人坐在 P${seat}`}
              onPress={() => patch({ humanPlayer: seat })}
            />
          ))}
        </View>
        <Text style={styles.hint}>
          {mock ? 'MOCK 模式固定 P0。' : '真人座位对应的 agents 位置必须为 null（契约要求）。'}
        </Text>
      </Panel>

      {/* AI 配置 */}
      <Panel title="AI 配置" style={styles.panel}>
        {seats
          .filter((seat) => seat !== config.humanPlayer)
          .map((seat) => (
            <View key={seat} style={styles.seatRow}>
              <Text style={styles.seatName}>P{seat}</Text>
              <View style={styles.chipRow}>
                {AGENT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={type}
                    active={(config.agentTypes[seat] ?? 'rule') === type}
                    accessibilityLabel={`P${seat} 使用 ${type}`}
                    onPress={() =>
                      patch({
                        agentTypes: config.agentTypes.map((value, index) =>
                          index === seat ? type : value,
                        ),
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ))}

        {usesIsmcts ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>ISMCTS simulations</Text>
            <View style={styles.chipRow}>
              {SIM_PRESETS.map((value) => (
                <Chip
                  key={value}
                  label={String(value)}
                  active={config.ismctsSimulations === value}
                  accessibilityLabel={`ISMCTS 模拟 ${value} 次`}
                  onPress={() => patch({ ismctsSimulations: value })}
                />
              ))}
            </View>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={String(config.ismctsSimulations)}
              onChangeText={(value) =>
                patch({ ismctsSimulations: Number.parseInt(value.replace(/[^0-9]/g, ''), 10) || 0 })
              }
              accessibilityLabel="ISMCTS 模拟次数"
              placeholder="500"
              placeholderTextColor={colors.muted}
            />
          </View>
        ) : null}

        {usesMccfr ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>MCCFR model 路径（后端 models/ 下）</Text>
            <TextInput
              style={styles.input}
              value={config.mccfrModel}
              onChangeText={(value) => patch({ mccfrModel: value })}
              accessibilityLabel="MCCFR 模型路径"
              placeholder="models/mccfr_2p_100k.pkl"
              placeholderTextColor={colors.muted}
            />
          </View>
        ) : null}
      </Panel>

      {/* 高级 */}
      <Panel title="高级选项" style={styles.panel}>
        <Text style={styles.fieldLabel}>Seed（留空由服务端随机）</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={config.seed}
          onChangeText={(value) => patch({ seed: value.replace(/[^0-9-]/g, '') })}
          accessibilityLabel="随机种子"
          placeholder="42"
          placeholderTextColor={colors.muted}
        />
      </Panel>

      {/* 请求预览 */}
      <Panel title="POST /games 请求预览" style={styles.panel}>
        <Text style={styles.code}>{requestPreview}</Text>
      </Panel>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <PrimaryButton
            label="恢复默认"
            variant="ghost"
            onPress={() => setConfig({ ...DEFAULT_SETUP })}
          />
        </View>
        <View style={styles.footerItem}>
          <PrimaryButton
            label="开始"
            variant="gold"
            glyph="炼"
            loading={isSubmitting}
            disabled={isSubmitting}
            onPress={() => void start()}
            testID="setup-start"
          />
        </View>
      </View>

      <View style={styles.metaRow}>
        <Badge label={`默认：3 人 / P0 真人 / P1 rule / P2 ismcts 500`} tone="muted" />
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
    marginBottom: spacing.md,
  },
  back: {
    minWidth: 72,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  backText: {
    ...text.caption,
    color: colors.goldLight,
  },
  title: {
    ...text.title,
    fontSize: 22,
  },
  panel: {
    width: '100%',
    marginBottom: spacing.md,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    width: minTouchTarget + 8,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  stepperText: {
    ...text.heading,
    fontSize: 20,
  },
  stepperValue: {
    ...text.title,
    fontSize: 20,
    marginHorizontal: spacing.xl,
  },
  hint: {
    ...text.label,
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11,41,41,0.7)',
  },
  chipActive: {
    borderColor: colors.goldLight,
    backgroundColor: 'rgba(28,113,107,0.5)',
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    ...text.caption,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.goldLight,
    fontWeight: '600',
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  seatName: {
    ...text.bodyStrong,
    width: 42,
  },
  field: {
    marginTop: spacing.sm,
  },
  fieldLabel: {
    ...text.label,
    color: colors.goldLight,
    marginBottom: spacing.xs,
  },
  input: {
    marginTop: spacing.xs,
    minHeight: minTouchTarget,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: 'rgba(4,18,19,0.72)',
  },
  code: {
    ...text.label,
    fontSize: 11,
    color: colors.jadeLight,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  footerItem: {
    flex: 1,
  },
  metaRow: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
    width: '100%',
  },
  demoButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 180,
  },
});

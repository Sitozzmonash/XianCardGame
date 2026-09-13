/**
 * 对战配置 —— 参考原型 `docs/reference-next/components/screens/BattleSetupScreen.tsx` 的 1:1 移植。
 *
 * 对应关系（参考行号 → 本文件）：
 *   37        `<GameBackdrop variant="plain" />`            → ScreenShell 自带
 *   39        `TopBar(天劫试炼 / 对战配置 / 返回)`            → 第 4 行
 *   41        `flex-1 space-y-5 px-5 pb-6 pt-5`             → `ScrollBody`（gap 20）
 *   42–50     `玩家人数` + 2–6 胶囊                          → 第 5–7 行
 *   52–59     `座位与对手` + N 行 `PlayerPanel`              → 第 8–10 行
 *   61–83     `AI 参数` Panel（ISMCTS simulations / MCCFR 模型）→ 第 11–13 行
 *   86–96     底栏 `开始对战` + `返回`（`border-t gold-500/15 px-5 py-4 backdrop-blur-sm`）
 *             → 第 15–19 行
 *
 * 接真后端：
 *   - `GET /agents`（`@/api/game` 的 `fetchAgents`）取 MCCFR 模型清单，**按人数过滤**
 *     （模型按人数训练，跨人数会 100% 回落 Rule 且界面看不出异常）；
 *   - `POST /games` 走 store 的 `createGame()`（内部带 revision/错误处理），成功后 `router.replace('/battle')`；
 *   - 失败/演示数据/MCCFR 清单不可用都在底部给出可关闭的提示，绝不静默。
 *
 * 与参考的差异（仅数据来源与必要的失败可见性，版式/文案未动）：参考里 MCCFR 选项是写死的
 * `['100K','500K','Champion']`，这里换成真清单里的模型名；`/setup?players=…&ismcts=…&mccfr=…&from=ai-lab`
 * 的既有入口参数仍会被应用一次（AI 实验室的 hand-off 不能断）。
 */

import Head from 'expo-router/head';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlayerPanel } from '@/components/ref/PlayerPanel';
import type { AIKind } from '@/components/ref/PlayerPanel';
import { BottomBar, ScreenShell, ScrollBody } from '@/components/ref/ScreenShell';
import { Panel, PrimaryButton, SecondaryButton, SectionTitle, SegmentedSelector, TopBar } from '@/components/ref/primitives';
import {
  buildSeats,
  ISMCTS_SIM_OPTIONS,
  loadMccfrOptions,
  PLAYER_COUNTS,
  resolveMccfrSelection,
  SetupNotice,
  toMccfrOptions,
  withKind,
  type MccfrOption,
  type NoticeItem,
} from '@/components/ref/screens/setup';
import { creamFaint, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';
import { MOCK_HUMAN_SEAT, useGameStore, type SetupConfig } from '@/store/game-store';

/** 后端对 ISMCTS 模拟次数的钳位上界（backend/app/services/agent_factory.py） */
const ISMCTS_MAX = 2000;

type ModelState = 'loading' | 'ok' | 'error';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

function baseName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).toLowerCase();
}

export default function BattleSetupScreen() {
  const params = useLocalSearchParams<{
    from?: string;
    players?: string;
    ismcts?: string;
    mccfr?: string;
    seat?: string;
    seed?: string;
  }>();

  const storedSetup = useGameStore((state) => state.setup);
  const setSetup = useGameStore((state) => state.setSetup);
  const createGame = useGameStore((state) => state.createGame);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const error = useGameStore((state) => state.error);
  const notice = useGameStore((state) => state.notice);
  const clearError = useGameStore((state) => state.clearError);
  const mockMode = useGameStore((state) => state.mockMode);
  const enableDemoMode = useGameStore((state) => state.enableDemoMode);
  const disableDemoMode = useGameStore((state) => state.disableDemoMode);

  const [config, setConfig] = useState<SetupConfig>(storedSetup);
  const [models, setModels] = useState<MccfrOption[]>([]);
  const [modelState, setModelState] = useState<ModelState>('loading');
  const [resetNote, setResetNote] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [queryNote, setQueryNote] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);

  /** URL 参数只应用一次（之后用户的手动改动不会被弹回去） */
  const queryAppliedRef = useRef(false);
  /** URL 指定的模型，等清单到位后再解析 */
  const pendingMccfrRef = useRef('');
  /** 首次把 store/默认值对齐到真实清单是静默的，之后的重置才提示 */
  const firstResolveRef = useRef(true);

  const patch = useCallback((value: Partial<SetupConfig>) => {
    setConfig((current) => ({ ...current, ...value }));
  }, []);

  // ------------------------------------------------------------ GET /agents
  useEffect(() => {
    let alive = true;
    setModelState('loading');
    loadMccfrOptions()
      .then((options) => {
        if (!alive) return;
        setModels(options);
        setModelState('ok');
      })
      .catch(() => {
        if (!alive) return;
        setModels([]);
        setModelState('error');
      });
    return () => {
      alive = false;
    };
  }, [mockMode]);

  // ------------------------------------------------------------ URL 参数（一次）
  useEffect(() => {
    if (queryAppliedRef.current) return;
    const rawFrom = firstParam(params.from).trim();
    const rawPlayers = firstParam(params.players).trim();
    const rawIsmcts = firstParam(params.ismcts).trim();
    const rawSeat = firstParam(params.seat).trim();
    const rawMccfr = firstParam(params.mccfr).trim();
    const rawSeed = firstParam(params.seed).trim();
    if (!rawFrom && !rawPlayers && !rawIsmcts && !rawSeat && !rawMccfr && !rawSeed) return;
    queryAppliedRef.current = true;

    const notes: string[] = [];
    const applied: string[] = [];
    const next: Partial<SetupConfig> = {};

    let players = config.players;
    if (rawPlayers) {
      const parsed = Number.parseInt(rawPlayers, 10);
      if (!Number.isFinite(parsed)) notes.push(`players=${rawPlayers} 无法解析为数字，已忽略`);
      else {
        players = Math.min(6, Math.max(2, parsed));
        next.players = players;
        applied.push(`人数 ${players}`);
      }
    }
    if (rawIsmcts) {
      const parsed = Number.parseInt(rawIsmcts, 10);
      if (!Number.isFinite(parsed) || parsed < 1) notes.push(`ismcts=${rawIsmcts} 非法，已忽略`);
      else {
        next.ismctsSimulations = Math.min(ISMCTS_MAX, parsed);
        applied.push(`ISMCTS ${next.ismctsSimulations}`);
        if (parsed > ISMCTS_MAX) notes.push(`ismcts=${parsed} 超过后端上界，已夹到 ${ISMCTS_MAX}`);
      }
    }
    if (rawSeat) {
      const parsed = Number.parseInt(rawSeat, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed >= players) notes.push(`seat=${rawSeat} 超出 0–${players - 1}，已忽略`);
      else {
        next.humanPlayer = parsed;
        applied.push(`真人座位 P${parsed}`);
      }
    }
    if (rawMccfr) {
      pendingMccfrRef.current = rawMccfr;
      applied.push(`模型 ${rawMccfr}`);
    }
    if (rawSeed) {
      // 复现同一局（同 seed + 同人数 + 同对手策略 → 同牌序与同 AI 决策）。
      // 用于 QA 复现与取证：`/setup?players=2&seed=6`
      const parsed = Number.parseInt(rawSeed, 10);
      if (!Number.isFinite(parsed) || parsed < 0) notes.push(`seed=${rawSeed} 非法，已忽略`);
      else {
        next.seed = String(parsed);
        applied.push(`随机种子 ${parsed}`);
      }
    }
    if (rawFrom) applied.push(`来源 ${rawFrom}`);

    if (applied.length > 0) setHandoffNote(applied.join(' · '));
    if (notes.length > 0) setQueryNote(notes.join('；'));
    if (Object.keys(next).length > 0) patch(next);
    // 只在挂载时应用一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ 人数/清单 → 重选模型
  useEffect(() => {
    if (modelState !== 'ok') return;
    const wanted = pendingMccfrRef.current;
    pendingMccfrRef.current = '';

    let preferred = config.mccfrModel;
    if (wanted) {
      const hit = models.find(
        (option) =>
          option.value === wanted ||
          option.value.toLowerCase() === wanted.toLowerCase() ||
          baseName(option.value) === baseName(wanted),
      );
      if (hit) preferred = hit.value;
      else setQueryNote((prev) => `${prev ? `${prev}；` : ''}mccfr=${wanted} 不在 GET /agents 清单里，已忽略`);
    }

    const { value, changed } = resolveMccfrSelection(models, config.players, preferred);
    if (!changed) {
      firstResolveRef.current = false;
      return;
    }
    const silent = firstResolveRef.current;
    firstResolveRef.current = false;
    if (!silent) {
      const label = models.find((option) => option.value === value)?.label ?? value;
      setResetNote(
        value.length === 0
          ? `已切到 ${config.players} 人：清单里没有匹配的 MCCFR 模型，MCCFR 座位请改用别的策略。`
          : `${config.players} 人的 MCCFR 模型已重置为「${label}」。`,
      );
    }
    patch({ mccfrModel: value });
  }, [models, modelState, config.players, config.mccfrModel, patch]);

  // 真人座位不能越界（人数变小时）
  useEffect(() => {
    if (config.humanPlayer >= config.players) patch({ humanPlayer: config.players - 1 });
  }, [config.humanPlayer, config.players, patch]);

  // ------------------------------------------------------------ 派生数据
  const mock = mockMode;
  const humanSeat = mock ? MOCK_HUMAN_SEAT : Math.min(config.humanPlayer, config.players - 1);
  const seats = useMemo(
    () => buildSeats(config.players, humanSeat, config.agentTypes),
    [config.players, humanSeat, config.agentTypes],
  );

  const candidates = useMemo(
    () => resolveMccfrSelection(models, config.players, config.mccfrModel).options,
    [models, config.players, config.mccfrModel],
  );
  /** 重名时用完整引用兜底，保证「胶囊 → 模型」一一对应 */
  const candidateLabels = useMemo(() => {
    const raw = candidates.map((option) => option.label);
    return candidates.map((option) => (raw.filter((label) => label === option.label).length > 1 ? option.value : option.label));
  }, [candidates]);
  const selectedLabel = useMemo(() => {
    const index = candidates.findIndex((option) => option.value === config.mccfrModel);
    return index >= 0 ? candidateLabels[index] : '';
  }, [candidates, candidateLabels, config.mccfrModel]);

  /** 用到 MCCFR 的非真人座位（这些座位需要真实模型，否则接口会 100% 回落 Rule） */
  const mccfrSeats = seats.filter((seat) => !seat.isSelf && seat.kind === 'mccfr');
  const needsModel = mccfrSeats.length > 0;
  const modelMissing = needsModel && candidates.length === 0 && modelState !== 'loading';
  const modelPending = needsModel && modelState === 'loading';

  const simOptions = useMemo<number[]>(() => {
    const base: number[] = [...ISMCTS_SIM_OPTIONS];
    return base.includes(config.ismctsSimulations)
      ? base
      : [...base, config.ismctsSimulations].sort((a, b) => a - b);
  }, [config.ismctsSimulations]);

  // ------------------------------------------------------------ 运行期提示
  const notices: NoticeItem[] = [];
  if (error) {
    notices.push({
      id: `error:${error}`,
      tone: 'error',
      text: error,
      actionLabel: mock ? undefined : '使用内置演示数据',
      onAction: mock ? undefined : enableDemoMode,
    });
  }
  if (modelState === 'error') {
    notices.push({
      id: 'models-error',
      tone: 'error',
      text: 'GET /agents 不可用：读不到 MCCFR 模型清单（其余座位仍可正常配置）。',
    });
  }
  if (modelPending) {
    notices.push({ id: 'models-pending', tone: 'notice', text: '正在读取 GET /agents 的模型清单…' });
  }
  if (modelMissing) {
    notices.push({
      id: `models-missing:${config.players}`,
      tone: 'error',
      text: `当前 ${config.players} 人没有可用的 MCCFR 模型（模型按人数训练）。请把 MCCFR 座位改成 Rule/ISMCTS/Random，或先训练模型。`,
    });
  }
  if (resetNote) {
    notices.push({ id: `reset:${resetNote}`, tone: 'notice', text: resetNote, actionLabel: '好', onAction: () => setResetNote('') });
  }
  if (handoffNote) {
    notices.push({ id: `handoff:${handoffNote}`, tone: 'notice', text: `已应用入口参数：${handoffNote}`, actionLabel: '好', onAction: () => setHandoffNote('') });
  }
  if (queryNote) {
    notices.push({ id: `query:${queryNote}`, tone: 'notice', text: queryNote, actionLabel: '好', onAction: () => setQueryNote('') });
  }
  if (notice) {
    notices.push({ id: `store:${notice}`, tone: 'notice', text: notice, actionLabel: '好', onAction: clearError });
  }
  if (mock) {
    notices.push({
      id: 'mock-mode',
      tone: 'notice',
      text: '数据源：MOCK 演示数据（真人固定坐在 P0）。',
      actionLabel: '切回真后端',
      onAction: disableDemoMode,
    });
  }
  const visibleNotices = notices.filter((item) => !dismissed.includes(item.id));

  // ------------------------------------------------------------ 动作
  const goHome = () => router.replace('/');

  const onKindChange = (seat: number, kind: AIKind) =>
    patch({ agentTypes: withKind(config.agentTypes, seat, kind) });

  const start = async () => {
    clearError();
    setSetup(config);
    const gameId = await createGame(config);
    if (gameId) router.replace('/battle');
  };

  return (
    <ScreenShell edges={['top', 'left', 'right', 'bottom']}>
      <Head>
        <title>对战配置 · 天劫试炼</title>
      </Head>

      <TopBar eyebrow="天劫试炼" title="对战配置" onBack={goHome} />

      <ScrollBody>
        {/* 玩家人数 */}
        <View style={styles.section}>
          <SectionTitle>玩家人数</SectionTitle>
          <SegmentedSelector
            options={PLAYER_COUNTS}
            value={config.players}
            onChange={(players) => patch({ players })}
            formatLabel={(count) => `${count} 人`}
          />
        </View>

        {/* 座位与对手（前 N 行） */}
        <View style={styles.section}>
          <SectionTitle>座位与对手</SectionTitle>
          <View style={styles.seatList}>
            {seats.map((seat) => (
              <PlayerPanel
                key={seat.id}
                seat={seat}
                onKindChange={(kind) => onKindChange(seat.seat, kind)}
              />
            ))}
          </View>
        </View>

        {/* AI 参数 */}
        <Panel>
          <View style={styles.panelBody}>
            <SectionTitle>AI 参数</SectionTitle>

            <View style={styles.field}>
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                ISMCTS simulations
              </Text>
              <SegmentedSelector
                size="sm"
                options={simOptions}
                value={config.ismctsSimulations}
                onChange={(simulations) => patch({ ismctsSimulations: simulations })}
              />
            </View>

            <View style={styles.field}>
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                MCCFR 模型
              </Text>
              {candidateLabels.length > 0 ? (
                <SegmentedSelector
                  size="sm"
                  options={candidateLabels}
                  value={selectedLabel}
                  onChange={(label) => {
                    const index = candidateLabels.indexOf(label);
                    const option = candidates[index];
                    if (option) patch({ mccfrModel: option.value });
                  }}
                />
              ) : (
                <Text allowFontScaling={false} style={styles.fieldHint}>
                  {modelState === 'loading'
                    ? '正在读取 GET /agents 的模型清单…'
                    : `当前 ${config.players} 人没有可用模型（后端按人数训练）。`}
                </Text>
              )}
            </View>
          </View>
        </Panel>

        <SetupNotice items={visibleNotices} onDismiss={(id) => setDismissed((prev) => [...prev, id])} />
      </ScrollBody>

      <BottomBar>
        {/* `PrimaryButton` 不接受 `accessibilityLabel`（冻结件），走向/参数写在外层 accessible 容器上 */}
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`开始对战：POST /games ${config.players} 人，真人坐在 P${humanSeat}`}
        >
          <PrimaryButton fullWidth disabled={isSubmitting || modelMissing} onPress={() => void start()}>
            开始对战
          </PrimaryButton>
        </View>
        <SecondaryButton fullWidth onPress={goHome}>
          返回
        </SecondaryButton>
      </BottomBar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  // `space-y-3`（section 内部）/ `space-y-5`（section 之间由 ScrollBody 的 gap 提供）
  section: { gap: sp(3) },
  seatList: { gap: sp(2.5) },
  panelBody: { gap: sp(4) },
  field: { gap: sp(2) },
  fieldLabel: {
    ...sans(400),
    fontSize: 11,
    letterSpacing: track(0.14, 11),
    color: creamFaint,
  },
  fieldHint: {
    ...sans(400),
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: track(0.14, 11),
    color: creamFaint,
  },
});

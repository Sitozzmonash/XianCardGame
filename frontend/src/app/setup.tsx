/**
 * 对战配置（fig4_0，墨玉色板）—— 按设计原图 430×888 画布 1:1 还原。
 *
 * 设计原图结构（鎏金分隔线实测 y，见 design.ts）：标题「天劫试炼」+「对战配置」
 * → 玩家人数（2–6 单选）→ 座位与对手（头像/名字/副标签/右侧角色标签）
 * → AI 参数（ISMCTS simulations / MCCFR 模型）→ 主按钮「开始对战」+ 次按钮「返回」。
 *
 * 契约（API_CONTRACT §6，POST /games）：
 *   players == agents.length 且 human_player 位置必须为 null，其余座位必须给 agent；
 *   mccfr 座位的 model 必须是 `GET /agents` 给出的真实引用，且**按人数过滤**
 *   （模型按人数训练，2 人模型放进 3 人局会 100% 回落 Rule 且界面无异常）。
 *
 * URL 参数（供 AI 实验室等入口真跳转，`/setup?from=ai-lab&players=5&ismcts=1000`）：
 *   首次挂载时应用一次，优先级 URL > store > 默认值；越界钳位并给出可关闭的提示；
 *   之后用户手动改动不会被 URL 弹回去（用 ref 标记已应用）。
 */
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isRuntimeMockOverride } from '@/api/client';
import { fetchAgents } from '@/api/game';
import { Banner } from '@/components/ui/Banner';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import {
  matchMccfrParam,
  noModelHint,
  ParamChips,
  PlayerCountSelector,
  resolveMccfrSelection,
  SeatRow,
  SectionHeader,
  SETUP_GEOMETRY,
  SetupHeader,
  toMccfrOptions,
  type ChipOption,
  type MccfrModelOption,
} from '@/components/setup';
import { SETUP_HUMAN_PORTRAIT } from '@/components/setup/assets';
import { DEFAULT_SETUP, MOCK_HUMAN_SEAT, useGameStore } from '@/store/game-store';
import type { SetupConfig } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';
import type { AgentInfo } from '@/types/card';

const AGENT_TYPES = ['rule', 'ismcts', 'random', 'mccfr'] as const;
const SIM_PRESETS = [100, 500, 1000, 2000] as const;
const DESIGN_WIDTH = 430;
/** 后端对 ISMCTS 模拟次数的钳位上界（backend/app/services/agent_factory.py） */
const ISMCTS_MAX = 2000;
const ISMCTS_MIN = 1;

const AGENT_LABEL: Record<string, string> = {
  human: 'Human',
  rule: 'Rule',
  ismcts: 'ISMCTS',
  random: 'Random',
  mccfr: 'MCCFR',
};

const SEATS = [
  { name: '我', initial: '虚' },
  { name: '玄墨真人', initial: '墨' },
  { name: '清月仙子', initial: '月' },
  { name: '玄机子', initial: '机' },
  { name: '赤霄君', initial: '霄' },
  { name: '素心娘子', initial: '素' },
] as const;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    from?: string;
    players?: string;
    ismcts?: string;
    mccfr?: string;
    seat?: string;
  }>();

  const storedSetup = useGameStore((state) => state.setup);
  const setSetup = useGameStore((state) => state.setSetup);
  const createGame = useGameStore((state) => state.createGame);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  const mockMode = useGameStore((state) => state.mockMode);
  const enableDemoMode = useGameStore((state) => state.enableDemoMode);

  const [config, setConfig] = useState<SetupConfig>(storedSetup);
  /** 页面可用宽度由根节点 onLayout 实测（静态导出下 useWindowDimensions 可能滞留 0） */
  const [availW, setAvailW] = useState(0);
  const [modelState, setModelState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [allModels, setAllModels] = useState<MccfrModelOption[]>([]);
  const [showRequest, setShowRequest] = useState(false);
  /** 人数/清单变化导致模型被重置时给用户看的一句话（避免静默改配置） */
  const [resetNotice, setResetNotice] = useState('');
  /** URL 参数越界/无法解析的提示 */
  const [queryNotice, setQueryNotice] = useState('');
  /** 来自 AI 实验室的入口横幅（可关闭） */
  const [fromLab, setFromLab] = useState('');
  /** URL 里带的人群 id/路径，等 GET /agents 清单到位后再解析 */
  const pendingMccfrRef = useRef<string>('');
  const queryAppliedRef = useRef(false);
  /** 首次解析（把 store/默认值对齐到真实清单）静默进行，不弹提示 */
  const firstResolveRef = useRef(true);

  const mock = mockMode;
  const humanSeat = mock ? MOCK_HUMAN_SEAT : config.humanPlayer;

  const patch = useCallback((value: Partial<SetupConfig>) => {
    setConfig((current) => ({ ...current, ...value }));
  }, []);

  // ---------------- GET /agents → MCCFR 模型清单 ----------------
  useEffect(() => {
    let mounted = true;
    setModelState('loading');
    fetchAgents()
      .then((agents: AgentInfo[]) => {
        if (!mounted) return;
        setAllModels(toMccfrOptions(agents));
        setModelState('ok');
      })
      .catch(() => {
        if (mounted) {
          setAllModels([]);
          setModelState('error');
        }
      });
    return () => {
      mounted = false;
    };
  }, [mockMode]);

  // ---------------- URL 参数（只应用一次） ----------------
  useEffect(() => {
    if (queryAppliedRef.current) return;
    const rawPlayers = firstParam(params.players).trim();
    const rawIsmcts = firstParam(params.ismcts).trim();
    const rawSeat = firstParam(params.seat).trim();
    const rawMccfr = firstParam(params.mccfr).trim();
    const rawFrom = firstParam(params.from).trim();
    if (!rawPlayers && !rawIsmcts && !rawSeat && !rawMccfr && !rawFrom) return;
    queryAppliedRef.current = true;

    const notes: string[] = [];
    const applied: string[] = [];
    const next: Partial<SetupConfig> = {};

    let players = config.players;
    if (rawPlayers) {
      const parsed = Number.parseInt(rawPlayers, 10);
      if (!Number.isFinite(parsed)) {
        notes.push(`players=${rawPlayers} 无法解析为数字，已忽略`);
      } else if (parsed < 2 || parsed > 6) {
        players = Math.min(6, Math.max(2, parsed));
        next.players = players;
        notes.push(`players=${parsed} 超出 2–6，已夹到 ${players}`);
      } else {
        players = parsed;
        next.players = players;
      }
    }

    if (rawIsmcts) {
      const parsed = Number.parseInt(rawIsmcts, 10);
      if (!Number.isFinite(parsed) || parsed < ISMCTS_MIN) {
        notes.push(`ismcts=${rawIsmcts} 非法，已忽略`);
      } else if (parsed > ISMCTS_MAX) {
        next.ismctsSimulations = ISMCTS_MAX;
        notes.push(`ismcts=${parsed} 超过后端钳位上界，已夹到 ${ISMCTS_MAX}`);
      } else {
        next.ismctsSimulations = parsed;
      }
    }

    if (rawSeat) {
      const parsed = Number.parseInt(rawSeat, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed >= players) {
        notes.push(`seat=${rawSeat} 超出 0–${players - 1}，已忽略`);
      } else {
        next.humanPlayer = parsed;
      }
    }

    if (rawMccfr) pendingMccfrRef.current = rawMccfr;

    if (next.players !== undefined) applied.push(`人数 ${next.players}`);
    if (next.ismctsSimulations !== undefined) applied.push(`ISMCTS ${next.ismctsSimulations}`);
    if (next.humanPlayer !== undefined) applied.push(`真人座位 P${next.humanPlayer}`);
    if (rawMccfr) applied.push(`模型 ${rawMccfr}`);
    if (applied.length > 0) setFromLab(applied.join(' · '));
    if (notes.length > 0) setQueryNotice(notes.join('；'));

    if (Object.keys(next).length > 0) patch(next);
    // 只在挂载时应用一次；用户之后的手动修改不会被 URL 覆盖（刷新才会重新应用）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 人数变化 / 模型清单变化 → 重新解析 MCCFR 选中项。
   * 当前选中项不在候选里（典型：人数变了）→ 自动重置到第一个匹配项；
   * 一个匹配项都没有 → 清空，并把仍在用 mccfr 的座位降级回 rule
   * （否则契约里会带一个命中率 0% 的模型，且界面上什么都看不出来）。
   */
  useEffect(() => {
    if (modelState !== 'ok') return;

    // URL 里指定的模型优先：能在真实清单里找到才用，找不到就忽略
    const wanted = pendingMccfrRef.current;
    if (wanted) {
      pendingMccfrRef.current = '';
      const hit = matchMccfrParam(allModels, wanted);
      if (hit && hit.value !== config.mccfrModel) {
        patch({ mccfrModel: hit.value });
        setResetNotice(`已按 URL 参数选用模型「${hit.label}」。`);
        return;
      }
      setQueryNotice((prev) =>
        prev ? `${prev}；mccfr=${wanted} 不在 GET /agents 清单里，已忽略` : `mccfr=${wanted} 不在 GET /agents 清单里，已忽略`,
      );
    }

    const { value, changed } = resolveMccfrSelection(allModels, config.players, config.mccfrModel);
    const danglingSeats = config.agentTypes
      .slice(0, config.players)
      .some((type, seat) => seat !== humanSeat && type === 'mccfr');

    if (!changed && !(value.length === 0 && danglingSeats)) {
      firstResolveRef.current = false;
      return;
    }

    const silent = firstResolveRef.current;
    firstResolveRef.current = false;
    if (!silent) {
      setResetNotice(
        value.length === 0
          ? `已切到 ${config.players} 人：没有匹配的 MCCFR 模型，MCCFR 座位自动降级为 Rule。`
          : `${config.players} 人的 MCCFR 模型已重置为「${value}」。`,
      );
    }
    patch({
      mccfrModel: value,
      agentTypes:
        value.length === 0
          ? config.agentTypes.map((type, seat) =>
              seat < config.players && seat !== humanSeat && type === 'mccfr' ? 'rule' : type,
            )
          : config.agentTypes,
    });
  }, [allModels, modelState, config.players, config.mccfrModel, config.agentTypes, humanSeat, patch]);

  // 人数变化时，Human 座位不能越界
  useEffect(() => {
    if (config.humanPlayer >= config.players) {
      patch({ humanPlayer: config.players - 1 });
    }
  }, [config.humanPlayer, config.players, patch]);

  const seats = useMemo(
    () => Array.from({ length: config.players }, (_, index) => index),
    [config.players],
  );

  const modelCandidates = useMemo(
    () => resolveMccfrSelection(allModels, config.players, config.mccfrModel).options,
    [allModels, config.players, config.mccfrModel],
  );
  const matchedCount = modelCandidates.filter((option) => option.players === config.players).length;
  const hasModel = modelCandidates.length > 0;
  const needManualModel = !hasModel || modelState === 'error';
  const extra = needManualModel ? 38 : 0;

  const ismctsOptions: ChipOption[] = SIM_PRESETS.map((value) => ({
    label: String(value),
    value: String(value),
  }));

  const mccfrOptions: ChipOption[] = modelCandidates.map((option) => ({
    label: option.short,
    value: option.value,
    a11yLabel: `${option.players === undefined ? '训练人数未知' : `${option.players} 人`} · ${option.label}`,
    mark: option.players === undefined ? '?' : undefined,
  }));

  const selectedModel = modelCandidates.find((option) => option.value === config.mccfrModel);

  const mccfrNote = (() => {
    if (modelState === 'loading') return '正在读取 GET /agents 的模型清单…';
    if (modelState === 'error') return '接口 /agents 不可用：模型清单读取失败。';
    if (!hasModel) return noModelHint(config.players);
    if (selectedModel?.players === undefined)
      return '该模型未标注训练人数（后端 /agents 未给 players 字段）。人数不匹配会导致 MCCFR 命中率 0% 并 100% 回落 Rule。';
    return `模型：${config.mccfrModel}（训练人数 ${selectedModel.players} 人）`;
  })();

  const requestPreview = useMemo(() => {
    const agents = seats.map((seat) =>
      seat === humanSeat
        ? null
        : config.agentTypes[seat] === 'ismcts'
          ? { type: 'ismcts', simulations: config.ismctsSimulations }
          : config.agentTypes[seat] === 'mccfr'
            ? { type: 'mccfr', model: config.mccfrModel }
            : { type: config.agentTypes[seat] },
    );
    const seed = config.seed.trim().length > 0 ? Number.parseInt(config.seed.trim(), 10) || null : null;
    return JSON.stringify({ players: config.players, human_player: humanSeat, agents, seed }, null, 2);
  }, [config, seats, humanSeat]);

  const start = async () => {
    clearError();
    setSetup(config);
    const gameId = await createGame(config);
    if (gameId) router.replace('/battle');
  };

  // ---------------- 几何 ----------------
  const g = SETUP_GEOMETRY;
  /** 3 人及以下用设计原图坐标；4–6 人收紧行高并把下面段落整体下移 */
  const rowH = config.players <= 3 ? 60 : 42;
  const step = config.players <= 3 ? 92 : 52;
  const seatsBottom = g.seats.first.y + (config.players - 1) * step + rowH;
  const seatHintY = seatsBottom + 6;
  const aiY = Math.max(g.ai.label.y, seatHintY + 16);
  const shift = aiY - g.ai.label.y;
  const primaryY = aiY + (g.primary.y - g.ai.label.y) + extra;
  const secondaryY = aiY + (g.secondary.y - g.ai.label.y) + extra;
  const utilityY = aiY + (g.utility.y - g.ai.label.y) + extra;
  const canvasHeight = 888 + shift + extra;

  const scale = useMemo(() => {
    const base = availW > 0 ? availW : windowWidth > 0 ? windowWidth : DESIGN_WIDTH;
    return Math.min(Math.max(base, 240), 480) / DESIGN_WIDTH;
  }, [availW, windowWidth]);

  const cycleAgent = (seat: number) => {
    const current = config.agentTypes[seat] ?? 'rule';
    const available = AGENT_TYPES.filter((type) => type !== 'mccfr' || hasModel);
    const index = available.indexOf(current as (typeof AGENT_TYPES)[number]);
    const next = available[(index + 1) % available.length];
    patch({ agentTypes: config.agentTypes.map((value, i) => (i === seat ? next : value)) });
  };

  return (
    <View style={styles.root}>
      <Head>
        <title>对战配置 · 天劫试炼</title>
      </Head>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View
          style={styles.measure}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 0 && next !== availW) setAvailW(next);
          }}
        />
        <View style={{ width: '100%', maxWidth: 430, paddingHorizontal: 16, gap: 8 }}>
          <Banner
            tone="notice"
            message={fromLab ? `已应用 AI 实验室的参数：${fromLab}` : ''}
            onDismiss={() => setFromLab('')}
          />
          <Banner tone="error" message={queryNotice} onDismiss={() => setQueryNotice('')} />
        </View>
        <View style={{ height: insets.top, width: 1 }} />
        <View style={{ width: DESIGN_WIDTH * scale, height: canvasHeight * scale }}>
          <View style={{ width: DESIGN_WIDTH, height: canvasHeight, transform: [{ scale }], transformOrigin: 'top left' }}>
            <SetupHeader
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="恢复默认配置"
                  onPress={() => {
                    setResetNotice('');
                    setConfig({ ...DEFAULT_SETUP });
                  }}
                  style={({ pressed }) => [styles.headerAction, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.headerActionText}>恢复默认</Text>
                </Pressable>
              }
            />

            <SectionHeader x={g.playerCount.label.x} y={g.playerCount.label.y} size={g.playerCount.label.size} label="玩家人数" />
            <PlayerCountSelector
              x={g.playerCount.control.x}
              y={g.playerCount.control.y}
              w={g.playerCount.control.w}
              h={g.playerCount.control.h}
              value={config.players}
              onChange={(players) => patch({ players })}
            />
            <Text style={[styles.hint, { left: g.playerCount.hint.x, top: g.playerCount.hint.y, fontSize: g.playerCount.hint.size }]}>
              支持 2–6 人；天劫固定 N−1 张，抽到且无护劫符即淘汰。
            </Text>

            <SectionHeader x={g.seats.label.x} y={g.seats.label.y} size={g.seats.label.size} label="座位与对手" />
            {seats.map((seat) => {
              const isHuman = seat === humanSeat;
              const agentType = isHuman ? 'human' : config.agentTypes[seat] ?? 'rule';
              const profile = SEATS[seat] ?? { name: `道友 ${seat}`, initial: '道' };
              return (
                <SeatRow
                  key={seat}
                  x={g.seats.first.x}
                  y={g.seats.first.y + seat * step}
                  w={g.seats.first.w}
                  h={rowH}
                  seat={seat}
                  name={isHuman ? `我（${profile.name === '我' ? '太虚真君' : profile.name}）` : profile.name}
                  sublabel={isHuman ? `P${seat} · 玩家座位 · 真人` : `P${seat} · AI`}
                  agentLabel={AGENT_LABEL[agentType] ?? agentType}
                  isHuman={isHuman}
                  portrait={isHuman ? SETUP_HUMAN_PORTRAIT : undefined}
                  initial={profile.initial}
                  agentDisabled={!isHuman && agentType === 'mccfr' && !hasModel}
                  locked={mock}
                  onMoveHere={() => patch({ humanPlayer: seat })}
                  onCycleAgent={() => cycleAgent(seat)}
                />
              );
            })}
            <Text style={[styles.hint, { left: g.seats.hint.x, top: seatHintY, width: 378, fontSize: 9.5 }]}>
              {mock
                ? 'MOCK 模式固定 P0 为真人（mock 只产出该视角的 GameView）。'
                : '点头像把「我」挪到该座位；点右侧标签切换该座位 AI 类型。human 位在 POST /games 里必须为 null。'}
            </Text>

            <SectionHeader x={g.ai.label.x} y={aiY} size={g.ai.label.size} label="AI 参数" />
            <Text style={[styles.fieldLabel, { left: g.ai.ismctsLabel.x, top: aiY + (g.ai.ismctsLabel.y - g.ai.label.y), fontSize: g.ai.ismctsLabel.size }]}>
              ISMCTS simulations（模拟次数）
            </Text>
            <ParamChips
              x={g.ai.ismctsChips.x}
              y={aiY + (g.ai.ismctsChips.y - g.ai.label.y)}
              w={g.ai.ismctsChips.w}
              h={g.ai.ismctsChips.h}
              options={ismctsOptions}
              value={String(config.ismctsSimulations)}
              onChange={(value) => patch({ ismctsSimulations: Number.parseInt(value, 10) })}
              groupLabel="ISMCTS simulations"
            />

            <View style={[styles.fieldRow, { left: g.ai.mccfrLabel.x, top: aiY + (g.ai.mccfrLabel.y - g.ai.label.y), width: g.ai.mccfrChips.w }]}>
              <Text style={[styles.fieldLabel, { fontSize: g.ai.mccfrLabel.size }]}>MCCFR 模型</Text>
              <Text style={styles.fieldSource}>
                {modelState === 'ok'
                  ? `来源 GET /agents · ${config.players} 人命中 ${matchedCount} 个 / 候选 ${modelCandidates.length} 个`
                  : modelState === 'loading'
                    ? '来源 GET /agents · 读取中'
                    : '来源 GET /agents · 读取失败'}
              </Text>
            </View>
            {hasModel ? (
              <ParamChips
                x={g.ai.mccfrChips.x}
                y={aiY + (g.ai.mccfrChips.y - g.ai.label.y)}
                w={g.ai.mccfrChips.w}
                h={g.ai.mccfrChips.h}
                options={mccfrOptions}
                value={config.mccfrModel}
                onChange={(value) => patch({ mccfrModel: value })}
                groupLabel="MCCFR 模型"
              />
            ) : (
              <View
                style={[
                  styles.emptyBox,
                  {
                    left: g.ai.mccfrChips.x,
                    top: aiY + (g.ai.mccfrChips.y - g.ai.label.y),
                    width: g.ai.mccfrChips.w,
                    height: g.ai.mccfrChips.h,
                  },
                ]}
              >
                <Text style={styles.emptyText} numberOfLines={1}>
                  无可用模型（当前 {config.players} 人）
                </Text>
              </View>
            )}
            <Text
              style={[
                styles.note,
                {
                  left: g.ai.mccfrNote.x,
                  top: aiY + (g.ai.mccfrNote.y - g.ai.label.y),
                  width: g.ai.mccfrChips.w,
                  fontSize: g.ai.mccfrNote.size,
                  color: hasModel ? colors.muted : colors.goldLight,
                },
              ]}
            >
              {mccfrNote}
            </Text>
            {needManualModel ? (
              <View
                style={{
                  position: 'absolute',
                  left: g.ai.mccfrNote.x,
                  top: aiY + (g.ai.mccfrNote.y - g.ai.label.y) + 26,
                }}
              >
                <TextInput
                  style={[styles.inlineInput, { width: 250 }]}
                  value={config.mccfrModel}
                  onChangeText={(value) => patch({ mccfrModel: value })}
                  accessibilityLabel="手填 MCCFR 模型路径"
                  placeholder="models/mccfr_3p_10k.pkl"
                  placeholderTextColor={colors.muted}
                />
              </View>
            ) : null}

            <View style={[styles.fieldRow, { left: g.advanced.label.x, top: primaryY - 32, width: g.ai.mccfrChips.w }]}>
              <Text style={[styles.fieldLabel, { fontSize: 11 }]}>Seed（留空随机）</Text>
              <TextInput
                style={[
                  styles.inlineInput,
                  { position: 'absolute', left: g.advanced.field.x - g.advanced.label.x, top: 0, width: g.advanced.field.w },
                ]}
                keyboardType="number-pad"
                value={config.seed}
                onChangeText={(value) => patch({ seed: value.replace(/[^0-9-]/g, '') })}
                accessibilityLabel="随机种子"
                placeholder="42"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={{ position: 'absolute', left: g.primary.x, top: primaryY, width: g.primary.w }}>
              <PrimaryButton
                label={isSubmitting ? '正在创建对局…' : '开始对战'}
                variant="jade"
                glyph="炼"
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={() => void start()}
                testID="setup-start"
                accessibilityHint={`POST /games：${config.players} 人，真人坐在 P${humanSeat}`}
              />
            </View>
            <View style={{ position: 'absolute', left: g.secondary.x, top: secondaryY, width: g.secondary.w }}>
              <PrimaryButton label="返回" variant="ghost" compact onPress={() => router.back()} testID="setup-back" />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看 POST /games 请求体"
              onPress={() => setShowRequest(true)}
              style={({ pressed }) => [
                styles.requestLink,
                { left: g.utility.x, top: utilityY, width: g.utility.w },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.requestLinkText}>查看 POST /games 请求预览（契约自检）</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.banners}>
          <Banner message={error} onDismiss={clearError} />
          {error && !mock ? (
            <Pressable onPress={enableDemoMode} style={styles.demoAction}>
              <Text style={styles.demoActionText}>后端连不上？点这里用内置演示数据把流程走通</Text>
            </Pressable>
          ) : null}
          <Banner tone="notice" message={resetNotice} onDismiss={() => setResetNotice('')} />
          {mock ? (
            <Banner
              tone="notice"
              message={
                isRuntimeMockOverride()
                  ? 'MOCK 模式（运行期切换）：真人固定坐在 P0。'
                  : 'MOCK 模式（EXPO_PUBLIC_USE_MOCK）：真人固定坐在 P0。'
              }
            />
          ) : null}
        </View>
      </ScrollView>

      {showRequest ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>POST /api/v1/games</Text>
            <Text style={styles.sheetCode}>{requestPreview}</Text>
            <Text style={styles.sheetNote}>
              自检：players == agents.length；human_player 位置为 null；其余座位均有 agent。
            </Text>
            <PrimaryButton label="关闭" variant="ghost" compact onPress={() => setShowRequest(false)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 24,
  },
  measure: {
    width: '100%',
    height: 0,
  },
  headerAction: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerActionText: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: colors.goldLight,
  },
  hint: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    color: colors.muted,
  },
  fieldLabel: {
    fontFamily: fontFamily.body,
    fontWeight: '600',
    color: colors.goldLight,
    letterSpacing: 1,
  },
  fieldSource: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: colors.muted,
    marginTop: 1,
  },
  fieldRow: {
    position: 'absolute',
  },
  note: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    lineHeight: 13,
  },
  emptyBox: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  emptyText: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: colors.muted,
  },
  inlineInput: {
    minHeight: 26,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: colors.text,
    fontSize: 11,
    backgroundColor: colors.surfaceSunken,
  },
  requestLink: {
    position: 'absolute',
    alignItems: 'center',
  },
  requestLinkText: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: colors.jadeLight,
    letterSpacing: 1,
  },
  banners: {
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  demoAction: {
    marginTop: 8,
    alignItems: 'center',
  },
  demoActionText: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: colors.goldLight,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(3,13,14,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 10,
  },
  sheetTitle: {
    fontFamily: fontFamily.title,
    fontSize: 16,
    fontWeight: '700',
    color: colors.goldLight,
    letterSpacing: 2,
  },
  sheetCode: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    lineHeight: 16,
    color: colors.jadeLight,
  },
  sheetNote: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.8,
  },
});

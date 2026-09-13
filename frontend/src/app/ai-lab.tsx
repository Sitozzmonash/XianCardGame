/**
 * 「AI 实验室」（`/ai-lab`）—— 参考原型 `docs/reference-next/components/screens/AILabScreen.tsx` 的 1:1 RN 移植。
 *
 * 逐段对应（参考行号 → 本文件 / 组件）：
 *   33     TopBar(eyebrow 天劫试炼 / title AI 实验室 / 返回)          → `<TopBar onBack>`
 *   36-44  玩家人数（2–6 胶囊）                                      → `<SegmentedSelector>`
 *   46-73  座位策略（头像 + 名字 + P{n} + AISelector）                → `<SeatStrategyList>`
 *   75-98  实验参数 Panel（ISMCTS sims / MCCFR 模型 / Games 数量）    → `<LabParamsPanel>`
 *   101-106 底栏「开始 AI 对战」+「返回」                             → `<BottomBar>`
 *
 * 数据（**不编造**）：模型清单来自真实 `GET /agents`（`useLabAgents`，内部 `@/api/client` 的
 * `http.get('/agents')`），并**按当前人数过滤 `players`**；清单里没有当前人数的模型时显示训练提示，
 * 绝不显示假模型名（参考写死的 100K/500K/Champion 在本仓不存在）。
 *
 * 「开始 AI 对战」为什么是 disabled：本仓**没有跑批量对战的 HTTP 接口**（`POST /games` 只创建单局
 * 人机对局），批量评测只存在于 CLI（docs/RUNBOOK.md §4）。按交付约定：不做假链接、不发请求，
 * 只给 disabled + 「未开放」角标 + 一行原因，并在下面注释里给出 CLI 替代命令：
 *
 *   cd backend
 *   python main.py battle --players 2 --agents mccfr:models/mccfr_2p_10k.pkl ismcts:500 --games 1000
 *   python main.py benchmark --agents rule ismcts:100 ismcts:500 --opponent random --games 500
 *
 * 相关坑（决定了参数不能瞎给）：模型**按人数训练**，跨人数 = 命中率 0% + 100% 回落 RuleAgent 且不报错
 * （docs/INTERFACES.md 附录 A10）；ISMCTS `simulations` 超过后端 `ISMCTS_MAX_SIMULATIONS`（默认 2000）
 * 会被钳位，所以选项沿用参考的 100/500/1000。
 */

import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AIKind } from '@/components/ref/PlayerPanel';
import { BottomBar, ScreenShell, ScrollBody } from '@/components/ref/ScreenShell';
import {
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SegmentedSelector,
  StatusTag,
  TopBar,
} from '@/components/ref/primitives';
import { LabParamsPanel } from '@/components/ref/screens/ailab/LabParamsPanel';
import { SeatStrategyList } from '@/components/ref/screens/ailab/SeatStrategyList';
import {
  battleCommandLines,
  modelsForPlayers,
  trainCommandLines,
  useLabAgents,
} from '@/components/ref/screens/ailab/lab-agents';
import { LAB_PLAYER_COUNTS, LAB_SEATS, simOptionsWith } from '@/components/ref/screens/ailab/lab-seats';
import { creamFaint, sp } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

/** 参考 `AILabScreen.tsx:20/24`：默认 4 人 / 50 局 */
const DEFAULT_PLAYERS = 4;
const DEFAULT_GAMES = 50;
/** `GET /agents` 读不到 ismcts 默认值时的兜底（后端实测默认就是 500） */
const FALLBACK_SIMS = 500;

export default function AiLabScreen() {
  const agents = useLabAgents();

  const [playerCount, setPlayerCount] = useState<number>(DEFAULT_PLAYERS);
  const [kinds, setKinds] = useState<AIKind[]>(() => LAB_SEATS.map((seat) => seat.kind));
  const [sims, setSims] = useState<number | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [games, setGames] = useState<number>(DEFAULT_GAMES);

  const seats = LAB_SEATS.slice(0, playerCount);
  /** 模型按人数过滤：人数一变，本列表随之变化，选中项也会自动落到新列表的第一个（不残留跨人数模型） */
  const availableModels = useMemo(
    () => modelsForPlayers(agents.models, playerCount),
    [agents.models, playerCount],
  );
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0] ?? null;
  const simOptions = useMemo(() => simOptionsWith(agents.ismctsSimulations), [agents.ismctsSimulations]);
  const simsValue = sims ?? agents.ismctsSimulations ?? FALLBACK_SIMS;
  const counts = useMemo(() => {
    const unique = new Set<number>();
    for (const model of agents.models) if (model.players !== null) unique.add(model.players);
    return [...unique].sort((a, b) => a - b);
  }, [agents.models]);

  const setKindAt = (index: number, kind: AIKind) =>
    setKinds((prev) => prev.map((value, i) => (i === index ? kind : value)));

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const mccfrSeats = seats.filter((seat, index) => (kinds[index] ?? seat.kind) === 'mccfr').length;
  const seatWarning =
    mccfrSeats > 0 && availableModels.length === 0
      ? `当前 ${playerCount} 人没有可用 MCCFR 模型：${mccfrSeats} 个 MCCFR 座位会 100% 回落 RuleAgent（见下方实验参数里的训练命令）。`
      : undefined;

  const battleCommand = battleCommandLines(playerCount, games)[0];

  return (
    <ScreenShell variant="plain">
      <Head>
        <title>AI 实验室 · 修仙卡牌</title>
      </Head>

      <TopBar eyebrow="天劫试炼" title="AI 实验室" onBack={back} />

      <ScrollBody>
        <View style={styles.section}>
          <SectionTitle>玩家人数</SectionTitle>
          <SegmentedSelector
            options={LAB_PLAYER_COUNTS}
            value={playerCount}
            onChange={setPlayerCount}
            formatLabel={(count) => `${count} 人`}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>座位策略</SectionTitle>
          <SeatStrategyList seats={seats} kinds={kinds} onKindChange={setKindAt} warning={seatWarning} />
        </View>

        <LabParamsPanel
          players={playerCount}
          sims={simsValue}
          simOptions={simOptions}
          onSimsChange={setSims}
          agents={agents}
          availableModels={availableModels}
          counts={counts}
          selectedModel={selectedModel}
          onModelChange={setModelId}
          games={games}
          onGamesChange={setGames}
          commands={trainCommandLines(playerCount)}
        />
      </ScrollBody>

      <BottomBar>
        <PrimaryButton fullWidth disabled>
          开始 AI 对战
        </PrimaryButton>
        <View style={styles.lockedRow}>
          <StatusTag tone="muted">未开放</StatusTag>
          <Text allowFontScaling={false} style={styles.lockedText}>
            后端未提供批量对战的 HTTP 接口（POST /games 只创建单局人机对局），上面这些参数不会被提交；
            批量评测请在终端跑 CLI：{battleCommand}（docs/RUNBOOK.md §4）。
          </Text>
        </View>
        <SecondaryButton fullWidth onPress={back}>
          返回
        </SecondaryButton>
      </BottomBar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  section: { gap: sp(3) },
  lockedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(2) },
  lockedText: { flex: 1, ...sans(400), fontSize: 10, lineHeight: 15, color: creamFaint },
});

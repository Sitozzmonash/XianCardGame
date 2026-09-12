import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AgentCard,
  ChipSelector,
  LabHeader,
  LabNotes,
  LockedEntry,
  SectionRule,
  dataSourceLabel,
  findAgentByType,
  mccfrAgents,
  mccfrModels,
  SIM_PRESETS,
  FALLBACK_SIMULATIONS,
  TRAIN_COMMAND_LINES,
  TRAIN_REGISTER_NOTE,
  type ChipOption,
  type LabAgent,
  useAgents,
} from '@/components/ai-lab';
import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useGameStore } from '@/store/game-store';
import type { SetupConfig } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

/**
 * AI 实验室（`/ai-lab`）—— 属于「配置 / 工具」类页面，因此用**墨玉色板** `colors`
 * （与对战配置页一致；DESIGN_SPEC §2）。
 *
 * 数据来源：真实 `GET /agents`（API_CONTRACT §5）。前端不写死 agent 列表 / 默认参数 / 模型路径，
 * 也没有任何假链接：能做的就真做（跳 `/setup` 并带上参数），不能做的就 disabled + 「未开放」角标 + 原因。
 */

const SEAT_PRESETS = [
  {
    key: 'trial3p',
    label: '3 人 · 天劫试炼',
    players: 3,
    agentTypes: ['human', 'ismcts', 'rule', 'random', 'rule', 'random'],
    description: 'P0 真人 / P1 ISMCTS（用上方 simulations）/ P2 Rule',
    requiresModel: false,
  },
  {
    key: 'duel2p',
    label: '2 人 · 你我论道',
    players: 2,
    agentTypes: ['human', 'mccfr', 'rule', 'random', 'rule', 'random'],
    description: 'P0 真人 / P1 MCCFR（用上方选中的模型文件）',
    requiresModel: true,
  },
] as const;

type SeatPreset = (typeof SEAT_PRESETS)[number];

const LAB_NOTES = [
  {
    title: 'ISMCTS 是 Single-Observer ISMCTS 教学版',
    detail:
      '只在当前玩家自己的视角上搜索，不做对手建模；推理贵、不训练。这是参考实现的算法定性（docs/INTERFACES.md §2）。',
  },
  {
    title: 'MCCFR 遇到未见信息集回落到 RuleAgent',
    detail:
      '查表式 MCCFR 在 2 人 10K 规模下实战命中率约 15~19%，其余决策由 RuleAgent 完成（docs/RUNBOOK.md §4.1），所以胜率不能单独作为「训练变强」的证据。',
  },
  {
    title: '多人（>2 人）MCCFR 没有 Nash 收敛保证',
    detail:
      '零和收敛保证只在 2 人规模成立（项目规范 §33）；3 人以上只能作为实验型学习算法使用，不要当作稳定对手。',
  },
  {
    title: 'simulations 有服务端上限',
    detail:
      '超过 ISMCTS_MAX_SIMULATIONS（默认 2000）会被后端钳位，钳位结果可在 GameView 的 public.players[].agent.clamped 看到。',
  },
] as const;

/** 启动实验时真正跳转的目标（真实 URL，会显示在按钮下方） */
function buildTargetUrl(preset: SeatPreset, sims: string, model: LabAgent | null): string {
  const parts = ['from=ai-lab', `players=${preset.players}`, `ismcts=${sims}`];
  if (model?.model) parts.push(`mccfr=${encodeURIComponent(model.model)}`);
  return `/setup?${parts.join('&')}`;
}

export default function AiLabScreen() {
  const { status, agents, error, reload } = useAgents();
  const setSetup = useGameStore((state) => state.setSetup);
  const enableDemoMode = useGameStore((state) => state.enableDemoMode);
  const mockMode = useGameStore((state) => state.mockMode);

  const ismcts = useMemo(() => findAgentByType(agents, 'ismcts'), [agents]);
  const mccfrEntries = useMemo(() => mccfrAgents(agents), [agents]);
  const models = useMemo(() => mccfrModels(agents), [agents]);

  const [simsKey, setSimsKey] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState<string>(SEAT_PRESETS[0].key);

  // 默认选中「后端给的默认 simulations」（真实值），后端默认不在预设里时退回契约默认 500
  const backendSims = ismcts?.defaults.simulations ?? null;
  const activeSims =
    simsKey ??
    String(
      backendSims !== null && SIM_PRESETS.includes(backendSims) ? backendSims : FALLBACK_SIMULATIONS,
    );

  const selectedModel = models.find((model) => model.id === modelId) ?? models[0] ?? null;

  const presetOptions: ChipOption[] = useMemo(
    () =>
      SEAT_PRESETS.map((preset) => {
        const locked = preset.requiresModel && models.length === 0;
        return {
          key: preset.key,
          label: preset.label,
          locked,
          lockedReason: locked ? '需要 MCCFR 模型，当前 GET /agents 没有可用模型' : undefined,
          accessibilityLabel: `${preset.label}：${preset.description}`,
        };
      }),
    [models.length],
  );

  const activePreset: SeatPreset | null =
    SEAT_PRESETS.find(
      (preset) => preset.key === presetKey && !(preset.requiresModel && models.length === 0),
    ) ??
    SEAT_PRESETS.find((preset) => !(preset.requiresModel && models.length === 0)) ??
    null;

  const targetUrl = activePreset ? buildTargetUrl(activePreset, activeSims, selectedModel) : '';

  /** 启动实验：把参数真正写进 store（/setup 用 store.setup 初始化）+ 真实跳转并带上 query */
  const launchExperiment = () => {
    if (!activePreset) return;
    const patch: Partial<SetupConfig> = {
      players: activePreset.players,
      humanPlayer: 0,
      agentTypes: [...activePreset.agentTypes],
      ismctsSimulations: Number.parseInt(activeSims, 10) || FALLBACK_SIMULATIONS,
    };
    if (selectedModel?.model) patch.mccfrModel = selectedModel.model;
    setSetup(patch);
    router.push(targetUrl);
  };

  const simsOptions: ChipOption[] = SIM_PRESETS.map((value) => ({
    key: String(value),
    label: String(value),
    accessibilityLabel: `ISMCTS simulations ${value}`,
  }));

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const agent of agents) map.set(agent.type, (map.get(agent.type) ?? 0) + 1);
    return [...map.entries()].map(([type, count]) => `${type}×${count}`).join(' · ');
  }, [agents]);

  return (
    <ScreenBackground variant="home" scroll contentStyle={styles.content}>
      <Head>
        <title>AI 实验室 · 修仙卡牌</title>
      </Head>

      <LabHeader title="AI 实验室" subtitle="天机推演 · 算法实验台" onBack={() => router.back()} />

      <View style={styles.badgeRow}>
        <Badge label={dataSourceLabel()} tone={mockMode ? 'muted' : 'jade'} />
        <Badge
          label={status === 'ready' ? `GET /agents · ${agents.length} 个条目` : 'GET /agents · 读取中'}
          tone="neutral"
        />
      </View>

      {/* ---------------------------------------------------- 1. 斗法单元 */}
      <Panel title="斗法单元（GET /agents）" tone="jade" style={styles.panel}>
        <Text style={styles.fieldLabel}>
          字段：id · name · type · configurable · defaults(simulations/exploration/max_depth) · model
        </Text>

        {status === 'loading' ? (
          <LoadingOverlay visible mode="inline" label="正在向天机阁读取 agent 列表…" />
        ) : null}

        {status === 'error' ? (
          <>
            <Banner message={error} actionLabel="重试" onAction={reload} />
            <Text style={styles.hint}>
              后端没起也能继续看版式：可直接用内置演示数据（mock）查看。
            </Text>
            <View style={styles.inlineAction}>
              <PrimaryButton
                label="使用演示数据"
                variant="gold"
                compact
                onPress={() => {
                  enableDemoMode();
                  reload();
                }}
                accessibilityHint="切到内置 mock 数据源并重新读取 agent 列表"
              />
            </View>
          </>
        ) : null}

        {status === 'ready' && agents.length === 0 ? (
          <Text style={styles.hint}>后端返回了空列表：GET /agents 的 agents 数组长度为 0。</Text>
        ) : null}

        {status === 'ready' ? agents.map((agent) => <AgentCard key={agent.id} agent={agent} />) : null}

        {status === 'ready' && agents.length > 0 ? (
          <Text style={styles.hint}>按类型统计：{typeCounts}</Text>
        ) : null}
      </Panel>

      {/* ---------------------------------------------------- 2. ISMCTS 参数 */}
      <Panel title="ISMCTS 参数" style={styles.panel}>
        <ChipSelector
          label="simulations（单步搜索的抽样局数）"
          options={simsOptions}
          value={activeSims}
          onChange={setSimsKey}
          testID="lab-sims"
          note={
            ismcts
              ? `GET /agents · ismcts 条目的后端默认：simulations=${
                  ismcts.defaults.simulations ?? '未给出'
                } · exploration=${ismcts.defaults.exploration ?? '未给出'} · max_depth=${
                  ismcts.defaults.maxDepth ?? '未给出'
                }`
              : '尚未读到 ismcts 条目（等待 GET /agents）'
          }
        />
        <LockedEntry
          title="exploration / max_depth 自定义"
          description="把探索常数 1.4 与搜索深度 250 做成可调输入。"
          reason="后端请求体已支持这两个字段（app/services/agent_factory.py），但 V1 的 /setup 契约只发送 simulations 与 MCCFR 模型，先不在界面开放。"
        />
      </Panel>

      {/* ---------------------------------------------------- 3. MCCFR 模型 */}
      <Panel title="MCCFR 模型（GET /agents · type=mccfr）" style={styles.panel}>
        {status === 'loading' ? (
          <LoadingOverlay visible mode="inline" label="正在读取模型清单…" />
        ) : null}

        {status === 'error' ? (
          <Text style={styles.hint}>agent 列表读取失败，模型清单同样不可用；点上方「重试」。</Text>
        ) : null}

        {status === 'ready' && mccfrEntries.length === 0 ? (
          <Text style={styles.hint}>
            后端没有返回 type=mccfr 的条目：GET /agents 的 agents 数组里没有 mccfr。
          </Text>
        ) : null}

        {status === 'ready' && mccfrEntries.length > 0 && models.length === 0 ? (
          <>
            <Text style={styles.empty}>暂无可用模型</Text>
            <Text style={styles.hint}>
              后端返回的 mccfr 条目是通用条目（defaults.model = null），说明
              backend/models/index.json 里还没有登记任何 .pkl。
            </Text>
            <View style={styles.codeBlock}>
              {TRAIN_COMMAND_LINES.map((line) => (
                <Text key={line} style={styles.code}>
                  {line}
                </Text>
              ))}
            </View>
            <Text style={styles.hint}>{TRAIN_REGISTER_NOTE}</Text>
            <LockedEntry
              title="在前端启动训练"
              description="一键开跑并显示训练进度。"
              reason="训练是本地 CLI 长任务（分钟~小时级），后端也没有训练 HTTP 接口；请在终端跑上面的命令。"
            />
          </>
        ) : null}

        {status === 'ready' && models.length > 0 ? (
          <ChipSelector
            label="可选模型（来自 models/index.json）"
            options={models.map((model) => ({
              key: model.id,
              label: model.name,
              accessibilityLabel: `选用模型 ${model.name}`,
            }))}
            value={selectedModel?.id ?? null}
            onChange={setModelId}
            testID="lab-model"
            note={
              selectedModel?.model
                ? `模型文件：${selectedModel.model}（id ${selectedModel.id}）`
                : undefined
            }
          />
        ) : null}
      </Panel>

      {/* ---------------------------------------------------- 4. 实验座位预置 */}
      <Panel title="实验座位预置" style={styles.panel}>
        <ChipSelector
          label="对局形态"
          options={presetOptions}
          value={activePreset?.key ?? null}
          onChange={setPresetKey}
          testID="lab-preset"
          note="点「启动实验」会把这里的人数、座位 AI 类型、simulations 与模型写进对局设置，然后跳转 /setup。"
        />
        {activePreset ? (
          <Text style={styles.seatLine}>{activePreset.description}</Text>
        ) : (
          <Text style={styles.hint}>没有可用预置：所有预置都依赖尚不存在的模型。</Text>
        )}
      </Panel>

      {/* ---------------------------------------------------- 5. 未开放 */}
      <Panel title="暂未开放的实验能力" style={styles.panel}>
        <LockedEntry
          title="自我对弈回放"
          description="一次提交两个 agent 打完整局并把棋谱回放到棋盘。"
          reason="后端 CLI 已支持（backend/main.py demo / battle），前端回放器属于后续版本。"
        />
        <LockedEntry
          title="训练曲线可视化"
          description="把 logs/train_metrics.jsonl（iter/s、信息集数量、elapsed）画成曲线。"
          reason="日志文件已由训练写出（docs/INTERFACES.md §3.1），前端图表未实现。"
        />
        <LockedEntry
          title="Elo 评分 / 胜率置信区间"
          description="evaluation/elo.py 的 Elo 表与 evaluation/metrics.py 的 95% Wilson 区间。"
          reason="后端已实现，但只通过 CLI 输出（main.py battle / benchmark）；HTTP 层没有暴露这些接口。"
        />
        <LockedEntry
          title="模型热切换"
          description="不重建对局就替换某个座位的 .pkl。"
          reason="POST /games 时才装配 agent，API_CONTRACT 里没有热切换动作。"
        />
        <LockedEntry
          title="多进程训练对照"
          description="workers>1 的批量同步近似并行训练。"
          reason="它只是工程加速的近似；严格对照实验要求 workers=1（docs/INTERFACES.md §3.1），且不在前端跑。"
        />
      </Panel>

      <SectionRule />

      {/* ---------------------------------------------------- 启动实验 */}
      <View style={styles.actions}>
        <PrimaryButton
          label="启动实验"
          variant="jade"
          glyph="炼"
          disabled={!activePreset}
          onPress={launchExperiment}
          testID="lab-launch"
          hint={
            activePreset
              ? `将写入 setup：${activePreset.players} 人 · P0 真人 · simulations=${activeSims}${
                  selectedModel?.model ? ` · mccfr=${selectedModel.model}` : ''
                }`
              : '没有可用的座位预置'
          }
        />
        <Text style={styles.target} numberOfLines={2}>
          跳转目标：{targetUrl || '（不可用）'}
        </Text>
        <PrimaryButton
          label="返回首页"
          variant="ghost"
          onPress={() => router.replace('/')}
          testID="lab-home"
        />
      </View>

      <LabNotes notes={LAB_NOTES} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    width: '100%',
  },
  panel: {
    width: '100%',
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...text.label,
    color: colors.goldLight,
    marginBottom: spacing.sm,
  },
  hint: {
    ...text.label,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  empty: {
    ...text.heading,
    fontSize: 18,
    color: colors.goldLight,
    marginTop: spacing.xxs,
  },
  codeBlock: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    backgroundColor: 'rgba(4,18,19,0.72)',
  },
  code: {
    ...text.label,
    fontSize: 11,
    color: colors.jadeLight,
    lineHeight: 17,
  },
  inlineAction: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
    minWidth: 180,
  },
  seatLine: {
    ...text.caption,
    color: colors.jadeLight,
    marginTop: spacing.xs,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  target: {
    ...text.label,
    color: colors.muted,
    textAlign: 'center',
  },
});

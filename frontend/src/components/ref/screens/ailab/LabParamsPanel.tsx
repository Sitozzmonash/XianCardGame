/**
 * 「实验参数」Panel —— 1:1 复刻参考 `components/screens/AILabScreen.tsx:75-98`。
 *
 * 参考三组：ISMCTS simulations / MCCFR 模型 / Games 数量，各是一行 11px 标签 + `SegmentedSelector size="sm"`。
 * 差别（都是数据来源不同导致的）：
 *  - ISMCTS：选项沿用参考的 `ISMCTS_SIM_OPTIONS`（100/500/1000），初始值取 **`GET /agents` 里 ismcts
 *    条目的真实默认**（实测 500）；后端若给别的默认值就补一项，避免“无选中项”；
 *  - MCCFR 模型：选项是 **真实 `GET /agents` 清单按人数过滤后的模型**（参考里那三个写死的名字不存在），
 *    没有匹配模型时显示训练提示（`AgentsNotice`）；
 *  - Games 数量：参考的 `GAMES_OPTIONS`（10/50/100/500）。批量对战在后端只有 CLI，没有 HTTP 接口，
 *    所以这组参数只能代表“意图”，提交按钮是 disabled + 未开放（见 `app/ai-lab.tsx` 的说明）。
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Panel, SectionTitle, SegmentedSelector } from '@/components/ref/primitives';
import { AgentsNotice } from '@/components/ref/screens/ailab/AgentsNotice';
import { LAB_GAMES_OPTIONS } from '@/components/ref/screens/ailab/lab-seats';
import type { LabAgentsState, LabModel } from '@/components/ref/screens/ailab/lab-agents';
import { modelLabel } from '@/components/ref/screens/ailab/lab-agents';
import { creamFaint, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text allowFontScaling={false} style={styles.groupLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function LabParamsPanel({
  players,
  sims,
  simOptions,
  onSimsChange,
  agents,
  availableModels,
  counts,
  selectedModel,
  onModelChange,
  games,
  onGamesChange,
  commands,
}: {
  players: number;
  sims: number;
  simOptions: readonly number[];
  onSimsChange: (value: number) => void;
  agents: LabAgentsState;
  /** 已按当前人数过滤过的模型（`modelsForPlayers`） */
  availableModels: readonly LabModel[];
  /** 清单里真实存在的训练人数（用于训练提示里说明哪些人数有模型） */
  counts: readonly number[];
  selectedModel: LabModel | null;
  onModelChange: (id: string) => void;
  games: number;
  onGamesChange: (value: number) => void;
  /** 训练 / 刷新清单命令（RUNBOOK §2.1 / §3.1，按人数生成） */
  commands: readonly string[];
}) {
  const modelIds = availableModels.map((model) => model.id);
  const labelById = new Map(availableModels.map((model) => [model.id, modelLabel(model)]));

  return (
    <Panel>
      <View style={styles.groups}>
        <SectionTitle>实验参数</SectionTitle>

        <Group label="ISMCTS simulations">
          <SegmentedSelector
            size="sm"
            options={simOptions}
            value={sims}
            onChange={onSimsChange}
            formatLabel={(value) => String(value)}
          />
        </Group>

        <Group label="MCCFR 模型">
          {agents.status === 'ready' && modelIds.length > 0 ? (
            <>
              <SegmentedSelector
                size="sm"
                options={modelIds}
                value={selectedModel?.id ?? ''}
                onChange={onModelChange}
                formatLabel={(id) => labelById.get(id) ?? id}
              />
              {selectedModel ? (
                <Text allowFontScaling={false} style={styles.provenance}>
                  来源 GET /agents · 模型文件 {selectedModel.path} · 训练人数 {selectedModel.players ?? '未标注'}
                  {selectedModel.iterations === null ? '' : ` · ${selectedModel.iterations} 迭代`}
                </Text>
              ) : null}
            </>
          ) : (
            <AgentsNotice
              status={agents.status}
              error={agents.error}
              players={players}
              availableCounts={counts}
              commands={commands}
              onRetry={agents.reload}
            />
          )}
        </Group>

        <Group label="Games 数量">
          <SegmentedSelector
            size="sm"
            options={LAB_GAMES_OPTIONS}
            value={games}
            onChange={onGamesChange}
            formatLabel={(value) => `${value} 局`}
          />
        </Group>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  groups: { gap: sp(4) },
  group: { gap: sp(2) },
  groupLabel: { ...sans(400), fontSize: 11, letterSpacing: track(0.14, 11), color: creamFaint },
  provenance: { ...sans(400), fontSize: 10, lineHeight: 15, color: creamFaint },
});

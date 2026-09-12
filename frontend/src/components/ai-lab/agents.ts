/**
 * AI 实验室的数据层 —— **唯一数据源是真实 `GET /agents`**（API_CONTRACT §5）。
 *
 * 这里不写死任何 agent 列表、默认参数或模型路径：
 *  - agent 条目一律来自后端（`random` / `rule` / `ismcts` / `mccfr...`）；
 *  - ISMCTS 默认值读 `defaults.simulations / exploration / max_depth`；
 *  - MCCFR 可选模型读 `type === 'mccfr'` 条目上的 `model` 字段
 *    （后端由 `models/index.json` 生成，见 backend/app/services/model_registry.py）。
 *
 * 解析是防御式的：后端多给 / 少给 / 给 null（真实后端 `mccfr` 条目的 `defaults.model` 就是 null）
 * 都不会把页面炸掉。
 */

import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiBaseUrl, apiModeLabel, isMockMode } from '@/api/client';
import { fetchAgents } from '@/api/game';

export interface LabAgentDefaults {
  simulations: number | null;
  exploration: number | null;
  maxDepth: number | null;
  /** 后端 `defaults.model`（真实后端 mccfr 条目为 null） */
  model: string | null;
}

export interface LabAgent {
  id: string;
  name: string;
  type: string;
  configurable: boolean;
  /** 模型路径（`models/index.json` 条目才有） */
  model: string | null;
  defaults: LabAgentDefaults;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** 单条 agent 的防御性解析；缺少 id / type 的条目直接丢弃（不猜） */
export function normalizeAgent(raw: unknown): LabAgent | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const id = asString(value.id);
  const type = asString(value.type);
  if (!id || !type) return null;

  const defaultsRaw = (value.defaults ?? {}) as Record<string, unknown>;

  return {
    id,
    name: asString(value.name) ?? id,
    type: type.toLowerCase(),
    configurable: value.configurable === true,
    model: asString(value.model) ?? asString(defaultsRaw.model),
    defaults: {
      simulations: asNumber(defaultsRaw.simulations),
      exploration: asNumber(defaultsRaw.exploration),
      maxDepth: asNumber(defaultsRaw.max_depth),
      model: asString(defaultsRaw.model),
    },
  };
}

export type AgentsStatus = 'loading' | 'ready' | 'error';

export interface AgentsState {
  status: AgentsStatus;
  agents: LabAgent[];
  error?: string;
  /** 重新拉取（失败可恢复，不白屏） */
  reload: () => void;
}

/** 拉取 `GET /agents`；失败时给出可恢复的中文提示 + retry */
export function useAgents(): AgentsState {
  const [status, setStatus] = useState<AgentsStatus>('loading');
  const [agents, setAgents] = useState<LabAgent[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(undefined);

    void (async () => {
      try {
        const raw = (await fetchAgents(controller.signal)) as unknown;
        const list = Array.isArray(raw) ? raw : [];
        const parsed = list
          .map(normalizeAgent)
          .filter((agent): agent is LabAgent => agent !== null);
        if (controller.signal.aborted) return;
        setAgents(parsed);
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        let message = '读取 agent 列表失败，请重试。';
        if (err instanceof ApiError) {
          message = err.isNetwork
            ? `连不上后端（${apiBaseUrl}）。启动 backend 后重试：cd backend && python main.py serve`
            : err.message;
        }
        setAgents([]);
        setError(message);
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { status, agents, error, reload };
}

// ------------------------------------------------------------------ 派生视图

export function findAgentByType(agents: LabAgent[], type: string): LabAgent | undefined {
  return agents.find((agent) => agent.type === type);
}

/** 带可用模型的 MCCFR 条目（`model` 为空 = 该条目没有可选模型） */
export function mccfrAgents(agents: LabAgent[]): LabAgent[] {
  return agents.filter((agent) => agent.type === 'mccfr');
}

export function mccfrModels(agents: LabAgent[]): LabAgent[] {
  return mccfrAgents(agents).filter((agent) => agent.model !== null);
}

// ------------------------------------------------------------------ 常量

/** ISMCTS simulations 单选项（与对战配置页同一套预设） */
export const SIM_PRESETS: readonly number[] = [100, 500, 1000, 2000];

export const FALLBACK_SIMULATIONS = 500;

/** 真实训练命令（README「训练 MCCFR」§4 / backend/models/README.md） */
export const TRAIN_COMMAND_LINES: readonly string[] = [
  'cd backend',
  'python main.py train --players 2 --iterations 10000 --workers 1 \\',
  '    --out models/mccfr_2p_10k.pkl',
];

export const TRAIN_REGISTER_NOTE =
  '训练产物放回 backend/models/ 并把条目写入 models/index.json，GET /agents 才会列出该模型。';

/** agent 类型的中文角色标签（纯展示；类型名仍来自后端） */
export const AGENT_TYPE_LABELS: Record<string, string> = {
  random: '随机',
  rule: '规则',
  ismcts: '搜索',
  mccfr: '学习',
  human: '真人',
};

/** 头像圆章里的字（展示用，不表示后端数据） */
export function agentGlyph(type: string): string {
  switch (type) {
    case 'random':
      return '骰';
    case 'rule':
      return '律';
    case 'ismcts':
      return '算';
    case 'mccfr':
      return '策';
    case 'human':
      return '人';
    default:
      return '道';
  }
}

/** 数据源说明（真实值：构建期 env 或运行期切换） */
export function dataSourceLabel(): string {
  return isMockMode() ? `数据源：${apiModeLabel()}` : `数据源：${apiModeLabel()} · ${apiBaseUrl}`;
}

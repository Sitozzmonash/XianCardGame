/**
 * MCCFR 模型清单：来源 = `GET /agents`（真后端 `backend/app/api/agents.py`，
 * mock 走 `src/api/mock.ts`）。参考原型里这一栏是写死的 `['100K','500K','Champion']`
 * （`lib/game-data.ts` 第 165 行），本项目按移植规格 §7.3 改接真清单，**版式不变**。
 *
 * 为什么必须按人数过滤（后端模型是**按人数训练**的，踩过的静默陷阱）：
 *   MCCFR 信息集键包含 `hand_sizes` 长度与 `alive_mask` 位宽，2 人模型放进 3 人局会
 *   命中率 0%、100% 回落 RuleAgent，而界面上完全看不出异常。所以：
 *     有 `players` 且等于当前人数 → 候选；不等于 → 排除；没有 `players` → 候选但标注「人数未知」。
 */

import { fetchAgents } from '@/api/game';

/** `GET /agents` 的条目（`types/card.ts` 的 `AgentInfo` + 模型条目多带的 players/iterations） */
export interface AgentEntry {
  id: string;
  name: string;
  type: string;
  configurable?: boolean;
  model?: string | null;
  players?: number;
  iterations?: number;
  defaults?: Record<string, unknown> | null;
}

/** 一个可选的 MCCFR 模型 */
export interface MccfrOption {
  /** 胶囊里显示的名字（真清单里的 `name`，如 "MCCFR 3P 10K"） */
  label: string;
  /** 提交给后端的引用（`agents[i].model`，路径或模型 id） */
  value: string;
  /** 训练人数；`undefined` = 后端没给这个字段 */
  players?: number;
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** 通用占位条目（后端没有具体模型时的 `{"id":"mccfr","defaults":{"model":null}}`）不能当模型用 */
function isConcreteRef(id: string): boolean {
  return id.includes('/') || id.includes('\\') || /(^|[_-])v?[0-9]/.test(id);
}

/** 后端 agent 条目 → MCCFR 候选（只取 `type === 'mccfr'` 的条目） */
export function toMccfrOptions(agents: readonly AgentEntry[] | undefined | null): MccfrOption[] {
  if (!Array.isArray(agents)) return [];
  const options: MccfrOption[] = [];
  for (const agent of agents) {
    if (!agent || agent.type !== 'mccfr') continue;
    const raw = agent as unknown as Record<string, unknown>;
    const defaults = (raw.defaults ?? {}) as Record<string, unknown>;
    const explicit = pickString(raw, ['model', 'path']) ?? pickString(defaults, ['model', 'path']);
    const declaredEmpty =
      ('model' in raw && (raw.model === null || raw.model === '')) ||
      ('model' in defaults && (defaults.model === null || defaults.model === ''));
    let value = explicit;
    if (!value) {
      if (declaredEmpty) continue;
      if (typeof agent.id !== 'string' || !isConcreteRef(agent.id)) continue;
      value = agent.id;
    }
    if (typeof value !== 'string' || value.length === 0) continue;
    const name = typeof agent.name === 'string' && agent.name.trim().length > 0 ? agent.name.trim() : value;
    const players =
      pickNumber(raw, ['players', 'player_count', 'num_players']) ??
      pickNumber(defaults, ['players', 'player_count', 'num_players']);
    options.push({ label: name, value, players });
  }
  return options;
}

/** 按人数取候选（先确定匹配的，再「人数未知」的） */
export function visibleMccfrOptions(options: readonly MccfrOption[], players: number): MccfrOption[] {
  const matched = options.filter((option) => option.players === players);
  const unknown = options.filter((option) => option.players === undefined);
  return [...matched, ...unknown];
}

/**
 * 人数变化 / 清单到位后决定选中项：
 * 当前选中项仍在候选里 → 保持；否则取第一个候选；一个都没有 → `''`（调用方显示「无可用模型」）。
 */
export function resolveMccfrSelection(
  options: readonly MccfrOption[],
  players: number,
  current: string,
): { value: string; options: MccfrOption[]; changed: boolean } {
  const candidates = visibleMccfrOptions(options, players);
  if (current.length > 0 && candidates.some((option) => option.value === current)) {
    return { value: current, options: candidates, changed: false };
  }
  const next = candidates[0]?.value ?? '';
  return { value: next, options: candidates, changed: next !== current };
}

/** 拉取并解析模型清单；失败时抛错，由页面显示可关闭的提示（不静默吞掉） */
export async function loadMccfrOptions(signal?: AbortSignal): Promise<MccfrOption[]> {
  const agents = (await fetchAgents(signal)) as unknown as AgentEntry[];
  return toMccfrOptions(agents);
}

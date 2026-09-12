/**
 * MCCFR 模型清单：来源 = `GET /api/v1/agents` 的 `mccfr` 条目（API_CONTRACT §5）。
 *
 * 为什么必须按人数过滤（实测踩过的静默陷阱）：
 *   MCCFR 模型是按人数训练 / 查表的（`hand_sizes` 长度与 `alive_mask` 位宽随人数变化）。
 *   把 2 人模型放进 3 人局，命中率为 0%、100% 回落 RuleAgent，而界面上看不出任何异常：
 *     main.py battle --players 3 --agents mccfr:models/v2_10k.pkl rule random
 *     0:mccfr:.../v2_10k.pkl  决策 468 | 命中训练信息集 0 (0.0%) | 回落 Rule 468 (100.0%)
 *   所以这里按 `players` 过滤，缺字段时明确标注「人数未知」，不假装匹配。
 */
import type { AgentInfo } from '@/types/card';

export interface MccfrModelOption {
  /** 文件名/容量短标签（胶囊里显示，如 "100K" / "V2 · 10K"） */
  short: string;
  /** 完整名称（无障碍标签 / 提示文字用） */
  label: string;
  /** 提交给后端的真实模型引用（写入 `agents[i].model`） */
  value: string;
  /** 训练人数；`undefined` = 后端没给这个字段 */
  players?: number;
  /** 后端给的说明（可选） */
  note?: string;
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

/** id 是否像一个具体模型引用（路径 / 版本号 / 容量标记），而不是通用的 "mccfr" 占位 id */
export function isConcreteModelRef(id: string): boolean {
  return (
    id.includes('/') ||
    id.includes('\\') ||
    /(^|[_-])v[0-9]/i.test(id) ||
    /[0-9]+\s*[km](?![a-z0-9])/i.test(id)
  );
}

/** 胶囊里的短标签：优先取容量标记（100K / 500K / 10K）、Champion，否则取文件名主干 */
export function compactLabel(name: string, value: string): string {
  const source = `${name} ${value}`;
  const capacity = /([0-9]+)\s*([KM])\b/i.exec(source);
  if (capacity) return `${capacity[1]}${capacity[2].toUpperCase()}`;
  if (/champion/i.test(source)) return 'Champion';
  if (/strategy/i.test(source)) return '策略';
  const base = value.split(/[\\/]/).pop() ?? value;
  const trimmed = base
    .replace(/\.pkl$/i, '')
    .replace(/^mccfr[_-]?/i, '')
    .replace(/^[0-9]+p[_-]?/i, '')
    .replace(/^v[0-9]+[_-]?/i, '');
  return (trimmed.length > 0 ? trimmed : base).slice(0, 10);
}

/**
 * 后端条目 → 选项。`model` 缺失时用 `id` 兜底（契约 §6 允许后端自定义引用），
 * `players` 允许出现在条目顶层或 `defaults` 里。
 */
export function toMccfrOptions(agents: AgentInfo[] | undefined | null): MccfrModelOption[] {
  if (!Array.isArray(agents)) return [];
  const options: MccfrModelOption[] = [];
  for (const agent of agents) {
    if (!agent || agent.type !== 'mccfr') continue;
    const raw = agent as unknown as Record<string, unknown>;
    const defaults = (raw.defaults ?? {}) as Record<string, unknown>;
    const explicit = pickString(raw, ['model', 'path']) ?? pickString(defaults, ['model', 'path']);
    // 后端显式声明「没有绑定模型」（如内置的通用 mccfr 条目 defaults.model = null）
    // → 不能拿 id 当模型路径糊上去，直接跳过，由调用方显示「无可用模型」。
    const declaredEmpty =
      ('model' in raw && (raw.model === null || raw.model === '')) ||
      ('model' in defaults && (defaults.model === null || defaults.model === ''));
    let value = explicit;
    if (!value) {
      if (declaredEmpty) continue;
      if (typeof agent.id !== 'string' || !isConcreteModelRef(agent.id)) continue;
      value = agent.id;
    }
    if (!value) continue;
    const players =
      pickNumber(raw, ['players', 'player_count', 'num_players']) ??
      pickNumber(defaults, ['players', 'player_count', 'num_players']);
    const name = typeof agent.name === 'string' && agent.name.trim().length > 0 ? agent.name.trim() : value;
    const note = pickString(raw, ['note', 'description']);
    options.push({
      short: compactLabel(name, value),
      label: name === value ? name : `${name}（${value}）`,
      value,
      players,
      note,
    });
  }
  return options;
}

/**
 * 按人数过滤。规则：
 *  - 有 `players` 且等于当前人数 → 命中；
 *  - 有 `players` 但不等于当前人数 → 排除（这就是那个 0% 命中的坑）；
 *  - 没有 `players` → 保留但标记为「人数未知」（后端没给字段时的回退）。
 */
export function filterMccfrByPlayers(
  options: MccfrModelOption[],
  players: number,
): { matched: MccfrModelOption[]; unknown: MccfrModelOption[] } {
  const matched: MccfrModelOption[] = [];
  const unknown: MccfrModelOption[] = [];
  for (const option of options) {
    if (option.players === undefined) unknown.push(option);
    else if (option.players === players) matched.push(option);
  }
  return { matched, unknown };
}

/** 人数变化后要展示的候选（先展示确定匹配的，再展示人数未知的） */
export function visibleMccfrOptions(options: MccfrModelOption[], players: number): MccfrModelOption[] {
  const { matched, unknown } = filterMccfrByPlayers(options, players);
  return [...matched, ...unknown];
}

/**
 * 人数变化时决定新的选中模型：
 *  - 当前选中项仍在候选里 → 保持；
 *  - 否则取第一个候选；
 *  - 都没有 → `''`（调用方据此显示「无可用模型」提示并禁用 mccfr）。
 */
export function resolveMccfrSelection(
  options: MccfrModelOption[],
  players: number,
  current: string,
): { value: string; options: MccfrModelOption[]; changed: boolean } {
  const candidates = visibleMccfrOptions(options, players);
  if (current.length > 0 && candidates.some((option) => option.value === current)) {
    return { value: current, options: candidates, changed: false };
  }
  const next = candidates[0]?.value ?? '';
  return { value: next, options: candidates, changed: next !== current };
}

/**
 * URL 参数里的模型引用 → 清单里对应的选项。
 * 支持：完整 value（路径或 id）、路径的文件名、去掉 .pkl 的文件名、忽略大小写的前后缀匹配。
 * 找不到返回 `undefined`（调用方据此忽略该参数并提示）。
 */
export function matchMccfrParam(
  options: MccfrModelOption[],
  raw: string,
): MccfrModelOption | undefined {
  const wanted = raw.trim();
  if (wanted.length === 0) return undefined;
  const lower = wanted.toLowerCase();
  const base = (value: string) => (value.split(/[\\/]/).pop() ?? value).toLowerCase();

  return (
    options.find((option) => option.value === wanted) ??
    options.find((option) => option.value.toLowerCase() === lower) ??
    options.find((option) => base(option.value) === base(wanted)) ??
    options.find((option) => base(option.value).replace(/\.pkl$/, '') === base(wanted).replace(/\.pkl$/, '')) ??
    options.find((option) => option.value.toLowerCase().endsWith(lower)) ??
    options.find((option) => option.label.toLowerCase().includes(lower))
  );
}

/** 「无可用模型」时展示的真实提示（不是空下拉） */
export function noModelHint(players: number): string {
  return (
    `当前人数（${players} 人）暂无可用模型。模型按人数训练，需先训练：\n` +
    `python main.py train --players ${players} --iterations 10000 --out models/mccfr_${players}p_10k.pkl`
  );
}

/**
 * AI 实验室的数据层 —— **唯一来源是真实 `GET /agents`**（API_CONTRACT §5）。
 *
 * 与参考原型最大的差别（也是必须的差别）：参考把模型写死成
 * `MCCFR_MODEL_OPTIONS = ['100K','500K','Champion']`（`lib/game-data.ts:165`，纯原型文案），
 * 本仓的真模型名由后端 `models/index.json` 决定（实测：`mccfr_3p_10k`、`v2_10k`、`v2_10k_strategy` …）。
 * 所以这里一律用真实清单，并**按玩家人数过滤** `players`：
 * 信息集 key 含 `hand_sizes`/`alive_mask`，跨人数使用会 100% 回落 RuleAgent 且不报错
 * （docs/INTERFACES.md 附录 A10、RUNBOOK §2.0）。
 *
 * 取数走 `@/api/game` 的 `fetchAgents`（内部就是 `@/api/client` 的 `http.get('/agents')` 再拆
 * `{agents:[...]}`；`@/api/client` 里并没有 `apiGet` 这个导出），它另外负责 mock 数据源的分支。
 *
 * 解析是防御式的：`players` / `iterations` 在条目**顶层**（实测），`model` 为路径；
 * 缺 `model` 的 mccfr 条目（例如 mock 的通用条目）不算“可用模型”，只会走到训练提示。
 */

import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiBaseUrl } from '@/api/client';
import { fetchAgents } from '@/api/game';

export interface LabModel {
  id: string;
  name: string;
  /** 模型文件路径（`models/*.pkl`），`POST /games` 的 `mccfr.model` 就是它 */
  path: string;
  /** 训练时的人数（`GET /agents` 顶层字段；后端没给就是 null） */
  players: number | null;
  iterations: number | null;
}

export interface LabAgentsState {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  /** 全部可用模型（带路径的 mccfr 条目） */
  models: LabModel[];
  /** `GET /agents` 里 ismcts 条目的后端默认 simulations（真实值，读不到就是 null） */
  ismctsSimulations: number | null;
  reload: () => void;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** 一条 mccfr 模型条目 → LabModel；不是“可用模型”就返回 null（不猜、不补默认名） */
export function normalizeLabModel(raw: unknown): LabModel | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const id = asString(value.id);
  const type = asString(value.type);
  const path = asString(value.model);
  if (!id || type !== 'mccfr' || !path) return null;

  return {
    id,
    name: asString(value.name) ?? id,
    path,
    players: asNumber(value.players),
    iterations: asNumber(value.iterations),
  };
}

export function useLabAgents(): LabAgentsState {
  const [status, setStatus] = useState<LabAgentsState['status']>('loading');
  const [error, setError] = useState<string | undefined>(undefined);
  const [models, setModels] = useState<LabModel[]>([]);
  const [ismctsSimulations, setIsmctsSimulations] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(undefined);

    void (async () => {
      try {
        const raw = (await fetchAgents(controller.signal)) as unknown;
        const list = Array.isArray(raw) ? raw : [];
        if (controller.signal.aborted) return;

        const parsed = list
          .map(normalizeLabModel)
          .filter((model): model is LabModel => model !== null);

        const ismcts = list.find((entry) => asString((entry as Record<string, unknown>)?.type) === 'ismcts') as
          | { defaults?: { simulations?: unknown } }
          | undefined;

        setModels(parsed);
        setIsmctsSimulations(asNumber(ismcts?.defaults?.simulations));
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        setModels([]);
        setIsmctsSimulations(null);
        setError(
          err instanceof ApiError && err.isNetwork
            ? `连不上后端（${apiBaseUrl}）：GET /agents 读取失败。`
            : err instanceof Error
              ? err.message
              : 'GET /agents 读取失败。',
        );
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { status, error, models, ismctsSimulations, reload };
}

/** 按人数过滤：只有 `players` 与当前人数一致的模型才给选（null = 后端未标注人数，也不给选） */
export function modelsForPlayers(models: readonly LabModel[], players: number): LabModel[] {
  return models.filter((model) => model.players === players);
}

export function modelLabel(model: LabModel): string {
  const meta = [model.players === null ? '人数未标注' : `${model.players} 人`, model.iterations === null ? null : `${model.iterations} 迭代`]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return `${model.name}（${meta}）`;
}

// ---------------------------------------------------------------- 未开放能力的真实替代

/**
 * 训练 / 刷新清单命令（**逐字来自 docs/RUNBOOK.md**）：
 *   §2.1 `main.py train --players N --iterations 10000 --workers 1 --out models/mccfr_<N>p_10k.pkl`
 *   §3.1 `main.py models --write-index`（刷新 models/index.json，`GET /agents` 才会列出新模型）
 * RUNBOOK 里用 `"$PY"` 指 `backend/.venv/Scripts/python.exe`，这里写 `python`（激活 venv 或
 * `uv run --with-requirements requirements.txt python` 均可）。命令保持单行，不带续行符。
 */
export function trainCommandLines(players: number): string[] {
  return [
    'cd backend',
    `python main.py train --players ${players} --iterations 10000 --workers 1 --out models/mccfr_${players}p_10k.pkl`,
    'python main.py models --write-index',
  ];
}

/** 批量对战的 CLI 替代（RUNBOOK §4）；本仓没有对应的 HTTP 接口，界面上只如实说明 */
export function battleCommandLines(players: number, games: number): string[] {
  return [
    `python main.py battle --players ${players} --agents rule ismcts:500 --games ${games}`,
  ];
}

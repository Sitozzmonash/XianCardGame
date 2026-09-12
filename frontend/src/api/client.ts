/**
 * 统一 HTTP 客户端（铁律 2：页面里不允许直接 fetch，必须经过这里）。
 *
 * base URL：EXPO_PUBLIC_API_BASE_URL，缺省 http://localhost:8000/api/v1
 * mock 开关：EXPO_PUBLIC_USE_MOCK（'1'/'true'/'yes' → 使用 src/api/mock.ts；缺省 = 走真后端）
 *
 * 注意：Expo CLI 只在构建期静态替换 `process.env.EXPO_PUBLIC_*` 字面量，
 * 因此下面必须写成静态成员访问，不能写 process.env[key]。
 */

import type { ApiErrorBody } from '@/types/game';

export const DEFAULT_API_BASE_URL = 'http://localhost:8000/api/v1';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export const apiBaseUrl: string = trimTrailingSlash(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
);

export const requestTimeoutMs: number = Number.parseInt(
  process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? '15000',
  10,
);

/** 构建期开关：**只有**显式设置 EXPO_PUBLIC_USE_MOCK=1/true/yes 才走 mock；默认走真后端 */
export function envMockEnabled(): boolean {
  const flag = (process.env.EXPO_PUBLIC_USE_MOCK ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/**
 * 运行期开关：后端不可用时，用户可以在首页点「使用演示数据」临时切到 mock，
 * 不需要重新构建。真后端路径的代码完全不变。
 */
let runtimeMockOverride = false;

export function setRuntimeMockOverride(enabled: boolean): void {
  runtimeMockOverride = enabled;
}

export function isMockMode(): boolean {
  return runtimeMockOverride || envMockEnabled();
}

/** 当前 mock 是否来自运行期切换（而非构建期环境变量） */
export function isRuntimeMockOverride(): boolean {
  return runtimeMockOverride;
}

export function apiModeLabel(): string {
  return isMockMode() ? 'MOCK 演示数据' : '真实后端';
}

/** 统一错误：页面只需要 ApiError.code / .status 就能做友好提示 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 409：revision 过期 / 非法动作（前端要能友好恢复：重新拉最新局面） */
  get isConflict(): boolean {
    return this.status === 409 || this.code === 'STALE_REVISION';
  }

  /** 404：session 不存在（后端重启 / 对局过期） */
  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'GAME_NOT_FOUND' || this.code === 'SESSION_NOT_FOUND';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** query 参数（值为 undefined/null 的键会被忽略） */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function parseErrorBody(raw: string): { code: string; message: string; details: Record<string, unknown> | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApiErrorBody> & { detail?: unknown };
    const err = parsed.error;
    if (err && typeof err === 'object' && typeof err.code === 'string') {
      return {
        code: err.code,
        message: typeof err.message === 'string' ? err.message : err.code,
        details: (err.details as Record<string, unknown> | null) ?? null,
      };
    }
    if (typeof parsed.detail === 'string') {
      return { code: 'SCHEMA_ERROR', message: parsed.detail, details: null };
    }
  } catch {
    /* 非 JSON 错误体，走下面的兜底 */
  }
  return null;
}

/**
 * 唯一出口。所有请求都带超时；错误统一转换为 ApiError。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = requestTimeoutMs, signal, query } = options;
  const url = `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}${buildQuery(query)}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'AbortError' || name === 'AbortSignal' || controller.signal.aborted) {
      throw new ApiError(
        0,
        timedOut ? 'TIMEOUT' : 'ABORTED',
        timedOut ? '请求超时，请检查网络或后端是否在运行。' : '请求已取消。',
      );
    }
    throw new ApiError(0, 'NETWORK_ERROR', `无法连接后端（${apiBaseUrl}），请确认服务已启动。`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  const text = await response.text();

  if (!response.ok) {
    const parsed = parseErrorBody(text);
    throw new ApiError(
      response.status,
      parsed?.code ?? `HTTP_${response.status}`,
      parsed?.message ?? `请求失败（HTTP ${response.status}）`,
      parsed?.details ?? null,
    );
  }

  if (response.status === 204 || text.length === 0) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, 'INVALID_JSON', '后端返回的内容不是合法 JSON。');
  }
}

export const http = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  del: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

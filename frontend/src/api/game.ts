/**
 * 游戏 API 门面。
 *
 *  - mock 模式（EXPO_PUBLIC_USE_MOCK=true）：转发到 src/api/mock.ts
 *  - 真后端模式：走 src/api/client.ts 的 HTTP 请求，路径与 API_CONTRACT.md 完全一致
 *
 * 返回给 store 的 GameView 一律先过 normalizeView()，做一次防御性解析
 * （TECH_ARCHITECTURE §12 要求前端有 API parsing 能力：缺字段不能把页面炸掉）。
 */

import { ApiError, apiBaseUrl, http, isMockMode } from './client';
import { mockApi } from './mock';
import type { AgentInfo, CardSpec } from '@/types/card';
import type {
  CreateGameRequest,
  CreateGameResponse,
  DeleteGameResponse,
  GameView,
  HealthResponse,
  LegalAction,
  Observation,
  Phase,
  PlayerPublicView,
  PublicState,
  SubmitActionRequest,
} from '@/types/game';
import type { GameEvent } from '@/types/event';

const PHASES: Phase[] = ['ACTION', 'COUNTER', 'REORDER', 'REINSERT', 'ENDED'];

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizePhase(value: unknown): Phase {
  const phase = asString(value, 'ACTION') as Phase;
  return PHASES.includes(phase) ? phase : 'ACTION';
}

function normalizeObservation(raw: unknown): Observation {
  const value = (raw ?? {}) as Partial<Observation>;
  return {
    hand: Array.isArray(value.hand)
      ? value.hand.map((card) => ({
          instance_id: asString(card?.instance_id),
          card_id: asString(card?.card_id),
          name: asString(card?.name),
        }))
      : [],
    known_top: Array.isArray(value.known_top)
      ? value.known_top.map((entry) => ({
          position: asNumber(entry?.position),
          card_id: asString(entry?.card_id),
          name: typeof entry?.name === 'string' ? entry.name : undefined,
        }))
      : [],
    actions_used: asNumber(value.actions_used),
    max_actions_per_turn: asNumber(value.max_actions_per_turn),
    private_context:
      value.private_context && Array.isArray(value.private_context.cards)
        ? {
            cards: value.private_context.cards.map((card, index) => ({
              token: asString(card?.token, `private_${index + 1}`),
              card_id: asString(card?.card_id),
              name: typeof card?.name === 'string' ? card.name : undefined,
            })),
          }
        : null,
  };
}

function normalizePlayer(raw: unknown): PlayerPublicView {
  const value = (raw ?? {}) as Partial<PlayerPublicView>;
  return {
    player_id: asNumber(value.player_id),
    name: asString(value.name, '未知道友'),
    alive: value.alive !== false,
    hand_count: asNumber(value.hand_count),
    is_current: value.is_current === true,
    is_decision_player: value.is_decision_player === true,
    agent: value.agent ?? null,
    avatar: value.avatar ?? null,
  };
}

function normalizePublic(raw: unknown): PublicState {
  const value = (raw ?? {}) as Partial<PublicState>;
  return {
    round: asNumber(value.round, 1),
    deck_count: asNumber(value.deck_count),
    discard_count: asNumber(value.discard_count),
    players: Array.isArray(value.players) ? value.players.map(normalizePlayer) : [],
    last_discard: value.last_discard ?? null,
    turn_no: value.turn_no === undefined ? undefined : asNumber(value.turn_no),
  };
}

function normalizeLegalAction(raw: unknown): LegalAction {
  const value = (raw ?? {}) as Partial<LegalAction>;
  return {
    id: asString(value.id),
    type: (value.type ?? 'END_ACTION') as LegalAction['type'],
    label: asString(value.label, '未命名动作'),
    enabled: value.enabled !== false,
    card_instance_id: value.card_instance_id ?? null,
    params: value.params ?? null,
  };
}

function normalizeEvent(raw: unknown, index: number): GameEvent {
  const value = (raw ?? {}) as Partial<GameEvent>;
  // 线上契约只有 seq/type/actor/data 四键（backend/app/services/events.py:render_event）。
  // 顶层 target/card_id/message 曾经在此映射，但后端从不发送 —— 已删除，避免下游误读。
  return {
    seq: asNumber(value.seq, index + 1),
    type: (value.type ?? 'TURN_STARTED') as GameEvent['type'],
    actor: value.actor ?? null,
    data: value.data ?? null,
  };
}

/** 把任何后端返回的 GameView 收敛成前端可安全渲染的形状 */
export function normalizeView(raw: unknown): GameView {
  const value = (raw ?? {}) as Partial<GameView>;
  return {
    game_id: asString(value.game_id),
    status: (value.status ?? 'playing') as GameView['status'],
    revision: asNumber(value.revision),
    viewer_player_id: asNumber(value.viewer_player_id),
    phase: normalizePhase(value.phase),
    current_player: asNumber(value.current_player, -1),
    decision_player: asNumber(value.decision_player, -1),
    observation: normalizeObservation(value.observation),
    public: normalizePublic(value.public),
    legal_actions: Array.isArray(value.legal_actions)
      ? value.legal_actions.map(normalizeLegalAction).filter((action) => action.id.length > 0)
      : [],
    events: Array.isArray(value.events)
      ? value.events
          .map((event, index) => normalizeEvent(event, index))
          .sort((a, b) => a.seq - b.seq)
      : [],
    winner: value.winner ?? null,
    forced_stop: value.forced_stop === true,
    created_at: value.created_at,
  };
}

export function usingMock(): boolean {
  return isMockMode();
}

export function apiEndpoint(): string {
  return isMockMode() ? '内置 mock（无需后端）' : apiBaseUrl;
}

// ------------------------------------------------------------------ 统一出口

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  if (isMockMode()) return mockApi.fetchHealth();
  return http.get<HealthResponse>('/health', { signal });
}

export async function fetchAgents(signal?: AbortSignal): Promise<AgentInfo[]> {
  if (isMockMode()) return mockApi.fetchAgents();
  const data = await http.get<{ agents?: AgentInfo[] }>('/agents', { signal });
  return Array.isArray(data?.agents) ? data.agents : [];
}

export async function fetchCards(signal?: AbortSignal): Promise<CardSpec[]> {
  if (isMockMode()) return mockApi.fetchCards();
  const data = await http.get<{ cards?: CardSpec[] }>('/cards', { signal });
  return Array.isArray(data?.cards) ? data.cards : [];
}

export async function createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
  if (isMockMode()) return mockApi.createGame(request);
  const data = await http.post<CreateGameResponse>('/games', request);
  return {
    game_id: asString(data?.game_id),
    player_id: asNumber(data?.player_id),
    state: normalizeView(data?.state),
  };
}

export async function getGame(gameId: string, signal?: AbortSignal): Promise<GameView> {
  if (!gameId) throw new ApiError(400, 'INVALID_REQUEST', '缺少 game_id。');
  if (isMockMode()) return mockApi.getGame(gameId);
  const data = await http.get<GameView>(`/games/${encodeURIComponent(gameId)}`, { signal });
  return normalizeView(data);
}

export async function submitAction(
  gameId: string,
  request: SubmitActionRequest,
): Promise<GameView> {
  if (!gameId) throw new ApiError(400, 'INVALID_REQUEST', '缺少 game_id。');
  if (isMockMode()) return mockApi.submitAction(gameId, request);
  const data = await http.post<GameView>(`/games/${encodeURIComponent(gameId)}/actions`, request);
  return normalizeView(data);
}

export async function deleteGame(gameId: string): Promise<DeleteGameResponse> {
  if (!gameId) return { ok: false };
  if (isMockMode()) return mockApi.deleteGame(gameId);
  return http.del<DeleteGameResponse>(`/games/${encodeURIComponent(gameId)}`);
}

export const gameApi = {
  fetchHealth,
  fetchAgents,
  fetchCards,
  createGame,
  getGame,
  submitAction,
  deleteGame,
};

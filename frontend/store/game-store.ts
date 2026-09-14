/**
 * Zustand 全局 store（FRONTEND_GUIDE §5，字段名保持契约一致，另有少量必要扩展）。
 *
 * 动作时序（铁律 3）：
 *   lock input(isSubmitting=true) → POST action（带 revision）→ 更新权威 view
 *   → events 进 animationQueue（按 seq）→ 播放 → 队列清空后才 unlock
 * 409（revision 冲突）→ 自动 refreshGame() 拉最新局面 + 友好提示，绝不静默失败。
 */

import { create } from 'zustand';

import { ApiError, isMockMode, setRuntimeMockOverride } from '@/api/client';
import {
  createGame as apiCreateGame,
  deleteGame as apiDeleteGame,
  getGame as apiGetGame,
  submitAction as apiSubmitAction,
} from '@/api/game';
import type { AgentSpec } from '@/types/card';
import type { GameEvent } from '@/types/event';
import type { ActionPayload, CreateGameRequest, GameView } from '@/types/game';
import { eventLogLine } from '@/utils/event-log';
import { playerNameOf } from '@/utils/legal-actions';

const MAX_LOG_LINES = 300;

export interface SetupConfig {
  players: number;
  humanPlayer: number;
  /** 每个座位的 AI 类型（human 座位固定为 'human'） */
  agentTypes: string[];
  ismctsSimulations: number;
  mccfrModel: string;
  /** '' = 由服务端随机 */
  seed: string;
}

export const MOCK_HUMAN_SEAT = 0;

export const DEFAULT_SETUP: SetupConfig = {
  players: 3,
  humanPlayer: 0,
  agentTypes: ['human', 'rule', 'ismcts', 'random', 'rule', 'random'],
  ismctsSimulations: 500,
  mccfrModel: 'mccfr_3p_10k',
  seed: '',
};

export interface GameStore {
  // ---- state（契约字段） ----
  gameId?: string;
  view?: GameView;
  selectedCardId?: string;
  isSubmitting: boolean;
  animationQueue: GameEvent[];
  error?: string;

  // ---- 扩展字段 ----
  notice?: string;
  isRefreshing: boolean;
  battleLog: string[];
  /** 当前是否处于 mock 数据源（构建期 env 或运行期切换），用于 UI 展示与响应式刷新 */
  mockMode: boolean;
  /** 用于 UI 高亮最后提交的动作（可访问性：不仅靠颜色） */
  lastActionId?: string;
  setup: SetupConfig;

  // ---- actions（契约签名 + 必要扩展） ----
  createGame(config?: Partial<SetupConfig>): Promise<string | null>;
  submitAction(actionId: string, payload?: ActionPayload): Promise<void>;
  refreshGame(): Promise<void>;
  selectCard(cardInstanceId?: string): void;
  clearGame(): void;
  dequeueEvent(): void;
  skipAnimations(): void;
  clearError(): void;
  setSetup(patch: Partial<SetupConfig>): void;
  /** 运行期切到内置演示数据（后端不可用时的兜底入口） */
  enableDemoMode(): void;
  /** 切回真后端 */
  disableDemoMode(): void;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return '连接不上后端，请确认服务已启动（或打开 mock 模式）。';
    if (error.code === 'TIMEOUT') return '请求超时，请稍后重试。';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return '发生未知错误，请重试。';
}

export function buildAgentSpec(setup: SetupConfig, seat: number): AgentSpec {
  const type = setup.agentTypes[seat] ?? 'rule';
  switch (type) {
    case 'ismcts':
      return { type: 'ismcts', simulations: setup.ismctsSimulations };
    case 'mccfr':
      return { type: 'mccfr', id: setup.mccfrModel };
    case 'random':
      return { type: 'random' };
    default:
      return { type: 'rule' };
  }
}

function appendLog(view: GameView, events: GameEvent[], previous: string[]): string[] {
  if (events.length === 0) return previous;
  const nameOf = (playerId: number | null | undefined) => playerNameOf(view, playerId);
  const lines = events.map((event) => eventLogLine(event, nameOf));
  const merged = [...previous, ...lines];
  return merged.length > MAX_LOG_LINES ? merged.slice(merged.length - MAX_LOG_LINES) : merged;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameId: undefined,
  view: undefined,
  selectedCardId: undefined,
  isSubmitting: false,
  animationQueue: [],
  error: undefined,
  notice: undefined,
  isRefreshing: false,
  battleLog: [],
  mockMode: isMockMode(),
  lastActionId: undefined,
  setup: DEFAULT_SETUP,

  setSetup: (patch) => set({ setup: { ...get().setup, ...patch } }),

  enableDemoMode() {
    setRuntimeMockOverride(true);
    // 数据源切换后，旧的 gameId/session 不再可用，必须清空
    set({
      mockMode: true,
      gameId: undefined,
      view: undefined,
      animationQueue: [],
      battleLog: [],
      error: undefined,
      isSubmitting: false,
      isRefreshing: false,
      selectedCardId: undefined,
      notice: '已切换到内置演示数据（mock）：无需后端即可完整走完一局。',
    });
  },

  disableDemoMode() {
    setRuntimeMockOverride(false);
    set({
      mockMode: false,
      gameId: undefined,
      view: undefined,
      animationQueue: [],
      battleLog: [],
      error: undefined,
      isSubmitting: false,
      isRefreshing: false,
      selectedCardId: undefined,
      notice: '已切回真后端模式，请确认 backend 已在 NEXT_PUBLIC_API_BASE_URL 上运行。',
    });
  },

  async createGame(overrides) {
    const mergedSetup: SetupConfig = { ...get().setup, ...overrides };
    // mock 演示局固定以 P0 为真人视角（mock 只产出 viewer 0 的视图）
    const setup: SetupConfig = isMockMode()
      ? { ...mergedSetup, humanPlayer: MOCK_HUMAN_SEAT }
      : mergedSetup;

    const agents: (AgentSpec | null)[] = Array.from({ length: setup.players }, (_, seat) =>
      seat === setup.humanPlayer ? null : buildAgentSpec(setup, seat),
    );

    const request: CreateGameRequest = {
      players: setup.players,
      human_player: setup.humanPlayer,
      agents,
      seed: setup.seed.trim().length > 0 ? Number.parseInt(setup.seed.trim(), 10) : null,
    };
    if (request.seed !== null && !Number.isFinite(request.seed)) {
      set({ error: 'Seed 必须是整数（或留空由服务端随机）。' });
      return null;
    }

    set({ isSubmitting: true, error: undefined, notice: undefined, animationQueue: [], battleLog: [] });

    try {
      const response = await apiCreateGame(request);
      const view = response.state;
      set({
        setup,
        gameId: response.game_id,
        view,
        selectedCardId: undefined,
        animationQueue: view.events,
        isSubmitting: view.events.length > 0,
        battleLog: appendLog(view, view.events, []),
      });
      return response.game_id;
    } catch (error) {
      set({ isSubmitting: false, error: errorMessageOf(error) });
      return null;
    }
  },

  async submitAction(actionId, payload) {
    const state = get();
    const view = state.view;
    const gameId = state.gameId;

    if (!view || !gameId) {
      set({ error: '当前没有进行中的对局。' });
      return;
    }
    // 防连点 / 防动画未播完时的重复提交
    if (state.isSubmitting || state.animationQueue.length > 0) return;

    const action = view.legal_actions.find((item) => item.id === actionId);
    if (!action || action.enabled === false) {
      // 前端不猜测规则：只如实反馈后端没给这个动作
      set({ error: '该操作在当前局面不可用，请重新选择。' });
      return;
    }

    set({
      isSubmitting: true,
      error: undefined,
      notice: undefined,
      selectedCardId: undefined,
      lastActionId: actionId,
    });

    try {
      const next = await apiSubmitAction(gameId, {
        revision: view.revision,
        action_id: actionId,
        payload: payload ?? {},
      });

      const events = [...next.events].sort((a, b) => a.seq - b.seq);
      set({
        view: next,
        animationQueue: events,
        isSubmitting: events.length > 0, // 有动画时保持锁定，播完才解锁
        battleLog: appendLog(next, events, get().battleLog),
      });
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) {
        set({
          isSubmitting: true,
          error: '局面已更新（revision 冲突），正在同步最新状态…',
        });
        await get().refreshGame();
        set({
          isSubmitting: false,
          error: undefined,
          notice: '已同步到最新局面，请重新选择动作。',
        });
        return;
      }

      if (error instanceof ApiError && error.isNotFound) {
        set({
          isSubmitting: false,
          error: '对局不存在或已过期（后端可能已重启），请返回首页重新开始。',
        });
        return;
      }

      set({ isSubmitting: false, error: errorMessageOf(error) });
    }
  },

  async refreshGame() {
    const gameId = get().gameId;
    if (!gameId) return;
    set({ isRefreshing: true });
    try {
      const view = await apiGetGame(gameId);
      set({
        view,
        isRefreshing: false,
        animationQueue: [],
        selectedCardId: undefined,
        battleLog: appendLog(view, [], get().battleLog),
      });
    } catch (error) {
      set({ isRefreshing: false, error: errorMessageOf(error) });
    }
  },

  selectCard(cardInstanceId) {
    const current = get().selectedCardId;
    set({ selectedCardId: current === cardInstanceId ? undefined : cardInstanceId });
  },

  clearGame() {
    const gameId = get().gameId;
    if (gameId) {
      // 尽力而为地销毁 session，失败不影响前端复位
      void apiDeleteGame(gameId).catch(() => undefined);
    }
    set({
      gameId: undefined,
      view: undefined,
      selectedCardId: undefined,
      animationQueue: [],
      battleLog: [],
      error: undefined,
      notice: undefined,
      isSubmitting: false,
      isRefreshing: false,
      lastActionId: undefined,
    });
  },

  dequeueEvent() {
    const rest = get().animationQueue.slice(1);
    set({ animationQueue: rest, isSubmitting: rest.length > 0 });
  },

  skipAnimations() {
    set({ animationQueue: [], isSubmitting: false });
  },

  clearError() {
    set({ error: undefined, notice: undefined });
  },
}));

/** 输入是否应被锁定（提交中 或 动画播放中） */
export function selectInputLocked(state: GameStore): boolean {
  return state.isSubmitting || state.animationQueue.length > 0;
}

export function selectIsGameOver(state: GameStore): boolean {
  return state.view?.status === 'ended' || state.view?.phase === 'ENDED';
}

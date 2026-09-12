/**
 * 内置 mock 后端（无后端也能把 6 个页面 + 一局完整流程走通）。
 *
 * 契约一致性：返回结构与 API_CONTRACT.md 的 GameView / legal_actions / events 完全一致，
 * 因此前端代码路径在 mock / 真后端之间**没有任何分支差异**（差异只在 src/api/game.ts 的转发）。
 *
 * 它不是规则引擎，而是**脚本化演示局**：
 *  - 决策点顺序、AI 行为、牌堆内容都由下面的脚本决定；
 *  - 但牌堆顶的抽取、观星结果、逆天改命排序、天劫回插后的顺序都是**真实作用于**这份牌堆的；
 *  - 覆盖 4 种特殊 Phase：COUNTER（反制）/ REORDER（逆天改命排序）/ REINSERT（天劫回插）/ ENDED。
 *
 * 演示动线（viewer 恒为 0）：
 *  T1 真人回合 → 任意出牌（观星/改命/遁术/摄物术）→ 结束行动并抽牌
 *    → AI 洗牌（known_top 清空）+ AI 摄物术指向真人 → **COUNTER 阶段**（CounterDialog）
 *  → 反制/不反制 → T2 .. T4 真人回合
 *    → 真人在第 4 次抽牌抽到【天劫】 → 有【护劫符】则化解 → **REINSERT 阶段**（ReinsertTribulationDialog）
 *    → 回插后继续 → 再结束一次行动 → 其余玩家陆续被淘汰 → **GAME_ENDED**（Result 页）
 *  任意时刻出【逆天改命】→ **REORDER 阶段**（ReorderTopDialog，拖拽排序 token）
 */

import { ApiError } from './client';
import type {
  CardId,
  CardInstance,
  CardSpec,
  KnownTopCard,
  PrivateCardToken,
} from '@/types/card';
import type { ReinsertRegion as EventRegion } from '@/types/event';
import type { GameEvent, GameEventType } from '@/types/event';
import type {
  ActionPayload,
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
  ReinsertRegion,
  SubmitActionRequest,
} from '@/types/game';
import { CARD_SPECS_FALLBACK, REGION_LABELS, cardNameOf } from '@/utils/card-catalog';

const MOCK_LATENCY_MS = 240;
const MOCK_VERSION = 'mock-0.1.0';
const MAX_ACTIONS_PER_TURN = 2;

const PLAYER_NAMES = ['青岚道友', '玄墨真人', '清月仙子', '玄机子', '赤霄君', '素心娘子'];
const DEFAULT_AGENT_TYPES = ['human', 'rule', 'ismcts', 'random', 'rule', 'random'];

const REGIONS: readonly ReinsertRegion[] = ['TOP', 'NEAR_TOP', 'MIDDLE', 'BOTTOM'];

/** 牌堆：前 4 张是「真人抽牌脚本」，其余为填充（AI 从牌堆底抽，互不干扰） */
const HUMAN_DRAW_SCRIPT: CardId[] = ['STARGAZING', 'DEFUSE', 'ESCAPE', 'TRIBULATION'];
const DECK_FILLER: CardId[] = [
  'COUNTER',
  'SHUFFLE',
  'STEAL',
  'REWRITE_FATE',
  'ESCAPE',
  'DEFUSE',
  'SHUFFLE',
  'COUNTER',
  'STEAL',
  'STARGAZING',
  'REWRITE_FATE',
  'ESCAPE',
  'SHUFFLE',
  'COUNTER',
  'STEAL',
  'DEFUSE',
];

/** 摄物术从各对手处夺得的牌（脚本化，保证可复现） */
const STEAL_POOLS: CardId[][] = [
  ['COUNTER'],
  ['DEFUSE'],
  ['SHUFFLE'],
  ['ESCAPE'],
];

type NodeId = 'action' | 'counter' | 'reorder' | 'reinsert' | 'ended';

type Draft = Omit<GameEvent, 'seq'>;

function ev(type: GameEventType, extra: Partial<GameEvent> = {}): Draft {
  return {
    type,
    actor: null,
    target: null,
    card_id: null,
    message: null,
    data: null,
    ...extra,
  };
}

function numbered(drafts: Draft[]): GameEvent[] {
  return drafts.map((draft, index) => ({ ...draft, seq: index + 1 }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPermutation(order: string[], tokens: string[]): boolean {
  if (order.length !== tokens.length) return false;
  const a = [...order].sort();
  const b = [...tokens].sort();
  return a.every((value, index) => value === b[index]);
}

function parseHandIndex(instanceId: string | null | undefined): number | null {
  if (!instanceId) return null;
  const match = /^h_(\d+)_(\d+)$/.exec(instanceId);
  if (!match) return null;
  return match[1] === '0' ? Number.parseInt(match[2], 10) : null;
}

/** 脚本化演示局 */
class MockSession {
  readonly gameId: string;
  readonly numPlayers: number;
  readonly agentSpecs: { type: string; simulations?: number; model?: string }[];

  revision = 1;
  node: NodeId = 'action';
  phase: Phase = 'ACTION';
  currentPlayer = 0;
  decisionPlayer = 0;
  round = 1;
  turnNo = 1;
  actionsUsed = 0;
  winner: number | null = null;

  hand: CardId[] = ['DEFUSE', 'STARGAZING', 'REWRITE_FATE', 'ESCAPE', 'STEAL', 'COUNTER'];
  knownTop: KnownTopCard[] = [];
  privateTokens: PrivateCardToken[] = [];
  deck: CardId[] = [...HUMAN_DRAW_SCRIPT, ...DECK_FILLER];
  discard: CardId[] = [];
  alive: boolean[] = [];
  aiHandCounts: number[] = [];

  private counterDemoUsed = false;
  private tribulationResolved = false;
  private pendingStealer: number | null = null;
  private stealPoolCursor = 0;

  constructor(gameId: string, numPlayers: number, agents: CreateGameRequest['agents']) {
    this.gameId = gameId;
    this.numPlayers = numPlayers;
    this.agentSpecs = Array.from({ length: numPlayers }, (_, i) => {
      const spec = agents?.[i];
      return spec ?? { type: i === 0 ? 'human' : DEFAULT_AGENT_TYPES[i] ?? 'rule' };
    });
    this.alive = Array.from({ length: numPlayers }, () => true);
    this.aiHandCounts = Array.from({ length: numPlayers }, (_, i) => (i === 0 ? 0 : 5));
  }

  // ---------------------------------------------------------------- 对外接口

  initialView(): GameView {
    return this.buildView(
      numbered([ev('GAME_STARTED', { data: { players: this.numPlayers } }), ev('TURN_STARTED', { actor: 0 })]),
    );
  }

  async submit(request: SubmitActionRequest): Promise<GameView> {
    await delay(MOCK_LATENCY_MS);

    if (typeof request.revision !== 'number' || request.revision !== this.revision) {
      throw new ApiError(
        409,
        'STALE_REVISION',
        `提交的 revision=${request.revision} 与当前 revision=${this.revision} 不一致。`,
        { expected_revision: this.revision },
      );
    }

    const action = this.legalActions().find((item) => item.id === request.action_id);
    if (!action) {
      throw new ApiError(409, 'INVALID_ACTION', `动作 ${request.action_id} 在当前局面非法。`, {
        revision: this.revision,
      });
    }

    const drafts = this.apply(action, request.payload ?? {});
    this.revision += 1;
    return this.buildView(numbered(drafts));
  }

  /** 仅用于演示 revision 冲突恢复：把 revision 向前推一格，下一次提交必然 409 */
  bumpRevisionForDemo(): number {
    this.revision += 1;
    return this.revision;
  }

  // ---------------------------------------------------------------- 视图构造

  buildView(events: GameEvent[]): GameView {
    return {
      game_id: this.gameId,
      status: this.node === 'ended' ? 'ended' : 'playing',
      revision: this.revision,
      viewer_player_id: 0,
      phase: this.phase,
      current_player: this.currentPlayer,
      decision_player: this.decisionPlayer,
      observation: this.buildObservation(),
      public: this.buildPublic(),
      legal_actions: this.legalActions(),
      events,
      winner: this.winner,
      forced_stop: false,
    };
  }

  private buildObservation(): Observation {
    const hand: CardInstance[] = this.hand.map((card, index) => ({
      instance_id: `h_0_${index}`,
      card_id: card,
      name: cardNameOf(card),
    }));
    return {
      hand,
      known_top: this.knownTop,
      actions_used: this.actionsUsed,
      max_actions_per_turn: MAX_ACTIONS_PER_TURN,
      private_context: this.node === 'reorder' && this.privateTokens.length > 0
        ? { cards: this.privateTokens }
        : null,
    };
  }

  private buildPublic(): PublicState {
    const players: PlayerPublicView[] = Array.from({ length: this.numPlayers }, (_, playerId) => {
      const spec = this.agentSpecs[playerId];
      return {
        player_id: playerId,
        name: PLAYER_NAMES[playerId] ?? `道友 ${playerId}`,
        alive: this.alive[playerId],
        hand_count: playerId === 0 ? this.hand.length : this.aiHandCounts[playerId],
        is_current: this.phase !== 'ENDED' && playerId === this.currentPlayer,
        is_decision_player: this.phase !== 'ENDED' && playerId === this.decisionPlayer,
        agent: { type: spec?.type ?? 'rule', simulations: spec?.simulations, model: spec?.model },
        avatar: null,
      };
    });

    return {
      round: this.round,
      deck_count: this.deck.length,
      discard_count: this.discard.length,
      players,
      last_discard: this.discard.length > 0 ? this.discard[this.discard.length - 1] : null,
      turn_no: this.turnNo,
    };
  }

  // ---------------------------------------------------------------- 合法动作

  legalActions(): LegalAction[] {
    if (this.node === 'ended') return [];
    // 非自己决策时，前端不应得到任何可点动作（真后端同样只给决策者的动作）
    if (this.decisionPlayer !== 0) return [];

    if (this.node === 'counter') {
      const actions: LegalAction[] = [];
      const counterIndex = this.hand.indexOf('COUNTER');
      if (counterIndex >= 0) {
        actions.push({
          id: 'a_mock_counter_use',
          type: 'COUNTER',
          label: '使用反制符',
          enabled: true,
          card_instance_id: `h_0_${counterIndex}`,
          params: null,
        });
      }
      actions.push({
        id: 'a_mock_counter_pass',
        type: 'PASS_COUNTER',
        label: counterIndex >= 0 ? '不反制，任其夺取' : '手中无反制符，只能承受',
        enabled: true,
        card_instance_id: null,
        params: null,
      });
      return actions;
    }

    if (this.node === 'reorder') {
      const tokens = this.privateTokens.map((token) => token.token);
      return [
        {
          id: 'a_mock_reorder_top',
          type: 'REORDER_TOP',
          label: '逆天改命：按你的顺序放回牌堆顶',
          enabled: true,
          card_instance_id: null,
          params: { order: { type: 'token_order', options: tokens } },
        },
      ];
    }

    if (this.node === 'reinsert') {
      return REGIONS.map((region) => ({
        id: `a_mock_reinsert_${region.toLowerCase()}`,
        type: 'REINSERT_TRIBULATION' as const,
        label: `回插：${REGION_LABELS[region]}`,
        enabled: true,
        card_instance_id: null,
        params: { region: { type: 'enum' as const, options: [region] } },
      }));
    }

    return this.handDerivedActions();
  }

  /**
   * ACTION 阶段的动作完全由「当前手牌」推导（mock 即规则权威）。
   * 注意：护劫符 / 反制符 / 天劫 不会出现在这里 —— 前端因此把它们渲染成不可用。
   */
  private handDerivedActions(): LegalAction[] {
    const actions: LegalAction[] = [];

    this.hand.forEach((card, index) => {
      const instanceId = `h_0_${index}`;
      switch (card) {
        case 'STARGAZING':
          actions.push({
            id: `a_mock_peek_${index}`,
            type: 'PLAY_CARD',
            label: '使用观星术',
            enabled: true,
            card_instance_id: instanceId,
            params: null,
          });
          break;
        case 'REWRITE_FATE':
          actions.push({
            id: `a_mock_reorder_fate_${index}`,
            type: 'PLAY_CARD',
            label: '使用逆天改命',
            enabled: true,
            card_instance_id: instanceId,
            params: null,
          });
          break;
        case 'ESCAPE':
          actions.push({
            id: `a_mock_escape_${index}`,
            type: 'PLAY_CARD',
            label: '使用遁术',
            enabled: true,
            card_instance_id: instanceId,
            params: null,
          });
          break;
        case 'STEAL': {
          const targets = this.otherPlayers().filter((player) => this.alive[player]);
          targets.forEach((target) => {
            actions.push({
              id: `a_mock_steal_${index}_${target}`,
              type: 'PLAY_CARD_TARGET',
              label: `使用摄物术 → ${this.playerName(target)}`,
              enabled: true,
              card_instance_id: instanceId,
              params: { target_player: { type: 'enum', options: [target] } },
            });
          });
          break;
        }
        default:
          break;
      }
    });

    actions.push({
      id: 'a_mock_end',
      type: 'END_ACTION',
      label: '结束行动并抽牌',
      enabled: true,
      card_instance_id: null,
      params: null,
    });

    return actions;
  }

  // ---------------------------------------------------------------- 动作派发

  private apply(action: LegalAction, payload: ActionPayload): Draft[] {
    switch (action.type) {
      case 'END_ACTION':
        return this.handleEndAction();
      case 'PLAY_CARD':
        return this.handlePlayCard(action);
      case 'PLAY_CARD_TARGET':
        return this.handlePlayCardTarget(action, payload);
      case 'COUNTER':
        return this.handleCounter(action);
      case 'PASS_COUNTER':
        return this.handlePassCounter();
      case 'REORDER_TOP':
        return this.handleReorderTop(action, payload);
      case 'REINSERT_TRIBULATION':
        return this.handleReinsert(action, payload);
      default:
        throw new ApiError(400, 'UNSUPPORTED_ACTION', `mock 未实现的动作类型：${action.type}`);
    }
  }

  private handleEndAction(): Draft[] {
    if (this.tribulationResolved) {
      return this.finale();
    }
    return this.endHumanTurn(true);
  }

  private handlePlayCard(action: LegalAction): Draft[] {
    const cardId = this.cardIdOf(action.card_instance_id);
    if (!cardId) {
      throw new ApiError(400, 'INVALID_PAYLOAD', 'card_instance_id 不在当前手牌中。');
    }
    const drafts: Draft[] = [ev('CARD_PLAYED', { actor: 0, card_id: cardId })];

    switch (cardId) {
      case 'STARGAZING': {
        this.consumeCard(action.card_instance_id);
        const revealed = this.deck.slice(0, 3);
        this.knownTop = revealed.map((card, position) => ({
          position,
          card_id: card,
          name: cardNameOf(card),
        }));
        drafts.push(ev('DECK_PEEKED', { actor: 0, data: { amount: revealed.length } }));
        break;
      }
      case 'REWRITE_FATE': {
        this.consumeCard(action.card_instance_id);
        const revealed = this.deck.slice(0, 3);
        this.privateTokens = revealed.map((card, index) => ({
          token: `private_${index + 1}`,
          card_id: card,
          name: cardNameOf(card),
        }));
        this.node = 'reorder';
        this.phase = 'REORDER';
        this.decisionPlayer = 0;
        this.currentPlayer = 0;
        break;
      }
      case 'ESCAPE': {
        this.consumeCard(action.card_instance_id);
        // 遁术：跳过本次抽牌直接结束行动
        return [...drafts, ...this.endHumanTurn(false, true)];
      }
      default:
        throw new ApiError(400, 'INVALID_ACTION', `mock 不支持打出 ${cardId}。`);
    }

    this.actionsUsed += 1;
    return drafts;
  }

  private handlePlayCardTarget(action: LegalAction, payload: ActionPayload): Draft[] {
    const cardId = this.cardIdOf(action.card_instance_id);
    if (cardId !== 'STEAL') {
      throw new ApiError(400, 'INVALID_ACTION', 'PLAY_CARD_TARGET 在 mock 中只支持摄物术。');
    }
    const options = action.params?.target_player?.options ?? [];
    const target = payload.target_player;
    if (typeof target !== 'number' || !options.includes(target) || !this.alive[target]) {
      throw new ApiError(400, 'INVALID_PAYLOAD', 'target_player 不在可选目标内。', { options });
    }

    this.consumeCard(action.card_instance_id);
    const drafts: Draft[] = [ev('CARD_PLAYED', { actor: 0, card_id: 'STEAL', target })];
    const stolen = this.stealFromAi(target);
    if (stolen) {
      this.hand.push(stolen);
      drafts.push(ev('CARD_STOLEN', { actor: 0, target, card_id: stolen }));
    }
    this.actionsUsed += 1;
    return drafts;
  }

  private handleCounter(action: LegalAction): Draft[] {
    const index = parseHandIndex(action.card_instance_id) ?? this.hand.indexOf('COUNTER');
    if (index < 0 || this.hand[index] !== 'COUNTER') {
      throw new ApiError(400, 'INVALID_PAYLOAD', '手中没有反制符。');
    }
    this.hand.splice(index, 1);
    this.discard.push('COUNTER');

    const drafts: Draft[] = [ev('COUNTER_USED', { actor: 0, target: this.pendingStealer })];
    return this.resolveCounterOutcome(drafts);
  }

  private handlePassCounter(): Draft[] {
    const drafts: Draft[] = [ev('COUNTER_PASSED', { actor: 0, target: this.pendingStealer })];
    const lost = this.stealFromHuman();
    if (lost) {
      drafts.push(ev('CARD_STOLEN', { actor: this.pendingStealer, target: 0, card_id: lost }));
    }
    return this.resolveCounterOutcome(drafts);
  }

  private handleReorderTop(action: LegalAction, payload: ActionPayload): Draft[] {
    const tokens = this.privateTokens.map((token) => token.token);
    const order = payload.order;

    if (!Array.isArray(order) || !order.every((item) => typeof item === 'string')) {
      throw new ApiError(400, 'INVALID_PAYLOAD', 'payload.order 必须是 token 字符串数组。');
    }
    if (!isPermutation(order as string[], tokens)) {
      throw new ApiError(400, 'INVALID_PAYLOAD', 'payload.order 必须是当前 token 的一个排列。', {
        expected_tokens: tokens,
      });
    }
    void action;

    const tokenToCard = new Map(this.privateTokens.map((token) => [token.token, token.card_id]));
    const reordered = (order as string[]).map((token) => tokenToCard.get(token) as CardId);
    this.deck = [...reordered, ...this.deck.slice(reordered.length)];
    this.knownTop = reordered.map((card, position) => ({
      position,
      card_id: card,
      name: cardNameOf(card),
    }));
    this.privateTokens = [];
    this.node = 'action';
    this.phase = 'ACTION';
    this.decisionPlayer = 0;

    return [ev('DECK_REORDERED', { actor: 0, data: { order: [...(order as string[])] } })];
  }

  private handleReinsert(action: LegalAction, payload: ActionPayload): Draft[] {
    const options = (action.params?.region?.options ?? []) as ReinsertRegion[];
    const region = (payload.region as ReinsertRegion | undefined) ?? options[0];
    if (!region || !options.includes(region)) {
      throw new ApiError(400, 'INVALID_PAYLOAD', 'region 不在合法区域内。', { options });
    }

    const position = { TOP: 0, NEAR_TOP: 1, MIDDLE: Math.floor(this.deck.length / 2), BOTTOM: this.deck.length }[
      region
    ];
    this.deck.splice(Math.min(position, this.deck.length), 0, 'TRIBULATION');

    this.node = 'action';
    this.phase = 'ACTION';
    this.decisionPlayer = 0;
    this.currentPlayer = 0;
    this.actionsUsed = 0;

    return [
      ev('TRIBULATION_REINSERTED', {
        actor: 0,
        card_id: 'TRIBULATION',
        data: { region: region as EventRegion, position },
      }),
      ev('TURN_STARTED', { actor: 0 }),
    ];
  }

  // ---------------------------------------------------------------- 回合推进

  private endHumanTurn(draw: boolean, skipped = false): Draft[] {
    const drafts: Draft[] = [];
    if (skipped) drafts.push(ev('TURN_SKIPPED', { actor: 0 }));
    drafts.push(ev('TURN_ENDED', { actor: 0 }));

    if (draw) {
      const drawn = this.drawFor(0);
      if (drawn) drafts.push(ev('CARD_DRAWN', { actor: 0, card_id: drawn }));
      if (drawn === 'TRIBULATION') {
        return [...drafts, ...this.resolveTribulation()];
      }
    }

    const others = this.otherPlayers().filter((player) => this.alive[player]);
    let stealer: number | null = null;

    others.forEach((player, position) => {
      if (stealer !== null) return;
      drafts.push(ev('TURN_STARTED', { actor: player }));

      // 第一个对手洗牌：演示 known_top 被清空（只打乱底部，保持演示牌序可控）
      if (this.turnNo === 1 && position === 0) {
        drafts.push(ev('CARD_PLAYED', { actor: player, card_id: 'SHUFFLE' }));
        drafts.push(ev('DECK_SHUFFLED', { actor: player }));
        this.shuffleBottomHalfForDemo();
      }

      // 最后一个对手用摄物术指向真人 → 触发反制决策（演示 CounterDialog）
      const isLast = position === others.length - 1;
      if (this.turnNo === 1 && !this.counterDemoUsed && isLast && this.hand.length > 0) {
        drafts.push(ev('CARD_PLAYED', { actor: player, card_id: 'STEAL', target: 0 }));
        drafts.push(ev('COUNTER_OPENED', { actor: player, target: 0, card_id: 'STEAL' }));
        this.counterDemoUsed = true;
        this.pendingStealer = player;
        this.node = 'counter';
        this.phase = 'COUNTER';
        this.decisionPlayer = 0;
        this.currentPlayer = player;
        stealer = player;
        return;
      }

      const aiDrawn = this.drawFor(player, true);
      if (aiDrawn) drafts.push(ev('CARD_DRAWN', { actor: player }));
      drafts.push(ev('TURN_ENDED', { actor: player }));
    });

    if (stealer !== null) return drafts;

    this.startHumanTurn();
    drafts.push(ev('TURN_STARTED', { actor: 0 }));
    return drafts;
  }

  private resolveCounterOutcome(drafts: Draft[]): Draft[] {
    if (this.pendingStealer !== null) {
      drafts.push(ev('TURN_ENDED', { actor: this.pendingStealer }));
    }
    this.pendingStealer = null;
    this.startHumanTurn();
    drafts.push(ev('TURN_STARTED', { actor: 0 }));
    return drafts;
  }

  private startHumanTurn(): void {
    this.turnNo += 1;
    this.round += 1;
    this.currentPlayer = 0;
    this.decisionPlayer = 0;
    this.phase = 'ACTION';
    this.node = 'action';
    this.actionsUsed = 0;
    this.privateTokens = [];
  }

  private resolveTribulation(): Draft[] {
    const drafts: Draft[] = [
      ev('TRIBULATION_DRAWN', { actor: 0, card_id: 'TRIBULATION', data: { reason: 'draw' } }),
    ];

    const defuseIndex = this.hand.indexOf('DEFUSE');
    if (defuseIndex >= 0) {
      this.hand.splice(defuseIndex, 1);
      this.discard.push('DEFUSE');
      drafts.push(
        ev('TRIBULATION_DEFUSED', {
          actor: 0,
          card_id: 'DEFUSE',
          data: { consumed_card: 'DEFUSE' },
        }),
      );
      this.tribulationResolved = true;
      this.node = 'reinsert';
      this.phase = 'REINSERT';
      this.decisionPlayer = 0;
      this.currentPlayer = 0;
      return drafts;
    }

    drafts.push(ev('PLAYER_ELIMINATED', { target: 0, data: { reason: 'no_defuse' } }));
    this.alive[0] = false;
    const survivor = this.otherPlayers().find((player) => this.alive[player]) ?? null;
    this.finishGame(survivor, drafts);
    return drafts;
  }

  /** 天劫化解并回插之后，再结束一次行动 → 其余玩家陆续淘汰 → 真人获胜 */
  private finale(): Draft[] {
    const drafts: Draft[] = [ev('TURN_ENDED', { actor: 0 })];

    this.otherPlayers().forEach((player) => {
      if (!this.alive[player]) return;
      drafts.push(ev('TURN_STARTED', { actor: player }));
      drafts.push(ev('CARD_DRAWN', { actor: player }));
      drafts.push(ev('TRIBULATION_DRAWN', { actor: player, card_id: 'TRIBULATION' }));
      this.alive[player] = false;
      drafts.push(ev('PLAYER_ELIMINATED', { target: player, data: { reason: 'no_defuse' } }));
      this.drawFor(player, true);
    });

    this.finishGame(0, drafts);
    return drafts;
  }

  private finishGame(winner: number | null, drafts: Draft[]): void {
    this.node = 'ended';
    this.phase = 'ENDED';
    this.winner = winner;
    this.decisionPlayer = -1;
    drafts.push(
      ev('GAME_ENDED', {
        data: { winner, reason: winner === null ? 'draw' : 'last_alive' },
      }),
    );
  }

  // ---------------------------------------------------------------- 状态工具

  private otherPlayers(): number[] {
    return Array.from({ length: this.numPlayers }, (_, player) => player).filter(
      (player) => player !== 0,
    );
  }

  private playerName(player: number): string {
    return PLAYER_NAMES[player] ?? `道友 ${player}`;
  }

  private cardIdOf(instanceId: string | null | undefined): CardId | null {
    const index = parseHandIndex(instanceId);
    if (index === null || index < 0 || index >= this.hand.length) return null;
    return this.hand[index];
  }

  private consumeCard(instanceId: string | null | undefined): CardId {
    const index = parseHandIndex(instanceId);
    if (index === null || index < 0 || index >= this.hand.length) {
      throw new ApiError(400, 'INVALID_PAYLOAD', '要打出的牌不在当前手牌中。');
    }
    const [card] = this.hand.splice(index, 1);
    this.discard.push(card);
    return card;
  }

  /** 真人抽牌：从牌堆顶取（脚本前 4 张即人类抽牌脚本） */
  private drawFor(player: number, quiet = false): CardId | null {
    if (this.deck.length === 0) {
      if (quiet) return null;
      this.deck = [...DECK_FILLER];
    }
    const card = player === 0 ? this.deck.shift() : this.deck.pop();
    return card ?? null;
  }

  private stealFromAi(target: number): CardId | null {
    if (this.aiHandCounts[target] <= 0) return null;
    this.aiHandCounts[target] -= 1;
    const pool = STEAL_POOLS[target % STEAL_POOLS.length] ?? ['ESCAPE'];
    const card = pool[this.stealPoolCursor % pool.length] ?? 'ESCAPE';
    this.stealPoolCursor += 1;
    return card;
  }

  private stealFromHuman(): CardId | null {
    if (this.hand.length === 0) return null;
    const index = this.hand.length - 1;
    const [card] = this.hand.splice(index, 1);
    this.discard.push(card);
    if (this.pendingStealer !== null && this.aiHandCounts[this.pendingStealer] !== undefined) {
      this.aiHandCounts[this.pendingStealer] += 1;
    }
    return card;
  }

  /** 演示用「洗牌」：只打乱牌堆下半部分，保证脚本化的真人抽牌序列仍然可复现 */
  private shuffleBottomHalfForDemo(): void {
    const pivot = Math.min(HUMAN_DRAW_SCRIPT.length, this.deck.length);
    const head = this.deck.slice(0, pivot);
    const tail = this.deck.slice(pivot).reverse();
    this.deck = [...head, ...tail];
    this.knownTop = [];
  }
}

// -------------------------------------------------------------------- 单例会话

let session: MockSession | null = null;
let sessionCreatedAt = 0;

function requireSession(gameId: string): MockSession {
  if (!session || session.gameId !== gameId) {
    throw new ApiError(404, 'GAME_NOT_FOUND', '对局不存在或已过期（mock 会话为单例，重新开始即可）。');
  }
  return session;
}

export function resetMockSession(): void {
  session = null;
  sessionCreatedAt = 0;
}

export const mockApi = {
  isActive(): boolean {
    return session !== null;
  },

  sessionCreatedAt(): number {
    return sessionCreatedAt;
  },

  /** 演示 revision 冲突恢复：人为把 revision 推一格，下一次提交会拿到 409 */
  simulateStaleRevision(): number | null {
    if (!session) return null;
    return session.bumpRevisionForDemo();
  },

  async fetchHealth(): Promise<HealthResponse> {
    await delay(80);
    return { status: 'ok', version: MOCK_VERSION };
  },

  async fetchCards(): Promise<CardSpec[]> {
    await delay(80);
    return CARD_SPECS_FALLBACK;
  },

  async fetchAgents(): Promise<
    { id: string; name: string; type: string; configurable?: boolean; defaults?: Record<string, number> }[]
  > {
    await delay(80);
    return [
      { id: 'random', name: 'Random', type: 'random', configurable: false },
      { id: 'rule', name: 'Rule', type: 'rule', configurable: false },
      {
        id: 'ismcts',
        name: 'ISMCTS',
        type: 'ismcts',
        configurable: true,
        defaults: { simulations: 500, exploration: 1.4 },
      },
      { id: 'mccfr_2p_100k', name: 'MCCFR 2P 100K', type: 'mccfr', configurable: false },
    ];
  },

  async createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
    await delay(MOCK_LATENCY_MS);
    if (request.players < 2 || request.players > 6) {
      throw new ApiError(400, 'INVALID_REQUEST', 'players 必须在 2..6 之间。');
    }
    if (request.human_player < 0 || request.human_player >= request.players) {
      throw new ApiError(400, 'INVALID_REQUEST', 'human_player 超出座位范围。');
    }
    if (request.agents?.[request.human_player] !== null) {
      throw new ApiError(400, 'INVALID_REQUEST', 'human_player 对应的 agents 位置必须为 null。');
    }

    session = new MockSession(`mock-${Date.now().toString(36)}`, request.players, request.agents);
    sessionCreatedAt = Date.now();

    return {
      game_id: session.gameId,
      player_id: 0,
      state: session.initialView(),
    };
  },

  async getGame(gameId: string): Promise<GameView> {
    await delay(120);
    const current = requireSession(gameId);
    return current.buildView([]);
  },

  async submitAction(gameId: string, request: SubmitActionRequest): Promise<GameView> {
    const current = requireSession(gameId);
    return current.submit(request);
  },

  async deleteGame(gameId: string): Promise<DeleteGameResponse> {
    await delay(80);
    if (session && session.gameId === gameId) {
      session = null;
    }
    return { ok: true };
  },
};

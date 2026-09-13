/**
 * 内置 mock 后端（无后端也能把 6 个页面 + 一局完整流程走通）。
 *
 * 契约一致性：返回结构与 API_CONTRACT.md 的 GameView / legal_actions / events 完全一致，
 * 因此前端代码路径在 mock / 真后端之间**没有任何分支差异**（差异只在 src/api/game.ts 的转发）。
 *
 * 事件形状同样以真后端为唯一权威（`backend/app/services/events.py:render_event()`）：
 * **每条事件只含 `seq / type / actor / data` 四键**，牌名 / 受害者 / 区域一律在 `data` 里
 * （详见下面的 ev()）。隐藏信息纪律也照抄后端：`CARD_STOLEN` 不给被偷的牌、
 * `CARD_DRAWN` 不给牌面、`DECK_REORDERED` 不给排序结果。
 *
 * 三条卡牌规则按用户裁决镜像真后端（`docs/INTERFACES.md` 附录 A13、`docs/CARD_RULES_DELTA.md`）：
 *  ① **观星术 = 查看 + 改序**：`CARD_PLAYED`(STARGAZING) → `DECK_PEEKED`（牌面私有）→
 *     打出后进入 `Phase.REORDER`（复用 `private_1..k` token）→ 提交 `REORDER_TOP` 后 `DECK_REORDERED`。
 *     与【逆天改命】是同一条决策（后者同样补发 `DECK_PEEKED`，见 `game/state.py:_step_action`）。
 *  ② **遁术 = 反制窗口的反应牌**：行动阶段不再出现；反制窗口与「不反制 / 使用反制符」并列，
 *     `legal_actions[].type === 'ESCAPE'`。效果 = 该法术完全无效 + 立即结束本次结算
 *     （施术者 `TURN_ENDED` 推进、**不抽牌**）→ 事件 `CARD_PLAYED`(ESCAPE) + `ESCAPE_DODGED`。
 *  ③ **反制符 = 反弹**：原目标反偷原施术者 1 张（`COUNTER_USED.data.redirected=true` / `stolen`；
 *     真偷到时补 `CARD_STOLEN`(`redirected=true`, `actor`=反弹方, `data.target`=原施术者)）。
 *  `TURN_SKIPPED`（旧「遁术跳过自己抽牌」）**保留枚举但不再产生**；新增 `ESCAPE_DODGED`。
 *  `legal_actions` 的 type / label / params 逐字对齐后端 `game/state.py:legal_action_dicts()`
 *  与 `game/actions.py:ACTION_LABELS`。
 *
 * 它不是规则引擎，而是**脚本化演示局**：
 *  - 决策点顺序、AI 行为、牌堆内容都由下面的脚本决定；
 *  - 但牌堆顶的抽取、观星结果、改序排序、天劫回插后的顺序都是**真实作用于**这份牌堆的；
 *  - 覆盖 4 种特殊 Phase：COUNTER（反制窗口）/ REORDER（查看 + 改序）/ REINSERT（天劫回插）/ ENDED。
 *
 * 演示动线（viewer 恒为 0）：
 *  T1 真人回合 → 出【观星术】/【逆天改命】（→ REORDER，拖拽排序 token）或【摄物术】→ 结束行动并抽牌
 *    → AI 洗牌（known_top 清空）+ 最后一个 AI 的摄物术指向真人 → **COUNTER 阶段**（CounterModal）
 *  → 反制窗口三选一：不反制 / 使用反制符（反弹）/ 使用遁术（避开并结束结算）
 *  → T2 真人回合 → 再遇一次反制窗口（同一局内「遁术避开」与「反制符反弹」两条路线都能稳定演示）
 *  → T2 .. T4 真人回合 → 第 4 次抽牌抽到【天劫】 → 有【护劫符】则化解 → **REINSERT 阶段**
 *  → 回插后继续 → 再结束一次行动 → 其余玩家陆续被淘汰 → **GAME_ENDED**（Result 页）
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
import type { GameEvent, GameEventData, GameEventType } from '@/types/event';
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
import { CARD_SPECS_FALLBACK, cardNameOf } from '@/utils/card-catalog';

const MOCK_LATENCY_MS = 240;
const MOCK_VERSION = 'mock-0.1.0';
const MAX_ACTIONS_PER_TURN = 2;

/**
 * 会开出反制窗口的真人回合（T1 / T2）。
 * 两个窗口是为了让脚本局一局之内就能稳定演示反制窗口的全部三条路线
 * （不反制 / 反制符反弹 / 遁术避开）——单一窗口时选了遁术就看不到反弹。
 */
const COUNTER_WINDOW_TURNS: readonly number[] = [1, 2];

const PLAYER_NAMES = ['青岚道友', '玄墨真人', '清月仙子', '玄机子', '赤霄君', '素心娘子'];
const DEFAULT_AGENT_TYPES = ['human', 'rule', 'ismcts', 'random', 'rule', 'random'];

const REGIONS: readonly ReinsertRegion[] = ['TOP', 'NEAR_TOP', 'MIDDLE', 'BOTTOM'];

/**
 * 反制窗口的中文 label —— 逐字镜像真后端 `backend/game/actions.py:ACTION_LABELS`
 * （`ActionKind.PASS_COUNTER` / `PLAY_COUNTER` / `PLAY_SKIP`，INTERFACES A13）。
 * 前端 CounterModal 直接渲染 `legal_actions[].label`。
 */
const COUNTER_LABELS = {
  pass: '不反制',
  counter: '使用反制符',
  escape: '使用遁术（避开并结束结算）',
} as const;

/** 天劫回插区域 label —— 逐字镜像真后端 `game/actions.py:REINSERT_REGION_LABELS`。 */
const REINSERT_LABELS: Record<ReinsertRegion, string> = {
  TOP: '牌堆顶',
  NEAR_TOP: '靠近顶部',
  MIDDLE: '牌堆中部',
  BOTTOM: '牌堆底部',
};

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

/**
 * 构造一条事件草稿：**只含 `type / actor / data` 三键**（`seq` 由 numbered() 补）。
 * 形状以真后端的 `backend/app/services/events.py:render_event()` 为准 ——
 * 牌名 / 受害者 / 区域等细节一律放进 `data`，绝不写在顶层
 * （顶层 `target`/`card_id`/`message` 在真后端恒为 undefined，曾导致日志出现「未知牌」）。
 */
function ev(type: GameEventType, actor: number | null, data: GameEventData = {}): Draft {
  return { type, actor, data };
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

  /** 已经开过反制窗口的真人回合号（见 COUNTER_WINDOW_TURNS） */
  private openedCounterWindows: number[] = [];
  private tribulationResolved = false;
  /** 反制窗口里的施术者（对应真后端 `state.pending_actor`） */
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
      numbered([
        ev('GAME_STARTED', null, { players: this.numPlayers }),
        ev('TURN_STARTED', 0, { turn_no: this.turnNo }),
      ]),
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
      // 真后端只在 REORDER 决策点下发 private_context；观星术与逆天改命共用（INTERFACES A13 ①）
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

    if (this.node === 'counter') return this.counterWindowActions();

    if (this.node === 'reorder') {
      const tokens = this.privateTokens.map((token) => token.token);
      return [
        {
          id: 'a_mock_reorder_top',
          type: 'REORDER_TOP',
          // 逐字镜像后端 ACTION_LABELS[REORDER_TOP]：观星术与逆天改命共用同一条动作，故 label 不含牌名
          label: '调整顶部牌序',
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
        label: `回插：${REINSERT_LABELS[region]}`,
        enabled: true,
        card_instance_id: null,
        params: { region: { type: 'enum' as const, options: [region] } },
      }));
    }

    return this.handDerivedActions();
  }

  /**
   * 反制窗口的合法动作 —— 镜像真后端 `game/state.py:legal_actions()` 的 `Phase.COUNTER` 分支
   * （顺序与 label 逐字一致，INTERFACES A13 / docs/CARD_RULES_DELTA.md §2.2）：
   *   1) `PASS_COUNTER` 不反制（恒有）       → `COUNTER_PASSED` + 施术者得手（`CARD_STOLEN` 形状不变）
   *   2) `COUNTER`      使用反制符（有则给） → 反弹：`COUNTER_USED.redirected=true`(+ 真偷到时 `CARD_STOLEN.redirected`)
   *   3) `ESCAPE`       使用遁术（有则给）   → `ESCAPE_DODGED`：法术完全无效 + 施术者回合立即结束（不抽牌）
   * 注意：遁术**只在这里**出现，行动阶段不再给（旧规则是 `PLAY_CARD`）。
   */
  private counterWindowActions(): LegalAction[] {
    const actions: LegalAction[] = [
      {
        id: 'a_mock_counter_pass',
        type: 'PASS_COUNTER',
        label: COUNTER_LABELS.pass,
        enabled: true,
        card_instance_id: null,
        params: null,
      },
    ];

    const counterIndex = this.hand.indexOf('COUNTER');
    if (counterIndex >= 0) {
      actions.push({
        id: 'a_mock_counter_use',
        type: 'COUNTER',
        label: COUNTER_LABELS.counter,
        enabled: true,
        card_instance_id: `h_0_${counterIndex}`,
        params: null,
      });
    }

    const escapeIndex = this.hand.indexOf('ESCAPE');
    if (escapeIndex >= 0) {
      actions.push({
        id: 'a_mock_counter_escape',
        type: 'ESCAPE',
        label: COUNTER_LABELS.escape,
        enabled: true,
        card_instance_id: `h_0_${escapeIndex}`,
        params: null,
      });
    }

    return actions;
  }

  /**
   * ACTION 阶段的动作完全由「当前手牌」推导（mock 即规则权威）。
   * 注意：护劫符 / 反制符 / 天劫 / **遁术** 不会出现在这里 —— 前端因此把它们渲染成不可用。
   * 遁术从行动阶段牌改成反制窗口的反应牌（INTERFACES A13 ②），见 `game/state.py:304` 的同款注释。
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
        case 'STEAL': {
          // 真后端只在目标**手里有牌**时给摄物术（`state.py:legal_actions()`）
          const targets = this.otherPlayers().filter(
            (player) => this.alive[player] && this.aiHandCounts[player] > 0,
          );
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
      case 'ESCAPE':
        return this.handleEscape(action);
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
    return this.endHumanTurn();
  }

  private handlePlayCard(action: LegalAction): Draft[] {
    const cardId = this.cardIdOf(action.card_instance_id);
    if (!cardId) {
      throw new ApiError(400, 'INVALID_PAYLOAD', 'card_instance_id 不在当前手牌中。');
    }
    const drafts: Draft[] = [
      ev('CARD_PLAYED', 0, { card_id: cardId, name: cardNameOf(cardId) }),
    ];

    switch (cardId) {
      case 'STARGAZING':
      case 'REWRITE_FATE': {
        // 新规则（INTERFACES A13 ①）：观星术 = 查看 + 改序，与逆天改命共用同一条 REORDER 决策。
        this.consumeCard(action.card_instance_id);
        this.beginReorder();
        this.actionsUsed += 1;
        // 公开事件只报张数；牌面是私有信息 —— viewer（0）就是看牌的人本人，
        // 真后端 render_event 只在 private_for === viewer 时把 private_data.cards[] 合并进来
        // （`app/services/events.py:120-140`）。
        drafts.push(
          ev('DECK_PEEKED', 0, {
            count: this.privateTokens.length,
            cards: this.privateTokens,
          }),
        );
        return drafts;
      }
      case 'ESCAPE':
        // 遁术已改为反制窗口的反应牌，行动阶段打出一律非法
        // （真后端 `game/state.py:372-374` 直接 RuntimeError）。
        throw new ApiError(
          409,
          'INVALID_ACTION',
          '【遁术】只能在反制窗口作为反应牌使用（反制窗口的 legal_actions 里 type="ESCAPE"）。',
        );
      default:
        throw new ApiError(400, 'INVALID_ACTION', `mock 不支持打出 ${cardId}。`);
    }
  }

  /**
   * 观星术 / 逆天改命 共用的「查看 + 改序」入口：揭示牌堆顶 ≤3 张并进入 REORDER 决策。
   * 私有 token 固定为 `private_1..private_k`（真后端 `state.reorder_tokens()`，绝不暴露真实 deck index）。
   */
  private beginReorder(): void {
    const revealed = this.deck.slice(0, Math.min(3, this.deck.length));
    this.knownTop = this.knownTopOf(revealed);
    this.privateTokens = revealed.map((card, index) => ({
      token: `private_${index + 1}`,
      card_id: card,
      name: cardNameOf(card),
    }));
    this.node = 'reorder';
    this.phase = 'REORDER';
    this.decisionPlayer = 0;
    this.currentPlayer = 0;
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
    const drafts: Draft[] = [
      ev('CARD_PLAYED', 0, { card_id: 'STEAL', name: cardNameOf('STEAL') }),
    ];
    const stolen = this.stealFromAi(target);
    if (stolen) {
      this.hand.push(stolen);
      // 谁被偷是公开的、偷到什么是私有的 —— 事件里绝不带牌面（真后端同款纪律）
      drafts.push(ev('CARD_STOLEN', 0, { target }));
    }
    this.actionsUsed += 1;
    return drafts;
  }

  /**
   * 反制符 = **反弹**（INTERFACES A13 ③ / API_CONTRACT §13）：
   * `CARD_PLAYED`(COUNTER) → `COUNTER_USED`(`redirected=true`, `stolen=bool`)
   * →〔真偷到牌时〕`CARD_STOLEN`(`actor`=反弹方即真人 0，`data.target`=被反偷的原施术者，
   * `data.redirected=true`，**不回传牌面**)。
   */
  private handleCounter(action: LegalAction): Draft[] {
    const caster = this.requireCaster();
    const index = parseHandIndex(action.card_instance_id) ?? this.hand.indexOf('COUNTER');
    if (index < 0 || index >= this.hand.length || this.hand[index] !== 'COUNTER') {
      throw new ApiError(400, 'INVALID_PAYLOAD', '手中没有反制符。');
    }
    this.hand.splice(index, 1);
    this.discard.push('COUNTER');

    const drafts: Draft[] = [
      ev('CARD_PLAYED', 0, { card_id: 'COUNTER', name: cardNameOf('COUNTER') }),
    ];
    // stolen = 反弹方（真人）手牌是否真的 +1（真后端：`before.hand_sizes[caster] > len(state.hands[caster])`）
    const stolen = this.stealFromAi(caster);
    if (stolen) this.hand.push(stolen);
    drafts.push(ev('COUNTER_USED', 0, { redirected: true, stolen: stolen !== null }));
    if (stolen) {
      drafts.push(ev('CARD_STOLEN', 0, { target: caster, redirected: true }));
    }
    return this.resolveCounterWindow(drafts, true);
  }

  /**
   * 遁术（反制窗口的反应牌，INTERFACES A13 ②）：
   * 法术完全无效 + 立即结束本次结算 —— 事件 = `CARD_PLAYED`(ESCAPE) → `ESCAPE_DODGED`
   * （`actor`=遁术者，`data.target`=施术者，`data.card_id`/`name`=被避开的法术）
   * → `TURN_ENDED`(`actor`=施术者) → 下一家 `TURN_STARTED`。
   * **不再发 `TURN_SKIPPED`**（旧「遁术跳过自己抽牌」的遗留事件，A13 起不再产生）。
   */
  private handleEscape(action: LegalAction): Draft[] {
    const caster = this.requireCaster();
    const index = parseHandIndex(action.card_instance_id) ?? this.hand.indexOf('ESCAPE');
    if (index < 0 || index >= this.hand.length || this.hand[index] !== 'ESCAPE') {
      throw new ApiError(400, 'INVALID_PAYLOAD', '手中没有遁术。');
    }
    this.hand.splice(index, 1);
    this.discard.push('ESCAPE');

    return this.resolveCounterWindow(
      [
        ev('CARD_PLAYED', 0, { card_id: 'ESCAPE', name: cardNameOf('ESCAPE') }),
        ev('ESCAPE_DODGED', 0, {
          target: caster,
          card_id: 'STEAL',
          name: cardNameOf('STEAL'),
        }),
      ],
      false,
    );
  }

  private handlePassCounter(): Draft[] {
    const caster = this.requireCaster();
    const drafts: Draft[] = [ev('COUNTER_PASSED', 0)];
    const lost = this.stealFromHuman();
    if (lost) {
      // actor = 偷的人，被偷的人放 data.target；被偷的牌面不下发
      // 形状与旧规则一致（**无 redirected 键**，测试会卡这一点）
      drafts.push(ev('CARD_STOLEN', caster, { target: 0 }));
    }
    return this.resolveCounterWindow(drafts, true);
  }

  /**
   * 反制窗口结算（三条路线共用）：
   *  - `casterKeepsTurn = true`（不反制 / 反制符）：法术照常落地，**施术者的回合继续**
   *    （真后端 `_step_counter` 把 `current_player` 设回施术者、`phase=ACTION`），
   *    mock 的脚本就是在这时补完这位 AI 被中断的「抽牌 + 结束回合」；
   *  - `casterKeepsTurn = false`（遁术）：法术完全无效 + 立即结束本次结算 → 施术者**不抽牌**，
   *    回合直接结束（真后端 `_advance_turn_from`）。
   * 两种情况下都接着把回合交给真人（脚本化：mock 只支持真人做决策）。
   */
  private resolveCounterWindow(drafts: Draft[], casterKeepsTurn: boolean): Draft[] {
    if (casterKeepsTurn && this.pendingStealer !== null) {
      const drawn = this.drawFor(this.pendingStealer, true);
      if (drawn) {
        drafts.push(
          ev('CARD_DRAWN', this.pendingStealer, {
            hand_count: this.aiHandCounts[this.pendingStealer],
          }),
        );
      }
    }
    if (this.pendingStealer !== null) {
      drafts.push(ev('TURN_ENDED', this.pendingStealer));
    }
    this.pendingStealer = null;
    this.startHumanTurn();
    drafts.push(ev('TURN_STARTED', 0, { turn_no: this.turnNo }));
    return drafts;
  }

  /** 反制窗口里的施术者（真后端 `state.pending_actor`） */
  private requireCaster(): number {
    if (this.pendingStealer === null) {
      throw new ApiError(409, 'INVALID_ACTION', '当前不在反制窗口，没有待结算的法术。');
    }
    return this.pendingStealer;
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
    // 排序者本人知道新的牌顶（真后端 `_step_reorder`：`known_top[owner] = deck[:k]`）
    this.knownTop = this.knownTopOf(reordered);
    this.privateTokens = [];
    this.node = 'action';
    this.phase = 'ACTION';
    this.decisionPlayer = 0;

    // 排序结果不回传（真后端 DECK_REORDERED 的 data 为空对象）
    return [ev('DECK_REORDERED', 0)];
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
      ev('TRIBULATION_REINSERTED', 0, { region: region as EventRegion }),
      // 回插提交后回合才真正推进 —— 真后端在这里发 TURN_ENDED（实测 seq 23/24）：
      // TRIBULATION_REINSERTED → TURN_ENDED(本人) → TURN_STARTED(下一位)
      ev('TURN_ENDED', 0),
      ev('TURN_STARTED', 0, { turn_no: this.turnNo }),
    ];
  }

  // ---------------------------------------------------------------- 回合推进

  /** 真人结束行动：**总是抽牌**（旧规则里「遁术跳过抽牌」的分支已随 A13 删除） */
  private endHumanTurn(): Draft[] {
    const drafts: Draft[] = [];

    const drawn = this.drawFor(0);
    if (drawn === 'TRIBULATION') {
      // ⚠️ 事件顺序与形状必须与真后端逐条一致（实测 seq 20/21/22）：
      //    TRIBULATION_DRAWN → TRIBULATION_DEFUSED | PLAYER_ELIMINATED
      //    且抽到天劫时**不发 CARD_DRAWN**（后端用 TRIBULATION_DRAWN 代替它）。
      //    此处也**不发 TURN_ENDED**：真后端在化解这一步 `turn_no` 未变、`current_player` 仍是本人
      //    （phase=REINSERT_TRIBULATION），回合真正推进发生在提交回插位置之后，由 handleReinsert 补发。
      drafts.push(...this.resolveTribulation());
      return drafts;
    }
    if (drawn) {
      // 抽牌事件只报手牌数，牌面仅本人可见（真后端 CARD_DRAWN = { hand_count }）
      drafts.push(ev('CARD_DRAWN', 0, { hand_count: this.hand.length }));
    }
    // ⚠️ 真后端顺序是 CARD_DRAWN → TURN_ENDED（实测 seq 9/10）。反过来写会让战斗日志与
    //    事件动画的顺序在「mock 演示」与「真后端」之间漂移，属于最容易被忽略的那类不一致。
    drafts.push(ev('TURN_ENDED', 0));

    const others = this.otherPlayers().filter((player) => this.alive[player]);
    let stealer: number | null = null;

    others.forEach((player, position) => {
      if (stealer !== null) return;
      drafts.push(ev('TURN_STARTED', player, { turn_no: this.turnNo }));

      // 第一个对手洗牌：演示 known_top 被清空（只打乱底部，保持演示牌序可控）
      if (this.turnNo === 1 && position === 0) {
        drafts.push(
          ev('CARD_PLAYED', player, { card_id: 'SHUFFLE', name: cardNameOf('SHUFFLE') }),
        );
        drafts.push(ev('DECK_SHUFFLED', player));
        this.shuffleBottomHalfForDemo();
      }

      // 最后一个对手用摄物术指向真人 → 触发反制窗口（CounterModal 的三条路线）
      const isLast = position === others.length - 1;
      const windowOpen =
        COUNTER_WINDOW_TURNS.includes(this.turnNo) &&
        !this.openedCounterWindows.includes(this.turnNo) &&
        isLast &&
        this.hand.length > 0;
      if (windowOpen) {
        drafts.push(
          ev('CARD_PLAYED', player, { card_id: 'STEAL', name: cardNameOf('STEAL') }),
        );
        // actor = 偷的人；data.target = 需要决定是否反制的那位（被偷的人）
        drafts.push(ev('COUNTER_OPENED', player, { target: 0 }));
        this.openedCounterWindows.push(this.turnNo);
        this.pendingStealer = player;
        this.node = 'counter';
        this.phase = 'COUNTER';
        this.decisionPlayer = 0;
        this.currentPlayer = player;
        stealer = player;
        return;
      }

      const aiDrawn = this.drawFor(player, true);
      if (aiDrawn) drafts.push(ev('CARD_DRAWN', player, { hand_count: this.aiHandCounts[player] }));
      drafts.push(ev('TURN_ENDED', player));
    });

    if (stealer !== null) return drafts;

    this.startHumanTurn();
    drafts.push(ev('TURN_STARTED', 0, { turn_no: this.turnNo }));
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
    // 天劫降临时不公开牌面来源，data 为空（真后端 TRIBULATION_DRAWN = {}）
    const drafts: Draft[] = [ev('TRIBULATION_DRAWN', 0)];

    const defuseIndex = this.hand.indexOf('DEFUSE');
    if (defuseIndex >= 0) {
      this.hand.splice(defuseIndex, 1);
      this.discard.push('DEFUSE');
      drafts.push(ev('TRIBULATION_DEFUSED', 0, { consumed_card: 'DEFUSE' }));
      this.tribulationResolved = true;
      this.node = 'reinsert';
      this.phase = 'REINSERT';
      this.decisionPlayer = 0;
      this.currentPlayer = 0;
      return drafts;
    }

    // 被淘汰的座位放在 actor（真后端把座位作为 actor，data 为空）
    drafts.push(ev('PLAYER_ELIMINATED', 0));
    this.alive[0] = false;
    const survivor = this.otherPlayers().find((player) => this.alive[player]) ?? null;
    this.finishGame(survivor, drafts);
    return drafts;
  }

  /** 天劫化解并回插之后，再结束一次行动 → 其余玩家陆续淘汰 → 真人获胜 */
  private finale(): Draft[] {
    const drafts: Draft[] = [ev('TURN_ENDED', 0)];

    this.otherPlayers().forEach((player) => {
      if (!this.alive[player]) return;
      drafts.push(ev('TURN_STARTED', player, { turn_no: this.turnNo }));
      drafts.push(ev('CARD_DRAWN', player, { hand_count: this.aiHandCounts[player] }));
      drafts.push(ev('TRIBULATION_DRAWN', player));
      this.alive[player] = false;
      // 被淘汰者就在 actor 里
      drafts.push(ev('PLAYER_ELIMINATED', player));
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
    drafts.push(ev('GAME_ENDED', null, { winner, forced_stop: false }));
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

  /** 牌顶知识 → `observation.known_top`（`position` = 牌顶位置序号，不是 deck index） */
  private knownTopOf(cards: CardId[]): KnownTopCard[] {
    return cards.map((card, position) => ({
      position,
      card_id: card,
      name: cardNameOf(card),
    }));
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

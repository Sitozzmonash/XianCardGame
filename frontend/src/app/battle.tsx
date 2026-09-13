/**
 * 对局页 —— 参考原型 `docs/reference-next/components/screens/BattleScreen.tsx` 的 RN 1:1 移植 + 真后端接线。
 *
 * ── 版面逐行对应（参考行号 → 本文件）────────────────────────────────────────
 *   27      整体骨架                      → `ScreenShell variant="plain"`（`GameBackdrop variant="plain"` + 安全区）
 *   30-37   轮次胶囊 pt-5                → `<RoundBanner/>`（`screens/battle/RoundBanner.tsx`）
 *   39-53   对手横滑卡（104 宽）           → `<OpponentRail/>`
 *   55-70   战场区（法阵 360 / 左上牌堆 / 右上弃牌堆 / 中央阶段文案）→ `<Battlefield/>`
 *   72-82   自己状态条（mx-4）             → `<SelfStatusBar/>`
 *   84-95   手牌横滑（GameCard size="sm" + 序号）→ `<HandRail/>`
 *   97-109  底部两列（认输 / 金色「结束回合」）→ `<BattleActionBar/>`
 * 弹窗：四个卡牌交互弹窗在 `src/components/ref/modals/*`（每个文件头写了它与参考哪几行对应）。
 *
 * ── 数据映射（全部来自后端 GameView，铁律见 skills/xiuxian-card-platform）──
 *   第 N 轮        ← `public.round`
 *   对手手牌 N 张  ← `public.players[].hand_count`（**只给张数**，铁律 3）
 *   牌堆 / 弃牌堆  ← `public.deck_count` / `public.discard_count` / `public.last_discard`
 *   我（名字）     ← `public.players[viewer_player_id].name`
 *   手牌 N 张      ← `observation.hand.length`
 *   观星结果       ← `observation.known_top`（**只有本人视图有**，铁律 4）
 *
 * ── 四个卡牌交互弹窗的触发（每张牌各不相同，全部由 legal_actions 派生）─────
 *   摄物术 `STEAL`       手牌点「使用卡牌」→ 打开 `TargetSelectModal`（候选来自
 *                        `PLAY_CARD_TARGET` 动作的 `params.target_player.options`）
 *   反制符 `COUNTER`     反制窗口：`legal_actions` 里出现 `COUNTER`/`PASS_COUNTER`（+ 反应牌 `ESCAPE` 遁术）
 *                        → `CounterModal`
 *   逆天改命 / 观星术     打出后引擎进入 REORDER 决策：`legal_actions` 里有 `REORDER_TOP`
 *                        → `RewriteFateModal`（牌面来自 `observation.private_context.cards` 的 token）
 *   护劫符 `DEFUSE`      抽到天劫被挡下后进入 REINSERT：`legal_actions` 里有 `REINSERT_TRIBULATION`
 *                        → `TribulationReinsertModal`
 *   扰乱天机 / 遁术       无弹窗：确认即结算（扰乱天机在行动阶段直接生效；遁术只能在反制窗口作为反应牌）
 *   无对应动作的手牌      一律 `disabled`（如规则里自动生效的护劫符）—— 铁律 1
 *
 * ⚠️ 为什么弹窗触发**不只**看 `view.phase`：后端下发的 REORDER 阶段值是 `"REORDER_TOP"`
 * （`game/state.py: PHASE_API_NAME`、`docs/API_CONTRACT.md` §12.4），而前端 `types/game.ts` 的
 * `Phase` 只列了 `'REORDER'`，`normalizePhase()` 会把白名单外的值**静默回落成 `'ACTION'`**。
 * 只看 phase 会让排序弹窗在真后端下永不出现；因此这里以 legal_actions 为准（也正好是铁律 1 的要求），
 * phase 仅作佐证（见 `screens/battle/phaseText.ts`）。此契约不一致已单独汇报。
 */

import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getGame } from '@/api/game';
import {
  BattleActionBar,
  Battlefield,
  EventTicker,
  HandRail,
  NoticeBanner,
  OpponentRail,
  RoundBanner,
  SelfStatusBar,
  effectivePhaseOf,
  phaseHintOf,
  phaseLabelOf,
  type HandItem,
} from '@/components/ref/screens/battle';
import {
  BattleLogModal,
  CardActionModal,
  CounterModal,
  RewriteFateModal,
  SurrenderModal,
  TargetSelectModal,
  TribulationReinsertModal,
  cardNameOf,
  cardSubtitleOf,
  type RewriteRow,
  type TargetCandidate,
} from '@/components/ref/modals';
import { ScreenShell } from '@/components/ref/ScreenShell';
import { SecondaryButton } from '@/components/ref/primitives';
import { cream, creamDim } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';
import { selectInputLocked, useGameStore } from '@/store/game-store';
import { CATEGORY_LABELS, cardSpecOf } from '@/utils/card-catalog';
import {
  actionsForCard,
  counterActions,
  directActionForCard,
  isHumanDeciding,
  nonCardActions,
  playerNameOf,
  reinsertActionForRegion,
  reinsertActions,
  reorderAction,
  targetActionFor,
  targetActionsForCard,
  targetOptions,
} from '@/utils/legal-actions';
import type { LegalAction, ReinsertRegion } from '@/types/game';

/**
 * 动作 type 的字符串读取。后端可能新增 type（例如反制窗口的反应牌 `ESCAPE` 遁术），
 * 冻结的 `types/game.ts` 里的 `ActionType` 联合还没收录它 —— 直接比较会编译不过，
 * 这里统一按字符串比（不臆造动作，只是读取后端给的值）。
 */
function actionType(action: LegalAction | undefined): string {
  return action ? String(action.type) : '';
}

export default function BattleScreen() {
  const params = useLocalSearchParams<{ gameId?: string }>();

  const view = useGameStore((state) => state.view);
  const gameId = useGameStore((state) => state.gameId);
  const selectedCardId = useGameStore((state) => state.selectedCardId);
  const animationQueue = useGameStore((state) => state.animationQueue);
  const battleLog = useGameStore((state) => state.battleLog);
  const error = useGameStore((state) => state.error);
  const notice = useGameStore((state) => state.notice);
  const isRefreshing = useGameStore((state) => state.isRefreshing);
  const locked = useGameStore(selectInputLocked);
  const submitAction = useGameStore((state) => state.submitAction);
  const refreshGame = useGameStore((state) => state.refreshGame);
  const selectCard = useGameStore((state) => state.selectCard);
  const clearGame = useGameStore((state) => state.clearGame);
  const clearError = useGameStore((state) => state.clearError);

  const [recovering, setRecovering] = useState(false);
  const [surrenderOpen, setSurrenderOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  /** 「使用卡牌」确认层（参考原型是详情屏的底部两个按钮） */
  const [useOpen, setUseOpen] = useState(false);
  /** 摄物术选目标（参考 `TargetSelectModal`） */
  const [targetOpen, setTargetOpen] = useState(false);
  /** 被暂时关掉的强制决策弹窗（`phase#revision`），有点「继续决策」的回入口 */
  const [dismissed, setDismissed] = useState<string | null>(null);

  const isMyDecision = isHumanDeciding(view);
  const revisionKey = view ? `${view.game_id}#${view.revision}` : 'none';

  // ── 生命周期 ───────────────────────────────────────────────────────────
  // 深链 / reload 恢复：GET /games/{id}（API_CONTRACT §15）
  useEffect(() => {
    const fromUrl = params.gameId;
    if (!fromUrl || fromUrl === useGameStore.getState().gameId) return;
    let mounted = true;
    setRecovering(true);
    getGame(fromUrl)
      .then((recovered) => {
        if (!mounted) return;
        useGameStore.setState({
          gameId: recovered.game_id,
          view: recovered,
          animationQueue: [],
          isSubmitting: false,
          error: undefined,
        });
      })
      .catch(() => {
        if (mounted) router.replace('/');
      })
      .finally(() => {
        if (mounted) setRecovering(false);
      });
    return () => {
      mounted = false;
    };
  }, [params.gameId]);

  // 没有对局 → 回首页
  useEffect(() => {
    if (!gameId && !view && !params.gameId) router.replace('/');
  }, [gameId, view, params.gameId]);

  // 终局 → 结算页（等事件队列播完再跳，别把动画吞掉）
  useEffect(() => {
    if (!view) return;
    const ended = view.status === 'ended' || view.phase === 'ENDED';
    if (ended && animationQueue.length === 0 && !locked) router.replace('/result');
  }, [view, animationQueue.length, locked]);

  // revision 一变，手牌实例 id（位置性 `h_<player>_<index>`）整套都会重编号：
  // 所有按 instance_id 缓存的 UI 状态必须失效（选中的牌、待选目标、被关掉的弹窗）。
  useEffect(() => {
    setUseOpen(false);
    setTargetOpen(false);
    setDismissed(null);
    selectCard(undefined);
  }, [revisionKey, selectCard]);

  // ── 派生数据 ───────────────────────────────────────────────────────────
  const opponents = useMemo(
    () => (view?.public.players ?? []).filter((player) => player.player_id !== view?.viewer_player_id),
    [view],
  );
  const me = useMemo(
    () => view?.public.players.find((player) => player.player_id === view?.viewer_player_id),
    [view],
  );

  const handItems: HandItem[] = useMemo(
    () =>
      (view?.observation.hand ?? []).map((card) => ({
        instance_id: card.instance_id,
        card_id: card.card_id,
        name: card.name,
        playable: actionsForCard(view, card.instance_id).length > 0,
        needsTarget: targetActionsForCard(view, card.instance_id).length > 0,
      })),
    [view],
  );

  const endAction = useMemo(
    () => nonCardActions(view).find((action) => actionType(action) === 'END_ACTION'),
    [view],
  );

  // 四个弹窗的动作来源
  const counter = useMemo(() => counterActions(view), [view]);
  const reorder = useMemo(() => reorderAction(view), [view]);
  const reinserts = useMemo(() => reinsertActions(view), [view]);
  const escapeAction = useMemo(
    () =>
      (view?.legal_actions ?? []).find(
        (action) => actionType(action) === 'ESCAPE' && action.enabled !== false,
      ),
    [view],
  );

  const phaseSignals = useMemo(
    () => ({
      counter: Boolean(counter.use || counter.pass || escapeAction),
      reorder: Boolean(reorder),
      reinsert: reinserts.length > 0,
    }),
    [counter.use, counter.pass, escapeAction, reorder, reinserts.length],
  );
  const phase = effectivePhaseOf(view?.phase, phaseSignals);

  const counterVisible = isMyDecision && phaseSignals.counter;
  const reorderVisible = isMyDecision && phaseSignals.reorder;
  const reinsertVisible = isMyDecision && phaseSignals.reinsert;
  const decisionKey = view ? `${phase}#${view.revision}` : 'none';

  // 排序弹窗的私有材料：优先用 private_context（含牌面），缺失时退回动作里的 token 枚举
  const reorderRows: RewriteRow[] = useMemo(() => {
    const privateCards = view?.observation.private_context?.cards ?? [];
    if (privateCards.length > 0) {
      return privateCards.map((card) => ({
        token: card.token,
        card_id: card.card_id,
        name: card.name ?? cardNameOf(card.card_id),
      }));
    }
    const options = (reorder?.params?.order?.options ?? []) as string[];
    return options.map((token) => ({ token, card_id: '', name: '未知牌' }));
  }, [view, reorder]);

  // 回插区域：只认后端给的 `params.region.options`
  const reinsertRegions = useMemo(() => {
    const regions = new Set<string>();
    reinserts.forEach((action) =>
      (action.params?.region?.options ?? []).forEach((region) => regions.add(String(region))),
    );
    return [...regions];
  }, [reinserts]);

  // 反制窗口的施术者 / 法术名：事件里推（COUNTER_OPENED 的 actor + 其前置 CARD_PLAYED 的 name），
  // GET /games 不带事件时退回公开的 current_player（反制窗口里就是施术者）
  const threat = useMemo(() => {
    const events = view?.events ?? [];
    const openedIndex = events.map((event) => event.type).lastIndexOf('COUNTER_OPENED');
    if (openedIndex >= 0) {
      const opened = events[openedIndex];
      const played = [...events.slice(0, openedIndex)]
        .reverse()
        .find((event) => event.type === 'CARD_PLAYED' && event.actor === opened.actor);
      const playedName =
        typeof played?.data?.name === 'string' && played.data.name ? played.data.name : '摄物术';
      return { casterName: playerNameOf(view, opened.actor), spellName: playedName };
    }
    return { casterName: playerNameOf(view, view?.current_player), spellName: '摄物术' };
  }, [view]);

  // 手牌选择（点牌 → 使用确认层）
  const selectedInstance = useMemo(
    () =>
      view && selectedCardId
        ? view.observation.hand.find((card) => card.instance_id === selectedCardId)
        : undefined,
    [view, selectedCardId],
  );
  const selectedDirect = useMemo(
    () =>
      view && selectedCardId ? directActionForCard(view, selectedCardId) : undefined,
    [view, selectedCardId],
  );
  const selectedTargetActions = useMemo(
    () => (view && selectedCardId ? targetActionsForCard(view, selectedCardId) : []),
    [view, selectedCardId],
  );
  const selectedTargetIds = useMemo(() => {
    const ids = new Set<number>();
    selectedTargetActions.forEach((action) =>
      targetOptions(action).forEach((id) => ids.add(id)),
    );
    return [...ids];
  }, [selectedTargetActions]);
  const targetCandidates: TargetCandidate[] = useMemo(
    () =>
      (view?.public.players ?? [])
        .filter((player) => selectedTargetIds.includes(player.player_id))
        .map((player) => ({
          player_id: player.player_id,
          name: player.name,
          seat: player.player_id,
          alive: player.alive,
          hand_count: player.hand_count,
        })),
    [view, selectedTargetIds],
  );

  const selectedSpec = cardSpecOf(selectedInstance?.card_id);
  const selectedCategoryLabel = selectedSpec ? CATEGORY_LABELS[selectedSpec.category] : undefined;
  const useEnabled = Boolean(selectedDirect) || selectedTargetActions.length > 0;

  // ── 交互 ───────────────────────────────────────────────────────────────
  const handleCardPress = useCallback(
    (instanceId: string) => {
      if (locked) return;
      selectCard(instanceId);
      setTargetOpen(false);
      setUseOpen(true);
    },
    [locked, selectCard],
  );

  const handleEndTurn = useCallback(() => {
    if (locked || !endAction) return;
    void submitAction(endAction.id, {});
  }, [locked, endAction, submitAction]);

  const pendingLabel = counterVisible
    ? '反制决策'
    : reorderVisible
      ? '逆天改命排序'
      : reinsertVisible
        ? '天劫回插'
        : null;
  const showPending = Boolean(pendingLabel) && dismissed === decisionKey;

  // ── 无对局时的空态（不是对局页的一部分，仅在深链恢复失败/未开局时出现）──
  if (!view) {
    return (
      <ScreenShell variant="plain">
        <Head>
          <title>对局 · 天劫战牌</title>
        </Head>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle} allowFontScaling={false}>
            {recovering ? '正在恢复对局…' : '尚未开局'}
          </Text>
          <SecondaryButton onPress={() => router.replace('/')} style={styles.emptyButton}>
            返回首页
          </SecondaryButton>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell variant="plain" edges={['top', 'left', 'right', 'bottom']}>
      <Head>
        <title>对局 · 天劫战牌</title>
      </Head>

      <View style={styles.root}>
        {/* 第 30-37 行：轮次胶囊 */}
        <RoundBanner round={view.public.round} onLogPress={() => setLogOpen(true)} />

        {/* 事件条（真后端才有事件流；点一下跳过动画）+ 提示条，均绝对定位，不撑动版面 */}
        <EventTicker />
        {showPending ? (
          <NoticeBanner
            message={`你有未完成的决策：${pendingLabel}`}
            tone="pending"
            actionLabel="继续决策"
            onAction={() => setDismissed(null)}
            testID="pending-decision"
          />
        ) : error ? (
          <NoticeBanner
            message={error}
            tone="error"
            actionLabel="重新同步"
            onAction={() => void refreshGame()}
            onDismiss={clearError}
          />
        ) : notice ? (
          <NoticeBanner message={notice} tone="notice" onDismiss={clearError} />
        ) : null}

        {/* 第 39-53 行：对手横滑卡 */}
        {opponents.length > 0 ? <OpponentRail players={opponents} /> : null}

        {/* 第 55-70 行：战场区 */}
        <Battlefield
          phaseLabel={phaseLabelOf(phase)}
          phaseHint={phaseHintOf({
            phase,
            isMyDecision,
            decisionPlayerName: playerNameOf(view, view.decision_player),
            locked,
            animatingCount: animationQueue.length,
          })}
          deckCount={view.public.deck_count}
          discardCount={view.public.discard_count}
          lastDiscard={view.public.last_discard}
          knownTop={view.observation.known_top}
        />

        {/* 第 72-82 行：自己状态条 */}
        <SelfStatusBar
          name={me?.name ?? `P${view.viewer_player_id}`}
          seat={view.viewer_player_id}
          handCount={view.observation.hand.length}
          alive={me?.alive ?? true}
        />

        {/* 第 84-95 行：手牌横滑 */}
        <HandRail
          items={handItems}
          selectedInstanceId={selectedCardId}
          locked={locked}
          onPress={handleCardPress}
        />

        {/* 第 97-109 行：底部两列按钮 */}
        <BattleActionBar
          onSurrender={() => setSurrenderOpen(true)}
          onEndTurn={handleEndTurn}
          endEnabled={Boolean(endAction) && !locked && isMyDecision}
          endHint={
            !isMyDecision
              ? `等待 ${playerNameOf(view, view.decision_player)} 决策…`
              : !endAction
                ? '当前阶段后端未给出「结束行动」动作'
                : undefined
          }
          submitting={locked}
        />

        {/* ── 弹窗 ───────────────────────────────────────────────────── */}

        {/* 「使用卡牌」→ 按该牌自己的动作进入各自的交互（参考 GameApp.tsx 第 26-32 行的 CARD_MODAL） */}
        <CardActionModal
          open={useOpen && Boolean(selectedInstance)}
          cardId={selectedInstance?.card_id ?? ''}
          name={cardNameOf(selectedInstance?.card_id, selectedInstance?.name)}
          subtitle={cardSubtitleOf(selectedInstance?.card_id)}
          description={selectedSpec?.description}
          categoryLabel={selectedCategoryLabel}
          useEnabled={useEnabled}
          useHint={
            selectedTargetActions.length > 0
              ? '该牌需要选择目标：下一步打开目标列表（候选由 legal_actions 给出）。'
              : selectedDirect
                ? '将提交后端为该牌给出的合法动作（PLAY_CARD）。'
                : undefined
          }
          submitting={locked}
          onUse={() => {
            // 摄物术：进入选目标弹窗（每张牌的交互各不相同，这里就是分派点）
            if (selectedTargetActions.length > 0) {
              setUseOpen(false);
              setTargetOpen(true);
              return;
            }
            // 直接结算的牌：观星术 / 逆天改命 / 扰乱天机（观星、逆天改命打出后引擎会进 REORDER 决策，
            // 对应弹窗由 reorderVisible 自动打开）
            if (selectedDirect) {
              void submitAction(selectedDirect.id, {});
              setUseOpen(false);
              selectCard(undefined);
            }
          }}
          onClose={() => {
            setUseOpen(false);
            selectCard(undefined);
          }}
        />

        {/* 摄物术选目标（参考 TargetSelectModal.tsx） */}
        <TargetSelectModal
          open={targetOpen && targetCandidates.length > 0}
          targets={targetCandidates}
          submitting={locked}
          onConfirm={(playerId) => {
            const instanceId = selectedInstance?.instance_id ?? selectedCardId;
            if (!instanceId) return;
            const action = targetActionFor(view, instanceId, playerId);
            // 前端绝不自己拼动作：后端没给这个目标就不提交
            if (!action) return;
            void submitAction(action.id, { target_player: playerId });
            setTargetOpen(false);
            selectCard(undefined);
          }}
          onClose={() => {
            setTargetOpen(false);
            selectCard(undefined);
          }}
        />

        {/* 反制窗口（参考 CounterModal.tsx） */}
        <CounterModal
          open={counterVisible && dismissed !== decisionKey}
          casterName={threat.casterName}
          spellName={threat.spellName}
          useAvailable={Boolean(counter.use) && counter.use?.enabled !== false}
          passAvailable={Boolean(counter.pass) && counter.pass?.enabled !== false}
          escapeAvailable={Boolean(escapeAction)}
          escapeActionLabel={escapeAction?.label}
          useActionLabel={counter.use?.label}
          passActionLabel={counter.pass?.label}
          submitting={locked}
          onUse={() => {
            if (counter.use) void submitAction(counter.use.id, {});
          }}
          onDecline={() => {
            if (counter.pass) void submitAction(counter.pass.id, {});
          }}
          onEscape={() => {
            if (escapeAction) void submitAction(escapeAction.id, {});
          }}
          onClose={() => setDismissed(decisionKey)}
        />

        {/* 排序决策（参考 RewriteFateModal.tsx）：逆天改命 / 观星术打出后进入 */}
        <RewriteFateModal
          open={reorderVisible && dismissed !== decisionKey}
          rows={reorderRows}
          actionAvailable={Boolean(reorder) && reorder?.enabled !== false}
          submitting={locked}
          onConfirm={(order) => {
            if (!reorder) return;
            void submitAction(reorder.id, { order });
            selectCard(undefined);
          }}
          onClose={() => setDismissed(decisionKey)}
        />

        {/* 天劫回插（参考 TribulationReinsertModal.tsx） */}
        <TribulationReinsertModal
          open={reinsertVisible && dismissed !== decisionKey}
          available={reinsertRegions}
          submitting={locked}
          onConfirm={(region) => {
            const action = reinsertActionForRegion(view, region);
            if (!action) return;
            void submitAction(action.id, { region: region as ReinsertRegion });
          }}
          onClose={() => setDismissed(decisionKey)}
        />

        {/* 认输确认（契约没有 surrender 动作，见 SurrenderModal.tsx 头注释） */}
        <SurrenderModal
          open={surrenderOpen}
          onCancel={() => setSurrenderOpen(false)}
          onConfirm={() => {
            setSurrenderOpen(false);
            clearGame();
            router.replace('/');
          }}
        />

        {/* 战报（参考此屏留白；事件事实的只读回看入口） */}
        <BattleLogModal open={logOpen} lines={battleLog} onClose={() => setLogOpen(false)} />
      </View>

      {isRefreshing ? (
        <Text style={styles.refreshing} allowFontScaling={false}>
          正在同步最新局面…
        </Text>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyTitle: { ...serif(700), fontSize: 20, color: cream },
  emptyButton: { minWidth: 160 },
  refreshing: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    ...sans(400),
    fontSize: 10,
    color: creamDim,
  },
});

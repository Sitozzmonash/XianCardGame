import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useGameStore } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import { cardNameOf } from '@/utils/card-catalog';
import type { GameView } from '@/types/game';
import {
  counterActions,
  playerNameOf,
  reinsertActions,
  reinsertActionForRegion,
  reorderAction,
  targetActionFor,
  targetActionsForCard,
  targetOptions,
} from '@/utils/legal-actions';

import { CounterDialog } from './CounterDialog';
import { ReinsertTribulationDialog } from './ReinsertTribulationDialog';
import { ReorderTopDialog } from './ReorderTopDialog';
import { TargetPlayerDialog } from './TargetPlayerDialog';

type Region = 'TOP' | 'NEAR_TOP' | 'MIDDLE' | 'BOTTOM';

/**
 * 特殊决策总调度层。
 *
 * battle.tsx 只负责渲染 <SpecialDecisionLayer />，四种特殊决策各自独立成组件：
 *   COUNTER  → CounterDialog
 *   REORDER  → ReorderTopDialog
 *   REINSERT → ReinsertTribulationDialog
 *   PLAY_CARD_TARGET → TargetPlayerDialog
 * 每个弹窗的可见性与选项**全部来自后端 view/legal_actions**。
 */
export function SpecialDecisionLayer() {
  const view = useGameStore((state) => state.view);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const animationQueue = useGameStore((state) => state.animationQueue);
  const selectedCardId = useGameStore((state) => state.selectedCardId);
  const battleLog = useGameStore((state) => state.battleLog);
  const submitAction = useGameStore((state) => state.submitAction);
  const selectCard = useGameStore((state) => state.selectCard);

  const locked = isSubmitting || animationQueue.length > 0;
  const decisionKey = view ? `${view.phase}#${view.revision}` : 'none';
  const [dismissed, setDismissed] = useState<string | null>(null);

  // 局面推进到新的 revision 时，之前「稍后决定」的关闭状态自动失效
  useEffect(() => {
    setDismissed(null);
  }, [decisionKey]);

  const counter = counterActions(view);
  const reorder = reorderAction(view);
  const reinserts = reinsertActions(view);
  const tokens = view?.observation.private_context?.cards ?? [];

  const targetActions = selectedCardId ? targetActionsForCard(view, selectedCardId) : [];
  const targetIds = useMemo(() => {
    const ids = new Set<number>();
    targetActions.forEach((action) => targetOptions(action).forEach((id) => ids.add(id)));
    return [...ids];
  }, [targetActions]);

  const targetPlayers = (view?.public.players ?? []).filter((player) =>
    targetIds.includes(player.player_id),
  );

  const selectedCardName = useMemo(() => {
    if (!view || !selectedCardId) return '';
    const instance = view.observation.hand.find((card) => card.instance_id === selectedCardId);
    return instance?.name ?? cardNameOf(instance?.card_id);
  }, [view, selectedCardId]);

  const threatText = useMemo(() => {
    if (!view) return '有人对你出手。';
    const opened = [...view.events].reverse().find((event) => event.type === 'COUNTER_OPENED');
    if (opened) {
      return `${playerNameOf(view, opened.actor)} 对你使用【${cardNameOf(opened.card_id)}】`;
    }
    const last = battleLog.length > 0 ? battleLog[battleLog.length - 1] : undefined;
    return last ? `最近事件：${last}` : '有人对你出手。';
  }, [view, battleLog]);

  if (!view) return null;

  const isViewerTurn = view.decision_player === view.viewer_player_id;
  const showCounter =
    view.phase === 'COUNTER' && isViewerTurn && Boolean(counter.use || counter.pass);
  const showReorder = view.phase === 'REORDER' && isViewerTurn && tokens.length > 0 && Boolean(reorder);
  const showReinsert = view.phase === 'REINSERT' && isViewerTurn && reinserts.length > 0;
  const showTarget = targetPlayers.length > 0 && Boolean(selectedCardId);

  const pendingLabel = showCounter
    ? '反制决策'
    : showReorder
      ? '逆天改命排序'
      : showReinsert
        ? '天劫回插'
        : showTarget
          ? '选择目标'
          : null;

  return (
    <View>
      {pendingLabel && dismissed === decisionKey ? (
        <View style={styles.pending}>
          <Text style={styles.pendingText}>你有未完成的决策：{pendingLabel}</Text>
          <View style={styles.pendingButton}>
            <PrimaryButton
              label="继续决策"
              variant="gold"
              compact
              onPress={() => setDismissed(null)}
            />
          </View>
        </View>
      ) : null}

      <CounterDialog
        visible={showCounter && dismissed !== decisionKey}
        threatText={threatText}
        useAction={counter.use}
        passAction={counter.pass}
        handCount={view.observation.hand.length}
        submitting={locked}
        onUse={() => {
          if (counter.use) void submitAction(counter.use.id, {});
        }}
        onPass={() => {
          if (counter.pass) void submitAction(counter.pass.id, {});
        }}
        onClose={() => setDismissed(decisionKey)}
      />

      <ReorderTopDialog
        visible={showReorder && dismissed !== decisionKey}
        tokens={tokens}
        action={reorder}
        submitting={locked}
        onSubmit={(order) => {
          if (reorder) void submitAction(reorder.id, { order });
          selectCard(undefined);
        }}
        onClose={() => setDismissed(decisionKey)}
      />

      <ReinsertTribulationDialog
        visible={showReinsert && dismissed !== decisionKey}
        actions={reinserts}
        submitting={locked}
        onSelect={(action, region: Region) => {
          const resolved = reinsertActionForRegion(view, region) ?? action;
          void submitAction(resolved.id, { region });
        }}
        onClose={() => setDismissed(decisionKey)}
      />

      <TargetPlayerDialog
        visible={showTarget}
        cardName={selectedCardName || '摄物术'}
        options={targetPlayers}
        submitting={locked}
        onConfirm={(playerId) => {
          if (!view || !selectedCardId) return;
          const action = targetActionFor(view, selectedCardId, playerId);
          if (!action) return;
          void submitAction(action.id, { target_player: playerId });
          selectCard(undefined);
        }}
        onClose={() => selectCard(undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: 'rgba(201,166,90,0.16)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  pendingText: {
    ...text.caption,
    flex: 1,
    color: colors.goldLight,
  },
  pendingButton: {
    minWidth: 104,
    marginLeft: spacing.sm,
  },
});

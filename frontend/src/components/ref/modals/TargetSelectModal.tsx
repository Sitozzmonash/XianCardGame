/**
 * 参考原型 `components/game/modals/TargetSelectModal.tsx`（第 10–69 行）的 RN 1:1 移植。
 *
 * 逐行对应：
 *   25-29  GameModal：title「选择目标」/ subtitle「摄物术 · 选择一名存活修士，随机夺取其一张手牌」
 *   41-66  候选行 `flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3`
 *          └ 选中：`border-gold-300 bg-jade-700/40 shadow-[0_0_0_1px_rgba(232,213,168,0.5)]`
 *          └ 未选：`border-gold-500/25 bg-ink-850/60`
 *          └ `PlayerAvatar size="md"` + 名字 15px serif 600 + 「手牌 N 张」11px sans
 *          └ 右侧 `StatusTag`：选中 → gold「已选中」，否则 muted「存活」
 *   30-39  footer：`SecondaryButton` 取消 / `PrimaryButton disabled={!selected}` 确认目标
 *
 * 数据来源（铁律 1）：候选**只**来自摄物术的 `PLAY_CARD_TARGET` 动作集合
 * （引擎对每个可选目标给一条 action，`params.target_player.options = [该目标]`）。
 * 前端不判断「谁可被指定」，也不过滤存活 —— 候选里出现的都是后端认可的合法目标。
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GameModal } from '@/components/ref/GameModal';
import { PlayerAvatar } from '@/components/ref/PlayerAvatar';
import { PrimaryButton, SecondaryButton, StatusTag } from '@/components/ref/primitives';
import { SelectionRing } from '@/components/ref/modals/SoftGlow';
import { cream, creamFaint, gold, ink, jade, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export interface TargetCandidate {
  player_id: number;
  name: string;
  seat: number;
  alive: boolean;
  hand_count: number;
}

export function TargetSelectModal({
  open,
  targets,
  subtitle,
  submitting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** 候选目标（来自 legal_actions 的 target_player.options，顺序按 public.players） */
  targets: TargetCandidate[];
  /** 副标题：默认「摄物术 · 选择一名存活修士…」（参考第 28 行） */
  subtitle?: string;
  submitting?: boolean;
  onConfirm: (playerId: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  // 参考里没有这个重置（原型是纯静态数据）。真局面下 revision/阶段一变，候选会变，
  // 旧的选中项必须失效 —— 否则会把「上一轮选的人」当成这一轮的目标。
  const candidateKey = targets.map((target) => target.player_id).join(',');
  useEffect(() => {
    setSelected(null);
  }, [open, candidateKey]);

  return (
    <GameModal
      open={open}
      title="选择目标"
      subtitle={subtitle ?? '摄物术 · 选择一名存活修士，随机夺取其一张手牌'}
      onClose={onClose}
      testID="modal-target-select"
      footer={
        <View style={styles.footerRow}>
          <SecondaryButton fullWidth={false} style={styles.footerItem} onPress={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton
            fullWidth={false}
            style={styles.footerItem}
            disabled={selected === null || submitting}
            onPress={() => {
              if (selected !== null) onConfirm(selected);
            }}
          >
            确认目标
          </PrimaryButton>
        </View>
      }
    >
      <View style={styles.list}>
        {targets.length === 0 ? (
          <Text style={styles.empty} allowFontScaling={false}>
            当前局面后端没有给出可选目标。
          </Text>
        ) : (
          <ScrollView
            style={{ maxHeight: 320 }}
            contentContainerStyle={styles.listInner}
            showsVerticalScrollIndicator={false}
          >
            {targets.map((target) => {
              const active = selected === target.player_id;
              return (
                <Pressable
                  key={target.player_id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${target.name}，手牌 ${target.hand_count} 张`}
                  disabled={submitting}
                  onPress={() => setSelected(target.player_id)}
                  style={[styles.row, active ? styles.rowActive : styles.rowIdle]}
                >
                  {active ? <SelectionRing radius={radius['2xl']} /> : null}
                  <PlayerAvatar name={target.name} seat={target.seat} size="md" alive={target.alive} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName} numberOfLines={1} allowFontScaling={false}>
                      {target.name}
                    </Text>
                    <Text style={styles.rowCount} allowFontScaling={false}>
                      手牌 {target.hand_count} 张
                    </Text>
                  </View>
                  {active ? (
                    <StatusTag tone="gold">已选中</StatusTag>
                  ) : (
                    <StatusTag tone="muted">{target.alive ? '存活' : '已淘汰'}</StatusTag>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </GameModal>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 2 },
  listInner: { gap: sp(2.5) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderRadius: radius['2xl'],
    borderWidth: 1,
    paddingHorizontal: sp(3.5),
    paddingVertical: sp(3),
  },
  rowIdle: { borderColor: rgba(gold[500], 0.25), backgroundColor: rgba(ink[850], 0.6) },
  rowActive: {
    borderColor: gold[300],
    backgroundColor: rgba(jade[700], 0.4),
  },
  rowBody: { flexShrink: 1, minWidth: 0, flex: 1 },
  rowName: { ...serif(600), fontSize: 15, color: cream },
  rowCount: { ...sans(400), fontSize: 11, color: creamFaint, marginTop: 2 },
  empty: { ...sans(400), fontSize: 12, color: creamFaint, paddingVertical: sp(2) },
  /** 参考的 footer 是两个 `flex-1` 按钮（CSS 里 `w-full` + `flex-shrink:1` 会平分）；
   *  RN 的 flexShrink 默认是 0，直接给 width:'100%' 会顶出容器，所以这里显式 flex:1。 */
  footerRow: { flex: 1, flexDirection: 'row', gap: sp(3) },
  footerItem: { flex: 1 },
});

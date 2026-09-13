/**
 * 参考原型 `components/game/modals/TribulationReinsertModal.tsx`（第 8–92 行）的 RN 1:1 移植。
 *
 * 逐行对应：
 *   10-15  4 个区域常量：顶部 TOP depth 2 / 靠近顶部 NEAR TOP depth 3 / 中部 MIDDLE depth 4 / 底部 BOTTOM depth 3
 *   26     默认选中 `nearTop`（这里对齐：默认「靠近顶部」，若后端未给该区域则退回第一个可用区域）
 *   28-43  GameModal：title「天劫回插」/ subtitle「使用护劫符后，将天劫秘密插入牌堆。选择位置后此信息仅你可见。」
 *          footer：`SecondaryButton` 取消 / `PrimaryButton` 确认回插
 *   45-85  区域行：`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3`
 *          └ 选中：`border-gold-300 bg-jade-700/40 shadow-[0_0_0_1px_…]`；未选：`border-gold-500/25 bg-ink-850/60`
 *          └ 61-71 行 **深度条**：`w-14 flex-col items-center gap-1`，每段 `h-1.5 w-full rounded-full`，
 *             选中 `bg-gold-400/70`、否则 `bg-jade-600/50`
 *          └ 73-76 行 区域名 15px serif 600 + 英文小字 10px `tracking-[0.2em]`
 *          └ 78-82 行 选中时右侧出现「天劫」方块（`rounded-md border-gold-400/60 bg-ink-950/70`）
 *   87-89  提示「越靠近顶部，天劫越早降临」
 *
 * 数据来源（铁律 1）：可选区域**只**来自 `REINSERT_TRIBULATION` 动作集合的 `params.region.options`；
 * 后端没给的区域行会保持排版但 `disabled` + 「未开放」角标（不做假链接）。
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameModal } from '@/components/ref/GameModal';
import { SelectionRing } from '@/components/ref/modals/SoftGlow';
import { PrimaryButton, SecondaryButton, StatusTag } from '@/components/ref/primitives';
import { cream, creamFaint, gold, ink, jade, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

/** 参考第 10-15 行原样（顺序、label、en、depth 都不许改） */
export const REINSERT_ZONES = [
  { id: 'TOP', label: '顶部', en: 'TOP', depth: 2 },
  { id: 'NEAR_TOP', label: '靠近顶部', en: 'NEAR TOP', depth: 3 },
  { id: 'MIDDLE', label: '中部', en: 'MIDDLE', depth: 4 },
  { id: 'BOTTOM', label: '底部', en: 'BOTTOM', depth: 3 },
] as const;

export type ReinsertZoneId = (typeof REINSERT_ZONES)[number]['id'];

export function TribulationReinsertModal({
  open,
  /** 后端 legal_actions 允许的区域（来自 `params.region.options`） */
  available,
  /** 默认选中的区域（参考第 26 行是 nearTop） */
  initialZone = 'NEAR_TOP',
  submitting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  available: string[];
  initialZone?: string;
  submitting?: boolean;
  onConfirm: (region: string) => void;
  onClose: () => void;
}) {
  // 参考的 useState('nearTop')；这里保证「选中项一定是可用区域」，避免提交一个后端没给的区域
  const fallback = available.includes(initialZone) ? initialZone : available[0];
  const [zone, setZone] = useState<string | undefined>(fallback);

  // 局面推进（revision 变 / 打开弹窗）时重置为默认区域
  const availableKey = available.join(',');
  useEffect(() => {
    if (open) setZone(fallback);
  }, [open, availableKey, fallback]);

  const canConfirm = Boolean(zone) && available.includes(zone ?? '');

  return (
    <GameModal
      open={open}
      title="天劫回插"
      subtitle="使用护劫符后，将天劫秘密插入牌堆。选择位置后此信息仅你可见。"
      onClose={onClose}
      testID="modal-reinsert"
      footer={
        <View style={styles.footerRow}>
          <SecondaryButton fullWidth={false} style={styles.footerItem} onPress={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton
            fullWidth={false}
            style={styles.footerItem}
            disabled={!canConfirm || submitting}
            onPress={() => {
              if (zone && canConfirm) onConfirm(zone);
            }}
          >
            确认回插
          </PrimaryButton>
        </View>
      }
    >
      <View style={styles.list}>
        {REINSERT_ZONES.map((item) => {
          const active = zone === item.id;
          const enabled = available.includes(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !enabled }}
              accessibilityLabel={`天劫回插 ${item.label}`}
              disabled={!enabled || submitting}
              onPress={() => setZone(item.id)}
              style={[
                styles.row,
                active ? styles.rowActive : styles.rowIdle,
                !enabled && styles.rowDisabled,
              ]}
            >
              {active ? <SelectionRing radius={radius['2xl']} /> : null}

              {/* 深度条：段数 = item.depth（2/3/4/3） */}
              <View style={styles.depthCol}>
                {Array.from({ length: item.depth }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.depthBar,
                      { backgroundColor: active ? rgba(gold[400], 0.7) : rgba(jade[600], 0.5) },
                    ]}
                  />
                ))}
              </View>

              <View style={styles.rowBody}>
                <Text style={styles.rowLabel} allowFontScaling={false}>
                  {item.label}
                </Text>
                <Text style={styles.rowEn} allowFontScaling={false}>
                  {item.en}
                </Text>
              </View>

              {active ? (
                <View style={styles.tribulationBadge}>
                  <Text style={styles.tribulationText} allowFontScaling={false}>
                    天劫
                  </Text>
                </View>
              ) : !enabled ? (
                <StatusTag tone="muted">未开放</StatusTag>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint} allowFontScaling={false}>
        越靠近顶部，天劫越早降临
      </Text>
    </GameModal>
  );
}

const styles = StyleSheet.create({
  list: { gap: sp(2.5), paddingBottom: 2 },
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
  rowActive: { borderColor: gold[300], backgroundColor: rgba(jade[700], 0.4) },
  rowDisabled: { opacity: 0.45 },

  depthCol: { width: 56, alignItems: 'center', gap: sp(1), flexShrink: 0 },
  depthBar: { height: 6, width: '100%', borderRadius: radius.full },

  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { ...serif(600), fontSize: 15, letterSpacing: track(0.025, 15), color: cream },
  rowEn: { ...sans(400), fontSize: 10, letterSpacing: track(0.2, 10), color: creamFaint, marginTop: 2 },

  tribulationBadge: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: rgba(gold[400], 0.6),
    backgroundColor: rgba(ink[950], 0.7),
    paddingHorizontal: sp(2),
    paddingVertical: sp(1),
    flexShrink: 0,
  },
  tribulationText: { ...serif(700), fontSize: 11, color: gold[300] },

  hint: {
    ...sans(400),
    fontSize: 10,
    letterSpacing: track(0.025, 10),
    color: creamFaint,
    textAlign: 'center',
    marginTop: sp(3),
  },
  /** RN 的 flexShrink 默认 0，两个 `w-full` 按钮必须显式 flex:1 才能平分（参考靠 CSS flex-shrink 实现） */
  footerRow: { flex: 1, flexDirection: 'row', gap: sp(3) },
  footerItem: { flex: 1 },
});

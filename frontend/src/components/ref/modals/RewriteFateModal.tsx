/**
 * 参考原型 `components/game/modals/RewriteFateModal.tsx`（第 9–118 行）的 RN 1:1 移植。
 *
 * 逐行对应：
 *   38-52  GameModal：title「逆天改命」/ subtitle「查看牌堆顶部最多 3 张牌，并重新调整顺序。最上方为下一张将被抽到的牌。」
 *          footer：`SecondaryButton` 取消 / `PrimaryButton` 确认顺序
 *   54-112 行列表（`space-y-2.5`）：
 *     - 67-72 行 行容器 `flex items-center gap-3 rounded-2xl border px-3 py-2.5`；拖拽中 → `border-gold-300 bg-jade-700/40`
 *     - 74-76 行 序号方块 `h-7 w-7 rounded-lg border-gold-400/60 bg-ink-950/70` + 14px serif bold 金 300
 *     - 77-80 行 缩略图 `h-14 w-11`（56×44）`rounded-lg border-gold-500/40` + `object-cover` 卡面
 *     - 81-84 行 卡名 14px serif 600 + 副标题 10px sans（副标题来自本目录 `cardMeta.ts`，后端不下发）
 *     - 85-108 行 ↑ / ↓ 两个 24×24 圆角方按钮，首/末项分别 disable（opacity-30）
 *   113-115 提示「可拖拽调整，或使用箭头按钮排序」
 *
 * RN 化差异（移植规格允许并已在报告中说明）：
 *   - 参考用 HTML5 `draggable`；RN 用 `PanResponder`（长列表拖拽的标准做法，web/native 同源），
 *     拖拽期间按半个行高为步进实时交换顺序，松手落定；
 *   - ↑↓ 按钮**必然可用**（无手势依赖），拖拽只是加分项。
 *
 * 私有信息（铁律 3/4）：这里只吃 `observation.private_context.cards` 的 token + 牌面，
 * 提交的也是 token 顺序（`payload.order`），**绝不出现真实牌堆下标**。
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ChevronDownIcon, ChevronUpIcon } from '@/components/ref/Icons';
import { GameModal } from '@/components/ref/GameModal';
import { cardSubtitleOf } from '@/components/ref/modals/cardMeta';
import { PrimaryButton, SecondaryButton } from '@/components/ref/primitives';
import { artOf } from '@/theme/refAssets';
import { cream, creamDim, creamFaint, gold, ink, jade, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export interface RewriteRow {
  /** 后端下发的私有 token（`private_1..k`），提交顺序用它 */
  token: string;
  card_id: string;
  name: string;
}

/** 行高 = py(10)×2 + 缩略图 56 + 上下边框 2 = 78；列表间距 10 → 拖拽步进 88 */
const ROW_H = 78;
const ROW_GAP = sp(2.5);
const STEP = ROW_H + ROW_GAP;

export function RewriteFateModal({
  open,
  rows,
  submitting,
  actionAvailable,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** 牌堆顶的私有 token（`observation.private_context.cards`） */
  rows: RewriteRow[];
  submitting?: boolean;
  /** 后端是否给了 `REORDER_TOP` 动作（缺则不提交，按钮 disable） */
  actionAvailable: boolean;
  /** 提交 token 顺序（`payload.order`，API_CONTRACT §12.4） */
  onConfirm: (order: string[]) => void;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<string[]>([]);

  const tokenKey = rows.map((row) => row.token).join(',');
  useEffect(() => {
    if (open) setOrder(rows.map((row) => row.token));
    // tokenKey 表示后端下发的 token 集合（同一 revision 内稳定）；revision 变化时会重建顺序
  }, [open, tokenKey, rows]);

  const rowMap = useMemo(() => {
    const map = new Map<string, RewriteRow>();
    rows.forEach((row) => map.set(row.token, row));
    return map;
  }, [rows]);

  const move = (from: number, to: number) => {
    setOrder((prev) => {
      if (to < 0 || to >= prev.length || from === to || from < 0 || from >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const canSubmit = order.length > 0 && order.length === rows.length && actionAvailable;

  return (
    <GameModal
      open={open}
      title="逆天改命"
      subtitle="查看牌堆顶部最多 3 张牌，并重新调整顺序。最上方为下一张将被抽到的牌。"
      onClose={onClose}
      testID="modal-rewrite-fate"
      footer={
        <View style={styles.footerRow}>
          <SecondaryButton fullWidth={false} style={styles.footerItem} onPress={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton
            fullWidth={false}
            style={styles.footerItem}
            disabled={!canSubmit || submitting}
            onPress={() => onConfirm(order)}
          >
            确认顺序
          </PrimaryButton>
        </View>
      }
    >
      <View style={styles.list}>
        {order.length === 0 ? (
          <Text style={styles.empty} allowFontScaling={false}>
            后端未下发可排序的牌堆顶信息。
          </Text>
        ) : (
          order.map((token, index) => {
            const row = rowMap.get(token);
            return (
              <SortRow
                key={token}
                index={index}
                total={order.length}
                name={row?.name && row.name.length > 0 ? row.name : '未知牌'}
                cardId={row?.card_id ?? ''}
                subtitle={cardSubtitleOf(row?.card_id)}
                onMove={move}
              />
            );
          })
        )}
      </View>
      <Text style={styles.hint} allowFontScaling={false}>
        可拖拽调整，或使用箭头按钮排序
      </Text>
    </GameModal>
  );
}

/** 单行：序号 + 缩略卡面 + 卡名/副标题 + ↑↓（参考第 55–110 行） */
function SortRow({
  index,
  total,
  name,
  cardId,
  subtitle,
  onMove,
}: {
  index: number;
  total: number;
  name: string;
  cardId: string;
  subtitle?: string;
  onMove: (from: number, to: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(index);
  const totalRef = useRef(total);
  const offsetRef = useRef(0);
  const onMoveRef = useRef(onMove);
  indexRef.current = index;
  totalRef.current = total;
  onMoveRef.current = onMove;

  const pan = useRef(
    PanResponder.create({
      // 让 ScrollView 先处理点击；只有明确的竖向拖动才夺取手势
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        offsetRef.current = 0;
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        let dy = gesture.dy - offsetRef.current * STEP;
        const steps = Math.round(dy / STEP);
        if (steps !== 0) {
          const from = indexRef.current;
          const to = from + steps;
          if (to >= 0 && to < totalRef.current) {
            onMoveRef.current(from, to);
            offsetRef.current += steps;
            dy -= steps * STEP;
          }
        }
        translateY.setValue(dy);
      },
      onPanResponderRelease: () => {
        translateY.setValue(0);
        offsetRef.current = 0;
        setDragging(false);
      },
      onPanResponderTerminate: () => {
        translateY.setValue(0);
        offsetRef.current = 0;
        setDragging(false);
      },
    }),
  ).current;

  const art = artOf(cardId);

  return (
    <Animated.View
      style={[
        styles.row,
        dragging ? styles.rowDragging : styles.rowIdle,
        { transform: [{ translateY }] },
      ]}
      {...pan.panHandlers}
    >
      {/* 序号方块 */}
      <View style={styles.indexBox}>
        <Text style={styles.indexText} allowFontScaling={false}>
          {index + 1}
        </Text>
      </View>

      {/* 缩略卡面 56×44 */}
      <View style={styles.thumb}>
        {art ? (
          <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[ink[700], ink[900]]}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1} allowFontScaling={false}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1} allowFontScaling={false}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.arrows}>
        <ArrowButton
          label={`将 ${name} 上移`}
          disabled={index === 0}
          onPress={() => onMove(index, index - 1)}
        >
          <ChevronUpIcon size={12} color={creamDim} strokeWidth={2.5} />
        </ArrowButton>
        <ArrowButton
          label={`将 ${name} 下移`}
          disabled={index === total - 1}
          onPress={() => onMove(index, index + 1)}
        >
          <ChevronDownIcon size={12} color={creamDim} strokeWidth={2.5} />
        </ArrowButton>
      </View>
    </Animated.View>
  );
}

function ArrowButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrow,
        disabled && styles.arrowDisabled,
        pressed && !disabled && styles.arrowPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: ROW_GAP, paddingBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderRadius: radius['2xl'],
    borderWidth: 1,
    paddingHorizontal: sp(3),
    paddingVertical: sp(2.5),
    minHeight: ROW_H - 2,
  },
  rowIdle: { borderColor: rgba(gold[500], 0.25), backgroundColor: rgba(ink[850], 0.6) },
  rowDragging: { borderColor: gold[300], backgroundColor: rgba(jade[700], 0.4) },

  indexBox: {
    height: 28,
    width: 28,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: rgba(gold[400], 0.6),
    backgroundColor: rgba(ink[950], 0.7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { ...serif(700), fontSize: 14, color: gold[300] },

  thumb: {
    height: 56,
    width: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.4),
    backgroundColor: ink[900],
    overflow: 'hidden',
  },

  rowBody: { flex: 1, minWidth: 0, flexShrink: 1 },
  rowName: { ...serif(600), fontSize: 14, color: cream },
  rowSubtitle: { ...sans(400), fontSize: 10, color: creamFaint, marginTop: 2 },

  arrows: { gap: sp(1), flexShrink: 0 },
  arrow: {
    height: 24,
    width: 24,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
  arrowPressed: { borderColor: rgba(gold[400], 0.7) },

  hint: {
    ...sans(400),
    fontSize: 10,
    letterSpacing: track(0.025, 10),
    color: creamFaint,
    textAlign: 'center',
    marginTop: sp(3),
  },
  empty: { ...sans(400), fontSize: 12, color: creamFaint, paddingVertical: sp(2) },
  /** ⚠️ RN 与 CSS 的差异：参考 footer 的两个 `w-full` 按钮靠 CSS 的 `flex-shrink:1` 平分宽度，
   *  RN 的 flexShrink 默认是 0，照抄 `width:'100%'` 会把第二个按钮顶出容器（被 panel 裁掉），
   *  因此这里显式 `flex:1`。 */
  footerRow: { flex: 1, flexDirection: 'row', gap: sp(3) },
  footerItem: { flex: 1 },
});

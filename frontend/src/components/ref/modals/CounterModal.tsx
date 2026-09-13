/**
 * 参考原型 `components/game/modals/CounterModal.tsx`（第 8–48 行）的 RN 1:1 移植。
 *
 * 逐行对应：
 *   20-25  GameModal tone="blood" / title「是否反制」/ subtitle `「${casterName} 对你使用了摄物术」`
 *   26-35  footer：`SecondaryButton` 不反制 / `PrimaryButton` 使用反制符
 *   37-45  正文：居中列 gap-3 py-1
 *          └ 第 38-41 行 血光晕（`absolute -inset-5 rounded-full bg-blood-500/25 blur-2xl`）+ `GameCard size="lg"` 且
 *            `className="relative w-[190px]"`（参考**覆盖了 lg 的 248 宽**，这里同样覆盖成 190 宽、高度按 3:4）
 *          └ 第 42-44 行说明文字：`max-w-[280px] text-center 12px leading-relaxed cream-dim`
 *
 * 触发：`view.phase === 'COUNTER'` 且轮到本人决策（见 `src/app/battle.tsx`）。
 * 两个按钮分别绑定后端给的 `COUNTER` / `PASS_COUNTER` 动作；缺哪个就 disable 哪个（铁律 1，不做假链接）。
 *
 * ⚠️ 动作空间差异（已按 legal_actions 如实处理）：参考原型只有「不反制 / 使用反制符」两个按钮，
 * 而当前引擎把「遁术」改成了**只能在反制窗口打出的反应牌**（`backend/game/state.py` 文件头、
 * `CARD_RULES_DELTA.md` §2.2，动作 type = `ESCAPE`）。该动作存在时会多渲染一行「遁术」按钮，
 * 不存在时版面与参考完全一致。
 */

import { StyleSheet, Text, View } from 'react-native';

import { GameCard } from '@/components/ref/GameCard';
import { GameModal } from '@/components/ref/GameModal';
import { SoftGlow } from '@/components/ref/modals/SoftGlow';
import { PrimaryButton, SecondaryButton } from '@/components/ref/primitives';
import { blood, creamDim, sp } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

/** 参考第 40 行：`w-[190px]`，lg 卡面宽被覆盖（高按 3:4 联动） */
const CARD_W = 190;
const CARD_H = (CARD_W * 4) / 3;

export function CounterModal({
  open,
  casterName,
  spellName = '摄物术',
  useActionLabel,
  passActionLabel,
  escapeActionLabel,
  useAvailable,
  passAvailable,
  escapeAvailable = false,
  submitting,
  onUse,
  onDecline,
  onEscape,
  onClose,
}: {
  open: boolean;
  /** 施术者名字（由 COUNTER_OPENED / CARD_PLAYED 事件推出，见 battle.tsx） */
  casterName: string;
  /** 事件里的真实牌名（后端 `data.name`），兜底「摄物术」 */
  spellName?: string;
  /** 按钮文案取自 legal_actions 的 label（驱动逻辑仍是「动作存不存在」） */
  useActionLabel?: string;
  passActionLabel?: string;
  /** 反应牌「遁术」：当前引擎在反制窗口给出第三个选项（`ESCAPE`） */
  escapeActionLabel?: string;
  useAvailable: boolean;
  passAvailable: boolean;
  escapeAvailable?: boolean;
  submitting?: boolean;
  onUse: () => void;
  onDecline: () => void;
  onEscape?: () => void;
  onClose?: () => void;
}) {
  return (
    <GameModal
      open={open}
      tone="blood"
      title="是否反制"
      subtitle={`「${casterName} 对你使用了${spellName}」`}
      onClose={onClose}
      testID="modal-counter"
      footer={
        <View style={styles.footer}>
          {/* 参考原型只有两个按钮；当前引擎在反制窗口多出一个反应牌「遁术」动作
              （见 CARD_RULES_DELTA §2.2），这里按 legal_actions **如实**多给一行，
              不做「点了没反应」的假按钮。 */}
          {escapeAvailable ? (
            <SecondaryButton fullWidth disabled={submitting} onPress={onEscape}>
              {escapeActionLabel ?? '使用遁术（避开并结束结算）'}
            </SecondaryButton>
          ) : null}
          <View style={styles.footerRow}>
            <SecondaryButton fullWidth disabled={!passAvailable || submitting} onPress={onDecline}>
              {passActionLabel ?? '不反制'}
            </SecondaryButton>
            <PrimaryButton fullWidth disabled={!useAvailable || submitting} onPress={onUse}>
              {useActionLabel ?? '使用反制符'}
            </PrimaryButton>
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.cardWrap}>
          {/* -inset-5 rounded-full：卡片四周再外扩 20px 的椭圆血光 */}
          <SoftGlow color={blood[500]} opacity={0.25} style={styles.halo} />
          <GameCard
            cardId="COUNTER"
            name="反制符"
            size="lg"
            style={{ width: CARD_W, height: CARD_H }}
          />
        </View>
        <Text style={styles.note} allowFontScaling={false}>
          反制符将令该法术效果转向施术者。此牌使用后进入弃牌堆。
        </Text>
      </View>
    </GameModal>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: sp(3), paddingVertical: sp(1) },
  cardWrap: { position: 'relative' },
  halo: { top: -sp(5), left: -sp(5), right: -sp(5), bottom: -sp(5) },
  note: {
    ...sans(400),
    fontSize: 12,
    lineHeight: 19.5,
    color: creamDim,
    textAlign: 'center',
    maxWidth: 280,
  },
  footer: { flex: 1, gap: sp(3) },
  footerRow: { flexDirection: 'row', gap: sp(3) },
});

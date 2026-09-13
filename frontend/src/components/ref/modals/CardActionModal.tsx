/**
 * 「使用卡牌」确认弹窗 —— 参考原型的这一步在**独立屏** `CardDetailScreen` 里：
 * 手牌点击 → 卡牌详情（大卡面 + 三标签 + 「卡牌效果」Panel）→ 底部「取消 / 使用卡牌」
 * → 按 `CARD_MODAL`（GameApp.tsx 第 26–32 行）进入该牌**各自的**交互弹窗。
 *
 * 对局页需要一个原地版本（本仓库尚无 ref 版详情屏），因此这里只移植参考详情屏里
 * 与「使用」直接相关的那一段：大卡面 + 副标题 + 效果文字 + 底部「取消 / 使用卡牌」。
 * 它**不是**通用交互弹窗：按下「使用卡牌」后，每张牌进入的弹窗/结算由 battle.tsx 按
 * 该牌自己的 legal action 决定（摄物术 → 选目标；逆天改命 → 排序；观星/扰乱/遁术 → 直接结算；
 * 无动作 → 按钮 disable + 「未开放」角标）。
 *
 * 铁律 1：`useEnabled` 只由「后端有没有给出这张牌的动作」决定，前端不认牌名。
 */

import { StyleSheet, Text, View } from 'react-native';

import { GameCard } from '@/components/ref/GameCard';
import { GameModal } from '@/components/ref/GameModal';
import { SoftGlow } from '@/components/ref/modals/SoftGlow';
import { GoldHairline, Panel, PrimaryButton, SecondaryButton, StatusTag } from '@/components/ref/primitives';
import { cardSubtitleOf } from '@/components/ref/modals/cardMeta';
import { creamDim, creamFaint, jade, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export function CardActionModal({
  open,
  cardId,
  name,
  subtitle,
  description,
  categoryLabel,
  useEnabled,
  useHint,
  submitting,
  onUse,
  onClose,
}: {
  open: boolean;
  cardId: string;
  name: string;
  subtitle?: string;
  description?: string;
  categoryLabel?: string;
  /** 后端是否给出该牌的合法动作 */
  useEnabled: boolean;
  /** 「使用卡牌」按下的结果（由 battle.tsx 按该牌的动作类型分派） */
  useHint?: string;
  submitting?: boolean;
  onUse: () => void;
  onClose: () => void;
}) {
  return (
    <GameModal
      open={open}
      title={name}
      subtitle={subtitle}
      onClose={onClose}
      testID="modal-card-action"
      footer={
        <View style={styles.footerRow}>
          <SecondaryButton fullWidth={false} style={styles.footerItem} onPress={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton
            fullWidth={false}
            style={styles.footerItem}
            disabled={!useEnabled || submitting}
            onPress={onUse}
          >
            使用卡牌
          </PrimaryButton>
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.cardWrap}>
          <SoftGlow color={jade[400]} opacity={0.3} style={styles.glow} />
          <GameCard cardId={cardId} name={name} subtitle={subtitle} size="lg" style={styles.card} />
        </View>

        <View style={styles.tags}>
          {categoryLabel ? <StatusTag tone="gold">{categoryLabel}</StatusTag> : null}
          {subtitle ? <StatusTag tone="jade">{subtitle}</StatusTag> : null}
          {!useEnabled ? <StatusTag tone="muted">未开放</StatusTag> : null}
        </View>

        <Panel>
          <Text style={styles.panelTitle} allowFontScaling={false}>
            卡牌效果
          </Text>
          <GoldHairline style={styles.panelRule} />
          <Text style={styles.panelBody} allowFontScaling={false}>
            {description ?? '后端未提供该牌的效果说明。'}
          </Text>
        </Panel>

        <Text style={styles.hint} allowFontScaling={false}>
          {useEnabled
            ? (useHint ?? '按「使用卡牌」提交后端为该牌给出的合法动作。')
            : '当前局面该牌没有可用动作（未开放），仅可查看。'}
        </Text>
      </View>
    </GameModal>
  );
}

const styles = StyleSheet.create({
  body: { gap: sp(4) },
  cardWrap: { alignSelf: 'center', position: 'relative' },
  glow: { top: -sp(6), left: -sp(6), right: -sp(6), bottom: -sp(6) },
  card: { width: 248, height: (248 * 4) / 3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), justifyContent: 'center' },
  panelTitle: { ...serif(600), fontSize: 15, letterSpacing: track(0.14, 15), color: '#e8d5a8' },
  panelRule: { marginTop: sp(2), marginBottom: sp(2) },
  panelBody: { ...sans(400), fontSize: 13, lineHeight: 20, color: creamDim },
  hint: {
    ...sans(400),
    fontSize: 10,
    letterSpacing: track(0.025, 10),
    color: creamFaint,
    textAlign: 'center',
  },
  /** RN 的 flexShrink 默认 0，两个按钮必须显式 flex:1 才能平分（参考靠 CSS flex-shrink 实现） */
  footerRow: { flex: 1, flexDirection: 'row', gap: sp(3) },
  footerItem: { flex: 1 },
});

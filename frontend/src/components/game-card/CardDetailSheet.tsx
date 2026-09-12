import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, categoryColors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { CardCategory } from '@/types/card';
import { CATEGORY_LABELS, cardSpecOf } from '@/utils/card-catalog';

import { GameCard } from './GameCard';

interface CardDetailSheetProps {
  visible: boolean;
  cardId?: string | null;
  name?: string;
  category?: CardCategory | string | null;
  description?: string;
  /** 只有存在对应 legal action 时才由调用方传入（FRONTEND_GUIDE §4.4） */
  actionLabel?: string;
  actionHint?: string;
  onConfirm?: () => void;
  onClose: () => void;
  disabled?: boolean;
  cardWidth?: number;
}

/** 手牌详情：插画 / 卡名 / 类型 / 效果说明 / 确认使用 / 取消 */
export function CardDetailSheet({
  visible,
  cardId,
  name,
  category,
  description,
  actionLabel,
  actionHint,
  onConfirm,
  onClose,
  disabled = false,
  cardWidth = 168,
}: CardDetailSheetProps) {
  const spec = cardSpecOf(cardId ?? undefined);
  const resolvedCategory = (category ?? spec?.category ?? 'ACTIVE') as CardCategory;
  const palette = categoryColors[resolvedCategory] ?? categoryColors.ACTIVE;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭卡牌详情"
        />
        <Panel tone="surface" title="卡牌详情" style={styles.sheet}>
          <View style={styles.body}>
            {cardId ? (
              <GameCard
                cardId={cardId}
                name={name ?? spec?.name}
                category={resolvedCategory}
                size="detail"
                width={cardWidth}
                height={Math.round(cardWidth / 0.68)}
              />
            ) : null}

            <View style={styles.info}>
              <Text style={styles.name}>{name ?? spec?.name ?? '未知卡牌'}</Text>
              <Text style={[styles.category, { color: palette.border }]}>
                {CATEGORY_LABELS[resolvedCategory] ?? resolvedCategory}
              </Text>
              <Text style={styles.description}>
                {description ?? spec?.description ?? '暂无说明。'}
              </Text>
              {actionLabel ? (
                <Text style={styles.actionHint}>
                  {actionHint ?? '该动作由后端 legal_actions 提供'}
                </Text>
              ) : (
                <Text style={styles.disabledHint}>
                  当前局面没有这张牌的合法动作，无法使用（规则以后端为准）。
                </Text>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <PrimaryButton label="取消" variant="ghost" onPress={onClose} testID="card-cancel" />
            </View>
            {actionLabel && onConfirm ? (
              <View style={styles.footerItem}>
                <PrimaryButton
                  label={actionLabel}
                  variant="gold"
                  disabled={disabled}
                  onPress={onConfirm}
                  testID="card-confirm"
                />
              </View>
            ) : null}
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
  },
  body: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  info: {
    flex: 1,
    minWidth: 180,
  },
  name: {
    ...text.heading,
  },
  category: {
    ...text.label,
    marginTop: spacing.xxs,
    letterSpacing: 2,
  },
  description: {
    ...text.body,
    marginTop: spacing.sm,
  },
  actionHint: {
    ...text.label,
    color: colors.goldLight,
    marginTop: spacing.md,
  },
  disabledHint: {
    ...text.label,
    color: colors.danger,
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  footerItem: {
    flex: 1,
  },
});

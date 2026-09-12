/**
 * 手牌详情 / 施法确认（fig3_2 的夜间版）。
 *
 * 行为铁律不变：**只有 legal_actions 里存在对应动作时**调用方才会传 `actionLabel`，
 * 本组件绝不自行判断「这张牌能不能出」。
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NightButton } from '@/components/ui/NightButton';
import { NightTag } from '@/components/ui/NightTag';
import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { CardCategory } from '@/types/card';
import { CATEGORY_LABELS, cardSpecOf } from '@/utils/card-catalog';

import { GameCard } from './GameCard';

interface CardDetailSheetProps {
  visible: boolean;
  cardId?: string | null;
  name?: string;
  category?: CardCategory | string | null;
  description?: string;
  /** 只有存在对应 legal action 时才由调用方传入 */
  actionLabel?: string;
  actionHint?: string;
  onConfirm?: () => void;
  onClose: () => void;
  disabled?: boolean;
  cardWidth?: number;
}

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
  cardWidth = 132,
}: CardDetailSheetProps) {
  const spec = cardSpecOf(cardId ?? undefined);
  const resolvedCategory = (category ?? spec?.category ?? 'ACTIVE') as CardCategory;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭卡牌详情"
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} allowFontScaling={false}>
              {name ?? spec?.name ?? '未知卡牌'}
            </Text>
            <NightTag label={CATEGORY_LABELS[resolvedCategory] ?? resolvedCategory} tone="gold" />
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {cardId ? (
              <GameCard
                cardId={cardId}
                name={name ?? spec?.name}
                category={resolvedCategory}
                size="detail"
                state={actionLabel ? 'playable' : 'idle'}
                width={cardWidth}
                height={Math.round(cardWidth / 0.648)}
              />
            ) : null}

            <View style={styles.info}>
              <Text style={styles.sectionLabel} allowFontScaling={false}>
                效果
              </Text>
              <View style={styles.descBox}>
                <Text style={styles.description} allowFontScaling={false}>
                  {description ?? spec?.description ?? '暂无说明。'}
                </Text>
              </View>
              {actionLabel ? (
                <Text style={styles.actionHint} allowFontScaling={false}>
                  {actionHint ?? '该动作由后端 legal_actions 提供'}
                </Text>
              ) : (
                <Text style={styles.disabledHint} allowFontScaling={false}>
                  当前局面没有这张牌的合法动作，无法使用（规则以后端为准）。
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <NightButton
              label="收回法术"
              variant="ghost"
              onPress={onClose}
              testID="card-cancel"
              height={44}
              style={styles.footerItem}
            />
            {actionLabel && onConfirm ? (
              <NightButton
                label={actionLabel}
                variant="gold"
                disabled={disabled}
                onPress={onConfirm}
                testID="card-confirm"
                height={44}
                glyph="施"
                style={styles.footerItem}
              />
            ) : (
              <NightButton
                label="施展法术"
                variant="gold"
                disabled
                onPress={() => undefined}
                hint="当前局面该牌没有合法动作"
                height={44}
                style={styles.footerItem}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: nightColors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '86%',
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.cardEdgeSoft,
    backgroundColor: 'rgba(19, 35, 47, 0.97)',
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: 18,
    fontWeight: '700',
    color: nightColors.celadonLight,
    letterSpacing: 2,
  },
  body: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
  },
  info: {
    flex: 1,
    minWidth: 150,
  },
  sectionLabel: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    letterSpacing: 2,
    marginBottom: 4,
  },
  descBox: {
    borderRadius: radius.sm,
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(201, 166, 90, 0.35)',
    backgroundColor: 'rgba(245, 230, 200, 0.92)',
    padding: 8,
  },
  description: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 19,
    color: '#2A1E0B',
  },
  actionHint: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.cardEdge,
    marginTop: 8,
  },
  disabledHint: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.dangerText,
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  footerItem: {
    flex: 1,
  },
});

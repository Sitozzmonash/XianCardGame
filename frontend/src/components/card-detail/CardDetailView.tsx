import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useResponsive } from '@/hooks/use-responsive';
import { nightColors, nightGradients } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';
import type { CardSpec } from '@/types/card';

import { CardFace } from './CardFace';
import { RelatedCards } from './RelatedCards';
import { CARD_FACE, EFFECT_PANEL, DETAIL_ACTIONS, cardQuoteOf, relatedCardsOf } from './card-visuals';

export interface PrimaryAction {
  /** 设计稿文案「施展法术」；有 legal_actions 对应动作时才可点（DESIGN_SPEC §4） */
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** 不可用原因（可访问性：不只靠颜色） */
  hint?: string;
}

interface CardDetailViewProps {
  card: CardSpec;
  /** 同一份 GET /cards 列表，用于「相关卡牌」（同 category） */
  allCards?: CardSpec[];
  onBack: () => void;
  onSelectRelated?: (card: CardSpec) => void;
  primaryAction?: PrimaryAction;
  footnote?: string;
  /** 顶部返回键文案（设计稿只有返回，没有标题） */
  backLabel?: string;
}

/**
 * 「卡牌详情」（fig3_2 1:1）：
 *   顶部返回 → 米黄大卡面（金边圆角）→ 效果说明米黄面板 → 引语 →
 *   「相关卡牌」小卡一行 → 底部「收回法术」（次）/「施展法术」（主）。
 * 几何取自 docs/design_measurements.md 的实测值（1x）。
 */
export function CardDetailView({
  card,
  allCards = [],
  onBack,
  onSelectRelated,
  primaryAction,
  footnote,
  backLabel = '‹ 返回',
}: CardDetailViewProps) {
  const layout = useResponsive();
  const faceWidth = Math.min(CARD_FACE.width, Math.round(layout.contentWidth * 0.64));
  const scale = faceWidth / CARD_FACE.width;
  const s = (value: number) => Math.round(value * scale * 10) / 10;

  const quote = cardQuoteOf(card.id);
  const related = relatedCardsOf(allCards, card);
  const primary = primaryAction ?? { label: '施展法术', disabled: true };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      testID="card-detail"
    >
      {/* 顶部：设计稿 y 62-76 只有左侧返回（金色） */}
      <View style={styles.header}>
        <Pressable
          testID="detail-back"
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
          style={styles.back}
        >
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      </View>

      {/* 大卡面：设计 y 111 */}
      <CardFace card={card} width={faceWidth} style={styles.face} testID="detail-card-face" />

      {/* 效果说明面板：设计 x 25-405 / y 473-592（金线 472 / 592） */}
      <View
        style={[styles.effectPanel, { marginTop: s(28), padding: EFFECT_PANEL.pad }]}
        testID="detail-effect-panel"
      >
        <Text style={styles.effectTitle}>卡牌效果</Text>
        <Text style={styles.effectBody}>{card.description}</Text>
        {quote ? (
          <View style={styles.quoteWrap}>
            <View style={styles.quoteLine} />
            <Text style={styles.quoteText}>{quote}</Text>
          </View>
        ) : null}
      </View>

      {/* 相关卡牌：设计标题 y 744-756，小卡 y 766-811 */}
      <View style={styles.relatedHeader}>
        <Text style={styles.relatedTitle}>相关卡牌</Text>
        <Text style={styles.relatedHint}>同类型</Text>
      </View>
      <RelatedCards
        cards={related}
        cardWidth={RELATED_WIDTH}
        selectedId={card.id}
        onSelect={onSelectRelated}
      />

      <View style={styles.spacer} />

      {primary.hint ? (
        <Text style={[styles.actionHint, primary.disabled ? styles.actionHintDisabled : null]}>
          {primary.hint}
        </Text>
      ) : null}

      {/* 底部按钮：设计 y 826-869，次按钮 x 25-205、主按钮 x 221-405 */}
      <View style={styles.actions}>
        <Pressable
          testID="detail-cancel"
          accessibilityRole="button"
          accessibilityLabel="收回法术"
          onPress={onBack}
          style={[styles.button, styles.buttonGhost]}
        >
          <Text style={styles.buttonGhostLabel}>收回法术</Text>
        </Pressable>

        <Pressable
          testID="detail-confirm"
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          accessibilityState={{ disabled: primary.disabled === true }}
          accessibilityHint={primary.hint}
          disabled={primary.disabled === true}
          onPress={primary.onPress}
          style={styles.button}
        >
          <LinearGradient
            colors={
              primary.disabled ? [nightColors.surface, nightColors.backgroundDeep] : nightGradients.jadeButton
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.buttonGradient,
              { borderColor: primary.disabled ? nightColors.disabled : nightColors.cardEdge },
            ]}
          >
            <Text
              style={[
                styles.buttonPrimaryLabel,
                primary.disabled ? styles.buttonPrimaryLabelDisabled : null,
              ]}
            >
              {primary.label}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </ScrollView>
  );
}

/** 相关小卡宽度：430 宽屏下正好四张一行（25 + 4×87.5 + 3×10 + 25 = 430） */
const RELATED_WIDTH = 87.5;

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: DETAIL_ACTIONS.marginH,
    paddingBottom: spacing.lg,
  },
  header: {
    height: 108,
    width: '100%',
    justifyContent: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    minHeight: 32,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: nightColors.gold,
    letterSpacing: 2,
  },
  face: {
    marginTop: 3,
  },
  effectPanel: {
    width: '100%',
    maxWidth: 405,
    minHeight: EFFECT_PANEL.height,
    borderRadius: EFFECT_PANEL.radius,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.cardEdgeSoft,
    backgroundColor: nightColors.card,
  },
  effectTitle: {
    fontSize: EFFECT_PANEL.titleSize,
    fontFamily: fontFamily.body,
    fontWeight: '600',
    letterSpacing: 1,
    color: nightColors.backgroundDeep,
  },
  effectBody: {
    fontSize: EFFECT_PANEL.bodySize,
    fontFamily: fontFamily.body,
    lineHeight: 21,
    color: nightColors.backgroundDeep,
    marginTop: 10,
  },
  quoteWrap: {
    marginTop: 14,
  },
  quoteLine: {
    height: borderWidth.hair,
    backgroundColor: nightColors.cardEdgeSoft,
    marginBottom: 9,
  },
  quoteText: {
    fontSize: EFFECT_PANEL.quoteSize,
    fontFamily: fontFamily.title,
    color: nightColors.muted,
    letterSpacing: 1,
  },
  relatedHeader: {
    width: '100%',
    maxWidth: 405,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 10,
  },
  relatedTitle: {
    fontFamily: fontFamily.title,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
    color: nightColors.gold,
  },
  relatedHint: {
    fontSize: 10,
    fontFamily: fontFamily.body,
    color: nightColors.muted,
    letterSpacing: 1,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.md,
  },
  actionHint: {
    fontSize: 11,
    fontFamily: fontFamily.body,
    color: nightColors.celadonLight,
    textAlign: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  actionHintDisabled: {
    color: nightColors.muted,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 405,
    gap: DETAIL_ACTIONS.gap,
    marginTop: 15,
  },
  button: {
    flex: 1,
    height: DETAIL_ACTIONS.height,
    borderRadius: DETAIL_ACTIONS.radius,
    overflow: 'hidden',
  },
  buttonGhost: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: nightColors.surface,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.border,
  },
  buttonGhostLabel: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    color: nightColors.celadonLight,
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hair,
    borderRadius: DETAIL_ACTIONS.radius,
  },
  buttonPrimaryLabel: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    color: nightColors.white,
  },
  buttonPrimaryLabelDisabled: {
    color: nightColors.muted,
  },
  footnote: {
    ...text.label,
    fontSize: 10,
    color: nightColors.muted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});

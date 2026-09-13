/**
 * 「卡牌详情」屏 —— 参考原型 `docs/reference-next/components/screens/CardDetailScreen.tsx`（共 65 行）
 * 的 RN 1:1 移植。逐行对应关系：
 *
 *  | 参考行号 | 参考代码 | 本文件 |
 *  |---|---|---|
 *  | 23–25 | `flex h-full flex-col` + `GameBackdrop variant="plain"` | `<ScreenShell>` |
 *  | 26 | `TopBar eyebrow="卡牌玄妙" title={card.name} onBack` | 同参 |
 *  | 28 | `flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-5` | `<ScrollBody>`（默认 gap 20 / pt 20 / pb 24，与参考一致） |
 *  | 29–34 | 居中大卡 + `absolute -inset-6 rounded-full bg-jade-500/15 blur-2xl` | `styles.stage` → `JadeGlow`（RN 无 CSS blur，用 SVG 径向渐变圆近似，见 `docs/FRONTEND_PORT_SPEC.md` §3） |
 *  | 36–40 | 三个 `StatusTag`（jade 类别 / gold 副标题 / muted 品质） | `styles.tagRow` + 同 tone |
 *  | 42–47 | `Panel className="space-y-3"`：`卡牌效果` + 描述 13px/1.625 + `gold-hairline opacity-60` + 引语 12px 斜体 | `styles.panelBody`（gap 12）+ `GoldHairline opacity={0.6}` |
 *  | 49–56 | `相关对局卡牌` + 横滑 4 张 `GameCard size="sm"` | `styles.relatedBlock` + 横向 `ScrollView`（`gap-2.5` = 10） |
 *  | 59–62 | 底栏两列 `取消` / `使用卡牌`（`border-t gold-500/15`、`bg-ink-950/70`、`backdrop-blur-sm`、`px-5 py-4`） | `<BottomBar>`（骨架里已复刻该底栏）+ `styles.actions` 两列 |
 *
 * 文案来源：`card.description` 来自真实 `GET /cards`（效果说明，唯一权威）；
 * `subtitle` / `flavor` / `rarity` 来自参考原型 `game-data.ts`，见 `card-meta.ts` 的说明。
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { GameCard } from '@/components/ref/GameCard';
import { BottomBar, ScrollBody, ScreenShell } from '@/components/ref/ScreenShell';
import {
  GoldHairline,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatusTag,
  TopBar,
} from '@/components/ref/primitives';
import { cream, creamFaint, jade, radius, sp } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

import { categoryLabelOf, relatedCards, type CatalogCard } from './card-meta';

/**
 * 大卡背后的玉绿光晕。参考 `absolute -inset-6 rounded-full bg-jade-500/15 blur-2xl`：
 * 四周各外扩 24px 的圆形光斑，被 40px 的模糊柔化。RN 没有 CSS blur，
 * 按移植规格 §3 用 SVG 径向渐变（中心 15% 不透明 → 边缘全透明）近似。
 * 颜色按规格 §1 的换算表：`bg-jade-500/15` = `rgba(53,161,132,0.15)`。
 */
function JadeGlow() {
  return (
    <View pointerEvents="none" style={styles.glow}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="card-detail-jade-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={jade[400]} stopOpacity={0.15} />
            <Stop offset="45%" stopColor={jade[400]} stopOpacity={0.11} />
            <Stop offset="100%" stopColor={jade[400]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#card-detail-jade-glow)" />
      </Svg>
    </View>
  );
}

export interface CardDetailScreenProps {
  card: CatalogCard;
  /** 图鉴全量（来自 `GET /cards`），用于「相关对局卡牌」 */
  allCards: CatalogCard[];
  /** 底栏「取消」与页头返回 */
  onBack: () => void;
  /** 底栏「使用卡牌」（路由层决定是回对局页选牌还是回图鉴） */
  onUse: () => void;
  /** 点击相关小卡 → 切换当前详情 */
  onSelectCard: (cardId: string) => void;
}

export function CardDetailScreen({
  card,
  allCards,
  onBack,
  onUse,
  onSelectCard,
}: CardDetailScreenProps) {
  const related = relatedCards(allCards, card);

  return (
    <ScreenShell>
      <TopBar eyebrow="卡牌玄妙" title={card.name} onBack={onBack} />

      <ScrollBody>
        {/* 居中大卡 + 背后玉绿光晕 */}
        <View style={styles.stage}>
          <View style={styles.cardStack}>
            <JadeGlow />
            <GameCard
              testID={`detail-card-${card.id}`}
              cardId={card.id}
              name={card.name}
              subtitle={card.subtitle}
              size="lg"
            />
          </View>
        </View>

        {/* 类别 / 副标题 / 品质 */}
        <View style={styles.tagRow}>
          <StatusTag tone="jade">{categoryLabelOf(card.category)}</StatusTag>
          {card.subtitle ? <StatusTag tone="gold">{card.subtitle}</StatusTag> : null}
          {card.rarity ? <StatusTag tone="muted">{card.rarity}</StatusTag> : null}
        </View>

        {/* 卡牌效果 */}
        <Panel>
          <View style={styles.panelBody}>
            <SectionTitle>卡牌效果</SectionTitle>
            <Text allowFontScaling={false} style={styles.effect}>
              {card.description}
            </Text>
            <GoldHairline opacity={0.6} />
            {card.flavor ? (
              <Text allowFontScaling={false} style={styles.flavor}>
                {card.flavor}
              </Text>
            ) : null}
          </View>
        </Panel>

        {/* 相关对局卡牌 */}
        <View style={styles.relatedBlock}>
          <SectionTitle>相关对局卡牌</SectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.relatedRow}
          >
            {related.map((item) => (
              <GameCard
                key={item.id}
                testID={`related-card-${item.id}`}
                cardId={item.id}
                name={item.name}
                size="sm"
                onPress={() => onSelectCard(item.id)}
              />
            ))}
          </ScrollView>
        </View>
      </ScrollBody>

      {/* 底栏两列：取消 / 使用卡牌（参考 `grid-cols-2 gap-3`） */}
      <BottomBar>
        <View style={styles.actions}>
          <SecondaryButton style={styles.actionButton} onPress={onBack}>
            取消
          </SecondaryButton>
          <PrimaryButton style={styles.actionButton} onPress={onUse}>
            使用卡牌
          </PrimaryButton>
        </View>
      </BottomBar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center' },
  cardStack: {},

  /** `-inset-6 rounded-full`（外扩 24px 的圆形光斑） */
  glow: {
    position: 'absolute',
    top: -sp(6),
    left: -sp(6),
    right: -sp(6),
    bottom: -sp(6),
    borderRadius: radius.full,
    overflow: 'hidden',
  },

  // 参考 `justify-center gap-2`
  tagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2), flexWrap: 'wrap' },

  // 参考 `Panel className="space-y-3"`（gap 12）
  panelBody: { gap: sp(3) },
  /** `font-sans text-[13px] leading-relaxed text-cream` */
  effect: { ...sans(400), fontSize: 13, lineHeight: 13 * 1.625, color: cream },
  /** `font-serif text-[12px] italic leading-relaxed text-cream-faint` */
  flavor: { ...serif(400), fontSize: 12, fontStyle: 'italic', lineHeight: 12 * 1.625, color: creamFaint },

  relatedBlock: { gap: sp(3) },
  // 参考 `gap-2.5 overflow-x-auto pb-1`
  relatedRow: { gap: sp(2.5), paddingBottom: sp(1) },

  actions: { flexDirection: 'row', gap: sp(3) },
  actionButton: { flex: 1 },
});

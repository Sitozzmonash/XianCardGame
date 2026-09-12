import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchCards } from '@/api/game';
import {
  CardDetailView,
  CardFace,
  NightStage,
  typeGlyphOf,
  typeLabelOf,
  typeTintOf,
} from '@/components/card-detail';
import type { PrimaryAction } from '@/components/card-detail';
import { useResponsive } from '@/hooks/use-responsive';
import { useGameStore } from '@/store/game-store';
import { nightColors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { CardCategory, CardSpec } from '@/types/card';
import { CARD_SPECS_FALLBACK } from '@/utils/card-catalog';
import { directActionForCard, targetActionsForCard } from '@/utils/legal-actions';

const CATEGORY_ORDER: CardCategory[] = ['TRIBULATION', 'DEFUSE', 'ACTIVE', 'REACTIVE'];

/**
 * 「卡牌图鉴」`/cards`（设计稿没有这一屏，因此**沿用卡牌详情同一套视觉体系**：
 * 夜蓝底 + 米黄金边卡面 + 类型符点）。
 * 数据源：GET /cards（API_CONTRACT §18）；后端不可用时用本地静态 metadata 兜底并明确标注。
 * 点击任意卡 → 同一个路由带 `cardId` 参数进入「卡牌详情」（fig3_2 1:1）。
 */
export default function CardsScreen() {
  const params = useLocalSearchParams<{ cardId?: string }>();
  const layout = useResponsive();
  const view = useGameStore((state) => state.view);
  const submitAction = useGameStore((state) => state.submitAction);
  const mockMode = useGameStore((state) => state.mockMode);

  const [cards, setCards] = useState<CardSpec[]>(CARD_SPECS_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'api' | 'local'>('local');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchCards()
      .then((list) => {
        if (!mounted) return;
        if (list.length > 0) {
          setCards(list);
          setSource('api');
        } else {
          setCards(CARD_SPECS_FALLBACK);
          setSource('local');
        }
      })
      .catch(() => {
        if (!mounted) return;
        // GET /cards 不可用（后端未就绪）→ 用本地静态 metadata 兜底
        setCards(CARD_SPECS_FALLBACK);
        setSource('local');
        setError('未能从 GET /cards 读取卡表，已使用本地静态 metadata。');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...cards].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      ),
    [cards],
  );

  const selected = params.cardId ? cards.find((card) => card.id === params.cardId) : undefined;
  const sourceLabel =
    source === 'local'
      ? '本地静态 metadata（GET /cards 不可用时的兜底）'
      : mockMode
        ? 'GET /cards（mock 演示数据）'
        : 'GET /cards（后端实时）';

  const backToCatalog = () => router.replace('/cards');

  /** 「施展法术」= 确认使用；只有 view.legal_actions 里存在该牌的合法动作时才可点（DESIGN_SPEC §4） */
  const primaryAction: PrimaryAction = useMemo(() => {
    if (!selected) return { label: '施展法术', disabled: true };
    const instances =
      view?.observation.hand.filter((card) => card.card_id === selected.id) ?? [];
    const direct = instances
      .map((instance) => ({ instance, action: directActionForCard(view, instance.instance_id) }))
      .find((entry) => entry.action);
    if (direct?.action) {
      const actionId = direct.action.id;
      return {
        label: '施展法术',
        disabled: false,
        hint: '提交后端为该牌给出的合法动作（PLAY_CARD）',
        onPress: () => {
          void submitAction(actionId).then(() => router.replace('/battle'));
        },
      };
    }
    const needsTarget = instances.some(
      (instance) => targetActionsForCard(view, instance.instance_id).length > 0,
    );
    if (needsTarget) {
      return {
        label: '施展法术',
        disabled: true,
        hint: '该牌需要选择目标：请回到牌局中使用（目标列表由 legal_actions 提供）',
      };
    }
    return {
      label: '施展法术',
      disabled: true,
      hint: view
        ? '当前局面没有这张牌的合法动作（规则以后端为准）'
        : '图鉴为只读页：开局后可在牌局中按 legal_actions 施展',
    };
  }, [selected, view, submitAction]);

  if (selected) {
    return (
      <NightStage>
        <Head>
          <title>{selected.name} · 卡牌详情 · 修仙卡牌</title>
        </Head>
        <CardDetailView
          card={selected}
          allCards={cards}
          backLabel="‹ 返回图鉴"
          onBack={backToCatalog}
          onSelectRelated={(card) => router.setParams({ cardId: card.id })}
          primaryAction={primaryAction}
          footnote={`卡牌数据来源：${sourceLabel}；卡牌效果由后端规则引擎执行，前端只展示说明文本。`}
        />
      </NightStage>
    );
  }

  const columns = layout.isWide ? 3 : 2;
  const usable = layout.contentWidth - spacing.lg * 2;
  const itemWidth = Math.floor((usable - spacing.md * (columns - 1)) / columns);
  const faceWidth = Math.min(itemWidth - 4, 240);

  return (
    <NightStage>
      <Head>
        <title>卡牌图鉴 · 修仙卡牌</title>
      </Head>
      <View style={styles.header}>
        <Pressable
          testID="catalog-back"
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.replace('/')}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>卡牌图鉴</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{`共 ${cards.length} 张`}</Text>
        </View>
        <View style={[styles.chip, source === 'api' ? styles.chipJade : styles.chipMuted]}>
          <Text style={[styles.chipText, source === 'api' ? styles.chipTextJade : null]}>
            {`来源 ${sourceLabel}`}
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={styles.error} testID="catalog-error">
          {error}
        </Text>
      ) : null}
      {loading ? <Text style={styles.loading}>正在读取卡表…</Text> : null}

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        key={`cols-${columns}`}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            testID={`catalog-card-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`查看 ${item.name} 的卡牌详情`}
            onPress={() => router.setParams({ cardId: item.id })}
            style={[styles.item, { width: itemWidth }]}
          >
            <CardFace card={item} width={faceWidth} />
            <View style={styles.itemMeta}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.typeRow}>
                <View
                  style={[
                    styles.typeDot,
                    { backgroundColor: typeTintOf(item.category as CardCategory) },
                  ]}
                >
                  <Text style={styles.typeDotGlyph}>
                    {typeGlyphOf(item.category as CardCategory)}
                  </Text>
                </View>
                <Text style={styles.typeLabel}>{typeLabelOf(item.category as CardCategory)}</Text>
              </View>
              <Text style={styles.itemDesc} numberOfLines={3}>
                {item.description}
              </Text>
              <Text style={styles.itemCta}>查看详情 ›</Text>
            </View>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          数据来源：{sourceLabel}；卡牌效果由后端 Python 规则引擎执行，本页只展示说明文本。
        </Text>
      </View>
    </NightStage>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  back: {
    minWidth: 88,
  },
  backText: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    letterSpacing: 2,
    color: nightColors.gold,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    color: nightColors.celadonLight,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  chip: {
    borderWidth: borderWidth.hair,
    borderColor: nightColors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipJade: {
    borderColor: nightColors.borderStrong,
  },
  chipMuted: {
    borderColor: nightColors.hairline,
  },
  chipText: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    letterSpacing: 1,
    color: nightColors.muted,
  },
  chipTextJade: {
    color: nightColors.jade,
  },
  error: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: nightColors.danger,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  loading: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: nightColors.muted,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  column: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  item: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.hairline,
    backgroundColor: nightColors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  itemMeta: {
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  itemName: {
    fontFamily: fontFamily.title,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    color: nightColors.card,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  typeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeDotGlyph: {
    fontFamily: fontFamily.title,
    fontSize: 9,
    fontWeight: '700',
    color: nightColors.white,
  },
  typeLabel: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    letterSpacing: 1,
    color: nightColors.celadon,
  },
  itemDesc: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    lineHeight: 15,
    color: nightColors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  itemCta: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    letterSpacing: 1,
    color: nightColors.gold,
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  footerText: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    lineHeight: 15,
    color: nightColors.muted,
  },
});

/**
 * 「卡牌图鉴」屏 —— 参考原型 `docs/reference-next/components/screens/CollectionScreen.tsx`（共 51 行）
 * 的 RN 1:1 移植。逐行对应关系：
 *
 *  | 参考行号 | 参考代码 | 本文件 |
 *  |---|---|---|
 *  | 24 | `relative flex h-full flex-col overflow-hidden` | `<ScreenShell>`（`ScreenShell.tsx`：背景三件套 + 安全区） |
 *  | 25 | `<GameBackdrop variant="plain" />` | `ScreenShell` 内建（`variant="plain"` 为默认值） |
 *  | 27 | `TopBar eyebrow="藏经阁" title="卡牌图鉴" onBack` | `styles.filterRow` 之上，参数同名 |
 *  | 29–37 | `px-5 pt-4` + `SegmentedSelector size="sm"`（全部/主动/防御/天劫） | `<View style={styles.filterRow}>` + 同参 |
 *  | 39 | `flex-1 overflow-y-auto px-5 pb-6 pt-4` | `<ScrollBody style={styles.body} contentStyle={styles.bodyContent}>` |
 *  | 40–43 | `grid grid-cols-2 gap-3.5` + `GameCard size="md"` | `styles.grid`（间距 14；RN 的 `flexWrap` 行内子项必须显式宽度，故用 `onLayout` 量出列宽 = (宽 − 14) / 2） |
 *  | 45–47 | 底部 `text-[10px] tracking-[0.2em] text-cream-faint` 计数 | `styles.footnote`（10px / 字距 0.2em / `creamFaint`） |
 *
 * 数据：`cards` 来自真实 `GET /cards`（在路由文件里经 `useCardCatalog()` 取），
 * 失败态由 `CatalogError` 呈现（不造假数据）。
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameCard } from '@/components/ref/GameCard';
import { ScrollBody, ScreenShell } from '@/components/ref/ScreenShell';
import { SegmentedSelector, TopBar } from '@/components/ref/primitives';
import { creamFaint, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

import { CARD_FILTERS, CARD_FILTER_LABEL, filterCards, type CardFilter, type CatalogCard } from './card-meta';
import { CatalogError, CatalogLoading } from './catalog-status';
import type { CatalogErrorInfo } from './use-card-catalog';

/** 参考 `gap-3.5` = 14px */
const GRID_GAP = 14;

export interface CollectionScreenProps {
  cards: CatalogCard[];
  loading?: boolean;
  error?: CatalogErrorInfo;
  /** 失败态的重试（真实重新请求 `GET /cards`） */
  onRetry?: () => void;
  onBack: () => void;
  onSelectCard: (cardId: string) => void;
}

export function CollectionScreen({
  cards,
  loading = false,
  error,
  onRetry,
  onBack,
  onSelectCard,
}: CollectionScreenProps) {
  const [filter, setFilter] = useState<CardFilter>('all');
  const [gridWidth, setGridWidth] = useState(0);

  const visible = filterCards(cards, filter);
  const columnWidth = gridWidth > 0 ? (gridWidth - GRID_GAP) / 2 : 0;
  const failed = Boolean(error) && !loading;

  return (
    <ScreenShell>
      <TopBar eyebrow="藏经阁" title="卡牌图鉴" onBack={onBack} />

      <View style={styles.filterRow}>
        <SegmentedSelector
          size="sm"
          options={CARD_FILTERS}
          value={filter}
          onChange={setFilter}
          formatLabel={(value) => CARD_FILTER_LABEL[value]}
        />
      </View>

      <ScrollBody style={styles.body} contentStyle={styles.bodyContent} gap={0}>
        {failed && error ? (
          <CatalogError title={error.title} detail={error.detail} onRetry={onRetry} />
        ) : loading ? (
          <CatalogLoading />
        ) : (
          <>
            <View
              style={styles.grid}
              onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
            >
              {columnWidth > 0
                ? visible.map((card) => (
                    <GameCard
                      key={card.id}
                      testID={`catalog-card-${card.id}`}
                      cardId={card.id}
                      name={card.name}
                      subtitle={card.subtitle}
                      size="md"
                      style={{ width: columnWidth }}
                      onPress={() => onSelectCard(card.id)}
                    />
                  ))
                : null}
            </View>

            <Text allowFontScaling={false} style={styles.footnote}>
              {`共 ${visible.length} 张 · 天命既定，亦可改之`}
            </Text>
          </>
        )}
      </ScrollBody>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  // 参考 `px-5 pt-4`
  filterRow: { paddingHorizontal: sp(5), paddingTop: sp(4) },
  // 参考 `px-5 pb-6 pt-4`：`ScrollBody` 默认已有 px-5，这里把默认的 pt-5 归零、底部留 pb-6
  body: { paddingTop: 0 },
  bodyContent: { gap: 0, paddingTop: sp(4), paddingBottom: sp(6) },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },

  // 参考 `mt-5 text-center font-sans text-[10px] tracking-[0.2em] text-cream-faint`
  footnote: {
    ...sans(400),
    fontSize: 10,
    letterSpacing: track(0.2, 10),
    color: creamFaint,
    textAlign: 'center',
    marginTop: sp(5),
  },
});

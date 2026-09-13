/**
 * 战场区 —— 参考 `BattleScreen.tsx` 第 55–70 行原样移植。
 *
 *   第 57 行 法阵：`left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2`（RN 用 inset 0 + 居中代替 translate）
 *   第 59-61 行 左上 `DeckPile`：`absolute left-4 top-3`
 *   第 62-64 行 右上 `DiscardPile`：`absolute right-4 top-3`
 *   第 66-69 行 中央：`20px serif 700 tracking-[0.2em] text-gold-300 text-glow-gold`「行动阶段」
 *              + `mt-1.5 10px sans tracking-wider text-cream-dim`「可使用卡牌或结束回合」
 *
 * 数据（铁律 3）：牌堆 / 弃牌堆数字一律用 `public.deck_count` / `public.discard_count`，
 * 弃牌堆顶牌用 `public.last_discard` 的 card_id 取美术。
 *
 * 额外（铁律 4 的落点）：`observation.known_top` 是**本人私有**的观星结果 —— 参考原型没有这个元素，
 * 这里做成牌堆下方的一枚小签（只有本人视图才有 `known_top`，他人视图后端不会下发），
 * 让「观星术」在当前引擎（只看不改序）下有可见结果，而不是点了没反应。
 */

import { StyleSheet, Text, View } from 'react-native';

import { MagicCircle } from '@/components/ref/Backdrop';
import { DeckPile, DiscardPile } from '@/components/ref/Piles';
import { gold, creamDim, creamFaint, ink, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';
import { cardNameOf } from '@/utils/card-catalog';
import type { KnownTopCard } from '@/types/card';

export function Battlefield({
  phaseLabel,
  phaseHint,
  deckCount,
  discardCount,
  lastDiscard,
  knownTop,
}: {
  phaseLabel: string;
  phaseHint: string;
  deckCount: number;
  discardCount: number;
  lastDiscard?: string | null;
  /** 只有本人视图会带 `observation.known_top` */
  knownTop: KnownTopCard[];
}) {
  return (
    <View style={styles.wrap}>
      {/* 法阵：360×360 居中 */}
      <View pointerEvents="none" style={styles.circle}>
        <MagicCircle size={360} />
      </View>

      {/* 左上牌堆 + 私有牌顶信息 */}
      <View style={styles.deckSlot}>
        <DeckPile count={deckCount} />
        {knownTop.length > 0 ? (
          <View style={styles.knownTop} testID="known-top">
            <Text style={styles.knownTopLabel} allowFontScaling={false}>
              已知牌顶 · 仅你可见
            </Text>
            <Text style={styles.knownTopCards} numberOfLines={2} allowFontScaling={false}>
              {knownTop
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((card) => card.name ?? cardNameOf(card.card_id))
                .join(' → ')}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 右上弃牌堆 */}
      <View style={styles.discardSlot}>
        <DiscardPile count={discardCount} topCardId={lastDiscard ?? undefined} />
      </View>

      {/* 中央阶段文案 */}
      <View pointerEvents="none" style={styles.center}>
        <Text style={styles.phase} allowFontScaling={false}>
          {phaseLabel}
        </Text>
        <Text style={styles.hint} allowFontScaling={false}>
          {phaseHint}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative' },
  circle: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  deckSlot: { position: 'absolute', left: sp(4), top: sp(3), alignItems: 'center' },
  discardSlot: { position: 'absolute', right: sp(4), top: sp(3), alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 100 },

  phase: {
    ...serif(700),
    fontSize: 20,
    letterSpacing: track(0.2, 20),
    color: gold[300],
    textShadowColor: 'rgba(201,168,106,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  hint: { ...sans(400), fontSize: 10, letterSpacing: track(0.05, 10), color: creamDim, marginTop: 6, textAlign: 'center' },

  knownTop: {
    marginTop: 6,
    maxWidth: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.25),
    backgroundColor: rgba(ink[950], 0.7),
    paddingHorizontal: sp(2),
    paddingVertical: 4,
    alignItems: 'center',
  },
  knownTopLabel: { ...sans(400), fontSize: 9, letterSpacing: 0.4, color: creamFaint },
  knownTopCards: { ...serif(600), fontSize: 10, color: gold[300], marginTop: 2, textAlign: 'center' },
});

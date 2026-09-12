import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { fetchCards } from '@/api/game';
import { GameCard } from '@/components/game-card';
import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useResponsive } from '@/hooks/use-responsive';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { CardSpec } from '@/types/card';
import { CARD_SPECS_FALLBACK, CATEGORY_LABELS } from '@/utils/card-catalog';

const CATEGORY_ORDER = ['TRIBULATION', 'DEFUSE', 'ACTIVE', 'REACTIVE'];

export default function CardsScreen() {
  const layout = useResponsive();
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

  const sorted = [...cards].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );

  return (
    <ScreenBackground variant="home" contentStyle={styles.content}>
      <Head>
        <title>卡牌图鉴 · 修仙卡牌</title>
      </Head>
      <View style={styles.header}>
        <View style={styles.back}>
          <PrimaryButton label="‹ 返回" variant="ghost" onPress={() => router.back()} />
        </View>
        <Text style={styles.title}>卡牌图鉴</Text>
        <View style={styles.back} />
      </View>

      <Banner message={error} onDismiss={() => setError(undefined)} />

      <View style={styles.metaRow}>
        <Badge label={`共 ${cards.length} 张`} tone="gold" />
        <Badge label={source === 'api' ? '来源 GET /cards' : '来源 本地 metadata'} tone="muted" />
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        numColumns={layout.isWide ? 3 : 2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <GameCard
              cardId={item.id}
              name={item.name}
              category={item.category}
              size="detail"
              width={layout.isCompact ? 108 : 132}
              height={Math.round((layout.isCompact ? 108 : 132) / 0.68)}
              state="idle"
            />
            <Text style={styles.cardName}>{item.name}</Text>
            <Badge label={CATEGORY_LABELS[item.category] ?? item.category} tone="jade" />
            <Text style={styles.cardDesc}>{item.description}</Text>
          </View>
        )}
      />

      <Panel tone="jade" style={styles.footerPanel}>
        <Text style={styles.footerText}>
          卡牌效果由后端 Python 规则引擎执行；本页仅展示 GET /cards 或本地静态 metadata 的说明文本。
        </Text>
      </Panel>

      <LoadingOverlay visible={loading} label="正在读取卡表…" mode="inline" />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  back: {
    minWidth: 88,
  },
  title: {
    ...text.title,
    fontSize: 22,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  column: {
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  item: {
    alignItems: 'center',
    width: '48%',
  },
  cardName: {
    ...text.bodyStrong,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  cardDesc: {
    ...text.label,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  footerPanel: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  footerText: {
    ...text.label,
    color: colors.textFaint,
    lineHeight: 16,
  },
});

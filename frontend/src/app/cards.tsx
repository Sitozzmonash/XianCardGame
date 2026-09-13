/**
 * 「卡牌图鉴」路由 `/cards`。
 *
 * 结构 1:1 照 `docs/reference-next/components/screens/CollectionScreen.tsx`，
 * 视图在 `@/components/ref/screens/cards/CollectionScreen`；本文件只做两件事：
 *  1. 取数：真实 `GET /cards`（`useCardCatalog` → `@/api/game` 的 `fetchCards`）；
 *  2. 路由接线：点卡 → `/card/<cardId>`（可选把 `from` 透传给详情页，供「从对局页进入」判定）。
 */

import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';

import { CollectionScreen, useCardCatalog } from '@/components/ref/screens/cards';

export default function CardsRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const catalog = useCardCatalog();

  return (
    <>
      <Head>
        <title>卡牌图鉴 · 修仙卡牌</title>
      </Head>
      <CollectionScreen
        cards={catalog.cards}
        loading={catalog.loading}
        error={catalog.error}
        onRetry={catalog.reload}
        onBack={() => router.back()}
        onSelectCard={(cardId) =>
          router.push({
            pathname: '/card/[cardId]',
            params: from ? { cardId, from } : { cardId },
          })
        }
      />
    </>
  );
}

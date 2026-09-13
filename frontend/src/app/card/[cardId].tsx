/**
 * 「卡牌详情」路由 `/card/[cardId]`。
 *
 * 结构 1:1 照 `docs/reference-next/components/screens/CardDetailScreen.tsx`，
 * 视图在 `@/components/ref/screens/cards/CardDetailScreen`；本文件负责：
 *  1. 取数：真实 `GET /cards`（`useCardCatalog`），按 `cardId` 取出这张牌；
 *  2. 路由接线：
 *     - `onBack` / 「取消」 → 返回上一页（`?from=battle` 时即对局页）；
 *     - 「使用卡牌」：若 `?from=battle` → 返回对局页并**选中**该牌
 *       （手牌实例 id 只能从 `view.observation.hand` 里按 `card_id` 匹配，位置性的
 *       `h_<player>_<index>` 不能在前端推算；匹配不到就只返回对局页）；
 *       否则返回图鉴。**本文件不提交任何动作 —— 不伪造出牌**。
 */

import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';

import { CardDetailScreen, CatalogError, CatalogLoading, CatalogNotice, useCardCatalog } from '@/components/ref/screens/cards';
import { ScrollBody, ScreenShell } from '@/components/ref/ScreenShell';
import { TopBar } from '@/components/ref/primitives';
import { useGameStore } from '@/store/game-store';

/**
 * 静态导出（`expo export --platform web`，Netlify）用的参数预生成。
 *
 * 为什么必须写：`web.output: "static"` 下，动态路由没有参数就只会产出一个
 * `card/[cardId].html`，线上直接访问 / 刷新 `/card/STARGAZING` 会掉 404。
 * 导出这一函数后，expo-router 在构建期把 8 个 id 各展开成一条**静态路由**（`/card/STARGAZING` …），
 * 每个 id 一个可独立访问的 HTML；客户端 `router.push('/card/STARGAZING')` 照旧走动态路由，两条路径都可用。
 *
 * 8 个 id 以**后端 `GET /cards`** 为准（TRIBULATION/DEFUSE/STARGAZING/REWRITE_FATE/SHUFFLE/ESCAPE/STEAL/COUNTER，
 * 已用 `backend/app/api/cards.py` 的 `CARD_SPECS` 与真实 `GET /cards` 逐项核对）；
 * 这里写死是因为**静态导出发生在构建期，此时无法请求后端**（也不能编造别的 id）。
 */
export function generateStaticParams(): { cardId: string }[] {
  return [
    'TRIBULATION',
    'DEFUSE',
    'STARGAZING',
    'REWRITE_FATE',
    'SHUFFLE',
    'ESCAPE',
    'STEAL',
    'COUNTER',
  ].map((cardId) => ({ cardId }));
}

export default function CardDetailRoute() {
  const { cardId, from } = useLocalSearchParams<{ cardId?: string; from?: string }>();
  const catalog = useCardCatalog();
  const view = useGameStore((state) => state.view);
  const selectCard = useGameStore((state) => state.selectCard);

  const card = catalog.cards.find((item) => item.id === cardId);

  /**
   * 返回落点：从对局页进来就回对局页，否则回图鉴。
   *
   * 用 `dismissTo` 而不是 `router.canGoBack()`：expo-router 57 的 `canGoBack()` / `canDismiss()`
   * 在 DOM 环境（`expo/dom` 的 `IS_DOM`）会**直接抛错**（`node_modules/expo-router/build/global-state/router.js:96`），
   * web 端（本项目要静态导出到 Netlify）不能调用。`dismissTo` 走 POP_TO：目标页在栈里就 pop 回去，
   * 不在就用它替换当前页（`react-navigation/routers/StackRouter.js:336-372`），因此深链 / 刷新直接打开
   * `/card/XXX` 时也能回到图鉴，不会卡住。
   */
  const leave = () => router.dismissTo(from === 'battle' ? '/battle' : '/cards');

  const handleUse = () => {
    if (from === 'battle') {
      // 只挑选中态，不发动作：选中后由对局页自己按 legal_actions 渲染可用按钮
      const instance = view?.observation.hand.find((item) => item.card_id === card?.id);
      if (instance) selectCard(instance.instance_id);
      leave();
      return;
    }
    leave();
  };

  // 取数失败：只显示「连接不上后端」+ 重试（不造假数据）
  if (catalog.error && !catalog.loading) {
    return (
      <ScreenShell>
        <TopBar eyebrow="卡牌玄妙" title={card?.name ?? '卡牌详情'} onBack={leave} />
        <ScrollBody>
          <CatalogError title={catalog.error.title} detail={catalog.error.detail} onRetry={catalog.reload} />
        </ScrollBody>
      </ScreenShell>
    );
  }

  // 还在读卡表，或者 cardId 不在 GET /cards 里
  if (!card) {
    return (
      <ScreenShell>
        <TopBar eyebrow="卡牌玄妙" title="卡牌详情" onBack={leave} />
        <ScrollBody>
          {catalog.loading ? (
            <CatalogLoading />
          ) : (
            <CatalogNotice text="没有找到这张卡牌。" hint="请返回图鉴重新选择" />
          )}
        </ScrollBody>
      </ScreenShell>
    );
  }

  return (
    <>
      <Head>
        <title>{`${card.name} · 卡牌详情 · 修仙卡牌`}</title>
      </Head>
      <CardDetailScreen
        card={card}
        allCards={catalog.cards}
        onBack={leave}
        onUse={handleUse}
        onSelectCard={(nextId) =>
          router.replace({
            pathname: '/card/[cardId]',
            params: from ? { cardId: nextId, from } : { cardId: nextId },
          })
        }
      />
    </>
  );
}

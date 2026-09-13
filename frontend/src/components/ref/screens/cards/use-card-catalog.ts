/**
 * 「卡牌图鉴 / 卡牌详情」的取数：真实 `GET /cards`（`@/api/game` 的 `fetchCards`，
 * 真后端模式下就是 `GET {EXPO_PUBLIC_API_BASE_URL}/cards`；只有显式开启 mock 时才走内置演示数据）。
 *
 * 失败时**不做任何假数据兜底**：把错误交给页面显示「连接不上后端」+ 重试按钮。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError } from '@/api/client';
import { fetchCards } from '@/api/game';
import type { CardSpec } from '@/types/card';

import { toCatalogCard, type CatalogCard } from './card-meta';

/** 取数失败信息（页面直接渲染，标题 + 明细） */
export interface CatalogErrorInfo {
  /** 例「连接不上后端」 */
  title: string;
  /** 具体原因（后端 message / 中文提示） */
  detail: string;
}

export interface CardCatalog {
  cards: CatalogCard[];
  loading: boolean;
  error?: CatalogErrorInfo;
  reload: () => void;
}

function errorInfoOf(error: unknown): CatalogErrorInfo {
  if (error instanceof ApiError) {
    if (error.isNetwork) {
      return { title: '连接不上后端', detail: `${error.message}（GET /cards）` };
    }
    if (error.code === 'TIMEOUT') {
      return { title: '连接不上后端', detail: `请求超时，未取到卡牌数据（GET /cards）。` };
    }
    return { title: '读取卡牌失败', detail: `${error.message}（GET /cards）` };
  }
  if (error instanceof Error) {
    return { title: '读取卡牌失败', detail: `${error.message}（GET /cards）` };
  }
  return { title: '读取卡牌失败', detail: '未知错误（GET /cards）。' };
}

/**
 * 拉取卡牌静态表。`cards` 只在成功时非空；失败时 `error` 有值、`cards` 为空数组。
 */
export function useCardCatalog(): CardCatalog {
  const [specs, setSpecs] = useState<CardSpec[] | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CatalogErrorInfo | undefined>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    fetchCards()
      .then((list) => {
        if (!alive) return;
        if (list.length === 0) {
          setSpecs(undefined);
          setError({ title: '读取卡牌失败', detail: 'GET /cards 返回空列表。' });
          return;
        }
        setSpecs(list);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setSpecs(undefined);
        setError(errorInfoOf(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const cards = useMemo(() => (specs ?? []).map(toCatalogCard), [specs]);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { cards, loading, error, reload };
}

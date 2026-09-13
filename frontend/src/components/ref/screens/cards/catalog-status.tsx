/**
 * 取数过程中的三个状态块（加载 / 失败重试 / 提示）。
 *
 * 参考原型是纯静态原型，没有这三个状态；这里按 `docs/FRONTEND_PORT_SPEC.md` §7.3
 * （数据必须来自后端、不得用假数据冒充）与任务要求补：
 * 失败时显示「连接不上后端」+ 重试按钮，**绝不回落到本地假卡表**。
 * 视觉沿用参考的 `Panel` + `PrimaryButton`，不新造样式体系。
 */

import { StyleSheet, Text, View } from 'react-native';

import { Panel, PrimaryButton } from '@/components/ref/primitives';
import { creamDim, sp } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

/** 居中提示文字（加载中 / 未找到卡牌） */
export function CatalogNotice({ text, hint }: { text: string; hint?: string }) {
  return (
    <View style={styles.notice}>
      <Text allowFontScaling={false} style={styles.noticeText}>
        {text}
      </Text>
      {hint ? (
        <Text allowFontScaling={false} style={styles.noticeHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** 正在读取 `GET /cards` */
export function CatalogLoading() {
  return <CatalogNotice text="正在读取卡牌…" hint="GET /cards" />;
}

/** 取数失败：标题 + 明细 + 重试（不发假数据） */
export function CatalogError({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <Panel style={styles.errorPanel}>
      <View style={styles.errorBody}>
        <Text allowFontScaling={false} style={styles.errorTitle}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={styles.errorDetail}>
          {detail}
        </Text>
        {onRetry ? (
          <PrimaryButton fullWidth onPress={onRetry}>
            重新连接
          </PrimaryButton>
        ) : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  notice: { alignItems: 'center', paddingVertical: sp(8), gap: sp(2) },
  noticeText: { ...sans(400), fontSize: 13, letterSpacing: 0.5, color: creamDim },
  noticeHint: { ...sans(400), fontSize: 10, letterSpacing: 0.5, color: creamDim, opacity: 0.7 },

  errorPanel: { marginTop: sp(4) },
  errorBody: { alignItems: 'center', gap: sp(3) },
  errorTitle: { ...sans(600), fontSize: 15, letterSpacing: 0.6, color: creamDim },
  errorDetail: { ...sans(400), fontSize: 12, lineHeight: 12 * 1.625, color: creamDim, textAlign: 'center' },
});

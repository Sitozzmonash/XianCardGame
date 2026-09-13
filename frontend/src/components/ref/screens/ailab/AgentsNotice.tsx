/**
 * `GET /agents` 的三种状态展示（**全部如实**，不含任何假模型名）：
 *
 *  - `loading`：一行「正在读取」，不占位不闪烁；
 *  - `error`：真实错误信息 + 一个「重试」胶囊（真的会重新发请求）；
 *  - `ready` 但**当前人数没有匹配模型**：训练提示 —— 命令逐字来自 `docs/RUNBOOK.md`
 *    §2.1（训练）与 §3.1（`models --write-index` 刷新 `models/index.json`，`GET /agents` 才会列出）。
 *
 * ⚠️ 参考原型在这里写死 `MCCFR_MODEL_OPTIONS = ['100K','500K','Champion']`（`lib/game-data.ts:165`）——
 * 本仓没有这三个名字，也绝不会为了“看起来齐”而造模型名：清单为空就只给训练提示。
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { creamDim, creamFaint, gold, ink, radius, rgba, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export function AgentsNotice({
  status,
  error,
  players,
  availableCounts,
  commands,
  onRetry,
}: {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  players: number;
  /** 清单里真实存在的训练人数（用于说明「哪些人数有模型」），来自 GET /agents */
  availableCounts: readonly number[];
  commands: readonly string[];
  onRetry: () => void;
}) {
  if (status === 'loading') {
    return (
      <Text allowFontScaling={false} style={styles.muted}>
        正在读取 GET /agents 的模型清单…
      </Text>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.wrap}>
        <Text allowFontScaling={false} style={styles.muted}>
          {error ?? 'GET /agents 读取失败。'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重新读取 GET /agents"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null]}
        >
          <Text allowFontScaling={false} style={styles.retryText}>
            重试
          </Text>
        </Pressable>
      </View>
    );
  }

  const others = availableCounts.filter((count) => count !== players);

  return (
    <View style={styles.box}>
      <Text allowFontScaling={false} style={styles.title}>
        当前 {players} 人没有可用 MCCFR 模型
      </Text>
      <Text allowFontScaling={false} style={styles.muted}>
        GET /agents 里没有 players={players} 的模型
        {others.length > 0 ? `（清单里现有：${others.map((count) => `${count} 人`).join(' / ')}）` : ''}
        。模型按人数训练：跨人数使用会 100% 回落 RuleAgent 且不报错（INTERFACES 附录 A10）。
      </Text>
      <View style={styles.code}>
        {commands.map((line) => (
          <Text key={line} allowFontScaling={false} style={styles.codeText}>
            {line}
          </Text>
        ))}
      </View>
      <Text allowFontScaling={false} style={styles.muted}>
        第二行刷新 models/index.json —— GET /agents 读到新模型后这里才会出现可选项。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(2), alignItems: 'flex-start' },
  box: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.25),
    backgroundColor: rgba(ink[900], 0.6),
    padding: sp(3),
    gap: sp(2),
  },
  title: { ...sans(500), fontSize: 11, letterSpacing: track(0.05, 11), color: gold[300] },
  muted: { ...sans(400), fontSize: 10, lineHeight: 15, color: creamDim },
  code: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.18),
    backgroundColor: 'rgba(4,13,12,0.72)',
    paddingHorizontal: sp(2),
    paddingVertical: sp(2),
    gap: 2,
  },
  codeText: { ...sans(400), fontSize: 10, lineHeight: 15, color: creamFaint },
  retry: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.3),
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  retryText: { ...sans(400), fontSize: 10, letterSpacing: track(0.05, 10), color: creamFaint },
  pressed: { opacity: 0.7 },
});

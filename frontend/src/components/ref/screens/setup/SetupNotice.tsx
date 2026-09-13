/**
 * 对战配置页的运行期提示条（后端不可用 / 演示数据 / MCCFR 清单读取失败 / 无可用模型）。
 *
 * 参考原型的这一屏没有提示区（原型没有后端）。这里只做**最小侵入**的补充：
 * 没有要说的内容时整块不渲染，因此正常状态下版式与参考逐行一致（移植规格 §7.5 要求
 * 失败原因必须可见，不能静默）。
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cream, gold, ink, jade, radius, rgba, sp, track } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export interface NoticeItem {
  id: string;
  tone: 'error' | 'notice';
  text: string;
  /** 可选动作（如「使用内置演示数据」/「切回真后端」） */
  actionLabel?: string;
  onAction?: () => void;
}

export function SetupNotice({
  items,
  onDismiss,
}: {
  items: readonly NoticeItem[];
  onDismiss?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <View key={item.id} style={[styles.row, item.tone === 'error' ? styles.rowError : styles.rowNotice]}>
          <Text allowFontScaling={false} style={[styles.text, item.tone === 'error' ? styles.textError : null]}>
            {item.text}
          </Text>
          <View style={styles.actions}>
            {item.actionLabel && item.onAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.actionLabel}
                onPress={item.onAction}
                style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
              >
                <Text allowFontScaling={false} style={styles.actionText}>
                  {item.actionLabel}
                </Text>
              </Pressable>
            ) : null}
            {onDismiss ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭提示"
                onPress={() => onDismiss(item.id)}
                style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
              >
                <Text allowFontScaling={false} style={styles.dismissText}>
                  关闭
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(2) },
  row: {
    borderRadius: radius.xl,
    borderWidth: 1,
    backgroundColor: rgba(ink[850], 0.6),
    paddingHorizontal: sp(3),
    paddingVertical: sp(2.5),
    gap: sp(1),
  },
  rowNotice: { borderColor: rgba(gold[500], 0.3) },
  rowError: { borderColor: rgba('#a13a3a', 0.6), backgroundColor: rgba('#5e1f1f', 0.3) },
  text: {
    ...sans(400),
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: track(0.02, 11),
    color: gold[300],
  },
  textError: { color: '#e8a9a9' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3), marginTop: sp(1) },
  action: { paddingVertical: 2 },
  pressed: { opacity: 0.6 },
  actionText: {
    ...sans(500),
    fontSize: 11,
    letterSpacing: track(0.04, 11),
    color: jade[300],
  },
  dismissText: {
    ...sans(400),
    fontSize: 11,
    letterSpacing: track(0.04, 11),
    color: cream,
  },
});

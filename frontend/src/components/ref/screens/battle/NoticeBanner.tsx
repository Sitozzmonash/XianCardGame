/**
 * 提示条：报错 / 通知 / 未完成的决策。
 *
 * 参考原型没有这一层（原型无后端），但本仓库有三件事必须有人告诉玩家，且不能让它们
 * 破坏 1:1 的版面：
 *   1. 后端错误（409 revision 冲突、网络失败…）—— 带「重新同步」动作；
 *   2. 运行期通知（mock/演示数据切换等）；
 *   3. **未完成的决策**：反制 / 排序 / 回插弹窗被暂时关掉时，牌局并没有继续走，
 *      必须留一个「继续决策」的回入口，否则玩家会卡在一个不会推进的阶段里。
 *
 * 版式：绝对定位在轮次胶囊下方，只有存在内容时出现，不撑动主体布局。
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/ref/primitives';
import { blood, cream, creamDim, gold, ink, jade, radius, rgba, sp } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export type NoticeTone = 'error' | 'notice' | 'pending';

const TONE_COLOR: Record<NoticeTone, string> = {
  error: blood[500],
  notice: jade[400],
  pending: gold[500],
};

export function NoticeBanner({
  message,
  tone = 'notice',
  actionLabel,
  onAction,
  onDismiss,
  testID,
}: {
  message?: string;
  tone?: NoticeTone;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  testID?: string;
}) {
  if (!message) return null;

  return (
    <View style={[styles.wrap, { borderColor: rgba(TONE_COLOR[tone], 0.5) }]} testID={testID}>
      <View style={[styles.accent, { backgroundColor: TONE_COLOR[tone] }]} />
      <Text style={styles.text} numberOfLines={2} allowFontScaling={false}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <PrimaryButton style={styles.action} textStyle={styles.actionText} onPress={onAction}>
          {actionLabel}
        </PrimaryButton>
      ) : null}
      {onDismiss ? (
        <SecondaryButton style={styles.dismiss} textStyle={styles.actionText} onPress={onDismiss}>
          忽略
        </SecondaryButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: sp(4),
    right: sp(4),
    top: 56,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    borderRadius: radius.xl,
    borderWidth: 1,
    backgroundColor: rgba(ink[950], 0.92),
    paddingLeft: sp(2),
    paddingRight: sp(2),
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
  },
  accent: { width: 2, alignSelf: 'stretch', borderRadius: 1 },
  text: { ...sans(400), flex: 1, fontSize: 11, lineHeight: 16, color: cream },
  action: { paddingHorizontal: sp(3), paddingVertical: 6 },
  dismiss: { paddingHorizontal: sp(2.5), paddingVertical: 6 },
  actionText: { fontSize: 11, letterSpacing: 0.5, color: creamDim },
});

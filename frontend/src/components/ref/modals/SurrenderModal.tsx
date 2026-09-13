/**
 * 「认输」确认弹窗（参考原型没有这一屏：原型里「认输」直接切到结算页）。
 *
 * 本仓库的契约里**没有 surrender 动作**（API_CONTRACT 无此端点，DESIGN_SPEC §4 已记：
 * 认输 = `DELETE /games/{id}` 销毁对局 + 回首页），所以必须给一个说明清楚、可撤销的确认层，
 * 而不是做一个点了没反应的假按钮。版式沿用冻结的 `GameModal`（tone="blood" 与反制弹窗同族）。
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GameModal } from '@/components/ref/GameModal';
import { PrimaryButton, SecondaryButton } from '@/components/ref/primitives';
import { cream, creamDim, sp } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export function SurrenderModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <GameModal
      open={open}
      tone="blood"
      title="认输"
      subtitle="认输即销毁当前对局，无法撤销。"
      onClose={onCancel}
      testID="modal-surrender"
      footer={
        <View style={styles.footerRow}>
          <SecondaryButton fullWidth={false} style={styles.footerItem} onPress={onCancel}>
            继续对局
          </SecondaryButton>
          <PrimaryButton fullWidth={false} style={styles.footerItem} onPress={onConfirm}>
            确认认输
          </PrimaryButton>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.line} allowFontScaling={false}>
          当前对局会被后端销毁（<Text style={styles.code}>DELETE /api/v1/games/{'{id}'}</Text>），
          本局战绩不再保留。
        </Text>
        <Text style={styles.line} allowFontScaling={false}>
          契约里没有 surrender 动作，因此前端不做假动作：确认后直接清空本地对局并返回首页。
        </Text>
      </View>
    </GameModal>
  );
}

/** 战报（对局页的信息回看入口；参考原型此处留白，用弹窗承载，不占版面） */
export function BattleLogModal({
  open,
  lines,
  onClose,
}: {
  open: boolean;
  lines: string[];
  onClose: () => void;
}) {
  return (
    <GameModal
      open={open}
      title="战报"
      subtitle="按后端事件的 seq 顺序记录（牌面只有本人可见的事件不显示内容）。"
      onClose={onClose}
      testID="modal-battle-log"
      footer={
        <PrimaryButton fullWidth onPress={onClose}>
          关闭
        </PrimaryButton>
      }
    >
      <ScrollView style={styles.logBox} contentContainerStyle={styles.logInner} nestedScrollEnabled>
        {lines.length === 0 ? (
          <Text style={styles.logLine} allowFontScaling={false}>
            暂无事件。
          </Text>
        ) : (
          lines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.logLine} allowFontScaling={false}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </GameModal>
  );
}

const styles = StyleSheet.create({
  body: { gap: sp(2), paddingBottom: 2 },
  line: { ...sans(400), fontSize: 12, lineHeight: 19.5, color: creamDim },
  code: { color: cream },
  logBox: { maxHeight: 260 },
  logInner: { gap: 4, paddingBottom: 2 },
  logLine: { ...sans(400), fontSize: 11, lineHeight: 17, color: creamDim },
  /** RN 的 flexShrink 默认 0，两个按钮必须显式 flex:1 才能平分（参考靠 CSS flex-shrink 实现） */
  footerRow: { flex: 1, flexDirection: 'row', gap: sp(3) },
  footerItem: { flex: 1 },
});

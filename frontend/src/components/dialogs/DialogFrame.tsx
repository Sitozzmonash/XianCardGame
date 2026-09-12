/**
 * 弹窗外壳（fig3_1 的四个特殊决策弹窗共用）—— 夜蓝青瓷变体。
 * 统一的遮罩 / 标题 / 关闭（支持系统返回键与遮罩点击关闭）。
 *
 * ⚠️ 这里是「强决策」外壳：即使不可关闭也不会把用户卡死 —— 关闭只会退回到
 * battle 页的「你有未完成的决策」入口，决策本身仍然只有 legal_actions 能提交。
 */
import { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

export type DialogTone = 'jade' | 'gold' | 'danger';

interface DialogFrameProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  tone?: DialogTone;
  dismissable?: boolean;
  onClose?: () => void;
  footer?: ReactNode;
  maxWidth?: number;
}

const TONE_BORDER: Record<DialogTone, string> = {
  jade: 'rgba(78, 178, 148, 0.6)',
  gold: nightColors.cardEdgeSoft,
  danger: nightColors.dangerSoft,
};

const TONE_GLYPH: Record<DialogTone, string> = {
  jade: '阵',
  gold: '符',
  danger: '劫',
};

export function DialogFrame({
  visible,
  title,
  subtitle,
  tone = 'jade',
  dismissable = true,
  onClose,
  footer,
  maxWidth = 400,
  children,
}: PropsWithChildren<DialogFrameProps>) {
  const handleClose = () => {
    if (dismissable) onClose?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="关闭弹窗"
        />
        <View style={[styles.shell, { maxWidth, borderColor: TONE_BORDER[tone] }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={[styles.seal, { borderColor: TONE_BORDER[tone] }]}>
              <Text style={styles.sealGlyph} allowFontScaling={false}>
                {TONE_GLYPH[tone]}
              </Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title} allowFontScaling={false}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2} allowFontScaling={false}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {dismissable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭弹窗"
                onPress={handleClose}
                style={styles.close}
              >
                <Text style={styles.closeText} allowFontScaling={false}>
                  ×
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: nightColors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  shell: {
    width: '100%',
    maxHeight: '88%',
    borderWidth: borderWidth.hair,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 29, 39, 0.97)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  seal: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: borderWidth.hair,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 15, 20, 0.75)',
  },
  sealGlyph: {
    fontFamily: fontFamily.title,
    fontSize: 13,
    color: nightColors.cardEdge,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: 16,
    fontWeight: '700',
    color: nightColors.celadonLight,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    marginTop: 2,
    lineHeight: 14,
  },
  close: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fontFamily.body,
    fontSize: 20,
    lineHeight: 22,
    color: nightColors.muted,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});

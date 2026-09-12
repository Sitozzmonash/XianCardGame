import { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Panel } from '@/components/ui/Panel';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

export type DialogTone = 'jade' | 'gold' | 'danger';

interface DialogFrameProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  tone?: DialogTone;
  /** 是否允许关闭（返回键 / 遮罩 / × 按钮）。特殊决策为强决策时仍允许关闭，避免把用户卡死 */
  dismissable?: boolean;
  onClose?: () => void;
  footer?: ReactNode;
  maxWidth?: number;
}

const TONE_BORDER: Record<DialogTone, string> = {
  jade: colors.jadeBorder,
  gold: colors.borderStrong,
  danger: colors.dangerBorder,
};

/** 弹窗外壳：统一的遮罩 / 标题 / 关闭（支持系统返回键与遮罩点击关闭） */
export function DialogFrame({
  visible,
  title,
  subtitle,
  tone = 'jade',
  dismissable = true,
  onClose,
  footer,
  maxWidth = 520,
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
          <Panel tone="surface" padded={false} style={styles.panel}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              {dismissable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="关闭弹窗"
                  onPress={handleClose}
                  style={styles.close}
                >
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.body}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Panel>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  shell: {
    width: '100%',
    borderWidth: borderWidth.hair,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  panel: {
    borderRadius: 0,
    borderWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...text.heading,
    fontSize: 18,
  },
  subtitle: {
    ...text.caption,
    marginTop: spacing.xxs,
  },
  close: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 24,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
});

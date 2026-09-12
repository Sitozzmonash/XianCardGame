import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

interface Seal404Props {
  /** 路由里实际未匹配到的路径（来自 expo-router，不编造） */
  path?: string;
}

/**
 * 404 印记：旋转菱形（法阵外圈）+ 方形印章 + 米黄小字。
 * 只用 tokens 取色（墨玉底 / 鎏金描边 / 米黄文字），无位图、无图标库。
 */
export function Seal404({ path }: Seal404Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.diamond} pointerEvents="none" />
      <View style={styles.seal}>
        <Text style={styles.code}>404</Text>
        <View style={styles.rule} />
        <Text style={styles.sealGlyph}>道 阻 且 长</Text>
      </View>
      {path && path !== '/' ? (
        <Text style={styles.path} numberOfLines={1}>
          未匹配路径：{path}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  diamond: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
    borderRadius: radius.lg,
  },
  seal: {
    width: 146,
    height: 146,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thin,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  code: {
    ...text.display,
    fontSize: 44,
    color: colors.goldLight,
    letterSpacing: 4,
  },
  rule: {
    width: 72,
    height: 1,
    backgroundColor: colors.gold,
    marginVertical: spacing.xs,
    opacity: 0.7,
  },
  sealGlyph: {
    ...text.label,
    color: colors.muted,
    letterSpacing: 2,
  },
  path: {
    ...text.label,
    color: colors.textFaint,
    marginTop: spacing.xl + spacing.md,
    maxWidth: 300,
  },
});

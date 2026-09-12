import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

/** 设计稿圆形徽记：fig4_1 圆心 (215,245) 处直径 ≈148 的墨玉青底 + 鎏金圈，从 2x 原图裁切 */
export const RESULT_BADGE = require('../../../assets/design_crops/result_badge.png');

/** 设计稿实测：徽记外径 ≈156（1x），标题下 y 171-319 */
export const RESULT_BADGE_SIZE = 156;

interface ResultBadgeProps {
  size?: number;
  /** 徽记下方的胜者名（真实 view.public.players[].name） */
  name?: string;
  /** 胜者名下方的小字，如「最后存活 · 证道成功」 */
  subtitle?: string;
}

/** 结算页的圆形徽记 + 胜者名 + 副标题（fig4_1 y 171-413） */
export function ResultBadge({ size = RESULT_BADGE_SIZE, name, subtitle }: ResultBadgeProps) {
  return (
    <View style={styles.wrap} testID="result-badge">
      <Image
        source={RESULT_BADGE}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={0}
        accessibilityLabel="渡劫徽记"
      />
      {name ? (
        <Text style={styles.name} numberOfLines={1} testID="result-winner">
          {name}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2} testID="result-subtitle">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 52,
  },
  name: {
    fontFamily: fontFamily.title,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.text,
    marginTop: 11,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.goldLight,
    marginTop: 34,
    textAlign: 'center',
  },
});

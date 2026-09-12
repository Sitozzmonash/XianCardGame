/**
 * 我的信息条（fig3_1 §3.3-5：「我（太虚真君）手牌：N 张」）。
 * 只读 `public.players` 里自己那一行 + `observation.hand.length`。
 */
import { StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

interface SelfStripProps {
  name: string;
  handCount: number;
  alive: boolean;
  /** 是否是我的决策点 */
  isMyTurn: boolean;
  alive_seat_count: number;
}

export function SelfStrip({ name, handCount, alive, isMyTurn, alive_seat_count }: SelfStripProps) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.text} numberOfLines={1} allowFontScaling={false}>
        我（{name}）手牌：{handCount} 张
      </Text>
      <Text style={[styles.badge, isMyTurn ? styles.badgeActive : null]} allowFontScaling={false}>
        {alive ? (isMyTurn ? '待我决策' : '等待中') : '已淘汰'} · 存活 {alive_seat_count}
      </Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  line: {
    flex: 1,
    height: borderWidth.hair,
    backgroundColor: nightColors.hairline,
  },
  text: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadonLight,
    letterSpacing: 0.5,
  },
  badge: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
  },
  badgeActive: {
    color: nightColors.jade,
  },
});

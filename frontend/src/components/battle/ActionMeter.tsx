/**
 * 行动条（fig3_1 实测：法阵上方 y381-395 的玉绿横条，宽约 130）。
 *
 * 设计图这里是一段纯色玉绿条；因为**本游戏没有费用**（DESIGN_SPEC §4），
 * 它被用来承载 HUD 必需的信息：**「行动 已用/上限」**（每回合最多 2 张主动牌）。
 * 分段条 + 文字双通道，不靠颜色也能读出用量。
 */
import { StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

interface ActionMeterProps {
  used: number;
  max: number;
  /** 响应式缩放系数（设计基准 1） */
  s?: number;
  /** 是否轮到真人决策（否则以暗色显示） */
  active?: boolean;
}

export function ActionMeter({ used, max, s = 1, active = true }: ActionMeterProps) {
  const segments = Math.max(1, Math.min(max, 6));
  const filled = Math.max(0, Math.min(used, segments));
  const width = 130 * s;
  const segW = (width - (segments - 1) * 4) / segments;

  return (
    <View
      style={styles.wrapper}
      accessibilityLabel={`行动已用 ${used} / 上限 ${max}`}
    >
      <Text style={styles.label} allowFontScaling={false}>
        行动
      </Text>
      <View style={[styles.track, { width }]}>
        {Array.from({ length: segments }).map((_, index) => (
          <View
            key={`seg-${index}`}
            style={[
              styles.segment,
              {
                width: segW,
                height: 10 * s,
                backgroundColor: index < filled ? '#4EB294' : 'rgba(120, 178, 196, 0.18)',
                borderColor: index < filled ? '#8FE3C8' : 'rgba(120, 178, 196, 0.35)',
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.count, !active ? styles.countIdle : null]} allowFontScaling={false}>
        {used}/{max}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadon,
    letterSpacing: 1,
  },
  track: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  segment: {
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  count: {
    fontFamily: fontFamily.title,
    fontSize: 12,
    fontWeight: '700',
    color: nightColors.cardEdge,
  },
  countIdle: {
    color: nightColors.muted,
  },
});

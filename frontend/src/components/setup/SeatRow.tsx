/**
 * 「座位与对手」一行：头像 + 名字 + 副标题 + 右侧角色标签。
 *
 * 交互（保留旧页面能力）：
 *  - 点「左侧头像/名字」区域 → 把真人挪到这个座位（`human_player`）；
 *  - 点右侧角色标签 → 切换该座位的 AI 类型（random → rule → ismcts → mccfr）。
 */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

export interface SeatRowProps {
  x: number;
  y: number;
  w: number;
  h: number;
  seat: number;
  name: string;
  sublabel: string;
  agentLabel: string;
  isHuman: boolean;
  /** 头像位图（真人座位用裁切立绘；AI 座位留空环，和设计图一致） */
  portrait?: ImageSourcePropType;
  /** 空环里的单字（AI 座位） */
  initial?: string;
  agentDisabled?: boolean;
  locked?: boolean;
  onMoveHere?: () => void;
  onCycleAgent?: () => void;
}

export function SeatRow({
  x,
  y,
  w,
  h,
  seat,
  name,
  sublabel,
  agentLabel,
  isHuman,
  portrait,
  initial,
  agentDisabled = false,
  locked = false,
  onMoveHere,
  onCycleAgent,
}: SeatRowProps) {
  const badgeW = Math.min(126, w * 0.34);
  const badgeH = Math.min(40, h - 14);
  return (
    <>
      <View style={[styles.card, { left: x, top: y, width: w, height: h, borderColor: isHuman ? colors.jadeBorder : colors.border }]}>
        {isHuman ? <View style={styles.humanFlag} /> : null}
      </View>

      {/* 头像：真人座位用裁切立绘，AI 座位是空环 + 单字（设计图即空环占位） */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`把真人座位换到 P${seat}（${name}）`}
        accessibilityState={{ selected: isHuman, disabled: locked }}
        disabled={locked || isHuman}
        onPress={onMoveHere}
        style={({ pressed }) => [
          styles.avatar,
          {
            left: x + 14,
            top: y + (h - 54) / 2,
            width: 54,
            height: 54,
            borderRadius: 27,
            borderColor: isHuman ? colors.goldLight : colors.borderStrong,
          },
          pressed ? styles.pressed : null,
        ]}
      >
        {portrait ? (
          <Image
            source={portrait}
            resizeMode="cover"
            style={{ position: 'absolute', left: 0, top: 0, width: 54, height: 54 }}
          />
        ) : (
          <Text style={styles.initial}>{initial ?? ''}</Text>
        )}
      </Pressable>

      <Text style={[styles.name, { left: x + 80, top: y + 12 }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.sub, { left: x + 80, top: y + 32 }]} numberOfLines={1}>
        {sublabel}
      </Text>

      {/* 右侧角色标签：可点切换 AI 类型 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`P${seat} 角色 ${agentLabel}${isHuman ? '（真人座位）' : '，点击切换 AI 类型'}`}
        accessibilityState={{ disabled: isHuman || agentDisabled }}
        disabled={isHuman || agentDisabled}
        onPress={onCycleAgent}
        style={({ pressed }) => [
          styles.badge,
          {
            left: x + w - badgeW - 14,
            top: y + (h - badgeH) / 2,
            width: badgeW,
            height: badgeH,
            borderColor: isHuman ? colors.goldLight : colors.jadeBorder,
          },
          isHuman ? styles.badgeHuman : null,
          agentDisabled && !isHuman ? styles.badgeDisabled : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            { color: isHuman ? colors.goldLight : colors.jadeLight },
            agentDisabled && !isHuman ? styles.badgeTextDisabled : null,
          ]}
          numberOfLines={1}
        >
          {agentLabel}
        </Text>
        {!isHuman ? (
          <Text style={styles.badgeHint} numberOfLines={1}>
            {agentDisabled ? '不可用' : '点击切换'}
          </Text>
        ) : (
          <Text style={styles.badgeHint} numberOfLines={1}>
            你 · 此座位
          </Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  humanFlag: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.jade,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  avatar: {
    position: 'absolute',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  initial: {
    fontFamily: fontFamily.title,
    fontSize: 20,
    color: colors.muted,
  },
  name: {
    position: 'absolute',
    fontFamily: fontFamily.title,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1,
  },
  sub: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,113,107,0.22)',
  },
  badgeHuman: {
    backgroundColor: 'rgba(201,166,90,0.16)',
  },
  badgeDisabled: {
    backgroundColor: 'rgba(145,166,160,0.12)',
  },
  badgeText: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  badgeTextDisabled: {
    color: colors.muted,
  },
  badgeHint: {
    fontFamily: fontFamily.body,
    fontSize: 8,
    color: colors.textFaint,
    marginTop: 1,
  },
  pressed: {
    opacity: 0.8,
  },
});

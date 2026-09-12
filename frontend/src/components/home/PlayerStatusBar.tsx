/**
 * 首页顶部个人信息条：头像 + 名字 + 等级 + 资源。
 *
 * 规则约束（DESIGN_SPEC §4）：V1 没有账号体系，等级/资源是**静态演示占位**，
 * 必须在该区域小字标注「演示」，不能让人误以为是真实存档。
 */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

import { HOME_AVATAR_SOURCE } from './assets';
import { HOME_GEOMETRY, type Canvas } from './design';

export interface PlayerStatusBarProps {
  canvas: Canvas;
  name: string;
  level: string;
  resources: readonly string[];
  /** 点击右上角数据源标签（真后端 ⇄ 演示数据） */
  onPressSource?: () => void;
  sourceLabel: string;
  sourceTone: 'live' | 'mock' | 'down';
}

const TONE_COLOR: Record<PlayerStatusBarProps['sourceTone'], string> = {
  live: nightColors.jade,
  mock: nightColors.gold,
  down: nightColors.danger,
};

export function PlayerStatusBar({
  canvas,
  name,
  level,
  resources,
  onPressSource,
  sourceLabel,
  sourceTone,
}: PlayerStatusBarProps) {
  const { dp } = canvas;
  const g = HOME_GEOMETRY;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* 头像（金环 + 裁切立绘） */}
      <View
        style={{
          position: 'absolute',
          left: dp(g.avatar.cx - g.avatar.d / 2),
          top: dp(g.avatar.cy - g.avatar.d / 2),
          width: dp(g.avatar.d),
          height: dp(g.avatar.d),
          borderRadius: dp(g.avatar.d / 2),
          borderWidth: dp(1.6),
          borderColor: 'rgba(227,204,145,0.9)',
          overflow: 'hidden',
          backgroundColor: nightColors.surface,
        }}
      >
        <Image
          source={HOME_AVATAR_SOURCE}
          resizeMode="cover"
          style={{ position: 'absolute', left: 0, top: 0, width: dp(g.avatar.d), height: dp(g.avatar.d) }}
        />
      </View>

      <Text
        style={[styles.name, { left: dp(g.name.x), top: dp(g.name.y), fontSize: dp(g.name.size) }]}
        numberOfLines={1}
      >
        {name}
      </Text>

      <View
        style={[
          styles.levelPill,
          { left: dp(g.level.x), top: dp(g.level.y - 3), borderColor: 'rgba(78,178,148,0.55)' },
        ]}
      >
        <Text style={[styles.levelText, { fontSize: dp(g.level.size) }]}>{level}</Text>
      </View>

      <View style={[styles.resources, { right: dp(g.resources.right), top: dp(g.resources.y) }]}>
        {resources.map((value, index) => (
          <View key={value} style={styles.resourceItem}>
            <View
              style={[
                styles.resourceDot,
                {
                  backgroundColor: index === 0 ? nightColors.celadon : nightColors.gold,
                  width: dp(7),
                  height: dp(7),
                  borderRadius: dp(3.5),
                },
              ]}
            />
            <Text style={[styles.resourceText, { fontSize: dp(g.resources.size) }]}>{value}</Text>
          </View>
        ))}
      </View>

      {/* 演示占位标注（DESIGN_SPEC §4 强制）+ 数据源切换（旧首页功能：真后端 ⇄ 内置 mock） */}
      <View style={[styles.tagRow, { right: dp(g.demoTag.right), top: dp(g.demoTag.y) }]}>
        <View style={styles.demoTag}>
          <Text style={[styles.demoText, { fontSize: dp(9) }]}>资源为演示占位</Text>
        </View>
        {onPressSource ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`数据源：${sourceLabel}，点击切换`}
            onPress={onPressSource}
            style={({ pressed }) => [
              styles.sourceTag,
              { borderColor: TONE_COLOR[sourceTone] },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.sourceText, { fontSize: dp(9), color: TONE_COLOR[sourceTone] }]}>
              {sourceLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: {
    position: 'absolute',
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: nightColors.textStrong,
    letterSpacing: 1.5,
  },
  levelPill: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(22,94,78,0.42)',
  },
  levelText: {
    fontFamily: fontFamily.body,
    color: nightColors.celadonLight,
    letterSpacing: 1,
  },
  resources: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resourceDot: {
    transform: [{ rotate: '45deg' }],
  },
  resourceText: {
    fontFamily: fontFamily.body,
    fontWeight: '600',
    color: nightColors.gold,
    letterSpacing: 0.5,
  },
  tagRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(179,212,215,0.28)',
    backgroundColor: 'rgba(7,15,20,0.42)',
  },
  demoText: {
    fontFamily: fontFamily.body,
    color: 'rgba(179,212,215,0.85)',
  },
  sourceTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(7,15,20,0.5)',
  },
  sourceText: {
    fontFamily: fontFamily.body,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});

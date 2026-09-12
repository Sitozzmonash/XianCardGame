/**
 * 对手面板（fig3_1 实测：101×141 @1x，左右两张卡）。
 *
 * 只渲染 `public.players[]` 的 7 个公开字段（API_CONTRACT §8 / INTERFACES §4.1）：
 *   player_id / name / alive / hand_count / is_current / is_decision_player / agent
 * 手牌**只给数量**，卡面一律用「牌背」示意 —— 绝不显示他人手牌内容（铁律）。
 *
 * 与设计图的差异（已记录在汇报里）：设计图面板底部是一张装饰插画，这里换成
 * 「牌背 ×3」的示意条，既贴版式又避免任何信息泄漏。
 */
import { Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { NightTag } from '@/components/ui/NightTag';
import { battleAvatarFor } from '@/theme/asset-map';
import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { PlayerPublicView } from '@/types/game';

interface PlayerPanelProps {
  player: PlayerPublicView;
  isViewer?: boolean;
  compact?: boolean;
  /** 由响应式布局给（设计基准 101×141） */
  width?: number;
  height?: number;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

const AGENT_LABELS: Record<string, string> = {
  human: '真人',
  rule: 'Rule',
  ismcts: 'ISMCTS',
  mccfr: 'MCCFR',
  random: 'Random',
};

function agentLabel(player: PlayerPublicView): string {
  const type = player.agent?.type;
  if (!type) return '真人';
  const base = AGENT_LABELS[type] ?? type;
  if (type === 'ismcts' && player.agent?.simulations) return `${base}·${player.agent.simulations}`;
  return base;
}

export function PlayerPanel({
  player,
  isViewer = false,
  compact = false,
  width = 101,
  height = 141,
  onPress,
  selected = false,
  style,
}: PlayerPanelProps) {
  const name = player.name || `P${player.player_id}`;
  const initial = name.slice(0, 1);

  const statusLabel = !player.alive
    ? '已淘汰'
    : player.is_decision_player
      ? '待决策'
      : player.is_current
        ? '行动中'
        : '观战';
  const statusTone = !player.alive
    ? 'danger'
    : player.is_decision_player
      ? 'gold'
      : player.is_current
        ? 'jade'
        : 'muted';

  // 边框颜色只是辅助；状态同时由标签文字表达（不只靠颜色）
  const borderColor = !player.alive
    ? nightColors.dangerSoft
    : player.is_decision_player
      ? 'rgba(201, 166, 90, 0.85)'
      : player.is_current
        ? 'rgba(78, 178, 148, 0.7)'
        : selected
          ? nightColors.borderStrong
          : nightColors.hairline;

  const body = (
    <View
      style={[
        styles.panel,
        { width, height, borderColor },
        !player.alive ? styles.dead : null,
        isViewer ? styles.viewer : null,
        style,
      ]}
      accessibilityLabel={`${name}${isViewer ? '（你）' : ''}，${statusLabel}，手牌 ${player.hand_count} 张，${agentLabel(player)}`}
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { borderColor, width: 30, height: 30, borderRadius: 15 }]}>
          <Image
            source={battleAvatarFor(player.player_id)}
            style={[StyleSheet.absoluteFill, styles.avatarImage]}
            resizeMode="cover"
          />
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText} allowFontScaling={false}>
              {initial}
            </Text>
          </View>
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.name, { fontSize: compact ? 10 : 11 }]} numberOfLines={1} allowFontScaling={false}>
            {name}
          </Text>
          <Text style={styles.handCount} numberOfLines={1} allowFontScaling={false}>
            手牌 {player.hand_count} 张
          </Text>
        </View>
      </View>

      <View style={styles.tagRow}>
        <NightTag label={statusLabel} tone={statusTone} fontSize={9} />
        <NightTag label={agentLabel(player)} tone="celadon" fontSize={9} />
      </View>

      {/* 牌背示意：只表达「有几张」，不含任何牌面信息 */}
      <View style={styles.backStrip}>
        {Array.from({ length: Math.min(4, Math.max(1, player.hand_count)) }).map((_, index) => (
          <View
            key={`back-${index}`}
            style={[
              styles.back,
              {
                left: index * 6,
                opacity: player.alive ? 1 - index * 0.16 : 0.4,
              },
            ]}
          >
            <Text style={styles.backGlyph} allowFontScaling={false}>
              玄
            </Text>
          </View>
        ))}
        <Text style={styles.backHint} numberOfLines={1} allowFontScaling={false}>
          牌背 · 仅本人可见
        </Text>
      </View>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    backgroundColor: 'rgba(19, 35, 47, 0.9)',
    padding: 6,
    overflow: 'hidden',
  },
  dead: {
    opacity: 0.55,
  },
  viewer: {
    backgroundColor: 'rgba(26, 44, 57, 0.94)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    borderWidth: borderWidth.hair,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: nightColors.backgroundDeep,
    marginRight: 6,
  },
  avatarFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 见 CardArt 里的说明：RN Web 的 <img> 必须显式 100%×100% 才会按容器缩放 */
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontFamily: fontFamily.title,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(245, 230, 200, 0.55)',
  },
  nameCol: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: nightColors.text,
    letterSpacing: 0.5,
  },
  handCount: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.jade,
    marginTop: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 5,
  },
  backStrip: {
    flex: 1,
    marginTop: 5,
    justifyContent: 'flex-end',
  },
  back: {
    position: 'absolute',
    bottom: 12,
    width: 30,
    height: 40,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 178, 196, 0.55)',
    backgroundColor: '#1B3A46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontFamily: fontFamily.title,
    fontSize: 13,
    color: 'rgba(201, 166, 90, 0.85)',
  },
  backHint: {
    fontFamily: fontFamily.body,
    fontSize: 8,
    color: nightColors.muted,
  },
});

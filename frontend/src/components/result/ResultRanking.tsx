import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

import type { RankedPlayer } from './result-stats';

interface ResultRankingProps {
  players: RankedPlayer[];
}

/**
 * 最终名次列表（fig4_1 实测）：每行 x 28-401.5、高 48、行间距 10、圆角墨玉面板；
 * 名次（鎏金）左对齐、名字（米白）、右侧存活/淘汰状态色
 * （存活 #57B3A4 = colors.jadeLight，淘汰用 colors.danger）。
 * 胜者行用抬升底色 + 鎏金描边区分（不只靠颜色：另有「胜者」角标）。
 */
export function ResultRanking({ players }: ResultRankingProps) {
  return (
    <View style={styles.list} testID="result-ranking">
      {players.map((player) => (
        <View
          key={player.playerId}
          testID={`result-row-${player.playerId}`}
          style={[styles.row, player.isWinner ? styles.rowWinner : null]}
        >
          <Text style={styles.rank}>{player.rank}</Text>
          <View style={styles.nameCell}>
            <Text style={styles.name} numberOfLines={1}>
              {player.name}
              {player.isViewer ? '（你）' : ''}
            </Text>
            {player.isWinner ? <Text style={styles.winnerTag}>胜者</Text> : null}
          </View>
          <Text
            style={[styles.status, player.alive ? styles.statusAlive : styles.statusOut]}
            testID={`result-status-${player.playerId}`}
          >
            {player.alive ? '存活' : '淘汰'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: colors.transparent,
    backgroundColor: colors.surface,
    paddingLeft: 14,
    paddingRight: 16,
    marginTop: 10,
  },
  rowWinner: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
  },
  rank: {
    width: 40,
    fontFamily: fontFamily.title,
    fontSize: 16,
    fontWeight: '700',
    color: colors.goldLight,
  },
  nameCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.text,
  },
  winnerTag: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.gold,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
  },
  status: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  statusAlive: {
    color: colors.jadeLight,
  },
  statusOut: {
    color: colors.danger,
  },
});

/** 结算页（`/result`）的参考层组件出口 —— 对应参考 `components/screens/ResultScreen.tsx`。 */

export { ResultHero } from './ResultHero';
export { ResultRanking } from './ResultRanking';
export { ResultStats } from './ResultStats';
export { StatusPill } from './StatusPill';
export {
  UNKNOWN_VALUE,
  isGameOver,
  rankingOf,
  resolveOutcome,
  resultStatsOf,
  tribulationTally,
  winnerIdOf,
} from './result-data';
export type { RankEntry, ResultOutcome, ResultStat, TribulationTally } from './result-data';

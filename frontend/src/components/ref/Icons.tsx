/**
 * 参考原型的图标（原样取自 `docs/reference-next/components/**` 的内联 SVG path）。
 * 统一走 react-native-svg，**path 数据与描边宽度原样保留**，不要自行简化。
 */

import Svg, { Circle, Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** TopBar / IconButton 的返回箭头：`M15 18l-6-6 6-6` */
export function ChevronLeftIcon({ size = 16, color = '#a9b8ae', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** GameModal 的关闭叉：两条线合成一个 path */
export function CloseIcon({ size = 14, color = '#a9b8ae', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** 首页右上角设置齿轮（path 原样复制） */
export function SettingsIcon({ size = 16, color = '#a9b8ae', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a1.7 1.7 0 00-1.7-1H1a2 2 0 110-4h.1A1.7 1.7 0 003 9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V4a2 2 0 114 0v.1A1.7 1.7 0 0017 5.6a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11h.1a2 2 0 110 4H21a1.7 1.7 0 00-1.6 1z"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

/** 排序弹窗的上移箭头：`M6 15l6-6 6 6` */
export function ChevronUpIcon({ size = 12, color = '#a9b8ae', strokeWidth = 2.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 15l6-6 6 6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 排序弹窗的下移箭头：`M6 9l6 6 6-6` */
export function ChevronDownIcon({ size = 12, color = '#a9b8ae', strokeWidth = 2.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * 参考原型的字体方案 → RN。
 *
 * 原型的 `layout.tsx` 用 `next/font/google` 加载 Noto Serif SC（衬线，标题/牌名）与
 * Noto Sans SC（正文），字重：serif 400/500/600/700/900、sans 300/400/500/700。
 *
 * RN 里自定义字体**不做字重合成**（Android 尤其不可靠），所以每个字重注册成独立 family 名，
 * 取值时用下面的 `serif()` / `sans()` 助手，而不是设 `fontWeight`。
 *
 * 字体文件是**按本仓库用到的字集裁剪过的**（1358 个字符，9 个字重共约 4.4 MB；
 * 原始 CJK 字重每个 11~15 MB，直接打包要 120 MB）。裁剪脚本与字符集见
 * `_build/charset.txt`（由仓库内源码 + 后端中文串生成）。
 * ⚠️ 若以后新增了字符集以外的汉字，会出现豆腐块 —— 重新生成字符集与字体即可（见 README）。
 */

import { useFonts } from 'expo-font';

export const REF_FONT_SOURCES = {
  'NotoSerifSC-Regular': require('../../assets/fonts/NotoSerifSC-Regular.ttf'),
  'NotoSerifSC-Medium': require('../../assets/fonts/NotoSerifSC-Medium.ttf'),
  'NotoSerifSC-SemiBold': require('../../assets/fonts/NotoSerifSC-SemiBold.ttf'),
  'NotoSerifSC-Bold': require('../../assets/fonts/NotoSerifSC-Bold.ttf'),
  'NotoSerifSC-Black': require('../../assets/fonts/NotoSerifSC-Black.ttf'),
  'NotoSansSC-Light': require('../../assets/fonts/NotoSansSC-Light.ttf'),
  'NotoSansSC-Regular': require('../../assets/fonts/NotoSansSC-Regular.ttf'),
  'NotoSansSC-Medium': require('../../assets/fonts/NotoSansSC-Medium.ttf'),
  'NotoSansSC-SemiBold': require('../../assets/fonts/NotoSansSC-SemiBold.ttf'),
  'NotoSansSC-Bold': require('../../assets/fonts/NotoSansSC-Bold.ttf'),
} as const;

export type SerifWeight = 400 | 500 | 600 | 700 | 900;
export type SansWeight = 300 | 400 | 500 | 600 | 700;

const SERIF_NAME: Record<SerifWeight, string> = {
  400: 'NotoSerifSC-Regular',
  500: 'NotoSerifSC-Medium',
  600: 'NotoSerifSC-SemiBold',
  700: 'NotoSerifSC-Bold',
  900: 'NotoSerifSC-Black',
};

const SANS_NAME: Record<SansWeight, string> = {
  300: 'NotoSansSC-Light',
  400: 'NotoSansSC-Regular',
  500: 'NotoSansSC-Medium',
  600: 'NotoSansSC-SemiBold',
  700: 'NotoSansSC-Bold',
};

/** 衬线族：对应参考里的 `font-serif`（标题、牌名、按钮文字） */
export function serif(weight: SerifWeight = 400): { fontFamily: string } {
  return { fontFamily: SERIF_NAME[weight] };
}

/** 无衬线族：对应参考里的 `font-sans`（正文、标签） */
export function sans(weight: SansWeight = 400): { fontFamily: string } {
  return { fontFamily: SANS_NAME[weight] };
}

/** 在根布局调用一次即可；返回是否加载完成。 */
export function useRefFonts(): boolean {
  const [loaded] = useFonts(REF_FONT_SOURCES);
  return loaded;
}

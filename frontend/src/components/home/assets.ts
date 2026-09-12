/**
 * 首页资源引用（集中在这里，换正式美术时只改这一个文件）。
 *
 * 两个裁切都来自设计原图 `images/figma/fig3_0.png`（2x，860×1864）：
 *  - `home_art.png`    2x (0,800)-(860,1282)   = 1x (0,400)-(430,641)
 *                      夜色云雾 / 山石 / 人物立绘的下半段。**该区间无文字**，
 *                      所以可以直接当背景图铺。（设计图上半段被标题/标签文字压住，无法裁切，
 *                      按 DESIGN_SPEC §6 用「渐层 + 法阵同心环」重建。）
 *  - `home_avatar.png` 2x (58,122)-(146,210)   = 1x (29,61)-(73,105)
 *                      顶部信息条头像（金环内的立绘，避开金环本身）。
 */
import type { ImageSourcePropType } from 'react-native';

export const HOME_ART_SOURCE = require('../../../assets/design_crops/home_art.png') as ImageSourcePropType;
export const HOME_AVATAR_SOURCE = require('../../../assets/design_crops/home_avatar.png') as ImageSourcePropType;

/** 换美术时改这里的路径即可（仅作文档/调试用） */
export const HOME_ASSET_PATHS = {
  art: 'assets/design_crops/home_art.png',
  avatar: 'assets/design_crops/home_avatar.png',
} as const;

/** home_art.png 的宽高比（860/482），用于按画布宽度算出显示高度 */
export const HOME_ART_ASPECT = 860 / 482;

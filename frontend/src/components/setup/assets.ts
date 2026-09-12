/**
 * 对战配置页资源引用（集中一处，便于换正式美术）。
 *
 * 设计图 `images/figma/fig4_0.png` 里三个座位头像是**空环占位**（无立绘），
 * 所以 AI 座位按原图留空环 + 单字；真人座位用首页那张裁切立绘
 * `assets/design_crops/home_avatar.png`（来自 `fig3_0.png` 2x (58,122)-(146,210)），
 * 比设计稿的纯空环更有信息量，属于刻意保留的差异。
 */
import type { ImageSourcePropType } from 'react-native';

export const SETUP_HUMAN_PORTRAIT = require('../../../assets/design_crops/home_avatar.png') as ImageSourcePropType;

export const SETUP_AVATAR_PATHS = {
  human: 'assets/design_crops/home_avatar.png',
} as const;

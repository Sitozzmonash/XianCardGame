/**
 * 对战配置页几何（设计基准：430×888 @1x）。
 *
 * 设计原图 `images/figma/fig4_0.png`（860×1864 = 430×932@2x，墨玉色板）里，
 * 鎏金分隔线的实测 y（1x）为：0, 158, 191, 216, 263, 302, 355, 394, 447, 486,
 * 557, 612, 645, 684, 717, 760, 817, 832, 879, 931。去掉顶部 44 状态栏后即下面的画布坐标。
 */
export const SETUP_DESIGN_WIDTH = 430;
export const SETUP_DESIGN_HEIGHT = 888;
export const SETUP_STATUS_INSET = 44;

export const SETUP_GEOMETRY = {
  /** 标题「天劫试炼」实测 1x x29–146, y67–94 */
  title: { x: 26, y: 20, size: 27 },
  subtitle: { x: 28, y: 56, size: 11, letterSpacing: 5 },
  headerRule: { x: 0, y: 76, w: 430 },

  /** 玩家人数（设计 1x：标签 y132–142，分段控件 y158–192） */
  playerCount: {
    label: { x: 26, y: 86, size: 12 },
    control: { x: 26, y: 114, w: 378, h: 34 },
    hint: { x: 26, y: 152, size: 10 },
  },

  /** 座位与对手（设计 1x：三行卡片 y252–312 / 344–404 / 436–496） */
  seats: {
    label: { x: 26, y: 170, size: 12 },
    first: { x: 26, y: 206, w: 378, h: 60 },
    step: 92,
    hint: { x: 26, y: 480, size: 10 },
  },

  /** AI 参数（设计 1x：ISMCTS 胶囊 y612–645，MCCFR 胶囊 y684–717） */
  ai: {
    label: { x: 26, y: 500, size: 12 },
    ismctsLabel: { x: 26, y: 542, size: 11 },
    ismctsChips: { x: 26, y: 566, w: 378, h: 33 },
    mccfrLabel: { x: 26, y: 614, size: 11 },
    mccfrChips: { x: 26, y: 638, w: 378, h: 33 },
    mccfrNote: { x: 26, y: 674, size: 9.5 },
  },

  /** 高级选项（seed）——设计图没有，为保住旧页面的能力而加，压缩成一行 */
  advanced: { label: { x: 26, y: 688 }, field: { x: 150, y: 684, w: 254, h: 24 } },

  /** 主按钮「开始对战」设计 1x y760–817 → 画布 716–773 */
  primary: { x: 26, y: 716, w: 378, h: 57 },
  /** 次按钮「返回」设计 1x y832–879 → 画布 788–835 */
  secondary: { x: 26, y: 788, w: 378, h: 47 },
  /** 底部工具行（设计图没有：恢复默认 / 请求预览） */
  utility: { x: 26, y: 845, w: 378, h: 22 },
} as const;

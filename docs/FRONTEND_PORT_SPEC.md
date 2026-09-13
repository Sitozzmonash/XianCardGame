# 前端 1:1 移植规格（参考 Next.js 原型 → Expo RN）

> 参考源：`D:\Downloads\前端页面`（Next.js 16 + Tailwind 4 + shadcn，纯原型无后端）。
> 留档副本：`docs/reference-next/`（components / lib / globals.css / layout.tsx），**移植时逐行核对**。
> 目标：Expo RN 应用**视觉与交互 1:1**，数据接现有 FastAPI 后端（`legal_actions` 驱动）。
> 参考在 Web 上用 430×932 手机框预览；RN 里设备屏幕即视口，**数值 1:1 当 dp 用**。

## 1. 色板 token（从 `globals.css` 的 `@theme` 提取，勿改值）

```ts
// src/theme/ref.ts
export const ink = { 950:'#040d0c', 900:'#071614', 850:'#0a1e1b', 800:'#0c2420', 700:'#103029', 600:'#163d34' }
export const jade = { 800:'#0f3d30', 700:'#14503f', 600:'#1b6b55', 500:'#248a6e', 400:'#35a184', 300:'#5cbfa2' }
export const gold = { 700:'#8a6f3c', 600:'#a8874a', 500:'#c9a86a', 400:'#d8bd85', 300:'#e8d5a8' }
export const cream = '#ece3cf', creamDim = '#a9b8ae', creamFaint = '#6f8479'
export const blood = { 700:'#5e1f1f', 600:'#7a2b2b', 500:'#a13a3a' }
```

**透明度写法**（Tailwind `/NN` → rgba，必须逐处换算，不要四舍五入到整数百分比）：

| 类 | rgba |
|---|---|
| `bg-ink-950/80` | `rgba(4,13,12,0.80)` |
| `bg-ink-950/70` | `rgba(4,13,12,0.70)` |
| `bg-ink-950/60` | `rgba(4,13,12,0.60)` |
| `bg-ink-950/40` | `rgba(4,13,12,0.40)` |
| `bg-ink-850/60` `bg-ink-850/70` | `rgba(10,30,27,0.60)` / `0.70` |
| `border-gold-500/15|20|25|30|35|40|45|50|60` | `rgba(201,168,106,·)` 对应 0.15/0.20/0.25/0.30/0.35/0.40/0.45/0.50/0.60 |
| `border-gold-400/60|70|80` | `rgba(216,189,133,·)` |
| `border-gold-300` | `#e8d5a8`（实色） |
| `ring-gold-300/15|20` | `rgba(232,213,168,·)` |
| `text-jade-300/80|85` | `rgba(92,191,162,·)` |
| `bg-jade-500/15` `bg-jade-400/8` | `rgba(53,161,132,0.15)` / `rgba(92,191,162,0.08)` |
| `bg-gold-500/8` `bg-gold-300/25|40` | `rgba(201,168,106,0.08)` / `rgba(232,213,168,·)` |
| `bg-jade-600/25|40` `bg-jade-700/40` `bg-jade-800/25` | `rgba(27,107,85,·)` / `rgba(20,80,63,·)` / `rgba(15,61,48,·)` |
| `border-blood-500/50|60` `bg-blood-500/25` `bg-blood-700/30` | `rgba(161,58,58,·)` / `rgba(94,31,31,0.30)` |

## 2. 圆角 / 字号 / 间距（Tailwind 4 默认刻度）

| 类 | px | 类 | px |
|---|---|---|---|
| `rounded-md` | 6 | `rounded-lg` | 8 |
| `rounded-xl` | 12 | `rounded-2xl` | 16 |
| `rounded-3xl` | 24 | `rounded-full` | 999 |
| `text-[11px]`…`text-[52px]` | 直接取数字 | `text-xs/sm/base/lg/xl/2xl/3xl` | 12/14/16/18/20/24/30 |
| `tracking-[0.14em]` | `letterSpacing = 0.14 × fontSize` | `leading-tight/relaxed` | lineHeight 1.25 / 1.625 |
| `p-3.5` `px-5` `py-3.5` `gap-2.5` `gap-3.5` | 14 / 20 / 14 / 10 / 14 | `space-y-3` 等 | 逐项取 4 的倍数 |

`font-serif` = Noto Serif SC；`font-sans` = Noto Sans SC。字重：`font-medium 500` / `font-semibold 600` / `font-bold 700` / `font-black 900`。

## 3. 无法直译的 CSS → RN 方案（已确认依赖可用）

| 参考用法 | RN 方案 |
|---|---|
| `linear-gradient(180deg, …)` | `expo-linear-gradient`（已有） |
| `radial-gradient(...)`（背景 / 卡背 / 卡面压暗） | `react-native-svg` 的 `<RadialGradient>`（已装 15.15.4） |
| `backdrop-blur-sm`（底栏 / 面板） | `expo-blur` 的 `<BlurView intensity={20} tint="dark">`（已装 57.0.3） |
| 装饰圆 `blur-2xl/3xl`（光晕） | SVG 径向渐变圆（RN 无 CSS blur） |
| SVG（法阵 / 山峦 / 图标箭头/齿轮/叉） | `react-native-svg`，**路径数据原样复制** |
| `animate-spin-slow / spin-slower`（90s/160s 反向） | reanimated `withRepeat(withTiming(360,{duration:90000,easing:linear}),-1)` |
| `animate-drift / drift-slow`（26s/40s 位移） | reanimated `withRepeat` 平移 ±3% |
| `animate-pulse-glow`（4.5s 呼吸） | reanimated `withRepeat` opacity 0.55↔1 |
| `animate-rise`（弹窗升起） | reanimated `translateY 14→0 + opacity 0→1`，`cubic-bezier(0.22,1,0.36,1)` |
| `shadow-[...]`（多层） | RN `shadowColor/shadowOffset/shadowOpacity/shadowRadius` + Android `elevation`（近似，写明是近似） |
| `object-cover` / `object-top` | `<Image contentFit="cover" contentPosition>`（expo-image） |
| `mask-image: radial-gradient(...)`（主角立绘羽化） | SVG `Mask` 或叠一层径向渐变遮罩（**用 SVG Mask 更准**） |
| `scrollbar-none` | RN ScrollView 默认无滚动条，无需处理 |
| `divide-x`（统计三列） | 手写左右 1px 边框 |

## 4. 组件契约（移植后 `src/components/ref/*`，props 与参考同名）

| 组件 | 关键 props | 备注 |
|---|---|---|
| `PrimaryButton` | `children, fullWidth, disabled, onPress` | 玉绿渐变 `#2f9d7e→#1b6b55→#14503f` + `border-gold-500/60` + 顶部金发丝线 |
| `SecondaryButton` | 同上 | `bg-ink-850/70` + `border-gold-500/45` |
| `StatusTag` | `tone: 'jade'\|'gold'\|'blood'\|'muted'` | 圆角胶囊 + 1px 边 + `text-[11px]` |
| `SectionTitle` | `children, action?` | 金色衬线 `text-[15px] tracking-[0.14em]` |
| `Panel` | `children` | `.panel` 类：两层渐变底 + `border-gold-500/28` + 内高光阴影 |
| `SegmentedSelector` | `options, value, onChange, size: 'sm'\|'md', formatLabel` | 选中 = 玉绿渐变胶囊 + 金边 |
| `AISelector` | `options, value, onChange` | 小号方角标签 |
| `TopBar` | `eyebrow, title, onBack?, right?` | 大标题 30px 衬线 + 下方 `gold-hairline` |
| `IconButton` | `label, onPress, children` | 36×36 圆形金边 |
| `GameCard` | `card, size: 'sm'(70px)\|'md'(全宽)\|'lg'(248px), selected?, dimmed?, index?, onPress?` | `aspect-[3/4]`：**sm=70×93.3、lg=248×330.7**；底部渐变压暗 + 名称；`CardBack` 单独导出 |
| `PlayerAvatar` | `name, size 'sm'(36)\|'md'(48)\|'lg'(80), seat, alive` | 首字圆形 + 6 套渐变按 seat 轮转 |
| `PlayerPanel` | `seat, onKindChange` | 配置页座位行 |
| `Piles: DeckPile / DiscardPile` | `count, label?, topCardArt?, onPress?` | 牌堆三张叠卡；弃牌堆显示顶牌美术 |
| `GameModal` | `open, title, subtitle?, onClose?, footer?, tone 'jade'\|'blood'` | 底部升起 400 宽圆角 24 面板；`max-h-[52vh]` 内容区 |
| `MagicCircle` | `tone 'jade'\|'gold', spin, size/className` | 内外两圈反向自转，24 齿 + 8 齿刻线，**SVG 原样** |
| `MountainRange` / `CloudLayer` / `GameBackdrop` | `variant 'home'\|'plain'` | 背景三件套 |

## 5. 逐屏结构（1:1，行号对应 `docs/reference-next/components/screens/*`）

1. **首页**：主角立绘（`hero-cultivator.png`，`radial-gradient` 羽化 mask，`inset-x-0 bottom-[150px] top-[92px]`）→ 法阵（300×300，`top 38%`，opacity .70）→ 右上齿轮 → 居中标题组（副标 `天命既定 · 亦可改之` 11px/0.42em 玉绿；主标 `天劫战牌` 52px 黑色衬线 + 金字光；金发丝线 w=160；`2-6 人 · 策略卡牌 · 修仙主题` 12px/0.24em）→ 底部 `开启对决` 主按钮 + 两列 `卡牌图鉴 / AI 对战` + `论道对战（排位赛）· 赛季结算倒计时：4 天` 10px 灰字。
2. **对战配置**：TopBar(`天劫试炼` / `对战配置` / 返回) → 玩家人数（2–6 胶囊）→ 座位与对手（6 行 `PlayerPanel`，前 N 行显示；真人行显示 `Human` 标签，AI 行给 `Random/Rule/ISMCTS/MCCFR` 选择）→ `AI 参数` Panel（ISMCTS simulations 100/500/1000；MCCFR 模型）→ 底部 `开始对战` + `返回`。
3. **对局**：轮次胶囊（`第 N 轮（回合对决）`）→ 对手横滑卡（104 宽，头像 36 + 名字 11px + 手牌 N 张 tag）→ 战场区（法阵 360、左上 `DeckPile`、右上 `DiscardPile`、中央 `行动阶段` 20px 金 + `可使用卡牌或结束回合` 10px）→ 自己状态条（头像 + `我（太虚真君）` + `手牌 N 张` + `仙途` tag）→ 手牌横滑（70 宽小卡，左上角序号）→ 底部两列 `认输` / **`结束回合`（金色渐变按钮）**。
4. **卡牌详情**：TopBar(`卡牌玄妙` / 卡名 / 返回) → 居中大卡 248 宽（背后玉绿光晕）→ 三个标签（类别 / 副标题 / 品质）→ `卡牌效果` Panel（描述 13px + 金发丝线 + 引语 12px 斜体）→ `相关对局卡牌` 横滑 4 张小卡 → 底部 `取消` / `使用卡牌`。
5. **卡牌图鉴**：TopBar(`藏经阁` / `卡牌图鉴`) → 筛选胶囊（全部/主动/防御/天劫）→ 2 列网格（`GameCard size=md`，间距 14）→ 底部 `共 N 张 · 天命既定，亦可改之`。
6. **结算**：TopBar(`天劫试炼` / 渡劫成功｜道消身殒) → 法阵 240 + 胜者头像 80 + 名字 24px 衬线 + `最后存活 · 证道成功` → 统计三列 Panel（回合 / 出牌 / 渡劫）→ `最终排名` 列表（名次 + 名字 + 存活/淘汰 tag）→ 底部 `再来一局` + `返回主页`。
7. **AI 实验室**：TopBar(`天劫试炼` / `AI 实验室`) → 玩家人数 → `座位策略`（每座位头像 + AI 选择，含 ISMCTS/MCCFR）→ `实验参数` Panel（ISMCTS sims / MCCFR 模型 / Games 数量）→ 底部 `开始 AI 对战` + `返回`。

**移植时必须保留的交互细节**：卡面点击 → 详情页；详情的「使用卡牌」→ 按 `CARD_MODAL` 进入对应弹窗；弹窗底部按钮 `取消/确认` 两列；排序弹窗有 ↑↓ 按钮 + 序号 + 卡面缩略图 + 「可拖拽调整」提示；回插弹窗 4 个区域带**深度条**（2/3/4/3 段）与「越靠近顶部，天劫越早降临」提示。

## 6. 资产

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `assets/ref/cards/{tianjie,hujiefu,guanxingshu,nitiangaiming,raoluantianji,dunshu,shewushu,fanzhifu}.png` | 1024×1024 | 8 张卡面（`GameCard` / 弃牌堆顶牌 / 排序弹窗缩略图） |
| `assets/ref/hero/hero-cultivator.png` | 1024×1024 | 首页主角立绘 |

映射表集中在 `src/theme/refAssets.ts`（`CARD_ART: Record<CardId, ImageSource>` + `HERO_ART`）。

## 7. 验收判据

1. `npx tsc --noEmit` **0 错误**；`npx expo export --platform web` 成功。
2. 逐屏截图（430×932@2x）与参考原型**同屏对比**：结构、配色、字号、间距一致；允许差异仅限
   「RN 阴影与 CSS 多层的细微差别」「字体渲染」（若未打包字体）。
   **基准图在 `docs/ref-screens/`**（从参考原型真实运行实例抓取，非截图猜测）：
   `01_home` / `02_setup` / `03_collection` / `04_card_detail` / `06_battle` / `07_result` /
   `08_ailab` / `10_modal_target`(摄物术选目标) / `11_modal_counter`(反制) /
   `12_modal_rewrite`(逆天改命排序) / `13_modal_reinsert`(天劫回插) / `14_modal_stargazing`(观星术)。
   复现方式：`cd D:/Downloads/前端页面 && npx next dev`（默认 :3000）→ 浏览器 430×932 视口逐屏截图。
   ⚠️ 基准图右下角可能有 Next.js 开发指示器（"N Issue" 小角标）——那是开发覆盖层，不属于设计。
3. 数据全部来自后端 `GameView`（不得用原型的 mock 文案冒充）：牌堆/弃牌堆数字、手牌、对手手牌数、
   轮次、排名、统计三列（回合/出牌/渡劫）、AI 实验室的 `GET /agents` 与模型清单。
4. 卡牌交互矩阵（`docs/CARD_RULES_DELTA.md` §5）逐条可复现。
5. 未开放功能一律 `disabled` + 「未开放」角标，不做假链接。

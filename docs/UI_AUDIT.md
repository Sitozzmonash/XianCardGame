# UI 一致性审计（只读）· 修仙卡牌「天劫试炼」Expo 前端

| 项 | 值 |
|---|---|
| 审计对象 | `frontend/src/`（92 个 .ts/.tsx，14,211 行） |
| 审计日期 | 2026-09-12 |
| 审计性质 | **只读**。未修改任何代码/资产；本报告是唯一新增文件 |
| 基线校验 | `npx tsc --noEmit` → **退出码 0，0 错误**（故下列问题全部是「编译通过但运行/契约层面出错」的静默问题） |

## 权威输入（判定依据）

| 文件 | 作用 |
|---|---|
| `docs/DESIGN_SPEC.md` | 冻结设计规格（§2 双色板 token、§3 逐屏结构与文案、§4 与规则冲突时的强制处理表） |
| `docs/design_measurements.md` | 设计图 2x 原图 PIL 实测几何（1x = 430×932） |
| `docs/FRONTEND_GUIDE.md` | §3 核心色、§4 页面必须项、§11 响应式、§12 字体、§13 可访问性（≥44pt） |
| `docs/INTERFACES.md` | §1.7 卡 id/动作映射（冻结）、§4.1 响应字段严格白名单 |
| `backend/app/services/events.py` | 事件流真实契约（隐藏信息纪律） |
| `frontend/src/theme/{colors,typography,spacing}.ts` | token 声明 |

方法：脚本化 set-diff（token 声明 ↔ 引用；样式名 ↔ `styles.X`；导出符号 ↔ import），按 DESIGN_SPEC §3/§4 逐条人工核对，并按技能提示核验了**括号动态取值**（见 §C 脚注，避免误报死 token）。

---

## 结论摘要

| 类别 | 🔴高 | 🟠中 | 🟡低 | 合计 |
|---|---|---|---|---|
| A. 违反冻结设计规格 | 2 | 3 | 5 | 10 |
| B. 跨页视觉漂移 | 2 | 6 | 4 | 12 |
| C. 静默缺口 | 3 | 5 | 7 | 15 |
| **合计** | **7** | **14** | **16** | **37** |

**最该先修的 3 件事**
1. **C1/C2** — 对战日志/动画读错事件字段，真后端下每张牌都会显示成「未知牌」、淘汰者显示成「天机」。
2. **A1** — 对局页整页底色用了墨玉渐变，与 DESIGN_SPEC §2「对局用夜蓝色板」直接冲突（作者已在 `NightStage.tsx` 注释里承认这个缺口，但只修了卡牌详情）。
3. **A7/B7** — 同一类别 `DEFUSE` 在两处中文标签不同（`护劫符` / `护劫`），且手牌与详情弹窗分别取不同来源。

---

## A. 违反冻结设计规格

### 🔴 A1 对局页整页底色用墨玉渐变，DESIGN_SPEC §2 要求夜蓝色板

- 调用点：`frontend/src/app/battle.tsx:163`、`frontend/src/app/battle.tsx:202` — `<ScreenBackground variant="battle">`
- 实际取色：`frontend/src/components/layout/ScreenBackground.tsx:45` → `colors={gradients[variant]}` → `frontend/src/theme/colors.ts:109`
  `battle: ['#04120F', '#06191B', '#0B2929']`（三个 hex 全部属于**墨玉色板**）
- 夜蓝版应为 `frontend/src/theme/colors.ts:92` `nightGradients.battle = ['#070F14', '#0E1A22', '#263E4D']`，它**只被动画横幅用**（`frontend/src/components/event-animator/EventAnimator.tsx:133`），页面底从未使用。
- 作者自证缺口：`frontend/src/components/card-detail/NightStage.tsx:18` 注释「ScreenBackground 只会给出墨玉色板渐变」—— 据此为卡牌详情写了 `NightStage`，但**漏了对局页**。
- 另：`frontend/src/app/_layout.tsx:19` 把 `colors.background`（墨玉 `#06191B`）设为全屏 contentStyle，夜蓝三屏的根容器底色同样是墨玉。

**建议**：给 `ScreenBackground` 增加 `night` 变体（或让 battle 页改用 `NightStage`），底色取 `nightGradients.battle`。

---

### 🔴 A2 DESIGN_SPEC §4「类型行显示真实中文类别」——同一类别两个中文名

- `frontend/src/components/card-detail/card-visuals.ts:75` → `DEFUSE: '护劫符'`（`app/cards.tsx:222`、`CardDetailView` 走这条）
- `frontend/src/utils/card-catalog.ts:106` → `DEFUSE: '护劫'`（`components/game-card/GameCard.tsx:122` 无障碍标签、`components/game-card/CardDetailSheet.tsx:64` 标签、`theme/colors.ts:124` 同一份表）
- 后果：手牌/详情弹窗显示「护劫」，图鉴/卡牌详情显示「护劫符」，同屏可同时出现两种写法。
- 注：`ACTIVE/REACTIVE/TRIBULATION` 三项两表一致，仅 `DEFUSE` 分叉。

---

### 🟠 A3 首页底色未使用为该屏实测的夜蓝渐变（DESIGN_SPEC §2「渐变用 gradients / nightGradients」）

- `frontend/src/theme/colors.ts:90` `nightGradients.home = ['#0E1A22','#1B3345','#78B2C4','#B3D4D7']` — **0 引用**
- 首页实际用 `frontend/src/components/home/HomeBackdrop.tsx:23`（`SKY_GRADIENT` 5 个字面色）、`:25`（`NIGHT_GRADIENT` 5 个）、`:31-32`（两行各 6 个）—— 共 **22 个字面色字面量**，既不是 token 也不在设计规格的渐变表里。
- 兜底色同样是字面量：`frontend/src/app/index.tsx:311` `backgroundColor: '#ACA393'`

---

### 🟠 A4 首页「演示」标注与规格要求的形态不一致

- 规格（DESIGN_SPEC §4 末行）：首页资源 `12.4K+/350+`、等级「炼气九层」→ **版式保留，值用静态演示占位，并在该区域小字标注「演示」**
- 实现：`frontend/src/app/index.tsx:41-45` 静态值 ✔；标注 `frontend/src/components/home/PlayerStatusBar.tsx:106` 文案是「**资源为演示占位**」（不是「演示」），且位置在 `demoTag`（`components/home/design.ts:24` `right:26, y:46`），与资源行 `y:24` 分离。
- 同区域被额外控件侵占：`PlayerStatusBar.tsx:104-124` 在同一行塞了**数据源切换按钮**（设计稿该处无控件），导致标注右对齐位置同时容纳 badge + 数据源标签。

---

### 🟠 A5 「结束回合」按钮文案与设计规格不符（但与契约一致，属规格自身冲突，前端选择正确）

- 设计规格 §3.3 #6 + §4 要求按钮为「**结束回合**」。
- 实现 `frontend/src/app/battle.tsx:411` `label={endAction?.label ?? '结束回合'}`，后端 label 由 INTERFACES §1.7 冻结为「**结束行动并抽牌**」（`frontend/src/api/mock.ts:385`）。
- 判定：前端遵循 INTERFACES 是**正确**的；问题在 DESIGN_SPEC §3.3 与 INTERFACES §1.7 文案未对齐（见 §D）。

---

### 🟡 A6 阶段提示文案与设计稿措辞不同

- 设计规格 §3.3 #3：阶段提示「**行动阶段 · 可使用卡牌或结束回合**」
- 实现 `frontend/src/components/battle/BattleHeader.tsx:24` `ACTION: '可使用卡牌 或结束回合'`，且「行动阶段」在另一行（`components/battle/PhaseBanner.tsx:35-37`）
- 差异：丢失「·」分隔、多一个空格、拆成两行。

---

### 🟡 A7 首页主标题与 FRONTEND_GUIDE §4.1 必须项冲突

- FRONTEND_GUIDE §4.1「必须」列表含「**天劫试炼**」；实现首页主标题是「**天劫战牌**」（`frontend/src/app/index.tsx:48`，与 DESIGN_SPEC §3.1 #3 一致）。
- 同一 App 内其余处一律「天劫试炼」：`app/setup.tsx:365`、`app/result.tsx:82`、`components/setup/SetupHeader.tsx:16`、`app/+not-found.tsx:32`、`app/_sitemap.tsx:29`、`utils/event-log.ts:47,96`。
- 见 §D 需裁决。

---

### 🟡 A8 文档标题（`<title>`）后缀三套写法

| 页面 | `<title>` | 证据 |
|---|---|---|
| 首页 | `天劫战牌 · **修仙策略卡牌**` | `app/index.tsx:119` |
| 对战配置 | `对战配置 · **天劫试炼**` | `app/setup.tsx:365` |
| 对局/结算/图鉴/实验室/404/站点地图 | `… · **修仙卡牌**` | `battle.tsx:165,204`、`result.tsx:41,77`、`cards.tsx:134,157`、`ai-lab.tsx:173`、`+not-found.tsx:23`、`_sitemap.tsx:25` |

---

### 🟡 A9 设计稿未定义但被计入「必须」的首页入口缺失

FRONTEND_GUIDE §4.1 必须列表含「**AI 对战**」「**单机练习**」两项入口。实现里 `frontend/src/app/index.tsx:98-105` 定义了 `startSetup('ai')` / `startSetup('solo')` 两个预设，但**唯一调用点是 `startSetup('trial')`**（`index.tsx:185`）—— 两个分支为死代码，首页无任何 AI 对战/单机练习入口，也没有按 §4.1「可明确 disabled，不要假链接」做成 disabled 占位。

---

### 🟡 A10 设计规格要求的首页次入口数量与实现不符（信息性）

设计规格 §3.1 #7 只列两个次入口（藏经阁 / 修仙之法）。实现在该行之下额外渲染了一条「底部工具行」（`frontend/src/app/index.tsx:230-266`，4 个 `HomeTextLink`：数据源 / AI 实验室 / 放弃当前对局 / 重新检测后端），位置 `components/home/design.ts:57` `utility: { y: 800, h: 20 }`。作者已在 `design.ts:56` 注明「设计图没有，用于保住旧首页的功能」—— 属**已知且有意的偏离**，此处仅登记。

---

### ✅ 核对通过项（DESIGN_SPEC §4 强制表）

| §4 条目 | 证据 | 判定 |
|---|---|---|
| 费用位不显示数字，改显示类型符点 | `components/game-card/GameCard.tsx:51-57,147-172`；`components/card-detail/card-visuals.ts:79-84` | ✅ |
| 牌堆一律用后端真实数字，不硬编码 28 | `app/battle.tsx:267` `count={view.public.deck_count}`；`components/deck-pile/DeckPile.tsx:58-62` | ✅ |
| 「极品」品质位隐藏 | 卡面无品质位渲染路径（`CardFace.tsx` 无对应节点） | ✅ |
| 认输 = `DELETE /api/v1/games/{id}` + 回首页（二次确认） | `app/battle.tsx:400-409`（打开确认）、`:455-459`（确认后 `clearGame()`）、`store/game-store.ts:299-304`（真正调 `apiDeleteGame`） | ✅ |
| 「收回法术/施展法术」= 取消/确认，仅在 legal_actions 有对应动作时可点 | `components/card-detail/CardDetailView.tsx:110-158`；`app/cards.tsx:93-128`（只从 `directActionForCard` 推导） | ✅ |
| 「结束回合」= `END_ACTION` | `app/battle.tsx:188-189,411,416-420` | ✅ |
| 「修仙之法（卡组）」disabled +「未开放」角标、不做假链接 | `app/index.tsx:202-214`（`disabled` 且无 `onPress`） | ✅ |
| 「论道对战（排位赛）· 赛季结算倒计时：4天」disabled + 角标 | `app/index.tsx:215-227`、`:54` `SEASON_DAYS = 4` | ✅ |
| 「藏经阁（卡牌）」→ `/cards` | `app/index.tsx:200` | ✅ |
| 底部免责小字「抵制不良游戏…」 | `app/index.tsx:275` | ✅ |
| §3.2 #4 MCCFR 100K/500K/Champion 改为真实 `GET /agents` 清单 | `app/setup.tsx:134-149,296-301`（正确偏离：规则以真实数据为准） | ✅ |
| §3.4 #4 引语仅对设计稿出现过的牌渲染 | `components/card-detail/card-visuals.ts:110-112`（只 `REWRITE_FATE`「天命虽定，亦可改之。」） | ✅ |
| §3.5 结算文案「渡劫成功」/「最后存活 · 证道成功」/ 回合·出牌·渡劫三列 / 名次列表 / 再来一局·返回主页 | `app/result.tsx:58,61`；`components/result/result-stats.ts:49-71`；`components/result/ResultRanking.tsx:40`；`components/result/ResultActions.tsx:45,58` | ✅ |
| §5 字体：标题衬线 / 正文黑体，不打包字体文件 | `theme/typography.ts:9-24`（`fontFamily.title`/`.body`，系统回退） | ✅ |
| §6 资产从 2x 设计图裁切 + `asset-map.ts` 集中映射 | 14 个 `require(...)` 目标**全部存在**于 `frontend/assets/design_crops/`（见 §C 脚注） | ✅ |

---

## B. 跨页视觉漂移（同一元素在不同页面尺寸/颜色/圆角/字号不一致）

### 🔴 B1 「主操作按钮」有 5 套独立实现，圆角/边框/字号/高度全部不同

| 页面 | 组件 | 填充 | 圆角 | 边框 | 标签字号 | 高度 |
|---|---|---|---|---|---|---|
| 首页 | `components/home/HomeButton.tsx:37,83,91,97` | `nightGradients.jadeButton` `#4EB294→#2E7A63` | `dp(10)` | `dp(1.2)` | 17（jade）/15 | 58（`home/design.ts:51`） |
| 对战配置 | `components/ui/PrimaryButton.tsx:27-39,100,118,127` | `gradients.jade` `#1C716B→#0B2929` | `radius.md`=10 | `borderWidth.thin`=1.5 | `text.button`=16 | 57（`setup/design.ts:47`） |
| 对局 | `components/ui/NightButton.tsx:39,69,131-138` | 手写 `#5CC1A2→#3E9C7F→#1F6B58` | `radius.md`=10 | `borderWidth.hair`=1 | 14 | `layout.buttonH`=42·s |
| 结算 | `components/result/ResultActions.tsx:39,74-76,91` | `gradients.jade` | **14** | `borderWidth.hair`=1 | 16 | **53** |
| 卡牌详情 | `components/card-detail/CardDetailView.tsx:278-311` | `nightGradients.jadeButton` | **8**（`DETAIL_ACTIONS.radius`，`card-visuals.ts:52`） | `hair`=1 | 14 | **43** |

→ 圆角 3 种（8/10/14）、边框 3 种（1/1.2/1.5）、标签字号 3 种（14/16/17）、高度 6 种（42/43/48/53/57/58）。

### 🔴 B2 玉绿主色出现 3 种值，色板只定义 2 种

- `theme/colors.ts:8` `colors.jade = '#1C716B'`（墨玉，配置/结算用）
- `theme/colors.ts:56` `nightColors.jade = '#4EB294'`（夜蓝，首页/对局/图鉴用）
- **第三种**：`components/ui/NightButton.tsx:39` 手写 `jade: ['#5CC1A2', '#3E9C7F', '#1F6B58']` —— 用于**对局页主按钮**，而 DESIGN_SPEC §2 规定对局页用 `nightColors.jade`。
- 同页的「玉绿」因此有三处不同来源：`ActionMeter.tsx:45` 手写 `#4EB294`、`config/design.ts` 高亮用 token、`NightButton` 用 `#5CC1A2`。

### 🟠 B3 鎏金渐变与 golden 描边色重复且末段不同

- `theme/colors.ts:102` `nightGradients.goldEdge = ['#E3CC91','#C9A65A','#8D7A46']` — **0 引用**
- `components/ui/NightButton.tsx:38` 手写 `gold: ['#E3CC91','#C9A65A','#A8862F']`（仅第三段不同）
- `components/ui/NightButton.tsx:45` 手写 `'#8D7A46'` = `nightColors.goldSoft`（`theme/colors.ts:66`）的字面复制

### 🟠 B4 遮罩层 4 种、内边距 3 种

| 位置 | 背景 | padding |
|---|---|---|
| `components/dialogs/DialogFrame.tsx:117-122` | `nightColors.overlay` = `rgba(4,10,14,0.84)` | 16 |
| `components/game-card/CardDetailSheet.tsx:140-145` | `nightColors.overlay` | 16 |
| `app/battle.tsx:581-587` | `nightColors.overlay` | **24** |
| `app/setup.tsx:720-729` | **手写** `'rgba(3,13,14,0.86)'` | **20** |
| `components/ui/LoadingOverlay.tsx:43` | `colors.scrim` = `rgba(3,13,14,0.55)` | — |

- `theme/colors.ts:20` `colors.overlay = 'rgba(3, 13, 14, 0.82)'` — **0 引用**；`setup.tsx:726` 重造了同色系但 **alpha 不同（0.86）** 的字面量。

### 🟠 B5 弹窗卡片圆角/内边距不一致

- `DialogFrame.tsx:128` `radius.lg`=16，内部 padding 12
- `CardDetailSheet.tsx:151` `radius.lg`=16，padding 12，maxWidth 430
- `app/battle.tsx:591` `radius.lg`=16，padding 14，maxWidth 360
- `app/setup.tsx:734` **`borderRadius: 12`**，padding 16，maxWidth 400

### 🟠 B6 关闭「×」按钮尺寸/字号不一致（且两条低于 §13 的 44pt）

- `components/dialogs/DialogFrame.tsx:171-182`：`minWidth/minHeight = minTouchTarget`(44)，`fontSize: 20`
- `components/battle/BattleNotice.tsx:108-118`：**20×20**，`fontSize: 14` → 触控目标不达标

### 🟠 B7 危险强调色 `#D98C84` 裸露在 6 处，色板无此 token

`components/dialogs/CounterDialog.tsx:127`、`ReinsertTribulationDialog.tsx:177`、`ReorderTopDialog.tsx:283`、`components/game-card/CardDetailSheet.tsx:208`、`components/ui/NightTag.tsx:27`、`components/event-animator/EventAnimator.tsx:24`

同时 `theme/colors.ts:13` `colors.danger = '#A4423D'` 与 `nightColors.danger`（`:72`）都被用作「危险」，加上 `#D98C84` 共 3 个危险色。

### 🟠 B8 「屏内主标题」取色 4 种

| 页面 | 取色 | 证据 |
|---|---|---|
| 首页主标题 | 手写 `#E7CE94` | `components/home/HeroTitle.tsx:106` |
| 卡牌详情「相关卡牌」 | `nightColors.gold` `#BEA144` | `CardDetailView.tsx:248` |
| 卡牌图鉴标题 | `nightColors.celadonLight` | `app/cards.tsx:264` |
| 结算 eyebrow | `colors.goldLight`（墨玉） | `app/result.tsx:149` |

### 🟡 B9 页面主标题字号 4 种

`components/home/design.ts:44` 44 · `components/setup/design.ts:14` 27 · `app/cards.tsx:261` 22 · `app/result.tsx:153` 44 · `components/not-found/Seal404.tsx:61` 44 · `components/ai-lab/LabHeader.tsx:56` 22

### 🟡 B10 头像尺寸 4 种

`components/player-panel/PlayerPanel.tsx:99` 30×30 · `components/dialogs/TargetPlayerDialog.tsx:141` 30×30（重复字面量） · `components/home/design.ts:20` d=55 · `components/setup/SeatRow.tsx:73` `borderRadius: 27` → d=54 · `components/ai-lab/AgentCard.tsx:102-105` `minTouchTarget`=44

### 🟡 B11 「返回」控件 3 套形态

- 文字链接：`app/cards.tsx:253-257` `fontSize 14` + `nightColors.gold`；`CardDetailView.tsx:188-192` 同上（一致）
- 墨玉文字链接：`components/ai-lab/LabHeader.tsx:49` 用 `colors.goldLight`
- 胶囊：`components/battle/BattleHeader.tsx:120-138` `height:24` + `fontSize:10` + `radius.pill`

### 🟡 B12 页面外壳 2 套（且职责重叠）

- `components/layout/ScreenBackground.tsx`（3 个 variant，全走**墨玉** `gradients`）
- `components/card-detail/NightStage.tsx`（夜蓝，仅 `/cards` 用，`app/cards.tsx:132,155`）
→ 夜蓝页缺外壳，是 A1/A3 的根因。

---

## C. 静默缺口

### 🔴 C1 事件文案读错字段层级：真后端下大量「未知牌」「天机」

- **真契约**：`backend/app/services/events.py:231-236` `render_event()` 只返回 `{seq, type, actor, data}`；文件头 `:12` 明写「每个事件只允许 `seq / type / actor / data` 四个键」。牌名在 `data.card_id`（`:104`），受害者/被淘汰者在 `data.target`（`:139,152`）或 `actor`（`:200`）。
- **前端映射**：`frontend/src/api/game.ts:115-126` 读的是**顶层** `value.target` / `value.card_id` / `value.message` → 真后端下恒为 `null`。
- **渲染**：`frontend/src/utils/event-log.ts:33-35` 取 `event.actor/target/card_id`，`:54,62,68,83,88` 使用：

| 事件 | 代码位置 | 真后端实际会显示 |
|---|---|---|
| `CARD_PLAYED` | `event-log.ts:50-56` | `X 打出【**未知牌**】`（**每一次出牌**） |
| `CARD_STOLEN` | `event-log.ts:59-66` | `X 夺走了 **天机** 的一张牌 · 摄物术得手：**未知牌**` |
| `PLAYER_ELIMINATED` | `event-log.ts:87-88` | `**天机** 道消身殒`（后端把被淘汰座位放在 `actor`，见 `events.py:200`） |
| `COUNTER_OPENED` | `event-log.ts:68` | `**天机** 是否打出【反制符】？` |

对照：同一文件里 `:28`（`event.data?.region`）与 `:92`（`event.data?.winner`）**读的是 data**，说明是局部笔误而非整体设计。`tsc` 不报错（`types/event.ts:44-56` 声明了这些顶层键）。

### 🔴 C2 mock 与真后端契约不一致，掩盖了 C1

- `frontend/src/api/mock.ts:486` `ev('CARD_STOLEN', { actor: 0, target, card_id: stolen })`、`:508` `card_id: lost`
- 真后端 `backend/app/services/events.py:150-152`：**明确不回传被偷的牌**（注释：「谁被偷是公开的，偷到什么是私有的」）
- 后果：演示模式（`MOCK`）下日志正确，切到真后端立刻出现 C1 的「未知牌」；`frontend/src/api/mock.ts:385` 的 label 与真实契约一致，说明 mock 只在事件载荷上漂移。

### 🔴 C3 `types/event.ts` 声明的 `message` 从未被使用

- `frontend/src/types/event.ts:53` 注释：「服务端可直接给出中文描述，**前端优先使用它作为日志文案**」
- `frontend/src/api/game.ts:123` 确实映射了 `message`
- 但 `utils/event-log.ts` **全文件 0 次读取 `event.message`**（全仓 `event.message` 命中仅 `api/game.ts:123` 一处写入）→ 死契约字段 + 文档承诺未兑现。

### 🟠 C4 `components/ui/NightPanel.tsx` 整组件从不渲染

- 文件 102 行，含完整样式体系（`NightPanel.tsx:27-35` 调色板、`:82` `padded`、`:87,98` 字号）
- 全仓 `<NightPanel` JSX 使用数 = **0**；`export function NightPanel` 从未被 import。

### 🟠 C5 死 token 清单（已剔除括号动态取值误报）

> 脚注：`ScreenBackground.tsx:45` 用 `gradients[variant]`，因此 `gradients.home/battle/plain` **不是**死 token（初版脚本会误报，已核验修正）。`nightGradients.battle` 由 `EventAnimator.tsx:133` 使用，同样不是死 token。

| token 文件:行 | 名称 | 引用数 |
|---|---|---|
| `theme/colors.ts:20` | `colors.overlay` | 0（`setup.tsx:726` 重造了近似字面量） |
| `theme/colors.ts:30` | `colors.white` | 0（`cards.tsx:358` 用的是 `nightColors.white`） |
| `theme/colors.ts:29` | `colors.black` | 仅被 `theme/spacing.ts:37,44,51` 的 `shadows` 引用 → 传递死 |
| `theme/colors.ts:48` | `nightColors.surfaceRaised` | 0（`PlayerPanel.tsx:172` 用 `rgba(26,44,57,0.94)` = 同色 alpha） |
| `theme/colors.ts:50` | `nightColors.panel` | 0（`NightPanel.tsx:28` 用 `rgba(38,62,77,0.88)`） |
| `theme/colors.ts:51` | `nightColors.panelSoft` | 0 |
| `theme/colors.ts:57` | `nightColors.jadeDeep` | 0 |
| `theme/colors.ts:58` | `nightColors.jadeMid` `#348470` | 0（`DeckPile.tsx:40` 字面量 `'#348470'`；`card-visuals.ts:91` `rgba(52,132,112,0.92)`） |
| `theme/colors.ts:66` | `nightColors.goldSoft` `#8D7A46` | 0（`NightButton.tsx:45` 字面量） |
| `theme/colors.ts:84` | `nightColors.black` | 0 |
| `theme/colors.ts:110` | `gradients.modal` | 0 |
| `theme/colors.ts:114` | `gradients.cardArt` | 0 |
| `theme/colors.ts:115` | `gradients.tribulationCard` | 0 |
| `theme/colors.ts:90` | `nightGradients.home` | 0 |
| `theme/colors.ts:96` | `nightGradients.cardFace` | 0 |
| `theme/colors.ts:100` | `nightGradients.celadonGlow` | 0 |
| `theme/colors.ts:102` | `nightGradients.goldEdge` | 0 |
| `theme/colors.ts:119` | `categoryColors`（整对象） | 0 —— 其语义被 `card-visuals.ts:87-92` 的 `CARD_TYPE_TINTS` 用**不同数值**重写 |
| `theme/spacing.ts:6` | `spacing.none` | 0 |
| `theme/spacing.ts:14` | `spacing.xxl` | 0 |
| `theme/spacing.ts:15` | `spacing.xxxl` | 0 |
| `theme/spacing.ts:22` | `radius.xl` | 0 |
| `theme/spacing.ts:35` | `shadows`（整对象，3 条阴影） | 0 |
| `theme/typography.ts:26` | `fontWeight`（整对象） | 0 |
| `theme/typography.ts:33` | `fontSize`（整个字号阶梯） | 0 —— 全项目 **204 处**字号都是裸数字 |
| `theme/typography.ts:78` | `text.subtitle` | 0 |
| `theme/typography.ts:84` | `text.body` | 0 |

`text.*` 变体使用率：`label` 24 · `caption` 10 · `title` 3 · `heading` 2 · `gold` 2 · `display` 1 · `button` 1 · `bodyStrong` 1 · `subtitle` 0 · `body` 0。

### 🟠 C6 死导出（函数/常量，全仓 0 引用）

`utils/card-catalog.ts:85` `cardAssetOf` · `store/game-store.ts:334` `selectInputLocked` · `store/game-store.ts:338` `selectIsGameOver` · `utils/legal-actions.ts:102` `isWaitingForOthers` · `api/mock.ts:789` `resetMockSession` · `api/game.ts:155` `usingMock` · `:159` `apiEndpoint` · `:215` `gameApi` · `types/game.ts:30` `REINSERT_REGIONS` · `components/home/assets.ts:18` `HOME_ASSET_PATHS` · `components/setup/assets.ts:13` `SETUP_AVATAR_PATHS`（两者只经 barrel 再导出，无页面使用）

### 🟠 C7 首页两个 AI 入口预设为死分支

见 A9：`app/index.tsx:98-105` 的 `'ai'` / `'solo'` 分支无调用点，唯一调用 `startSetup('trial')`（`index.tsx:185`）。

### 🟠 C8 `PhaseIndicator` 两个属性声明后被弃用

`components/battle/PhaseIndicator.tsx:22-24` `actionsUsed` / `maxActions`，注释自述「保留契约…仅为兼容调用方」；调用处 `app/battle.tsx:281-291` 未传任一。

### 🟡 C9 `NightTag` 存在不可达分支

- `components/ui/NightTag.tsx:10,28` `tone: 'dark'` —— 全仓 0 处传入
- `components/ui/NightTag.tsx:34` `solid` 属性——全仓 0 处传 `true`，故 `:46,53` 的实心分支（`#07130F` 字色）不可达
- 已用到的 tone：`jade`/`gold`/`celadon`/`muted`/`danger`（`PlayerPanel.tsx:122-123`、`CardDetailSheet.tsx:64`）

### 🟡 C10 `GameEventData` 两个字段声明后 0 读取

`frontend/src/types/event.ts:36-37` `position` / `amount`（全仓 `data.position`、`data.amount` 命中 0）。

### 🟡 C11 snake_case 属性破坏命名一致性

`components/battle/SelfStrip.tsx:17,20` 与调用点 `app/battle.tsx:342` 用 `alive_seat_count`（同组件其余属性为 `handCount` / `isMyTurn`）。

### 🟡 C12 触控目标 < 44pt（FRONTEND_GUIDE §13）

| 位置 | 尺寸 |
|---|---|
| `components/home/HomeButton.tsx:120-166` `HomeTextLink` 无 `minHeight`，所在行 `components/home/design.ts:57` `utility.h = 20` | ≈20px（首页 4 个入口：数据源 / AI 实验室 / 放弃当前对局 / 重新检测后端） |
| `components/ui/Banner.tsx:78` `action.minHeight = 32` | 32px |
| `components/battle/BattleNotice.tsx:109-110` `close` 20×20 | 20px |
| `components/battle/BattleHeader.tsx:121` `chip.height = 24` | 24px |

对照：`components/ui/DialogFrame.tsx:172-173`、`components/ui/NightButton.tsx:132`、`components/ui/PrimaryButton.tsx:99`、`components/ai-lab/AgentCard.tsx:103-105` 都正确使用了 `minTouchTarget`。

### 🟡 C13 Expo 模板残留资产（无任何引用）

`frontend/assets/images/react-logo.png` / `react-logo@2x.png` / `react-logo@3x.png` / `tabIcons/explore*.png` / `tabIcons/home*.png` / `tutorial-web.png` / `expo-logo.png` / `logo-glow.png` / `expo-badge.png` / `expo-badge-white.png`、`frontend/assets/expo.icon/`（`icon.json` + `Assets/*.svg`、`grid.png`）
→ 全仓（除 `node_modules`/`dist`）文本检索命中 0。
**仍在用**：`app.json` 引用的 `splash-icon.png` / `favicon.png` / `android-icon-*`（属正常）。

### 🟡 C14 尺寸字面量重复（同值手写多份）

- 头像 30×30 / `borderRadius: 15`：`components/player-panel/PlayerPanel.tsx:99` 与 `components/dialogs/TargetPlayerDialog.tsx:141`
- 头像 55：`components/home/design.ts:20`（仅 d 一个数字，半径在 `PlayerStatusBar.tsx:54` 现算）
- 弹窗圆角 6：`app/setup.tsx:671,688`、`components/dialogs/DialogFrame.tsx:143`、`components/setup/ParamChips.tsx:66`、`components/card-detail/card-visuals.ts:42`（`radius.sm` 已存在却未用）
- `borderRadius: 999`：`app/setup.tsx:635`、`components/home/PlayerStatusBar.tsx:141,191`、`components/setup/PlayerCountSelector.tsx:51,72`（`radius.pill` 已存在）

### 🟡 C15 `SelfStrip` 存活计数标签省略主语

`components/battle/SelfStrip.tsx:28` 渲染 `… · 存活 {alive_seat_count}`（如「存活 3」），未说明是「本局存活人数」，与同组件 `text`（`:25`）的完整句式风格不一致。

---

## D. 冻结文档之间的自相矛盾（需人工裁决，非实现缺陷）

| # | 冲突 | 双方证据 | 实现选择 |
|---|---|---|---|
| D1 | 首页主标题 | `docs/DESIGN_SPEC.md:37`「天劫战牌」↔ `docs/FRONTEND_GUIDE.md:95`「天劫试炼」 | 跟 DESIGN_SPEC（`app/index.tsx:48`） |
| D2 | 结束回合按钮文案 | `docs/DESIGN_SPEC.md:58,84`「结束回合」↔ `docs/INTERFACES.md:229`「结束行动并抽牌」 | 跟 INTERFACES（`app/battle.tsx:411`，正确） |
| D3 | 是否允许绝对像素定位 | `docs/DESIGN_SPEC.md:17-18`「实际像素、间距、圆角请用 PIL 在设计原图上量」↔ `docs/FRONTEND_GUIDE.md:452`「不要按某一张图的绝对像素硬编码整个页面」 | 首页/配置页选 DESIGN_SPEC（`app/setup.tsx:386` `transform:[{scale}]` + 全 absolute 定位）；对局/图鉴选 FRONTEND_GUIDE（`components/battle/battle-layout.ts:9-11`、`hooks/use-responsive.ts:26`） |
| D4 | `NightPanel` 与 `Panel` 并存但无使用方 | 两文件都有完整实现；DESIGN_SPEC §2 只声明两套色板 | `Panel` 在用、`NightPanel` 未用（C4） |

---

## E. 工时估算与建议顺序

| 优先级 | 项 | 建议动作 | 预估 |
|---|---|---|---|
| P0 | C1 + C2 | `utils/event-log.ts` 改读 `event.data.card_id` / `event.data.target`；`types/event.ts` 收敛为 `{seq,type,actor,data}`；同步修正 `api/mock.ts:486,508` 去掉 `card_id` | 0.5d |
| P0 | A1 | `ScreenBackground` 增 `night` variant 或 battle/cards 统一走 `NightStage` | 0.5d |
| P0 | A2/B7 | 合并 `CARD_TYPE_LABELS` 与 `CATEGORY_LABELS` 为单一来源；补 `dangerSoft`/`dangerText` token | 0.5d |
| P1 | B1/B2/B3 | 抽 `Button` 变体表（按两套色板参数化），删 3 套重复实现 | 1.5d |
| P1 | C5/C6 | 删死 token/死导出，或让组件真正改用 `fontSize`/`spacing`/`radius` token | 1d |
| P1 | C12 | 补 `minTouchTarget` 到 HomeTextLink / Banner / BattleNotice / BattleHeader chip | 0.5d |
| P1 | A4/A6/A8/A9 | 文案与入口校正（演示标注、阶段提示、title 统一、补 AI/单机入口或显式 disabled） | 0.5d |
| P2 | B4/B5/B6/B8-B12, C4/C7-C11/C13-C15 | 统一遮罩/弹窗/标题/头像/返回控件；清模板资产 | 2d |
| P2 | D1-D4 | 文档层裁决（改 DESIGN_SPEC 或 FRONTEND_GUIDE，随后同步实现） | 0.5d |

---

## G. 处理状态（主控在审计后立即修复的部分）

| 项 | 状态 |
|---|---|
| **C1 事件读错字段层级** | ✅ **已修**。`utils/event-log.ts` 改为全部从 `event.data` 取（`data.name` 优先、`data.target`、`data.region`、`data.winner`）；`types/event.ts` 收敛为 `{seq,type,actor,data}` 并按 `backend/app/services/events.py` 逐事件列出字段表；`api/game.ts` 删除顶层 `target/card_id/message` 映射；`components/dialogs/SpecialDecisionLayer.tsx:83` 改为「从同一 actor 的前置 `CARD_PLAYED` 取牌名」。**真后端实测：日志不再出现「未知牌」。** |
| **C2 mock 契约漂移** | ✅ **已修**。`api/mock.ts` 全部事件改为 `ev(type, actor, data)`，与真后端逐事件对齐；`CARD_STOLEN` 不再回传被偷的牌（真后端故意不回传，属隐藏信息纪律）、`PLAYER_ELIMINATED` 把座位放 `actor`、`CARD_DRAWN` 不再带牌面。 |
| **C3 `message` 死契约** | ✅ **已删**。类型与映射里去掉了从未被后端发送、也从未被渲染的 `message`。 |
| **A1 对局页用错色板** | ✅ **已修**。`ScreenBackground` 增加 `tone="night"` 维度（走 `nightGradients.battle` + `nightColors.background`），`app/battle.tsx` 两处外壳显式指定。 |
| **A2 同类牌两个中文名** | ✅ **已修**。`utils/card-catalog.ts` 的 `DEFUSE` 统一为「护劫符」，`card-visuals.ts` 改为复用同一来源。 |
| **B7 `#D98C84` 裸色** | ✅ **已修**。`nightColors.dangerText` 新增，6 处裸字面量替换（颜色值不变，纯 token 化）。 |
| B1/B2/B3 按钮 5 套实现、玉绿 3 种值、重复渐变 | ⬜ **未修**（P1）。建议按「两套色板参数化的 Button 变体表」重构，属结构性改动，单独一轮做。 |
| C5/C6 死 token（29 个）与死导出（12 个） | ⬜ **未修**（P1）。建议要么删、要么让组件真正改用 `fontSize`/`spacing`/`radius`（当前 204 处字号是裸数字）。 |
| C12 触控目标 <44pt（4 处） | ⬜ **未修**（P1）。补 `minTouchTarget` 即可。 |
| A4/A6/A8/A9 文案与入口校正 | ⬜ **未修**（P1）。含 `title` 后缀三套写法、首页缺「AI 对战/单机练习」入口（当前是死分支）、演示标注形态。 |
| B4/B5/B6/B8-B12、C4/C7-C11/C13-C15 | ⬜ **未修**（P2）。遮罩/弹窗/标题/头像/返回控件统一 + 清 Expo 模板残留资产（10 个文件 + `assets/expo.icon/`）。 |
| D1-D4 冻结文档自相矛盾 | ⬜ **需人工裁决**（文档层，不是代码缺陷）。 |

**优先级建议**：B1/B2（按钮与玉绿的 5 套/3 种实现）最值得先做 —— 它们是「视觉漂移」的根因，修完 B4/B5/B6/B8 等会自然收敛；C5/C6 的死 token 清理可以并入同一次重构。

---

## F. 附：本次核验的「无问题」项（避免重复排查）

- **`tsc --noEmit` 0 错误**（已实跑）。
- **14 个 `require(...)` 资产目标全部存在**于 `frontend/assets/design_crops/`，无悬挂引用（双向核对：7 张 `battle_art_*`/`battle_avatar_*` 由 `theme/asset-map.ts` 经 `CardArt.tsx:21-22`、`TargetPlayerDialog.tsx:94`、`PlayerPanel.tsx:101` 实际渲染；`card_art_*`/`card_thumb_*` 由 `card-visuals.ts:98-104` 使用；`home_art.png`/`home_avatar.png` 由 `home/assets.ts:14-15`、`setup/assets.ts:11` 使用；`result_badge.png` 由 `ResultBadge.tsx:8` 使用）。
- **四个特殊决策弹窗均为独立组件**，未塞进 `battle.tsx`（FRONTEND_GUIDE §4.5 / INTERFACES §5 铁律 4）：`components/dialogs/{TargetPlayerDialog,CounterDialog,ReorderTopDialog,ReinsertTribulationDialog}.tsx`，由 `SpecialDecisionLayer.tsx:125-177` 按 phase 分派。
- **他人手牌零泄漏**：`components/player-panel/PlayerPanel.tsx:126-147` 只画「牌背 ×N」+「牌背 · 仅本人可见」，不含任何牌面。
- **输入锁定 + revision 防重**：`store/game-store.ts:218,236-240`（提交前查 `isSubmitting`/`animationQueue`、提交带 `revision`），`app/battle.tsx:82`（`locked` 驱动全部交互 disable）。
- **409 冲突有可见反馈**（非静默）：`store/game-store.ts:250-261` 自动 `refreshGame()` + notice。
- **未引入图标库、未打包字体文件**（DESIGN_SPEC §5/§6 要求）：`frontend/package.json` 无 icon 库；`theme/typography.ts:9-24` 全系统字体回退。

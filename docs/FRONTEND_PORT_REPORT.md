# 前端重做交付报告（按新参考 1:1 移植）

> 参考源：`D:\Downloads\前端页面`（Next.js 16 + Tailwind 4 + shadcn/ui，纯原型、无后端）。
> 留档副本：`docs/reference-next/`；**参考的真实截图基准：`docs/ref-screens/`（12 张）**。
> 移植规格：`docs/FRONTEND_PORT_SPEC.md`；卡牌规则差异：`docs/CARD_RULES_DELTA.md`。

## 1. 一句话结论

前端**整体推倒重做**：以参考原型为唯一视觉与交互权威，在 Expo RN 里 1:1 复刻（含 8 张卡牌立绘、
SVG 法阵自转、四类卡牌交互弹窗），并把数据面全部接回现有 FastAPI 后端。
逐屏与参考的**量化像素差 11.0–21.8**（旧版同口径为 80.3）。

## 2. 交付内容

| 层 | 文件 | 行数 | 说明 |
|---|---|---|---|
| 主题 | `src/theme/ref.ts` | 122 | 色板/圆角/间距/字距，**逐值机器校验与参考 `globals.css` 一致（23/23）** |
| 主题 | `src/theme/refFonts.ts` | 65 | Noto Serif/Sans SC 10 个字重（本地 TTF，`useFonts` 注册） |
| 主题 | `src/theme/refAssets.ts` | 30 | 卡牌 id → 立绘映射（换美术只改这里） |
| 核心件 | `src/components/ref/{Icons,primitives,Backdrop,GameCard,Piles,PlayerAvatar,PlayerPanel,GameModal,ScreenShell}.tsx` | 1 825 | 按钮/标签/面板/胶囊选择器/页头 + 法阵/山峦/云带 + 卡牌三尺寸 + 弹窗框架 |
| 页面 | `src/app/{index,setup,battle,cards,result,ai-lab,_sitemap,+not-found}.tsx` + `card/[cardId].tsx` | — | 9 个路由（含 8 张卡牌页静态产物） |
| 组件 | `src/components/ref/{screens,modals}/*` | ~3 900 | 7 屏 + 4 个卡牌交互弹窗 + 2 个辅助弹窗 |

**旧代码全部清除**：删除 82 个旧文件（旧 `components/{home,setup,battle,result,card-detail,dialogs,game-card,deck-pile,action-bar,player-panel,event-animator,ui,ai-lab,layout,not-found}` + 旧 `theme/{colors,spacing,typography,asset-map}`），用导入图可达性算出而非凭感觉删。

## 3. 还原度实测（430×932@2x，与 `docs/ref-screens/` 同名图对比）

| 屏 | 整页差 | 去角标差 | 备注 |
|---|---|---|---|
| 首页 | 16.5 | 16.1 | 差异主要来自主角立绘羽化（CSS `mask-image` → SVG Mask 近似） |
| 对战配置 | 11.1 | 12.6 | — |
| 卡牌图鉴 | 17.4 | 18.8 | 排序/筛选态不同（真实 8 张 vs 原型静态数组） |
| 卡牌详情 | 21.8 | 25.0 | 与参考不是同一张卡（内容差）；**同卡（天劫）重测 16.4，无 >35 分带** |
| 对局 | 11.9 | 11.8 | 牌堆/手牌内容不同（真实对局 vs 原型假数据） |
| 结算 | **9.1** | 9.6 | 真后端终局（道消身殒 / 回合 11 / 渡劫 ≥1 / 排名） |
| AI 实验室 | 14.7 | 16.6 | 模型清单来自真实 `GET /agents` |
| 选目标弹窗 | 11.0 | 9.8 | 真后端：选中目标后确认按钮才可用 |
| 排序弹窗 | 12.9 | 12.0 | 真后端 `REORDER_TOP` |
| 天劫回插弹窗 | 16.3 | 16.7 | 真后端：4 个区域 |
| 反制弹窗 | 16.6 | 18.3 | 我方多一行「使用遁术」（规则改动导致的有意差异） |

> 口径：0–255 平均绝对差，见 `scripts/compare_screens.py`。旧版同口径 80.3。
> **对局页曾出现 79.6 的假差异**，定位后确认是截图管线把页面之外补白的采集伪影（页面当时只渲染了 ~620 CSS px），
> 重采后为 11.9。教训：像素差必须先排除采集伪影再下结论。

## 4. 资产与字体

| 项 | 处理 | 体积 |
|---|---|---|
| 8 张卡牌立绘 | 参考 1024² → 512²（最大显示 248pt，2x 够用） | 13.3 MB → 2.9 MB |
| 主角立绘 | 原样 1024² | 2.1 MB |
| 字体 | **按用到的字符裁剪**（初版 1358 字 → agent 新增文案后 1387 字） | 120 MB → **4.9 MB**（10 个字重） |

> 字体不裁剪的话光字体就 ~120MB（CJK 每字重 11–15MB），不可能打包。
> 字符集由全仓（frontend + backend + docs + 参考副本）扫描生成，`_build/charset.txt` 可复现。

## 5. 卡牌交互矩阵（用户强调的「每张牌功能都不一样」）

| 牌 | 触发条件（全部由 `legal_actions` 派生，前端不复制规则） | 弹窗 | 提交 |
|---|---|---|---|
| 摄物术 | 手牌 → 使用卡牌 → 存在 `PLAY_CARD_TARGET` | **选目标**（候选取自 `params.target_player.options` 的跨动作并集） | `PLAY_CARD_TARGET` + `{target_player}` |
| 反制符 | `COUNTER`/`PASS_COUNTER` 且轮到我决策 | **反制**（是否反制） | `COUNTER` / `PASS_COUNTER` |
| 遁术（新） | 同上窗口内出现 `ESCAPE` | 反制弹窗内**多一行遁术** | `ESCAPE` |
| 逆天改命 | `REORDER_TOP` 且轮到我 | **排序**（拖拽 + ↑↓ + 确认顺序） | `REORDER_TOP` + `{order}` |
| 观星术（新规则） | 同 `REORDER_TOP`（改为查看+改序） | 同排序弹窗 | 同上 |
| 护劫符 | `REINSERT_TRIBULATION`（抽到天劫自动化解后） | **天劫回插**（4 个区域，仅给后端提供的区域可点） | `REINSERT_TRIBULATION` + `{region}` |
| 扰乱天机 | 手牌 → 使用卡牌（直接结算） | 无 | `PLAY_CARD` |
| 天劫 | 不可主动使用（`enabled=false` → disabled + 理由） | — | — |

## 6. 真后端验证（已完成项，均为实测）

- 首页/图鉴/详情/AI 实验室的数据全部来自真实 API（`GET /cards`、`GET /agents`）。
- 配置页 **按人数过滤模型**：3 人局只列 3 人模型（`MCCFR 3P 10K` 等），2 人模型被排除 ✓。
- `POST /games` → 进入对局页，显示真实轮次、牌堆/弃牌堆计数、对手**只有张数**（隐私隔离）✓。
- **排序弹窗**在真实 `REORDER_TOP` 下弹出并提交成功（手牌 5→4、阶段回到 `ACTION`、私有牌顶知识保留）✓。
- **选目标弹窗**选中目标后确认按钮才可用（disabled→enabled），提交后真实结算 ✓。
- **摄物术被 AI 反制后反弹**：我的手牌 4→2、目标仍是 5 张、弃牌堆 +2 ✓。
- **反制弹窗**（seed=6 复现）：`是否反制 / 「青梧散人 对你使用了摄物术」/ 不反制 · 使用反制符 · **使用遁术（避开并结束结算）**` ✓。
- **遁术闪避端到端**：选「使用遁术」后 → 对手手牌不变（偷窃被抵消）、我方手牌 5→4（遁术消耗）、回合 1→2 ✓。
- **天劫回插弹窗**：抽到天劫自动用护劫符后弹出，4 个区域（顶部/靠近顶部/中部/底部）+「越靠近顶部，天劫越早降临」✓。
- **结算页**：真实终局数据（结局/回合/出牌/渡劫/排名），`渡劫` 在事件流不完整时诚实显示 `≥n` ✓。

三窗口的**原始 `legal_actions` 硬证据**（不依赖 UI）：

```bash
python scripts/probe_rule_windows.py --games 10
# ★ 排序窗口：['调整顶部牌序']
# ★ 反制窗口：['不反制', '使用反制符', '使用遁术（避开并结束结算）']   ← 手里有遁术时才出现第三项
# ★ 天劫回插窗口：['回插：牌堆顶', '回插：靠近顶部', '回插：牌堆中部', '回插：牌堆底部']
```

> 复现某一局的入口（新增）：`/setup?players=2&seed=6` —— 同 seed + 同人数 + 同对手策略 → 同牌序与同 AI 决策，
> 便于复现问题与取证。非法值会忽略并在页面提示（不静默）。

## 7. 与参考的有意差异（都有理由）

1. **近似项**：CSS `backdrop-blur` → `expo-blur`；CSS 多层阴影 → RN 单层阴影；`blur-3xl` 装饰圆 → SVG 径向渐变；
   `mask-image` → `react-native-svg` 的 Mask+RadialGradient；HTML5 拖拽 → `PanResponder`（↑↓ 必然可用）。
2. **诚实降级**：参考原型的静态数组（模型名、结局、排位赛入口）在真实数据缺失时**不编造**——
   显示「未开放」+ 原因、或「连接不上后端」+ 重试；未开放的入口一律 `disabled` + 角标。
3. **新增真实功能**：AI 实验室的训练命令提示、模型人数不匹配警告、事件播放（可点按跳过）。
4. **新增两屏**：`+not-found` 与 `_sitemap` 参考里没有，按新 token 自建（风格一致）。

## 8. 工程侧修复（本轮发现并修）

| 问题 | 根因 | 处理 |
|---|---|---|
| 排序/回插弹窗在真后端永不弹出 | `src/api/game.ts` 的 `normalizePhase()` 白名单只有 `REORDER`/`REINSERT`，后端实际发 `REORDER_TOP`/`REINSERT_TRIBULATION` → **静默回落成 `ACTION`** | 改为**显式映射表**并注明两端命名差异 |
| 单文件 `tsc` 往源码目录漏 `.js`，Metro 优先解析 `.js` 遮蔽 `.tsx` | `tsconfig` 继承的 `noEmit` 被单文件 `tsc` 绕过 | `tsconfig.json` 显式加 `noEmit`；`accept.sh` 增加产物泄漏检查 |
| 新写的界面文案出现字符集外汉字（会显示豆腐块） | 字体字符集在 agent 写代码**之前**生成 | 重新扫描全仓 → 1387 字 → 重裁 10 个字重 |
| 截图管线白边造成 79.6 的假像素差 | 页面渲染高度小于截图高度 | 重采 + 增加「白边检测」步骤 |

## 9. 如何复现验证

```bash
# 前端类型检查
cd frontend && npx tsc --noEmit

# 构建（mock 演示 / 真后端各一套）
EXPO_PUBLIC_USE_MOCK=1 npx expo export --platform web --output-dir dist-ref --clear
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8030/api/v1 npx expo export --platform web --output-dir dist-real2 --clear

# 本地预览（clean URL + 嵌套路由）
python scripts/serve_dist.py frontend/dist-real2 --port 8091

# 与参考基准比像素差
python scripts/compare_screens.py --pair 06_battle docs/ref-screens/06_battle.png docs/screenshots/06_battle.png
```

## 10. 尚未完成

- iOS/Android 真机安装验证（需用户用 Expo Go 扫码）。
- 部署（Render 后端 / Netlify 前端）待用户提供凭据。
- `docs/UI_AUDIT.md` 的 P1/P2 项（旧版一致性审计结论，部分已随重做失效，需重新审计）。
- 观星术与逆天改命改后**功能等价**（都进排序窗口）——按原型文案实现，若要保持差异需产品裁决。

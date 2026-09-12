# 前端状态与视觉交接（等 Figma）

> 2026-09-12 记录。**视觉层暂停**：当前界面是「结构 + 交互」可用但**视觉未定稿**，
> 等 Figma 设计规范到位后再做换皮。后端（FastAPI + 引擎 + AI）不受影响，继续推进。

## 1. 现在做到哪一步（可用部分）

已完成且经过实测（浏览器真跑，非自述）：

| 项目 | 状态 |
|---|---|
| Expo SDK 57 + expo-router + TypeScript + Zustand 工程 | ✅ 可跑 |
| 6 个页面：Home / Setup / Battle / Cards / Result / AI Lab(占位) | ✅ 渲染正常 |
| 4 个特殊决策弹窗：反制 / 摄物术选目标 / 逆天改命排序 / 天劫回插 | ✅ 独立组件 |
| 所有可点击元素由后端 `legal_actions` 驱动 | ✅ 实测（不可用的牌显示"不可用"） |
| revision 防重复提交 + 409 冲突恢复 | ✅ 含 mock 下的冲突模拟器 |
| 事件动画队列（events[] 按 seq 播放） | ✅ |
| mock 数据源（无后端也能走完整一局） | ✅ |
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npx expo export --platform web` | ✅ 可产出 dist/ |

目录约定（重要）：路由在 `frontend/src/app/`，其余在 `frontend/src/{api,components,store,theme,types}`。

## 2. 换皮成本低的原因

所有颜色集中在 `src/theme/colors.ts`、字号字重在 `src/theme/typography.ts`、间距在
`src/theme/spacing.ts`，卡牌/按钮/面板的大小由组件 props 与 theme 决定，**没有把设计稿当背景图贴**。
因此拿到 Figma 后，主要工作是：替换 token 值 → 调整组件尺寸/圆角/边框 → 接入 SVG/WebP 资产，
不需要重写页面结构。

## 3. 已知待修（不阻塞换皮）

1. 各路由导出的 HTML `<title>` 为空（需要给每个路由设标题，做 web 分享/SEO 时必须有）。
   —— 注：C1 在被暂停前已修（`src/app/_sitemap.tsx` + 各路由 Head），需重新 export 复验。
2. mock 目前是默认数据源，改完后默认真后端，仅 `EXPO_PUBLIC_USE_MOCK=1` 时用 mock。
   —— 已修：`src/api/client.ts` 默认走真后端，首页另有运行期「使用演示数据」入口。
3. **他人出牌显示成【未知牌】**：`CARD_PLAYED` 是公开事件且带 `card_id`，应显示牌名；
   当前 UI 过度保护，丢掉了玩家有权知道的公开信息。
4. 战斗日志偶发截断渲染（如 `[12] 遁`），需要检查日志行的文案拼接。
5. 视觉细节：参考图分辨率不足，卡面装饰、法阵、云雾、粒子的真实质感无法从图里还原。

## 3.1 真后端联调已实测通过（2026-09-12）

用 `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8020/api/v1 npx expo export --platform web` 构建
（默认即真后端，无需 `EXPO_PUBLIC_USE_MOCK`），浏览器实测：

- 首页显示「数据源：真实后端 / 已连接 0.1.0」（真调 `/health`）
- Setup → 开始 → `POST /api/v1/games` → 进入 Battle，显示后端真实数据（3 人牌堆 15 张、revision 1）
- 点「结束行动并抽牌」→ `POST /api/v1/games/{id}/actions` → revision 1→5（人类动作 + AI 自动行动）
- 战斗日志出现 AI 真实回合（观星术 / 遁术跳过抽牌），他人抽牌显示「牌面仅本人可见」
- 事件动画队列工作：出现「动画播放中（剩余 N）」且输入被锁定为「处理中…」

截图：`docs/screenshots/04_battle_real_backend.png`、`05_battle_real_play.png`

## 4. 需要从 Figma 拿到什么（交接清单）

**A. 页面 frame（每个都要，含画板尺寸）**

```text
Home（首页）
Setup（对局设置）
Battle（对局）—— 优先级最高，含：对手面板区 / 牌堆 / 弃牌堆 / 手牌区 / 行动条 / 日志
  └ 还需要这些状态变体：轮到我 / 等待 AI / 手牌选中 / 无可用动作
Card Detail（卡牌详情）
Result（结算）
Cards（图鉴）
AI Lab（如已设计）
Special Dialogs（4 个弹窗：反制 / 选目标 / 改命排序 / 天劫回插）
```

**B. Design Tokens（最关键的产出物）**

- 色板：每个颜色的**用途 + 状态**（默认 / 按压 / 选中 / 禁用 / 危险），含透明度层级
- 字体：中文标题与正文的具体字体名与字重（交接文档里提到 Noto Serif SC / Noto Sans SC，
  请确认最终选择并给**可商用授权**的字体文件或来源）
- 字号 / 行高 / 字距阶梯；间距阶梯；圆角阶梯；阴影与发光参数（blur / spread / 颜色 / 透明度）

**C. 组件规格**

- 卡牌：整体尺寸、圆角、边框宽度与颜色、Cost/名称/类型/插画/说明的相对位置与字号、
  **可出 / 不可出 / 选中 / 悬停 4 态的视觉区分**（不能只靠颜色，需要一个非颜色通道，例如描边粗细或角标）
- 按钮：主 / 次 / 危险 / 禁用 四态，含触控最小尺寸（≥44pt）
- 玩家面板、牌堆 / 弃牌堆、行动条、弹窗容器、Toast/错误提示

**D. 资产（要矢量或无损，不要截图）**

- 图标：SVG
- 卡面插画 / 角色头像 / 背景原画：PNG(2x) 或 WebP，或给原始尺寸的大图
- 卡背、符箓、法阵、云雾、雷电等特效素材（能分层最好）

**E. 动效说明（如果有）**

- 出牌 / 抽牌 / 天劫 / 护劫 / 洗牌 的时长、缓动曲线、序列关系（文字描述也可以）

**F. 导出方式（任选其一）**

1. Figma 分享链接开 **view 权限**（我可以尝试读 Figma REST API 或页面）
2. 逐 frame 导出 PNG 2x，放进本仓库 `images/figma/`（文件名用上面的英文名，如 `battle.png`）
3. Figma Variables / Dev Mode 导出的 tokens JSON

## 5. 换皮时的执行顺序（届时照做）

```text
tokens 落进 src/theme/*        → 全站颜色字号立刻变
Battle 页组件尺寸/描边/圆角对齐 → 影响最大
Card 组件 4 态视觉 + 资产接入
其余页面（Home / Setup / Result / Cards）
动效（Reanimated）
最后才是粒子/法阵等装饰
```

> 参考：交接文档里的 Figma 链接是
> `https://www.figma.com/design/BZhWnFsoMNtLGS5Oi9PfGr`，重点看 `02 HiFi Expo`。
> 请确认最终以哪一份为准。

# 设计还原规格（Design Spec v0.1）

> 依据：用户提供的 5 张设计稿（`images/figma/`）。**精度要求：尽量还原，以设计原图为最终依据。**
> 但游戏规则以 `docs/xiuxian_card_ai_project_spec.md` + 后端为唯一权威 —— 两者冲突时按 §4 处理。

## 1. 设计源文件（2x 原图，860×1864 = 430×932@2x）

| 文件 | 屏 | 备注 |
|---|---|---|
| `images/figma/fig3_0.png` | **首页** | 夜蓝色板 |
| `images/figma/fig3_1.png` | **对局** | 夜蓝色板，最复杂、优先级最高 |
| `images/figma/fig3_2.png` | **卡牌详情** | 夜蓝色板 + 米黄卡面 |
| `images/figma/fig4_0.png` | **对战配置** | 墨玉色板（= FRONTEND_GUIDE 冻结 token） |
| `images/figma/fig4_1.png` | **结算** | 墨玉色板 |

1x 版本在 `screen_A..E.png` + `design_*_full.png`（备用，精度低，仅用于快速看整体）。
**实际像素尺寸、间距、圆角请用 PIL 在设计原图上量**，
不要目测（例：`Image.open(f).crop(box)` 后取像素，或用逐带主导色找到分界）。

## 2. 两套色板（已冻结在 `src/theme/colors.ts`，直接取用，不要新造颜色）

- **墨玉色板** `colors`：`background #06191B` / `surface #0B2929` / `jade #1C716B` /
  `jadeLight #57B3A4` / `gold #C9A65A` / `goldLight #E3CC91` / `paper #E8DEC5` /
  `text #F0E8D2` / `muted #91A6A0` → 用于 **对战配置、结算**
- **夜蓝青瓷色板** `nightColors`：`background #0E1A22` / `backgroundDeep #070F14` /
  `surface #13232F` / `surfaceRaised #1A2C39` / `panel #263E4D` / `panelSoft #2D4857` /
  `celadon #78B2C4` / `celadonLight #B3D4D7` / `jade #4EB294` / `jadeDeep #165E4E` /
  `card #F5E6C8` / `cardShade #E1C89D` / `cardEdge #C9A65A` / `gold #BEA144` /
  `text #E8F1F2` / `muted #8FA3AD` → 用于 **首页、对局、卡牌详情**
- 渐变用 `gradients` / `nightGradients`。

## 3. 逐屏结构与文案（y 为 430×932 坐标系，供定位参考；以原图为准）

### 3.1 首页 `fig3_0`
1. 顶部个人信息条：左侧圆形头像 + 名字「太虚真君」+ 小字「炼气九层」；右侧资源「12.4K+」「350+」
2. 主视觉：夜色云雾 + 山峦 + 法阵 + 人物立绘（占屏中部大半）
3. 主标题「**天劫战牌**」（大字衬线、鎏金）；副标题「修仙策略卡牌对决」
4. 标签行「2-6人 · 策略卡牌 · 修仙主题」
5. 两句 slogan：「天道无常唯我证道」「一念心战三千劫」
6. 主按钮「**开启对决（开始斩劫）**」（玉绿 / 发光）
7. 次入口「藏经阁（卡牌）」「修仙之法（卡组）」
8. 「论道对战（排位赛）· 赛季结算倒计时：4天」
9. 底部小字「抵制不良游戏 拒绝盗版游戏 注意自我保护 理性消费」

### 3.2 对战配置 `fig4_0`
1. 标题「天劫试炼」+ 小字「对战配置」
2. 「玩家人数」：2人 / 3人 / 4人 / 5人 / 6人（单选，选中态高亮）
3. 「座位与对手」：三行信息（头像 / 名字 / 角色标签）：`我 · Human`、`玄墨真人 · Rule`、`清月仙子 · ISMCTS`
4. 「AI 参数」：`ISMCTS simulations` → 100 / 500 / 1000（也支持 2000）；`MCCFR 模型` → 100K / 500K / Champion
5. 主按钮「**开始对战**」（`#1C716B`），次按钮「返回」

### 3.3 对局 `fig3_1`（最优先）
1. 顶部：「第 3 轮」+ 阶段标识
2. 对手面板区：每个对手一张卡（头像 / 名字 / 手牌数 / 存活状态 / AI 类型）
3. 中央：法阵 + 阶段提示「行动阶段 · 可使用卡牌或结束回合」；左「牌堆(N)」右「弃牌堆(N)」
4. 手牌区：横向排列，米黄卡面 + 金边；每张卡显示名称、插画、「费用位」
5. 我的信息条：「我（太虚真君）手牌：N 张」
6. 底部主按钮「**结束回合**」+ 次按钮「认输」

### 3.4 卡牌详情 `fig3_2`
1. 大卡面（插画占比大）+ 金色描边圆角
2. 卡名「逆天改命」+ 类型行 + 品质位
3. 效果说明区（米黄底）：「查看牌堆顶部最多3张牌，并重新调整顺序。」
4. 引语：「天命虽定，亦可改之。」
5. 「相关卡牌」列表（名称 + 费用位）
6. 底部按钮：「收回法术」（次）/「施展法术」（主）

### 3.5 结算 `fig4_1`
1. 标题「天劫试炼」+ 主文案「**渡劫成功**」
2. 副标题：胜者名 + 「最后存活 · 证道成功」+ 圆形徽记
3. 统计三列：`回合 9` / `出牌 14` / `渡劫 2`
4. 最终排名列表（名次 / 名字 / 存活或淘汰），行间分隔线
5. 按钮：「再来一局」（主）/「返回主页」（次）

## 4. 与冻结规则冲突时的处理（**强制，不要自作主张**）

| 设计稿元素 | 冲突 | 处理 |
|---|---|---|
| 卡面「1费 / 2费」 | **规则无费用**，只有「每回合最多 2 张主动牌」 | 费用位**不显示数字**，改显示该牌的类型符点（主动 / 反制 / 天劫 / 护劫）；「行动 已用/上限」放在对局 HUD 上 |
| 「牌堆(28)」 | 3 人局实际 15 张 | **一律用后端真实数字**，不得硬编码 28 |
| 类型「秘术·逆天级」 | 我们只有 `category`（主动/反制/天劫/护劫） | 类型行显示真实中文类别；「极品」品质位**隐藏** |
| 「认输」 | 契约无 surrender | 认输 = `DELETE /api/v1/games/{id}` + 回首页（二次确认） |
| 「收回法术 / 施展法术」 | — | = 取消 / 确认使用；**只有 `legal_actions` 里存在对应动作时才可点** |
| 「结束回合」 | — | = `END_ACTION` |
| 首页资源 `12.4K+` / `350+` / 等级「炼气九层」 | V1 无账号体系 | 版式保留，值用**静态演示占位**，并在该区域小字标注「演示」 |
| 「藏经阁（卡牌）」 | 真实存在 | 跳 `/cards` |
| 「修仙之法（卡组）」「论道对战（排位赛）·赛季倒计时」 | V1 无此功能 | **明确 disabled + 「未开放」角标**，不做假链接（FRONTEND_GUIDE §4.1 要求） |

**任何一处都不能违反的铁律**（FRONTEND_GUIDE + INTERFACES）：所有可点击元素由 `legal_actions` 驱动、
提交带 `revision` 防重复、事件队列播放时才解锁输入、绝不在前端推断规则合法性、绝不显示他人手牌。

## 5. 字体

- 标题（卡名 / 大标题 / 阶段名）：衬线 —— iOS `Songti SC`、Android `serif`、
  Web `"Noto Serif SC","Songti SC",serif`（已封装在 `src/theme/typography.ts` 的 `fontFamily.title`）
- 正文与按钮：黑体 —— `fontFamily.body`
- **不打包字体文件**（许可与包体未确认）；用系统字体回退。

## 6. 资产策略

- 设计图里的插画 / 头像 / 背景是**位图**，我们无源文件。
- 做法：**从 2x 设计图裁切**（`images/figma/fig3_*.png`，860×1864，卡面插画约 200×270 像素可用），
  存到 `frontend/assets/design_crops/`，并在 `src/theme/asset-map.ts` 里集中映射。
- 后续换正式美术时**只改 asset-map.ts**，不需要动页面。
- 找不到合适裁切的位置，用「渐变 + 符箓纹理 + 印章式卡名」的 CSS 占位，不要留白框。
- 图标优先用文字符号/矢量绘制；**不要引入图标库**。

## 7. 验收（必须自己跑）

```bash
cd D:/Documents/Hermes/xiuxian-card/frontend
npx tsc --noEmit                                  # 必须 0 错误
npx expo export --platform web --output-dir dist  # 必须成功
```

然后**无头浏览器逐屏截图**并与设计图对照（可参考本仓库已用的做法）：

```bash
cd dist && python -m http.server 8098 --bind 127.0.0.1   # 后台
# 用 CDP 真实鼠标事件点击（RN Web 里 JS 合成 PointerEvent 无效）：
#   cdp('Input.dispatchMouseEvent', type='mousePressed'/'mouseReleased', x=…, y=…, button='left', clickCount=1)
# 按钮可能在视口外：先 el.scrollIntoView({block:'center'}) 再取 getBoundingClientRect() 中心
```

截图存到 `docs/screenshots/design_<屏名>.png`，并在汇报里说明与设计图的**已知差异**。
坐标可用 `Emulation.setDeviceMetricsOverride` 固定为 430×932，方便与设计稿逐一对照。

# FRONTEND_GUIDE.md

# 1. 技术

```text
Expo
React Native
TypeScript
expo-router
Zustand
React Native Reanimated
Gesture Handler
expo-image
expo-linear-gradient
```

V1 不建议引入大型游戏引擎。

---

# 2. 视觉依据

按优先级：

```text
1. Figma / 02 HiFi Expo
2. images/ 下的高保真参考图
3. 组件的一致性和真实可实现性
```

Figma：

https://www.figma.com/design/BZhWnFsoMNtLGS5Oi9PfGr

参考图不是最终像素规范，也不要整张图作为页面背景上线。

应拆成：

```text
背景原画
角色头像
卡牌插画
装饰框
按钮
法阵 / 雾气 / 粒子
文字和真实 UI
```

---

# 3. 设计方向

关键词：

```text
东方仙侠
深青 / 墨黑
玉色
鎏金
水墨云雾
月色
法阵
符箓
克制的发光效果
```

核心色建议：

```text
background: #06191B
surface:    #0B2929
jade:       #1C716B
jadeLight:  #57B3A4
gold:       #C9A65A
goldLight:  #E3CC91
paper:      #E8DEC5
danger:     #A4423D
text:       #F0E8D2
muted:      #91A6A0
```

不要把 UI 做成普通 SaaS App。

---

# 4. 页面

## 4.1 Home

必须：

```text
玩家头像 / 名称
修仙卡牌
天劫试炼
2–6 人 / 策略卡牌 / 修仙主题
开始试炼
AI 对战
单机练习
卡牌图鉴
```

V1：

```text
开始试炼 → setup
单机练习 → setup
AI 对战 → ai-lab 或 setup
卡牌图鉴 → cards
```

如果部分功能尚未完成，可明确 disabled，不要假链接。

## 4.2 Setup

用于：

```text
玩家人数
Human 座位
AI 类型
ISMCTS simulations
MCCFR model
Seed（高级选项）
```

默认：

```text
3 人
P0 = Human
P1 = Rule
P2 = ISMCTS 500
```

点击：

```text
开始
→ POST /games
→ battle
```

## 4.3 Battle

最核心页面。

区域：

```text
Round Header
Opponent Panels
Battle Arena
Deck
Discard
Phase Indicator
Human Player
Hand
Action Buttons
```

前端不能通过牌名自己决定是否可点。

判断：

```text
legal_actions
```

## 4.4 Card Detail

点击手牌：

```text
CardDetailSheet / Modal
```

显示：

```text
卡牌插画
卡名
类型
效果说明
确认使用
取消
```

只有存在对应 legal action 时显示“确认使用”。

## 4.5 Special Decision Dialogs

独立组件：

```text
TargetPlayerDialog
CounterDialog
ReorderTopDialog
ReinsertTribulationDialog
```

不要把所有特殊逻辑塞进 `battle.tsx`。

## 4.6 Result

```text
胜利 / 淘汰
赢家
玩家结果
再来一局
返回首页
```

## 4.7 Cards

展示当前 8 张核心牌。

不需要数据库，定义从：

```text
GET /cards
或
本地静态 metadata
```

读取。

---

# 5. 状态管理

Zustand：

```ts
type GameStore = {
  gameId?: string
  view?: GameView
  selectedCardId?: string
  isSubmitting: boolean
  animationQueue: GameEvent[]
  error?: string

  createGame(): Promise<void>
  submitAction(): Promise<void>
  refreshGame(): Promise<void>
  selectCard(): void
  clearGame(): void
}
```

不要复制完整 GameState 到前端。

---

# 6. API 请求原则

每次动作：

```text
lock input
→ POST action
→ 得到 GameView + events[]
→ 更新权威 state
→ events 进入 animationQueue
→ 顺序播放
→ unlock input
```

用户连续点击时必须防重复提交。

同时用：

```text
revision
```

避免旧状态动作重复执行。

---

# 7. 动画

V1 Reanimated 足够。

建议：

## 出牌

```text
卡牌抬起
→ 放大
→ 飞向中心
→ 光效
→ 消失 / 进入弃牌
```

## 抽牌

```text
Deck
→ 卡背飞向 Hand
→ flip / reveal（仅自己可见）
```

## 天劫

```text
屏幕暗
→ 雷光
→ 卡牌放大
→ 红色脉冲
```

## 护劫符

```text
符箓出现
→ 金色光
→ 天劫裂解
```

## 洗牌

```text
牌堆快速分散
→ 聚合
→ known-top UI 清除
```

动画绝不能延迟后端状态。

State 已经是新的真实状态，动画只是表现。

---

# 8. 图片资产

目录：

```text
assets/
├── backgrounds/
│   ├── home.webp
│   └── battle.webp
├── cards/
│   ├── tribulation.webp
│   ├── defuse.webp
│   ├── stargazing.webp
│   ├── rewrite_fate.webp
│   ├── shuffle.webp
│   ├── escape.webp
│   ├── steal.webp
│   └── counter.webp
├── characters/
│   ├── player.webp
│   ├── opponent_01.webp
│   └── opponent_02.webp
├── ui/
└── effects/
```

优先使用：

```text
WebP
```

透明 UI 装饰可：

```text
PNG / WebP alpha
```

Icon 尽量 SVG。

---

# 9. 当前交付图的使用方式

本包：

```text
images/00_concept_board.png
images/01_home_hifi.png
images/02_battle_hifi.png
images/03_card_detail_hifi.png
```

用途：

```text
视觉目标
布局参考
美术拆分依据
给生图 Agent 继续生成一致资产
```

不要：

```text
直接把 01_home_hifi.png 当全屏背景再叠透明按钮
```

否则不同设备尺寸和交互都会出问题。

---

# 10. Card 组件

建议 API：

```tsx
<GameCard
  card={card}
  state="idle | playable | selected | disabled"
  size="hand | preview | detail"
  onPress={...}
/>
```

卡牌结构：

```text
Cost
Name
Artwork
Type
Optional short hint
Border
Selection glow
```

手牌画面只显示简短信息。

完整规则放 Detail。

---

# 11. 响应式

设计图是纵向手机。

实现：

```text
SafeAreaView
useWindowDimensions()
max-width constraints
百分比 + aspectRatio
```

不要按某一张图的绝对像素硬编码整个页面。

主目标：

```text
iPhone
Android 19.5:9 / 20:9
Expo Web 基础可用
```

---

# 12. 字体

优先使用合法可打包字体。

推荐方向：

```text
标题：中文宋体 / 书法感 Serif
正文：清晰中文 Sans
```

Figma 当前使用类似：

```text
Noto Serif SC
Noto Sans SC
```

Expo 中确认字体文件许可和真实包体后使用。

不要把标题做成图片，除非最终 Logo 单独作为品牌资产。

---

# 13. Accessibility / 操作

即使是游戏：

```text
按钮触控 ≥ 44pt
关键文字对比清晰
不能只靠颜色区分 playable / disabled
弹窗支持返回关闭
网络请求显示 loading
```

---

# 14. Expo 配置

`.env`：

```text
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

生产环境改 Render URL。

API client 统一封装，不允许页面到处直接 `fetch()`。

---

# 15. 开发顺序

前端自己开发时：

```text
Static Screens
↓
Mock GameView
↓
Mock legal_actions
↓
对接 Create Game
↓
对接 Action
↓
特殊 Phase
↓
动画
↓
美术替换
```

不要第一天就先做粒子特效。

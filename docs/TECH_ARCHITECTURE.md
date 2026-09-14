# TECH_ARCHITECTURE.md

# 1. 目标

把已有 Python 修仙卡牌 Demo 工程化为：

```text
Expo App
  ↓
FastAPI
  ↓
Game Service
  ↓
现有 Xiuxian Game Engine
  ↓
Agents
```

本文件只定义工程架构，不重新定义游戏规则或 AI 算法。

---

# 2. 技术栈

## Frontend

```text
Expo
React Native
TypeScript
expo-router
Zustand
react-native-reanimated
react-native-gesture-handler
expo-image
expo-linear-gradient
```

可选，V1 不强制：

```text
@shopify/react-native-skia
```

只有后期需要更强的粒子、法阵、雷电、Shader 特效时再引入。

## Backend

```text
Python 3.11+
FastAPI
Pydantic
Uvicorn
```

游戏、AI、训练代码继续沿用现有 Python 实现并逐步模块化。

## Deployment

```text
Expo App
Frontend → Vercel Next.js Service
Backend → Vercel FastAPI Service
Database → Neon PostgreSQL（活跃 game session JSON 快照）
```

---

# 3. V1 架构

```text
┌─────────────────────────┐
│ Expo / React Native     │
│                         │
│ Screen                  │
│ UI Components           │
│ Zustand Store           │
│ API Client              │
└────────────┬────────────┘
             │ HTTPS / JSON
             ▼
┌─────────────────────────┐
│ FastAPI                 │
│                         │
│ routers/                │
│ schemas/                │
│ services/               │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ GameSessionService      │
│                         │
│ create                  │
│ act                     │
│ observe                 │
│ auto_run_ai             │
│ destroy                 │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Existing Game Engine    │
│                         │
│ GameState               │
│ Observation             │
│ legal_actions           │
│ step                    │
│ clone                   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Agents                  │
│ Random / Rule           │
│ ISMCTS / MCCFR          │
└─────────────────────────┘
```

---

# 4. 最重要的边界

## 4.1 Backend 是唯一规则权威

前端不能自己计算：

```text
能不能出这张牌
现在是不是该抽牌
天劫是否触发
反制是否合法
玩家是否淘汰
谁获胜
```

只能显示后端返回的 `legal_actions`。

这样不会出现 Expo 与 Python 规则不一致。

## 4.2 GameState 永远不发送给前端

后端内部：

```text
GameState
= 完整牌堆
+ 所有真实手牌
+ 隐藏信息
```

API 返回：

```text
Observation
+ public_state
+ legal_actions
+ events
```

只包含该玩家有权看到的信息。

## 4.3 AI 继续使用相同环境

不要为 API 单独写一套 AI 游戏规则。

```text
Human
RuleAgent
ISMCTSAgent
MCCFRAgent
```

最终都应通过同一个 `env.step(action)` 改变游戏。

---

# 5. 后端建议目录

```text
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── health.py
│   │   ├── games.py
│   │   └── agents.py
│   ├── schemas/
│   │   ├── game.py
│   │   ├── action.py
│   │   └── event.py
│   ├── services/
│   │   ├── game_session.py
│   │   ├── agent_factory.py
│   │   └── model_loader.py
│   └── core/
│       └── config.py
│
├── game/
├── agents/
├── training/
├── evaluation/
├── models/
├── configs/
├── tests/
├── requirements.txt
└── render.yaml
```

现有 Demo 可以逐步拆进去，不要求一次完全重构。

---

# 6. 前端建议目录

```text
frontend/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── setup.tsx
│   ├── battle.tsx
│   ├── result.tsx
│   ├── cards.tsx
│   └── ai-lab.tsx
│
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   └── game.ts
│   ├── components/
│   │   ├── game-card/
│   │   ├── player-panel/
│   │   ├── deck-pile/
│   │   ├── action-bar/
│   │   └── dialogs/
│   ├── store/
│   │   └── game-store.ts
│   ├── hooks/
│   ├── types/
│   ├── theme/
│   └── utils/
│
└── assets/
    ├── backgrounds/
    ├── cards/
    ├── characters/
    ├── effects/
    ├── icons/
    └── ui/
```

---

# 7. Game Session

本地未配置数据库时，游戏 session 保存在 FastAPI 进程内存；Vercel 生产环境配置
`DATABASE_URL` 后，session 以 JSON 快照写入 Neon PostgreSQL。

示意：

```python
sessions: dict[str, GameSession]
```

每个 session 包含：

```text
game_id
env / state
human_player_id
agent instances
created_at
last_active_at
```

Vercel Function 冷启动或切换实例后，后端会从 Neon 恢复游戏状态、事件游标和 AI 随机数状态。
动作保存使用提交前 revision 的乐观并发检查，两个实例同时出牌时第二个请求返回
`STALE_REVISION`，不会覆盖已经提交的对局。

需要：

```text
session TTL
最大 session 数量
异常清理
```

例如空闲 30–60 分钟自动删除。

---

# 8. REST 还是 WebSocket

V1 使用：

```text
REST first
```

原因：

- 回合制，不是实时动作游戏。
- 当前主要是 Human vs AI。
- 每次用户动作后，后端可以一次自动执行所有 AI 行动，直到再次轮到人类。
- API 返回 `events[]`，前端按事件顺序播放动画。

流程：

```text
玩家点牌
↓
POST action
↓
Backend step
↓
AI 自动行动
↓
直到需要 Human 决策
↓
返回 state + events[]
↓
Expo 播放动画
```

以后真人 PvP 再增加：

```text
WebSocket /ws/games/{id}
```

V1 不要为了未来 PvP 提前增加复杂度。

---

# 9. AI 模型

## MCCFR

训练模型继续保存为文件，例如：

```text
models/
├── mccfr_2p_100k.pkl
├── mccfr_3p_100k.pkl
└── champion.pkl
```

Render 服务启动时按需加载。

不要每个请求重新读取模型。

建议：

```text
ModelRegistry
→ lazy load
→ memory cache
```

## ISMCTS

实时 CPU 搜索。

API 需要支持配置：

```text
simulations
exploration
max_depth
```

正式 App 应设上限，防止一次请求搜索过久。

---

# 10. Vercel Services + Neon

推荐启动：

```bash
根 vercel.json：frontend → Next.js，backend → app.main:app
```

环境变量：

```text
APP_ENV=production
DATABASE_URL=<Neon PostgreSQL URL，仅 Vercel 加密变量>
DEFAULT_ISMCTS_SIMULATIONS=200
ISMCTS_MAX_SIMULATIONS=500
MODEL_DIR=models
SESSION_TTL_SECONDS=3600
```

V1 不放：

```text
训练 Worker
```

---

# 11. 训练与生产服务分离

不要让 Vercel Web API 做长期 MCCFR 训练。

正确方式：

```text
本地训练
→ benchmark
→ 保存 .pkl
→ 将确认模型加入 models/
→ deploy
→ Vercel 只负责推理
```

以后真的需要在线训练，再拆独立 Worker。

---

# 12. 测试边界

Backend 至少：

```text
Game Engine 单测
Observation 隐私测试
API schema 测试
合法动作 API 测试
完整一局 API 测试
AI 自动行动测试
模型加载测试
```

Frontend 至少：

```text
API parsing
Game store
Battle screen render
不同 phase 的 dialog
错误/loading 状态
```

---

# 13. V1 明确不做

```text
数据库
登录注册
排行榜
商城
好友
真人 PvP
服务端长期训练
复杂 WebSocket
推送通知
Roguelike / 剧情 / 长期养成
```

先把完整一局做好。

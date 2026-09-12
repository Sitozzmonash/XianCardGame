# DEVELOPMENT_PLAN.md

# 1. 总目标

先完成：

```text
一个玩家可以从首页进入游戏
→ 与 AI 完整打一局
→ 正确处理所有特殊决策
→ 到游戏结束
```

再继续美术、动画、AI 实验页面。

---

# 2. Agent 工作要求

每个 Phase：

```text
先读需求
→ 修改代码
→ 跑测试
→ 展示结果
→ 通过后再进入下一 Phase
```

禁止：

```text
一次性重写整个 Python Demo
未经测试修改核心规则
为了前端方便复制一套 JS 游戏规则
提前做数据库
提前做真人 PvP
```

---

# Phase 0 — Repository Setup

目标：

```text
frontend/
backend/
```

保留现有 Demo 作为参考。

完成：

- Expo TypeScript 项目。
- FastAPI 项目。
- `.env.example`。
- lint / format。
- README 启动命令。

验收：

```bash
cd backend
uvicorn app.main:app --reload
```

```bash
cd frontend
npx expo start
```

两边都能启动。

---

# Phase 1 — Backend Game Adapter

目标：

把现有 Game Engine 变成稳定 service，不改变规则。

完成：

```text
GameSession
AgentFactory
ModelRegistry
```

GameSession 至少：

```python
create()
view_for(player)
legal_actions()
act()
run_ai_until_human()
is_terminal()
```

验收：

- Random vs Random 能结束。
- Human mock vs Rule 能完整跑。
- GameState 与 Observation 继续严格隔离。
- Seed 可复现。
- 原有测试继续通过。

---

# Phase 2 — FastAPI

完成：

```text
GET  /health
GET  /agents
GET  /cards
POST /games
GET  /games/{id}
POST /games/{id}/actions
DELETE /games/{id}
```

严格实现 `API_CONTRACT.md`。

验收脚本至少覆盖：

```text
create
→ get
→ action
→ AI auto step
→ special decision
→ terminal
```

另外必须有隐藏信息泄露测试。

---

# Phase 3 — Expo Static UI

暂时使用 Mock JSON。

完成：

```text
Home
Setup
Battle
Card Detail
Result
Cards
```

视觉参考：

```text
Figma / 02 HiFi Expo
images/
```

验收：

- iOS/Android 常见比例不溢出。
- Battle 页面能展示 2–6 人公开信息。
- 手牌支持点击和选中。
- 视觉已经接近交付参考，不是普通后台 UI。

---

# Phase 4 — Create Game Integration

连接：

```text
Expo → POST /games
```

完成：

```text
Setup
→ create
→ Zustand 保存 game_id / state
→ 跳转 battle
```

验收：

- 真后端创建游戏。
- 页面展示数据全部来自 GameView。
- 刷新可 GET current game。

---

# Phase 5 — Normal Turn Actions

完成：

```text
PLAY_CARD
END_ACTION
```

Action UI 必须从：

```text
legal_actions
```

产生。

后端 action 后：

```text
自动执行 AI
→ 返回 events
→ 前端播放
```

验收：

- Human vs Rule 完整普通回合工作。
- 快速连续点击不会提交两次。
- revision conflict 能友好恢复。

---

# Phase 6 — Special Decision Phases

逐个完成：

## 6.1 Counter

```text
CounterDialog
使用反制
不反制
```

## 6.2 Target

```text
摄物术选择目标
```

## 6.3 Reorder

```text
逆天改命
拖拽 1–3 张排序
提交 token 顺序
```

## 6.4 Reinsert

```text
TOP
NEAR_TOP
MIDDLE
BOTTOM
```

验收：

必须写一条自动测试覆盖每种 Phase。

---

# Phase 7 — Full Game

目标：

完整一局。

测试组合：

```text
Human + Rule
Human + Random + Rule
Human + Rule + ISMCTS
```

验收：

```text
开始
→ 出牌
→ 抽牌
→ 天劫
→ 护劫
→ 回插
→ 淘汰
→ 最后一人
→ Result
```

任何一步不能靠人工改 state。

---

# Phase 8 — Visual Polish

现在才重点做：

```text
原画
卡牌
角色头像
Button frame
法阵
雷电
云雾
粒子
动画
```

参考本包高保真图。

优先级：

```text
Battle > Card > Home > Result > Secondary pages
```

不要牺牲可读性追求特效。

---

# Phase 9 — AI Integration QA

确认：

## ISMCTS

```text
100 / 500 / 1000 simulations
```

API latency 可接受。

加入 server timeout / limit。

## MCCFR

```text
model load
unknown infoset fallback
```

训练仍走原 CLI，不经 Expo。

---

# Phase 10 — Render Deployment

完成：

```text
Render Web Service
CORS
production env
health check
Expo production API URL
```

验收：

真机 Expo 可以：

```text
创建游戏
执行动作
完整结束
```

---

# Phase 11 — Regression

Backend：

```text
pytest
```

Frontend：

```text
typecheck
lint
核心 store / API tests
```

手工：

```text
2p
3p
4p
特殊卡
断网重试
Render cold start
后台恢复
```

---

# 12. Done Definition

V1 完成不是“页面都画完”。

必须同时满足：

```text
规则正确
隐藏信息不泄漏
完整一局可玩
AI 可正常行动
Render 可访问
Expo 真机可运行
UI 达到交付视觉方向
错误可恢复
测试通过
```

---

# 13. V1 完成以后再做

按优先级：

```text
1. 更多 UI 动画
2. 更完整 AI Lab
3. MCCFR model selection
4. Historical model battle
5. Replay
6. 战斗统计
7. 数据库 / 用户系统
8. PvP + WebSocket
```

Champion / Population / League / JPSRO 继续遵循已有项目 AI 规划，不属于当前 App V1 阻塞项。

# API_CONTRACT.md

# 1. 原则

本文件是 Expo 与 FastAPI 的接口契约。

游戏规则仍以已有项目规范和 Python Game Engine 为准。

API 必须遵守：

```text
Backend = Rule Authority
Frontend = Renderer + Input
```

前端绝不通过复制 Python 规则来推断合法动作。

---

# 2. Base URL

开发：

```text
http://localhost:8000/api/v1
```

生产：

```text
https://<render-service>.onrender.com/api/v1
```

Expo 环境变量：

```text
EXPO_PUBLIC_API_BASE_URL=
```

---

# 3. 通用返回

错误：

```json
{
  "error": {
    "code": "INVALID_ACTION",
    "message": "当前阶段不能执行该动作",
    "details": {}
  }
}
```

HTTP：

```text
400 参数错误
404 game/session 不存在
409 当前状态冲突 / 非法动作
422 schema 校验失败
500 服务端异常
```

---

# 4. Health

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

# 5. Agent 列表

```http
GET /agents
```

Response:

```json
{
  "agents": [
    {
      "id": "random",
      "name": "Random",
      "type": "random",
      "configurable": false
    },
    {
      "id": "rule",
      "name": "Rule",
      "type": "rule",
      "configurable": false
    },
    {
      "id": "ismcts",
      "name": "ISMCTS",
      "type": "ismcts",
      "configurable": true,
      "defaults": {
        "simulations": 500,
        "exploration": 1.4
      }
    },
    {
      "id": "mccfr_2p_100k",
      "name": "MCCFR 2P 100K",
      "type": "mccfr",
      "model": "models/mccfr_2p_100k.pkl"
    }
  ]
}
```

---

# 6. 创建游戏

```http
POST /games
```

Request:

```json
{
  "players": 3,
  "human_player": 0,
  "agents": [
    null,
    {
      "type": "rule"
    },
    {
      "type": "ismcts",
      "simulations": 500
    }
  ],
  "seed": null
}
```

规则：

```text
players == agents.length
human_player 对应位置必须为 null
其他座位必须指定 agent
```

Response:

```json
{
  "game_id": "uuid",
  "player_id": 0,
  "state": {
    "...": "GameView"
  }
}
```

创建后，如果不是 Human 首先决策，服务端应自动跑 AI，直到：

```text
轮到 Human
或
需要 Human 做特殊决策
或
游戏结束
```

---

# 7. GameView

所有创建游戏、读取游戏、执行动作都统一返回：

```json
{
  "game_id": "uuid",
  "status": "playing",
  "revision": 12,
  "viewer_player_id": 0,
  "phase": "ACTION",
  "current_player": 0,
  "decision_player": 0,

  "observation": {},

  "public": {
    "round": 3,
    "deck_count": 28,
    "discard_count": 5,
    "players": []
  },

  "legal_actions": [],

  "events": []
}
```

`revision` 每次状态变化 +1。

前端 POST action 时带当前 revision，防止重复点击导致同一动作执行两次。

---

# 8. PlayerPublicView

```json
{
  "player_id": 1,
  "name": "玄墨真人",
  "alive": true,
  "hand_count": 6,
  "is_current": false,
  "is_decision_player": false,
  "agent": {
    "type": "rule"
  }
}
```

严禁返回：

```text
该玩家真实手牌
该玩家私有观星结果
```

---

# 9. Observation

建议后端把已有 Observation 转换成稳定 JSON。

示例：

```json
{
  "hand": [
    {
      "instance_id": "h_001",
      "card_id": "STARGAZING",
      "name": "观星术"
    },
    {
      "instance_id": "h_002",
      "card_id": "ESCAPE",
      "name": "遁术"
    }
  ],

  "known_top": [
    {
      "position": 0,
      "card_id": "TRIBULATION"
    }
  ],

  "actions_used": 1,
  "max_actions_per_turn": 2,

  "private_context": null
}
```

`known_top` 只返回该 viewer 真正知道的内容。

---

# 10. LegalAction

这是整个 API 最重要的数据。

前端按钮必须由它驱动。

基础结构：

```json
{
  "id": "a_f28e...",
  "type": "PLAY_CARD",
  "label": "使用观星术",
  "enabled": true,
  "card_instance_id": "h_001",
  "params": null
}
```

前端发送后端给出的 `id`，不要自己构造规则动作。

---

# 11. 执行动作

```http
POST /games/{game_id}/actions
```

Request:

```json
{
  "revision": 12,
  "action_id": "a_f28e...",
  "payload": {}
}
```

Response:

```json
{
  "game_id": "uuid",
  "status": "playing",
  "revision": 16,
  "...": "GameView",
  "events": [
    {
      "seq": 1,
      "type": "CARD_PLAYED",
      "actor": 0,
      "card_id": "STARGAZING"
    }
  ]
}
```

服务端在 Human action 后自动执行 AI，直到下一次 Human 决策点。

因此一次请求可能返回多个事件。

---

# 12. 特殊动作

不要为每一种卡牌创建一个 HTTP endpoint。

都走：

```text
POST /actions
```

但 `legal_actions` 根据 phase 返回不同 Action。

## 12.1 结束行动 / 抽牌

```json
{
  "id": "a_end",
  "type": "END_ACTION",
  "label": "结束行动并抽牌"
}
```

## 12.2 摄物术选择目标

```json
{
  "id": "a_steal",
  "type": "PLAY_CARD_TARGET",
  "label": "使用摄物术",
  "card_instance_id": "h_004",
  "params": {
    "target_player": {
      "type": "enum",
      "options": [1, 2]
    }
  }
}
```

POST：

```json
{
  "revision": 20,
  "action_id": "a_steal",
  "payload": {
    "target_player": 2
  }
}
```

## 12.3 反制

```json
[
  {
    "id": "a_counter_yes",
    "type": "COUNTER",
    "label": "使用反制符"
  },
  {
    "id": "a_counter_no",
    "type": "PASS_COUNTER",
    "label": "不反制"
  }
]
```

## 12.4 逆天改命排序

服务端先返回 private decision context：

```json
{
  "phase": "REORDER_TOP",
  "observation": {
    "private_context": {
      "cards": [
        {
          "token": "private_1",
          "card_id": "TRIBULATION"
        },
        {
          "token": "private_2",
          "card_id": "STARGAZING"
        },
        {
          "token": "private_3",
          "card_id": "DEFUSE"
        }
      ]
    }
  },
  "legal_actions": [
    {
      "id": "a_reorder",
      "type": "REORDER_TOP",
      "params": {
        "order": {
          "type": "token_order"
        }
      }
    }
  ]
}
```

POST：

```json
{
  "revision": 30,
  "action_id": "a_reorder",
  "payload": {
    "order": [
      "private_3",
      "private_2",
      "private_1"
    ]
  }
}
```

不要使用真实 deck index 暴露内部状态。

## 12.5 天劫回插

```json
{
  "id": "a_reinsert",
  "type": "REINSERT_TRIBULATION",
  "params": {
    "region": {
      "type": "enum",
      "options": [
        "TOP",
        "NEAR_TOP",
        "MIDDLE",
        "BOTTOM"
      ]
    }
  }
}
```

---

# 13. Events

Events 用来驱动前端动画和战斗日志。

建议类型：

```text
GAME_STARTED
TURN_STARTED
CARD_PLAYED
CARD_DRAWN
CARD_STOLEN
COUNTER_OPENED
COUNTER_USED
COUNTER_PASSED
DECK_PEEKED
DECK_REORDERED
DECK_SHUFFLED
TURN_SKIPPED
TRIBULATION_DRAWN
TRIBULATION_DEFUSED
TRIBULATION_REINSERTED
PLAYER_ELIMINATED
TURN_ENDED
GAME_ENDED
```

公共事件绝不能携带不应公开的信息。

例如别人使用观星术：

```json
{
  "type": "CARD_PLAYED",
  "actor": 1,
  "card_id": "STARGAZING"
}
```

不能发送：

```text
他看到了哪三张牌
```

---

# 14. Event 示例

```json
{
  "seq": 4,
  "type": "TRIBULATION_DEFUSED",
  "actor": 0,
  "data": {
    "consumed_card": "DEFUSE"
  }
}
```

前端：

```text
收到 event
→ 播放雷电
→ 显示护劫符
→ 播放化解
→ 再进入回插选择
```

---

# 15. 读取当前游戏

```http
GET /games/{game_id}
```

用于：

```text
App 回前台
页面 reload
短暂网络失败后恢复
```

Response = 最新 `GameView`。

---

# 16. 删除游戏

```http
DELETE /games/{game_id}
```

Response:

```json
{
  "ok": true
}
```

---

# 17. Restart

最简单：

```text
结束旧 game
重新 POST /games
```

V1 不需要单独 restart API。

---

# 18. Card Definition

为了让前端不用硬编码所有文案，可以提供：

```http
GET /cards
```

示例：

```json
{
  "cards": [
    {
      "id": "STARGAZING",
      "name": "观星术",
      "category": "ACTIVE",
      "description": "查看牌堆顶部最多3张牌。",
      "asset": "stargazing"
    }
  ]
}
```

规则效果仍由 Python 控制。

---

# 19. 安全要求

API 层必须有自动测试确保：

```text
Observation 不包含其他玩家 hand
Observation 不包含真实 deck
Events 不泄露私有观星结果
排序 token 不暴露真实内部索引
AI API 也只能通过允许接口决策
```

这是强约束。

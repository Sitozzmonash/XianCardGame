# 修仙卡牌游戏 · 开发 Agent 交接包

## 1. 这个包解决什么

本包只补充“产品工程化开发”所需内容，不重复已有资料。

开发 Agent 应同时读取：

1. `xiuxian_card_ai_project_spec(1).md`
   - 游戏规则、隐藏信息模型、AI、MCCFR、ISMCTS、训练和评测的最高依据。
2. `xiuxian_ai_demo(1).zip`
   - Python 游戏环境和 AI 的参考实现。
3. 本包 `docs/`
   - Expo 前端、FastAPI 后端、API 契约、开发顺序。
4. 本包 `images/`
   - UI 视觉方向参考。
5. Figma
   - https://www.figma.com/design/BZhWnFsoMNtLGS5Oi9PfGr
   - 重点查看：`02 HiFi Expo`

## 2. 已确认技术路线

```text
Expo + React Native + TypeScript
        ↓ REST（V1）
Python FastAPI
        ↓
现有 Game Engine / Agents
        ↓
Random / Rule / ISMCTS / MCCFR

Frontend → Expo
Backend  → Render
Database → V1 不使用
```

V1 是单机玩家对 AI / AI 对局，因此先用 REST，不强制 WebSocket。未来做真人 PvP 时再加入 WebSocket。

## 3. 开发原则

- 不重写已经验证的核心游戏规则，先把现有 Python Demo 包装成服务。
- 后端是唯一规则权威，前端不得自己判断合法动作。
- 前端只接收当前玩家允许看到的 Observation，禁止返回完整 GameState。
- V1 不加数据库、账号、排行榜、商城、长期养成。
- V1 不在 Render 上训练 MCCFR；训练在本地完成，部署只加载模型推理。
- 优先做“可完整打一局”，再做视觉和动画。
- 所有页面以 Figma 和 `images/` 为视觉参考，但代码必须响应式实现，不能把整张 UI 图当页面背景直接上线。

## 4. 文档阅读顺序

```text
TECH_ARCHITECTURE.md
→ API_CONTRACT.md
→ FRONTEND_GUIDE.md
→ DEVELOPMENT_PLAN.md
```

## 5. 最终 V1 验收

用户应可以：

```text
打开 App
→ 选择单机 / AI 对战
→ 创建一局游戏
→ 看到自己的手牌和公开信息
→ 使用卡牌
→ 处理反制 / 排序 / 天劫回插等特殊决策
→ AI 自动行动
→ 一直玩到只剩最后一人
→ 显示胜负结果
→ 再来一局
```

做到这一条完整链路后，再增加更多页面、动画和 AI 实验功能。

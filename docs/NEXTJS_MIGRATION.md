# Next.js 迁移说明（2026-09-13）

当前前端权威实现是 `frontend/` 下的 Next.js 16 App Router。`docs/DELIVERY.md`、`docs/FRONTEND_STATUS.md`、`docs/UI_AUDIT.md` 中描述 Expo 的段落是上一版交付记录，只用于追溯，不再代表当前运行方式。

## 当前部署拓扑

```text
浏览器 → Vercel / Next.js
              ↓ /api/v1（同域 rewrite）
          Vercel / FastAPI
              ↓
  Neon PostgreSQL session + Game Engine + ISMCTS / MCCFR
```

仓库根 `vercel.json` 声明 `frontend` 和 `backend` 两个 Services，FastAPI 明确入口为
`app.main:app`。生产前端使用 `NEXT_PUBLIC_API_BASE_URL=/api/v1`，无需暴露单独后端域名；
`DATABASE_URL` 仅在 Vercel backend Service 配置。session 以 JSON 快照存入 Neon，故冷启动
或命中另一 Vercel Function 不会丢局。

## 交互修复

- 观星术和逆天改命：`private_context.cards` 在持久决策面板中显示，确认前不会消失。
- 事件演出：每个事件默认至少 1.9 秒，支持慢速、标准、快速、暂停、下一幕和全部跳过。
- 战斗记录：所有响应事件永久追加到本局记录，可随时回看。
- 特殊阶段：反制/遁术、摄物目标、牌顶排序、天劫回插全部由后端 `legal_actions` 驱动。
- 排版：中文采用项目内自托管的 Noto Sans/Serif SC，正文与按钮统一字号，固定栏预留安全区并通过层级避免遮挡。

## AI 边界

ISMCTS 和 MCCFR 的实现仍在后端。前端只负责发送配置：ISMCTS 发送搜索次数；MCCFR 从 `/agents` 读取注册模型并发送模型 `id`。MCCFR 模型必须与玩家人数匹配，且对应 `.pkl` 必须实际存在于 Vercel backend Service 的 `MODEL_DIR`。

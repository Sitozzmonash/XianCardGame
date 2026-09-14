# XianCardGame Web

Next.js 16 前端，面向 Vercel 部署。FastAPI 后端是唯一规则权威；前端只渲染 `GameView`、播放 `events` 并提交 `legal_actions`。

## 本地运行

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

`.env.example` 是 Vercel 同域部署配置。仅本地联调时，把 `.env.local` 中的
`NEXT_PUBLIC_API_BASE_URL` 改为 `http://localhost:8000/api/v1`；先在 `backend/`
启动 FastAPI，再打开 `http://localhost:3000`。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

## Vercel

1. 在仓库根导入 GitHub 项目，并点击 **Refresh** 读取根 `vercel.json`。
2. 确认 Services 同时识别 `frontend`（Next.js）与 `backend`（FastAPI），再部署。
3. frontend Service 设置 `NEXT_PUBLIC_API_BASE_URL=/api/v1`；backend Service 设置
   `DATABASE_URL` 为 Neon PostgreSQL URL，以及 `APP_ENV=production`。
4. 同域 `/api/v1/*` 请求已由根路由转发给 backend，不需要 Render 地址或跨域配置。

`NEXT_PUBLIC_*` 会在构建时写入浏览器包，修改后必须重新部署。

## AI

- ISMCTS：配置界面可选择搜索次数，提交 `{type:"ismcts", simulations:...}`。
- MCCFR：从后端 `GET /agents` 读取与当前人数匹配的模型，提交模型注册表 `id`。模型文件不应由浏览器路径指定；Vercel backend 必须能在 `MODEL_DIR` 找到对应 `.pkl`。

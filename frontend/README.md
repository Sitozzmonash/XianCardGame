# XianCardGame Web

Next.js 16 前端，面向 Vercel 部署。FastAPI 后端是唯一规则权威；前端只渲染 `GameView`、播放 `events` 并提交 `legal_actions`。

## 本地运行

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

默认访问 `http://localhost:8000/api/v1`。先在 `backend/` 启动 FastAPI，再打开 `http://localhost:3000`。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

## Vercel

1. 导入 GitHub 仓库，将 Root Directory 设置为 `frontend`。
2. 添加 `NEXT_PUBLIC_API_BASE_URL=https://<render-service>.onrender.com/api/v1`。
3. 保持 Framework Preset 为 Next.js，部署。
4. 在 Render 的 `CORS_ORIGINS` 中填写 Vercel 正式域名；如需 Preview 域名可暂时用 `*`。

`NEXT_PUBLIC_*` 会在构建时写入浏览器包，修改后必须重新部署。

## AI

- ISMCTS：配置界面可选择搜索次数，提交 `{type:"ismcts", simulations:...}`。
- MCCFR：从后端 `GET /agents` 读取与当前人数匹配的模型，提交模型注册表 `id`。模型文件不应由浏览器路径指定；Render 必须能在 `MODEL_DIR` 找到对应 `.pkl`。

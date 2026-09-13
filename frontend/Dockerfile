# 修仙卡牌前端：Expo Web 静态导出 + nginx 托管（两阶段构建）
#
# 构建（在 frontend/ 目录）：
#     docker build --build-arg EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 -t xiuxian-card-web .
# 运行：
#     docker run --rm -p 8080:80 xiuxian-card-web        # → http://localhost:8080
#
# ⚠️ **API 地址是构建期注入的**（`EXPO_PUBLIC_*` 由 Metro 在打包时替换，不是运行时读环境变量）：
#    改了后端地址必须**重新 build**，改容器环境变量无效。换地址只传 `--build-arg` 即可。
#    默认值指向容器编排里的 `api` 服务名，单独 docker run 时必须显式传宿主地址。
#
# 阶段 1：构建静态产物
FROM node:22-alpine AS builder
WORKDIR /app

ARG EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL} \
    EXPO_NO_TELEMETRY=1 \
    CI=1

# 先装依赖（单独一层，改代码不会让 npm 缓存失效）
COPY package.json package-lock.json ./
RUN npm ci

# 再拷源码并导出静态站点
COPY . .
RUN npx expo export --platform web --output-dir dist --clear

# 阶段 2：nginx 托管（clean URL + 嵌套路由 + 真实 404）
FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

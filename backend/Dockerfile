# 修仙卡牌后端：FastAPI + 游戏引擎 + AI（纯 CPU，无深度学习依赖）
#
# 构建（在 backend/ 目录）：
#     docker build -t xiuxian-card-api .
# 运行：
#     docker run --rm -p 8000:8000 -v "$PWD/models:/app/models:ro" xiuxian-card-api
#
# 说明：
# - 端口用 $PORT（云平台会注入；未设时默认 8000），与 backend/render.yaml 的 startCommand 一致。
# - 两个轻量 Web MCCFR 推理模型随镜像部署，确保 Render 可直接运行 2 人/3 人 MCCFR。
#   更大的训练模型仍建议通过持久磁盘或单独制品提供，不在 Render 上训练。
# - 健康检查用 Python 标准库（slim 镜像里没有 curl）。

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_ENV=production \
    PORT=8000 \
    MODEL_DIR=models

WORKDIR /app

# 先装依赖（单独一层，改代码不会让 pip 缓存失效）
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# 再拷贝源码
COPY . .

# 非 root 运行（models 目录由 compose 只读挂载，写权限不依赖它）
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+__import__('os').environ.get('PORT','8000')+'/api/v1/health', timeout=4).status==200 else 1)"

# 与 render.yaml 的 startCommand 等价
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

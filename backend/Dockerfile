# 修仙卡牌后端：FastAPI + 游戏引擎 + AI（纯 CPU，无深度学习依赖）
#
# 构建（在 backend/ 目录）：
#     docker build -t xiuxian-card-api .
# 运行：
#     docker run --rm -p 8000:8000 -v "$PWD/models:/app/models:ro" xiuxian-card-api
#
# 说明：
# - 端口用 $PORT（云平台会注入；未设时默认 8000），与 backend/render.yaml 的 startCommand 一致。
# - **MCCFR 模型不进镜像**（`models/*.pkl` 被 .dockerignore 排除，且本来也不在 git 里）：
#   用 `-v models:/app/models:ro` 挂载；没有模型时服务照常启动，`GET /agents` 的 mccfr 条目
#   退化为无模型的通用条目（契约 §5 / INTERFACES 附录 A3），不会报错。
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

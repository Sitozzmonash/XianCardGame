"""FastAPI 应用入口（INTERFACES §4 / TECH_ARCHITECTURE §10）。

启动（Render 同款）::

    uvicorn app.main:app --host 0.0.0.0 --port 8000

包含：CORS 中间件、统一错误体 `{"error": {code, message, details}}`、
全部 `/api/v1` 路由。**不在这里做任何规则判断**（规则权威是 `game/`）。
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import API_PREFIX
from .api import api_router
from .core.config import Settings, get_settings
from .core.errors import AppError

log = logging.getLogger("app.main")


def configure_logging(settings: Settings) -> None:
    """没有日志 handler 时给一个基础配置（uvicorn 已配置时不重复加）。"""
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=getattr(logging, str(settings.log_level).upper(), logging.INFO),
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )


def configure_cors(app: FastAPI, settings: Settings) -> None:
    """CORS：`CORS_ORIGINS=*` 时放行全部（前端 Expo 调试用）。"""
    allow_all = settings.cors_allow_all
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else list(settings.cors_origins),
        allow_credentials=not allow_all,  # 通配来源时浏览器不接受 credentials
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=600,
    )


def _error_body(code: str, message: str, details: Optional[dict] = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def _brief_errors(errors: list) -> list:
    """把 pydantic 校验错误裁剪成不泄漏整包 body 的简报。"""
    brief = []
    for item in errors or []:
        brief.append(
            {
                "loc": [str(part) for part in item.get("loc", ())],
                "msg": str(item.get("msg", "")),
                "type": str(item.get("type", "")),
            }
        )
    return brief


def install_error_handlers(app: FastAPI) -> None:
    """统一错误体（API_CONTRACT §3 + §19：错误信息里不能带隐藏状态）。"""

    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_response())

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_body(
                "VALIDATION_ERROR", "请求参数校验失败", {"errors": _brief_errors(exc.errors())}
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
        }
        status = int(exc.status_code)
        code = code_map.get(status, "HTTP_ERROR")
        message = str(exc.detail) if exc.detail else code
        return JSONResponse(
            status_code=status, content=_error_body(code, message, {"status": status})
        )

    @app.exception_handler(Exception)
    async def _unhandled(_request: Request, exc: Exception) -> JSONResponse:
        log.exception("未捕获异常：%s", exc)
        # 只回错误码，不带任何内部状态 / 堆栈
        return JSONResponse(
            status_code=500, content=_error_body("INTERNAL_ERROR", "服务端异常")
        )


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """构造 FastAPI 应用（测试可传入自定义 settings）。"""
    st = settings or get_settings()
    configure_logging(st)

    app = FastAPI(
        title="修仙卡牌 API",
        description="Backend = Rule Authority，Frontend = Renderer + Input",
        version=st.app_version,
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )
    configure_cors(app, st)
    install_error_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)

    @app.get("/", include_in_schema=False)
    def root_index() -> dict:
        return {
            "name": "xiuxian-card-api",
            "version": st.app_version,
            "api_prefix": API_PREFIX,
            "docs": "/docs",
        }

    return app


app = create_app()


__all__ = ["app", "create_app", "configure_cors", "install_error_handlers"]

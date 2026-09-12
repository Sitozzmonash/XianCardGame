"""统一错误封装（API_CONTRACT §3 / INTERFACES §4.1）。

所有对外错误体都形如::

    {"error": {"code": "...", "message": "...", "details": {}}}

状态码约定（API_CONTRACT §3）::

    400 参数错误      404 game/session 不存在
    409 当前状态冲突 / 非法动作     422 schema 校验失败     500 服务端异常

**不泄漏状态**：`STALE_REVISION` 的 details 一律为空，客户端只能通过
`GET /games/{id}` 重新同步（见 §19「排序 token 不暴露真实内部索引」同类要求）。
"""

from __future__ import annotations

from typing import Any, Mapping, Optional


class AppError(Exception):
    """服务层统一异常基类：携带 HTTP 状态码与错误码。"""

    status_code: int = 400
    code: str = "BAD_REQUEST"
    default_message: str = "参数错误"

    def __init__(
        self,
        message: Optional[str] = None,
        *,
        details: Optional[Mapping[str, Any]] = None,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
    ) -> None:
        self.message = message or self.default_message
        self.details: dict = dict(details or {})
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        super().__init__(self.message)

    def to_response(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class BadRequest(AppError):
    status_code = 400
    code = "BAD_REQUEST"
    default_message = "参数错误"


class GameNotFound(AppError):
    status_code = 404
    code = "GAME_NOT_FOUND"
    default_message = "游戏不存在或已过期"


class StaleRevision(AppError):
    """revision 不匹配（前端重复点击 / 并发提交）。**不带任何状态信息。**"""

    status_code = 409
    code = "STALE_REVISION"
    default_message = "状态已更新，请重新拉取最新局面后再提交"

    def __init__(self, message: Optional[str] = None) -> None:
        super().__init__(message, details={})


class InvalidAction(AppError):
    status_code = 409
    code = "INVALID_ACTION"
    default_message = "当前阶段不能执行该动作"


class GameEnded(AppError):
    status_code = 409
    code = "GAME_ENDED"
    default_message = "游戏已结束"


class InvalidAgentSpec(AppError):
    status_code = 400
    code = "INVALID_AGENT"
    default_message = "Agent 配置不合法"


class ModelLoadError(AppError):
    status_code = 500
    code = "MODEL_LOAD_ERROR"
    default_message = "模型加载失败"


class ServiceUnavailable(AppError):
    status_code = 500
    code = "SERVICE_UNAVAILABLE"
    default_message = "服务暂时不可用"


__all__ = [
    "AppError",
    "BadRequest",
    "GameNotFound",
    "StaleRevision",
    "InvalidAction",
    "GameEnded",
    "InvalidAgentSpec",
    "ModelLoadError",
    "ServiceUnavailable",
]

"""服务层配置（INTERFACES §4.2 / TECH_ARCHITECTURE §10）。

只读环境变量，**全部带默认值**：没有 `.env`、没有环境变量时也必须能正常启动与跑测试。
`.env` 只在存在且安装了 `python-dotenv` 时被加载，且不覆盖已存在的环境变量。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple

#: `backend/` 目录（app/core/config.py -> parents[2]）
BACKEND_ROOT: Path = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------- 工具函数


def _dotenv_loaded() -> bool:  # pragma: no cover - 依赖本地是否有 .env
    path = BACKEND_ROOT / ".env"
    if not path.exists():
        return False
    try:
        from dotenv import load_dotenv  # type: ignore[import-not-found]
    except Exception:
        return False
    try:
        load_dotenv(str(path), override=False)
        return True
    except Exception:
        return False


def _env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip()
    return raw if raw else default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(float(str(raw).strip()))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return default


def parse_cors_origins(raw: str) -> Tuple[str, ...]:
    """`CORS_ORIGINS`：逗号分隔；`*` 表示全部放行。"""
    text = (raw or "").strip()
    if not text or text == "*":
        return ("*",)
    items = tuple(part.strip() for part in text.split(",") if part.strip())
    return items or ("*",)


# ---------------------------------------------------------------------- Settings


@dataclass(frozen=True)
class Settings:
    """服务层运行配置（全部来自环境变量，见 `.env.example`）。"""

    app_env: str = "development"
    app_version: str = "0.1.0"
    log_level: str = "INFO"

    cors_origins: Tuple[str, ...] = ("*",)

    default_ismcts_simulations: int = 500
    ismcts_max_simulations: int = 2000
    default_ismcts_exploration: float = 1.4

    model_dir: str = "models"

    # 留空则使用本地进程内 session；Vercel/Neon 部署必须设置此项。
    database_url: Optional[str] = None
    session_ttl_seconds: float = 3600.0
    max_sessions: int = 200

    max_decisions: int = 500
    max_ai_steps_per_request: int = 4000
    event_history_limit: int = 400
    view_event_window: int = 20

    extras: dict = field(default_factory=dict)

    # ------------------------------------------------------------- 派生属性

    @property
    def cors_allow_all(self) -> bool:
        return "*" in self.cors_origins

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def model_dir_path(self) -> Path:
        """`MODEL_DIR` 解析成绝对路径（相对路径按 `backend/` 解析）。"""
        raw = Path(self.model_dir)
        return raw if raw.is_absolute() else (BACKEND_ROOT / raw)

    @property
    def cors_origin_list(self) -> list:
        return list(self.cors_origins)

    # ------------------------------------------------------------- 构造

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_env=_env_str("APP_ENV", "development"),
            app_version=_env_str("APP_VERSION", "0.1.0"),
            log_level=_env_str("LOG_LEVEL", "INFO"),
            cors_origins=parse_cors_origins(_env_str("CORS_ORIGINS", "*")),
            default_ismcts_simulations=max(1, _env_int("DEFAULT_ISMCTS_SIMULATIONS", 500)),
            ismcts_max_simulations=max(1, _env_int("ISMCTS_MAX_SIMULATIONS", 2000)),
            default_ismcts_exploration=_env_float("ISMCTS_EXPLORATION", 1.4),
            model_dir=_env_str("MODEL_DIR", "models"),
            database_url=(os.environ.get("DATABASE_URL") or "").strip() or None,
            session_ttl_seconds=max(1.0, _env_float("SESSION_TTL_SECONDS", 3600.0)),
            max_sessions=max(1, _env_int("MAX_SESSIONS", 200)),
            max_decisions=max(1, _env_int("MAX_DECISIONS", 500)),
            max_ai_steps_per_request=max(1, _env_int("MAX_AI_STEPS_PER_REQUEST", 4000)),
            event_history_limit=max(20, _env_int("EVENT_HISTORY_LIMIT", 400)),
            view_event_window=max(1, _env_int("VIEW_EVENT_WINDOW", 20)),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """进程级单例配置（可用 `reset_settings()` 清缓存，测试用）。"""
    _dotenv_loaded()
    return Settings.from_env()


def reset_settings() -> Settings:
    """清掉缓存并重新从环境变量读取（测试用）。"""
    get_settings.cache_clear()
    return get_settings()


__all__ = [
    "BACKEND_ROOT",
    "Settings",
    "get_settings",
    "reset_settings",
    "parse_cors_origins",
]

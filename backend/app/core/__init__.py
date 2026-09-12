"""`app.core`：配置与错误封装。"""

from __future__ import annotations

from .config import BACKEND_ROOT, Settings, get_settings, reset_settings

__all__ = ["BACKEND_ROOT", "Settings", "get_settings", "reset_settings"]

"""MCCFR 模型注册表（INTERFACES §4.1 / TECH_ARCHITECTURE §9）。

* `models/index.json` 不存在 / 损坏 → 返回空列表，**绝不报错**（`GET /agents` 仍然可用）；
* 索引按 mtime 缓存，不会每个请求读盘；
* `MCCFRTrainer` **延迟导入**（C3 的 `training/trainer.py`），缺失时给出友好 500，
  不会让 `app.main:app` 启动就崩。
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from ..core.config import BACKEND_ROOT, Settings, get_settings
from ..core.errors import ModelLoadError

log = logging.getLogger("app.services.model_registry")


@dataclass
class ModelEntry:
    """`models/index.json` 里的一条模型记录。"""

    id: str
    name: str
    path: str
    players: Optional[int] = None
    iterations: Optional[int] = None
    created_at: Optional[str] = None
    note: Optional[str] = None

    def to_dict(self) -> dict:
        data: dict = {"id": self.id, "name": self.name, "path": self.path}
        for key in ("players", "iterations", "created_at", "note"):
            value = getattr(self, key)
            if value is not None:
                data[key] = value
        return data

    def to_agent_info(self) -> dict:
        """API_CONTRACT §5 的 agent 条目形态。

        额外带 `players` / `iterations`：模型是**按人数训练**的（信息集键包含 hand_sizes
        长度与 alive_mask 位宽，跨人数不可复用），前端需要据此过滤可选模型；缺失时前端
        应回退为「人数未知」而不是报错。
        """
        info = {
            "id": self.id,
            "name": self.name,
            "type": "mccfr",
            "configurable": False,
            "model": self.path,
        }
        if self.players is not None:
            info["players"] = self.players
        if self.iterations is not None:
            info["iterations"] = self.iterations
        return info


@dataclass
class ModelRegistry:
    """惰性加载 + 内存缓存的模型注册表。"""

    model_dir: Path = field(default_factory=lambda: get_settings().model_dir_path)
    _index_cache: Optional[list] = field(default=None, init=False, repr=False)
    _index_mtime: Optional[float] = field(default=None, init=False, repr=False)
    _trainers: dict = field(default_factory=dict, init=False, repr=False)
    _lock: threading.RLock = field(default_factory=threading.RLock, init=False, repr=False)

    # ------------------------------------------------------------------ 路径

    @property
    def index_path(self) -> Path:
        return Path(self.model_dir) / "index.json"

    def resolve_path(self, path: str) -> Path:
        """把模型路径解析成绝对路径（相对路径按 `backend/` 解析）。"""
        raw = Path(str(path))
        return raw if raw.is_absolute() else (BACKEND_ROOT / raw)

    # ------------------------------------------------------------------ 索引

    def list_models(self, *, force: bool = False) -> list:
        """`models/index.json` 的模型清单（按 mtime 缓存）。"""
        path = self.index_path
        with self._lock:
            try:
                mtime: Optional[float] = path.stat().st_mtime
            except OSError:
                if self._index_cache:
                    log.info("模型索引不存在：%s（返回空列表）", path)
                self._index_cache = []
                self._index_mtime = None
                return []

            if not force and self._index_mtime == mtime and self._index_cache is not None:
                return list(self._index_cache)

            models = self._read_index(path)
            self._index_cache = models
            self._index_mtime = mtime
            return list(models)

    def _read_index(self, path: Path) -> list:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            log.warning("模型索引解析失败（忽略）：%s -> %s", path, exc)
            return []

        entries: Any
        if isinstance(raw, dict):
            entries = raw.get("models", [])
        elif isinstance(raw, list):
            entries = raw
        else:
            log.warning("模型索引格式不认识（忽略）：%s", path)
            return []

        models: list = []
        for item in entries if isinstance(entries, list) else []:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or "").strip()
            model_path = str(item.get("path") or "").strip()
            if not model_id or not model_path:
                continue
            models.append(
                ModelEntry(
                    id=model_id,
                    name=str(item.get("name") or model_id),
                    path=model_path,
                    players=item.get("players"),
                    iterations=item.get("iterations"),
                    created_at=item.get("created_at"),
                    note=item.get("note"),
                )
            )
        return models

    def model_agent_infos(self) -> list:
        """给 `GET /agents` 用的模型条目。"""
        return [entry.to_agent_info() for entry in self.list_models()]

    # ------------------------------------------------------------- trainer 缓存

    def get_trainer(self, path: str):
        """惰性加载并缓存 `MCCFRTrainer`（绝不每次请求读盘）。"""
        key = str(path)
        with self._lock:
            cached = self._trainers.get(key)
            if cached is not None:
                return cached

        resolved = self.resolve_path(key)
        if not resolved.exists():
            raise ModelLoadError(
                f"模型文件不存在：{resolved}",
                details={"path": str(resolved)},
            )

        try:
            from training.trainer import MCCFRTrainer  # 延迟导入：C3 模块可能尚未就位
        except Exception as exc:  # pragma: no cover - 依赖 C3 是否就位
            raise ModelLoadError(
                f"training.trainer.MCCFRTrainer 不可用：{exc}",
                details={"path": str(resolved)},
            ) from exc

        try:
            # lazy=None（自动）：v2「仅策略」部署产物走懒加载（实测 0.15s / 不展开成 Python dict），
            # 全量模型走整表展开。用默认的 lazy=False 会让仅策略模型在服务端首次加载耗时 11s+
            # （实测对比：全量 eager 2.5s、仅策略 eager 11.1s、仅策略 lazy 0.15s）。
            trainer = MCCFRTrainer.load(str(resolved), lazy=None)
        except Exception as exc:
            raise ModelLoadError(
                f"模型加载失败：{exc}", details={"path": str(resolved)}
            ) from exc

        with self._lock:
            self._trainers[key] = trainer
        log.info("已加载 MCCFR 模型：%s", resolved)
        return trainer

    def cached_paths(self) -> list:
        with self._lock:
            return sorted(self._trainers)

    def clear_cache(self) -> None:
        with self._lock:
            self._index_cache = None
            self._index_mtime = None
            self._trainers.clear()


@lru_cache(maxsize=1)
def get_model_registry() -> ModelRegistry:
    """进程级单例（测试可用 `get_model_registry.cache_clear()` 重置）。"""
    settings: Settings = get_settings()
    return ModelRegistry(model_dir=settings.model_dir_path)


__all__ = ["ModelEntry", "ModelRegistry", "get_model_registry"]

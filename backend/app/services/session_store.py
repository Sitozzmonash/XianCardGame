"""进程内 session 注册表（TECH_ARCHITECTURE §7 / INTERFACES §4.1）。

* `sessions: dict[str, GameSession]` 存在进程内存（Render 重启丢局是可接受行为）；
* 惰性清理：每次创建/获取/列举时顺手回收 TTL 过期与超上限的 session（不起线程）；
* `SESSION_TTL_SECONDS`（默认 3600）/ `MAX_SESSIONS`（默认 200）来自环境变量。
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Optional

from game import GameConfig

from ..core.config import Settings, get_settings
from ..core.errors import GameNotFound
from .game_session import GameSession

log = logging.getLogger("app.services.session_store")


class SessionStore:
    """`game_id -> GameSession` 的进程内注册表。"""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._sessions: dict = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ 基础

    @property
    def ttl_seconds(self) -> float:
        return float(self.settings.session_ttl_seconds)

    @property
    def max_sessions(self) -> int:
        return int(self.settings.max_sessions)

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)

    def game_ids(self) -> list:
        with self._lock:
            return sorted(self._sessions)

    def has(self, game_id: str) -> bool:
        with self._lock:
            return str(game_id) in self._sessions

    # ------------------------------------------------------------------ 清理

    def purge_expired(self, now: Optional[float] = None) -> int:
        """删除空闲超时 / 已销毁的 session，返回删除数量（惰性清理入口）。"""
        moment = time.monotonic() if now is None else float(now)
        removed = 0
        with self._lock:
            for game_id, session in list(self._sessions.items()):
                if session.destroyed or session.is_expired(self.ttl_seconds, moment):
                    session.destroy()
                    self._sessions.pop(game_id, None)
                    removed += 1
        if removed:
            log.info("惰性清理了 %s 个 session（TTL=%ss）", removed, self.ttl_seconds)
        return removed

    def _enforce_capacity(self) -> None:
        """超过 `MAX_SESSIONS` 时按最近活跃时间淘汰最旧的 session。"""
        limit = self.max_sessions
        if len(self._sessions) < limit:
            return
        overflow = len(self._sessions) - limit + 1
        ordered = sorted(self._sessions.items(), key=lambda kv: kv[1].last_active_at)
        for game_id, session in ordered[:overflow]:
            session.destroy()
            self._sessions.pop(game_id, None)
            log.warning("session 数达到上限 %s，淘汰最旧的 %s", limit, game_id)

    # ------------------------------------------------------------------ CRUD

    def create(
        self,
        *,
        config: GameConfig,
        seed: Optional[int],
        human_player_id: Optional[int],
        agent_specs: list,
        game_id: Optional[str] = None,
    ) -> GameSession:
        """新建并登记一个 session（自动清理过期 + 容量淘汰）。"""
        self.purge_expired()
        with self._lock:
            self._enforce_capacity()
            new_id = str(game_id or uuid.uuid4())
            session = GameSession(
                new_id,
                config=config,
                seed=seed,
                human_player_id=human_player_id,
                agent_specs=agent_specs,
                settings=self.settings,
            )
            self._sessions[new_id] = session
            return session

    def get(self, game_id: str) -> GameSession:
        """取出 session；不存在 / 已过期 → 404 `GAME_NOT_FOUND`。"""
        key = str(game_id)
        with self._lock:
            session = self._sessions.get(key)
            if session is None:
                raise GameNotFound(f"游戏 {key} 不存在或已过期", details={"game_id": key})
            if session.destroyed or session.is_expired(self.ttl_seconds):
                session.destroy()
                self._sessions.pop(key, None)
                raise GameNotFound(
                    f"游戏 {key} 空闲超过 {int(self.ttl_seconds)} 秒，已回收",
                    details={"game_id": key},
                )
            return session

    def delete(self, game_id: str) -> bool:
        """删除 session（幂等：删除不存在的不报错，由路由决定是否 404）。"""
        key = str(game_id)
        with self._lock:
            session = self._sessions.pop(key, None)
        if session is None:
            return False
        session.destroy()
        return True

    def clear(self) -> None:
        with self._lock:
            for session in self._sessions.values():
                session.destroy()
            self._sessions.clear()


_store_lock = threading.Lock()
_store: Optional[SessionStore] = None


def get_session_store() -> SessionStore:
    """进程级单例（测试可用 `reset_session_store()` 重置）。"""
    global _store
    with _store_lock:
        if _store is None:
            _store = SessionStore(get_settings())
        return _store


def reset_session_store() -> SessionStore:
    """清空单例（测试用）。"""
    global _store
    with _store_lock:
        if _store is not None:
            _store.clear()
        _store = SessionStore(get_settings())
        return _store


__all__ = ["SessionStore", "get_session_store", "reset_session_store"]

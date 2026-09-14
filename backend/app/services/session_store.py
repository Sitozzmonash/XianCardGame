"""游戏 session 注册表。

本地未设置 `DATABASE_URL` 时，session 保存在进程内存，方便离线开发和
既有测试；设置 `DATABASE_URL` 后改由 PostgreSQL JSON 快照保存，适配
Vercel Function 的冷启动与多实例调度。
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
from .postgres_session_repository import PostgresSessionRepository

log = logging.getLogger("app.services.session_store")


class SessionStore:
    """`game_id -> GameSession` 存储门面，按配置选择内存或 PostgreSQL。"""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        repository: Optional[PostgresSessionRepository] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._sessions: dict[str, GameSession] = {}
        self._lock = threading.RLock()
        self._repository = repository
        if self._repository is None and self.settings.database_url:
            self._repository = PostgresSessionRepository(self.settings.database_url)

    @property
    def persistent(self) -> bool:
        return self._repository is not None

    @property
    def ttl_seconds(self) -> float:
        return float(self.settings.session_ttl_seconds)

    @property
    def max_sessions(self) -> int:
        return int(self.settings.max_sessions)

    def __len__(self) -> int:
        if self._repository is not None:
            return self._repository.count()
        with self._lock:
            return len(self._sessions)

    def game_ids(self) -> list[str]:
        if self._repository is not None:
            return self._repository.game_ids()
        with self._lock:
            return sorted(self._sessions)

    def has(self, game_id: str) -> bool:
        if self._repository is not None:
            return self._repository.has(str(game_id))
        with self._lock:
            return str(game_id) in self._sessions

    # ------------------------------------------------------------------ 清理

    def purge_expired(self, now: Optional[float] = None) -> int:
        """删除空闲超时 / 已销毁的 session，返回删除数量。"""
        if self._repository is not None:
            removed = self._repository.purge_expired()
        else:
            moment = time.time() if now is None else float(now)
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

    def _enforce_memory_capacity(self) -> None:
        limit = self.max_sessions
        if len(self._sessions) < limit:
            return
        overflow = len(self._sessions) - limit + 1
        ordered = sorted(self._sessions.items(), key=lambda item: item[1].last_active_at)
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
        """新建 session；持久模式下先为新局腾出全局容量。"""
        self.purge_expired()
        if self._repository is not None:
            self._repository.enforce_capacity(max(0, self.max_sessions - 1))
            session = GameSession(
                str(game_id or uuid.uuid4()),
                config=config,
                seed=seed,
                human_player_id=human_player_id,
                agent_specs=agent_specs,
                settings=self.settings,
            )
            # create 后还会运行 AI；路由会再保存最终快照。
            self._repository.save(session)
            return session

        with self._lock:
            self._enforce_memory_capacity()
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
        """读取可继续推进的 session；持久模式每次读取数据库最新版本。"""
        key = str(game_id)
        if self._repository is not None:
            session = self._repository.load(key)
            if session is None:
                raise GameNotFound(f"游戏 {key} 不存在或已过期", details={"game_id": key})
            return session

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

    def save(self, session: GameSession, *, expected_revision: Optional[int] = None) -> None:
        """写回已改变的 session；动作传旧 revision 做跨实例并发保护。"""
        if self._repository is not None:
            self._repository.save(session, expected_revision=expected_revision)

    def delete(self, game_id: str) -> bool:
        """删除 session（幂等：路由始终返回 `ok: true`）。"""
        key = str(game_id)
        if self._repository is not None:
            return self._repository.delete(key)
        with self._lock:
            session = self._sessions.pop(key, None)
        if session is None:
            return False
        session.destroy()
        return True

    def clear(self) -> None:
        if self._repository is not None:
            self._repository.clear()
            return
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

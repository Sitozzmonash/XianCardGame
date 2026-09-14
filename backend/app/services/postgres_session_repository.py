"""Neon/PostgreSQL 的游戏 session 快照仓库。

Vercel Functions 不是常驻单进程：不能把活跃对局只放在 Python dict 中。
这里刻意存 JSON 文本快照（不是 pickle），首次使用会创建所需表。
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..core.errors import StaleRevision
from .game_session import GameSession


class PostgresSessionRepository:
    """最小 PostgreSQL session 仓库；连接 URL 仅保存在进程内配置中。"""

    def __init__(self, database_url: str) -> None:
        self.database_url = str(database_url)
        self._schema_ready = False
        self._schema_lock = threading.Lock()

    def _connect(self):
        try:
            import psycopg
        except ImportError as exc:  # pragma: no cover - 打包配置错误
            raise RuntimeError("DATABASE_URL 已设置，但未安装 psycopg 依赖") from exc
        return psycopg.connect(self.database_url, connect_timeout=8)

    def _ensure_schema(self) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if self._schema_ready:
                return
            with self._connect() as connection, connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS game_sessions (
                        game_id TEXT PRIMARY KEY,
                        revision INTEGER NOT NULL,
                        snapshot_json TEXT NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS game_sessions_expires_at_idx
                    ON game_sessions (expires_at)
                    """
                )
            self._schema_ready = True

    def save(
        self, session: GameSession, *, expected_revision: Optional[int] = None
    ) -> None:
        """保存快照；动作保存时用旧 revision 防止跨实例覆盖。"""
        self._ensure_schema()
        snapshot_json = json.dumps(
            session.to_snapshot(), ensure_ascii=False, separators=(",", ":")
        )
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=float(session.settings.session_ttl_seconds)
        )
        with self._connect() as connection, connection.cursor() as cursor:
            if expected_revision is None:
                cursor.execute(
                    """
                    INSERT INTO game_sessions (game_id, revision, snapshot_json, expires_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (game_id) DO UPDATE SET
                        revision = EXCLUDED.revision,
                        snapshot_json = EXCLUDED.snapshot_json,
                        expires_at = EXCLUDED.expires_at,
                        updated_at = NOW()
                    """,
                    (session.game_id, int(session.revision), snapshot_json, expires_at),
                )
                return

            cursor.execute(
                """
                UPDATE game_sessions
                SET revision = %s,
                    snapshot_json = %s,
                    expires_at = %s,
                    updated_at = NOW()
                WHERE game_id = %s AND revision = %s AND expires_at > NOW()
                """,
                (
                    int(session.revision),
                    snapshot_json,
                    expires_at,
                    session.game_id,
                    int(expected_revision),
                ),
            )
            if cursor.rowcount != 1:
                raise StaleRevision()

    def load(self, game_id: str) -> Optional[GameSession]:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT snapshot_json FROM game_sessions
                WHERE game_id = %s AND expires_at > NOW()
                """,
                (str(game_id),),
            )
            row = cursor.fetchone()
        if row is None:
            return None
        try:
            return GameSession.from_snapshot(json.loads(row[0]))
        except (TypeError, ValueError, json.JSONDecodeError):
            # 无法安全恢复的损坏快照不可继续使用；下次访问会得到正常 404。
            self.delete(str(game_id))
            return None

    def delete(self, game_id: str) -> bool:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("DELETE FROM game_sessions WHERE game_id = %s", (str(game_id),))
            return cursor.rowcount > 0

    def purge_expired(self) -> int:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("DELETE FROM game_sessions WHERE expires_at <= NOW()")
            return cursor.rowcount

    def enforce_capacity(self, limit: int) -> int:
        """保留最新的 `limit` 局，淘汰更早活跃的持久 session。"""
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM game_sessions
                WHERE game_id IN (
                    SELECT game_id FROM game_sessions
                    ORDER BY updated_at DESC
                    OFFSET %s
                )
                """,
                (max(0, int(limit)),),
            )
            return cursor.rowcount

    def count(self) -> int:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM game_sessions WHERE expires_at > NOW()")
            return int(cursor.fetchone()[0])

    def game_ids(self) -> list[str]:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT game_id FROM game_sessions WHERE expires_at > NOW() ORDER BY game_id"
            )
            return [str(row[0]) for row in cursor.fetchall()]

    def has(self, game_id: str) -> bool:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM game_sessions WHERE game_id = %s AND expires_at > NOW()",
                (str(game_id),),
            )
            return cursor.fetchone() is not None

    def clear(self) -> None:
        self._ensure_schema()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("DELETE FROM game_sessions")


__all__ = ["PostgresSessionRepository"]

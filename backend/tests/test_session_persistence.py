"""无数据库单元测试：验证 Vercel/Neon 使用的 session 快照语义。"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.errors import StaleRevision
from app.services.game_session import GameSession
from app.services.session_store import SessionStore
from game import ActionKind, GameConfig


class SnapshotRepository:
    """用 JSON 快照行为模拟 PostgreSQL，测试时不需要真实数据库或凭据。"""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.rows: dict[str, dict] = {}

    def save(self, session, *, expected_revision=None) -> None:
        current = self.rows.get(session.game_id)
        if expected_revision is not None and (
            current is None or int(current["revision"]) != int(expected_revision)
        ):
            raise StaleRevision()
        self.rows[session.game_id] = session.to_snapshot()

    def load(self, game_id):
        payload = self.rows.get(str(game_id))
        return None if payload is None else GameSession.from_snapshot(payload, self.settings)

    def delete(self, game_id):
        return self.rows.pop(str(game_id), None) is not None

    def purge_expired(self):
        return 0

    def enforce_capacity(self, limit):
        while len(self.rows) > int(limit):
            self.rows.pop(next(iter(self.rows)))
        return 0

    def count(self):
        return len(self.rows)

    def game_ids(self):
        return sorted(self.rows)

    def has(self, game_id):
        return str(game_id) in self.rows

    def clear(self):
        self.rows.clear()


def test_game_session_snapshot_round_trip_preserves_private_reorder_state():
    settings = Settings()
    session = GameSession(
        "snapshot-reorder",
        config=GameConfig(num_players=2, seed=17),
        seed=17,
        human_player_id=0,
        agent_specs=[None, {"type": "rule"}],
        settings=settings,
    )
    session.state.current_player = 0
    peek = next(
        action
        for action in session.state.legal_actions()
        if action.kind == ActionKind.PLAY_PEEK
    )
    session._apply(peek, 0)

    restored = GameSession.from_snapshot(session.to_snapshot(), settings)

    assert restored.game_id == session.game_id
    assert restored.revision == session.revision
    assert restored.state.phase == session.state.phase
    assert restored.state.reorder_view == session.state.reorder_view
    assert restored.state.known_top == session.state.known_top
    assert restored.legal_action_ids() == session.legal_action_ids()


def test_persistent_store_recovers_game_and_rejects_cross_instance_overwrite():
    settings = Settings(session_ttl_seconds=3600, max_sessions=3)
    repository = SnapshotRepository(settings)
    store = SessionStore(settings=settings, repository=repository)
    session = store.create(
        config=GameConfig(num_players=2, seed=19),
        seed=19,
        human_player_id=0,
        agent_specs=[None, {"type": "random"}],
        game_id="persisted-game",
    )
    session.run_ai_until_human()
    store.save(session)

    recovered = store.get(session.game_id)
    assert recovered.game_id == session.game_id
    assert recovered.state.deck == session.state.deck
    assert recovered.state.hands == session.state.hands
    assert recovered.agent_specs == session.agent_specs
    assert recovered.legal_action_ids() == session.legal_action_ids()

    with pytest.raises(StaleRevision):
        store.save(recovered, expected_revision=recovered.revision - 1)

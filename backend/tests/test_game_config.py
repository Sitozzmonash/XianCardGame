"""`game/config.py` 契约测试（INTERFACES §1.2）。"""

from __future__ import annotations

import pytest

from game.cards import CARD_BY_API_ID, Card
from game.config import GameConfig, default_deck_composition


def test_defaults_match_contract():
    cfg = GameConfig()
    assert cfg.num_players == 3
    assert cfg.initial_hand == 5
    assert cfg.max_actions_per_turn == 2
    assert cfg.max_decisions == 500
    assert cfg.seed == 42
    assert cfg.deck_composition is None
    cfg.validate()  # 默认配置必须合法


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"num_players": 1}, "2~6"),
        ({"num_players": 7}, "2~6"),
        ({"initial_hand": 1}, "initial_hand"),
        ({"max_actions_per_turn": 0}, "max_actions_per_turn"),
        ({"max_decisions": 0}, "max_decisions"),
    ],
)
def test_validate_rejects_bad_values(kwargs, message):
    with pytest.raises(ValueError) as exc:
        GameConfig(**kwargs).validate()
    assert message in str(exc.value)


def test_validate_rejects_bad_deck_composition():
    with pytest.raises(ValueError):
        GameConfig(deck_composition={"NO_SUCH_CARD": 1}).validate()
    with pytest.raises(ValueError):
        GameConfig(deck_composition={"PEEK": 1}).validate()  # 必须用 API id
    with pytest.raises(ValueError):
        GameConfig(deck_composition={"STARGAZING": -1}).validate()
    with pytest.raises(TypeError):
        GameConfig(deck_composition=[("STARGAZING", 1)]).validate()  # type: ignore[arg-type]
    GameConfig(deck_composition={"STARGAZING": 3, "TRIBULATION": 1}).validate()


def test_default_composition_scales_linearly():
    assert default_deck_composition(3) == {
        "DEFUSE": 1,
        "STARGAZING": 6,
        "REWRITE_FATE": 3,
        "SHUFFLE": 3,
        "ESCAPE": 6,
        "STEAL": 3,
        "COUNTER": 3,
        "TRIBULATION": 2,
    }
    for n in range(2, 7):
        comp = default_deck_composition(n)
        assert comp["STARGAZING"] == 2 * n
        assert comp["ESCAPE"] == 2 * n
        assert comp["REWRITE_FATE"] == comp["SHUFFLE"] == comp["STEAL"] == comp["COUNTER"] == n
        assert comp["DEFUSE"] == max(1, n // 2)
        assert comp["TRIBULATION"] == n - 1
        assert set(comp) <= set(CARD_BY_API_ID)


def test_composition_falls_back_to_default_and_merges_override():
    assert GameConfig(num_players=4).composition() == default_deck_composition(4)
    comp = GameConfig(num_players=4, deck_composition={"TRIBULATION": 5}).composition()
    assert comp["TRIBULATION"] == 5
    assert comp["STARGAZING"] == 8  # 未覆盖项保持默认
    # 覆盖项可以显式清零
    comp = GameConfig(num_players=3, deck_composition={"STARGAZING": 0}).composition()
    assert comp["STARGAZING"] == 0


def test_to_dict_from_dict_round_trip():
    cfg = GameConfig(
        num_players=4,
        initial_hand=6,
        max_actions_per_turn=3,
        max_decisions=123,
        seed=7,
        deck_composition={"STARGAZING": 2, "TRIBULATION": 3},
    )
    data = cfg.to_dict()
    assert data == {
        "num_players": 4,
        "initial_hand": 6,
        "max_actions_per_turn": 3,
        "max_decisions": 123,
        "seed": 7,
        "deck_composition": {"STARGAZING": 2, "TRIBULATION": 3},
    }
    assert GameConfig.from_dict(data) == cfg
    assert GameConfig.from_dict(cfg.to_dict()).to_dict() == data


def test_from_dict_accepts_aliases_and_rejects_unknown():
    cfg = GameConfig.from_dict({"players": 5, "max_actions": 1, "seed": 3})
    assert cfg.num_players == 5 and cfg.max_actions_per_turn == 1 and cfg.seed == 3
    with pytest.raises(ValueError):
        GameConfig.from_dict({"nope": 1})
    with pytest.raises(ValueError):
        GameConfig.from_dict({"players": 9})
    with pytest.raises(TypeError):
        GameConfig.from_dict("not-a-mapping")  # type: ignore[arg-type]


def test_from_yaml_flat_and_nested(tmp_path):
    flat = tmp_path / "flat.yaml"
    flat.write_text("num_players: 2\ninitial_hand: 4\nseed: 11\n", encoding="utf-8")
    cfg = GameConfig.from_yaml(str(flat))
    assert (cfg.num_players, cfg.initial_hand, cfg.seed) == (2, 4, 11)

    nested = tmp_path / "nested.yaml"
    nested.write_text(
        "game: {players: 3, initial_hand: 5, max_actions_per_turn: 2, seed: 42}\n"
        "training: {iterations: 10}\n",
        encoding="utf-8",
    )
    cfg = GameConfig.from_yaml(str(nested))
    assert (cfg.num_players, cfg.initial_hand, cfg.max_actions_per_turn, cfg.seed) == (
        3,
        5,
        2,
        42,
    )

    bad = tmp_path / "bad.yaml"
    bad.write_text("- 1\n- 2\n", encoding="utf-8")
    with pytest.raises(ValueError):
        GameConfig.from_yaml(str(bad))


def test_initial_defuse_extra_count():
    """每人 1 张护劫符之外，牌堆里还要有 max(1, N//2) 张（参考实现语义）。"""
    for n in range(2, 7):
        assert default_deck_composition(n)["DEFUSE"] == max(1, n // 2) >= 1

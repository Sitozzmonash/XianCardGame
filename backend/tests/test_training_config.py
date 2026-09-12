"""`training/config.py` 单元测试：YAML 加载、校验、默认值、路径解析。"""

from __future__ import annotations

from pathlib import Path

import pytest

from training import DEFAULT_TRAIN_CONFIG, load_train_config, normalize_train_config
from training.config import checkpoint_prefix_for, resolve_out_path

CONFIG_DIR = Path(__file__).resolve().parents[1] / "configs"


def test_load_train_2p_yaml() -> None:
    config = load_train_config(str(CONFIG_DIR / "train_2p.yaml"))
    assert config["game"]["players"] == 2
    assert config["training"]["algorithm"] == "mccfr"
    assert config["training"]["iterations"] == 100_000
    assert config["training"]["workers"] == 1
    assert config["training"]["sync_batch"] == 1000
    assert config["training"]["checkpoint_every"] == 10_000
    assert config["training"]["exploration"] == 0.6
    assert config["output"]["out"].endswith("mccfr_2p_100k.pkl")
    assert config["source"].endswith("train_2p.yaml")


def test_load_train_3p_yaml() -> None:
    config = load_train_config(str(CONFIG_DIR / "train_3p.yaml"))
    assert config["game"]["players"] == 3
    assert config["training"]["workers"] == 8
    assert "mccfr_3p" in config["output"]["out"]


def test_all_required_configs_exist() -> None:
    for name in ("train_2p.yaml", "train_3p.yaml", "game_3p.yaml"):
        assert (CONFIG_DIR / name).exists(), f"缺少配置文件 {name}"


def test_game_3p_yaml_is_loadable_by_game_config() -> None:
    """configs/game_3p.yaml 必须能被 game.GameConfig.from_yaml 直接读。"""
    from game import GameConfig

    cfg = GameConfig.from_yaml(str(CONFIG_DIR / "game_3p.yaml"))
    assert cfg.num_players == 3
    assert cfg.initial_hand == 5
    cfg.validate()


def test_unknown_field_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text("training:\n  iteraions: 10\n", encoding="utf-8")  # 拼错字段名
    with pytest.raises(ValueError, match="未知字段"):
        load_train_config(str(path))


def test_unknown_section_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text("trainging:\n  iterations: 10\n", encoding="utf-8")
    with pytest.raises(ValueError, match="未知字段"):
        load_train_config(str(path))


def test_exploration_out_of_range(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text("training:\n  exploration: 1.5\n", encoding="utf-8")
    with pytest.raises(ValueError, match="exploration"):
        load_train_config(str(path))


def test_negative_iterations_rejected(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text("training:\n  iterations: -5\n", encoding="utf-8")
    with pytest.raises(ValueError, match="iterations"):
        load_train_config(str(path))


def test_unknown_algorithm_rejected(tmp_path: Path) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text("training:\n  algorithm: dqn\n", encoding="utf-8")
    with pytest.raises(ValueError, match="算法"):
        load_train_config(str(path))


def test_missing_file_raises() -> None:
    with pytest.raises(FileNotFoundError):
        load_train_config(str(CONFIG_DIR / "nope.yaml"))


def test_normalize_defaults() -> None:
    config = normalize_train_config({})
    assert config["game"]["players"] == DEFAULT_TRAIN_CONFIG["game"]["players"]
    assert config["training"]["iterations"] == DEFAULT_TRAIN_CONFIG["training"]["iterations"]
    assert config["output"]["out"].endswith(".pkl")
    assert config["training"]["workers"] >= 1


def test_partial_section_keeps_other_defaults() -> None:
    config = normalize_train_config({"training": {"iterations": 7}})
    assert config["training"]["iterations"] == 7
    assert config["training"]["sync_batch"] == DEFAULT_TRAIN_CONFIG["training"]["sync_batch"]
    assert config["game"]["players"] == DEFAULT_TRAIN_CONFIG["game"]["players"]


def test_resolve_out_path_precedence() -> None:
    explicit = {"output": {"out": "a/b.pkl", "model_dir": "x", "name": "y"}}
    assert resolve_out_path(explicit) == "a/b.pkl"
    assert resolve_out_path({"output": {"model_dir": "x", "name": "y"}}) == str(Path("x") / "y.pkl")
    assert resolve_out_path({"output": {}, "game": {"players": 4}}).endswith("mccfr_4p.pkl")


def test_checkpoint_prefix_for() -> None:
    assert checkpoint_prefix_for("models/x.pkl") == str(Path("models") / "x_ckpt")
    assert checkpoint_prefix_for("models/a/b.pkl").endswith("b_ckpt")

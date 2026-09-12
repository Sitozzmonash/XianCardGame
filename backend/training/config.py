"""训练 YAML 配置加载（冻结契约 `docs/INTERFACES.md` §3.2，spec §39）。

YAML 结构（三段式）：:

    game:
      players: 3
      initial_hand: 5
      max_actions_per_turn: 2
      seed: 42
    training:
      algorithm: mccfr
      iterations: 100000
      workers: 8
      sync_batch: 1000
      checkpoint_every: 10000
      exploration: 0.6
      log_every: 1000
    output:
      model_dir: models/mccfr_3p
      name: mccfr_3p_100k

`load_train_config()` 会校验字段名与取值、补齐默认值，并算出最终模型路径
（`output.out` > `output.model_dir`+`output.name` > 默认 `models/mccfr_<N>p.pkl`）。
字段名写错会**直接报错**而不是被静默忽略——配置错字是最常见的手滑。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Optional

#: `game` 段允许的字段（含 `GameConfig` 的别名）
GAME_FIELDS: tuple[str, ...] = (
    "players",
    "num_players",
    "initial_hand",
    "max_actions_per_turn",
    "max_decisions",
    "seed",
    "deck_composition",
)

#: `training` 段允许的字段
TRAINING_FIELDS: tuple[str, ...] = (
    "algorithm",
    "iterations",
    "workers",
    "sync_batch",
    "checkpoint_every",
    "exploration",
    "log_every",
    "progress",
    "metrics_path",
)

#: `output` 段允许的字段
OUTPUT_FIELDS: tuple[str, ...] = (
    "model_dir",
    "name",
    "out",
    "model",
    "path",
    "checkpoint_prefix",
)

#: 支持的算法（第一阶段只有 MCCFR，spec §60 明确不做深度 RL）
SUPPORTED_ALGORITHMS: tuple[str, ...] = ("mccfr",)

#: 默认配置（三段式，与 YAML 结构一一对应）
DEFAULT_TRAIN_CONFIG: dict[str, dict[str, Any]] = {
    "game": {
        "players": 3,
        "initial_hand": 5,
        "max_actions_per_turn": 2,
        "max_decisions": 500,
        "seed": 42,
        "deck_composition": None,
    },
    "training": {
        "algorithm": "mccfr",
        "iterations": 100_000,
        "workers": 1,
        "sync_batch": 1000,
        "checkpoint_every": 10_000,
        "exploration": 0.6,
        "log_every": 1000,
        "progress": True,
        "metrics_path": None,
    },
    "output": {
        "model_dir": "models",
        "name": None,
        "out": None,
        "checkpoint_prefix": None,
    },
}

_SECTIONS: tuple[str, ...] = ("game", "training", "output")


def _load_yaml(path: str) -> Mapping[str, Any]:
    import yaml  # 延迟导入：只有用到 YAML 时才需要 PyYAML

    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(f"训练配置不存在：{path}")
    with target.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if data is None:
        return {}
    if not isinstance(data, Mapping):
        raise ValueError(f"训练配置格式错误（应为 mapping）：{path}")
    return data


def _reject_unknown(section: str, data: Mapping[str, Any], allowed: tuple[str, ...]) -> None:
    unknown = [key for key in data if key not in allowed]
    if unknown:
        raise ValueError(
            f"训练配置 {section} 段存在未知字段 {unknown}；"
            f"可用字段：{list(allowed)}"
        )


def _as_int(value: Any, field: str, minimum: Optional[int] = None) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"训练配置字段 {field} 必须是整数，实际：{value!r}") from exc
    if minimum is not None and number < minimum:
        raise ValueError(f"训练配置字段 {field} 至少为 {minimum}，实际：{number}")
    return number


def _as_float(value: Any, field: str, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"训练配置字段 {field} 必须是数字，实际：{value!r}") from exc
    if not low <= number <= high:
        raise ValueError(f"训练配置字段 {field} 需落在 [{low}, {high}]，实际：{number}")
    return number


def _as_bool(value: Any, field: str) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("true", "1", "yes", "on"):
        return True
    if text in ("false", "0", "no", "off"):
        return False
    raise ValueError(f"训练配置字段 {field} 必须是布尔值，实际：{value!r}")


def load_train_config(path: str) -> dict:
    """读取并校验训练 YAML，返回**补齐默认值后的规范化 dict**。

    返回结构：:

        {"game": {...}, "training": {...}, "output": {...}, "source": "<path>"}
    """
    return normalize_train_config(_load_yaml(path), source=str(path))


def normalize_train_config(raw: Optional[Mapping[str, Any]] = None, source: str = "<inline>") -> dict:
    """把（可能来自 YAML 或 CLI 的）mapping 规范化成完整三段式配置。

    未知字段直接报错，取值越界直接报错；缺省字段用 `DEFAULT_TRAIN_CONFIG` 补齐。
    """
    data: Mapping[str, Any] = raw or {}
    if not isinstance(data, Mapping):
        raise ValueError("训练配置必须是 mapping。")
    _reject_unknown("根", data, _SECTIONS)

    config: dict[str, Any] = {
        section: dict(DEFAULT_TRAIN_CONFIG[section]) for section in _SECTIONS
    }

    for section in _SECTIONS:
        section_data = data.get(section)
        if section_data is None:
            continue
        if not isinstance(section_data, Mapping):
            raise ValueError(f"训练配置 {section} 段必须是 mapping。")
        allowed = {
            "game": GAME_FIELDS,
            "training": TRAINING_FIELDS,
            "output": OUTPUT_FIELDS,
        }[section]
        _reject_unknown(section, section_data, allowed)
        config[section].update(dict(section_data))

    _validate(config["game"], config["training"])
    config["output"]["out"] = resolve_out_path(config)
    config["source"] = str(source)
    return config


def _validate(game: dict, training: dict) -> None:
    """取值范围校验（比 `GameConfig.validate` 更早失败，错误信息更友好）。"""
    players = game.get("players", game.get("num_players", 3))
    game["players"] = _as_int(players, "game.players")
    game.pop("num_players", None)
    game["initial_hand"] = _as_int(game["initial_hand"], "game.initial_hand", 2)
    game["max_actions_per_turn"] = _as_int(
        game["max_actions_per_turn"], "game.max_actions_per_turn", 1
    )
    game["max_decisions"] = _as_int(game["max_decisions"], "game.max_decisions", 1)
    game["seed"] = _as_int(game["seed"], "game.seed")

    algorithm = str(training["algorithm"]).strip().lower()
    if algorithm not in SUPPORTED_ALGORITHMS:
        raise ValueError(
            f"不支持的训练算法：{training['algorithm']}；"
            f"当前仅支持 {list(SUPPORTED_ALGORITHMS)}"
        )
    training["algorithm"] = algorithm
    training["iterations"] = _as_int(training["iterations"], "training.iterations", 0)
    training["workers"] = _as_int(training["workers"], "training.workers", 1)
    training["sync_batch"] = _as_int(training["sync_batch"], "training.sync_batch", 1)
    training["checkpoint_every"] = _as_int(
        training["checkpoint_every"], "training.checkpoint_every", 0
    )
    training["log_every"] = _as_int(training["log_every"], "training.log_every", 1)
    training["exploration"] = _as_float(
        training["exploration"], "training.exploration", 0.0, 1.0
    )
    training["progress"] = _as_bool(training["progress"], "training.progress")


def resolve_out_path(config: Mapping[str, Any]) -> str:
    """算出最终模型输出路径（`output.out` > `model_dir`+`name` > 默认）。"""
    output = config.get("output") or {}
    explicit = output.get("out") or output.get("model") or output.get("path")
    if explicit:
        return str(explicit)

    model_dir = str(output.get("model_dir") or "models")
    name = output.get("name")
    if not name:
        players = (config.get("game") or {}).get("players", 3)
        name = f"mccfr_{int(players)}p"
    return str(Path(model_dir) / f"{name}.pkl")


def game_kwargs(config: Mapping[str, Any]) -> dict:
    """把 `game` 段转成 `GameConfig(**kwargs)` 可用的参数。"""
    game = dict(config.get("game") or {})
    game["num_players"] = int(game.pop("players", game.get("num_players", 3)))
    return game


def build_game_config(config: Mapping[str, Any]):
    """由配置构造 `GameConfig`（延迟导入 game，保持模块轻量）。"""
    from game import GameConfig

    return GameConfig(**game_kwargs(config))


def checkpoint_prefix_for(out_path: str) -> str:
    """`models/x.pkl` -> `models/x_ckpt`（checkpoint 命名前缀）。"""
    path = Path(str(out_path))
    return str(path.with_suffix("")) + "_ckpt"


__all__ = [
    "DEFAULT_TRAIN_CONFIG",
    "SUPPORTED_ALGORITHMS",
    "load_train_config",
    "normalize_train_config",
    "resolve_out_path",
    "game_kwargs",
    "build_game_config",
    "checkpoint_prefix_for",
]

"""`training` 包：MCCFR 训练器（单进程 / 多进程 / checkpoint / 续训 / YAML 配置）。

对外契约见 `docs/INTERFACES.md` §3.1 / §3.2。
"""

from __future__ import annotations

from .config import (
    DEFAULT_TRAIN_CONFIG,
    checkpoint_prefix_for,
    load_train_config,
    normalize_train_config,
)
from .logging_utils import (
    DEFAULT_METRICS_PATH,
    append_metric,
    format_duration,
    log_info,
)
from .trainer import FORMAT_VERSION, LEGACY_KEY_MIGRATOR, MCCFRTrainer, migrate_legacy_key

__all__ = [
    "MCCFRTrainer",
    "FORMAT_VERSION",
    "load_train_config",
    "normalize_train_config",
    "checkpoint_prefix_for",
    "DEFAULT_TRAIN_CONFIG",
    "DEFAULT_METRICS_PATH",
    "append_metric",
    "format_duration",
    "log_info",
    "migrate_legacy_key",
    "LEGACY_KEY_MIGRATOR",
]

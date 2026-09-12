"""训练日志工具（spec §56）：中文控制台日志 + 机器可读 JSONL 指标。

- 控制台：中文、带 `[MCCFR]` 前缀，字段含 iterations / traversals / 信息集数 /
  `iter/s` / elapsed / checkpoint 路径；
- 机器可读：每条记录一行 JSON 追加到 `backend/logs/train_metrics.jsonl`，
  字段固定为 `iteration / elapsed / infosets / iterations_per_second / policy_size /
  checkpoint`（方便后续画学习曲线）。
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Mapping, Optional

#: backend/ 目录（本文件位于 backend/training/logging_utils.py）
BACKEND_DIR: Path = Path(__file__).resolve().parents[1]

#: 默认指标文件：`backend/logs/train_metrics.jsonl`（.gitignore 已忽略 logs/*.jsonl）
DEFAULT_METRICS_PATH: str = str(BACKEND_DIR / "logs" / "train_metrics.jsonl")


def format_duration(seconds: float) -> str:
    """把秒数格式化成 `00:42:44` 风格（spec §56 的 `Elapsed` 字段）。"""
    total = max(0, int(round(float(seconds))))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def log_info(message: str) -> None:
    """打印一行中文训练日志（立刻 flush，后台运行时也能实时看到）。"""
    print(f"[MCCFR] {message}", flush=True)


def append_metric(record: Mapping[str, Any], path: Optional[str] = None) -> None:
    """把一条指标记录追加成 JSONL 行。

    写入失败（目录不可写等）**不阻断训练**，只打印一行提示。
    """
    target = Path(path) if path else Path(DEFAULT_METRICS_PATH)
    payload = dict(record)
    payload.setdefault("timestamp", round(time.time(), 3))
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except OSError as exc:  # pragma: no cover - 取决于文件系统权限
        log_info(f"警告：无法写入指标文件 {target}（{exc}），训练继续。")


def read_metrics(path: Optional[str] = None) -> list[dict]:
    """读回 JSONL 指标（供测试与学习曲线使用）。"""
    target = Path(path) if path else Path(DEFAULT_METRICS_PATH)
    if not target.exists():
        return []
    out: list[dict] = []
    with target.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

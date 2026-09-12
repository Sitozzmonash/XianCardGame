"""`main.py models --write-index` 自动生成 `models/index.json` 的测试。

背景：模型按人数训练不可跨人数复用，前端要靠 `models/index.json` 的 `players` 过滤；
手写清单容易漏，所以由 CLI 从模型**文件头**读元信息生成，并要求幂等。

断言重点：

1. 字段与 `app/services/model_registry.py::ModelEntry` 对齐（id/name/path/players/
   iterations/created_at/note），拿不到的字段省略；
2. 按 `id` 排序稳定、重复运行**字节一致**；
3. 默认（不带 `--write-index`）**不动文件**；
4. `--json` 时把生成的条目打到 stdout；
5. 生成的清单能被 `list_available_models()` 直接消费。
"""

from __future__ import annotations

import json
from pathlib import Path

import main as cli
from game import GameConfig
from training import MCCFRTrainer


def make_model(path: Path, players: int = 2, iterations: int = 5, strategy_only: bool = False) -> Path:
    """造一个最小的真模型（走正式 save 路径，保证元信息与真实产物一致）。"""
    trainer = MCCFRTrainer(
        GameConfig(num_players=players, max_decisions=30, seed=42), seed=3, metrics_path=None
    )
    trainer.train(iterations=iterations, workers=1, progress=False)
    trainer.save(str(path), strategy_only=strategy_only)
    return path


def test_write_index_generates_schema(tmp_path: Path, capsys) -> None:
    models = tmp_path / "models"
    models.mkdir()
    make_model(models / "mccfr_2p_10k.pkl", players=2, iterations=7)
    make_model(models / "mccfr_3p_deploy.pkl", players=3, iterations=5, strategy_only=True)

    assert cli.main(["models", "--dir", str(models), "--write-index"]) == 0
    out = capsys.readouterr().out
    assert "已写入模型清单" in out

    index_path = models / "index.json"
    assert index_path.exists()
    raw = json.loads(index_path.read_text(encoding="utf-8"))
    assert isinstance(raw.get("models"), list)
    entries = raw["models"]
    assert [entry["id"] for entry in entries] == ["mccfr_2p_10k", "mccfr_3p_deploy"]  # 按 id 排序

    first = entries[0]
    assert first["name"] == "MCCFR 2P 10K"
    assert first["path"] == f"{models.as_posix()}/mccfr_2p_10k.pkl"
    assert first["players"] == 2
    assert first["iterations"] == 7
    assert first["created_at"]  # 由文件 mtime 生成（YYYY-MM-DD）
    assert "2 人" in first["note"] and "7 迭代" in first["note"]
    assert "v2" in first["note"] and "全量" in first["note"] and "可续训" in first["note"]

    deploy = entries[1]
    assert deploy["players"] == 3
    assert "仅策略" in deploy["note"] and "不能续训" in deploy["note"]
    # 未知字段一律省略（不写 null）
    assert all(value is not None for value in first.values())

    # 生成的清单要能直接喂给 list_available_models()
    listed = cli.list_available_models(str(models))
    assert len(listed) == 2
    assert any("2 人 / 7 迭代" in item for item in listed)


def test_write_index_is_idempotent(tmp_path: Path, capsys) -> None:
    models = tmp_path / "models"
    models.mkdir()
    make_model(models / "mccfr_2p.pkl")
    index_path = models / "index.json"

    assert cli.main(["models", "--dir", str(models), "--write-index"]) == 0
    capsys.readouterr()
    first_bytes = index_path.read_bytes()
    first_mtime = index_path.stat().st_mtime

    assert cli.main(["models", "--dir", str(models), "--write-index"]) == 0
    out = capsys.readouterr().out
    assert index_path.read_bytes() == first_bytes, "同样目录跑两次，清单字节必须一致"
    assert index_path.stat().st_mtime == first_mtime, "内容没变就不该重写文件"
    assert "内容未变" in out


def test_models_without_flag_does_not_write(tmp_path: Path, capsys) -> None:
    """默认只读列出：不新建、也不改动已有 index.json。"""
    models = tmp_path / "models"
    models.mkdir()
    make_model(models / "mccfr_2p.pkl")
    index_path = models / "index.json"

    assert cli.main(["models", "--dir", str(models)]) == 0
    out = capsys.readouterr().out
    assert "已写入模型清单" not in out and "内容未变，保持" not in out
    assert not index_path.exists(), "不带 --write-index 时不得写清单"

    index_path.write_text('{"models": []}', encoding="utf-8")
    before = index_path.read_bytes()
    assert cli.main(["models", "--dir", str(models)]) == 0
    assert index_path.read_bytes() == before


def test_write_index_json_prints_entries(tmp_path: Path, capsys) -> None:
    models = tmp_path / "models"
    models.mkdir()
    make_model(models / "mccfr_4p_20k.pkl", players=4, iterations=9)

    assert cli.main(["models", "--dir", str(models), "--write-index", "--json"]) == 0
    out = capsys.readouterr().out
    assert '"id": "mccfr_4p_20k"' in out
    assert '"players": 4' in out
    assert '"iterations": 9' in out
    assert "MCCFR 4P 20K" in out


def test_write_index_on_empty_dir(tmp_path: Path, capsys) -> None:
    """空目录也要能刷新清单（写一个空 models 列表），而不是报错。"""
    models = tmp_path / "models"
    models.mkdir()
    assert cli.main(["models", "--dir", str(models), "--write-index"]) == 0
    out = capsys.readouterr().out
    assert "没有任何模型文件" in out and "空清单" in out
    assert json.loads((models / "index.json").read_text(encoding="utf-8")) == {"models": []}

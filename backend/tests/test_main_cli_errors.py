"""CLI 错误处理测试（`main.py`）。

用户写错模型 / 配置文件路径时，必须看到**中文提示 + 退出码 2**，而不是 Python traceback。
这组测试直接调 `main.main([...])` 断言退出码与输出文本（不依赖子进程）。
"""

from __future__ import annotations

from pathlib import Path

import pytest

import main as cli


def _run(capsys, argv: list[str]) -> tuple[int, str]:
    """跑一次 CLI，返回 (退出码, stdout+stderr)。"""
    code = cli.main(argv)
    captured = capsys.readouterr()
    return code, captured.out + captured.err


# --------------------------------------------------------------------- 模型缺失


def test_battle_missing_model_is_friendly(capsys) -> None:
    code, text = _run(
        capsys,
        [
            "battle",
            "--players",
            "2",
            "--agents",
            "mccfr:models/不存在.pkl",
            "rule",
            "--games",
            "2",
        ],
    )
    assert code == 2, "模型缺失必须退出码 2"
    assert "找不到 MCCFR 模型：models/不存在.pkl" in text
    assert "可用模型（models/ 下）" in text
    assert "先训练一个：python main.py train" in text
    assert "Traceback" not in text
    assert "FileNotFoundError" not in text


def test_benchmark_missing_opponent_model_is_friendly(capsys) -> None:
    code, text = _run(
        capsys,
        [
            "benchmark",
            "--agents",
            "rule",
            "--opponent",
            "mccfr:models/nope-a.pkl",
            "--games",
            "2",
        ],
    )
    assert code == 2
    assert "找不到 MCCFR 模型：models/nope-a.pkl" in text
    assert "Traceback" not in text


def test_benchmark_missing_candidate_model_is_friendly(capsys) -> None:
    code, text = _run(
        capsys,
        [
            "benchmark",
            "--agents",
            "mccfr:models/nope-b.pkl",
            "--opponent",
            "random",
            "--games",
            "2",
        ],
    )
    assert code == 2
    assert "找不到 MCCFR 模型：models/nope-b.pkl" in text


def test_demo_missing_model_is_friendly(capsys) -> None:
    code, text = _run(
        capsys, ["demo", "--players", "2", "--agents", "mccfr:models/nope-c.pkl", "rule"]
    )
    assert code == 2
    assert "找不到 MCCFR 模型" in text


def test_play_missing_model_is_friendly(capsys) -> None:
    code, text = _run(
        capsys, ["play", "--players", "2", "--ai", "mccfr:models/nope-d.pkl", "--auto"]
    )
    assert code == 2
    assert "找不到 MCCFR 模型" in text


def test_mccfr_spec_without_path_is_friendly(capsys) -> None:
    code, text = _run(
        capsys, ["battle", "--players", "2", "--agents", "mccfr:", "rule", "--games", "2"]
    )
    assert code == 2
    assert "mccfr 需要模型路径" in text


def test_missing_model_message_lists_available_models(capsys, tmp_path, monkeypatch) -> None:
    """`models/` 下若有模型，提示里应把它们列出来。"""
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "fake_2p_10k.pkl").write_bytes(b"x" * 2048)
    monkeypatch.chdir(tmp_path)

    code, text = _run(
        capsys, ["battle", "--players", "2", "--agents", "mccfr:models/typo.pkl", "rule"]
    )
    assert code == 2
    assert "models/fake_2p_10k.pkl" in text
    assert "MB" in text


def test_missing_model_message_says_none_found(tmp_path, monkeypatch) -> None:
    (tmp_path / "models").mkdir()
    monkeypatch.chdir(tmp_path)
    message = cli._missing_model_message("models/x.pkl")
    assert "（models/ 下没有任何 .pkl 模型）" in message


# --------------------------------------------------------------------- 配置 / 续训


def test_train_missing_config_is_friendly(capsys) -> None:
    code, text = _run(capsys, ["train", "--config", "configs/没有这个.yaml", "--iterations", "1"])
    assert code == 2
    assert "找不到训练配置：configs/没有这个.yaml" in text
    assert "train_2p.yaml" in text  # 列出 configs/ 下的可用配置
    assert "Traceback" not in text


def test_train_missing_resume_model_is_friendly(capsys) -> None:
    code, text = _run(capsys, ["train", "--resume", "models/没有这个.pkl", "--iterations", "1"])
    assert code == 2
    assert "找不到续训模型：models/没有这个.pkl" in text
    assert "先训练一个" in text
    assert "Traceback" not in text


def test_cli_error_is_not_system_exit() -> None:
    """校验失败抛的是 CliError（由 main 统一处理），不是 SystemExit / 原样异常。"""
    with pytest.raises(cli.CliError):
        cli.validate_agent_specs(["mccfr:models/绝对不存在.pkl"])
    with pytest.raises(cli.CliError):
        cli.validate_agent_specs(["mccfr:"])


# --------------------------------------------------------------------- 正常路径不受影响


def test_valid_specs_pass_validation() -> None:
    cli.validate_agent_specs(["random", "rule", "ismcts:10"])


def test_battle_with_valid_agents_exits_zero(capsys) -> None:
    code, text = _run(
        capsys, ["battle", "--players", "2", "--agents", "random", "rule", "--games", "2", "--quiet"]
    )
    assert code == 0
    assert "AI 对战结果" in text


def test_model_path_from_spec() -> None:
    assert cli.model_path_from_spec("random") is None
    assert cli.model_path_from_spec("ismcts:10") is None
    assert cli.model_path_from_spec("mccfr:models/a.pkl") == "models/a.pkl"
    # Windows 盘符里的冒号要保留
    assert cli.model_path_from_spec("mccfr:D:/x/models/a.pkl") == "D:/x/models/a.pkl"
    assert cli.model_path_from_spec("mccfr:") == ""


def test_list_available_models_uses_index_json(tmp_path) -> None:
    models = tmp_path / "models"
    models.mkdir()
    (models / "m.pkl").write_bytes(b"x" * 1024)
    (models / "index.json").write_text(
        '{"models": [{"file": "m.pkl", "players": 2, "iterations": 10000}]}',
        encoding="utf-8",
    )
    entries = cli.list_available_models(str(models))
    assert len(entries) == 1
    assert "2 人 / 10,000 迭代" in entries[0]


def test_list_available_models_missing_dir(tmp_path: Path) -> None:
    assert cli.list_available_models(str(tmp_path / "nope")) == []

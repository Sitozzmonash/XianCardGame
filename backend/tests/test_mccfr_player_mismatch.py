"""「模型人数 ↔ 对局人数」一致性校验测试（防静默陷阱）。

背景（实测）：`infoset_key` 里的 `hand_sizes` 长度与 `alive_mask` 位宽都随人数变化，
所以 2 人模型的信息集键在 3 人局里**永不命中**，MCCFR 每一步都回落到 RuleAgent ——
程序却毫无提示，用户会以为「训练了就一定能用」。这组测试把提示钉死：

1. 人数不匹配：不抛异常、命中恒为 0、报表文本含「警告」；
2. 人数匹配：不出现该警告（防止误报）；
3. `--json` 里带 `model_players` / `game_players` / `players_match`；
4. `peek_model_players()` 只读头部就能拿到人数（不完整加载大模型）。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import main as cli
from agents import MCCFRAgent
from game import GameConfig
from training import MCCFRTrainer
from training.codec import peek_model_header
from training.trainer import peek_model_players

#: 人数不匹配时的关键提示语（比「警告」更精确，避免和命中率报表的 ⚠ 警告混淆）
MISMATCH_MARK = "信息集键空间不重叠"


def make_model(tmp_path: Path, players: int = 2, iterations: int = 25) -> Path:
    """训练一个小模型并存成 v2（默认格式）。"""
    trainer = MCCFRTrainer(
        GameConfig(num_players=players, max_decisions=60, seed=42),
        seed=7,
        metrics_path=None,
    )
    trainer.train(iterations=iterations, workers=1, progress=False)
    path = tmp_path / f"mccfr_{players}p.pkl"
    trainer.save(str(path))
    return path


def extract_json(text: str) -> dict:
    """从 CLI 输出里取出 battle 的 `--json` 顶层对象。

    输出里还有嵌套对象（`player_checks` 的每一行、`seat_win_rates` 等），
    所以用「同时含 `games` 与 `player_checks`」来锁定最外层那个。
    """
    decoder = json.JSONDecoder()
    for index in range(len(text) - 1, -1, -1):
        if text[index] != "{":
            continue
        try:
            payload, _end = decoder.raw_decode(text[index:])
        except ValueError:
            continue
        if isinstance(payload, dict) and "games" in payload and "player_checks" in payload:
            return payload
    raise AssertionError(f"输出里找不到 JSON：\n{text[-2000:]}")


# --------------------------------------------------------------------------- peek


def test_peek_model_players_reads_header_only(tmp_path: Path) -> None:
    """只读头部即可拿到人数（v2 容器不 materialize 几十 MB blob）。"""
    path = make_model(tmp_path, players=2)
    assert peek_model_players(str(path)) == 2

    header = peek_model_header(str(path))
    assert header["encoding"] == "packed-v2"
    assert header["config"]["num_players"] == 2
    assert header["n_infosets"] > 0
    assert header["key_blob_bytes"] > 0  # 长度信息从头部就能拿到
    assert "regret_blob" not in header  # 但 blob 内容不展开

    # 3 人模型
    path3 = make_model(tmp_path, players=3, iterations=10)
    assert peek_model_players(str(path3)) == 3

    # v1（plain dict）也要能读到
    trainer = MCCFRTrainer(GameConfig(num_players=2, max_decisions=40, seed=42), seed=1, metrics_path=None)
    v1 = tmp_path / "v1.pkl"
    trainer.save(str(v1), format="v1")
    assert peek_model_players(str(v1)) == 2

    # 读不到就返回 None，而不是抛异常
    assert peek_model_players(str(tmp_path / "missing.pkl")) is None
    junk = tmp_path / "junk.pkl"
    junk.write_bytes(b"not a pickle at all")
    assert peek_model_players(str(junk)) is None


def test_agent_trainer_players_property(tmp_path: Path) -> None:
    """`MCCFRAgent.trainer_players` 只读属性（不改 `act()` 语义）。"""
    path = make_model(tmp_path, players=3, iterations=10)
    agent = MCCFRAgent.load(str(path), seed=1)
    assert agent.trainer_players == 3

    class _Stub:
        strategy_sum: dict = {}
        regret_sum: dict = {}

        def average_strategy(self, state, player):  # pragma: no cover - 不会被调用
            return {}

    assert MCCFRAgent(_Stub(), seed=0).trainer_players is None  # 拿不到就 None


def test_check_model_players_unit(tmp_path: Path) -> None:
    """`check_model_players` 的判定矩阵（含读不到人数的情况）。"""
    path = make_model(tmp_path, players=2, iterations=5)
    spec = f"mccfr:{path}"

    ok = cli.check_model_players([spec, "rule", "random"], 2)
    assert len(ok) == 1  # 只有 mccfr spec 会进检查
    assert ok[0]["model_players"] == 2 and ok[0]["players_match"] is True
    assert cli.format_player_mismatch(ok) == ""

    bad = cli.check_model_players([spec, "rule", "random"], 3)
    assert bad[0]["players_match"] is False
    text = cli.format_player_mismatch(bad)
    assert "警告" in text and MISMATCH_MARK in text and "请训练 3 人模型" in text

    unknown = cli.check_model_players([f"mccfr:{tmp_path / 'nope.pkl'}", "rule", "random"], 3)
    assert unknown[0]["model_players"] is None and unknown[0]["players_match"] is None
    assert cli.format_player_mismatch(unknown) == ""  # 不知道就不能乱警告


# --------------------------------------------------------------------------- CLI


def test_battle_warns_on_player_mismatch(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """2 人模型 + 3 人对局：不中断、报表含警告、命中恒为 0。"""
    path = make_model(tmp_path, players=2)
    code = cli.main(
        [
            "battle",
            "--players", "3",
            "--agents", f"mccfr:{path}", "rule", "random",
            "--games", "2",
            "--seed", "3",
            "--json",
        ]
    )
    out = capsys.readouterr().out
    assert code == 0, "人数不匹配必须只警告、不中断"
    assert "警告" in out and MISMATCH_MARK in out
    assert "请训练 3 人模型" in out and "--players 3" in out
    assert "0 (0.0%)" in out or "0.0%" in out  # 命中率恒为 0

    payload = extract_json(out)
    assert payload["game_players"] == 3
    assert payload["model_players"] == 2
    assert payload["players_match"] is False
    assert payload["player_checks"][0]["players_match"] is False
    assert payload["mccfr_stats"]
    for stats in payload["mccfr_stats"].values():
        assert stats["hit"] == 0, "人数不匹配时不可能命中已训练信息集"
        assert stats["fallback"] == stats["decisions"]


def test_battle_no_warning_when_players_match(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """人数匹配时不得出现人数警告（反向验证，防止误报）。"""
    path = make_model(tmp_path, players=2)
    code = cli.main(
        [
            "battle",
            "--players", "2",
            "--agents", f"mccfr:{path}", "rule",
            "--games", "2",
            "--seed", "3",
            "--json",
        ]
    )
    out = capsys.readouterr().out
    assert code == 0
    assert MISMATCH_MARK not in out
    assert "请训练 2 人模型" not in out

    payload = extract_json(out)
    assert payload["game_players"] == 2
    assert payload["model_players"] == 2
    assert payload["players_match"] is True


def extract_json_list(text: str) -> list:
    """从 CLI 输出里取出最后一个 JSON 数组（benchmark 的 `--json`）。"""
    decoder = json.JSONDecoder()
    for index in range(len(text) - 1, -1, -1):
        if text[index] != "[":
            continue
        try:
            payload, _end = decoder.raw_decode(text[index:])
        except ValueError:
            continue
        if isinstance(payload, list) and payload and isinstance(payload[0], dict) and "candidate" in payload[0]:
            return payload
    raise AssertionError(f"输出里找不到 JSON 数组：\n{text[-2000:]}")


def test_benchmark_reports_player_fields(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """benchmark 的 JSON 也要带人数一致性字段。"""
    path = make_model(tmp_path, players=2)
    code = cli.main(
        [
            "benchmark",
            "--agents", f"mccfr:{path}",
            "--opponent", "rule",
            "--players", "3",
            "--games", "2",
            "--seed", "5",
            "--json",
        ]
    )
    out = capsys.readouterr().out
    assert code == 0
    assert "警告" in out and MISMATCH_MARK in out

    payload = extract_json_list(out)
    assert payload[0]["model_players"] == 2
    assert payload[0]["game_players"] == 3
    assert payload[0]["players_match"] is False

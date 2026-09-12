"""`POST /games` 用 `GET /agents` 的模型 id 引用 MCCFR 模型。

背景：前端从 `GET /agents` 拿到的模型条目是 `{id, name, type, model, players, iterations}`，
天然会发 `id` 而不是路径。早期实现只认 `model` / `path`，直接 400；
现在通过 `ModelRegistry` 把 id 解析成路径，未知 id 给出「可用模型清单」的中文错误。

覆盖：
1. 用 `id` / `model_id` 引用 → 200，且 meta 里的 model 解析为真实路径；
2. 未知 id → 400 `INVALID_AGENT`，错误信息里必须列出可用 id（可自查）；
3. `id` 字段不能被请求 schema 丢掉（Pydantic `extra="ignore"` 曾导致静默失效）。
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import model_registry as mr
from game import GameConfig
from test_api_support import new_client, reset_backend
from training import MCCFRTrainer

BASE = "/api/v1"


@pytest.fixture()
def client():
    """与 test_api_contract.py 一致：每个用例重置后端状态（复用 support 里的工具）。"""
    reset_backend()
    with new_client() as c:
        yield c
    reset_backend()


@pytest.fixture(scope="module")
def tiny_model(tmp_path_factory) -> Path:
    """训练一个极小模型（5 迭代）用于测试，避免依赖仓库里的大模型。"""
    path = tmp_path_factory.mktemp("models") / "tiny_2p.pkl"
    trainer = MCCFRTrainer(GameConfig(num_players=2, seed=42), seed=1, metrics_path=None)
    trainer.train(iterations=5, workers=1, log_every=999, progress=False)
    trainer.save(str(path))
    return path


@pytest.fixture()
def fake_registry(monkeypatch, tiny_model: Path):
    """把 ModelRegistry 换成指向 tiny 模型的假注册表。"""
    entry = mr.ModelEntry(
        id="tiny_2p",
        name="Tiny 2P",
        path=str(tiny_model),
        players=2,
        iterations=5,
    )

    class _FakeRegistry:
        def list_models(self, *, force: bool = False):
            return [entry]

        def model_agent_infos(self):
            return [entry.to_agent_info()]

    fake = _FakeRegistry()
    # 两处都要打补丁：`agent_factory._resolve_model_id` 是延迟 import services 里的工厂函数，
    # 而 `/agents` 路由在模块顶层 `from ..services.model_registry import get_model_registry`，
    # 已绑定到自己的命名空间。
    monkeypatch.setattr(mr, "get_model_registry", lambda: fake)
    from app.api import agents as agents_api

    monkeypatch.setattr(agents_api, "get_model_registry", lambda: fake)
    return fake


def _create(client, agent):
    return client.post(
        f"{BASE}/games",
        json={"players": 2, "human_player": 0, "agents": [None, agent], "seed": 7},
    )


def test_mccfr_accepts_model_id(client, fake_registry, tiny_model):
    resp = _create(client, {"type": "mccfr", "id": "tiny_2p"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    metas = [p["agent"] for p in body["state"]["public"]["players"]]
    assert metas[1]["type"] == "mccfr"
    # id 被解析成真实路径（而不是把 "tiny_2p" 当路径）
    assert metas[1]["model"] == str(tiny_model)
    client.delete(f"{BASE}/games/{body['game_id']}")


def test_mccfr_accepts_model_id_alias(client, fake_registry, tiny_model):
    resp = _create(client, {"type": "mccfr", "model_id": "tiny_2p"})
    assert resp.status_code == 200, resp.text
    client.delete(f"{BASE}/games/{resp.json()['game_id']}")


def test_unknown_model_id_lists_available(client, fake_registry):
    resp = _create(client, {"type": "mccfr", "id": "不存在"})
    assert resp.status_code == 400, resp.text
    payload = resp.json()["error"]
    assert payload["code"] == "INVALID_AGENT"
    # 必须能自查：错误信息里带上可用模型 id 与刷新命令
    assert "tiny_2p" in payload["message"]
    assert "models --write-index" in payload["message"]


def test_model_entry_exposes_players_for_frontend_filter(client, fake_registry):
    """`/agents` 的模型条目要带 players/iterations，前端据此按人数过滤。"""
    agents = client.get(f"{BASE}/agents").json()["agents"]
    entry = next(e for e in agents if e["id"] == "tiny_2p")
    assert entry["players"] == 2
    assert entry["iterations"] == 5


def test_players_mismatch_is_exposed_not_rejected(client, fake_registry, tiny_model):
    """模型人数 ≠ 对局人数时：不拒绝请求，但必须在 agent meta 里显式暴露。

    信息集 key 含 hand_sizes 长度与 alive_mask 位宽，跨人数键空间不重叠：
    2 人模型进 3 人局命中率恒为 0、100% 回落 RuleAgent，且不会抛异常 —— 静默退化最危险。
    """
    # 匹配：2 人局 + 2 人模型
    ok = _create(client, {"type": "mccfr", "id": "tiny_2p"})
    assert ok.status_code == 200, ok.text
    meta = ok.json()["state"]["public"]["players"][1]["agent"]
    assert meta["model_players"] == 2
    assert meta["game_players"] == 2
    assert meta["players_mismatch"] is False
    client.delete(f"{BASE}/games/{ok.json()['game_id']}")

    # 不匹配：3 人局 + 2 人模型 → 仍 200，但 players_mismatch=True
    bad = client.post(
        f"{BASE}/games",
        json={
            "players": 3,
            "human_player": 0,
            "agents": [None, {"type": "mccfr", "id": "tiny_2p"}, {"type": "rule"}],
            "seed": 7,
        },
    )
    assert bad.status_code == 200, bad.text
    meta3 = bad.json()["state"]["public"]["players"][1]["agent"]
    assert meta3["players_mismatch"] is True
    assert meta3["model_players"] == 2
    assert meta3["game_players"] == 3
    client.delete(f"{BASE}/games/{bad.json()['game_id']}")

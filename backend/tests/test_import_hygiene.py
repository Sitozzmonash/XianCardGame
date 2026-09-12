"""导入卫生回归测试：参考实现目录进 `sys.path` 后不得**遮蔽**本仓模块。

背景（实测踩过）：`tests/_game_test_utils.ensure_reference_importable()` 原来用
`sys.path.insert(0, reference/xiuxian_ai_demo)`，而参考实现目录里**也有一个 `main.py`**
（`../reference/xiuxian_ai_demo/main.py`，且没有 `def main`）。于是「先收集
`test_game_reference_parity`、再收集 CLI 测试」时，`import main as cli` 会解析到参考实现
那一份，30 条 CLI 测试集体报 `AttributeError: module 'main' has no attribute 'main'`
（`backend/main.py` 本身没问题，是测试间的导入环境污染）。

这两个断言保证它不会再静默回来：**任意顺序**下 `import main` 都必须是本仓的
`backend/main.py`，且参考实现目录只能排在搜索路径的**后面**。
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REF_ROOT = BACKEND_DIR.parent / "reference" / "xiuxian_ai_demo"


def test_reference_path_is_appended_not_prepended() -> None:
    """参考实现目录可以进 `sys.path`，但必须排在本仓之后（否则 `main.py` 撞名）。"""
    from _game_test_utils import ensure_reference_importable

    ensure_reference_importable()  # 这一步会把参考实现目录加进 sys.path

    entries = [Path(entry or ".").resolve() for entry in sys.path]
    assert REF_ROOT in entries, "参考实现目录应可被找到"
    assert BACKEND_DIR in entries, "本仓 backend/ 应在搜索路径里（pytest.ini: pythonpath = .）"
    assert entries.index(REF_ROOT) > entries.index(BACKEND_DIR), (
        "参考实现目录必须 append 到后面：它的 main.py 会遮蔽本仓 backend/main.py"
    )


def test_import_main_resolves_to_backend_after_reference_injection() -> None:
    """即使已经注入参考实现目录，`import main` 仍必须解析到本仓 `backend/main.py`。"""
    from _game_test_utils import ensure_reference_importable

    ref = ensure_reference_importable()
    assert ref, "参考实现应可正常导入（append 不得破坏它的可导入性）"

    # 强制重新解析，验证的是「搜索顺序」而不是缓存
    sys.modules.pop("main", None)
    importlib.invalidate_caches()
    module = importlib.import_module("main")

    assert Path(module.__file__).resolve() == BACKEND_DIR / "main.py", (
        f"import main 解析到了 {module.__file__}，不是本仓 backend/main.py"
    )
    assert callable(getattr(module, "main", None)), "backend/main.py 必须提供 main(argv)"

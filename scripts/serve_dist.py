#!/usr/bin/env python3
"""静态服务：给 `expo export` 的产物做 clean-URL 映射。

为什么需要它：`expo export` 产出 `battle.html`，而 app 内部路由是 `/battle`。
`python -m http.server` 会把 `/battle` 判成不存在（或把 `/battle.html` 当成未匹配路由而渲染 404），
于是无头浏览器里点任何链接都掉进 404，无法验证。

映射规则：
- `/`            → index.html
- `/battle`      → battle.html
- `/battle.html` → battle.html（避免 expo-router 把带扩展名的当成未知路由）
- 其它路径若有同名 .html 就映射，否则 → `+not-found.html`（保住 404 页的真实性）

用法：
    python scripts/serve_dist.py frontend/dist-verify --port 8090
"""
from __future__ import annotations

import argparse
import http.server
import os
import posixpath
import socketserver
import sys
from functools import partial

NOT_FOUND = "+not-found.html"


class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        # ⚠️ 要显式区分「命中真实路由」与「回落到 404 页」：SimpleHTTPRequestHandler 会因为
        #    `+not-found.html` 文件存在而回 200，那样本地预览就会比线上（Netlify 回 404）
        #    宽松，未知路径的真实表现验不出来。用 `_force_404` 把状态码改回 404。
        self._force_404 = False
        path = path.split("?", 1)[0].split("#", 1)[0]
        path = posixpath.normpath(path)
        parts = [p for p in path.split("/") if p and p not in (os.curdir, os.pardir)]
        local = os.path.join(self.directory, *parts)

        if not parts or os.path.isdir(local):
            candidate = os.path.join(local, "index.html")
            if os.path.isfile(candidate):
                return candidate
            return os.path.join(self.directory, "index.html")

        if os.path.isfile(local):
            return local

        # `/card/TRIBULATION` → card/TRIBULATION.html（嵌套路由，优先整段匹配）
        nested = os.path.join(self.directory, *parts) + ".html"
        if os.path.isfile(nested):
            return nested

        # `/battle` 或 `/battle/anything` → battle.html
        stem = parts[0]
        candidate = os.path.join(self.directory, f"{stem}.html")
        if os.path.isfile(candidate):
            return candidate

        if parts != [NOT_FOUND.removesuffix(".html")]:
            self._force_404 = True
        return os.path.join(self.directory, NOT_FOUND)

    def send_response(self, code: int, message: str | None = None) -> None:
        if getattr(self, "_force_404", False):
            self._force_404 = False
            code = 404
        super().send_response(code, message)

    def end_headers(self) -> None:
        # 静态资源禁用缓存，避免改完产物浏览器仍用旧的
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # 安静点
        if "404" in (fmt % args):
            sys.stderr.write("  404: %s\n" % (fmt % args))


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    ap = argparse.ArgumentParser(description="静态产物 clean-URL 服务")
    ap.add_argument("directory", help="expo export 产物目录，如 frontend/dist-verify")
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    directory = os.path.abspath(args.directory)
    if not os.path.isdir(directory):
        print(f"目录不存在：{directory}", file=sys.stderr)
        return 2
    if not os.path.isfile(os.path.join(directory, "index.html")):
        print(f"目录里没有 index.html，像是未完成构建：{directory}", file=sys.stderr)
        return 2

    handler = partial(CleanUrlHandler, directory=directory)
    with ReusableTCPServer((args.host, args.port), handler) as httpd:
        print(f"serving {directory} → http://{args.host}:{args.port}/  (Ctrl+C 停止)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

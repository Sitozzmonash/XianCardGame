#!/usr/bin/env python3
"""把「参考原型截图」与「本仓实现截图」拼成并排对比图，并给出量化像素差。

用法：
    python scripts/compare_screens.py                      # 比对 docs/ref-screens 与 docs/screenshots 的同名图
    python scripts/compare_screens.py --pair 01_home ref.png mine.png
    python scripts/compare_screens.py --out docs/screenshots/_cmp

输出的对比图左为参考、右为实现，顶部标注文件名与整页 mean|ΔRGB|。
注意：参考图里可能有 Next.js 开发指示器（右下角 “N Issue” 小角标），那不是设计的一部分，
比对时该区域的差异属于已知噪声；脚本会额外报告「去掉右下角 160×60 区域后」的差值。
"""
from __future__ import annotations

import argparse
import pathlib
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    print("需要 Pillow：pip install pillow", file=sys.stderr)
    raise SystemExit(2)

REF_DIR = pathlib.Path("docs/ref-screens")
MINE_DIR = pathlib.Path("docs/screenshots")
DEV_BADGE = (160, 60)  # 右下角 Next.js 开发指示器区域


def _font(size: int):
    for name in ("msyh.ttc", "simhei.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def diff_stats(ref: Image.Image, mine: Image.Image) -> tuple[float, float]:
    """返回 (整页 mean|ΔRGB|, 去掉右下角开发指示器后的 mean|ΔRGB|)。"""
    import numpy as np

    if ref.size != mine.size:
        mine = mine.resize(ref.size, Image.LANCZOS)
    a = np.asarray(ref.convert("RGB"), dtype=np.int16)
    b = np.asarray(mine.convert("RGB"), dtype=np.int16)
    d = np.abs(a - b).mean()
    h, w = a.shape[:2]
    bh, bw = min(DEV_BADGE[1], h), min(DEV_BADGE[0], w)
    cropped = np.abs(a[: h - bh, : w - bw] - b[: h - bh, : w - bw]).mean()
    return float(d), float(cropped)


def side_by_side(ref_path: pathlib.Path, mine_path: pathlib.Path, out_path: pathlib.Path) -> tuple[float, float]:
    ref = Image.open(ref_path).convert("RGB")
    mine = Image.open(mine_path).convert("RGB")
    d_all, d_crop = diff_stats(ref, mine)

    if mine.size != ref.size:
        mine = mine.resize(ref.size, Image.LANCZOS)

    pad, header = 16, 54
    canvas = Image.new(
        "RGB",
        (ref.width * 2 + pad * 3, ref.height + header + pad * 2),
        (12, 14, 14),
    )
    canvas.paste(ref, (pad, header + pad))
    canvas.paste(mine, (pad * 2 + ref.width, header + pad))

    draw = ImageDraw.Draw(canvas)
    f_big, f_small = _font(20), _font(15)
    draw.text((pad, 12), f"参考原型 · {ref_path.name}", fill=(232, 213, 168), font=f_big)
    draw.text(
        (pad * 2 + ref.width, 12),
        f"本仓实现 · {mine_path.name}",
        fill=(92, 191, 162),
        font=f_big,
    )
    draw.text(
        (pad, 36),
        f"整页 mean|ΔRGB| = {d_all:.1f}/255    去掉开发指示器 = {d_crop:.1f}/255",
        fill=(169, 184, 174),
        font=f_small,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, optimize=True)
    return d_all, d_crop


def main() -> int:
    ap = argparse.ArgumentParser(description="参考原型 vs 本仓实现 的并排比对")
    ap.add_argument("--pair", nargs=3, metavar=("NAME", "REF", "MINE"), help="只比一对（给绝对/相对路径）")
    ap.add_argument("--out", default="docs/screenshots/_cmp", help="对比图输出目录（默认 docs/screenshots/_cmp）")
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out)
    rows: list[tuple[str, float, float]] = []

    if args.pair:
        name, ref_p, mine_p = args.pair
        d_all, d_crop = side_by_side(pathlib.Path(ref_p), pathlib.Path(mine_p), out_dir / f"cmp_{name}.png")
        rows.append((name, d_all, d_crop))
        print(f"{name:<24} 整页 {d_all:5.1f}  去角标 {d_crop:5.1f}")
    else:
        pairs = []
        for ref_path in sorted(REF_DIR.glob("*.png")):
            mine_path = MINE_DIR / f"{ref_path.stem}.png"
            if mine_path.exists():
                pairs.append((ref_path.stem, ref_path, mine_path))
        if not pairs:
            print(f"没找到可比的图：参考 {REF_DIR} / 实现 {MINE_DIR}（同名文件才会比）", file=sys.stderr)
            return 2
        for name, ref_path, mine_path in pairs:
            d_all, d_crop = side_by_side(ref_path, mine_path, out_dir / f"cmp_{name}.png")
            rows.append((name, d_all, d_crop))
            print(f"{name:<24} 整页 {d_all:5.1f}  去角标 {d_crop:5.1f}")

    if rows:
        print("\n按差异从大到小：")
        for name, d_all, _ in sorted(rows, key=lambda r: -r[1]):
            print(f"  {d_all:5.1f}  {name}")
    print(f"\n对比图已写入 {out_dir}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

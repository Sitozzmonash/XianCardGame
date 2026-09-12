# 模型目录

本目录存放 MCCFR 训练产物（`*.pkl`）。**模型文件不进 git**（单个 10K 迭代模型可能上百 MB），
请在本机训练生成，或从发布页下载。

## 命名约定

```text
mccfr_2p_10k.pkl      # 2 人，10,000 次 outer iteration
mccfr_3p_100k.pkl     # 3 人，100,000 次
mccfr_3p_100k_ckpt_50000.pkl   # 训练中途 checkpoint
champion.pkl          # 当前 Champion（后续 Champion 系统使用）
```

## index.json

`index.json` 由脚本或手写维护，用于 `GET /agents` 列出可选模型。示例：

```json
{
  "models": [
    {
      "id": "mccfr_2p_10k",
      "name": "MCCFR 2P 10K",
      "path": "models/mccfr_2p_10k.pkl",
      "players": 2,
      "iterations": 10000,
      "created_at": "2026-09-12",
      "note": "小规模验证模型"
    }
  ]
}
```

## 训练命令

见仓库根 README「训练 MCCFR」一节。训练完成后把产物放回本目录，并更新 `index.json`。

# 模型目录

本目录存放 MCCFR 训练产物（`*.pkl`）。大多数模型文件不进 git（单个 10K 迭代模型可能上百 MB），
但仓库会随 Docker / Vercel 部署带上受控的轻量 Web 推理模型（当前覆盖 2–6 人）。其余模型请在本机训练生成，或从发布页下载。

## 命名约定

```text
mccfr_2p_10k.pkl      # 2 人，10,000 次 outer iteration
mccfr_3p_100k.pkl     # 3 人，100,000 次
mccfr_3p_100k_ckpt_50000.pkl   # 训练中途 checkpoint
champion.pkl          # 当前 Champion（后续 Champion 系统使用）
```

**模型是按人数训练的**：`infoset_key` 里的 `hand_sizes` 长度与 `alive_mask` 位宽都随人数变化，
所以 2 人模型放进 3 人局会**命中率恒为 0、全部回落 RuleAgent**（`main.py battle` 现在会打印
醒目中文警告，`models/index.json` 的 `players` 字段供前端过滤）。要换人数就重新训练。

## index.json

⚠️ `index.json` 记录的是**本地产物清单**：`*.pkl` 不入 git，所以刚克隆仓库时清单里的条目
在本机并不存在 —— 前端会列出它们，选中后建局报 `MODEL_LOAD_ERROR`。
请先训练自己的模型，再刷新清单。

`models/index.json` 用于 `GET /agents` 列出可选模型（前端按 `players` 过滤）。
**训练完请刷新清单**（不用手写）：

```bash
cd backend
python main.py models                 # 只读列出：元信息 / 体积 / 每信息集字节 / 能否加载
python main.py models --write-index   # 顺带把元信息写进 models/index.json
python main.py models --write-index --json   # 再把生成的条目打到 stdout（便于脚本化）
```

生成规则：扫描 `models/*.pkl`，只读**文件头**拿元信息（不完整加载大模型），
按 `id` 排序写入，重复运行结果一致。示例：

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
      "note": "2 人 / 10,000 迭代 / v2 紧凑二进制 / 全量（regret + strategy，可续训）"
    }
  ]
}
```

字段：`id / name / path / players / iterations / created_at / note`；
拿不到的字段会被**省略**（不写 `null`），前端应按「人数未知」处理而不是报错。

## 训练命令

```bash
cd backend
# 全量 v2（默认格式，可续训；10K 迭代 2 人约 23 MB）
python main.py train --players 2 --iterations 10000 --out models/mccfr_2p_10k.pkl
# 部署产物：只写平均策略（约 16 MB，不能续训，MCCFRAgent 懒加载推理）
python main.py train --players 2 --iterations 10000 --out models/mccfr_2p_10k_deploy.pkl --strategy-only
# 旧格式（给需要 plain dict 的工具）
python main.py train --players 2 --iterations 10000 --out models/mccfr_2p_10k_v1.pkl --format v1
```

训练命令与算法细节见仓库根 README「训练 MCCFR」一节。

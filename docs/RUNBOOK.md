# 运行手册（RUNBOOK）

面向使用者的中文操作手册。所有命令在 **Windows git-bash** 下验证过；路径一律用 `D:/...` 正斜杠风格。
脚本与接口的权威定义见 `docs/INTERFACES.md`，算法语义见 `docs/xiuxian_card_ai_project_spec.md`。

---

## 0. 一次性准备

```bash
# 后端（Python 3.11+，纯 CPU，无深度学习依赖）
cd D:/Documents/Hermes/xiuxian-card/backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt

# 前端（Node 20+）
cd D:/Documents/Hermes/xiuxian-card/frontend
npm install
cp .env.example .env      # 改 EXPO_PUBLIC_API_BASE_URL 指向后端
```

下文用 `PY` 代指 `D:/Documents/Hermes/xiuxian-card/backend/.venv/Scripts/python.exe`，所有后端命令都先
`cd D:/Documents/Hermes/xiuxian-card/backend`。

---

## 1. 五分钟跑通

```bash
# ① 终端里看一局完整对局（中文日志）
"$PY" main.py demo --players 3 --simulations 200 --seed 42

# ② 自己玩一局（交互式）
"$PY" main.py play --players 3 --ai ismcts:200

# ③ 起服务 + 前端
"$PY" main.py serve --port 8000          # http://localhost:8000/docs
cd ../frontend && npm start              # 按 w 开 Web，或用 Expo Go 扫码
```

前端默认连真后端；后端不可用时首页会提示，并提供「使用演示数据」按钮（运行期切到 mock，无需重新构建）。
想强制 mock：`EXPO_PUBLIC_USE_MOCK=1`。

---

## 2. 训练 MCCFR

### 2.1 先跑单进程（严格算法基线）

```bash
"$PY" main.py train --players 2 --iterations 10000 --workers 1 --out models/mccfr_2p_10k.pkl
```

实测（本机 12 核，2 人）：**10,000 迭代 ≈ 2 分 23 秒**（持续约 70 iter/s；前期 300+ iter/s，随信息集变多而下降）。
产出：433,819 个信息集 / 1,177,036 条策略条目。

### 2.2 多进程加速（工程用，不是严格基线）

```bash
"$PY" main.py train --players 3 --iterations 100000 --workers 8 --sync-batch 1000 \
  --out models/mccfr_3p_100k.pkl
```

`workers>1` 是**批量同步的近似并行**（各 worker 拿同一份 regret 快照训练一小批再合并）。
做论文级对照实验请用 `--workers 1`。

### 2.3 Checkpoint 与续训

```bash
# 每 10,000 迭代存一个 checkpoint
"$PY" main.py train --players 2 --iterations 100000 --workers 1 \
  --checkpoint-every 10000 --out models/mccfr_2p_100k.pkl

# 续训（不从头开始，iterations_done 会累加）
"$PY" main.py train --resume models/mccfr_2p_10k.pkl --iterations 90000 \
  --out models/mccfr_2p_100k.pkl
```

### 2.4 YAML 配置

```bash
"$PY" main.py train --config configs/train_2p.yaml
```

```yaml
game:     {players: 2, initial_hand: 5, max_actions_per_turn: 2, seed: 42}
training: {algorithm: mccfr, iterations: 100000, workers: 8, sync_batch: 1000,
           checkpoint_every: 10000, exploration: 0.6, log_every: 1000}
output:   {model_dir: models/mccfr_2p, name: mccfr_2p_100k}
```

CLI 参数优先于 YAML。训练日志：中文进度打到终端，机器可读追加到 `backend/logs/train_metrics.jsonl`。

---

## 3. 模型体积与内存（重要，先看再开长训练）

实测（2 人、`workers=1`）：

| 项目 | 数值 |
|---|---|
| 10,000 迭代耗时 | 约 2 分 23 秒（约 70 iter/s；前期 300+，随信息集变多而下降） |
| 10,000 迭代后信息集 | 433,819 |
| 条目数（regret / strategy 各一份） | 各 1,177,036 条 |
| **信息集增长规律** | ≈ **42 个/迭代**（近似线性）→ 50K ≈ 210 万、100K ≈ 420 万、1M ≈ 4200 万 |

**同一张表、不同表示的体积对照**（这就是"模型为什么这么大"的答案）：

| 表示 | 体积 | 每信息集 | 说明 |
|---|---|---|---|
| 旧 `repr(str)` 字符串 key | 124.0 MB | 286 B | 参考实现产出的原生模型（118.2 MiB） |
| 紧凑 tuple key | 102.5 MB | 236 B | 只换 key 编码 |
| 紧凑 tuple + 动作 key 字符串池化 | **61.2 MB** | 121 B | 当前最好（是旧版的 2.0x 压缩） |

**瓶颈在行数据**：中文动作 key 字符串 + Python `float` 对象 + dict 槽位占了 60% 以上。
只要还用 `dict[tuple, dict[str, float]]`，地板约 40~50 MB。要再往下压必须换存储表示
（动作 int 化 + 数组打包，见 `docs/INTERFACES.md` §3.5 的 v2 二进制格式）。

**规模预警（务必先看）**：

- 体积与内存大致随信息集线性增长：**100K 迭代约 420 万信息集，现表示约 600 MB**（内存同理）。
- 因此不要一上来就开 1,000,000 迭代。按 10K → 50K → 100K 递进，每档都用 `battle` 验证真的变强。
- 要真正往大规模训练走，应优先做**状态抽象 / 相似信息集合并**，而不是继续堆迭代数（见 §7）。

旧模型兼容：参考实现那份 118.2 MB 的旧模型可**直接载入 + 迁移**（603,504 个 key，0 失败，
耗时 66~72 秒），迁移是双射映射，所以旧模型能**真正参与推理**而不只是回落。

---

## 4. 评测 AI

```bash
# 2 人：MCCFR vs ISMCTS（Learning vs Search）
"$PY" main.py battle --players 2 --agents mccfr:models/mccfr_2p_10k.pkl ismcts:500 --games 1000

# 3 人混战
"$PY" main.py battle --players 3 --agents rule random ismcts:300 --games 1000

# 候选逐个对同一对手
"$PY" main.py benchmark --agents rule ismcts:100 ismcts:500 --opponent random --games 500
```

输出：总局数、平局、平均决策步数、各 Agent 胜率 + **Wilson 95% 置信区间**、各座位胜率表
（每局随机换座位，降低先手偏差）。

### 4.1 看胜率时必须同时看命中率

查表式 MCCFR 在 10K 规模下，实战中只有 **15~19%** 的决策命中已训练信息集，其余回落 `RuleAgent`。
所以 `battle` 会额外打印：

```text
=== MCCFR 命中率（训练覆盖度）===
0:mccfr:models/mccfr_2p_10k.pkl  决策 88 | 命中训练信息集 17 (19.3%) | 回落 Rule 71 (80.7%)
⚠ 命中率过低（<50%）：胜率主要由 RuleAgent 决定，不能据此判断 MCCFR 强度
```

**命中率低时，「MCCFR 胜率 55%」这类数字其实主要是 RuleAgent 打出来的**，不能作为训练有效的证据。

### 4.2 样本量

游戏随机性强：5 / 20 / 50 局**不足以**下结论。正式比较用 **1000 局以上，推荐 5000+**（spec §64）。

---

## 5. 测试

```bash
cd D:/Documents/Hermes/xiuxian-card/backend
"$PY" -m pytest tests -v          # 全量：343 项，实测约 3 分 36 秒
"$PY" -m pytest tests -q --ignore=tests/test_training_legacy.py   # 跳过最慢的旧模型兼容测试，约 5 秒
```

前端：

```bash
cd ../frontend
npx tsc --noEmit
npx expo export --platform web --output-dir dist
```

端到端（真起服务打完整局）：

```bash
"$PY" main.py serve --port 8020 &
"$PY" scripts/e2e_api.py --base http://127.0.0.1:8020/api/v1 --players 3 --games 3
```

---

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 测试里 `test_training_legacy` 很慢（约 6 分钟） | 它加载参考实现的 118MB 旧模型验证兼容性；用 `--ignore` 跳过，或给该文件加 `-k` 过滤 |
| 训练好几分钟没输出 | 默认每 `--log-every`（1000）次迭代打印一次；调小它 |
| Windows 上并行训练报 pickle 错 | worker 函数必须在模块顶层；本仓库已满足。别把 trainer 写成嵌套函数 |
| 前端显示「未连接后端」 | 后端没起或地址不对；检查 `frontend/.env` 的 `EXPO_PUBLIC_API_BASE_URL`，或点首页「使用演示数据」 |
| 前端改动后颜色/文案没变 | Expo 只在**构建期**替换 `EXPO_PUBLIC_*`，改 `.env` 后需重启 dev server / 重新 export |
| 端口占用 | `main.py serve --port 8001`，前端同步改 `.env` |
| 想清掉训练残留 | `backend/models/*.pkl` 不进 git，可安全删除；`backend/logs/*.jsonl` 同理 |

---

## 7. 实验路线（对应 spec §62）

```text
阶段 A  环境验证    main.py demo（Random vs Random 也要能正常终局）
阶段 B  Rule 基线   main.py battle --players 2 --agents rule random --games 1000
阶段 C  ISMCTS 调参 main.py benchmark --agents ismcts:100 ismcts:500 ismcts:1000 --opponent rule
阶段 D  MCCFR 自博弈 train 1K/10K/50K/100K + 每档 checkpoint
阶段 E  训练是否变强 battle 新旧 checkpoint 互打（别只比最新一版，防策略循环）
阶段 F  Learning vs Search:  battle --agents mccfr:<模型> ismcts:500 --games 5000
阶段 G  多人扩展     --players 3 / 4 / 6，观察信息集与内存增长
阶段 H  Champion / Historical Pool / Hybrid（尚未实现，属后续开发）
```

**在阶段 D→E 之前，建议先解决命中率问题**（状态抽象 / 相似信息集 / Hybrid 先验+搜索），
否则加大迭代数只能扩大表体积，实战命中率仍然很低。

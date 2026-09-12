# 修仙卡牌 · 天劫试炼（XianCardGame）

3–6 人修仙主题**隐藏信息卡牌游戏** + **AI 博弈实验平台**。

玩家围绕「天劫」进行手牌、信息与牌堆控制博弈：抽到【天劫】且手中没有【护劫符】即淘汰，
最后存活者获胜。项目同时是一个可重复、可训练、可搜索、可评测的多人不完全信息博弈实验环境
（Random / Rule / ISMCTS / MCCFR）。

- 规格与算法依据：[`docs/xiuxian_card_ai_project_spec.md`](docs/xiuxian_card_ai_project_spec.md)
- **运行手册（命令 / 训练耗时 / 体积与内存 / 常见问题）**：[`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- 接口契约（前后端唯一权威）：[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)、[`docs/INTERFACES.md`](docs/INTERFACES.md)
- 工程架构：[`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md)
- 开发顺序：[`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md)

```text
frontend/  Expo + React Native + TypeScript（渲染 + 输入）
backend/   FastAPI（唯一规则权威）+ 游戏引擎 + AI + 训练/评测 CLI
reference/ 原始 Python Demo（只读，作为算法参考实现）
docs/      交接文档与冻结契约
images/    视觉参考图
```

---

## 1. 环境要求

| 组件 | 版本 |
|---|---|
| Python | 3.11+（后端与 AI，**纯 CPU，无深度学习依赖**） |
| Node.js | 20+（前端 Expo） |
| 平台 | Windows / macOS / Linux 均可；本仓库在 Windows + git-bash 下开发验证 |

后端只依赖标准库 + FastAPI 系列，MCCFR 训练不需要 GPU、不需要 PyTorch。

### 1.1 安装后端

```bash
cd backend
python -m venv .venv
# Windows (git-bash)
.venv/Scripts/python.exe -m pip install -r requirements.txt
# macOS / Linux
# .venv/bin/python -m pip install -r requirements.txt
```

### 1.2 安装前端

```bash
cd frontend
npm install
cp .env.example .env      # 修改 EXPO_PUBLIC_API_BASE_URL 指向后端
```

---

## 2. 跑一局（终端演示）

```bash
cd backend
python main.py demo --players 3 --simulations 200
```

默认座位：P0 规则 AI、P1 ISMCTS、P2 随机 AI，终端输出中文动作与事件日志。

终端人机对战：

```bash
python main.py play --players 3
```

---

## 3. 启动服务（后端 + 前端）

```bash
# 终端 1：后端
cd backend
python main.py serve --host 0.0.0.0 --port 8000 --reload
# 等价于：uvicorn app.main:app --reload --port 8000
# 接口文档：http://localhost:8000/docs   健康检查：http://localhost:8000/api/v1/health

# 终端 2：前端
cd frontend
npm start            # Expo Dev Server；按 w 打开 Web，或用 Expo Go 扫码
```

前端在没有后端时可用 mock 数据渲染全部页面（`EXPO_PUBLIC_USE_MOCK=1`）。

---

## 4. 训练 MCCFR

单进程（**严格算法基线，先跑这个验证算法**）：

```bash
cd backend
python main.py train --players 2 --iterations 10000 --workers 1 --out models/mccfr_2p_10k.pkl
```

多进程（工程加速，批量同步近似并行 MCCFR）：

```bash
python main.py train --players 3 --iterations 100000 --workers 8 --sync-batch 1000 \
  --out models/mccfr_3p_100k.pkl
```

用 YAML 配置：

```bash
python main.py train --config configs/train_2p.yaml
```

```yaml
# configs/train_2p.yaml
game:     {players: 2, initial_hand: 5, max_actions_per_turn: 2, seed: 42}
training: {algorithm: mccfr, iterations: 100000, workers: 8, sync_batch: 1000,
           checkpoint_every: 10000, exploration: 0.6, log_every: 1000}
output:   {model_dir: models/mccfr_2p, name: mccfr_2p_100k}
```

### 4.1 Checkpoint

```bash
python main.py train --players 2 --iterations 100000 --workers 1 \
  --checkpoint-every 10000 --out models/mccfr_2p_100k.pkl
```

产出 `models/mccfr_2p_100k_ckpt_10000.pkl`、`..._20000.pkl` …，用于比较
「10K vs 50K vs 100K」是否真的变强。

### 4.2 续训

```bash
python main.py train --resume models/mccfr_2p_10k.pkl \
  --iterations 90000 --out models/mccfr_2p_100k.pkl
```

不会从头开始：`iterations_done` 会累加。

### 4.3 训练日志

- 终端：中文进度（迭代数、信息集数量、iter/s、elapsed、checkpoint 路径）
- 机器可读：`backend/logs/train_metrics.jsonl`（一行一个 JSON，便于画学习曲线）

---

## 5. 让 AI 互相比赛

```bash
# 3 人：随机 vs 规则 vs ISMCTS(300)
python main.py battle --players 3 --agents random rule ismcts:300 --games 100

# 2 人：MCCFR-10K vs ISMCTS-500（Learning vs Search）
python main.py battle --players 2 --agents mccfr:models/mccfr_2p_10k.pkl ismcts:500 --games 1000

# 4 人混战
python main.py battle --players 4 --agents rule random ismcts:300 mccfr:models/mccfr_4p.pkl \
  --games 500
```

输出包含：总局数、平局、平均决策步数、各 Agent 胜率 + 95% 置信区间、各座位胜率（每局随机换座位，
降低先手偏差）。

> 统计原则：5 / 20 / 50 局**不足以**下结论，正式比较建议 1000 局以上，推荐 5000+。

---

## 6. 基准测试

```bash
python main.py benchmark --agents rule ismcts:100 ismcts:500 --opponent random --games 500
```

---

## 7. 测试

```bash
cd backend
python -m pytest tests -v
```

覆盖：规则单元、合法动作、天劫淘汰、护劫符、观星、改命、洗牌知识失效、遁术、摄物术、反制、
多人轮转、最后一人胜利、seed 可复现、clone 独立性、**Observation 不泄漏隐藏信息**、
InformationSet 一致性、AI 不得作弊、API schema、完整一局。

前端：

```bash
cd frontend
npx tsc --noEmit
```

---

## 8. 模型目录

```text
backend/models/
├── README.md          # 命名约定与 index.json 说明
├── index.json         # GET /agents 展示用的模型清单
└── *.pkl              # 训练产物（不进 git）
```

服务启动时 `ModelRegistry` 惰性加载 + 内存缓存，**不会每个请求重新读盘**。

---

## 9. 部署

- 后端：Render Web Service（`backend/render.yaml` 已含启动命令、健康检查与全部环境变量）
- 前端：Expo（Expo Go 真机 / EAS Build / Web 导出）

Render 上**不做训练**：训练在本地完成 → benchmark → 把确认的 `.pkl` 放进 `backend/models/` → 部署。

---

## 10. 算法限制（务必如实理解）

- **ISMCTS**：当前是 *Single-Observer 教学版*，存在 strategy fusion / opponent private knowledge
  近似问题，不是 MO-ISMCTS。
- **MCCFR**：Outcome-Sampling，2 人零和有经典收敛保证；**3 人以上只是实验型学习算法**，
  不具备同样的 Nash 收敛保证。
- **MCCFR 命中率必须与胜率一起报告**：查表式 MCCFR 在第 10K 迭代规模下，实际对局中只有
  **15~18%** 的决策命中已训练信息集，其余会回落 `RuleAgent`。因此「MCCFR 胜率 55%」这类数字
  可能主要是 RuleAgent 打出来的 —— **不报命中率的胜率不能用来判断 MCCFR 强度**。
  `battle` / `benchmark` 会自动输出命中率报表并在命中率 < 50% 时给出警告。
  （泛化失败是本游戏信息集爆炸的直接后果，见 spec §33 / §61 问题 3。）
- **多进程训练**是批量同步的近似并行，严格对照实验请用 `--workers 1`。
- AI **不允许读取隐藏信息**（`state.deck` / 他人手牌），ISMCTS 只能通过合法 determinization
  构造可能世界；仓库有自动测试保证。

---

## 11. 后续路线

```text
短期：Benchmark + Champion + Historical Pool + Hybrid Agent
中期：Population / League / PSRO-JPSRO / Opponent Modeling
长期：Self-Evolving Agent：AI 能持续超越旧版本的自己
```

---

## 12. 许可

私有项目，未开源授权。

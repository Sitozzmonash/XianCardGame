# 修仙卡牌 AI Demo：ISMCTS + MCCFR

这是一个**纯 Python、CPU-only、无深度学习依赖**的实验环境。目标不是直接做商业游戏，而是先验证：

1. 3~6 人隐藏信息修仙卡牌环境是否适合 AI 研究；
2. ISMCTS（现场搜索）是否能形成有效策略；
3. MCCFR（Self-Play 学习）是否能通过训练逐步形成策略；
4. 后续是否值得继续做 League / JPSRO / Agent 自我进化。

---

## 1. V0.1 核心玩法

每局 2~6 名修仙者，**最后存活者获胜**。

没有等级、成长、HP、攻击力。核心只有：

- 隐藏手牌；
- 隐藏牌堆；
- 天劫风险；
- 看牌 / 改牌序 / 洗牌；
- 跳过抽牌；
- 偷牌与反制；
- 信息不完全下的策略博弈。

### 回合流程

```text
你的回合
  ↓
最多使用 2 张主动牌
  ↓
选择结束行动
  ↓
必须抽 1 张
  ↓
普通牌 → 加入手牌
天劫   → 有护劫符则化解并秘密回插；没有则淘汰
  ↓
下一名玩家
```

每人开局固定有 1 张【护劫符】，初始手牌不包含天劫。牌堆中加入 `玩家数 - 1` 张天劫。

### 卡牌

| 卡牌 | 作用 |
|---|---|
| 天劫 | 抽到后若无护劫符则淘汰 |
| 护劫符 | 自动化解一次天劫，随后选择回插区域 |
| 观星术 | 查看顶部最多 3 张牌 |
| 逆天改命 | 查看并调整顶部最多 3 张牌顺序 |
| 扰乱天机 | 洗牌，所有人此前的牌顶知识失效 |
| 遁术 | 本回合立即结束且不抽牌 |
| 摄物术 | 随机偷目标 1 张手牌 |
| 反制符 | 目标被摄物术时可取消该效果 |

天劫回插只提供 4 个抽象位置：`TOP / NEAR_TOP / MIDDLE / BOTTOM`，避免动作空间无限膨胀。

---

## 2. AI

### RandomAgent

纯随机 Baseline。

### RuleAgent

简单人工规则 Baseline，例如：

- 已知下一张是天劫 → 优先遁术 / 洗牌 / 改命；
- 不知道下一张且有观星术 → 优先看牌；
- 被偷牌 → 有反制符就反制。

### ISMCTSAgent

Single-Observer ISMCTS 教学版：

```text
当前观察
  ↓
采样一个可能的隐藏世界
  ↓
UCT 搜索
  ↓
Rollout
  ↓
回传多人收益
  ↓
重复 N 次
  ↓
选择根节点访问最多的动作
```

特点：

- **不需要训练**；
- 每一步现场算；
- CPU 即可；
- `simulations` 越大，通常越强但越慢。

注意：当前实现是教学型 Single-Observer determinization，不是完整 MO-ISMCTS，存在经典的 strategy fusion / opponent private knowledge 近似问题。

### MCCFRTrainer

Outcome-Sampling MCCFR 教学版：

```text
Self-Play
  ↓
选择一名 update-player
  ↓
整局只采样一条 terminal trajectory
  ↓
update-player 使用 epsilon exploration
  ↓
importance sampling 修正 sampled counterfactual value
  ↓
更新 regret
  ↓
累计 average strategy
```

之所以使用 Outcome Sampling，而不是在 update-player 的每个节点展开全部动作，是因为本游戏一局中同一玩家会反复决策；后者在 Python Demo 里很容易出现搜索树爆炸。Outcome Sampling 每次只走一条完整轨迹，更适合先验证可行性。

特点：

- 不用神经网络；
- 不用 GPU；
- 可以训练；
- 可以保存模型；
- 可以继续训练；
- 支持 2~6 人运行。

**理论提醒：** CFR/MCCFR 在 2 人零和博弈中有经典理论保证；3 人以上本 Demo 可以训练和实验，但不要把它描述成拥有相同的 Nash 收敛保证。

---

## 3. 安装

Python 3.11+ 即可，无第三方依赖。

```bash
cd xiuxian_ai_demo
python main.py demo
```

---

## 4. 跑一局演示

```bash
python main.py demo --simulations 200
```

默认：

```text
P0 = 规则AI
P1 = ISMCTS
P2 = 随机AI
```

终端会输出中文动作和事件日志。

---

## 5. 训练 MCCFR

### 单进程：推荐先用这个验证算法

```bash
python main.py train --players 2 --iterations 10000 --workers 1 --out models/mccfr_2p_10k.pkl
```

更大训练：

```bash
python main.py train --players 3 --iterations 100000 --workers 8 --out models/mccfr_3p_100k.pkl
```

### 多进程训练

```bash
python main.py train --players 3 --iterations 100000 --workers 8 --sync-batch 1000 --out models/mccfr_3p_100k.pkl
```

`workers>1` 采用：

```text
Global Regret Snapshot
  ↓
Worker1 / Worker2 / ... / WorkerN
  ↓
各自做局部 MCCFR traversal
  ↓
返回 regret_delta / strategy_delta
  ↓
主进程合并
  ↓
下一批
```

这是**批量同步的近似并行 MCCFR**。批次越小，Worker 看到的策略越新，但通信/序列化开销越高。

如果你要做严格的算法论文级 baseline，先以 `workers=1` 为准；多进程版本主要用于工程加速实验。

---

## 6. 保存 Checkpoint

```bash
python main.py train ^
  --players 2 ^
  --iterations 100000 ^
  --workers 1 ^
  --checkpoint-every 10000 ^
  --out models/mccfr_2p_100k.pkl
```

会产生：

```text
mccfr_2p_100k_ckpt_10000.pkl
mccfr_2p_100k_ckpt_20000.pkl
...
```

这样以后可以直接比较：

```text
10K vs 50K
50K vs 100K
100K vs ISMCTS
```

观察 Self-Play 是否真的让策略变强。

---

## 7. 继续训练

```bash
python main.py train --players 2 --iterations 50000 --resume models/mccfr_2p_100k.pkl --out models/mccfr_2p_150k.pkl
```

---

## 8. 多 AI 自动比赛

### 3 人

```bash
python main.py battle --players 3 --agents random rule ismcts:300 --games 100
```

### MCCFR vs ISMCTS

```bash
python main.py battle --players 2 --agents mccfr:models/mccfr_2p_100k.pkl ismcts:500 --games 500
```

### 4 人混战

```bash
python main.py battle --players 4 --agents rule random ismcts:300 mccfr:models/mccfr_4p.pkl --games 500
```

每局会随机换座位，降低先手/位置偏差。

---

## 9. 测试

```bash
python -m unittest discover -s tests -v
```

---

## 10. 关键代码接口

环境：

```python
from xiuxian.game import GameConfig, GameState

config = GameConfig(num_players=4)
state = GameState(config, seed=42)

while not state.is_terminal():
    player = state.decision_player()
    obs = state.observation(player)
    legal = state.legal_actions()
    action = ...
    state.step(action)
```

MCCFR：

```python
from xiuxian.mccfr import MCCFRTrainer

trainer = MCCFRTrainer(GameConfig(num_players=2), seed=42)
trainer.train(iterations=100000, workers=1)
trainer.save("models/mccfr.pkl")
```

ISMCTS：

```python
from xiuxian.agents import ISMCTSAgent

agent = ISMCTSAgent(simulations=1000, exploration=1.4)
action = agent.act(state, state.decision_player())
```

---

## 11. 这个 Demo 现在故意没做的东西

为了先验证算法，以下内容暂时不加：

- 境界成长；
- HP / 攻击力；
- 法宝装备；
- 无限反制链；
- 复杂 Combo；
- 因果转移；
- 强制连续抽牌；
- 任务/剧情；
- UI；
- 神经网络；
- PPO / DQN；
- JPSRO / League。

先回答最重要的问题：

> **“这种 3~6 人隐藏信息修仙卡牌，ISMCTS 和 MCCFR 到底能不能学、能不能打、能不能随着训练变强？”**

如果答案是能，再扩大规则。

---

## 12. 下一步最值得做的实验

建议按顺序：

```text
实验 A
Random vs Rule
确认规则 AI 至少明显强于随机

实验 B
ISMCTS 50 / 200 / 1000 simulations
观察搜索次数和胜率关系

实验 C
MCCFR 1K / 10K / 50K / 100K
观察训练量和胜率关系

实验 D
MCCFR vs ISMCTS
Learning vs Search

实验 E
3 / 4 / 6 人
观察多人后算法稳定性和训练成本
```

以后可以再加入：

```text
MCCFR Policy Pool
+
ISMCTS Best Response
+
League / JPSRO
```

做真正的 Agent Population 自我进化实验。

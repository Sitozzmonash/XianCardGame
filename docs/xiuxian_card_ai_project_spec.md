# 修仙卡牌 AI 对战项目设计与开发说明

> 本文档用于交给后续开发 Agent。现有 Python Demo 代码可作为游戏运行机制、AI 接口和训练流程的参考实现。后续开发应在保留核心实验目标的前提下，对代码进行整理、模块化和工程化，并提供可一键运行、一键训练、一键评测的命令。

---

# 1. 项目目标

本项目表面上是一个 **3–6 人修仙主题纯卡牌游戏**，但更重要的目标是把它建设成一个：

> **隐藏信息多人卡牌游戏 + AI 博弈实验环境 + Self-Play / Agent 自我进化平台。**

项目同时满足三个目标：

1. 游戏本身足够简单、好玩，有明确的多人心理博弈和随机风险。
2. 游戏环境规则确定、可重复、可设置随机种子，方便 AI 算法训练与公平评测。
3. 后续可以持续加入不同 AI 算法，并研究 Self-Play、Champion、Population、League、JPSRO 等 Agent 自我进化机制。

长期研究方向：

```text
游戏环境
↓
AI Self-Play
↓
产生 Candidate
↓
自动评测
↓
与 Champion / 历史模型 / 其他算法比赛
↓
表现更好？
├─ Yes → 新 Champion
└─ No  → Reject
↓
继续训练和产生新策略
```

最终希望实现：

> AI 不只是会玩游戏，而是能够通过自我博弈和自动评测持续提高，至少稳定超越旧版本的自己。

---

# 2. 产品定位

游戏类型：

> **修仙主题 + 纯卡牌 + 隐藏信息 + 多人博弈 + 淘汰制**

第一阶段不做：

- 等级
- 境界成长
- HP
- 攻击力
- 装备强化
- Roguelike
- 剧情
- 长期养成
- 复杂 Combo
- 无限反制链

第一阶段重点是：

```text
手牌管理
+
牌堆信息
+
风险判断
+
隐藏信息
+
心理博弈
+
反制
+
多人针对
```

一句话描述核心玩法：

> **3–6 名修仙者围绕“天劫”进行手牌、信息和牌堆控制博弈，想办法避免自己抽到无法化解的天劫，同时将风险转移给其他玩家，最后存活者获胜。**

---

# 3. 玩家人数

正式目标：

```text
3–6 人
```

开发和算法研究阶段必须同时支持：

```text
2–6 人
```

原因：

- 2 人便于快速 Debug。
- 2 人零和环境适合验证 MCCFR 等算法。
- 3–6 人才是正式多人玩法。
- 后续需要比较算法从 2 人扩展到多人后的性能变化。

---

# 4. 胜负规则

不使用 HP。

不使用攻击力。

玩家只有：

```text
存活
/
淘汰
```

淘汰条件：

```text
抽到【天劫】
+
手中没有【护劫符】
=
淘汰
```

当场上只剩 1 名玩家：

```text
该玩家获胜
```

---

# 5. 初始设置

每名玩家：

```text
初始手牌 = 5 张
```

其中：

```text
保证 1 张【护劫符】
```

初始发牌阶段：

```text
不得直接发到【天劫】
```

牌堆中加入：

```text
天劫数量 = 玩家数 - 1
```

例如：

```text
2 人 → 1 张天劫
3 人 → 2 张天劫
4 人 → 3 张天劫
6 人 → 5 张天劫
```

理论上可以保证最终逐步淘汰到只剩 1 人。

---

# 6. 每回合流程

当前 V0.1 规则：

```text
玩家回合开始
↓
进入行动阶段
↓
最多使用 2 张主动牌
↓
玩家可选择继续出牌或结束行动
↓
结束行动后必须抽 1 张牌
↓
普通牌
→ 加入手牌
↓
天劫
→ 检查是否有护劫符
   ├─ 有 → 自动消耗护劫符 → 选择秘密回插位置
   └─ 无 → 淘汰
↓
进入下一位存活玩家回合
```

重要限制：

```text
每回合最多使用 2 张主动牌
```

这个设计必须保留在第一阶段。

原因：

1. 防止一回合无限 Combo。
2. 减少 Action Space。
3. 控制搜索树深度。
4. 方便 ISMCTS。
5. 方便 MCCFR。
6. 保持游戏节奏简单。

---

# 7. 当前卡牌设计

第一版只保留少量机制。

## 7.1 天劫

作用：

```text
抽到后必须渡劫
```

如果：

```text
没有护劫符
```

则：

```text
立即淘汰
```

天劫不是普通手牌，不进入手牌。

---

## 7.2 护劫符

作用：

```text
自动化解一次天劫
```

处理流程：

```text
玩家抽到天劫
↓
检查手牌
↓
存在护劫符
↓
自动消耗 1 张
↓
天劫没有被弃掉
↓
玩家秘密选择一个区域重新插回牌堆
```

---

## 7.3 观星术

作用：

```text
查看牌堆顶部最多 3 张牌
```

只有使用者知道结果。

其他玩家只知道：

```text
该玩家使用过观星术
```

但不知道他看到的具体内容。

---

## 7.4 逆天改命

作用：

```text
查看牌堆顶部最多 3 张牌
+
重新调整它们的顺序
```

只有使用者知道最终排序。

这是非常重要的牌堆控制机制。

---

## 7.5 扰乱天机

作用：

```text
重新洗牌
```

效果：

```text
所有玩家此前通过观星术或其他方式获得的牌顶知识失效
```

---

## 7.6 遁术

作用：

```text
立即结束自己的回合
+
本回合不抽牌
```

这是最基础的风险规避牌。

---

## 7.7 摄物术

作用：

```text
指定另一名存活玩家
↓
随机偷取对方 1 张手牌
```

目标可以使用：

```text
反制符
```

取消。

---

## 7.8 反制符

第一版只反制：

```text
摄物术
```

流程：

```text
A 对 B 使用摄物术
↓
B 获得反制机会
↓
B：
├─ 使用反制符 → 效果取消
└─ 不使用 → A 随机偷取 1 张 B 的手牌
```

第一版不允许：

```text
反制
↓
反制反制
↓
再次反制
```

也就是：

> **反制链深度固定为 1。**

后期再考虑扩展。

---

# 8. 天劫回插机制

玩家成功化解天劫后，必须把天劫重新秘密放回牌堆。

第一版不允许选择具体第 N 张。

只允许：

```text
TOP
NEAR_TOP
MIDDLE
BOTTOM
```

含义：

### TOP

```text
直接放到牌堆顶部
```

意味着：

> 下一个正常抽牌玩家极度危险。

### NEAR_TOP

```text
放到靠近顶部的随机位置
```

例如：

```text
第 2～4 张附近
```

### MIDDLE

```text
放入牌堆中间区域
```

### BOTTOM

```text
放到牌堆底部
```

这样设计的原因：

- 保留心理博弈。
- 保留不确定性。
- 降低动作空间。
- 避免 AI 需要对几十个具体位置做决策。
- 方便后期增加 Belief / Opponent Modeling。

---

# 9. 信息模型

这是整个项目最重要的设计之一。

必须严格区分：

```text
GameState
Observation
InformationSet
```

---

# 10. GameState

GameState 是：

> **环境内部真实状态 / 上帝视角状态**

只有 Game Engine 可以完整访问。

包含：

```text
完整牌堆顺序
所有玩家真实手牌
天劫具体位置
当前玩家
当前 Phase
存活状态
弃牌堆
每个玩家知道的牌顶信息
Pending Counter
Pending Reorder
Pending Reinsert
当前已使用主动牌数量
随机数状态
游戏日志
```

AI 决策层不得直接读取不属于自己的隐藏信息。

---

# 11. Observation

每个玩家自己的 Observation 只包含：

```text
自己的手牌
自己的已知牌顶信息
其他玩家手牌数量
所有玩家是否存活
当前玩家
当前决策玩家
当前阶段
牌堆剩余数量
公开弃牌
公开行为历史
公开 Pending Action
```

不得包含：

```text
其他玩家真实手牌
自己没有看过的牌堆顺序
其他玩家私有观星结果
真实天劫位置
```

---

# 12. Information Set

MCCFR 使用：

```text
Information Set
```

Information Set 应由当前玩家可见信息编码。

概念：

> 如果两个真实 GameState 对当前玩家来说完全无法区分，那么它们必须映射为同一个 Information Set。

第一版 Information Set 可以包含：

```text
player_id
phase
current_player
decision_player
actions_used
deck_size

自己的手牌
自己的 known_top

每名玩家的手牌数量
每名玩家 alive 状态

公开弃牌统计

公开 pending_actor
公开 pending_target

如果当前玩家正在执行逆天改命：
    加入其私有看到的顶部牌
```

后续开发必须尽量：

```text
紧凑编码
```

不要长期使用大型字符串作为最终生产格式。

建议后期用：

```text
整数
Tuple
Bit Packing
Hash
```

减少内存。

---

# 13. 环境核心接口

后续 Game Engine 应提供统一接口：

```python
env.reset()
env.step(action)
env.legal_actions()
env.observation(player)
env.infoset_key(player)
env.clone()
env.is_terminal()
env.utilities()
```

推荐抽象：

```python
class XiuxianCardEnv:
    reset()
    step(action)
    legal_actions()
    observation(player)
    infoset(player)
    clone()
    is_terminal()
    utilities()
```

所有 AI 必须使用同一个环境。

---

# 14. 为什么必须支持 clone()

下面算法都需要模拟未来：

```text
ISMCTS
MCTS
Minimax
Best Response
未来的 JPSRO Oracle
```

因此环境必须能够：

```python
next_state = state.clone()
next_state.step(action)
```

并且 clone 必须同时复制：

```text
随机数状态
隐藏信息
Phase
Pending Action
```

否则搜索结果不可重复。

---

# 15. 随机种子

必须支持：

```text
seed
```

所有：

```text
洗牌
随机发牌
随机偷牌
Near Top 回插
ISMCTS Determinization
训练采样
```

都必须可由 Seed 控制。

用途：

```text
复现实验
Debug
A/B Test
Benchmark
```

---

# 16. Reward / Utility

多人终局使用 Constant-Sum Reward。

赢家：

```text
+1
```

其他玩家：

```text
-1 / (N - 1)
```

例如 4 人：

```text
Winner = +1.000
Others = -0.333
         -0.333
         -0.333
```

总和约为：

```text
0
```

注意：

> 3 人以上即使总和为 0，也不等于经典的 2-player zero-sum。

多人博弈的理论性质需要单独研究。

---

# 17. AI 架构总览

第一阶段至少包含：

```text
RandomAgent
RuleAgent
ISMCTSAgent
MCCFRAgent
```

所有 Agent 统一实现：

```python
class BaseAgent:
    def act(self, state, player):
        ...
```

后期可以增加：

```text
QLearningAgent
MCTSAgent
OpponentModelAgent
HybridAgent
JPSROAgent
LLMAgent
```

---

# 18. RandomAgent

用途：

> 最弱 Baseline。

行为：

```text
从所有合法动作中随机选择
```

用途：

- 验证环境是否能正常运行。
- 判断其他 AI 是否至少学会基本策略。
- 做最低基准。

---

# 19. RuleAgent

用途：

> 人工规则 Baseline。

第一版规则：

```text
如果已知下一张是天劫：
    优先遁术
    或洗牌
    或逆天改命

如果不知道牌顶：
    第一行动优先考虑观星术

如果被摄物术针对：
    有反制符则优先反制

如果手牌较少：
    可以考虑偷取手牌较多的玩家

如果化解天劫：
    偏攻击型策略可以选择 TOP
```

RuleAgent 不得读取隐藏信息。

---

# 20. ISMCTS

全称：

> Information Set Monte Carlo Tree Search

定位：

> **无需训练的实时搜索 AI**

基本流程：

```text
当前 Observation
↓
Determinization
↓
生成一个与当前信息一致的可能真实世界
↓
Selection
↓
Expansion
↓
Rollout
↓
Backpropagation
↓
重复 simulations 次
↓
选择最佳动作
```

---

# 21. ISMCTS Determinization

当前玩家不知道：

```text
其他玩家手牌
未知牌堆顺序
```

因此 ISMCTS 每次模拟：

```text
收集所有当前观察者看不到的牌
↓
随机打乱
↓
重新分配给：
其他玩家隐藏手牌
未知牌堆位置
↓
固定观察者已经知道的 known_top
```

每次得到一个：

> 与当前 Observation 不冲突的可能世界。

---

# 22. 当前 ISMCTS 版本定位

现有 Python Demo 中的 ISMCTS 是：

> **Single-Observer ISMCTS 教学版**

可作为：

```text
Baseline
Prototype
算法实验起点
```

不是最终最优版本。

---

# 23. ISMCTS 当前参数

主要参数：

```text
simulations
exploration
max_depth
rollout_policy
```

建议默认：

```text
simulations = 500
exploration ≈ 1.4
max_depth = 250
rollout = RuleAgent
```

---

# 24. ISMCTS 必须支持调参

至少支持：

```text
simulations:
100
500
1000
3000
5000

exploration:
0.5
0.8
1.0
1.4
2.0
```

未来做自动 Benchmark。

---

# 25. ISMCTS 后续升级方向

第二阶段可以研究：

```text
MO-ISMCTS
Availability-aware UCT
Opponent Modeling
不同 Rollout Policy
Parallel ISMCTS
Transposition Table
更严格 Determinization
```

尤其多人游戏中：

```text
P0 知道什么
P1 知道什么
P2 知道什么
```

不一样。

因此后续可以实现：

> MO-ISMCTS / Multiple Observer ISMCTS。

---

# 26. MCCFR

当前训练型 AI 使用：

> **Outcome-Sampling MCCFR**

全称：

> Monte Carlo Counterfactual Regret Minimization

目标：

> 通过 Self-Play 逐渐形成更好的混合策略。

---

# 27. MCCFR 核心思想

不是学习：

```text
Q(s,a)
```

而是累计：

```text
Regret(InformationSet, Action)
```

核心问题：

> 如果当时选择另外一个动作，我是不是会得到更好的结果？

例如：

```text
当前策略：
观星 33%
遁术 33%
洗牌 34%
```

训练后发现：

```text
观星长期价值更高
```

则：

```text
Regret(观星) ↑
```

下一阶段：

```text
观星选择概率 ↑
```

---

# 28. Regret Matching

可以使用：

```text
positive_regret(a) = max(regret(a), 0)
```

策略：

```text
strategy(a)
=
positive_regret(a)
/ sum(all positive regrets)
```

如果：

```text
所有 regret <= 0
```

则：

```text
合法动作均匀随机
```

---

# 29. 为什么使用 Outcome Sampling MCCFR

当前游戏中：

```text
同一个玩家一局会多次行动
+
每个 Action Node 可能存在多个动作
```

如果使用一个会在 Traverser 节点完整展开所有动作的实现：

```text
搜索树很容易指数爆炸
```

因此 Demo 使用：

> Outcome Sampling MCCFR

核心：

```text
每次 Training Episode
↓
只采样一条完整 terminal trajectory
↓
通过 Importance Sampling 修正价值估计
↓
更新访问到的信息集 regret
```

优点：

```text
CPU 友好
内存压力更可控
适合快速验证
```

---

# 30. MCCFR 训练流程

```text
初始化 regret table
初始化 strategy table
↓
选择 update-player
↓
新建随机游戏
↓
Self-Play
↓
每个节点根据当前策略采样
↓
update-player 节点加入 epsilon exploration
↓
一路采样到终局
↓
获得 utility
↓
沿访问路径更新 regret
↓
累计 average strategy
↓
换下一个 update-player
↓
继续
```

一个 Outer Iteration：

```text
每名玩家分别作为一次 update-player
```

例如 4 人：

```text
1 outer iteration
=
P0 traversal
+
P1 traversal
+
P2 traversal
+
P3 traversal
```

---

# 31. MCCFR 训练数据

至少保存：

```text
regret_sum[infoset][action]
strategy_sum[infoset][action]
```

同时保存：

```text
iterations_done
traversals_done
game_config
seed
exploration
```

---

# 32. MCCFR 推理

训练完成以后：

```text
当前 Information Set
↓
查 strategy_sum
↓
归一化
↓
得到动作概率
↓
按概率选择动作
```

例如：

```text
观星 52%
遁术 31%
洗牌 17%
```

因此 MCCFR：

```text
训练阶段 CPU 成本高
推理阶段 CPU 成本很低
```

这点非常适合：

```text
服务器提前训练
↓
Web / Android / iOS 客户端加载 Policy
↓
本地快速推理
```

---

# 33. 未见 Information Set

实际运行时可能出现：

```text
训练从未访问过的新 Information Set
```

当前 Demo：

```text
MCCFR 查不到
↓
RuleAgent fallback
```

后续可以研究：

```text
State Abstraction
Similar InfoSet
Policy Generalization
Fallback Strategy
```

---

# 34. MCCFR 与 Q-Learning 区别

Q-Learning：

```text
State
↓
Q(s,a)
↓
通常选择最大 Q
```

MCCFR：

```text
Information Set
↓
Mixed Strategy
↓
按照概率选择动作
```

MCCFR 更适合：

```text
隐藏信息
博弈
需要随机混合策略
```

---

# 35. MCCFR 多人支持

代码层面：

```text
2–6 人均可以运行
```

但是理论上要明确：

```text
2-player zero-sum
```

是 CFR 最经典的收敛环境。

3–6 人时：

```text
可以训练
可以做 Self-Play
可以比较胜率
```

但是不能直接宣称：

> 拥有和 2 人零和相同的 Nash 收敛保证。

因此：

```text
多人 MCCFR
=
实验型学习算法
```

---

# 36. 多进程训练

Python CPU 密集任务：

```text
优先 multiprocessing
```

不要依赖普通 Thread。

原因：

```text
Python GIL
```

---

# 37. 当前并行 MCCFR 思路

```text
Global Regret Snapshot
        ↓
┌───────┼───────┐
↓       ↓       ↓
Worker1 Worker2 Worker3 ...
↓       ↓       ↓
Local Training
↓       ↓       ↓
regret_delta
strategy_delta
        ↓
      Master
        ↓
       Merge
        ↓
下一轮 Snapshot
```

---

# 38. 并行训练定位

当前属于：

> **批量同步近似并行 MCCFR**

参数：

```text
workers
sync_batch
```

例如：

```bash
python main.py train \
  --players 3 \
  --iterations 100000 \
  --workers 8 \
  --sync-batch 1000 \
  --out models/mccfr_3p_100k.pkl
```

严格算法对照实验：

```text
workers=1
```

工程加速：

```text
workers>1
```

---

# 39. 一键训练要求

后续 Agent 必须把训练入口整理好。

目标：

```bash
python train.py --config configs/train_2p.yaml
```

或者：

```bash
python main.py train --config configs/mccfr_3p.yaml
```

配置文件示例：

```yaml
game:
  players: 3
  initial_hand: 5
  max_actions_per_turn: 2
  seed: 42

training:
  algorithm: mccfr
  iterations: 100000
  workers: 8
  sync_batch: 1000
  checkpoint_every: 10000

output:
  model_dir: models/mccfr_3p
```

用户不要每次改 Python 代码。

所有主要训练参数：

```text
CLI / YAML
```

可配置。

---

# 40. 一键续训要求

必须支持：

```bash
python main.py train \
  --resume models/mccfr_100k.pkl \
  --iterations 100000
```

即：

```text
100K
↓
继续训练
↓
200K
```

不得每次重新开始。

---

# 41. Checkpoint

训练必须支持：

```text
10K
50K
100K
500K
1M
```

等多个 Checkpoint。

例如：

```text
mccfr_10k.pkl
mccfr_50k.pkl
mccfr_100k.pkl
mccfr_500k.pkl
mccfr_1m.pkl
```

目的：

> 验证 Self-Play 是否真的随着训练持续变强。

---

# 42. 一键比赛要求

必须支持：

```bash
python main.py battle \
  --players 2 \
  --agents mccfr:models/mccfr_100k.pkl ismcts:500 \
  --games 5000
```

含义：

```text
2 人
P0 = MCCFR 100K
P1 = ISMCTS simulations=500
自动打 5000 局
```

---

# 43. 支持自由 AI 组合

例如：

```bash
python main.py battle --players 2 --agents random rule --games 1000
```

```bash
python main.py battle --players 3 --agents random rule ismcts:500 --games 1000
```

```bash
python main.py battle --players 4 \
  --agents rule random ismcts:1000 mccfr:models/mccfr_4p.pkl \
  --games 5000
```

要求：

```text
players 数量
=
agents 数量
```

---

# 44. 座位随机化

Tournament 中：

```text
每局随机换座位
```

避免：

```text
P0 永远先手
```

导致结果偏差。

需要统计：

```text
每个 Agent 各座位胜率
```

后续应增加：

```text
Seat Bias Report
```

---

# 45. Evaluation 指标

至少统计：

```text
Games
Wins
Win Rate
Draw
Average Decisions
Average Game Length
```

后续建议增加：

```text
Elo
Confidence Interval
Seat Win Rate
Per-Agent Action Distribution
Training Iterations/sec
Information Set Count
Policy Size
Memory Usage
Model File Size
```

---

# 46. Self-Play 研究重点

最重要的 MCCFR 实验：

```text
MCCFR-1K
MCCFR-10K
MCCFR-50K
MCCFR-100K
MCCFR-500K
MCCFR-1M
```

分别挑战：

```text
Random
RuleAgent
ISMCTS-100
ISMCTS-500
ISMCTS-1000
旧版本 MCCFR
```

目标：

```text
Training Iterations ↑
↓
Win Rate 是否 ↑
Elo 是否 ↑
```

---

# 47. 训练进步不能只比较最新版本

不能只做：

```text
V101 vs V100
```

因为可能出现策略循环：

```text
A 打败 B
B 打败 C
C 又打败 A
```

因此必须保存：

```text
Historical Pool
```

例如：

```text
MCCFR_10K
MCCFR_50K
MCCFR_100K
MCCFR_500K
Champion
RuleAgent
ISMCTS
```

新模型需要对多个历史对手评测。

---

# 48. Champion 系统

后期目标：

```text
Champion
↓
继续 Self-Play
↓
Candidate
↓
Tournament
↓
比较：
Candidate vs Champion
Candidate vs Historical Pool
Candidate vs Rule
Candidate vs ISMCTS
↓
达到门槛？
├─ Yes → Promote
└─ No  → Reject
```

需要定义：

```text
Promotion Gate
```

例如：

```text
Candidate Elo > Champion Elo + threshold
且
历史池整体不退化
且
达到最低比赛局数
且
置信区间满足要求
```

---

# 49. ISMCTS vs MCCFR 的研究意义

这是本项目非常重要的一组对照：

## ISMCTS

```text
不训练
实时搜索
推理贵
```

## MCCFR

```text
训练贵
推理便宜
```

研究问题：

> Learning AI 和 Search AI 谁更适合这个游戏？

---

# 50. Hybrid Agent

后期重要方向：

```text
MCCFR
+
ISMCTS
```

结构：

```text
Information Set
↓
MCCFR 给出 Prior Strategy

例如：
A = 55%
B = 25%
C = 15%
D = 5%

↓
ISMCTS 重点搜索 A/B/C
↓
根据实时局面修正
↓
最终动作
```

目标：

```text
减少 ISMCTS 搜索成本
+
保留 MCCFR 长期训练经验
+
提升现场适应能力
```

---

# 51. Population / League

当单一 Agent Self-Play 完成后，可以加入：

```text
Population
```

例如：

```text
Aggressive Agent
Conservative Agent
Deck-Control Agent
Steal Agent
Risk-Taking Agent
MCCFR Agent
ISMCTS Agent
Hybrid Agent
```

互相比赛：

```text
Payoff Matrix
```

---

# 52. JPSRO / 多人自我进化

长期研究方向：

```text
Policy Population
↓
Tournament
↓
Payoff Matrix
↓
Meta Solver
↓
找当前策略体系的弱点
↓
Best Response / Response Oracle
↓
产生新策略
↓
加入 Population
↓
继续
```

可以研究：

```text
PSRO
JPSRO
CE
CCE
League Self-Play
```

这些不属于第一阶段开发范围，但架构必须方便后续接入。

---

# 53. Python Demo 代码定位

现有 Python Demo：

> **作为后续开发的重要参考实现。**

可以参考：

```text
GameState
Action
Phase
legal_actions()
step()
clone()
observation()
infoset_key()
determinize_for()
RandomAgent
RuleAgent
ISMCTSAgent
MCCFRTrainer
MCCFRAgent
Tournament
Checkpoint
Multiprocessing
```

但是：

> 不要求原样保留代码。

开发 Agent 可以：

```text
重构
拆模块
修复算法
优化编码
优化性能
增加配置
增加日志
增加 Benchmark
```

前提：

> 不改变本文档已经确认的核心游戏规则和实验目标，除非明确记录变更。

---

# 54. 推荐工程结构

建议最终整理为：

```text
xiuxian_ai/
├── game/
│   ├── env.py
│   ├── state.py
│   ├── cards.py
│   ├── actions.py
│   ├── rules.py
│   └── config.py
│
├── agents/
│   ├── base.py
│   ├── random_agent.py
│   ├── rule_agent.py
│   ├── ismcts/
│   │   ├── agent.py
│   │   ├── tree.py
│   │   ├── determinization.py
│   │   └── rollout.py
│   └── mccfr/
│       ├── agent.py
│       ├── trainer.py
│       ├── regret.py
│       └── policy.py
│
├── training/
│   ├── train.py
│   ├── checkpoint.py
│   ├── parallel.py
│   └── config.py
│
├── evaluation/
│   ├── match.py
│   ├── tournament.py
│   ├── metrics.py
│   ├── elo.py
│   └── historical_pool.py
│
├── configs/
│   ├── game_2p.yaml
│   ├── game_3p.yaml
│   ├── train_mccfr_2p.yaml
│   └── train_mccfr_3p.yaml
│
├── models/
├── logs/
├── tests/
├── main.py
└── README.md
```

第一阶段可以适当简化，但模块边界应保持。

---

# 55. 性能要求

训练和评测优先：

```text
CPU-only
```

不依赖：

```text
GPU
PyTorch
TensorFlow
```

第一阶段尽量：

```text
Python 标准库
NumPy 可选
```

后续如果状态表规模增大，可以使用：

```text
NumPy
SQLite
LMDB
Memory-Mapped Array
Compact Hash Table
```

优化内存。

---

# 56. 训练日志

训练时输出中文日志。

推荐：

```text
[MCCFR]
玩家数: 3
Workers: 8
Iterations: 100,000
Traversals: 300,000
InfoSets: 182,541
Iterations/s: 2,340
Elapsed: 00:42:44
Checkpoint: models/mccfr_3p_100k.pkl
```

同时保存机器可读：

```text
JSON / CSV
```

例如：

```text
iteration
elapsed
infosets
iterations_per_second
policy_size
checkpoint
```

方便以后画学习曲线。

---

# 57. 评测日志

推荐输出：

```text
=== AI 对战结果 ===

总局数：5000
平局：3
平均决策步数：22.8

MCCFR-100K
胜场：2783
胜率：55.66%

ISMCTS-500
胜场：2214
胜率：44.28%
```

如果多人：

```text
Agent
Win Rate
Seat 0
Seat 1
Seat 2
Seat 3
```

---

# 58. 测试要求

至少包含：

```text
规则单元测试
合法动作测试
天劫淘汰测试
护劫符测试
观星测试
逆天改命测试
洗牌知识失效测试
遁术测试
摄物术测试
反制测试
多人轮转测试
最后一人胜利测试
Seed 可复现测试
clone 独立性测试
Observation 不泄露隐藏信息测试
InformationSet 一致性测试
ISMCTS 合法动作测试
MCCFR 小规模训练测试
Checkpoint 保存/加载测试
Resume 测试
Tournament 测试
```

---

# 59. AI 不得作弊

这是强约束。

任何 AI：

```text
Random
Rule
ISMCTS
MCCFR
Future Agent
```

都不能通过：

```text
state.deck
state.hands[other]
```

直接读取真实隐藏信息后做决策。

搜索类算法只能通过：

```text
合法 Determinization
```

生成可能世界。

---

# 60. 第一阶段不做的功能

明确暂缓：

```text
境界成长
等级
HP
攻击力
装备
法宝成长
修炼
故事模式
地图
Roguelike
任务
商业 UI
复杂动画
神经网络
DQN
PPO
深度 CFR
LLM Agent
无限牌种
复杂状态效果
多层 Counter Stack
```

先验证最核心问题。

---

# 61. 第一阶段必须回答的研究问题

## 问题 1

```text
RuleAgent 是否明显强于 RandomAgent？
```

否则规则 AI 没有意义。

## 问题 2

```text
ISMCTS simulations 增加后，胜率是否提高？
```

例如：

```text
100
500
1000
3000
5000
```

## 问题 3

```text
MCCFR 训练更多以后是否真的变强？
```

例如：

```text
1K
10K
50K
100K
500K
1M
```

## 问题 4

```text
MCCFR vs ISMCTS 谁更强？
```

## 问题 5

```text
2 人训练规律能否扩展到 3 / 4 / 6 人？
```

## 问题 6

```text
多人后 Information Set 和内存增长速度是多少？
```

---

# 62. 推荐实验流程

```text
阶段 A
环境测试
↓
Random vs Random
↓
确认规则完全正确

阶段 B
Rule vs Random
↓
确认 Rule 有显著优势

阶段 C
ISMCTS 调参
↓
100 / 500 / 1000 / 3000 / 5000
↓
找到 Search Baseline

阶段 D
MCCFR Self-Play
↓
1K / 10K / 50K / 100K / 500K
↓
保存 Checkpoint

阶段 E
MCCFR vs Historical MCCFR
↓
确认训练是否带来提升

阶段 F
MCCFR vs ISMCTS
↓
Learning vs Search

阶段 G
3 / 4 / 6 人
↓
多人实验

阶段 H
Champion / Historical Pool
↓
自动自我进化
```

---

# 63. 当前一次实验结果

已经进行过：

```text
MCCFR-10K
vs
ISMCTS-500
```

5 局：

```text
MCCFR 60%
ISMCTS 40%
```

样本太小，无意义。

50 局：

```text
ISMCTS 60%
MCCFR 40%
```

当前只能说明：

> 这 50 局中 ISMCTS-500 表现更好。

不能据此判断算法强弱。

正式比较：

```text
至少 1000 局
推荐 5000+ 局
```

---

# 64. 统计原则

不要仅凭：

```text
5 局
20 局
50 局
```

下结论。

由于游戏随机性强，正式评测建议：

```text
1000–10000 局
```

后续加入：

```text
95% Confidence Interval
```

---

# 65. README 要求

开发完成后 README 必须详细说明：

```text
环境安装
运行一局
训练 MCCFR
并行训练
继续训练
保存 Checkpoint
加载 MCCFR
配置 ISMCTS
多 AI 比赛
多人比赛
运行测试
查看日志
模型目录
Config 参数
算法限制
未来路线
```

用户只看 README 就能使用。

---

# 66. 最终开发原则

开发 Agent 后续实现必须遵循：

### 原则 1

```text
Game Engine 与 AI 完全解耦
```

### 原则 2

```text
GameState 与 Observation 严格分离
```

### 原则 3

```text
AI 不作弊
```

### 原则 4

```text
所有算法共享同一个 Game Environment
```

### 原则 5

```text
所有随机行为支持 Seed
```

### 原则 6

```text
CLI / Config 驱动
```

不要每次为了：

```text
改玩家数
改训练次数
改 Worker
改 ISMCTS Simulation
```

而修改代码。

### 原则 7

```text
一键训练
一键续训
一键比赛
一键测试
```

### 原则 8

```text
先验证算法
再扩游戏规则
```

---

# 67. 下一阶段开发 Agent 的任务

开发 Agent 应以：

> **现有 Python Demo + 本文档**

作为输入。

第一步不要扩大游戏玩法。

先完成：

```text
1. 检查现有 Demo 游戏规则是否与本文档完全一致
2. 修复规则或算法实现中的明显问题
3. 重构工程结构
4. 加入 YAML / CLI Config
5. 完善中文日志
6. 完善测试
7. 做一键训练
8. 做一键续训
9. 做一键比赛
10. 支持 Checkpoint
11. 支持 2–6 人
12. 完善 ISMCTS 参数
13. 完善 MCCFR 训练统计
14. 增加 Benchmark
15. 输出清晰 README
```

完成以上工作后再开始：

```text
ISMCTS v2
MO-ISMCTS
Champion
Historical Pool
Hybrid Agent
JPSRO
```

---

# 68. 项目最终方向

短期：

```text
修仙卡牌游戏
+
Random
+
Rule
+
ISMCTS
+
MCCFR
```

中期：

```text
Benchmark
+
Champion
+
Historical Pool
+
Hybrid Agent
```

长期：

```text
Population
+
League
+
PSRO / JPSRO
+
Opponent Modeling
+
Self-Evolving Agent
```

最终目标：

> **把这个修仙卡牌游戏发展成一个可重复、可训练、可搜索、可评测、可持续进化的 Multi-Agent Imperfect-Information Game AI 实验平台。**

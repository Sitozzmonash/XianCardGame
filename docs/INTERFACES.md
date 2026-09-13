# 修仙卡牌：文件与接口冻结契约

> 本文件是**多 Agent 并行开发的唯一接口权威**。任何 Agent 写代码前必须先读本文件 +
> `reference/xiuxian_ai_demo/`（可运行的参考实现）+ `docs/`（产品与 API 文档）。
> 规则、隐藏信息模型、AI 算法语义以 `docs/xiuxian_card_ai_project_spec.md` 为准；
> HTTP 契约以 `docs/API_CONTRACT.md` 为准；工程结构以 `docs/TECH_ARCHITECTURE.md` 为准。
>
> 本文件只冻结**签名、文件归属、命名映射**。不要修改本文件里已冻结的签名；
> 如确有必要，先在本文件末尾的「变更记录」中写明理由，再同步依赖方。

---

## 0. 仓库结构与文件归属（谁写哪些文件）

```text
xiuxian-card/
├── backend/                    # ← Python 包根，所有命令都在 backend/ 下执行
│   ├── main.py                 # CLI 入口（demo / train / battle / benchmark）
│   ├── requirements.txt
│   ├── render.yaml
│   ├── configs/*.yaml
│   ├── game/                   # 【C2 负责】环境与规则，不含任何 AI 逻辑
│   ├── agents/                 # 【C2 负责】random / rule / ismcts / mccfr
│   ├── training/               # 【C3 负责】MCCFR 训练、checkpoint、并行
│   ├── evaluation/             # 【C3 负责】对局、锦标赛、指标、Elo
│   ├── app/                    # 【C4 负责】FastAPI 服务层
│   ├── models/                 # .pkl 模型（不进 git，除 index.json）
│   └── tests/                  # 各 Agent 自带测试；跨模块测试由主控 Agent 写
├── frontend/                   # 【C1 负责】Expo + React Native + TypeScript
├── docs/                       # 只读：原始交接文档
├── images/                     # 只读：视觉参考图
└── reference/xiuxian_ai_demo/  # 只读：原始 Python Demo（不要再改）
```

**导入约定**：工作目录固定为 `backend/`，包为顶层包（无 `src/`）。
即 `from game.state import GameState`、`from agents.registry import parse_agent`。
命令示例：`cd D:/Documents/Hermes/xiuxian-card/backend && python main.py demo`。

**平台约定**：Windows + git-bash。用 `python`（不要用 `python3`）；路径用 `D:/...` 正斜杠风格
（`/d/...` 会被原生程序误解析）；pip 已配清华镜像；**不要修改 `reference/`**。

---

## 1. `game/` 层（C2）：规则与环境

### 1.1 `game/cards.py`

```python
class Card(str, Enum):
    TRIBULATION = "天劫"
    DEFUSE      = "护劫符"
    PEEK        = "观星术"
    REORDER     = "逆天改命"
    SHUFFLE     = "扰乱天机"
    SKIP        = "遁术"
    STEAL       = "摄物术"
    COUNTER     = "反制符"

CARD_ORDER: tuple[Card, ...]          # 固定顺序，用于编码：TRIBULATION=0 ... COUNTER=7
CARD_TO_INDEX: dict[Card, int]        # Card -> 0..7
INDEX_TO_CARD: dict[int, Card]
API_CARD_ID: dict[Card, str]          # Card.PEEK -> "STARGAZING"（见 1.7 映射表）
CARD_BY_API_ID: dict[str, Card]

@dataclass(frozen=True)
class CardSpec:                        # 供 GET /cards 使用
    id: str            # "STARGAZING"
    name: str          # "观星术"
    category: str      # "TRIBULATION" | "DEFUSE" | "ACTIVE" | "REACTIVE"
    description: str   # 中文效果说明
    asset: str         # 前端资源名，小写下划线，如 "stargazing"

CARD_SPECS: tuple[CardSpec, ...]       # 8 张，顺序 = CARD_ORDER
def card_spec(card: Card) -> CardSpec
```

- `Card.value` 保持中文（日志、前端文案依赖它），**英文 id 只在 API 层用 `API_CARD_ID`**。
- 8 张牌的顺序一旦发布不得变更（编码与模型文件兼容性依赖）。

### 1.2 `game/config.py`

```python
@dataclass
class GameConfig:
    num_players: int = 3               # 2..6
    initial_hand: int = 5
    max_actions_per_turn: int = 2
    max_decisions: int = 500
    seed: int = 42
    deck_composition: Optional[dict[str, int]] = None   # 可选覆盖；键为 API 卡 id
    def validate(self) -> None: ...
    def to_dict(self) -> dict
    @classmethod
    def from_dict(cls, d: dict) -> "GameConfig"
    @classmethod
    def from_yaml(cls, path: str) -> "GameConfig"
```
- `deck_composition=None` 时按参考实现线性缩放（每人数 N 时 `PEEK=2N, REORDER=N, SHUFFLE=N,
  SKIP=2N, STEAL=N, COUNTER=N, DEFUSE=额外 max(1, N//2)`），天劫固定 `N-1` 张。
- 保持参考实现规则不变：每人开局 1 张护劫符、初始手牌不含天劫、随机决定先手。

### 1.3 `game/actions.py`

```python
class ActionKind(str, Enum):
    END_TURN, PLAY_PEEK, PLAY_REORDER, PLAY_SHUFFLE, PLAY_SKIP, PLAY_STEAL,
    PASS_COUNTER, PLAY_COUNTER, REORDER_TOP, REINSERT      # 成员名为英文

@dataclass(frozen=True)
class Action:
    kind: ActionKind
    target: int = -1
    param: str = ""
    def key(self) -> str            # f"{kind.value}|{target}|{param}"，中文值，稳定可比
    def __str__(self) -> str        # 中文人读形式（保持参考实现风格）
    def api_type(self) -> str       # 见 1.7 动作映射
```
- `Action` 必须可哈希、可相等比较（放进 set/dict 做合法动作校验）。
- `param` 语义：`REINSERT` 用 `"TOP"|"NEAR_TOP"|"MIDDLE"|"BOTTOM"`；
  `REORDER_TOP` 用 `"102"` 形式的 0-based 排列串（长度 = 可排序张数）。

### 1.4 `game/state.py`

```python
class Phase(str, Enum):
    ACTION, COUNTER, REORDER, REINSERT, ENDED      # 成员名为英文

class GameState:
    config: GameConfig
    num_players: int
    hands: list[list[Card]]
    deck: list[Card]                       # deck[0] 为牌堆顶
    discard: list[Card]
    alive: list[bool]
    known_top: list[list[Card]]            # 各玩家已知的牌顶序列
    current_player: int
    phase: Phase
    actions_used: int
    turn_no: int
    decision_count: int
    winner: Optional[int]
    forced_stop: bool
    logs: list[str]
    rng: random.Random

    def __init__(self, config: GameConfig, seed: Optional[int] = None): ...
    def reset(self) -> "GameState"                 # 重新发牌，返回自身
    def clone(self) -> "GameState"                 # 必须同时复制 rng state 与隐藏信息
    def is_terminal(self) -> bool
    def decision_player(self) -> int
    def legal_actions(self) -> list[Action]
    def step(self, action: Action) -> None         # 非法动作抛 ValueError
    def utilities(self) -> list[float]             # 赢家 +1，其余 -1/(N-1)；forced_stop/平局全 0
    def infoset_key(self, player: int) -> tuple     # 紧凑、可哈希，见 1.5
    def observation(self, player: int) -> dict      # API_CONTRACT §9 结构，见 1.6
    def public_state(self, player: int) -> dict     # API_CONTRACT §8 结构
    def legal_action_dicts(self, player: int) -> list[dict]   # 由 app 层调用，见 1.7
    def determinize_for(self, observer: int, seed: Optional[int] = None) -> "GameState"
    def debug_string(self, reveal_all: bool = False) -> str
```
- 规则语义**必须**与 `reference/xiuxian_ai_demo/xiuxian/game.py` 等价（除 infoset 编码与
  `observation` 结构调整外，逐条行为一致）——**唯一例外是附录 A13 记录的三张牌规则**：
  观星术（查看 + 改序）、遁术（反应牌 / 避开法术）、反制符（取消 → 反弹）。
  卡牌功能以用户提供的前端参考原型文案为准，参考实现是旧规则，因此 C2 的对照测试
  改为「只对**未改动分支**逐步零差异 + 偏离白名单显式列出」（`tests/_game_test_utils.py`
  的 `DEVIATION_ACTION_KINDS` / `assert_action_parity()`）。
- `step()` 里 `decision_count > max_decisions` → `forced_stop=True, phase=ENDED`（平局），保持参考行为。

### 1.5 紧凑 Information Set（关键改动）

```python
def infoset_key(self, player: int) -> tuple   # 返回值必须全部由 int / tuple[int] 组成
```
编码方案（**替换参考实现里的 `repr(...)` 大字符串**）：

```text
(
  player,                    # int
  phase_index,               # int 0..4
  current_player,            # int
  decision_player,           # int
  actions_used,              # int
  deck_size,                 # int
  hand_sig,                  # tuple[int]  自身手牌按 CARD_TO_INDEX 排序后的计数向量（长度 8）
  known_top,                 # tuple[int]  自身 known_top 的卡 index 序列
  reorder_private,           # tuple[int]  仅当自己是 reorder_owner 时非空
  hand_sizes,                # tuple[int]  长度 N
  alive_mask,                # int        位掩码
  discard_sig,               # tuple[int]  长度 8
  pending,                   # tuple[int,int]  仅 COUNTER 阶段为真实值，否则 (-1,-1)
)
```
- 禁止在 key 中出现 `str`、`Card`、`float`。**这是模型体积从 124MB 降到 <10MB 的核心**。
- `hand_sig` 用计数向量而非 tuple(卡)（手牌顺序对决策无意义，且能进一步压缩）。
- 保持语义：两个对 `player` 不可区分的 GameState 必须映射到同一个 key；
  反之不要求（碰撞只影响收敛速度，不影响正确性，但不要主动制造碰撞）。

### 1.6 `observation(player)` 返回结构（API_CONTRACT §9）

```python
{
  "hand": [{"instance_id": "h_0_0", "card_id": "STARGAZING", "name": "观星术"}],
  "known_top": [{"position": 0, "card_id": "TRIBULATION", "name": "天劫"}],
  "actions_used": 1,
  "max_actions_per_turn": 2,
  "private_context": None | {"cards": [{"token": "private_1", "card_id": "...", "name": "..."}]},
}
```
- `instance_id` 规则：`f"h_{player}_{index}"`（index = 手牌列表下标）。手牌变化后 index 会变，
  前端每次 action 后都会拿到完整视图，因此不要求跨 revision 稳定。
- `private_context` 仅在 `Phase.REORDER` 且 `decision_player == player` 时非空，
  `token` 用 `private_1..private_k`（**绝不暴露真实 deck index**）。同一 revision 内，
  token → 卡牌的映射必须与 `legal_action_dicts` 的 `REORDER_TOP` 一致。
- 绝不允许出现其他玩家手牌、真实牌堆、他人私有观星结果。**C4 必须写自动测试断言。**

### 1.7 卡 id / 动作类型映射表（冻结，前后端共用）

| Card 成员 | API card_id | 中文名 | category | asset |
|---|---|---|---|---|
| TRIBULATION | `TRIBULATION` | 天劫 | TRIBULATION | tribulation |
| DEFUSE | `DEFUSE` | 护劫符 | DEFUSE | defuse |
| PEEK | `STARGAZING` | 观星术 | ACTIVE | stargazing |
| REORDER | `REWRITE_FATE` | 逆天改命 | ACTIVE | rewrite_fate |
| SHUFFLE | `SHUFFLE` | 扰乱天机 | ACTIVE | shuffle |
| SKIP | `ESCAPE` | 遁术 | REACTIVE | escape |
| STEAL | `STEAL` | 摄物术 | ACTIVE | steal |
| COUNTER | `COUNTER` | 反制符 | REACTIVE | counter |

`Action.api_type()` 映射（API_CONTRACT §10-12）：

| ActionKind | api type | 说明 |
|---|---|---|
| END_TURN | `END_ACTION` | label「结束行动并抽牌」 |
| PLAY_PEEK | `PLAY_CARD` | 带 `card_instance_id`；打出后进入 `Phase.REORDER`（查看 + 改序） |
| PLAY_REORDER/PLAY_SHUFFLE | `PLAY_CARD` | 带 `card_instance_id` |
| PLAY_SKIP | `ESCAPE` | **反应牌**：仅 `Phase.COUNTER` 出现，带 `card_instance_id`（见附录 A13） |
| PLAY_STEAL | `PLAY_CARD_TARGET` | `params.target_player = {type:"enum", options:[...]}` |
| PLAY_COUNTER | `COUNTER` | 反制 = 反弹（施术者反被偷） |
| PASS_COUNTER | `PASS_COUNTER` | |
| REORDER_TOP | `REORDER_TOP` | `params.order = {type:"token_order"}` |
| REINSERT | `REINSERT_TRIBULATION` | `params.region = {type:"enum", options:[TOP,NEAR_TOP,MIDDLE,BOTTOM]}` |

`legal_action_dicts(player)` 每条结构：

```python
{"id": "a_<8位稳定哈希>", "type": "...", "label": "使用观星术", "enabled": True,
 "card_instance_id": "h_0_0" | None, "params": None | {...}}
```
- `id` 必须**在同一 revision 内稳定**（前端拿 id 提交），生成方式：
  `f"a_{blake2b(action.key().encode(), digest_size=4).hexdigest()}"`，
  `REORDER_TOP` / `REINSERT` / 多目标 `PLAY_CARD_TARGET` 的 id 需**按可选值拆成多条**：
  - `REORDER_TOP`：**一条** action，`params.order` 给出 token 枚举（提交时带 `payload.order`）。
  - `REINSERT_TRIBULATION`：**四条**，每条 `params.region.options` 只含自身区域，label 形如「回插：牌堆顶」。
  - `PLAY_CARD_TARGET`：**每个可选目标一条**，label 形如「使用摄物术 → P2」，payload 只需 `target_player`。
- 前端**只发 `action_id` + `payload`**，后端用 `(revision, action_id)` 反查真实 Action（见 §4）。

### 1.8 `game/__init__.py` 导出

```python
from .cards import Card, CardSpec, CARD_SPECS, CARD_ORDER, API_CARD_ID, card_spec
from .config import GameConfig
from .actions import Action, ActionKind
from .state import GameState, Phase
```

---

## 2. `agents/` 层（C2）

```python
# agents/base.py
class BaseAgent:
    name: str
    def act(self, state: GameState, player: int) -> Action: raise NotImplementedError

# agents/random_agent.py
class RandomAgent(BaseAgent):  __init__(self, seed: int = 0)

# agents/rule_agent.py
class RuleAgent(BaseAgent):    __init__(self, seed: int = 0)

# agents/ismcts/agent.py
class ISMCTSAgent(BaseAgent):
    __init__(self, simulations: int = 500, exploration: float = 1.4,
             max_depth: int = 250, seed: int = 0, rollout_agent: BaseAgent | None = None)

# agents/mccfr/agent.py
class MCCFRAgent(BaseAgent):
    __init__(self, trainer: "MCCFRTrainer", seed: int = 0)
    @classmethod
    def load(cls, path: str, seed: int = 0) -> "MCCFRAgent"

# agents/registry.py
AGENT_INFOS: list[dict]      # 供 GET /agents：{id,name,type,configurable,defaults?}
def parse_agent(spec: str, seed: int = 0) -> BaseAgent
# spec 语法： "random" | "rule" | "ismcts:<sims>" | "mccfr:<path.pkl>"
# 支持 "ismcts:500:1.4" 形式覆盖 exploration，缺省 1.4
```
- 所有 Agent **不得读取** `state.deck` / `state.hands[other]` / `state.known_top[other]` 做决策；
  ISMCTS 只能通过 `state.determinize_for(player, seed)` 获取可能世界。C2 需写「作弊检测」测试。
- MCCFRAgent 遇到未见 info set → 回落到 `RuleAgent`（spec §33）。
- 保留参考实现的算法定性：Single-Observer ISMCTS（教学版）、Outcome-Sampling MCCFR。

---

## 3. `training/` + `evaluation/` 层（C3）

### 3.1 `training/trainer.py`

```python
class MCCFRTrainer:
    def __init__(self, config: GameConfig, seed: int = 0, exploration: float = 0.6): ...
    regret_sum: dict[tuple, dict[str, float]]     # key = infoset_key 的 tuple
    strategy_sum: dict[tuple, dict[str, float]]
    iterations_done: int
    traversals_done: int
    def train(self, iterations: int, workers: int = 1, sync_batch: int = 1000,
              checkpoint_every: int = 0, checkpoint_prefix: str | None = None,
              log_every: int = 1000, progress: bool = True) -> None
    def average_strategy(self, state: GameState, player: int) -> dict[str, float]
    def stats(self) -> dict      # iterations/traversals/infosets/iter_per_sec/elapsed
    def save(self, path: str, strategy_only: bool = False, format: str = "v2") -> None   # §3.5
    @classmethod
    def load(cls, path: str, migrate_legacy: bool = True,
             lazy: bool | None = False) -> "MCCFRTrainer"     # 必须能读旧格式（str key 的 .pkl）
    # 信息集口径（**两个口径分开**，旧格式模型两者可能不等，不是缺陷）：
    strategy_infoset_count: int   # 平均策略表规模 = 推理时真正能查表的信息集数（MCCFRAgent 覆盖面）
    regret_infoset_count: int     # 后悔表规模（旧参考模型 169,634，策略表 433,870）
    infoset_count: int            # = strategy_infoset_count（**推理覆盖口径**，对外默认）
    lazy: bool                    # 是否懒加载（v2 部署产物，未展开成 Python dict）
```
- `save()` 默认写 v2 紧凑二进制；`save(path)` / `load(path)` 的旧调用方式继续可用
  （`strategy_only` / `format` / `lazy` 都是带默认值的关键字参数）。详见 §3.5。
- `load(..., lazy=True)` 只保留几块 bytes + 稀疏锚点，查表按需解码；
  `lazy=None` 表示自动（`strategy_only` 模型懒加载，全量模型展开）。
- **信息集口径**：`infoset_count` 一律是「推理覆盖」（= `strategy_infoset_count`）；
  想拿 regret 表规模请显式用 `regret_infoset_count`。旧格式模型两个数字不等
  （traverser 只在自己当 update-player 时写 regret，策略表覆盖所有被访问到的信息集）。
- 模型文件 = `pickle` 的 dict：`{format_version, config, seed, exploration,
  iterations_done, traversals_done, regret_sum, strategy_sum}`，`pickle.HIGHEST_PROTOCOL`。
- `load()` 需兼容参考实现产出的 `models/mccfr_2p_10k.pkl`（旧 key 为 `repr(str)`），
  读到旧格式时把 key 原样保留（字符串 key 也可正常工作），不要求迁移。
- 训练日志：中文，含 `iter/s`、信息集数量、elapsed、checkpoint 路径（spec §56）；
  同时追加机器可读 JSON 行到 `logs/train_metrics.jsonl`。
- 并行：`ProcessPoolExecutor`，批量同步近似（spec §37-38）。`workers=1` 为严格基线。
  Worker 函数必须定义在模块顶层（Windows spawn 需要可 pickle）。
- 必须支持 `resume`：`main.py train --resume <pkl> --iterations N` 在原基础上继续。

### 3.2 `training/config.py`

YAML 结构（spec §39）：

```yaml
game:   {players: 3, initial_hand: 5, max_actions_per_turn: 2, seed: 42}
training: {algorithm: mccfr, iterations: 100000, workers: 8, sync_batch: 1000,
           checkpoint_every: 10000, exploration: 0.6, log_every: 1000}
output: {model_dir: models/mccfr_3p, name: mccfr_3p_100k}
```
```python
def load_train_config(path: str) -> dict    # 校验字段、给默认值
```

### 3.3 `evaluation/`

```python
# match.py
@dataclass
class GameResult: winner_seat: int | None; decisions: int; forced_stop: bool; state: GameState
def play_game(config: GameConfig, agents: Sequence[BaseAgent], seed: int,
              verbose: bool = False, log_sink: Callable[[str], None] | None = None) -> GameResult

# tournament.py
def run_tournament(config: GameConfig, agent_specs: list[str], games: int,
                   seed: int = 0, seat_randomize: bool = True) -> dict
# 返回：{games, wins, win_rates, draws, avg_decisions, seat_win_rates,
#        ci95: {label: [lo, hi]}, decisions_histogram?}

# metrics.py
def wilson_ci(wins: int, n: int, z: float = 1.96) -> tuple[float, float]

# elo.py
class EloTable:  # update(results) / table 属性 / 中文报表
```
- 座位随机化：每局把 agent 随机分配座位，统计各座位胜率（spec §44）。
- 多人终局：`winner_seat=None` 记平局。

### 3.4 CLI（`backend/main.py`，C3 负责）

必须实现（spec §39-43、§67）：

```bash
python main.py demo   [--players 3] [--simulations 200] [--seed 42] [--agents rule ismcts:200 random]
python main.py train  [--config configs/train_2p.yaml] | [--players 3 --iterations 100000 --workers 8
                       --sync-batch 1000 --exploration 0.6 --checkpoint-every 10000
                       --out models/x.pkl] [--resume models/x.pkl]
python main.py battle --players 2 --agents mccfr:models/a.pkl ismcts:500 --games 5000 [--seed 42]
python main.py benchmark --agents rule ismcts:100 ismcts:500 --opponent random --games 500
python main.py play   [--players 3] [--seed 42]        # 终端人机对战
python main.py serve  [--host 0.0.0.0] [--port 8000] [--reload]   # 启动 FastAPI
```
- 训练/评测日志中文；`battle` 输出胜率、95% 置信区间、平均决策步数、座位胜率表。
- `serve` 用 `uvicorn app.main:app`（内部调用，勿重新造轮子）。

### 3.5 模型格式 v2（紧凑二进制）— 冻结

> 背景（实测）：同一张表（2 人 10K，433,819 信息集 / 2,354,072 条目）
> `repr` 字符串 key = 199.9 MB；紧凑 tuple key = 103.3 MB。其中 key 占 27.5 MB，
> **行数据（中文字符串动作 key + Python float）占 68.8 MB**。因此必须再加一层二进制序列化。

```python
# training/codec.py
FORMAT_VERSION = 2

def pack_infoset_key(key: tuple) -> bytes        # 变长打包，目标 ≤ 32 B/key
def unpack_infoset_key(blob: bytes) -> tuple
ACTION_ID: dict[str, int]                        # 动作 key 字符串 -> uint16
ACTION_KEY: list[str]                            # 反查表
```

容器结构（`pickle` 一个只含 `bytes`/`int`/`dict` 的扁平 dict，不含嵌套 dict-of-dict）：

```python
{
  "format_version": 2,
  "encoding": "packed-v2",
  "config": {...}, "seed": int, "exploration": float,
  "iterations_done": int, "traversals_done": int,
  "n_infosets": int,
  "action_table": [str, ...],   # 去重后的动作 key 字符串表（通常只有几十条）
  "key_blob": bytes,            # 每信息集：uint16 payload_len + 打包 key（按 key 排序，便于流式还原）
  "regret_blob": bytes,         # 每信息集：uint8 n_action + n×uint16 action_id + n×float32 regret
  "strategy_blob": bytes,       # 同上，值为平均策略
  "strategy_only": bool,        # True 时 regret_blob 为空（部署产物）
}
```

要求：

0. **动作 key 字符串必须驻留/去重**（实测：仅此一项 108 MB → 58.35 MB）。v2 里动作字符串
   只允许出现在 `action_table` 中一份，行数据只存 `uint16` id；写 v1 兼容格式时也要对
   `ACTION_KEY` 里的字符串做 `sys.intern`。
1. `MCCFRTrainer.save(path, strategy_only: bool = False)` 默认写 **v2**；
   `strategy_only=True` 时只写平均策略（部署用，最小体积）。
2. `MCCFRTrainer.load(path)` 必须同时支持 **v1（旧 plain dict，含 `repr` 字符串 key）与 v2**，
   行为一致；加载旧模型后仍可续训（内部转换为紧凑表示）。
3. `MCCFRAgent.load(path)` 支持两代格式；遇到 `strategy_only` 模型直接推理，不报错。
4. `main.py train` 增加 `--strategy-only` 与 `--format {v2,v1}`（默认 v2）；
   `main.py models`（新增）打印 `models/` 下每个模型的元信息与体积、格式、能否加载。
5. **验收指标**（以 C3 实测校准，2026-09-12；2 人 10K，433,819 信息集 / 1,177,036 条目）：
   - 现状（冻结的 `dict[tuple, dict[str,float]]` 表示）：124.0 MB（旧 repr）→ 102.5 MB（紧凑 tuple）
     → **61.2 MB（+动作 key 池化）**。该表示的地板约 40–50 MB，**因此"<10MB"用现表示不可达**。
   - 二进制存储目标：**全量（regret + strategy）≤ 30 MB**、**仅策略（部署产物）≤ 20 MB**、
     每信息集 ≤ 60 B（全量）/ ≤ 45 B（仅策略）。
   - 加载耗时**按用途拆开**（本地 SSD，2026-09-12 细化）：
     **懒加载（部署/首请求路径，`load(..., lazy=True)`）≤ 5 s** 是硬指标（实测 0.01~0.15 s）；
     **全量展开（训练/续训路径，`load(..., lazy=False)`）≤ 10 s**（实测 1.9~2.8 s 干净进程）。
     理由：两条路径用途完全不同——部署只看懒加载；续训要展开成 Python dict，是固有成本。
     **注意**：全量展开的墙钟时间与「进程内存状态」强相关（同一份仅策略模型：
     干净子进程 1.9 s；进程里已展开过一张 43 万信息集的表时 8.8 s；此时还叠加 CPU 争用
     可达 36 s），因为它要一次性建 ~200 万个 Python 对象。为此 `codec.unpack_tables()`
     在解码期间临时关闭循环 GC（这些对象无引用环，纯引用计数足够），把「脏进程」下的
     载入从 29.4 s 降到 8.8 s。压测/CI 请**单独跑**这一项。
   - round-trip 后 regret/strategy 数值与 Python dict 版本逐项一致（float32 允许 1e-6 误差）。
6. **规模定律（必须写进 README/RUNBOOK）**：信息集数量 ≈ **42 个/迭代**（10K → 43 万），
   近似线性增长 → 100K ≈ 420 万信息集、1M ≈ 4200 万。体积与内存同步放大：
   **100K 全量约 600 MB（现表示）**，二进制后约 200 MB 量级。要真正规模化必须做状态抽象 /
   相似信息集合并（spec §33、§61 问题 6），而不是继续堆迭代数。
7. 测试：`test_training_codec.py`（round-trip、越界 key、空表、动作表去重）、
   `test_training_format.py`（v1/v2 互读、`strategy_only` 推理、体积断言）。

---

## 4. `app/` 层（C4）：FastAPI

严格实现 `docs/API_CONTRACT.md` 全部接口：

```text
GET    /api/v1/health
GET    /api/v1/agents
GET    /api/v1/cards
POST   /api/v1/games
GET    /api/v1/games/{game_id}
POST   /api/v1/games/{game_id}/actions
DELETE /api/v1/games/{game_id}
```

### 4.1 关键服务层约定

```python
# app/services/game_session.py
class GameSession:
    game_id: str
    revision: int                       # 每次状态变化 +1
    human_player_id: int | None
    def view_for(self, player: int) -> dict          # GameView（含 observation/public/legal_actions/events）
    def act(self, action_id: str, payload: dict, revision: int) -> dict
    def run_ai_until_human(self) -> None             # AI 连续行动到人类决策点/终局
    def is_terminal(self) -> bool
    def destroy(self) -> None

# app/services/agent_factory.py
def build_agent(spec: dict, seed: int) -> BaseAgent      # {"type":"ismcts","simulations":500}
def agent_spec_from_request(req_agent: dict | None) -> str   # 转 "ismcts:500" / "mccfr:models/x.pkl"

# app/services/model_registry.py
class ModelRegistry:      # lazy load + 内存缓存，不每次请求读盘
    def get_trainer(self, path: str) -> MCCFRTrainer
```
**响应字段严格白名单（冻结，测试与实现都以此为准）**：

```text
GameView 顶层（12）:
  game_id, status, revision, viewer_player_id, phase, current_player,
  decision_player, observation, public, legal_actions, events, winner

observation（5）:
  hand, known_top, actions_used, max_actions_per_turn, private_context
    hand[]                  -> instance_id, card_id, name
    known_top[]             -> position, card_id, name
    private_context.cards[] -> token, card_id, name

public（5）:
  round, deck_count, discard_count, players, turn_no
public.players[]（7）:
  player_id, name, alive, hand_count, is_current, is_decision_player, agent

legal_actions[]（6）:
  id, type, label, enabled, card_instance_id, params
```

- **不得新增即兴字段**。`deck_size` / `hand_sizes` / `alive` 这类重复信息一律不放在 `public` 顶层：
  牌堆数量用 `deck_count`、手牌数用 `players[].hand_count`、存活用 `players[].alive`。
- 上游 `GameState.observation(player)` 已严格只返回 observation 那 5 个键，app 层**只做投影、不加字段**。
- session 存在进程内存 `dict[str, GameSession]`，含 TTL（默认 3600s）、最大 session 数、
  空闲清理（`SESSION_TTL_SECONDS` / `MAX_SESSIONS` 环境变量）。
- `GameSession` 内部维护 `{action_id: Action}` 映射，**每次 revision 变化重建**；
  提交时校验 `revision` 匹配（不匹配 → 409 `STALE_REVISION`）+ 动作仍合法。
- 事件流：`GameSession` 用 `state.logs` 之外的**结构化事件**驱动动画。约定事件类型见
  API_CONTRACT §13；每种状态变化必须产出至少一条事件。事件必须是「该 viewer 可见」的信息
  （他人观星只发 `CARD_PLAYED`，不带牌面）。
- 错误格式统一 `{"error": {"code","message","details"}}`；状态码按 API_CONTRACT §3。

### 4.2 环境变量（`app/core/config.py`）

```text
APP_ENV, CORS_ORIGINS, DEFAULT_ISMCTS_SIMULATIONS=500, MODEL_DIR=models,
SESSION_TTL_SECONDS=3600, MAX_SESSIONS=200, ISMCTS_MAX_SIMULATIONS=2000
```

---

## 5. `frontend/` 层（C1）：Expo

- 技术栈（FRONTEND_GUIDE §1）：Expo SDK（latest 稳定版）+ TypeScript + expo-router +
  Zustand + react-native-reanimated + react-native-gesture-handler + expo-image +
  expo-linear-gradient。**不要引入 Skia / 游戏引擎。**
- 页面（**注意：Expo SDK 57 默认模板的路由目录是 `frontend/src/app/`**，不是 `app/`）：
  `src/app/_layout.tsx`、`src/app/index.tsx`(Home)、`src/app/setup.tsx`、`src/app/battle.tsx`、
  `src/app/cards.tsx`、`src/app/result.tsx`（`src/app/ai-lab.tsx` 可做但允许 disabled 占位）。
- 组件目录按 TECH_ARCHITECTURE §6（同样落在 `src/` 下）：`src/api/{client,game,mock}.ts`、
  `src/components/{game-card,player-panel,deck-pile,action-bar,dialogs}`、`src/store/game-store.ts`、
  `src/theme/`、`src/types/`。
- 设计 token（FRONTEND_GUIDE §3，冻结）：`background #06191B`、`surface #0B2929`、
  `jade #1C716B`、`jadeLight #57B3A4`、`gold #C9A65A`、`goldLight #E3CC91`、
  `paper #E8DEC5`、`danger #A4423D`、`text #F0E8D2`、`muted #91A6A0`。
- 铁律：
  1. 所有按钮/可点击卡牌由 **`legal_actions`** 驱动，前端**不得**自己判断规则合法性；
  2. 不发 `fetch()` 到页面里，统一走 `src/api/client.ts`（`EXPO_PUBLIC_API_BASE_URL`）；
  3. 提交动作带 `revision`，提交期间 lock input，收到 events 后按序播放再 unlock；
  4. 特殊 Phase 拆成独立弹窗组件，不塞进 `battle.tsx`；
  5. 响应式：`SafeAreaView` + `useWindowDimensions()`，不硬编码绝对像素；
  6. 无后端时可用 mock GameView 渲染（`src/api/mock.ts`），但代码路径与真后端一致。
- 验证（C1 必须自己跑通并给出命令输出）：
  ```bash
  cd D:/Documents/Hermes/xiuxian-card/frontend
  npx tsc --noEmit
  npx expo export --platform web --output-dir dist
  ```
  web 导出成功即视为「可运行」证据；同时用 `npx expo start --web` 可人工查看。

---

## 6. 主控 Agent 负责（不由子 Agent 承担）

- `docs/INTERFACES.md`（本文件）、`.gitignore`、`README.md`、`.env.example`
- 跨模块测试（黄金种子一致性、隐藏信息泄漏、完整一局 E2E、并发/重复提交）
- 前端 ↔ 后端真机联调脚本与最终验收

---

## 附录 A：已裁决的契约歧义（主控，2026-09-12）

| # | 歧义 | 裁决 |
|---|---|---|
| A1 | `GameConfig.deck_composition` 是整体替换还是部分覆盖？ | **部分覆盖**：只覆盖给出的键，未给出的仍按默认线性缩放。 |
| A2 | `legal_action_dicts()` 的 `REORDER_TOP` 折叠成一条，但 `legal_actions()` 会返回 k! 个排列 | **保持折叠**：该条 `legal_action_dicts` 条目用恒等排列作为稳定 id，前端提交 `payload.order`（token 顺序），后端用 `state.action_from_dict(entry, payload)` 还原真实 `Action`。 |
| A3 | `AGENT_INFOS` 中 mccfr 的 `defaults.model` | 允许为 `None`（仓库内没有模型文件时 `GET /agents` 退化为通用条目，不得报错）。有 `models/index.json` 时以其中条目为准。 |
| A4 | `public_state(player)` 的 `player` 参数对返回内容无影响 | 保留参数以对齐签名（公共信息对所有 viewer 一致），实现可忽略该参数。 |
| A5 | 上游 `GameState.public_state()` 起初额外返回 `deck_size/hand_sizes/alive` | **删除**：`public_state()` 严格 5 键（见 §4.1 白名单）；需要这些字段的调试代码请用 `debug_public_state()`。 |
| A6 | `main.py play` 的渲染函数曾读取被删除的 `hand_sizes/alive/deck_size` | 已改为读契约字段（`public.players[].hand_count/alive` + `public.deck_count`）。**契约字段被收紧时，必须全仓 grep 旧字段名**。 |
| A7 | `POST /games` 里 mccfr 座位如何引用模型 | 允许三种写法：`model` / `path`（文件路径）、`id` / `model_id`（**`GET /agents` 返回的模型条目 id**，由 `ModelRegistry` 解析成路径）。未知 id → 400 `INVALID_AGENT`，且错误信息里**必须列出可用 id 与刷新命令**（`python main.py models --write-index`）。`GET /agents` 的模型条目额外透出 `players` / `iterations`，供前端按人数过滤。 |
| A8 | 模型格式 v2 的载入耗时预算 | 拆成两条按用途区分：**懒加载 ≤5s**（部署/首请求路径，实测 0.01~0.15s）；**全量 eager ≤10s**（续训路径，实测 2.5s）。服务端 `ModelRegistry` 必须用 `MCCFRTrainer.load(path, lazy=None)`（自动），否则仅策略模型首次加载要 11s+。 |
| A9 | `infoset_count` 的口径 | 语义定为**推理覆盖面**（= 策略表规模）；同时暴露 `strategy_infoset_count` / `regret_infoset_count`。旧格式模型两者不等（如 433,870 vs 169,634），属正常现象，`main.py models` 展示策略表口径并在不等时提示。 |
| A10 | 模型人数 ≠ 对局人数 | **不拒绝请求**（保留对照实验自由），但必须显式暴露：`public.players[].agent` 里带 `model_players` / `game_players` / `players_mismatch`，并写中文 WARNING 日志（含对应训练命令）。原因：跨人数键空间不重叠，静默退化到 RuleAgent 最危险。 |
| A11 | 动作空间是**牌类型级**而非实例级 | 引擎 `legal_actions()` 用 `if Card.PEEK in hand` 这种类型判断（与参考实现一致，为保住「同种子 2815 步零差异」**不改引擎**）：手里有两张同名牌时 `legal_actions` 只有**一条** `PLAY_CARD`，`card_instance_id` 指向**第一个匹配实例**（实测 seed=4：手牌 `h_0_2`/`h_0_4` 均为 STARGAZING，动作只给 `h_0_2`）。**约定**：消费方必须把同 `card_id` 的其它实例视为同样可打（前端 `actionsForCard` 已做此兜底），否则第二张会被误标「不可用」。若将来改成实例级动作，须同步重训模型 + 更新参考实现对照测试。 |
| A12 | 手牌实例 id 是**位置性**的 | 形如 `h_<player>_<index>`；出牌/抽牌后整手牌重新编号（实测：打掉 index 2 后原 `h_0_3`/`h_0_4` 变为 `h_0_2`/`h_0_3`），`legal_actions[].id` 也随之变化。⇒ 前端不得跨 revision 缓存 `instance_id` / `action_id`，提交必须带 `revision`（旧 revision 一律 409）。 |
| A13 | 卡牌规则按**用户提供的前端参考原型文案**调整，与只读参考实现 `reference/xiuxian_ai_demo` 的旧规则**有意偏离**（2026-09-13 用户裁决：卡牌功能以原型文案为准） | 三条：① **观星术** `PLAY_PEEK` = 查看 + 改序（打出后进入 `Phase.REORDER`，复用 `private_1..k` token 机制，与逆天改命同一条决策）；② **遁术** 从「行动阶段主动跳过抽牌」改为 `Phase.COUNTER` 的**反应牌**（api type 由 `PLAY_CARD` 改为 `ESCAPE`），效果 =「该法术完全无效 + 立即结束本次结算（施术者按 `_advance_turn_from` 推进、不抽牌）」，遁术与已打出的摄物术都进弃牌堆；③ **反制符** 从「取消」改为**反弹**（原目标反偷原施术者 1 张手牌，反制链深度仍固定 1）。枚举**表面**不变（`ActionKind.PLAY_SKIP` 名称与中文 value 保持，`Phase` 不新增成员 ⇒ 信息集 phase 序号 0..4 不变），偏离的是语义与 `API_ACTION_TYPE`。事件流：新增 `ESCAPE_DODGED`；`COUNTER_USED` 带 `data.redirected=true`/`data.stolen`，反弹时补一条 `CARD_STOLEN`(`data.redirected=true`, `actor`=反弹方)；`TURN_SKIPPED` 保留但不再产生。⇒ **已训 MCCFR 模型部分失效**（旧规则下的信息集/动作语义不再命中），需重训；`tests/test_game_reference_parity.py` 改为「只对未改动分支零差异 + 偏离白名单」，实现清单见 `docs/CARD_RULES_DELTA.md`。 |

| A14 | 后端 `phase` 的**线上值与前端内部枚举名不同**，前端曾因此静默降级 | 后端 `PHASE_API_NAME`（`game/state.py`）发 `ACTION` / `COUNTER` / **`REORDER_TOP`** / **`REINSERT_TRIBULATION`** / `ENDED`；前端内部 `Phase` 是 `ACTION`/`COUNTER`/`REORDER`/`REINSERT`/`ENDED`。曾用「白名单包含即用，否则回落 `ACTION`」实现 ⇒ `REORDER_TOP`/`REINSERT_TRIBULATION` **永远匹配不上**，按 phase 驱动的排序/回插弹窗在真后端下永不弹出（mock 因自带内部名而掩盖）。**约定**：`src/api/game.ts` 必须用**显式映射表**（`PHASE_FROM_API`）转换，且新增 phase 时两端同步；判断「该弹窗该不该出现」一律以 `legal_actions` 为准，`phase` 只用于文案。 |

| A15 | 反应牌在 `KIND_TO_CARD` 里要不要登记（`PLAY_COUNTER` / `PLAY_SKIP`） | **要**。`KIND_TO_CARD` 不能只收「主动牌」：它同时决定 ① `legal_action_dicts()` 给动作条目带不带 `card_instance_id` ② 事件层补不补 `CARD_PLAYED`。此前只登记了 `PLAY_SKIP`（遁术）而漏了 `PLAY_COUNTER`（反制符），后果是两处不一致：反制符条目 `card_instance_id=null`（遁术有句柄），且**不发** `CARD_PLAYED(COUNTER)`——而契约 §13 / A13 都规定「反制 = `CARD_PLAYED`(COUNTER) → `COUNTER_USED` → …」，离线 mock 反而照契约发了。已补上。**安全性依据**：动作合法性由 `Phase` 把关（`legal_actions()` 里 `phase == Phase.COUNTER` 才给这两条），且 `_step_action` 遇到 `PLAY_COUNTER` 会落到 `raise RuntimeError("未处理动作")`——所以登记它不会让反应牌变成可主动使用。改这张表时**必须同时检查它的反表 `CARD_TO_KIND` 的消费点**（`action_from_dict()` 用它从牌句柄反推动作）。 |

---

## 变更记录

| 日期 | 变更 | 理由 |
|---|---|---|
| 2026-09-12 | 初版冻结 | 多 Agent 并行开发基线 |
| 2026-09-12 | 新增 §3.5 模型格式 v2（紧凑二进制） | 实测 108 MB → 目标 ≤30 MB；key 编码只解决 1/2 体积 |
| 2026-09-12 | 新增 §4.1 响应字段严格白名单 | 上游/实现各自加字段导致泄漏面扩大与契约漂移 |
| 2026-09-12 | 新增附录 A 歧义裁决 | 多 Agent 并行时同名信息出现两种命名（`deck_size` vs `deck_count`）等 |
| 2026-09-12 | §3.5 载入预算拆成「懒加载 ≤5 s（部署/首请求）/ 全量展开 ≤10 s（续训）」 | 两种路径用途不同；且实测全量展开的墙钟时间主要受进程内存状态与 CPU 争用影响，原一刀切的 5 s 口径会得出误导性结论 |
| 2026-09-13 | 附录 A13：三张卡牌规则按用户提供的前端原型文案调整（观星术 + 改序 / 遁术 → 反应牌 / 反制符 取消 → 反弹），同步 §1.1 §1.3 §1.7 与 `docs/API_CONTRACT.md` §12.3 §12.4 §13 §14 §18 | 用户裁决「卡牌功能以原型文案为准」；参考实现只读、不跟随，故必须显式记录**有意偏离**并收窄对照测试口径 |
| 2026-09-13 | 附录 A14：后端 `phase` 线上值与前端内部枚举名必须显式映射（`REORDER_TOP`/`REINSERT_TRIBULATION`） | 前端白名单式转换把两个阶段静默回落成 `ACTION`，导致真后端下排序/回插弹窗永不出现（mock 掩盖了该问题） |
| 2026-09-13 | 附录 A15：反应牌也要登记进 `KIND_TO_CARD`（补 `PLAY_COUNTER`） | 实现与契约 §13/A13 不一致：真后端不发 `CARD_PLAYED`(反制符)、且反制符条目的 `card_instance_id` 为 null，而 mock 照契约发了——同一类「mock 与真后端漂移」问题 |
| 2026-09-13 | 事件合成：化解天劫那一步不再发 `TURN_ENDED`（`if not defused:` 守卫） | 同一回合出现两条 `TURN_ENDED`（实测 6 条 / 5 回合）；回合真正推进在提交回插位置之后，判定依据是 `turn_no`/`current_player` 而非日志 |

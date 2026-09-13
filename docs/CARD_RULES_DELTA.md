# 卡牌规则差异与引擎改动清单

> 依据：用户提供的参考前端 `D:\Downloads\前端页面`（`lib/game-data.ts` 的 `effect` 文案 + `GameApp.tsx` 的
> `CARD_MODAL` 交互映射）。**用户裁决：以参考原型的卡牌描述为准 → 需要改引擎规则。**
> 本文档列出「改哪几条 / 为什么 / 影响哪些测试与资产」，实施前冻结。
>
> **状态：已于 2026-09-13 实施完毕**（引擎 + 事件流 + 文档 + 全量回归）。
> 实际落地细节、事件序列、受影响测试与模型失效评估见 **§7 实施记录**；
> 裁决记录见 `docs/INTERFACES.md` 附录 **A13**。

## 1. 逐张牌对照（原型文案 vs 引擎现状）

| # | 牌 | 原型文案（以此为准） | 引擎现状（`game/cards.py` + `game/state.py`） | 结论 |
|---|---|---|---|---|
| 1 | 天劫 | 天劫降临，所有未持有护劫符的修士将承受劫数。渡劫失败者道消身殒 | 抽到天劫者若无护劫符则立即淘汰；天劫不进手牌 | **不改**（原型措辞含糊，机制等价） |
| 2 | 护劫符 | 抵挡一次天劫。使用后需将天劫秘密回插至牌堆的指定位置 | 抽到天劫时自动消耗，随后进入 `REINSERT` 阶段选 `TOP/NEAR_TOP/MIDDLE/BOTTOM` | **不改引擎**（结果一致）；**前端入口对齐**：原型是手牌点「使用」→ 回插弹窗，引擎是抽到天劫时自动进入该弹窗 |
| 3 | 观星术 | 查看牌堆顶部最多 3 张牌，**并重新调整顺序** | `PLAY_PEEK`：只写 `known_top[p]`，**不能改序**（动作结束） | ❗**改**：观星术 = 查看 + 改序（与逆天改命同一条 `REORDER` 决策） |
| 4 | 逆天改命 | 查看顶部最多 3 张牌并调整顺序 | `PLAY_REORDER` → `Phase.REORDER`，`private_1..k` token 提交排列 | **不改**（已一致） |
| 5 | 扰乱天机 | 打乱牌堆**顶部**的顺序，令天机不可窥探 | `PLAY_SHUFFLE`：整副牌堆洗牌，全体 `known_top` 失效 | ⚠️**待确认**：原型说「顶部」，引擎洗整副。我倾向**保持整副**（洗整副才真正令天机不可窥探），若你要只洗顶部需给一个 k 值 |
| 6 | 遁术 | **避开一次指向你的法术，并立即结束当前结算** | `PLAY_SKIP`：立即结束自己的回合且本回合不抽牌 | ❗**改**：从「主动跳过抽牌」改为**反应牌**（被法术指向时使用，使该法术无效并结束本次结算） |
| 7 | 摄物术 | 选择一名存活修士，随机夺取其一张手牌 | `PLAY_STEAL` + `Phase.COUNTER` 反制窗口 | **不改**（已一致） |
| 8 | 反制符 | 反制一次指向你的法术，**令其效果转向施术者** | 反制 = **取消**该次摄物术（反制链深度固定 1） | ❗**改**：取消 → **反弹**（被反制时，原目标反过来偷施术者一张牌） |

**需要动引擎的是 3 条：#3 观星术（+改序）、#6 遁术（改为反应/躲法术）、#8 反制符（取消→反弹）**；
#5 扰乱天机待你确认范围；#2 护劫符只改前端入口。

## 2. 改动细案（**已实施**，逐条落地细节见 §7）

### 2.1 观星术 `PLAY_PEEK` → 进入排序决策（已实施）
- `Card.PEEK` 打出后：`known_top[p] = deck[:3]` 之后**不再直接结束动作**，而是进入 `Phase.REORDER`
  （与 `PLAY_REORDER` 相同的私有 token 机制：`private_1..k` → 提交排列）。
- 差异保留：观星术**最多看 3 张**、逆天改命同理；两者区别仅剩名称与美术（原型的文案本就相同）。
  ⚠ **设计提示**：改完后「观星术」与「逆天改命」在规则上完全等价。若你希望二者仍有区别，
  可考虑「观星术只能看不能改序」或「观星术看 3 张、逆天改命看 5 张」——需要你定。
  （**未决**，当前按原型实现为完全等价。）
- `actions_used` 仍记 1 次；`REORDER` 决策不计入行动数（与逆天改命一致）。

### 2.2 遁术 `PLAY_SKIP` → 反应牌（躲法术）（**已实施**）
- 新增反应窗口：当有法术**指向**某玩家时（当前只有摄物术），该玩家在 `Phase.COUNTER` 阶段
  除「反制符 / 不反制」外，若手牌有遁术，可新增选项「遁术（避开并结束结算）」。
- 选遁术 → 该法术**完全无效**（不偷牌、不进弃牌堆？→ **建议：遁术进弃牌堆，摄物术也进弃牌堆**），
  然后立刻结束本次结算（施术者的回合结束，或按 `_advance_turn_from` 推进）。
- 原 `PLAY_SKIP`（主动跳过抽牌）**删除**还是保留？→ **建议删除**（原型里它是防御牌，不是主动跳过抽牌），
  这样 `Card.SKIP` 从主动牌变成反应牌，`CardSpec.category` 从 `ACTIVE` 改 `REACTIVE`。
- ⚠️ 这条改动最大：它改变阶段机（新增一种 COUNTER 内的选项），并让「遁术」与「反制符」都成为反应牌。

### 2.3 反制符 取消 → 反弹（**已实施**）
- 被反制时：原施术者的摄物术**转向他自己** → 从**施术者**手中随机夺一张牌给**原目标**。
- 事件流需新增/调整：`COUNTER_USED` 后应能看出「效果反弹」（可加 `data.redirected=true`）。
- 反制链深度仍固定 1（不能反制反制），与原型的「反制一次」一致。

## 3. 影响面（改动会波及什么）

| 层 | 影响 |
|---|---|
| 状态机 `game/state.py` | `legal_actions()` 的动作集合、`step()` 分支、`Phase` 枚举（可能新增 `DODGE` 或扩展 `COUNTER`） |
| 信息集编码 `game/infoset.py` | key 含 `phase` 与 `actions_used`、`pending`；**新增阶段会改变 phase 序号/编码** |
| 事件流 `app/services/events.py` | `COUNTER_USED` 语义变化（反弹）、遁术新增事件 |
| HTTP 契约 `docs/API_CONTRACT.md` / `docs/INTERFACES.md` | `GET /cards` 的 3 条 `description` 与 `category` 变更；`legal_actions` 新增动作类型 |
| **训练产物**（重要） | MCCFR 信息集 key 含 phase/动作空间：**本次改动会使现有 2 人 / 3 人模型部分或全部失效**（未覆盖到新分支 → 命中率下降、回落 RuleAgent）。改规则后建议重训 |
| 参考实现对照 | `tests/test_game_reference_parity.py` 的「与参考实现同种子 2815 步零差异」**必然失败**：参考实现是旧规则。需改为「仅对未改动部分保持零差异」或降级为历史锚点 |

## 4. 受影响的测试文件（我会逐一修，不改断言期望值以外的东西）

| 测试 | 预计影响 |
|---|---|
| `tests/test_game_reference_parity.py` | ❗**必失败**（旧规则对照）→ 改为仅覆盖未改动的牌型分支，并在文件头写明「这是有意的规则偏离」 |
| `tests/test_game_cards.py` | 观星术/遁术/反制符的行为断言需要按新规则重写 |
| `tests/test_game_actions.py` | 动作集合（`COUNTER` 阶段多出「遁术」选项、观星术后进入 `REORDER`） |
| `tests/test_game_infoset.py` | 信息集 key 结构（若新增 phase） |
| `tests/test_game_observation.py` | `known_top` / `private_context` 在观星术后进入排序决策的变化 |
| `tests/test_agents_legal.py` | AI 只许选 legal 动作（新动作自动覆盖，但断言用例要补） |
| `tests/test_api_game_flow.py` / `test_api_privacy.py` / `test_api_support.py` | 事件与阶段的字段断言 |
| `tests/test_game_clone_reset.py` | 新增阶段后的 clone/reset 一致性 |
| `scripts/e2e_api.py` | 4 类特殊决策的覆盖（可能会新增第 5 类：遁术反应） |
| `docs/API_CONTRACT.md` §13 事件表 / §1.7 卡牌表 | 文案与类型同步 |
| 前端 | 卡牌交互矩阵（见下方 §5） |

## 5. 前端卡牌交互矩阵（原型 `CARD_MODAL` + 引擎真实阶段）

| 牌 | 交互 | 触发时机 |
|---|---|---|
| 摄物术 | 选目标弹窗（头像 + 手牌数 + 确认） | 主动使用 |
| 反制符 | 反制弹窗（红调，大字卡面，不反制 / 使用反制符） | 被摄物术指向时的 `COUNTER` 阶段 |
| **遁术（新）** | 同上反制弹窗的第二选项「遁术：避开并结束结算」 | 同上 `COUNTER` 阶段 |
| 观星术（改） | 排序弹窗（带序号、卡面缩略图、↑↓ 按钮 + 拖拽） | 主动使用后立即进入 |
| 逆天改命 | 排序弹窗（同上） | 主动使用后立即进入 |
| 护劫符 | 天劫回插弹窗（4 个区域 + 深度条 + 「越靠近顶部越早降临」） | 抽到天劫被护劫符化解后 |
| 天劫 | 无交互（不可打出） | — |
| 扰乱天机 | 无弹窗（确认即生效） | 主动使用 |

## 6. 建议的实施顺序

```text
1. 【你确认】§2 三条改动 + §3 的模型失效后果你是否接受   ✅ 已完成（2026-09-13 用户裁决）
2. 前端 1:1 移植（不依赖引擎改动，先做，见 docs/FRONTEND_PORT_SPEC.md）  ← 前端 4 个 agent
3. 前端接线：交互矩阵按「当前引擎」先跑通（观星术=看牌、遁术=跳过抽牌）    ← 已被本次改动取代
4. 引擎改动 + 修测试（按 §2 落地，逐条跑回归）                          ✅ 已完成（§7）
5. 前端按新规则调整交互（观星术弹窗、遁术反应选项、反制反弹文案）        ← 前端 4 个 agent
6. 全量验收 + 提交
```

> 第 3、4 步的顺序可换：若你希望规则先改，我就先做引擎。

---

## 7. 实施记录（2026-09-13，引擎已按 §2 落地）

### 7.1 实现位置（file:line）

| 规则 | 位置 | 实际做法 |
|---|---|---|
| ① 观星术 = 查看 + 改序 | `backend/game/state.py:339-352`（`_step_action` 的 `PLAY_PEEK` 分支） | 消耗 `Card.PEEK` → `actions_used += 1` → 设 `reorder_owner/reorder_view/known_top` → `reorder_card = Card.PEEK` → `phase = Phase.REORDER`。排序决策复用既有 `REORDER_TOP` + `private_1..k`，`_step_reorder`（`state.py:425-439`）按 `reorder_card` 选择日志文案「完成【观星术】/【逆天改命】」 |
| ② 遁术 = 反应牌 | 合法性 `state.py:264-273`（COUNTER 阶段三个选项）、结算 `state.py:405-411`、行动阶段禁用 `state.py:295-300`（不再提供）+ `state.py:372-374`（若被直接构造则抛错） | COUNTER 阶段：`[PASS_COUNTER] + [PLAY_COUNTER 若有反制符] + [PLAY_SKIP 若有遁术]`。选遁术 → 消耗遁术（进弃牌堆）→ 该法术完全无效 → `pending` 清空 → `_advance_turn_from(施术者)`（施术者回合结束、不抽牌）。摄物术在打出时就已进弃牌堆 |
| ③ 反制符 = 反弹 | `state.py:390-404` | 消耗反制符 → `rng.randrange` 从**施术者**手里随机拿 1 张给**原目标**；施术者空手时不发生转移（日志说明）。反制后仍回到施术者的行动阶段（`phase=ACTION`，`current_player=施术者`），反制链深度固定 1 |
| API/枚举 | `backend/game/actions.py:41`（`PLAY_SKIP -> "ESCAPE"`）、`actions.py:78`（label「使用遁术（避开并结束结算）」）、`state.py:767-769`（`action_from_dict` 的 `ESCAPE` 分支） | 枚举**表面不变**：`ActionKind.PLAY_SKIP` 名称与中文 value `"使用遁术"` 保持（`Action.key()` / `action_id` 与旧版一致），只改 api type 与语义 |
| `GET /cards` 文案 | `backend/game/cards.py:96-140` | 观星术「查看牌堆顶部最多 3 张牌，并重新调整顺序。」；遁术 `category=REACTIVE`「避开一次指向你的法术，并立即结束当前结算。」；反制符「反制一次指向你的法术，令其效果转向施术者。」；顺带把摄物术说明里的「取消」改成「反弹或遁术避开」 |

新增状态字段 `GameState.reorder_card`（`state.py:143` 声明 / `:209` clone 复制 / `:437` `:512` 清理），
只用于日志与语义区分，不进 `infoset_key()`。

### 7.2 事件序列的最终形态

- **观星术**：`CARD_PLAYED`(STARGAZING) → `DECK_PEEKED`（`private_for`=观星者，牌面只给他）→
  〔玩家提交排序后〕`DECK_REORDERED`。与逆天改命的事件形状完全一致。
- **遁术（新增事件）**：`CARD_PLAYED`(ESCAPE) → `ESCAPE_DODGED`
  （`actor` = 使用遁术者，`data = {target: 法术施术者, card_id: "STEAL", name: "摄物术"}`）→
  `TURN_ENDED`（`actor` = 施术者）→ `TURN_STARTED`（下一名存活玩家）。
  没有 `CARD_STOLEN`（法术完全无效）。
- **反制符（反弹）**：`CARD_PLAYED`(COUNTER) → `COUNTER_USED`
  （`data = {redirected: true, stolen: bool}`）→〔真的偷到牌时〕`CARD_STOLEN`
  （`actor` = 反弹方（原目标），`data = {target: 被反偷的原施术者, redirected: true}`，**不带牌面**）。
- **不反制（`PASS_COUNTER`）**：`CARD_STOLEN`（`actor` = 施术者，`data = {target: 被偷者}`）——形状**不变**，
  不额外加 `redirected` 键（前端以「键是否存在」判断方向）。
- `TURN_SKIPPED` **保留在事件枚举里但不再产生**（主动遁术已移除）；`EventKind` 由 18 种变 19 种。
  实现：`app/schemas/event.py:38`、`app/services/events.py:145-170`（遁术）与 `:172-194`（反制）。

### 7.3 受影响测试的期望值变化（只改「因为规则变了」的部分）

| 测试 | 变化 | 原因 |
|---|---|---|
| `test_game_rules.py` | `test_peek_sets_known_top_and_opens_reorder`（原 `..._to_top_three`）：phase 由 `ACTION` 改 `REORDER`，并新增「提交排列后 top3 顺序真的反转」；`test_peek_with_short_deck` 同理 | 观星术进入排序 |
| 同上 | `test_skip_ends_turn_without_drawing` **删除**，替换为 `test_escape_is_not_playable_in_action_phase` + `test_escape_dodges_steal_and_ends_settlement` | 遁术不再能主动打出 |
| 同上 | `test_steal_opens_counter_phase_and_counter_cancels` → `..._counter_redirects`（原目标不丢牌、反而得到 1 张；施术者被反偷）；新增 `test_counter_with_empty_caster_hand_steals_nothing` | 取消 → 反弹 |
| 同上 | `test_counter_chain_depth_is_one` 增补：目标有遁术时选项为 3 个；反制后施术者不再拿到反制窗口 | 反制链仍为 1 |
| 同上 | `test_max_actions_per_turn_limits_legal_actions` 改用「观星术 + 提交排列」而非「遁术结束回合」 | 遁术移除后不能再用来结束回合 |
| `test_game_actions.py` | `API_ACTION_TYPE[PLAY_SKIP]` 由 `PLAY_CARD` 改 `ESCAPE`；新增 label 断言 | api type 契约变更 |
| `test_game_cards.py` | `Card.SKIP` 的 category 由 `ACTIVE` 改 `REACTIVE`；新增 `test_card_descriptions_follow_the_prototype_text` | 文案与分类按原型 |
| `test_agents_legal.py` | `test_rule_agent_avoids_known_tribulation_with_skip` → `..._uses_peek_when_known_top_is_tribulation`（+两条新用例）；`test_rule_agent_counters_when_able` 增补遁术优先级用例；新增 `COUNTER_ESCAPE` / `PEEK_REORDER` 两个决策点参数 | RuleAgent 策略随规则调整 |
| `test_agents_no_cheat.py` | 新增「RuleAgent 选遁术时零违规」；假作弊 `DeckPeekingAgent` 的作弊点从「遁术」改「洗牌」 | 遁术不再是主动牌 |
| `test_game_infoset.py` | 新增 `test_infoset_shape_unchanged_after_card_rule_delta`（phase 序号 0..4 不变 + 观星术后 key 结构） | 明确「没有新增 phase 枚举」 |
| `test_game_observation.py` | 新增 `test_observation_private_context_after_peek` | 观星术后也要下发 `private_context` |
| `test_game_clone_reset.py` | 新增 `COUNTER_DODGE` 参数用例、反弹的 rng 对齐用例、`test_clone_copies_reorder_card_and_peek_reorder_state` | 新分支必须 clone 一致 |
| `test_api_game_flow.py` | `test_counter_and_pass_counter_decisions_over_http` 重写（`COUNTER_USED.data.redirected` / 方向反转的 `CARD_STOLEN` / 手牌反向转移）；新增 `test_escape_dodge_decision_over_http`；`test_play_card_peek_private_events` 增补「进入 REORDER_TOP 并提交排列后牌序真的变了」；新增测试辅助 `_freeze_ai()`（停 AI，让响应事件只含人类这一步） | 规则 + 事件契约变更 |
| `test_api_privacy.py` | 新增 `test_redirected_counter_keeps_stolen_card_face_private` | 反弹同样不得泄漏被偷牌面 |
| `test_api_contract.py` | `GET /cards` 断言增补 ESCAPE=REACTIVE 与三条新文案 | `GET /cards` 文案同步 |
| `test_api_support.py` | `EVENT_TYPES` 加 `ESCAPE_DODGED`；`SPECIAL_ACTION_GROUPS["COUNTER"]` 加 `ESCAPE`；`ACTION_PRIORITY` 加 `ESCAPE` | 事件与特殊决策集合变更 |
| `scripts/e2e_api.py` | 优先级表加 `ESCAPE`、`PHASE_HITS` 采集 `ESCAPE`、文档串改为「5 类特殊决策」 | 覆盖遁术反应 |
| **未改**：`test_game_rules.py` 的其余用例、`test_api_*` 的其它用例、训练/评测/CLI 测试 | 与规则无关，保持原样（不得为了让测试过而删断言） | — |

### 7.4 与参考实现对照测试的新处理（**不再声称全量零差异**）

`reference/xiuxian_ai_demo` 是只读旧规则，因此 `tests/test_game_reference_parity.py` 改为
「只对**未改动分支**逐步零差异 + 偏离白名单显式列出」：

- 白名单常量在 `tests/_game_test_utils.py`：`DEVIATION_ACTION_KINDS = {PLAY_PEEK, PLAY_SKIP, PLAY_COUNTER}`、
  `SKIP_ACTION_KEY = "使用遁术|-1|"`；
- `assert_action_parity(mine, other)`：每个决策点断言两侧合法动作的**对称差集 ⊆ {遁术}**，
  且去掉偏离牌型后的动作列表**集合与顺序完全一致**（其余任何差异都是真 bug）；
- `drive_lockstep()` 的随机选择器只在 `shared_actions()` 里挑动作 → 快照 / rng / 中文日志继续要求零差异；
- 传 agent 时两侧都套 `DeviationFilteredAgent`（它把 agent 看到的 `legal_actions()` 过滤成同一份列表，
  保证 `RandomAgent.rng.choice` / RuleAgent 的 `_find` 做出同样选择）；
- 新增正向测试 `test_intentional_deviations_are_real_and_whitelisted`：分别证明三条规则**确实**偏离
  （观星术后本仓进 REORDER 而参考实现留在 ACTION；遁术在 ACTION 阶段消失、在 COUNTER 阶段出现；
  反制后手牌反向转移，而参考实现双方都不动），避免有人把规则「修」回去还不自知；
- 实测对账能力（保留）：固定随机动作序列 **1257 步**、RandomAgent **761 步**、RuleAgent **812 步**
  逐步零差异；新旧 key 双射采样 644 个状态成立。

### 7.5 对已训模型的影响评估

- `infoset_key()` 的**结构与 phase 序号都没变**（未新增 `Phase`，`PHASE_ORDER` 仍是 0..4），
  因此旧模型文件仍能正常加载、`main.py models` 正常，不会出现格式错误或读到错误布局。
- 但**语义与可达集合变了**：ACTION 阶段不再有「使用遁术」动作（旧模型在该信息集里给它分配的概率
  变成永不使用的死权重，且旧模型的 `actions_used`/手牌分布对应的策略在缺少该动作后是失真的），
  COUNTER 阶段多了 `ESCAPE`（旧模型从未见过该动作 → 命中该信息集时给不出它，反制决策偏保守），
  REORDER 阶段多了由观星术触发的一批信息集（`known_top` 非空且 `reorder_private` 非空）。
- 实测口径：**决策命中率会下降、更多决策回落 RuleAgent**（`battle`/`benchmark` 会打 ⚠ 警告）。
  本次实测（规则改动后、**未重训**）：`main.py battle --players 2 --agents mccfr:models/v2_10k.pkl rule --games 50`
  → **决策 656 | 命中训练信息集 74（11.3%）| 回落 Rule 582（88.7%）**，胜率 54% 全部由 RuleAgent 贡献。
  文档里记录的同规模旧口径是 **15~22%**（`docs/DELIVERY.md` §训练有效性），11.3% 落在其下；
  但本次**没有**在旧引擎上做同口径 A/B（那需要回滚引擎），所以只能当「方向一致的证据」，
  不能当严格 delta。
  定性结论：**建议在规则冻结后重训 2 人 / 3 人模型**，并用同样的命令重测命中率；
  重训前不要用旧模型做「变强了没有」的实验结论。
- `CARD_ORDER` / `CARD_TO_INDEX` / 手牌计数向量等**编码常量一个都没动**（发布后不得变更），
  所以重训是「重新采样」而不是「换格式」，旧模型也不需要转换成 v1。
- 兼容性实测：`main.py models` 仍正常列出并加载全部 5 个既有模型（v2 紧凑二进制未受影响）。

### 7.6 仍未决 / 需要你拍板的点

1. **观星术 与 逆天改命 规则上完全等价**（原型文案本来就一样）：要不要给二者制造差异
   （例如逆天改命看 5 张、观星术只能看不能改序）？
2. **遁术结束结算时施术者不抽牌**：按 §2.2「立即结束本次结算」实现为 `_advance_turn_from(施术者)`，
   绕过了「结束行动必须抽 1 张」的不变量。若你认为仍应补抽 1 张，需要改 `_step_counter` 的遁术分支
   （影响面：事件流要加 `CARD_DRAWN`/天劫判定）。
3. **`TURN_SKIPPED` 是否删除**：当前保留枚举（历史日志兼容），若前端要清理可以下个版本去掉。
4. 前端需要新增 `ESCAPE_DODGED` 事件类型与「遁术」选项（`docs/API_CONTRACT.md` §12.3 §13 §14 已更新）。

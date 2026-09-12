# 交付说明（DELIVERY）

> 本文档是**交付验收依据**。所有数字均为本机实测，标注了验证方式；未验证项在 §7 明确列出。
> 更新日期：2026-09-12

## 1. 交付内容

仓库：`D:/Documents/Hermes/xiuxian-card`，远端 `github.com/Sitozzmonash/XianCardGame`（分支 `master`）。

```text
backend/     FastAPI 服务层 + 游戏引擎 + 4 种 AI + 训练/评测 CLI（纯 CPU，无深度学习依赖）
frontend/    Expo SDK 57 + React Native + TypeScript（8 个路由 + 4 个特殊决策弹窗）
docs/        交接文档 + 冻结契约 + 设计规格 + 运行手册 + 审计报告 + 本文档
scripts/     一键验收 accept.sh + 静态产物 clean-URL 服务 serve_dist.py
reference/   原始 Python Demo（只读，作为算法参考实现）
images/      视觉参考图 + 用户提供的 5 屏设计稿（2x 原图）
```

关键文档：

| 文档 | 作用 |
|---|---|
| `docs/INTERFACES.md` | **冻结契约**：签名、文件归属、响应字段白名单、已裁决歧义（附录 A1–A12） |
| `docs/API_CONTRACT.md` | HTTP 契约（前后端唯一接口依据） |
| `docs/RUNBOOK.md` | 运行手册：命令、训练耗时/体积/内存、常见问题 |
| `docs/DESIGN_SPEC.md` | 设计还原规格：逐屏结构、两套色板、**与规则冲突时的强制处理** |
| `docs/design_measurements.md` | 设计图的像素实测（脚本生成） |
| `docs/UI_AUDIT.md` | 前端一致性审计（37 条含 `file:line` 证据；§G 为处理状态） |
| `docs/FRONTEND_STATUS.md` | 前端状态与待修项 |

## 2. 快速开始

```bash
# 后端
cd backend
python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe main.py demo --players 3 --simulations 200   # 终端看一局
.venv/Scripts/python.exe main.py serve --port 8000                     # http://localhost:8000/docs

# 前端
cd frontend && npm install
cp .env.example .env          # 指向后端地址
npm start                      # 按 w 开 Web，或用 Expo Go 扫码
```

用 `uv` 的话把 `.venv/Scripts/python.exe` 换成 `uv run --with-requirements requirements.txt python`。

## 3. 验收结果（本机实测）

### 3.1 自动化测试

| 项目 | 结果 |
|---|---|
| 后端全量 pytest（**主控自己复跑**：`pytest tests -q -p no:cacheprovider`） | **393 项通过 / 0 失败**（EXIT=0；进度 393 个测试点无 F/E） |
| 覆盖重点 | 引擎与参考实现**同种子逐步对比 2815 步零差异**、AI 反作弊（不得读牌堆/他人手牌）、训练/评测/CLI、**v2 模型编解码 round-trip（键集合严格相等 + float32 容差）**、模型人数不匹配告警、FastAPI 字段白名单与隐藏信息泄漏、模型 id 解析、**测试导入卫生**（顺序无关） |
| 前端 `npx tsc --noEmit` | **0 错误** |
| 前端 `npx expo export --platform web` | 成功（8 个路由，每页标题齐全） |
| `bash scripts/accept.sh e2e` | 2 / 3 / 6 人局全部通过，且**跑完无残留进程**（脚本自己会清理） |

### 3.2 端到端（真起服务、脚本扮演人类玩家打完整局）

```bash
bash scripts/accept.sh e2e
  ✅ 后端已启动 :8033
  ✅ E2E 2 人局通过   ✅ E2E 3 人局通过   ✅ E2E 6 人局通过
```
覆盖断言：字段白名单（多一字段即失败）、他人手牌/真实牌堆/他人观星结果/上游调试日志不泄漏、
旧 revision 重复提交被 409 拒绝、revision 单调递增、AI 自动行动到人类决策点、
4 类特殊决策（反制 / 摄物术选目标 / 逆天改命排序 / 天劫回插）真实走通。

### 3.3 前端与真后端联调（无头浏览器实测，最终 UI）

链路：`expo export`（真后端地址，`--clear` 防 Metro 缓存污染）→ clean-URL 静态服务 → CDP 无头浏览器。

| 验证项 | 实测结果 |
|---|---|
| 首页接真后端 | 显示「真后端 0.1.0」+「数据源：http://127.0.0.1:8025/api/v1」，**无 JS 报错** |
| 模型清单按人数过滤 | 3 人 → 「命中 0 个 / 候选 0 个」+ 训练命令；切 2 人 → 「命中 2 个」，自动把选择重置为可用模型并弹提示 |
| `POST /games` 载荷 | `{"players":2,"human_player":0,"agents":[null,{"type":"mccfr","model":"models/v2_10k.pkl"}],"seed":null}`，契约自检通过 |
| 对局页真数据 | revision 1→14 单调递增、牌堆/弃牌堆/手牌数全为后端真值、日志逐条渲染真实事件、他人手牌只给张数 |
| 私密信息隔离 | 打出观星术后界面显示牌堆顶 1/2/3 张（`known_top`），对手侧仍为牌背 |
| 特殊决策弹窗 | 真实出现「反制」弹窗并成功提交「不反制」 |
| **完整一局到结算** | 2 人局打满 7 轮 → 结算页：渡劫失败、回合 7 / 出牌 12 / 渡劫 1、排名「1 青梧散人 存活 / 2 玄墨真人 淘汰」，胜负由后端裁定；页面底部如实标注每个数字的来源 |
| `/result` 无会话访问 | 重定向回首页（优雅降级，不编造数据） |
| 截图存证 | `docs/screenshots/design_result_real_final.png`（本局真实结算页） |

### 3.4 本次验收**发现并修复**的缺陷

| # | 缺陷 | 证据 | 修复 |
|---|---|---|---|
| 1 | **手持两张同名牌时，第二张被误标为「✕ 不可用」**（明明可打） | API 实测 seed=4：手牌 `h_0_2/h_0_4` 都是观星术，`legal_actions` 里只有一条 PLAY_CARD 且 `card_instance_id=h_0_2` | 根因：动作空间按**牌类型**生成（参考实现同款，为保持与参考实现 2815 步零差异未动引擎）→ 前端 `actionsForCard` 增加「同 card_id 实例」兜底。**实测修复后 h_0_4 显示「可」，点击→提交→revision 1→2、行动 0/2→1/2、手牌 5→4、观星效果正常显示** |
| 2 | 模型人数 ≠ 对局人数时服务端**静默通过**（HTTP 200 无提示） | `POST /games` 4 人局 + 2 人模型返回 200，无任何告警 | 服务端在 `public.players[].agent` 透出 `model_players`/`game_players`/`players_mismatch` + 中文 WARNING 日志（含对应训练命令）；**不拒绝请求**以保留对照实验自由。新增测试 5 项 |
| 3 | 服务端加载「仅策略」部署模型走 eager 路径（首次请求 11s+） | `ModelRegistry` 用默认 `lazy=False` | 改为 `lazy=None`（自动）→ 部署产物 **0.05s** 建局 |
| 4 | `POST /games` 只认模型文件路径，不认 `/agents` 返回的 `id` | 用 `id` 建局返回 400 | 请求 schema 补 `id`/`model_id` 字段 + 按 id 解析；未知 id 报错时列出可用 id 与刷新命令 |
| 5 | 验收脚本 `accept.sh` 会留下孤儿进程占端口 | 跑完 `:8033` 仍在监听 | 原写法 `( cd X && python ... & echo $! )` 的 `$!` 是子 shell PID → 改为 `pushd` + 直接后台，并加端口预检与 `taskkill` 兜底；复测无残留 |
| 6 | **真后端下战斗日志每张牌都显示「未知牌」、淘汰者显示「天机」** | 自查发现（真后端跑一局，日志出现 `玄墨真人 打出【未知牌】 · 灵光一闪`） | 根因：前端读**顶层** `event.card_id/target`，而真契约只下发 `seq/type/actor/data`（`backend/app/services/events.py:render_event`）。修：`types/event.ts` 收敛为 4 键并逐事件列出 `data` 字段表；`utils/event-log.ts` 全改从 `data` 取（`data.name` 中文牌名优先）；`api/game.ts` 删顶层映射；`SpecialDecisionLayer.tsx` 改为从前置 `CARD_PLAYED` 取牌名。**实测：`[03] 玄墨真人 打出【观星术】`，全文无「未知牌」** |
| 7 | mock 事件载荷与真后端漂移（掩盖了 #6，且 `CARD_STOLEN` 泄漏被偷的牌） | 逐事件比对 `mock.ts` 与 `events.py` | `api/mock.ts` 34 处调用点全部改为 `ev(type, actor, data)` 并对齐真契约；`CARD_STOLEN` 不再回传牌面（真后端故意不回传：谁被偷是公开的、偷到什么是私有的）；`PLAYER_ELIMINATED` 座位放 `actor`。子 agent 在 Node 里真跑两局 mock 验证：**顶层键越界 0 条、含「未知牌」日志 0 行** |
| 8 | 对局页整页底色用了**墨玉**渐变（设计与 `nightColors` 都要求夜蓝） | 截图左上角像素 = `(4,18,15)`（墨玉 `#04120F`） | `ScreenBackground` 新增 `tone="night"` 维度（走 `nightGradients.battle` + `nightColors.background`），对局页两处外壳显式指定。**实测左上角 = `(7,15,20)` = `#070F14`** |
| 9 | 同一类别两个中文名（`护劫符` / `护劫`）、`#D98C84` 裸色 6 处 | 审计报告 A2/B7 | `CATEGORY_LABELS.DEFUSE` 统一为「护劫符」并成为唯一来源；新增 `nightColors.dangerText`，6 处裸字面量 token 化（颜色值不变） |
| 10 | **测试互相污染：全量跑 30 条 CLI 测试集体 `AttributeError: module 'main' has no attribute 'main'`**（单跑同一文件却全过） | 主控最小复现：`pytest tests/test_game_reference_parity.py tests/test_main_cli_errors.py` 失败，只跑后者通过 | 根因：`tests/_game_test_utils.py` 把只读参考实现目录 `insert(0, sys.path)`，而该目录里**也有 `main.py`**，遮蔽了本仓 `backend/main.py`。修：改 `append`（本仓优先），并新增 `tests/test_import_hygiene.py` —— 断言参考实现目录必须排在 `backend/` 之后、且注入后 `import main` 仍解析到本仓。**含义：此前"343 项全绿"并不能保证测试顺序无关，CI 上可能偶发全红** |

前端一致性审计报告：**`docs/UI_AUDIT.md`**（37 条，7 高 / 14 中 / 16 低；含每条 `file:line` 证据、复现方式与建议修法；**§G 记录了本次已修 / 未修的处理状态**）。


## 4. 关键工程结论（含修正过的错误判断）

| 主题 | 结论 | 依据 |
|---|---|---|
| Information Set 编码 | 紧凑 tuple key 只值 **2.4x（仅 key 部分）/ 2.0x（整表）**；早期「降到 <10MB」的预期是错的 | 同表对照实测 |
| 模型体积 | 换存储表示（v2 二进制）后 **118 MB → 15.95 MB（约 7.4x）**；10K 训练产物 23.20 MB | `main.py models` + 对照脚本 |
| 加载性能 | 懒加载 **0.01 s**、全量 eager **2.75 s**、仅策略 eager **1.91 s**（隔离子进程、交错 3 轮取最小）。早先的 5.5/11/35.8 s 都是 CPU 争用值；eager 耗时还受**进程内存状态**支配（同一文件 1.9 s → 8.8 s），故按用途拆预算 | 隔离重测 |
| 规模定律 | 信息集 ≈ **42 个/迭代**（2 人）→ 100K ≈ 420 万，**别直接上 1M**；要规模化先做状态抽象 | 三档实测外推 |
| 3 人模型实测 | 10K → **1,159,088 信息集 / 50.84 MB / 46.0 B 每信息集**（与 2 人的 56.1 B 同量级，线性可预期；懒加载 0.02 s） | `main.py models` |
| **训练有效性** | **报胜率必须同报命中率**：10K 模型实战仅 **15~22%** 决策命中训练表，其余回落 RuleAgent —— 「MCCFR 胜率 55%」基本是 RuleAgent 打的 | `battle` 命中率报表 |
| **平均策略表的稀疏性** | 部署产物里 **62% 的信息集平均策略权重为 0**（只被对手采样到，自己没在那儿更新过）⇒ 「命中信息集」≠「查到了有意义的平均策略」，多数靠 regret-matching 兜底。仅策略产物必须 materialize 退路策略，否则会退化成均匀随机 | v2 编码实测 |
| float32 精度 | regret > 1e5 时绝对误差 ~1e-2（相对 ~1e-7），不影响策略归一化；若要「精确续训对照」需改存 float64（+2.35 MB） | 编解码 round-trip |
| 模型通用性 | **模型按玩家人数各训一份**：2 人模型进 3 人局命中率 **0%**（468 次决策 0 命中）且不报错 | 实测 + 服务端 `players_mismatch` 告警 |
| AI 不得作弊 | 任何 Agent 不得读 `state.deck` / 他人手牌；有自动测试断言 | 26 项反作弊测试 |

## 5. 训练（用户自行运行）

见 `docs/RUNBOOK.md` §2。三层阶梯：

```bash
# ① 冒烟（几秒）
"$PY" main.py train --players 2 --iterations 200 --workers 1 --out models/_smoke.pkl
# ② 严格基线（2 人 10K 实测 2 分 12 秒）
"$PY" main.py train --players 2 --iterations 10000 --workers 1 --out models/mccfr_2p_10k.pkl
# ③ 正式（4/5/6 人各训一份；一次只跑一个，每个占 8 核）
"$PY" main.py train --players 6 --iterations 20000 --workers 8 --sync-batch 1000 \
  --checkpoint-every 5000 --log-every 1000 --out models/mccfr_6p_20k.pkl
```

训练完成后刷新模型清单（前端据此列出并按人数过滤）：`"$PY" main.py models --write-index`

## 6. 设计还原

- 用户提供的 5 屏设计稿（`images/figma/`）**逐屏还原**，几何用 PIL 从 2x 原图实测（见 `docs/design_measurements.md`）。
- 实测保真度（**主控独立复测，原生 860×1864 分辨率**）：对局页底部按钮带 **828-870 vs 设计 830-872（差 2px）**；
  卡牌详情大卡面 **x95,y111,240×340 vs 设计 x95,y108,240×340（Δy=3）**；结算页名次行 **y628/686/744 完全一致**。
  整页像素差（mean |ΔRGB|/255）：**首页 50.3、对战配置 26.0**（子 agent 曾报 25.8/18.3，是把图降到 430px 后测量的乐观值，
  以本文档这组原生分辨率为准）。
- 设计稿含**两套色板**（对战配置/结算用墨玉 `colors`；首页/对局/卡牌图鉴/详情用夜蓝青瓷 `nightColors`），
  按图逐屏实现，两套都冻结在 `src/theme/colors.ts`，要统一只需改一处。
- 设计稿与冻结规则冲突处**按规则改设计**（费用位改显类型符点、牌堆用真实值、无账号处的数值标「演示」、
  无功能入口做 disabled + 「未开放」角标而非假链接），全部记录在 `docs/DESIGN_SPEC.md` §4。
- 美术资产为**从设计图裁切的临时资产**，引用集中在 `src/theme/asset-map.ts` 等三个映射文件，
  换正式美术只需替换文件。

## 7. 已知限制与未做项（如实列出）

1. **真机未验证**：Expo Go / EAS 真机安装需要设备或账号，agent 无法代验；Web 端已验证。
2. **美术为临时资产**：卡面插画/头像/背景是从设计图裁切的位图；天劫、扰乱天机、反制符三张牌
   设计稿里没有插画，用「渐变 + 符箓纹 + 印章字」占位。
3. **排序弹窗的长按拖拽**未在无头浏览器实测（无障碍 ↑/↓ 换序路径已实测可提交）。
4. **AI 泛化问题未解**：命中率 15~22% 是查表式 MCCFR 在信息集爆炸下的固有问题，
   需要状态抽象 / Hybrid（MCCFR 先验 + ISMCTS 现场搜索）才能突破，属研究课题。
5. **未实现（spec §60 / §67 明确不在本轮）**：Hybrid Agent、Champion、Historical Pool、
   Population / League / PSRO-JPSRO、Opponent Modeling、前端训练曲线可视化。
6. **多人 MCCFR 无 Nash 收敛保证**（2 人零和有保证，3 人以上只是实验型学习算法）。
7. **部署未执行**：Render / Netlify 配置已就绪（`backend/render.yaml`、`netlify.toml`），
   但需要账号凭据才能实际上线。
8. **前端一致性审计尚有未修项**（`docs/UI_AUDIT.md` §G）：最值得优先做的是
   **B1/B2「主按钮 5 套独立实现、玉绿 3 种值」**（这是跨页视觉漂移的根因，修完 B4/B5/B6/B8 会自然收敛）；
   另有 4 处触控目标 <44pt（C12）、死 token 29 个 / 死导出 12 个（C5/C6）、Expo 模板残留资产（C13）。
9. **文档间自相矛盾 4 处**（`UI_AUDIT.md` §D）：`DESIGN_SPEC` 与 `FRONTEND_GUIDE`/`INTERFACES` 在首页主标题、
   结束回合文案、绝对像素定位、`NightPanel` 去留上不一致 —— 需人工裁决（实现当前选择都是合理的，见报告）。

## 8. 建议的下一步

```text
1. 训练 3 人模型（默认对局人数）→ battle 看命中率与胜率是否随迭代上升
2. 做状态抽象 / 相似信息集合并，解决命中率低的问题（这是真正的强度瓶颈）
3. Hybrid Agent：MCCFR 给先验 + ISMCTS 现场搜索，兼顾泛化与深度
4. 按 UI_AUDIT §E 的优先级修前端一致性（先 B1/B2 按钮与玉绿收敛）
5. 替换正式美术资产（只改 3 个映射文件）
6. 上线：Render（后端）+ 静态托管（前端 Web）
```

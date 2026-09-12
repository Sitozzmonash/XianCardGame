# 前端状态（Frontend Status）

> 更新：2026-09-12。视觉层已按用户提供的设计稿实现（不再是"暂停待 Figma"）。

## 1. 页面清单

| 路由 | 页面 | 设计依据 | 色板 |
|---|---|---|---|
| `/` | 首页（个人信息条 / 主视觉 / 天劫战牌标题 / 主次按钮 / 未开放入口） | `images/figma/fig3_0.png` | 夜蓝青瓷 `nightColors` |
| `/setup` | 对战配置（人数 / 座位与对手 / AI 参数 / 开始对战） | `images/figma/fig4_0.png` | 墨玉 `colors` |
| `/battle` | 对局（对手面板 / 法阵与阶段 / 牌堆弃牌 / 手牌 / 行动条 / 日志） | `images/figma/fig3_1.png` | 夜蓝青瓷 |
| `/cards` | 卡牌图鉴（设计稿无此屏，沿用同一视觉体系） | — | 夜蓝青瓷 |
| 卡牌详情 | 卡牌详情（大卡面 / 类型 / 效果 / 引语 / 相关卡牌 / 确认使用） | `images/figma/fig3_2.png` | 夜蓝青瓷（米黄卡面） |
| `/result` | 结算（渡劫成功 / 统计三列 / 排名 / 再来一局） | `images/figma/fig4_1.png` | 墨玉 |
| `/ai-lab` | AI 实验室（真实 `GET /agents` / ISMCTS 参数 / 模型清单 / 未开放项） | 设计稿外，沿用墨玉风格 | 墨玉 |
| `/+not-found` | 404（印范式） | 设计稿外 | 墨玉 |

4 个特殊决策弹窗（独立组件）：`TargetPlayerDialog`（摄物术选目标）、`CounterDialog`（反制）、
`ReorderTopDialog`（逆天改命排序）、`ReinsertTribulationDialog`（天劫回插），
由 `SpecialDecisionLayer` 按 `phase` 调度。

## 2. 视觉资产与换皮入口

设计稿里的插画/头像/徽记从 2x 原图裁切，存 `frontend/assets/design_crops/`（15 个 PNG）。
**替换正式美术只需改这三个映射文件**：

- `src/theme/asset-map.ts`（对局页卡面与头像）
- `src/components/card-detail/card-visuals.ts`（详情页卡面缩略图）
- `src/components/{home,setup,result}/assets.ts`（首页主视觉 / 头像 / 结算徽记）

天劫、扰乱天机、反制符三张牌设计稿里没有插画，用「渐变 + 符箓纹 + 印章字」占位（`CardArt.tsx`）。

## 3. 铁律（实现中已守住）

1. 所有可点击元素由后端 `legal_actions` 驱动（含 `enabled`），前端不判断规则合法性；
2. 提交带 `revision`，提交中锁定输入；事件队列按 `seq` 播完才解锁；409 自动拉取最新局面并提示；
3. 他人手牌只给张数（牌背），牌堆/弃牌堆数字用后端真实值；
4. 结算页数据全部来自真实 `GameView`，不编造胜者；
5. 无后端时首页可切「使用演示数据」（运行期 mock），`EXPO_PUBLIC_USE_MOCK=1` 为构建期 mock。

## 4. 设计稿与规则的冲突处理

已在 `docs/DESIGN_SPEC.md` §4 冻结，实现中照做：

- 卡面「费用」位 → 改显**类型符点**（主动/反制/天劫/护劫）+ 状态角标（可/✓/✕），
  真实机制「行动 已用/上限」放 HUD；**不显示设计稿里的 1费/2费**（规则无费用）。
- 「牌堆(28)」→ 用真实 `deck_count`（3 人局 15）。
- 类型「秘术·逆天级」/品质「极品」→ 用真实 `category`，品质位隐藏。
- 「认输」→ 二次确认 + `DELETE /games/{id}` + 回首页（契约无 surrender）。
- 首页资源数字/等级 → 静态演示占位并标注「演示」。
- 「修仙之法（卡组）」「论道对战（排位赛）·赛季倒计时」→ disabled + 「未开放」角标，不做假链接。

## 5. 已知待修 / 限制

1. **真机未验证**（Expo Go / EAS 需设备或账号）；Web 端已逐屏验证。
2. 排序弹窗**长按拖拽**未在无头浏览器实测（无障碍 ↑/↓ 换序路径已实测可提交）。
3. 对局页不画 iOS 假状态栏（真机交给 `SafeAreaView`），因此 Web 截图比设计稿整体高约 40px。
4. 手牌数可变（设计稿 5 张，mock 开局 6 张）时按张数自适应缩放（比例保持 0.648）。
5. 美术为设计图裁切的临时资产，需替换为正式美术。
6. 未做 SEO/分享增强（`meta description`、`og:*`）；各路由 `<title>` 已齐全。

## 6. 验证方式

```bash
cd frontend
npx tsc --noEmit                                   # 必须 0 错误
EXPO_PUBLIC_USE_MOCK=1 npx expo export --platform web --output-dir dist-mock --clear
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8020/api/v1 npx expo export --platform web --output-dir dist-real --clear
# 逐屏截图见 docs/screenshots/（430×932 = 860×1864@2x，与设计稿同尺寸可直接比对）
```

整仓一键验收：`bash scripts/accept.sh all`（后端 pytest + API 端到端 + 前端 tsc/export + 标题检查）。

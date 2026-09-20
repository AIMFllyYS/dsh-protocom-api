# 系统性分析：模型菜单、阶跃星辰适配与设置页 UX

> 本文对应三个报告问题。结论分三类：**已确认根因**（源码级证据）、**本轮已修**、**待你提供证据后精确修复**。
> 0.3.0 已落地并通过 182 条用例；未决项只剩「阶跃星辰的二次工具报错」（需一次失败样本）与宿主侧的分组粒度问题。

---

## 0. 结论速览

| # | 问题 | 根因 | 状态 |
|---|---|---|---|
| 1a | 配了 aggregate + stepfun，底部菜单只看到 aggregate | 名录是**全局**的，每个 group 都把整份名录当自己的目录；本组真实模型被追加到 28 行之后 → 视口被第一组占满 | **已修**：目录成员改为「本 route 的 listing + 本组登记条目」 |
| 1b | 出现 128K 选项 | 未登记模型回落到 `FALLBACK_CONTEXT_WINDOW = 131072`，而 `contextChoicesFor(131072)` 返回 `[131072]`；名录里**没有任何 stepfun 条目**，所以该组每个模型都恰好是「128K」 | **已修**：回落改为梯子下限 200K；StepFun 组直接下发 200K/256K/400K/1M |
| 2a | 阶跃星辰 5 用两次后工具报错 | **未定**：报错体显示 `body.input` 期望 `str` 却收到列表，说明请求走了 responses 形状；210 条校验错误 ≈ 条目数 × union 分支数，即**我们的 input 条目匹配不上任何一种被接受的 item 类型**。需要协议配置与完整报错才能定位 | 待证据 |
| 2b | 1M 上下文 + 多模态 | 名录无 StepFun 条目 → `vision` 恒为 `false`；且 `acceptsImages` 额外要求 `protocol === 'chat-completions'`，responses 组连映射都没有 | **已修**：能力判定改为「显式设置 → 名录结论 → 默认放行」，responses 协议补上 `input_image` 映射；`step-5-preview` 已实测收录（1M + 图片 200） |
| 3 | 模型配置放到对应供应商板块 | 「模型可见性/上下文/推荐」原是一张全局卡片（且只渲染静态名录），与分组卡片分离 | **已修**：模型配置内联进每张分组卡片，原始 ID 映射折叠收起 |

---

## 1. 问题一：模型菜单显示不全 + 128K 残留

### 1.1 已确认根因

**R1（1a 主因）名录是全局的，被当成每个 group 的目录。**
`src/adapter.ts` 的 `listModels(provider)` 原来以 `REGISTRY.map(...)` 为起点——也就是把**整份名录**当作该 route 的目录，再把该 route 的真实 listing 追加在后面。于是：

- 启用 N 个分组，菜单里就有 N 份**几乎完全相同**的模型行（每份 28 个身份 × 上下文变体）；
- 每个分组的**真实模型排在最后**（listing 追加在名录之后）；
- 菜单容器是固定高度 + 滚动（`ModelSelect.module.css` 的 `.groups.scrollable`），第一组就占满视口 → 用户看到「只有开源聚合」，阶跃星辰被挤到下面很远。

**R2（1b 主因）未知模型回落 128K。**
`catalogEntry()` 对名录未收录的 id 用 `upstream.contextWindow ?? FALLBACK_CONTEXT_WINDOW`；`FALLBACK_CONTEXT_WINDOW` 是 `131_072`，而 `contextChoicesFor(131072)` 过滤后为空、于是返回 `[131072]` → 菜单出现**唯一一项「128K」**。

**R3** 名录里**没有 stepfun / grok 条目**，所以这两个分组的模型**全部**走 R2 分支——这正是「理论上都是 200K/256K/400K/1M，却显示 128K」的完整解释。

**R4（隐患）单个模型出错会让整个分组消失。**
`packages/api/session-controller/src/catalog.ts` 以 **provider 为粒度** try/catch：`Promise.all(models.map(resolveModelInfo))` 中任一模型抛错，整个分组变成 `failure`，在菜单里只剩一条警告条。

**R5（配置陷阱）`enabled` 缺省为 `false`。**
手写 `settings.yaml` 只填 `apiKey` 而不填 `enabled: true` 时，该 route **根本不注册**，菜单里自然没有它（当前工作区的 `settings.yaml` 就是这个状态：codex 有 key 但没有 `enabled`）。设置页「保存密钥」会自动启用，所以只有手改配置或从旧版本迁移时才会踩到。

### 1.2 本轮已修

1. **目录成员按 route 收敛**（`src/adapter.ts`）：成员 = 该 route 的 listing ∪ 名录中**登记为该组**的条目；listing 缺失或为空时回落到整份名录，保留「flaky listing 不能清空菜单」的保证。
2. **名录支持分组归属**（`src/model-registry.ts`）：`RegistryEntry.groups?: GroupKey[]`；未标注 = 仅作为元数据（listing 提到才出现）。`gpt-5.6-sol` / `gpt-5.6-luna` 标注为 `codex`。
3. **未知模型不再假设 128K**：`FALLBACK_CONTEXT_WINDOW` 改为梯子下限 `204_800`。
4. **分组自带上下文梯子**（`src/groups.ts`）：`GROUP_DEFAULTS.stepfun.contextLengths = [200K, 256K, 400K, 1M]`，`resolveAdapterOptions` 在部署未指定时采用；设置页也按「生效值」显示。
5. 新增 6 条回归用例（见 `test/catalog.spec.ts` 的 `per-group catalog membership`）。

### 1.3 0.3.0 追加

1. **面板改成「每组自己的菜单模型」**：删除全局可见性卡片，改为每张分组卡片内渲染 `groupCatalog()` 的结果（=适配器 `listModels` 用的同一个投影），行内四控：可见性 / 上下文档位 / 视觉 / 星标；卡片可折叠，模型列表 `max-height: 340px` 固定视口。
2. **「模型和上游 ID」折叠**：默认收起的 `<details>`，新增「端点提供」列。
3. **StepFun 实测收录**：`step-5-preview`（1M、vision、`groups: ['stepfun']`）；`REFUSED_CHAT_MODEL_IDS` 收录 8 个端点拒绝服务的 id。
4. 仍待办：补 grok 名录条目（缺模型 id）；R4 需宿主把 `catalog.ts` 的 try/catch 从 provider 粒度下沉到单模型。

---

## 2. 问题二：阶跃星辰 5 适配

### 2.1 (b) 1M 上下文与多模态：已修复并实测

- **实测（真实端点 + 你的 StepFun 凭据）**：`/v1/models` 列出 11 个 step-* id，其中只有 3 个能服务：
  | id | 文本轮 | 图片轮 |
  |---|---|---|
  | `step-5-preview` | 200 | **200（回答 "Red"，带 1M 窗口）** |
  | `step-3.7-flash` | 200 | **200（回答 "red"）** |
  | `step-router-v1` | 200 | — |
  | `step-3.5-flash` / `step-3.5-flash-2603` | 400「not enabled for the Responses API」 | 400 |
  | `step-explore` / `step-image-edit-2` / `stepaudio-2.5-*`（5 个） | 404「does not exist or you do not have access to it」 | 404 |
- **形态确认**：中转站接受 OpenAI 风格 `image_url: { url: 'data:image/png;base64,...' }`，无需上传接口。
- **代码侧**：能力判定三级（设置 → 名录 → 默认放行）；responses 协议补 `input_image`（用户消息）与 content 部件数组（带图的工具结果）；`visionModels` 提供逐模型覆盖。
- **端到端**：构建产物 + 真实凭据跑 `listModels('protocom-stepfun')` → 3 模型 × 4 档 = 12 条，全部 `text+image`；带真实 PNG 的图片轮次经适配器发出后返回 "Red"，finish = stop。

### 2.2 (a) 第二轮起必 400：根因已确认（0.4.0）

把「第二轮」拆成单变量实验后，机制完全确定：

| 实验 | 结果 |
|---|---|
| 单轮纯文本 / 首轮请求工具 | 200 |
| 回放 assistant 文本（无工具） | **400** |
| 回放 assistant 文本 + 工具调用 | **400** |
| 回放 assistant 文本 + 工具结果（两条消息） | **400** |
| 回放 `reasoning_content`（无工具） | **400** |
| 回放 content 为空、只有工具调用的 assistant + 工具结果 | 200 |
| 一轮两个并行工具调用（无 reasoning） | 200 |
| 6KB 长参数 + 流式 | 200 |
| 同一会话走 `/v1/responses` | **200** |

上游报错自证：中转站把 chat-completions 转译成 StepFun Responses 请求时，assistant 条目变成 `{"role":"assistant","content":[{"text":"…","type":"output_text"}]}` —— **没有 `type` 字段**，只能匹配要求 `content` 为字符串的 `EasyInputMessageParam` 分支，于是 `210 validation errors`（条目数 × union 分支数）。

因此：**任何回放 assistant 文本（或 reasoning）的请求都必 400**，与工具数量无关；「用两次就报错」的真实边界是「第二个请求起」。原 H1/H2 的猜测方向是对的（H1 的形状、H2 的 reasoning），H3/H4 已排除。

**修复**：`stepfun` 分组默认协议改为 `responses`（原生通道，实测含工具调用与内联图片均 200）；补齐 `response.reasoning_text.*` / `reasoning_part.*` 思考词表；`status: incomplete` 且无 `incomplete_details.reason` 按 `max-tokens` 处理；chat-completions 默认不回放 `reasoning_content`（新增 `replayReasoning`）。

**端到端验证**：step 1 拿到 `run_code {"code": "console.log(8*9)"}`（finish=tool-calls）→ step 2 回放 reasoning+text+tool-call+tool-result → 200，回答 "…computed 8*9 as 72…"，finish=stop。

### 2.3 诊断能力（0.2.0 已实现；2a 已在 0.4.0 定位，无需样本）

`DSH_PROTOCOM_CAPTURE_DIR=<dir>` 时，把每次上游请求的**序列化 body**与上游**非 2xx 的响应体**写成 `<ISO>-<status>.json`（只写 body，不写任何 header，因此不含密钥；默认关闭，含对话内容）。0.4.0 的定位没有用到它——单变量实测已经足够——但它仍是下一个上游怪癖的第一手证据来源，保留。

顺带解释你观察到的「只有超过一次工具调用才报错」：一轮里的并行调用本身是 200（实测），真正触发 400 的是**回放历史**里的 assistant 文本/reasoning；工具用得越多、轮次越多，命中就越必然。

---

## 3. 问题三：设置页 UX

### 3.1 现状

- 分组卡片：启用开关 / 密钥 / 协议标签 / 探测模型（表格）/ 余额。
- 另有一张**全局**「菜单中显示的模型」卡片：勾选可见性、选上下文档位、星标推荐。
- 底部模型菜单是**宿主**的组件（`packages/client/ui-model-selection`），插件不能改它的布局，只能决定**每个 provider 提供哪些行**。

### 3.2 0.3.0 实现（B + C 合并为一屏）

每张分组卡片 = 折叠头（分组名 / 协议标签 / 凭据圆点 / 启用开关）+ 卡片体：

1. **接入**：API key 输入 + 保存 + 状态行；
2. **选用**（B+C）：标题行「菜单中显示的模型 + 3 个模型 · 12 个菜单项」+「刷新模型」+「全部显示 / 全部隐藏」+ 筛选框（>8 行时出现）+ 固定高度滚动视口，每行 = 可见性勾选 / 模型名 / 思考标记 / 上下文档位分段控件 / 视觉开关 / 星标；
3. **诊断**：默认收起的 `<details>`「模型和上游 ID」，含「端点提供」列；
4. **余额**：原样保留在卡片底部。

- **数据来源**：面板不再用静态名录，而是对自己那条 route 调用 `discoverModels({ provider })`（页面加载时对该组自动探测一次，条件为「已启用 + 凭据已配置」），再经 `groupCatalog()` 投影——与适配器 `listModels` 完全同一条路径。
- **全局卡片**：已删除（其功能全部内联到分组卡片）。
- **为什么以前只能配「开源聚合」**：全局卡片渲染的是 `modelIdentities()`（静态名录），而名录里没有 stepfun / grok 条目 → 那两个分组**一行都没有**。

### 3.3 固定高度约束

分组卡片的模型区是唯一会随数据增长的容器，已固定为 `max-height: 340px` + `overflow-y: auto`（与改造前同一数值）；卡片体其余部分行数固定，因此整卡高度不随模型数量变化。折叠头可以随时把整卡收起。

---

## 4. 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 1a/1b 的目录收敛 + 分组梯子 + 未知模型 200K | ✅ 0.2.0 |
| M2 | StepFun 名录条目（1M + vision）+ 多模态打通与实测 | ✅ 0.3.0（`step-5-preview` 收录；`step-3.7-flash` 走默认放行）；**Grok 仍缺模型 id** |
| M3 | 2a 定位与修复 | ✅ 0.4.0（根因：chat 门面转译 + reasoning 回放；stepfun 改走 responses 通道，端到端实测通过） |
| M4 | 设置页 B+C 改造（固定高度） | ✅ 0.3.0（本轮） |
| M5 | 宿主 issue：`catalog.ts` 的 provider 粒度 try/catch 下沉到单模型 | ⏳ 需在宿主仓库提 issue |

---

## 5. 还需要你提供的信息

1. ~~2a 的失败样本~~ **已不需要**：根因实测确认并修复（§2.2）。若更新后仍遇到 400，请开 `DSH_PROTOCOM_CAPTURE_DIR` 抓一份，那份样本会直接指出新的形状。
2. **更新后请重点试**：阶跃星辰分组连续多轮对话 + 连续工具调用（这是原先必挂的路径）；顺带确认思考内容在界面上正常流式显示。
3. **Grok 与其它分组的模型 id**：需要 `/v1/models` 里对应分组的返回，才能补名录条目（1M / vision / 思考词表）。
4. 顺带发现（与本轮无关但影响你）：**你的 aggregate key 当前被端点拒绝（401）**，所以开源聚合组的菜单走的是名录回落；Codex key 同样 401。需要更新这两把 key。

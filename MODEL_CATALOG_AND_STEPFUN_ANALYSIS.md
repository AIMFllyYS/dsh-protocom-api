# 系统性分析：模型菜单、阶跃星辰适配与设置页 UX

> 本文对应三个报告问题。结论分三类：**已确认根因**（源码级证据）、**本轮已修**、**待你提供证据后精确修复**。
> 本轮改动已落地并通过 155 条用例；未决项集中在「阶跃星辰 5 的二次工具报错」。

---

## 0. 结论速览

| # | 问题 | 根因 | 状态 |
|---|---|---|---|
| 1a | 配了 aggregate + stepfun，底部菜单只看到 aggregate | 名录是**全局**的，每个 group 都把整份名录当自己的目录；本组真实模型被追加到 28 行之后 → 视口被第一组占满 | **已修**：目录成员改为「本 route 的 listing + 本组登记条目」 |
| 1b | 出现 128K 选项 | 未登记模型回落到 `FALLBACK_CONTEXT_WINDOW = 131072`，而 `contextChoicesFor(131072)` 返回 `[131072]`；名录里**没有任何 stepfun 条目**，所以该组每个模型都恰好是「128K」 | **已修**：回落改为梯子下限 200K；StepFun 组直接下发 200K/256K/400K/1M |
| 2a | 阶跃星辰 5 用两次后工具报错 | **未定**：报错体显示 `body.input` 期望 `str` 却收到列表，说明请求走了 responses 形状；210 条校验错误 ≈ 条目数 × union 分支数，即**我们的 input 条目匹配不上任何一种被接受的 item 类型**。需要协议配置与完整报错才能定位 | 待证据 |
| 2b | 1M 上下文 + 多模态 | 名录无 StepFun 条目 → `vision` 恒为 `false` → 发图直接 `UNSUPPORTED_CONTENT`；上下文按未知模型处理 | **部分已修**（上下文梯子）；多模态待模型 id |
| 3 | 模型配置放到对应供应商板块 | 现在「模型可见性/上下文/推荐」是一张全局卡片，与分组卡片分离 | 方案已给出，待确认 |

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

### 1.3 待办

- 补 stepfun / grok 的名录条目（需要模型 id，见 §5）。
- R4 只能缓解不能根治（在宿主 `catalog.ts`）：插件侧已让 `resolveModel` 尽量不抛；若要根治需宿主把 try/catch 下沉到单个模型。可提 issue。

---

## 2. 问题二：阶跃星辰 5 适配

### 2.1 (b) 1M 上下文与多模态：已确认缺口

- `contextWindow`：名录无 stepfun 条目时按未知模型处理。**现已**由分组梯子给出 200K/256K/400K/1M 四档；补名录条目后模型自身窗口（1M）才会成为「不配置 contextLengths 时的默认」。
- `vision`：`catalogEntry()` 对未收录 id 一律 `vision: false`，`acceptsImages()` 再要求 `matchRegistry(id)?.vision === true && protocol === 'chat-completions'` → **当前发图必然 `UNSUPPORTED_CONTENT`**。补一条 `vision: true` 的 StepFun 5 条目即可打通（`chat-completions` 路径已支持 base64 data URL 图片，代码无需改动）。
- 需要你确认：中转站的 StepFun 5 是否接受 OpenAI 风格的 `image_url: { url: 'data:image/png;base64,...' }`；若它要求单独的上传接口，则需要新增一条映射。

### 2.2 (a) 二次使用后工具报错：证据与假设

你贴的报错有两个关键信息：

1. `loc: ('body', 'input', 'str')` —— 请求体里带的是 **`input`**，也就是 **responses 协议**的形状（chat-completions 用的是 `messages`）。
2. `210 validation errors` —— 若 `input` 是「`str` ∪ 多种 item 类型的联合」，那么错误数 ≈ **item 数 × union 分支数**。14 个条目 × 15 个分支 = 210，高度吻合。含义是：**我们的每个 input 条目都不匹配任何一种被接受的 item 类型**。

结合「第一次正常、第二次报错」：第一轮请求只有 system + user，第二轮开始回放 assistant 的 `function_call` 与 `function_call_output` —— 失败从第二轮开始，正是**回放条目**不被接受。

假设排序（待证据收敛）：

| # | 假设 | 判别方法 |
|---|---|---|
| H1 | stepfun 组被配置成 `protocol: responses`，而该 route 期望的 item 形状与我们的不一致（例如要求 `content` 为字符串、要求 `id`/`status`） | 看该组的 `protocol` 配置 + 完整报错里的 item 列表 |
| H2 | 回放 `reasoning_content` 被拒（第一方 llm-deepseek 同样回放，所以这是**生态惯例**，但 StepFun 未必接受） | 关掉思考或换 effort 后是否仍失败 |
| H3 | `thinking: {type:'disabled'}` 被拒（GLM 已知会拒；StepFun 可能同样） | 选非 off 的 effort 后是否仍失败 |
| H4 | 未处理 `GenerateOptions.purpose`（`'compaction'` / `'session-title'`）：第一方 `llm-deepseek` 对 `session-title` 会强制关掉思考，我们原样发送 | 报错是否只出现在压缩/起标题那一轮 |

### 2.3 建议的诊断能力（本轮未实现，等你确认）

加一个**显式开关**的线上捕获：`DSH_PROTOCOM_CAPTURE_DIR=<dir>` 时，把每次上游请求的**序列化 body**与上游**非 2xx 的响应体**写成 JSON 落到该目录（只写 body，不写任何 header，因此不含密钥；目录默认关闭，文档标注含对话内容）。
拿到一次失败样本后，`input` 的具体形状与被拒原因即可确定，2a 可以一次改对，而不是猜。

---

## 3. 问题三：设置页 UX

### 3.1 现状

- 分组卡片：启用开关 / 密钥 / 协议标签 / 探测模型（表格）/ 余额。
- 另有一张**全局**「菜单中显示的模型」卡片：勾选可见性、选上下文档位、星标推荐。
- 底部模型菜单是**宿主**的组件（`packages/client/ui-model-selection`），插件不能改它的布局，只能决定**每个 provider 提供哪些行**。

### 3.2 方案（推荐 B）

- **A. 折叠菜单栏**：只能通过「减少行数」间接实现——1a 修好后每组只剩自己的模型，菜单自然变短。**已部分达成。**
- **B. 把模型配置搬进对应分组卡片（推荐）**：每张分组卡片改为三段式流程
  1. **接入**：启用开关 + API key + 保存；
  2. **探测**：探测模型 → 结果表格；
  3. **选用**：在探测结果里直接勾选「进菜单 / 上下文档位 / 置顶」，即把现在全局卡片的三个动作**内联到该组的探测表格行**。
  全局卡片保留为「总览」或直接移除。
- **C. 供应商内的模型子面板**：卡片内加一个可折叠区，展示该组当前**生效**的模型（来自 `listModels`），与探测结果并列。

推荐 **B + C**：先做 B（勾选内联），C 作为「生效视图」的补充。

### 3.3 固定高度约束

你要求「保持一个固定的容器上下高度，跟之前差不多」。做法：分组卡片的三段用固定行高与固定高度的滚动区（探测表格沿用现有 `max-height` + `overflow`），**不引入会撑高的新容器**；模型选用区与探测表格共用同一个滚动视口。

---

## 4. 里程碑

| 里程碑 | 内容 | 出口条件 |
|---|---|---|
| M1（已完成） | 1a/1b 的目录收敛 + 分组梯子 + 未知模型 200K | 155 用例全绿；`stepfun` 组模型默认展示四档 |
| M2 | 补 StepFun 5 / Grok 名录条目（1M + vision）+ 多模态验证 | 发图不再 `UNSUPPORTED_CONTENT`；四档默认由模型窗口决定 |
| M3 | 2a 定位与修复（依赖证据）+ 捕获开关 | 复现失败样本并回归 |
| M4 | 设置页 B+C 改造（固定高度） | 视觉验收；分组内完成「接入→探测→选用」 |
| M5 | 宿主 issue：`catalog.ts` 的 provider 粒度 try/catch 下沉到单模型 | 单个坏模型不再整组消失 |

---

## 5. 需要你提供的信息

1. **StepFun 组的协议配置**：`settings.yaml` 里 `groups.stepfun.protocol` 是 `chat-completions` 还是 `responses`？（报错里的 `input` 指向后者，但默认值是前者。）
2. **完整的 400 报错体**：你贴的内容被截断了；需要 `detail` 里 `errors` 数组的前 2–3 条（含 `loc` 与 `input` 原文），或按 `DSH_PROTOCOM_CAPTURE_DIR` 方案给我一份失败请求样本。
3. **StepFun 5 的准确模型 id**（`/v1/models` 里 stepfun 组返回的那一串），以及是否还有其它 stepfun 模型要一起收录。
4. **多模态形态**：中转站的 StepFun 5 是否接受 `image_url` + base64 data URL。
5. **失败时机**：是「第 2 轮对话」还是「同一条消息用两次工具」？换 effort / 关思考后是否仍失败？

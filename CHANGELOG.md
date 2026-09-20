# Changelog

All notable changes to `dsh-protocom-api` are documented here.

## [0.5.0] — 让有缺陷的 chat-completions 路由也能真实跑通（可选兼容模式）

0.4.0 让阶跃星辰分组改走 responses 通道，问题是解决了，但那算"绕开"。这一版回答"能不能从插件侧把 chat-completions 也修好"：**能，但有代价，默认不开**。

### 实测：chat 侧所有 assistant 写法里只有两种能活

| chat 侧 assistant 写法 | 结果 |
|---|---|
| `content: "text"`（规范写法） | **400** |
| `content: [{type:'text',text}]` | **400** |
| `content: [{type:'output_text',text}]` | **400** |
| `content: [{type:'input_text',text}]` | **400** |
| `content: ""`（丢弃文本、保留工具调用） | 200 |
| 同一段话放在 **user 条目**（`name: "assistant"`） | 200 |
| `reasoning_content: "…"` | **400** |
| `reasoning: "…"`（另一个字段名） | 200（被中转站忽略，等于没发） |

机制：该中转站把 assistant 文本**一律**渲染成上游拒绝的形状（没有 `type` 的 message 条目 + `output_text` 部件），chat 侧**没有任何 shape 能让它变合法**；但同一段话挂在 user 条目上它接受。

### 新增 `groups.<key>.assistantTextReplay`（默认 `keep`）

- `keep`：按规范原样回放（默认，行为不变）。
- `drop`：**丢弃** assistant 自己的文字，保留该轮的工具调用与结果。
- `user`：把这段文字**改挂到一条 `name: "assistant"` 的 user 条目**上——信息不丢，但角色归属被改写。

实测（构建产物 + 真实凭据，同一段「reasoning + 文本 + 工具调用 + 工具结果」回放）：

`
keep              [chat-completions/keep] -> INVALID_REQUEST | Upstream error: 400
drop              [chat-completions/drop] -> 200 finish=stop | "Yes, that's correct — **72**…"
user              [chat-completions/user] -> 200 finish=stop | "Confirmed — 8*9 = 72. ✅"
responses（默认）  [responses/keep]        -> 200 finish=stop | "**8 × 9 = 72**…"
`

怎么选：**优先 `protocol: responses`**（原生形状、不改写语义）；只有当那条 route 没有 responses 通道、又必须跑在 chat-completions 上时，才在 `drop`（更干净，模型看不到自己上一轮的话）与 `user`（保留文字、改归属）之间二选一。

## [0.4.0] — 阶跃星辰：修复「第二轮起必 400」

一句话：**该分组原先走的 chat-completions 门面在这个中转站上无法回放任何历史**，所以只要不是第一轮请求就必然 400。现已让该分组默认走官方 Responses 通道，并补齐该通道的思考流词表。

### 根因（实测，非推断）

用你的 StepFun 凭据对真实端点做单变量实验：

| 实验 | 结果 |
|---|---|
| 单轮纯文本 | 200 |
| 首轮请求工具（step 1） | 200 |
| **回放 assistant 文本（无工具）** | **400** |
| **回放 assistant 文本 + 工具调用** | **400** |
| **回放 assistant 文本 + 工具结果（两条消息）** | **400** |
| **回放 `reasoning_content`（哪怕完全没有工具）** | **400** |
| 回放「content 为空、只有工具调用」的 assistant + 工具结果 | 200 |
| 一轮里两个并行工具调用（无 reasoning） | 200 |
| 6KB 长参数 + 流式 | 200 |
| **同一会话改走 `/v1/responses`** | **200**（工具调用、内联图片都正常） |

上游报错自证了机制：中转站把 chat-completions 请求**转译**成 StepFun 的 Responses 请求，转译后 assistant 条目长这样——

`{"role":"assistant","content":[{"annotations":[],"text":"Hi there!","type":"output_text"}]}`

它**没有 `type` 字段**，只能去匹配 union 里的 `EasyInputMessageParam` 分支，而该分支要求 `content` 是**字符串**，于是报 `210 validation errors ... loc ('body','input',...,'EasyInputMessageParam','content','str') Input should be a valid string`（210 = 条目数 × union 分支数）。所以：

- **只要历史里有任何 assistant 文本（或 reasoning）就会被拒** —— 这才是「用两次就报错」的真实边界，与工具**数量**无关（一轮两个并行调用本身是 200）；
- assistant 的 `reasoning_content` 同样会被折进那段文本（转译成 `<thinking>…</thinking>`），因此它本身就是独立的 400 触发器。

### 修复

1. **`stepfun` 分组默认协议改为 `responses`**（`src/groups.ts`）：该通道就是 StepFun 官方 Responses API 的原生形状，实测同一会话 200（含工具调用与内联图片）。显式写 `protocol: chat-completions` 仍被尊重，但那条路依旧 400——那是中转站的转译缺陷，插件无法修。
2. **补齐该通道的思考流词表**（`src/protocol/responses.ts`）：StepFun 用 `response.reasoning_text.delta` / `.done` / `response.reasoning_part.*`（原先只认 `reasoning.delta` 与 `reasoning_summary_text.*`），只在 `output_item.done` 里整段重述时也能拿到。全部走「只补未流过的余量」规则，因此流 + 重述不会双份。
3. **`status: incomplete` 但没给 `incomplete_details.reason` 的响应按 `max-tokens` 处理**：StepFun 思考被输出预算截断时正是这个形状，原先会被当成正常 `stop`。
4. **chat-completions 默认不再回放 `reasoning_content`**（新增 `groups.<key>.replayReasoning`，默认 `false`）：该字段是本中转站 400 的独立触发器，DeepSeek 官方 API 也把回放它判为 400；只有需要「交错的思考上下文」的路由才应打开。

### 验证（构建产物 + 真实凭据，走插件自己的代码路径）

`
step 1 : start:reasoning | start:tool-call | end:reasoning | end:tool-call(run_code {"code": "console.log(8*9)"}) | finish:tool-calls
step 2 : start:reasoning | start:text | end:reasoning | end:text | finish:stop
         answer: "Yes — the program computed 8*9 as 72, which is correct."
`

同一段回放**强制**回 chat-completions 时仍然 `INVALID_REQUEST | Upstream error: 400` ——所以修好它的正是协议本身。

### 行为变更

1. `groups.stepfun.protocol` 默认值由 `chat-completions` 变为 `responses`；显式配置过 `protocol` 的部署不受影响。
2. chat-completions 请求不再默认回放 `reasoning_content`；需要旧行为的部署加 `replayReasoning: true`。
3. 阶跃星辰的思考内容现在会**流式显示**（此前 chat 门面根本不吐 reasoning 增量）。

## [0.3.0] — 分组模型目录与图片输入

本次修掉两个「设置页里根本设不了、界面上根本传不了」的问题：**除开源聚合外的分组无法配置菜单模型**，以及**多模态模型（阶跃星辰 3.7 / 5）无法上传图片**。所有能力判定都改成可验证、可覆盖的数据，而不是写死的白名单。

### 问题一：设置页只能配置「开源聚合」的模型

- **根因**：面板里唯一的模型配置卡片（「菜单中显示的模型」）是用**静态名录**渲染的（`modelIdentities()`），而名录里 stepfun / grok 一个条目都没有 → 这两个分组在界面上**没有任何一行可勾选**；点「探测模型」只得到一张「模型 / 上游 ID」表格，勾选写不进去。
- **现在**：每张分组卡片内就是**该分组自己的菜单模型**，一行一个模型，四种控制内联在行内——可见性勾选、上下文档位、「视觉」（是否声明接收图片）、星标置顶；卡片头可折叠，模型列表是固定高度滚动视口（与之前高度一致）。「刷新模型」按钮在同一个标题行，点它就拉该分组自己的 listing。
- **投影唯一**：面板与适配器共用同一个纯函数 `groupCatalog()`（`src/model-registry.ts`），所以「界面上能配的」=「菜单里会出现的」，不会漂移。
- **原始映射移到折叠项**：「模型和上游 ID」表格放进默认收起的 `<details>`，并新增「端点提供」一列——端点列了但拒绝服务的 id 会明确标注，而不是混在可选项里。

### 问题二：阶跃星辰 3.7 / 5 无法上传图片

- **根因 1（能力判定过严）**：`catalogEntry()` 对名录未收录的 id 一律 `vision: false`，`acceptsImages()` 又要求名录明确 `vision: true` → 任何未收录模型都被判为纯文本，图片入口直接不可用。现在改为**三级判定**：部署显式设置 → 名录的已验证结论 → **默认放行**（端点才是模态的唯一权威；一个错误的「不支持」会让所有部署都用不了已公布的能力，错误的「支持」只是让上游回一条点名该模型的错误）。
- **根因 2（协议缺口）**：`acceptsImages()` 曾要求 `protocol === 'chat-completions'`，responses 协议（codex 分组）**完全没有图片映射**。现在 responses 也支持：用户消息走 `input_image` 内联 data URL，工具结果带图时 `function_call_output.output` 用 content 部件数组（纯文本工具结果仍是字符串形式，既有行为不变）。
- **新增 `visionModels` 设置**：`Record<string, boolean>`，按模型身份键（别名归一）。`false` 才是「这个模型只收文本」；面板行内的「视觉 / 仅文本」开关就是它的入口。
- **实测收录**：对真实端点逐条发请求验证，新增 `step-5-preview`（Step 5 Preview，1M，`vision: true`，`groups: ['stepfun']`）；`step-3.7-flash` 实测接受内联图片（HTTP 200，回答 red），按未收录模型处理即可放行。
- **端到端实测**（构建产物 `lib/index.js` + 真实凭据）：`listModels('protocom-stepfun')` 现在返回 **3 个模型 × 4 个上下文档位 = 12 条**，每条都是 `text+image`；带真实 PNG 的图片轮次经适配器发往端点后返回 Red 并正常 `stop`。

### 行为变更（请阅读）

1. **未收录模型现在默认声明可接收图片**。给一个真的只收文本的模型发图，会得到上游 400（模型名在报错里），而不是以前的客户端拒绝。要恢复原来的拒绝，对该模型设置 `visionModels: { <id>: false }`，或在面板里把它切成「仅文本」。
2. **端点拒绝服务的 id 不再进入模型菜单**。用同一把 StepFun key 实测：`step-3.5-flash` / `step-3.5-flash-2603` 返回 400「this model is not enabled for the Responses API」，`step-explore` / `step-image-edit-2` / `stepaudio-2.5-*` 返回 404「does not exist or you do not have access to it」——11 个 id 里 8 个无法服务。这些 id 现在只出现在折叠的原始表格里（标注「端点提供：否」），不占菜单。名单在 `REFUSED_CHAT_MODEL_IDS`；端点若重新开始服务，删一行即可。
3. **`glm-5.2` / `zai-org/GLM-5.2` / `glm-5.3` / `mimo-v2.5-pro` 显式标注 `vision: false`**（厂商文档 / 实测 404），语义从「未表态」变成「已验证纯文本」，行为不变。

## [0.2.0] — 安全加固

本次是一次**收紧型**发布：修掉 3 项高危、4 项中低危，并补齐全部安全控制的回归测试。依据为 `SECURITY_AUDIT_CONSOLIDATED.md` 与 `SECURITY_REMEDIATION_PLAN.md`；逐条落地与验证证据见 `SECURITY_REMEDIATION_REPORT.md`。

### ⚠️ 破坏性变更

升级前请阅读以下四项；第一、四两项在**插件加载或配置解析时**直接失效，第二项改变端点的访问方式，第三项要求改名。

1. **余额端点改为挂在 Host 的围栏通道上，必须带浏览器会话才能读。**
   旧实现注册的是 `webServer` 的 `kind: 'exact'` 路由，而 webserver 先匹配 exact 表、命中即返回，`/api` 前缀上的 Host/Origin 围栏与浏览器认证**从未执行**。现在改为 `ctx.connection.fetch.register({ path: '/api/protocom-api/balance', methods: ['GET'] })`，只有通过载体信任策略（Web 的 Host/Origin 围栏 + HMAC cookie，或桌面 IPC）的请求才会到达处理器。
   - 裸 `curl` 从 200 变为 **401**；伪造 Host 从 200 变为 **403**。
   - **桌面端余额面板从必然 404 变为可用**（桌面 profile 禁用 `webserver`，旧实现的路由根本不注册）。
   - 响应统一带 `Cache-Control: no-store` 与 `X-Content-Type-Options: nosniff`；502 文案固定为 `the balance query failed`，不再回显凭据引用名或调用方输入。

2. **`baseURL` 必须使用 https（仅回环例外），且不得携带 userinfo / query / fragment。**
   旧校验只有 `/^https?:\/\//`，放行明文 http 与任意主机；与「可改写 settings」串联即构成端到端实测过的凭据外泄链。
   - `http://192.168.1.10:8080` 这类非回环明文地址升级后**直接加载失败**并给出明确报错，请迁移到 https。
   - `http://127.0.0.1:8080`、`http://localhost:3080`、`http://[::1]:3080` 仍允许（本地中转），WHATWG 归一化为回环的写法（`2130706433`、`0x7f000001`）也放行。
   - 顺带修正：`HTTPS://` 大写 scheme 旧正则误拒，现在按解析结果判定。

3. **凭据引用名必须匹配 `PROTOCOM_[A-Z0-9_]+`。**
   旧实现只要求 `credentialRef`（POSIX 标识符形态），于是 `apiKey: AWS_SECRET_ACCESS_KEY` 合法；`resolveApiKey` 的 `process.env[ref]` 回落会读取**任意环境变量**。配置与 env 回落两处都已加白名单。
   - 本插件默认引用（`PROTOCOM_AGGREGATE_API_KEY` 等）天然符合，无需改动。

4. **端点 origin 默认锚定在官方 relay；自定义端点必须显式确认。**
   仅强制 https 并不能阻止凭据外泄：审计 PoC 用的是 `http://127.0.0.1:19999`（回环明文），而一次 settings 写入就能把已保存的真实 key 改发到任意主机。现在 `baseURL` 的 origin 必须等于 `https://relay.protocom.org`，否则加载时抛错，除非显式设置 `allowCustomBaseURL: true`（**无 schema 默认值**，见 `src/config.ts`）。高级面板新增同名勾选框，应用 baseURL 时与 `allowCustomBaseURL` 同批原子写入。
   - 使用本地中转 / 自建网关的用户需要新增 `allowCustomBaseURL: true`。

### 安全修复

- **H1 凭据外泄链**：见破坏性变更 2、3、4；另在模型发现处增加 **key↔endpoint origin 绑定**——只有当 draft 端点与配置端点 origin 完全一致时才回退到已存密钥，否则必须由调用方自带一次性 `apiKey`。`apiKey: ''` 归一为「未提供」，不再发出空 Bearer。
- **H2 responses 截断即执行**：终止事件只是「流结束了」，不代表某个工具调用的实参已完整——上游同时控制两者。`translateResponses` 因此在两个层面设卡：(a) 裸 EOF（无 `response.completed` / `incomplete` / `failed` / `error` 或显式 `[DONE]`）直接抛 `STREAM_CLOSED`；(b) **逐调用**跟踪完整性，只有收到 `function_call_arguments.done` / `output_item.done` 的 tool-call 块才会被冻结，否则整块丢弃并把 finish 降级为 `error` / `STREAM_CLOSED`——即使上游伪造了 `response.completed`，或真实的 `incomplete(max_output_tokens)` 截断了参数，harness 也不会走到 `executeToolCalls`。
- **H3 余额端点无鉴权**：见破坏性变更 1；并加入 5s 失败退避（避免故障期每次轮询都真打上游）与无 `?group=` 时跳过计费倍率端点（每次轮询上游调用数减半）。
- **F-4 探测端点明文 http**：discovery 现在对调用方传入的 draft baseURL 也执行 scheme/host 校验（https，或回环 http），即使调用方自带一次性 `apiKey`——否则该 key 会明文过网。
- **M1 discovery 4MB 上限无效**：由「先 response.text() 读完整、再比较 UTF-16 code unit 数」改为**流式累计字节数**，超限即 `reader.cancel()`；模型名与 display label 上限 256 字符（实测旧代码可让 240 万字符进入模型目录）。
- **M2 Retry-After 无上限**：解析时即钳到 `MAX_PROVIDER_RETRY_AFTER_MS = 10_000`，并且**适配器自己声明** `providerRetryPolicy`（`maxDelayMs` 取同一常量），使 `providerRetryAfterMs <= policy.maxDelayMs` 恒成立。只钳不声明是不够的：部署把 `backoff.maxDelayMs` 调到 5s 时，10s 的钳值仍会撞上重试层的 `return next()` 分支而被静默取消重试。
- **F6 SSE 无缓冲上限 / 无空闲超时**：`EventSourceParserStream({ maxBufferSize: 1MiB })` 终止永不换行的巨量事件；`src/adapter.ts` 用 `@deepseek-ai/dsh-timeout` 的 `idleWatchdog` 包裹流，并把 `watchdog.signal` 透传给传输层（该看门狗只通知、不中止，不透传会让 stalled 读取永久挂起）。新增 `streamIdleTimeoutMs` 配置，默认 300000，与第一方适配器一致。
- **L2 请求级图片预算**：单张策略之外新增整请求预算（累计 20 MiB、最多 600 张，对齐第一方），超出部分按**最旧优先**降级为文本占位（复用 `offloadRequestImagesWithPolicy`），不再无限 materialize base64。
- **L1 502 回显**：见破坏性变更 1。
- **L4 安全控制零覆盖**：新增 50 条用例（合计 130），其中 32 条在修复前的代码上失败。新增 `pnpm run check:consistency`（`build && git diff --exit-code`）作为「lib/ 与 src/ 一致」的 CI 闸门，并加一条断言「client banner id === package name」。
- **P2-3 客户端**：余额响应经 `parseBalanceView` 运行时校验后再渲染（旧代码 `as GroupBalance` 是纯断言，`expiresAt: 123` 会走到 `.slice` 崩溃）；密钥输入框加 `autoComplete="new-password"` 与 `spellCheck={false}`；`storeApiKey` 的 settings 写入补 `expectedRevision`；401/403/404 渲染为「余额不可用」。

### 模型目录改为按分组收敛（修复菜单显示不全与 128K 残留）

- **目录成员不再取整份名录。** 原来 `listModels(provider)` 以整份名录为起点，于是启用 N 个分组时菜单里就有 N 份几乎相同的模型行，且**每个分组的真实模型被追加在名录之后**——菜单容器是固定高度滚动区，第一组就占满视口，后面的分组形同不存在。现在成员 = **该 route 自己的 listing** ∪ 名录中**登记为该组**的条目（`RegistryEntry.groups`）；listing 缺失或为空时仍回落到整份名录，保留「flaky listing 不能清空菜单」的保证。
- **未知模型不再回落 128K。** `FALLBACK_CONTEXT_WINDOW` 由 `131072` 改为梯子下限 `204800`。旧值配合 `contextChoicesFor(131072)`（返回 `[131072]`）让**每一个名录未收录的模型都恰好显示一项「128K」**——StepFun/Grok 组此前没有任何名录条目，因此整组都是 128K。
- **分组可自带上下文梯子。** `GROUP_DEFAULTS.stepfun.contextLengths` = 200K/256K/400K/1M（StepFun 按这四档发布），部署未指定时生效；设置页按生效值显示。
- `gpt-5.6-sol` / `gpt-5.6-luna` 登记为 `codex` 组。

### 新增

- `streamIdleTimeoutMs` 配置项（默认 300000 ms，允许 1..2147483647）。
- 新 peerDependency：`@deepseek-ai/dsh-client-connection`（注册围栏通道）、`@deepseek-ai/dsh-timeout`（空闲看门狗）。
- 开发依赖：`jsdom`、`@testing-library/react`、`react-dom`，用于客户端渲染回归。
- 新模块 `src/balance-view.ts`：零依赖的余额形状与再校验逻辑，Host 与浏览器共用（避免把服务端依赖打进 client bundle）。
- `pnpm run verify` = test + check:consistency。

### 移除

- `balanceRouteHandler(service, hooks)` 被 `balanceFetchHandler(service, hooks)` 取代（`(req, res)` → `(request: Request) => Promise<Response>`）。
- 插件不再声明 `@deepseek-ai/dsh-host-webserver` 为 peerDependency（不再注册任何 `webServer` 路由）。

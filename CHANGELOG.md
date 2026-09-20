# Changelog

All notable changes to `dsh-protocom-api` are documented here.

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

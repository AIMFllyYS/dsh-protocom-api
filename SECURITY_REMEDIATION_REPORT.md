# dsh-protocom-api 安全修复落地报告

> 配套文档：`SECURITY_AUDIT_CONSOLIDATED.md`（审计）、`SECURITY_REMEDIATION_PLAN.md`（修复计划）、`CHANGELOG.md`（对外变更）。
> 本文记录**实际落地了什么、如何验证、哪里偏离了计划、还剩什么需要宿主侧处理**。

---

## 1. 摘要

审计的 3 项高危（H1 凭据外泄链、H2 responses 截断即执行、H3 余额端点无鉴权）与 4 项中低危（M1 discovery 上限失效、M2 Retry-After 无上限、L1 502 回显、L4 安全控制零测试）全部在**插件内**修复；F6/L2/L3/L5/L6/L7 中可在插件侧闭环的部分一并处理。测试从 80 条增至 **130 条**，其中**新增的 32 条在修复前的代码上失败**（见 §4）。

修复遵循计划的五条总原则：插件内修、fail-closed、用框架正解而非手抄校验、每条修复配一条会失败的测试、区分插件缺陷与生态级惯例。

---

## 2. 落地清单

| 审计项 | 修复 | 主要文件 | 回归测试 |
|---|---|---|---|
| **H1** 凭据外泄 | 强制 https（仅回环例外）+ 拒绝 userinfo/query/fragment（`resolveBaseURL`）；凭据引用 `PROTOCOM_[A-Z0-9_]+` 白名单（配置 + env 回落）；discovery key↔endpoint origin 绑定；空 `apiKey` 归一为未提供 | `src/config.ts`、`src/index.ts`、`src/discovery.ts` | config 8 条、discovery 4 条、http 4 条 |
| **H2** 截断即执行 | `translateResponses` 以终止事件（completed/incomplete/failed/error/[DONE]）为 flush 前提，裸 EOF 抛 `STREAM_CLOSED` | `src/protocol/responses.ts` | responses 3 条 |
| **H3** 余额无鉴权 | 改挂 `ctx.connection.fetch.register`（由载体围栏授权），修 `balanceFetchHandler`；`Cache-Control: no-store` + nosniff；502 固定文案 | `src/index.ts`、`src/balance.ts` | balance-route 10 条、apply 2 条 |
| **M1** discovery 上限 | 流式累计**字节**数，超限 `cancel()`；label/id 上限 256 字符 | `src/discovery.ts` | discovery 3 条 |
| **M2** Retry-After | 解析时钳到 10000 ms（≤ 重试策略默认 maxDelayMs） | `src/protocol/http.ts` | http 4 条 |
| **F6** SSE 内存 | `EventSourceParserStream({ maxBufferSize: 1MiB })`，越界即失败 | `src/sse.ts` | sse 2 条 |
| **F6** 空闲挂起 | `idleWatchdog` 包裹流并透传 signal；新增 `streamIdleTimeoutMs`（默认 300000） | `src/adapter.ts`、`src/config.ts` | adapter 1 条、config 2 条 |
| **L1** 502 回显 | 固定文案 `the balance query failed`，细节只进 `hooks.log` | `src/balance.ts` | balance-route 1 条 |
| **L2** 图片预算 | 整请求 20 MiB / 600 张，最旧优先降级为文本占位 | `src/adapter.ts` | adapter 2 条 |
| **L4** 零覆盖 | 130 条用例（新增 50）；CI 一致性闸门；banner id 断言 | `test/*`、`package.json` | 全部 |
| **L6** 桌面 404 | 改挂 connection 通道后桌面端余额面板恢复可用 | `src/index.ts` | apply 1 条（断言不再注册 webServer 路由） |
| **P2-3** 客户端 | `parseBalanceView` 运行时校验；401/403/404 → 「余额不可用」；`autoComplete/spellCheck`；`expectedRevision` | `src/client/*`、`src/balance-view.ts` | client-render 6 条 |
| **L4 工程闸门** | `pnpm run check:consistency` = `build && git diff --exit-code`；发布物不含 .map/src | `package.json`、`test/package.spec.ts` | package 2 条 |

**依赖面变化**：新增 peerDependency `@deepseek-ai/dsh-client-connection`（围栏通道）与 `@deepseek-ai/dsh-timeout`（看门狗）；移除 peerDependency `@deepseek-ai/dsh-host-webserver`（不再注册任何 webServer 路由）。运行时依赖仍只有 `schemastery` + `eventsource-parser`。

---

## 3. 关键设计决策（含对计划的两处偏离）

1. **H3 用 `connection.fetch.register`，并把 `connection` 放进 scoped `ctx.inject` 而非顶层 `inject`。** 顶层 `inject` 缺服务会让整个插件失活；scoped inject 只让余额路由缺席（headless/sdk 场景）。
2. **H3 未新增 `@deepseek-ai/dsh-client-connection` 的硬类型导入**，而是按第一方 `open-in-app`/`session-log-export` 的惯例本地声明窄类型 + `Reflect.get`——该包是浏览器侧、在 headless profile 不存在。
3. **P0-2 采用严格门槛（裸 EOF 直接抛 `STREAM_CLOSED`），而不是"降级 finish + 丢未确认 tool-call"的兼容方案。** 计划要求先抓真实 responses 流确认 `response.completed` 是否总到达；本环境无法安全复现生产流，故选择与 chat-completions 完全对齐的严格行为（该端点协议自述即以 `response.completed` 终止，测试夹具亦然），并额外把显式 `[DONE]` 也接受为终止。**若线上确有以 EOF 正常结束的网关，需改走计划的降级方案**——这是本报告最需要部署方验证的一点。
4. **M2 钳到 10000 ms 而非计划示例的 60000 ms。** 计划的 60s 与它自己的目标「超限时不取消重试」矛盾：重试层在 `providerRetryAfterMs > maxDelayMs`（默认 10s）时对 normal 模式直接 `return next()`，即取消重试。取 10s 才能让上游请求的等待真的被消费、重试不被剥夺，且不引入 60s 级别的额外挂起面。测试同时断言 `MAX_PROVIDER_RETRY_AFTER_MS <= 10000`，把这一不变式钉死。
5. **空闲看门狗必须把 `watchdog.signal` 透传给传输层。** `idleWatchdog.next()` 不 race 定时器，只 `await iterator.next()`；signal 只"通知"，不自动中止 in-flight 读取。不透传会导致超时后 `iterator.return()` 永久挂起——这既是功能 bug 也是新的 DoS 面。第一方适配器同样把 watchdog.signal 传进 request。
6. **余额形状抽到零依赖 `src/balance-view.ts`。** 客户端需要运行时校验，而 `src/balance.ts` 引入 `@deepseek-ai/dsh-llm`；client 构建会把非 external 依赖打进 bundle。抽公共零依赖模块后 `lib/client.js` 仍无任何服务端依赖引用（已核对）。
7. **失败退避而非"失败也缓存"。** 保留"失败不入正缓存"的原语义（下次调用可重试），额外加 5s 负缓存窗口，避免故障期每次轮询都真打上游；`invalidate()` 同时清空。

---

## 4. 验证证据

### 4.1 构建与测试

- `pnpm run build`：tsdown（`lib/index.js` ESM + `lib/client.js` CJS 工厂）+ `tsc -b`（`lib/types`）均 exit 0。
- `pnpm exec vitest run`：**16 个文件 / 130 条用例全绿**。
- bundle 隔离核对：`lib/client.js` **不含** `dsh-llm`/`dsh-timeout`/`dsh-credentials` 等引用；`lib/index.js` 正确 external 化 `@deepseek-ai/dsh-llm` 与 `@deepseek-ai/dsh-timeout`。

### 4.2 "修复前会失败"证据

在 `git worktree` 中检出审计基线 `7c8bd48`（未修复源码），把新测试与 `vitest.config.ts` 拷入后运行：**130 条中 32 条失败**，98 条通过。代表性失败（均对应审计发现）：

| 失败用例 | 修复前表现 | 对应 |
|---|---|---|
| apply：registers on the fenced connection channel | `expected [ { kind: 'exact' } ] to deeply equal []` —— 旧代码注册的是 webServer exact 路由 | H3 |
| responses：refuses a stream without a terminal event | `expected undefined to match { code: 'STREAM_CLOSED' }` —— 裸 EOF 被当正常结束 | H2 |
| responses：never emits a truncated tool call as complete | 同上，残缺 tool call 被 flush | H2 |
| http：clamps a huge Retry-After | `expected 86400000 to be undefined` —— 86 400 000 ms 原样下发 | M2 |
| discovery：caps an oversized chunked listing | `Invalid array length` —— 先读完整 5 MiB 再检查 | M1 |
| discovery：never sends a stored key to a foreign baseURL | 旧代码把 stored key 发往 `https://evil.test/v1/models` | H1 |
| discovery：empty apiKey is not a supplied key | `expected 'Bearer ' to be 'Bearer stored-secret'` | H1 |
| config：refuses plain http on a non-loopback host | `expected [Function] to throw` —— `http://192.168.1.10:8080` 被接受 | H1 |
| config：refuses a non-PROTOCOM credential reference | `expected [Function] to throw` —— `AWS_SECRET_ACCESS_KEY` 被接受 | H1 |
| adapter：bounds the whole-request image set | `expected ... to have a length of 600 but got 601` | L2 |
| adapter：aborts an idle stream | 测试超时（旧代码无空闲上界） | F6 |
| client-render：malformed balance payload | `TypeError: balance.expiresAt.slice is not a function`（React 渲染期崩溃） | L4/P2-3 |
| sse：never-ended event past the bound | `MAX_SSE_EVENT_CHARS` 不存在 / 无上限 | F6 |

其余失败多为新增导出（`balanceFetchHandler`/`resolveBaseURL`/`endpointOrigin`/`MAX_PROVIDER_RETRY_AFTER_MS`/`parseBalanceView`）在旧树不存在，以及 label 上限、`streamIdleTimeoutMs` 默认值等断言。

> 诚实边界：这 32 条里，行为性失败（非"符号不存在"）覆盖了 H1/H2/H3/M1/M2/L2/F6/L4 的核心断言；3 条客户端回归（保存清空 draft、失败保留 draft、第三方字符串按文本渲染）在修复前也通过——它们是**回归护栏**，不是待修缺陷，计划本身已如此定位。

### 4.3 对抗复核与第二轮修复

按计划 §6 起了一路独立上下文的对抗复核子智能体（非 fork，避免继承修复者假设），要求逐条**构造反例、找绕过**并核对测试是否空洞。它确认 H1 的 scheme/host 校验、凭据白名单、P0-3 origin 绑定、H3 Web 载体围栏、M1、F6 看门狗接线、L2、P2-3 客户端为 sound，同时提出 6 项有效发现。裁定与处置：

| 发现 | 裁定 | 处置 |
|---|---|---|
| **F-1** 伪造 `response.completed` / `[DONE]` 仍会 flush 残缺 tool call；`response.incomplete(max_output_tokens)` 亦然 | **成立（高）** | 改为**逐调用**完整性跟踪：只有收到 `function_call_arguments.done` / `output_item.done` 的 tool-call 块才被冻结，未确认的整块丢弃且 finish 强制降级为 `error` / `STREAM_CLOSED`。`agent.ts:443` 只对 `error` / `aborted` 进重试层，非 error 才走 `executeToolCalls`，故残缺调用不再执行 |
| **F-2** 任意 https origin 仍会收到已存 key；审计 PoC 的回环明文路径也仍在 | **成立（高）** | 新增 `allowCustomBaseURL`（**无 schema 默认**）+ origin 锚定到 `https://relay.protocom.org`；高级面板增加确认勾选框，与应用 baseURL 同批原子写入 |
| **F-3** 钳到固定常量，而策略 `maxDelayMs` 可被配置得更小 → 仍取消重试 | **成立（中）** | 适配器声明自己的 `providerRetryPolicy`（`maxDelayMs` = 钳制上限），使 `providerRetryAfterMs <= policy.maxDelayMs` 恒成立；`llm/src/index.ts:436` 确认策略确实取自适配器 |
| **F-4** draft 自带一次性 key 时可走明文 http | **成立（低-中）** | `discoverModels` 对用调用方传入的 baseURL 也执行 `resolveBaseURL` 校验 |
| **F-5** 「不可匿名读取」只对 Web 载体成立 | **成立（低·文档）** | `src/balance.ts` 文档改为按载体表述：Web 围栏，桌面/webworker 走各自 IPC 信任边界 |
| **F-6** `iterator.return()` 无界 + 预流工作不受空闲约束 | **成立（低·加固）** | 预流工作（图片投影、请求序列化）也经 `idleWatchdog` demand；`return()` 加 1s grace race 兜底 |

第二轮新增用例针对的正是第一轮修复仍存在的缺口：F-1 用例在「只看布尔 `sawTerminal`」的第一轮代码上必然失败（该版本对伪造终止事件无条件 flush）；F-2/F-3/F-4 用例同理。用例总数由 130 增至 **143**。

**第三轮（第二轮复核的发现，已全部处置，用例 143 → 149）**

| 发现 | 裁定 | 处置 |
|---|---|---|
| **G-1** `oneShot` 只在 `watchdog.next()` 里 await，若预流 promise 不观察 signal 则永久挂起（可执行 PoC：40ms 超时下 1500ms 后仍 HUNG） | **成立（高·我引入的回归）** | `oneShot` 内部改为 `abortable(promise, signal)`：signal 一 abort 即 reject，与 promise 是否配合无关 |
| **G-2** F-1 的「完整性」只由 done **事件存在**证明，不看 payload：空 `arguments`、过期 delta、非前缀 done 仍可执行残缺调用 | **成立（中）** | 新增 `acceptComplete`：只有 payload 存在、非空、且 `block.text === complete`（即流式前缀被完整续上）才标记 complete；确认后 `emitArguments` 冻结，迟到 delta 被忽略；否则整块丢弃 + `STREAM_CLOSED` |
| **G-3** `discoverModels` 只校验 draft，不校验 `hooks.baseURL()` | **成立（低）** | 对 configured 也执行 `resolveBaseURL` |
| **G-4** 客户端 `allowCustomBaseURL` 勾选后粘滞 | **成立（低）** | 按每次应用时解析出的 origin 判定；应用官方端点时 `unset` 该字段 |
| **G-5** SSE 整事件 1 MiB 上限会拒绝合法的超大 tool call（responses 把完整实参放在单个事件里） | **成立（低·回归）** | 上限提到 8 MiB 并注明原因 |
| **G-6** `watchdog.dispose()` 不 abort 传输，放弃的流只能等 undici 超时 | **成立（低）** | 增加 `consumer` AbortController 并在 finally abort，与第一方适配器一致 |
| **G-7** `RETRY_POLICY.retryableCodes` 不含 `STREAM_CLOSED`，"进重试层"措辞过强 | **成立（文档）** | 截断是硬失败（进入 error 处理但不重试）；已在 §7 记录 |

### 4.4 关于「32/130 修复前失败」

复核曾质疑该数字，理由是：若新 spec 在 HEAD 上因缺少导出而 **import 失败**，文件内用例不会被收集。实测不是这样——Vitest 的 SSR 转换对缺失的具名导出不求值报错，而是得到 `undefined`，用例照常收集并在调用处失败。JSON 报告为 `numTotalTests: 130, numPassedTests: 98, numFailedTests: 32`（9 个文件失败 / 7 个通过）。因此「130 条中 32 条在修复前失败」是**实测值**，其中行为性失败覆盖 H1/H2/H3/M1/M2/L2/F6/L4 的核心断言，少数为符号缺失导致的 `is not a function`。

---

## 5. 审计边界与未验证项（沿用并更新）

- **P0-2 的真实 responses 流未抓取**：严格门槛是否会把"以 EOF 正常结束"的网关打成失败，需部署方用生产姿势验证（见 §3.3）。
- **Chrome LNA 拦截**未在真实浏览器复现；H3 的远程可读性裁定沿用审计结论（DNS rebinding 需端口匹配 + 非现代 Chrome）。
- **A3（同机反代绕过回环判定）**：路由已移交宿主围栏，插件侧不再自行判定回环，该路径的最终裁定归宿主。
- **L2 未做真实多图 e2e**：以 mock attachment store 证明预算生效。
- 外部 CVE 细节未逐篇核对（子代理网络策略限制），结论基于多源摘要。

---

## 6. 移交清单：插件内无法闭环、需宿主或部署侧处理

| # | 项 | 归属 | 建议 |
|---|---|---|---|
| 1 | 凭据明文落盘、Windows 无 mode 检查 | 宿主 `credentials-local` | 官方已自述 "discretion, not a boundary"；建议接入 OS keychain |
| 2 | 凭据服务无调用方 ACL（任意插件可 resolve 任意 ref） | 宿主 `credentials` | 加 caller 作用域 |
| 3 | `llm/stream` waterfall 使对话内容对任意插件全裸（**密钥不经此泄露**） | 宿主 `llm` | 设计如此，建议文档明示 |
| 4 | GUI 无任何 CSP；模型输出可触发远程图片自动加载（信标信道） | 宿主 `frontend-static` | 至少 `default-src 'self'` |
| 5 | LAN 部署 cookie 无 `Secure`、明文 HTTP 传密钥 | 宿主 `browser-auth` + 部署 | 强制 TLS 或加 `Secure` |
| 6 | `match()` 允许 exact 静默遮蔽他人 prefix | 宿主 `webserver` | exact 落在他人 prefix 下时告警/拒绝 |
| 7 | `tool-calls.ts` 把非法 JSON 参数当原始串执行 | 宿主 `agent-loop` | 改为显式错误结果（本插件 P0-2 已在上游堵住截断来源） |
| 8 | `role('credential-ref')` 不在 wire 脱敏范围（`redact.ts:87-90` fail-open TODO） | 宿主 `settings` | 影响极低（值只是引用名） |
| 9 | 动态插件直连 `ctx.fs`/`ctx.bash` 回退到部署默认 mode 而非会话 mode | 宿主 `tool-cordis` | 核实并修 |
| 10 | 恶意 relay 的内容→执行通道 | 固有属性 | 部署纪律：不要在 `danger-full-access` + 审批禁用下处理不可信上游内容 |

**部署方必须验证**：P0-2 对生产 responses 流的兼容性（§3.3）；非回环 http 地址升级后需迁移到 https（破坏性变更 2）；自定义端点（本地中转/自建网关）需新增 `allowCustomBaseURL: true`（破坏性变更 4）。

---

## 7. 残余风险（第二轮复核后仍存在）

- **F-2 的能力边界**：origin 锚定让审计 PoC（**一次** settings 写入改 `baseURL`）fail-closed，并把重定向升级为需要同时写 `allowCustomBaseURL: true` 的**双字段、显式命名**改动。但能写 settings 的攻击者仍能写这两个字段——插件内无法彻底闭环。真正的闭环在宿主：settings 写入需人工确认，或在 `danger-full-access` 下禁止写 settings。这一条已列入 §6 移交清单。
- **残缺 tool-call 的块仍会被 assembler 从 delta 重建**（`assembler.ts:108-121` 对未 `block-end` 的 tool-call 用累积 delta 组装）。安全性不依赖它的缺席：finish 被强制为 `error`，`agent.ts:443` 因此不会调用 `executeToolCalls`。保留该行为是为了不改变流式增量语义。
- **P0-2 的兼容性风险**（§3.3、§5）：以 EOF 结束的网关会被判为失败。
- **F-6 预流阶段**：`resolveApiKey`（凭据解析）仍在 watchdog 之外；它是本地调用，仅受调用方 signal 约束。

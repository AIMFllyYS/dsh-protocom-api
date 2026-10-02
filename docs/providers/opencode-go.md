# OpenCode Go 订阅

> 默认端点：`https://opencode.ai/zen/go` · provider route `opencode-go-sub` · 凭据命名空间 `OPENCODE_*`（默认 `OPENCODE_GO_API_KEY`）· 遥测路由 `GET /api/opencode-go/usage`

一个分组、一条 route，承载端点 listing 提供的模型；项目内名录登记 41 个条目（含逐模型的 reasoning 词表）。

> 路由名里的 `-sub` 不是装饰：DSH 自带的 `dsh-llm-pi-ai` 插件无条件声明了 `opencode-go` 这个路由名，第二次注册同名会触发 DUPLICATE_DIRECTORY 启动失败。本插件的订阅路由因此叫 `opencode-go-sub`。

## 接入要点

- **会话头**：每个请求同时携带 `x-opencode-session` 与 `x-deepseek-harness-session-id`（同一个 harness session 值）——Go 网关只有部分路径认原生头，缺了返回 400 MissingSessionID。
- **思考强度**：Go 接受裸 `reasoning_effort` 字段、拒绝 `thinking:{type:'disabled'}`，因此该族全部走 effort-only 写法，关闭词按模型实测词表下发（`none`/`off`）。**禁用词是 `off` 的反面——Go 用 `off`，拒绝 `none`**，与 Protocom relay 正好相反。Go 没有分组级默认词表，缺词表就等于没有思考控制，因此"每个可提供模型都必须有词表"是一条注册表守卫。
- **思考回传**：`reasoning_content`（多数模型）、`reasoning` + `reasoning_details`（minimax-m2.5，OpenRouter 风格）、内联 `<think>…</think>`（minimax-m3，自动从正文剥出）三种形态都已接入，统一流入 DSH 的 reasoning-delta 折叠显示。
- **拒绝的模型**：`hy3-preview` 与 `minimax-m2.7` 实测被端点拒收（503/不可用），永不进菜单；`kimi-k2.6` 在 Go 上返回 **410 Gone**，同样在拒用列表。
- **配额显示**：设置页内嵌 Go 的三窗口配额条（5 小时 / 每周 / 每月的用量百分比 + 重置时间），读取 `GET /v1/usage`。

## 协议路由

大部分模型走 chat-completions；`grok-4.6`、`muse-spark-1.2/1.3`、`gpt-5.6-luna` 实测**只在 `/responses` 上可服务**，这几个模型在名录里单独登记为 responses 通道。选错通道的代价是每次必然 503。

## 常见问题

**某个模型一调用就 503 `Endpoint is unavailable`**：该族有一部分模型只认 `/v1/responses`。0.6.1 之前 `grok-4.7` 缺少名录条目，协议回落到分组的 chat 通道，于是每次必然 503（实测 0.6 秒返回、重试 3 次全失败）；现已登记为 responses 通道，升级即可用。

**某个模型没有思考强度菜单**：1.2.3 之前 Go 有 12 个条目没有词表，且该族没有分组默认值兜底。1.2.3 逐个实测补齐（`hy3`、`hy4-preview`、`longcat-2.5-preview-free` 七档全接受；`mimo-v2.5`、`mimo-v2.6-flash`、`mimo-v2.6-pro` 接受 `none/low/medium/high`），升级即可。

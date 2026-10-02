# ClinePass 订阅

> 默认端点：`https://api.cline.bot/api/v1` · provider route `clinepass` · 凭据命名空间 `CLINE_*`（默认 `CLINE_API_KEY`）· 无遥测路由（该订阅不提供余额端点）

Cline 的订阅产品：在 Cline 的 OpenAI 兼容 chat-completions 表面上，跑一套为 agent 场景精选的开源编码模型。**它不是独立网关**——host、路径、bearer 认证与 Cline 的其他 provider 相同，差别只有 `cline-pass/` 命名空间和订阅范围的配额。**不带会话头**：该端点接受无会话请求。

一个分组、一条 route，名录即菜单，共 **14 个模型**（2026-09-28 与 Cline 官方 SDK 源码及实测核对）：

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `clinepass` | `clinepass` | chat-completions | Cline 精选的一套开源编码模型 |

## 接入要点

- **`GET /api/v1/models` 是诱饵**：公开、458 行、**没有一个 `cline-pass/*` 条目**——那是 Cline 的按量付费目录，不是这个订阅的名单。真正的名单是 `GET /api/v1/ai/cline/recommended-models`（公开、无需密钥，带 `clinePass` 数组 14 个 id）。因此该族的 `listingIsMembership` 是 **false**：**名录就是菜单**，而不是像其他族那样"listing 为主、名录做投影"。
- **能力数据取自 Cline 自带 model catalog**，不用 models.dev：两者在若干模型上分歧，`qwen3.8-max` 最尖锐——models.dev 报 100 万上下文且支持图片，Cline 实际是 **128K 且不支持图片**。厂商自己公布的数字优先。
- **点名拒绝 4 个已下线 id**：`cline-pass/glm-5.2`、`cline-pass/kimi-k2.6`、`cline-pass/kimi-k2.7-code`、`cline-pass/deepseek-v4-flash`（Cline 公告：因容量与模型升级下架）。点名而不是静默省略，是为了让已经选中它们的部署读到"端点不提供此模型"，而不是一个没来由的 400——恢复任一 id 也只需要一行。
- **只有开关的模型**：catalog 里声明为 reasoning **toggle**、而非深度档的模型，词表是 `none`/`medium`——Cline 自己的归一化把 `enabled: true` 映射成 `medium`，所以 `medium` 是"开"、`none` 是"关"。给这类模型编造 low/high，只会得到一个网关兑现不了的菜单。
- **密钥引用**：`CLINE_*` 命名空间，默认 `CLINE_API_KEY`。Cline 发的是普通 API key，所以密钥池天然适配——每把引用都是一份独立订阅，`CLINE_API_KEY_2` 就是池里的第二把。
- **思考字段**：该族发 `reasoning: {enabled, effort}`，既不带 `thinking` 块也不带裸 `reasoning_effort`。**这是本仓证据最弱的一处**，出处已写在 `src/clinepass.ts` 注释里——若实测推翻，要改的就是这一个词。
- **无余额面板**：ClinePass 不提供对应端点，设置页该族渲染为「余额不可用」而不是红色报错。

## 常见问题

**保存密钥时提示"这是驱动器路径，不是 API key"**：密钥字段里粘了一个**文件夹路径**（如 `C:\Users\...\xxx (1)`），与 Cline 无关，典型来源是资源管理器的「复制文件地址」。换填真密钥即可。1.2.3 起这类形状在**保存时**就被拒绝并说明，不会再拖到下一次请求、以"HTTP 头"的措辞在别的字段上报错。

**Cline 官网能看到的某个模型不在菜单**：要么它不在 `recommended-models` 的 14 个 id 里（那个订阅名单才是菜单），要么它在已下线的 4 个 id 里。`/api/v1/models` 的 458 行是 Cline 的按量付费目录，不是 ClinePass 名单。

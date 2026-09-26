# dsh-protocom-api

DeepSeek Harness (DSH) v1.5 插件：接入两个订阅源——

- **Protocom 官方 API**（OpenAI 兼容，默认端点 `https://relay.protocom.org`）
- **OpenCode Go 订阅**（`https://opencode.ai/zen/go`），设置页与 Protocom 并列、菜单交互完全一致

Protocom 四个分组对应四条独立 provider route，各自配置 API key：

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `aggregate` | `protocom-aggregate` | chat-completions | 开源聚合模型 |
| `codex` | `protocom-codex` | responses | Codex 系列 |
| `stepfun` | `protocom-stepfun` | responses | 阶跃星辰系列（走官方 Responses 通道；该分组的 chat-completions 门面存在转译缺陷，见 0.4.0） |
| `grok` | `protocom-grok` | chat-completions | Grok 系列 |

OpenCode Go 一个分组一条 route（`opencode-go-sub`），承载端点目前提供的约 28 个模型：

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `go` | `opencode-go-sub` | chat-completions | OpenCode Go 订阅全量模型；grok-4.6、muse-spark-1.2/1.3、gpt-5.6-luna 实测只在 /responses 上可服务，这几个模型单独走 responses 通道 |

### OpenCode Go 接入要点

### Command Code 接入要点

Command Code 一个分组一条 route（`commandcode`），实测 listing 共 **82 个模型**（2026-09-23，无需密钥即可拉取）：

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `cc` | `commandcode` | chat-completions | 端点在自己的 listing 里声明每个模型走哪条通道；**73 个模型可服务** |

- **按端点声明路由**：`supported_endpoints` 是路由真相——82 个中 65 个声明两条 OpenAI 通道都可、8 个仅 chat、**9 个（全是 Claude）仅 `/messages`**。仅 Anthropic 通道的模型发到 OpenAI 通道必 400，因此这 9 个**暂时隐藏**，而不是列出来每次调用都失败。
- **不带手写名录**：行内已披露 `context_length` 与 `supported_endpoints`，手写副本只会过期。
- **上下文档位**：从实测的九个不规则长度（200000/256000/262000/262144/400000/500000/1000000/1048576/1050000）取四档 200K/256K/400K/1M。
- **账户面板**：暂未提供。`/alpha/whoami` 等端点确实存在（无效密钥返回 401 而非 404），但响应形状本机未验证，而本插件只渲染被请求确认过的字段。
- **密钥引用**：`COMMANDCODE_*` 命名空间，默认 `COMMANDCODE_API_KEY`。

### OpenCode Go 接入要点

- **会话头**：每个请求同时携带 `x-opencode-session` 与 `x-deepseek-harness-session-id`（同一个 harness session 值）——Go 网关只有部分路径认原生头，缺了返回 400 MissingSessionID。
- **思考强度**：Go 接受裸 `reasoning_effort` 字段、拒绝 `thinking:{type:'disabled'}`，因此该族全部走 effort-only 写法，关闭词按模型实测词表下发（`none`/`off`）。
- **思考回传**：`reasoning_content`（多数模型）、`reasoning` + `reasoning_details`（minimax-m2.5，OpenRouter 风格）、内联 `<think>…</think>`（minimax-m3，自动从正文剥出）三种形态都已接入，统一流入 DSH 的 reasoning-delta 折叠显示。
- **拒绝的模型**：`hy3-preview` 与 `minimax-m2.7` 实测被端点拒收（503/不可用），永不进菜单。
- **配额显示**：设置页内嵌 Go 的三窗口配额条（5 小时 / 每周 / 每月的用量百分比 + 重置时间），读取 `GET /v1/usage`。

## 功能特性

- **模型实时探测**：`GET /v1/models` 拉取分组可见模型（60s 缓存），内置美化名录投影——`deepseek/deepseek-v4.1-flash` 显示为 `DeepSeek V4.1 Flash [1M]`；名录外模型显示原 ID；名录内但探测不到的不显示。
- **上下文长度可选**：每个可选长度在模型菜单中呈现为独立条目（如 `DeepSeek V4.1 Flash [256K]`），选择即驱动上下文压力与压缩阈值。档位表是 200K/256K/400K/1M，**并且模型自己的窗口永远是最后一档**——阶梯是二进制而厂商公布十进制，缺了这一条会让 1M 模型最高只能选 400K。**超过模型窗口的档位绝不提供**：端点公布了长度的（如 Command Code，每行都带 `context_length`）按公布值过滤，没公布的才用分组阶梯。二进制与十进制的一百万分别标为 `1M` 与 `1M (dec)`，不会混淆。
- **思考强度二级菜单**：模型菜单自动出现 Effort 子菜单。词汇**逐模型且按族不同**——**两个族的禁用词正好相反**（实测）：Protocom relay 用 `none` 并拒绝 `off`，OpenCode Go 用 `off` 并拒绝 `none`，所以不能共用一份词表。relay 侧 `kimi-k3` 实测接受 `minimal/low/medium/high/xhigh/max`；Codex 分组走 responses 协议的 `reasoning.effort`。思考内容以 `reasoning-delta` 流式接入，聊天界面折叠显示。 **Command Code 的档位逐模型取自厂商自己的 CLI 目录**（该网关的列表只公布路由、能力页只公布布尔值，两处都没有深度列表）：`deepseek-v4-pro` 是 `high/max`，`gpt-5.6-sol` 是 `low/medium/high/xhigh/max`，而 29 个模型厂商不接受任何深度，就不给控件——而不是伪造一个。
- **缓存感知的用量统计**：`cached_tokens` → `cacheReadTokens` 不相交换算，DSH 自带的缓存命中率、每轮 TPS、token 明细全部正确生效。
- **余额与用量显示**：设置页每个分组卡片内嵌余额区——限额模式显示剩余额度大数字 + 用量进度条（>80% 警示），订阅/钱包模式显示余额与套餐；附今日用量、速率窗口、计费倍率、到期时间与手动刷新。
- **图片输入（多模态）**：模型是否可接收图片按「显式设置 → 名录已验证结论 → 默认放行」判定；`visionModels` 可逐个模型声明纯文本。chat-completions 与 responses 两条协议都支持内联 base64 图片（含工具结果里的图）。实测：阶跃星辰 `step-5-preview`、`step-3.7-flash` 均可直接发图。
- **多 API key 密钥池**：每个分组可配多把密钥（`apiKeys`），并选择分配方式——**粘性**（默认，每个会话固定一把，缓存前缀持续命中）或**轮询**（每次请求轮换，均衡负载但牺牲缓存）。被上游判定为密钥问题（401/429）的那把会被临时停用并自动切换。详见下文。
- **断线自动重试（可调预算）**：设置 → 高级 → 「重试最大次数」「重试最长时间」。掉线、超时、5xx、限流等**瞬时故障**会在同一回合内按退避阶梯自动重试：从 0.5 秒起逐次翻倍直到设定上限（默认 1 小时），总预算默认 20 次——**默认即可覆盖约 8 小时断网**，夜间任务不会因中转站抖动而静默中断。密钥错误、请求格式错误等**永久故障立即失败**，不会空烧预算。
- **Fusion 双模型（指挥位/执行位）**：设置 → 「Fusion 双模型」配置两个席位——主线对话走**指挥位**，所有子智能体请求固定走**执行位**。详见下文。
- **引导式设置页**：设置 → 「Protocom API」「OpenCode Go」「Command Code」三个并列整页，中英双语。每张分组卡片可折叠；卡片内是该分组自己的菜单模型，列表固定高度滚动；「刷新模型」拉取该分组自己的 listing；原始「模型和上游 ID」表格收在折叠项里。分组卡片带启用开关（switch）、密钥状态圆点、保存密钥即自动启用分组。
- **逐行摘要 + 按需展开**：模型行默认只显示**一行摘要**（`DeepSeek V4.1 Flash │ 200K · 256K · 400K · 1M │ vision │ ▸`）和**一个**展开按钮；上下文档位、视觉、置顶、能力藏在展开区并带字段标签。展开**互不影响**，可同时开多行对比。默认视图因此从「每行四个控件簇 × 六七十行」降到每行一个控件，交互尺寸满足 WCAG 2.2 的 24×24 下限。

## Fusion 双模型（指挥位 / 执行位）

设置 → 「Fusion 双模型」→ 「配置」，选好两个席位后保存。命名灵感来自 Cognition Devin 的 Fusion：强模型负责规划与评审，性价比模型负责执行。

| 席位 | 谁在用 | 如何生效 |
| --- | --- | --- |
| **指挥位** Leader | 主线对话 | 软应用：保存时写入 `agent-default-model` 并 selectModel 当前顶层会话；composer 里仍可临时换型 |
| **执行位** Coder | 一切子智能体（spawn / fork / 孙级 / 冷恢复） | 强制：`agent/request` waterfall 在每次请求前改写 provider/model/effort |

要点：

- **判定依据是持久化字段** `session.header.origin === 'subagent'`，不是运行期标记——所以冷恢复、后台 continuable、workflow/ralph 内部 spawn 的子智能体都覆盖到。
- **改写在 `prepareCall` 之前**，因此按执行位做能力校验，落盘的 `request/header` 就是实际服务的路由；子会话的压缩/标题等辅助调用读同一个 header，自动跟随执行位，无需额外规则。
- **「fork 子智能体也用执行位」**（默认开）。fork 会继承父前缀，harness 刻意让它保持同路由以复用 KV cache；打开此项即用一致性换掉这份复用。
- **席位 effort 留空 = 用模型默认**，并会显式清掉从父级继承来的 effort（父级词表不属于执行位模型）。
- **执行位路由失效**（provider 被禁用 / 模型被删）会响亮失败：请求报错、委派以诊断回报，设置页把该席位标红保留而不是静默丢弃。
- **进程外子智能体不受控**：ACP / Claude Code / SDK 等自行起进程，模型由对方决定，本插件管不到。
- 关闭开关即恢复原样；已在运行中的子会话因为 header 已按当时配置记录，不受后续关闭影响。

## 多 API key 密钥池

分组卡片里的「密钥池」可以填写多把凭据引用（每行一个，**只填引用名，不填密钥本身**；密钥值仍走凭据服务），下方「密钥选择方式」决定怎么分配：

| 方式 | 行为 | 代价 |
| --- | --- | --- |
| **粘性**（默认） | 每个会话固定一把密钥，整轮对话都落在同一个账号 | 无——**这是缓存友好的选择** |
| 轮询 | 每次请求轮换 | 相邻步骤落到不同账号，**前缀缓存每步失效**，输入 token 费用显著上升 |

**为什么默认粘性**：DSH 每一步都会重发同一个不断增长的前缀，并在服务端复用 KV 缓存；如果每步换账号，缓存全部落空，整个长任务的开销会被乘上数倍。轮询只在你更在意「分散额度消耗」时才值得。

其它行为：

- **新会话按哈希分散**到池中各把密钥，避免一次繁忙的任务把单个账号额度抽干。
- **被上游拒绝的密钥自动停用 1 分钟**（仅限 401/429 这类凭据本身的失败；5xx、超时、请求格式错误不会触发——它们不说明密钥有问题）。
- 某会话固定的密钥被停用时，该会话**改绑到替补密钥并保持**，不会来回抖动。
- 无会话的请求（模型列表、探测）没有前缀可保，自动轮询。
- 池中每把引用都必须匹配该族的凭据命名空间（如 `PROTOCOM_*`、`OPENCODE_*`）；重复引用会被拒绝。

## 断线自动重试（夜间任务存活）

设置 → 任一 provider 页面 → 底部「高级」→「重试最大次数」「重试最长时间」，改完点「应用」。

| 设置 | 默认 | 含义 |
| --- | --- | --- |
| 重试最大次数 | 20 | 瞬时故障后最多重试几次（0 = 关闭重试） |
| 重试最长时间 | 3600000（1 小时） | 单次退避等待的上限 |

**退避阶梯**：从 0.5 秒起逐次翻倍（0.5s → 1s → 2s → …），到达上限后一直保持。默认组合覆盖约 **8 小时**的累计等待，足以撑过一夜的中转站故障。

**只重试瞬时故障**：`TRANSPORT`（连接断开）、`TIMEOUT`（流卡住）、`SERVER`（5xx）、`RATE_LIMIT`（429）、`EMPTY_RESPONSE`（模型只思考不输出）。密钥错误 `AUTH`、请求格式错误 `INVALID_REQUEST` 等**永久故障立即失败**——重试它们只会空烧预算并推迟诊断。

**改完立刻生效，无需重启**：DSH 在「注册路由时」捕获重试策略，而本插件每次设置变更都会原子地 `replace()` 重新注册路由，因此新预算会走到下一次请求。

**注意**：每次重试都是一次**真实计费**的请求；重试对模型不可见，不污染上下文，也不会重复已产出的内容。若机器夜间会休眠，任何定时器都不可靠——那种情况需要在操作系统层保证进程存活。

## 首次安装

要求：**DSH ≥ 0.1.7-rc.2**，pnpm。

> ⚠️ **1.0.0 是破坏性升级。** DSH 1.7 重写了设置子系统并删除了 `offloadRequestImagesWithPolicy`，旧接口已不存在，因此没有同时兼容 0.1.6 与 0.1.7 的写法。
> 0.1.6 及以前请用 **0.8.0**。从旧版本升级时必须改配置形状，见下方《配置密钥》。

```bash
# 在 DSH 仓库目录执行（web profile；用其他 profile 就替换名字）
pnpm dsh plugin --profile web add "github:AIMFllyYS/dsh-protocom-api"
pnpm dsh web
```

仓库自带预构建产物（`lib/`），git 安装零构建、不触发 pnpm allowBuilds 拦截。安装命令会自动初始化 profile 并把插件追加进 `dsh.profile.bundles`，无需手改任何 YAML。

也可以从本地目录安装（开发用，重新 build 即生效）：

```bash
pnpm dsh plugin --profile web add "/path/to/dsh-protocom-api-plugin"
```

## 配置密钥

**界面方式（推荐）**：设置 → Protocom API → 对应分组卡片 → 粘贴 API key → 保存密钥（保存即自动启用该分组）→ 点「探测模型」验证 → 卡片底部查看余额。

**配置文件方式**：编辑 profile 的 patch（1.7 起不再是 `settings.yaml`，该文件已被宿主改名归档为 `settings.yaml.imported`）：

```yaml
- id: protocom-api
  config:
    protocom:
      # 默认锚定官方 relay。改用自建/中转网关时需同时打开下面这行：
      # allowCustomBaseURL: true
      groups:
        aggregate:
          enabled: true
          apiKey: PROTOCOM_AGGREGATE_API_KEY   # credential-ref 引用名，不是密钥本身
          contextLengths: [204800, 262144, 1048576]   # 可选：启用上下文变体
          showBalance: true                    # 默认 true
```

**从 0.8.0 升级**：四个分节从顶层收进了各自的名字下——1.7 下一个插件行只能有一个表单，所以四个功能共用一个 `Config`：

| 旧（≤0.8.0） | 新（1.0.0） |
| --- | --- |
| `groups:`（顶层） | `protocom.groups:` |
| `opencode:` | `opencodeGo:` |
| `commandcode:` | `commandcode:` |
| `fusion:` | `fusion:` |

没写的分节由 schema 补默认值，所以只写 `protocom` 也能正常挂载。**界面方式不受影响**：设置页会自动渲染全部四个分节。

旧值一般还留在 `~/.dsh/settings.yaml.imported`（宿主只在 `settings.yaml` 存在时导入一次，而那次导入发生在插件还没有可写表单的时候，因此**没有被导入**）。仓库自带迁移脚本：

```bash
node scripts/migrate-legacy-settings.mjs ~/.dsh/settings.yaml.imported migrated.yml
# 校验无误后把 migrated.yml 的内容追加到 profile 的 cordis.patch.yml
```

脚本会打印重命名对照，并在写出前用插件真实的 `Config` schema 校验结果——形状写错是**静默失败**（旧形状照样能解析，只是全部落到默认值，看起来像插件装了却没生效）。

密钥值放入 `~/.dsh/.credentials.yaml`，或启动时经同名环境变量注入：

```bash
PROTOCOM_AGGREGATE_API_KEY=sk-... pnpm dsh web
```

密钥只经凭据引用解析（优先凭据托管存储，其次环境变量），永不落盘进配置。

## 更新与卸载

```bash
pnpm dsh plugin --profile web update dsh-protocom-api   # 更新到最新 main
pnpm dsh plugin --profile web remove dsh-protocom-api   # 卸载
```

## 验证安装

1. 设置 → Protocom API → 分组卡片「探测模型」能拉回模型列表（美化名 + 上下文 chips）
2. 聊天界面模型菜单出现对应分组条目，二级菜单可选思考强度
3. 发一条消息：思考模型有折叠思考区，统计区显示缓存命中率与 TPS
4. 分组卡片余额区显示剩余额度/余额

## 余额端点

Host 提供 `GET /api/protocom-api/balance`，它挂在 Host 的共享、带围栏的 `/api` 通道上（`connection.fetch.register`），由当前载体施加自己的信任策略：

- **Web 载体**：Host/Origin 围栏 + 浏览器 HMAC cookie。无 cookie 一律 401；Host 非回环且非 `trustedHosts` 一律 403；`sec-fetch-site: cross-site` 或 Origin 不同源一律 403
- **桌面载体**：走 IPC 边界。`webserver` 被禁用的桌面 profile 同样可用（旧实现把路由注册在 `webServer` 上，桌面端根本不注册，余额面板必然 404）
- 无参数返回所有已启用且 `showBalance` 的分组；`?group=<aggregate|codex|stepfun|grok>` 单查并附带计费倍率
- 每分组 60s 成功缓存 + 5s 失败退避；失败响应为固定文案，细节只进本地日志
- 所有响应带 `Cache-Control: no-store` 与 `X-Content-Type-Options: nosniff`

没有 `connection` 服务的 profile（headless/sdk/acp）不注册该路由，前端把 401/403/404 统一渲染为「余额不可用」而不是红色报错。

## 安全与部署纪律

本插件与 Host 同进程、全权限，Host 的 `SAFETY.md` 明说不应把 DSH 当作唯一安全控制——**插件自身的边界代码就是最终防线**。以下约束不是可选项：

- **baseURL 必须 https**，只有回环主机（`localhost`、`::1`、`127.0.0.0/8`）允许明文 http。明文 http 会让 Bearer key 裸奔过网，也让上游响应可被中间人改写；在 `danger-full-access` 下等于一次响应即可执行任意命令。userinfo、query、`#` 一律拒绝（它们能把一个「看起来可信」的地址解析到别的主机）。
- **端点 origin 默认锚定在官方 relay**。`baseURL` 的 origin 必须等于 `https://relay.protocom.org`，否则插件拒绝加载；使用本地中转或自建网关时必须同时显式设置 `allowCustomBaseURL: true`（该字段**没有默认值**，必须主动写）。作用：审计里「一次 settings 写入即可把已保存的真实 key 改发到 `http://127.0.0.1:19999`」的 PoC 现在 fail-closed。高级面板提供同名勾选框，与应用 baseURL 同批原子写入。
- **凭据引用必须匹配 `PROTOCOM_[A-Z0-9_]+`**。该引用名会被用于 `process.env` 回落读取，放宽命名等于允许把任意环境变量名发给任意端点。
- **不要在处理不可信上游内容时使用 `danger-full-access` + 审批禁用**。第三方端点本来就控制流式内容与工具调用，这是选择第三方 relay 的固有代价，插件无法消除。
- **模型发现只把已存密钥发给配置的 origin**。给别的端点探测必须显式传一次性 `apiKey`（设置页「新增 provider」流程本就如此）。
- **Windows 上 `.credentials.yaml` 是明文**且不做 mode 检查；LAN 部署下 Host 的会话 cookie 也没有 `Secure`。跨主机部署请强制 TLS。

## 常见问题

- **探测报 "group is disabled"**：该分组未启用。打开卡片上的启用开关，或直接保存一次密钥（会自动启用）。
- **探测报 401**：key 未配置或无效；确认密钥已保存且状态圆点为绿色。
- **阶跃星辰从第二轮开始报 `Upstream error: 400`**：0.3.x 及更早版本该分组走 chat-completions 门面，而该门面在这个中转站上**无法回放任何历史**（assistant 文本/reasoning 一出现就被上游拒）。0.4.0 起该分组默认走 responses 通道；若你手写过 `protocol: chat-completions`，删掉它即可恢复默认。
- **某个 route 只有 chat-completions，且一回放历史就 400**：这是中转站把 assistant 文本渲染成上游不接受的形状所致（0.4.0 记录）。若该 route 有 responses 通道，直接 `protocol: responses`；没有的话用 `assistantTextReplay: drop`（丢弃 assistant 自己的文字、保留工具调用）或 `user`（把这段文字改挂到 user 条目、角色归属被改写）。实测两者都能跑通，`keep`（默认）在该类 route 上必然 400。
- **某个分组在设置页里看不到模型行**：该分组未启用或未配置密钥。启用并保存密钥后面板会自动拉取该分组自己的 listing（也可点「刷新模型」）。
- **上下文变体不生效**：在**该分组卡片内**对应模型行上勾选档位（写回 `modelContexts`）。分组自带的梯子（StepFun 为 200K/256K/400K/1M）未手动改过时不落盘。
- **上传图片没有入口 / 报 `UNSUPPORTED_CONTENT`**：说明该模型的图片能力被显式关闭了（`visionModels` 为 `false`，或名录标注 `vision: false`，如 GLM 系）。在对应模型行点「仅文本 / 视觉」切换即可。
- **某个模型明明列在端点里却不在菜单**：它的 id 在 `REFUSED_CHAT_MODEL_IDS` 里——实测该端点拒绝为它服务。两种情形都收在这里：只被本通道拒绝（StepFun 的音频/图像模型 404、两个 3.5 快照 400），以及**两条协议都拒绝**（4 个 aggregate id 报 `not available on this endpoint`，它指的那条 `/provider/v1/...` 实测是 Cloudflare HTML 页而非 API）。展开卡片的「模型和上游 ID」可看到它被标注为「端点提供：否」。
- **发图后上游报错点名该模型**：未收录模型默认放行图片，遇到真正纯文本的模型时由上游拒绝。把该模型切成「仅文本」即可恢复本地拦截。
- **GLM 5.3 Flash（或其它模型）用一两次工具之后彻底停住，没有下一轮**：这是 0.6.1 修掉的问题。上游会间歇性地「只想不说」地收尾 —— 思考满格、正文为空、`finish_reason: "stop"`（同一提示词实测 16 次里 5 次），而翻译层把思考也算作「有输出」，于是 agent 被判定为正常完成：不报错、不重试、界面停在原地。0.6.1 起这种退化完成映射到可重试的 `EMPTY_RESPONSE`，自动重发该步（默认最多 5 次）。升级即可，无需改配置。
- **阶跃星辰每次工具调用前都要思考很久**：`reasoning.effort` 在该中转站上真实生效（实测 `minimal`/`low` 的 reasoning token 为 0，`medium`/`high` 为 14/24），但 0.6.1 之前 `stepfun` 分组没有声明词表，模型菜单里**不出现 Effort 子菜单**，思考预算不可控。0.6.1 起可在对应模型的二级菜单里选 `minimal`/`low`/`medium`/`high`；想快就选 `minimal` 或 `low`。
- **OpenCode Go 里某个模型一调用就 503 `Endpoint is unavailable`**：该族里有一部分模型只认 `/v1/responses`（grok / muse-spark / gpt-5.6-luna）。0.6.1 之前 `grok-4.7` 缺少名录条目，协议回落到分组的 chat 通道，于是每次必然 503（实测 0.6 秒返回、重试 3 次全失败）；现已登记为 responses 通道，升级即可用。

## 开发

```bash
pnpm install
pnpm run build   # tsdown → lib/index.js（Host，ESM）+ lib/client.js（Web client，CJS 工厂）；tsc -b → lib/types
pnpm run test    # vitest，235 用例（含安全回归）
pnpm run check:consistency   # 构建后断言 lib/ 与 src/ 一致（CI 闸门：build && git diff --exit-code）
```

本仓约定 `lib/` 构建产物随源码一起提交（保证 git 安装零构建），改完代码务必先 `pnpm run build` 再提交。

## 措辞约定

本插件对接的是 **Protocom 官方 API**。文档、界面与注释中不使用其他称呼。

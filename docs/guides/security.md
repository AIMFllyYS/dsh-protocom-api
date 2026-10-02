# 安全与部署纪律

> 这一节是给「会把它跑在共享机器上」的人看的，值得读完再上线。

本插件与 Host 同进程、全权限，Host 的 `SAFETY.md` 明说不应把 DSH 当作唯一安全控制——**插件自身的边界代码就是最终防线**。以下约束不是可选项。

## baseURL 钉死

官方 `baseURL`（`relay.protocom.org` / `opencode.ai` / `api.commandcode.ai` / `api.cline.bot`）写死在代码里，**配置面板默认不提供覆盖入口**——**baseURL 决定 API key 被发往哪里**，留一个可编辑的端点字段等于给「配置即代码」的部署留了一个密钥外泄通道（共享 profile 的任何写入者都能把凭据引去任意主机）。

- **baseURL 必须 https**，只有回环主机（`localhost`、`::1`、`127.0.0.0/8`）允许明文 http。明文 http 会让 Bearer key 裸奔过网，也让上游响应可被中间人改写；在 `danger-full-access` 下等于一次响应即可执行任意命令。userinfo、query、`#` 一律拒绝（它们能把一个「看起来可信」的地址解析到别的主机）。
- **端点 origin 默认锚定在该族的官方端点**：`protocom` 必须等于 `https://relay.protocom.org`，`opencodeGo` 锚定 `https://opencode.ai`，`commandcode` 锚定 `https://api.commandcode.ai`，`clinepass` 锚定 `https://api.cline.bot`，否则插件拒绝加载。使用本地中转或自建网关时必须同时显式设置该分节的 `allowCustomBaseURL: true`（该字段**没有默认值**，必须主动写）。作用：审计里「一次 settings 写入即可把已保存的真实 key 改发到 `http://127.0.0.1:19999`」的 PoC 现在 fail-closed。高级面板提供同名勾选框，与应用 baseURL 同批原子写入。
- **凭据引用必须匹配该族的命名空间**：`PROTOCOM_[A-Z0-9_]+`、`OPENCODE_[A-Z0-9_]+`、`COMMANDCODE_[A-Z0-9_]+`、`CLINE_[A-Z0-9_]+`。该引用名会被用于 `process.env` 回落读取，放宽命名等于允许把任意环境变量名发给任意端点。
- **模型发现只把已存密钥发给配置的 origin**。给别的端点探测必须显式传一次性 `apiKey`（设置页「新增 provider」流程本就如此）。

## 遥测路由

三条只读路由（`/api/protocom-api/balance`、`/api/opencode-go/usage`、`/api/commandcode/account`）通过 DSH **Host 共享、带围栏的 `/api` 通道**暴露（`connection.fetch.register`），**不开第二个端口**，由当前载体施加自己的信任策略：

| 路由 | family | 形状 |
| --- | --- | --- |
| `GET /api/protocom-api/balance` | Protocom | 余额 / 配额、计费倍率 |
| `GET /api/opencode-go/usage` | OpenCode Go | 三窗口配额（5 小时 / 每周 / 每月 + 重置时间） |
| `GET /api/commandcode/account` | Command Code | 账户 + 额度 + 套餐身份（两个半边各自降级） |

ClinePass 不注册遥测路由（该订阅不提供对应端点）。

围栏细节：

- **Web 载体**：Host/Origin 围栏 + 浏览器 HMAC cookie。无 cookie 一律 401；Host 非回环且非 `trustedHosts` 一律 403；`sec-fetch-site: cross-site` 或 Origin 不同源一律 403。
- **桌面载体**：走 IPC 边界。`webserver` 被禁用的桌面 profile 同样可用（旧实现把路由注册在 `webServer` 上，桌面端根本不注册，余额面板必然 404）。
- `/api/protocom-api/balance` 无参数返回所有已启用且 `showBalance` 的分组；`?group=<aggregate|codex|stepfun|grok>` 单查并附带计费倍率。
- 每分组 60s 成功缓存 + 5s 失败退避；失败响应为固定文案，细节只进本地日志。**共享部署上这条路由是公开的**，缓存防止它被变成对上游余额端点的免费放大攻击。
- 所有响应带 `Cache-Control: no-store` 与 `X-Content-Type-Options: nosniff`。

没有 `connection` 服务的 profile（headless/sdk/acp）不注册该路由，前端把 401/403/404 统一渲染为「余额不可用」而不是红色报错。

## 密钥边界

- 密钥**只存凭据服务**（OS 凭据仓库）；设置面板、配置文件、遥测响应都不回显密钥值。设置页只显示「已配置 / 未配置」。
- 日志**自动脱敏**后写入：面板上的「诊断日志」可直接整段贴给他人排查，不含密钥。脱敏器（`redact.ts`）对 `Authorization`/`api-key`/`token`/`key` 等字段按**已知密钥名单逐值替换**，不复用跨服务黑名单。
- `additionalModelRequestParams` / `additionalBodyParams` **不序列化、不出现在任何日志或错误**。
- **Windows 上 `.credentials.yaml` 是明文**且不做 mode 检查；LAN 部署下 Host 的会话 cookie 也没有 `Secure`。跨主机部署请强制 TLS。

## 安装侧

仓库**只提交 lockfile 明确钉住、且 `lib/` 目录由一致性检查可复现验证的代码**；git 依赖安装时 `pnpm` 的 `prepare` 钩子会重新构建——若有人篡改仓库里的 `lib/`，你安装时本地的 `pnpm run build` 会覆盖它（前提是本地依赖完整可装）。

## 一份诚实的边界说明

- **不要在处理不可信上游内容时使用 `danger-full-access` + 审批禁用**。第三方端点本来就控制流式内容与工具调用，这是选择第三方 relay 的固有代价，插件无法消除。
- 本插件是**类型化 TypeScript 客户端**，不是密钥保险库：进程崩溃转储、调试器、或同机恶意进程可读到内存中的密钥——这与任何持有密钥的客户端一致。
- 中继端点日志由**各上游自行负责**；中转站的计费策略（缓存命中是否计费、各分组倍率）请在对应面板自查。
- 若你的环境需要**网络出口审计**，可把 Host 日志级别调到 `debug`——所有出站请求在 `redact.ts` 之后记录，路径与耗时可见、密钥不可见。

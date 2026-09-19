# dsh-protocom-api

DeepSeek Harness (DSH) 插件：接入 **Protocom 官方 API**（OpenAI 兼容网关，baseURL `https://relay.protocom.org`），以四个分组对应四条 provider route，各分组独立配置 API key。

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `aggregate` | `protocom-aggregate` | chat-completions | 开源聚合模型 |
| `codex` | `protocom-codex` | responses | Codex 系列 |
| `stepfun` | `protocom-stepfun` | chat-completions | 阶跃星辰系列 |
| `grok` | `protocom-grok` | chat-completions | Grok 系列 |

## 安装

本包声明了 `dsh.bundle.patch`，随 bundle 组装时通过 `cordis.patch.yml` 插入：

```yaml
- insert:
  - id: protocom-api
    name: dsh-protocom-api
```

运行时依赖宿主提供的服务：`llm`（必需）、`settings`（可选，用户设置分层）、`credentials`（可选，密钥托管）、`webServer`（可选，余额端点）。

## 配置

插件配置即 `protocom-api` 设置区的形状（字段均可选）：

```yaml
baseURL: https://relay.protocom.org   # 默认值；末尾斜杠与 /v1 后缀会被归一化
groups:
  aggregate:
    enabled: true                     # 默认 false，启用后才注册对应 route
    apiKey: PROTOCOM_AGGREGATE_KEY    # credential-ref：凭据引用名，不是密钥本身
    contextLengths: [204800, 262144, 1048576]   # 可选：启用上下文变体
    showBalance: true                 # 默认 true：是否出现在余额端点
  codex:
    enabled: true
    apiKey: PROTOCOM_CODEX_KEY
    # protocol 默认 responses，其余分组默认 chat-completions，一般无需覆盖
```

密钥只经凭据引用（`credential-ref`）解析：优先 `ctx.credentials` 托管存储，其次启动环境中的同名环境变量；密钥本身永不落盘进配置。

## 模型目录与美化名录

- 模型目录来自对 `GET {baseURL}/v1/models` 的实时探测（60 秒缓存），经内置名录投影：已知模型显示美化名与实测上下文窗口（如 `DeepSeek V4.1 Flash [1M]`、`Kimi K3 [256K]`）；名录未覆盖的模型显示上游 `display_name`（与 id 相同则显示原 id），上下文窗口兜底 131072。
- 名录内但探测不到的模型不显示。
- 显示名统一为 `{美化名} [{上下文标签}]`，标签按 tokens/1024 换算（200K/256K/400K），≥1M 显示为 `xM`。

## 上下文变体

分组配置 `contextLengths` 后，每个可选长度产出一个独立条目，模型 id 形如 `<上游id>::ctx@<tokens>`；`resolveModel` 上报对应 contextWindow，发起请求时自动还原为上游 id。未配置 `contextLengths` 时每模型仅产出一个不带后缀的默认条目（向后兼容）。名录声明了 `contextOptions` 的模型按交集过滤，空交集退化为默认条目。

## 思考（reasoning）

- 名录模型自带 effort 词表（如 DeepSeek V4.1 Flash：`off/low/high/max`，默认 `off`；Kimi K3：`low/high`，默认 `high`）。
- Codex 分组默认 `minimal/low/medium/high/xhigh`，默认 `medium`，经 responses 协议的 `reasoning.effort` 下发。
- Grok 分组优先使用探测到的 `reasoningEfforts` 元数据，兜底 `low/high`（默认 `high`）。
- chat-completions 协议下：`off` 映射 `thinking: {type: "disabled"}`；其余 effort 映射 `thinking: {type: "enabled"}` + `reasoning_effort`。

## 余额端点

挂载 `webServer` 时提供回环专享端点 `GET /api/protocom-api/balance`：

- 无参数：返回所有已启用且 `showBalance` 分组的标准化余额（配额模式 `limit/used/remaining`，订阅/钱包模式 `balance/planName/subscription` 字段，均兼容解析）。
- `?group=<aggregate|codex|stepfun|grok>`：单个分组。
- 每分组 60 秒缓存；计费倍率端点在 simple 模式部署上可能 404，自动容错合并。
- 仅回环地址（127.0.0.1 / ::1）可访问，否则 403；非 GET 方法 405。

## 设置页

本包附带 Web client 半（`dsh.client`，`platform: web`），向设置页贡献「Protocom API」设置区（slot `settings.section`，order 20，紧随 Models 之后），界面文案中英双语随界面语言切换：

- **页头**：插件简介；「高级」折叠内可覆盖 `baseURL`。
- **四个分组卡片**（开源聚合 / Codex / StepFun / Grok）：启用开关、API key 输入（写入凭据托管并把分组的 `apiKey` 字段指向该 credential-ref，密钥本身不落配置）、只读协议标签、「探测模型」按钮。
- **探测结果表格**：美化名 / 上游 id / 上下文变体复选框（200K/256K/400K/1M，名录声明 `contextOptions` 的模型按名录），勾选即写回该分组 `contextLengths`。
- **余额区**（分组启用且 `showBalance` 时显示）：读取同源 `/api/protocom-api/balance?group=<key>`，展示剩余/总额度或余额+套餐、今日用量、速率窗口与到期时间、计费倍率（按部署披露情况），附加载/失败态与刷新按钮。

所有读写经 Client Remote 完成（`settings.mutate` / `credentials.set` / `llm.discoverModels`），页面在每次写入落账后重取快照。

## 开发

```bash
pnpm install
pnpm run build   # tsdown 打包 lib/index.js（Host，ESM）与 lib/client.js（Web client，CJS 工厂）+ tsc -b 产出 lib/types 类型
pnpm run test    # vitest
```

## 措辞约定

本插件对接的是 **Protocom 官方 API**。文档、界面与注释中不使用其他称呼。

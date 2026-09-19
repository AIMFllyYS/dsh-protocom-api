# dsh-protocom-api

DeepSeek Harness (DSH) v1.5 插件：接入 **Protocom 官方 API**（OpenAI 兼容，默认端点 `https://relay.protocom.org`）。四个分组对应四条独立 provider route，各自配置 API key：

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `aggregate` | `protocom-aggregate` | chat-completions | 开源聚合模型 |
| `codex` | `protocom-codex` | responses | Codex 系列 |
| `stepfun` | `protocom-stepfun` | chat-completions | 阶跃星辰系列 |
| `grok` | `protocom-grok` | chat-completions | Grok 系列 |

## 功能特性

- **模型实时探测**：`GET /v1/models` 拉取分组可见模型（60s 缓存），内置美化名录投影——`deepseek/deepseek-v4.1-flash` 显示为 `DeepSeek V4.1 Flash [1M]`；名录外模型显示原 ID；名录内但探测不到的不显示。
- **上下文长度可选**：每个可选长度（200K/256K/400K/1M）在模型菜单中呈现为独立条目（如 `DeepSeek V4.1 Flash [256K]`），选择即驱动上下文压力与压缩阈值；Kimi K3 上下文固定为实测的 256K。
- **思考强度二级菜单**：模型菜单自动出现 Effort 子菜单。DeepSeek 系 `off/low/high/max`，Kimi K3 `low/high`，Codex 分组 `minimal/low/medium/high/xhigh`（走 responses 协议 `reasoning.effort`），Grok 分组优先采用上游披露的 effort 元数据。思考内容以 `reasoning-delta` 流式接入，聊天界面折叠显示。
- **缓存感知的用量统计**：`cached_tokens` → `cacheReadTokens` 不相交换算，DSH 自带的缓存命中率、每轮 TPS、token 明细全部正确生效。
- **余额与用量显示**：设置页每个分组卡片内嵌余额区——限额模式显示剩余额度大数字 + 用量进度条（>80% 警示），订阅/钱包模式显示余额与套餐；附今日用量、速率窗口、计费倍率、到期时间与手动刷新。
- **引导式设置页**：设置 → 「Protocom API」整页，中英双语。分组卡片带启用开关（switch）、密钥状态圆点、保存密钥即自动启用分组、探测结果表格内直接勾选上下文变体（chips）。

## 首次安装

要求：DSH v1.5+，pnpm。

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

**配置文件方式**：编辑 `~/.dsh/settings.yaml`：

```yaml
protocom-api:
  groups:
    aggregate:
      enabled: true
      apiKey: PROTOCOM_AGGREGATE_API_KEY   # credential-ref 引用名，不是密钥本身
      contextLengths: [204800, 262144, 1048576]   # 可选：启用上下文变体
      showBalance: true                    # 默认 true
```

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

Host 半挂载 `webServer` 时提供回环专享端点 `GET /api/protocom-api/balance`：

- 无参数返回所有已启用且 `showBalance` 的分组；`?group=<aggregate|codex|stepfun|grok>` 单查
- 每分组 60s 缓存；计费倍率端点在部分部署上可能 404，自动容错
- 仅回环地址可访问（否则 403），非 GET 方法 405

## 常见问题

- **探测报 "group is disabled"**：该分组未启用。打开卡片上的启用开关，或直接保存一次密钥（会自动启用）。
- **探测报 401**：key 未配置或无效；确认密钥已保存且状态圆点为绿色。
- **上下文变体不生效**：确认已在探测结果里勾选了长度档位（写回该分组 `contextLengths`）。

## 开发

```bash
pnpm install
pnpm run build   # tsdown → lib/index.js（Host，ESM）+ lib/client.js（Web client，CJS 工厂）；tsc -b → lib/types
pnpm run test    # vitest，38 用例
```

本仓约定 `lib/` 构建产物随源码一起提交（保证 git 安装零构建），改完代码务必先 `pnpm run build` 再提交。

## 措辞约定

本插件对接的是 **Protocom 官方 API**。文档、界面与注释中不使用其他称呼。

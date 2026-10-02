# dsh-protocom-api

[English](./README.md) | **中文**

[![GitHub Release](https://img.shields.io/github/v/release/AIMFllyYS/dsh-protocom-api?display_name=tag&sort=semver)](https://github.com/AIMFllyYS/dsh-protocom-api/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.1.7--rc.2_%3C0.3.0-blue)](#系统要求)
[![Tests](https://img.shields.io/badge/tests-536%20passed-brightgreen)](#开发)

DeepSeek Harness（DSH）插件：把四家 provider family 接进 DSH 的模型菜单——**Protocom 官方 API、OpenCode Go、Command Code（含 GOAT 档）、ClinePass**。四族共用同一套设置界面、模型菜单、密钥池与重试策略：订阅怎么用，四家都一致，不用各学一遍。

第一次接触本项目建议先读 [发布通知](./ANNOUNCEMENT.md)——按「为什么做 / 能做什么 / 怎么装」组织，不假设你读过 CHANGELOG。

## 支持的供应商

| provider family | provider route | 默认端点 | 承载内容 | 详细文档 |
| --- | --- | --- | --- | --- |
| **Protocom 官方 API** | `protocom-aggregate/-codex/-stepfun/-grok` | `https://relay.protocom.org` | 中转站，一个端点四个分组：开源聚合、Codex、阶跃星辰、Grok | [docs/providers/protocom.md](./docs/providers/protocom.md) |
| **OpenCode Go 订阅** | `opencode-go-sub` | `https://opencode.ai/zen/go` | Go 订阅全量模型（名录登记 41 个条目） | [docs/providers/opencode-go.md](./docs/providers/opencode-go.md) |
| **Command Code 订阅** | `commandcode` | `https://api.commandcode.ai/provider` | 套餐包含的模型（实测 listing 82 个、73 个可服务） | [docs/providers/commandcode.md](./docs/providers/commandcode.md) |
| **ClinePass 订阅** | `clinepass` | `https://api.cline.bot/api/v1` | Cline 精选的 14 个开源编码模型 | [docs/providers/clinepass.md](./docs/providers/clinepass.md) |

## 功能特性

全量细节见 [docs/guides/features.md](./docs/guides/features.md)，这里只列轮廓：

- **模型实时探测**：`GET /v1/models` 拉取分组可见模型，内置美化名录投影
- **上下文长度可选**：每个档位在模型菜单里是独立条目；阶梯 200K/256K/400K/1M，超过模型窗口的档位绝不提供
- **思考强度二级菜单**：词汇逐模型且按族实测，探测不到的能力不伪造控件
- **缓存感知的用量统计**：缓存命中率、TPS、token 明细全部正确
- **余额与用量显示**：按族呈现各自真实的端点形状（余额区 / 三窗口配额条 / 账户条）
- **图片输入（多模态）**：chat-completions 与 responses 两条协议都支持内联图片
- **多 API key 密钥池**：粘性（默认，缓存友好）/ 轮询两种分配方式，被拒密钥自动停用
- **凭据写入即校验**：明显非法的形状在保存时当场拒绝
- **断线自动重试**：可调预算，默认组合覆盖约 8 小时累计等待，夜间任务不因抖动静默中断
- **Fusion 双模型（指挥位 / 执行位）**：主线走指挥位，所有子智能体固定走执行位
- **引导式设置页**：四个并列整页 + Fusion，中英双语；逐行摘要、按需展开

## 安装

要求见[系统要求](#系统要求)。仓库自带预构建产物（`lib/`），git 安装零构建、不触发 pnpm allowBuilds 拦截；安装命令会自动初始化 profile 并把插件追加进 `dsh.profile.bundles`，无需手改任何 YAML。

### 桌面端（推荐）

DSH 桌面端自带插件管理器，不需要命令行：

1. 打开应用，在**侧栏选择「插件」**
2. 点「**添加插件**」，输入框中粘贴：

   ```
   github:AIMFllyYS/dsh-protocom-api#v1.2.6
   ```

   （`#v1.2.6` 是版本锁定；省略 `#...` 则安装 main 分支最新提交）
3. 点「安装」，等待 pnpm 完成；完成后点「**立即启用**」

安装对话框支持包名、Git 地址、压缩包与本地路径，与 CLI 的 `dsh plugin add` 接受同一种 spec。插件管理器目前**不提供自动更新与版本选择器**：升级 = 卸载后安装新版本（设置 → 插件 → 卸载，再按上面装一遍），配置与密钥不受影响。

### 命令行（dsh web / 自托管）

```bash
# 在 DSH 仓库目录执行（web profile；用其他 profile 就替换名字）
pnpm dsh plugin --profile web add "github:AIMFllyYS/dsh-protocom-api"
pnpm dsh web
```

CLI 对任意 profile 生效：`--profile web` 装进 `dsh web` 浏览器界面使用的 profile，`--profile desktop` 则是桌面端的 profile——但桌面端**运行中**的包管理由应用自身的插件管理器负责，更推荐用上节的界面方式（仅在启动时加载的 profile，其包操作需先停止进程再用 CLI）。

本地目录安装（开发用，重新 build 即生效）：

```bash
pnpm dsh plugin --profile web add "/path/to/dsh-protocom-api-plugin"
```

## 快速开始

1. **配置密钥**：设置 → 对应 provider 页面（Protocom API / OpenCode Go / Command Code / ClinePass）→ 分组卡片 → 粘贴 API key → 保存密钥（保存即自动启用该分组）。详见[配置与凭据](./docs/guides/configuration.md)。
2. **验证安装**：
   - 分组卡片「探测模型」能拉回模型列表（美化名 + 上下文 chips）
   - 聊天界面模型菜单出现对应分组条目，二级菜单可选思考强度
   - 发一条消息：思考模型有折叠思考区，统计区显示缓存命中率与 TPS
   - Protocom 分组卡片显示余额区；OpenCode Go 显示三窗口配额条；Command Code 显示账户条（ClinePass 无此端点，显示「余额不可用」属正常）

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/providers/protocom.md](./docs/providers/protocom.md) | Protocom 四分组、responses 通道的来龙去脉、拒绝名单 |
| [docs/providers/opencode-go.md](./docs/providers/opencode-go.md) | 会话头、effort-only 写法、协议路由、三窗口配额 |
| [docs/providers/commandcode.md](./docs/providers/commandcode.md) | listing 真相、9 个 Claude 为何隐藏、账户面板与套餐身份 |
| [docs/providers/clinepass.md](./docs/providers/clinepass.md) | 458 行诱饵目录、14 模型名单、已下线 id、toggle 词表 |
| [docs/guides/features.md](./docs/guides/features.md) | 全量功能：密钥池、重试、Fusion、缓存统计等 |
| [docs/guides/configuration.md](./docs/guides/configuration.md) | 界面 / 配置文件两种方式、0.8.0 迁移、凭据存储 |
| [docs/guides/security.md](./docs/guides/security.md) | baseURL 钉死、遥测路由围栏、密钥边界 |
| [docs/guides/faq.md](./docs/guides/faq.md) | 通用问题汇总（供应商专属问题在各 provider 文档内） |

## 系统要求

- **DSH ≥ 0.1.7-rc.2，且 < 0.3.0-0**（peer 依赖的实测范围），当前已验证到 **0.2.0-rc.2**
- pnpm（插件管理器通过它安装与更新）

> ⚠️ **1.0.0 是破坏性升级。** DSH 1.7 重写了设置子系统并删除了 `offloadRequestImagesWithPolicy`，旧接口已不存在，因此没有同时兼容 0.1.6 与 0.1.7 的写法。0.1.6 及以前请用 **0.8.0**。从旧版本升级时必须改配置形状，见[配置与凭据](./docs/guides/configuration.md#从-080-升级)。
>
> **1.2.2 起兼容 DSH 0.2.0-rc.2**：那次升级只改了 peer 依赖范围，零代码改动。

## 更新与卸载

```bash
pnpm dsh plugin --profile web update dsh-protocom-api   # 更新到最新 main
pnpm dsh plugin --profile web remove dsh-protocom-api   # 卸载
```

桌面端用户在「插件」页面操作：升级 = 卸载后重新安装（插件管理器暂不支持原地升级）。

## 开发

```bash
pnpm install
pnpm run build   # tsdown → lib/index.js（Host，ESM）+ lib/client.js（Web client，CJS 工厂）；tsc -b → lib/types
pnpm run test    # vitest，536 用例（含安全回归）
pnpm run check:consistency   # 构建后断言 lib/ 与 src/ 一致（build && git diff --exit-code）
```

本仓约定 `lib/` 构建产物随源码一起提交（保证 git 安装零构建），改完代码务必先 `pnpm run build` 再提交。

## 措辞约定

`Protocom 官方 API` 这个称呼**只指 `relay.protocom.org` 那一家**。OpenCode Go、Command Code、ClinePass 分别是各自的订阅服务，文档、界面与注释中不把它们的模型说成 Protocom 的。四者合称时用「provider family」。

## License

[MIT](./LICENSE) © 2026 AIMFllyYS

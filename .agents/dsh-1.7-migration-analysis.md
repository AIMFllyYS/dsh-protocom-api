# DSH 1.7 兼容性分析（实测）

分析对象：`.dsh/profiles/desktop` 上安装的 `dsh-protocom-api`，运行于 DSH Desktop **0.1.7-rc.2**。
所有结论均来自对本机 1.7-rc.2 源码（`D:\projects\Dev-Tools\DeepSeek-Harness`）与桌面运行时（`app.asar`）的实际检查，非推断。

---

## 1. 当前故障的直接原因

**现象**：`dsh: warning: 1 entry did not activate protocom-api (dsh-protocom-api): failed to import`

**事实**：

| 项 | 值 |
| --- | --- |
| profile 锁定的插件版本 | `github:AIMFllyYS/dsh-protocom-api#v0.6.1` |
| 桌面运行时 | `0.1.7-rc.2` |
| 插件 patch 行 id | `protocom-api`（`cordis.patch.yml`） |

**根因**：`offloadRequestImagesWithPolicy` 在 1.7 中被**删除**。它在 1.7 的 `src/` 与桌面 `app.asar` 中**都不存在**（逐字节搜索确认为 0 命中）。
ESM 的具名导入在模块求值阶段就会因缺失导出而抛错 —— 这正是「failed to import」，而不是激活期错误。

审计脚本 `scripts/audit-dsh-api.mjs` 对 v0.6.1 逐个符号比对 1.7 源码的结果：

```
MISSING from @deepseek-ai/dsh-llm:
    offloadRequestImagesWithPolicy
ok  @deepseek-ai/dsh-timeout (3 symbols)
ok  @deepseek-ai/dsh-credentials (1 symbols)
```

> ⚠️ 方法学提醒：本机 checkout 的 `lib/`（构建产物）是**旧版本**，仍含该符号；`src/` 才是 1.7。
> 只查 `lib/` 会得出「一切正常」的错误结论。审计脚本因此改为只查 `src/`。

---

## 2. 完整破坏清单

对**已安装的 v0.6.1** 与**我们当前的 0.8.x 源码**同时成立：

| # | API | 1.7 状态 | 我们用在哪 |
| --- | --- | --- | --- |
| 1 | `offloadRequestImagesWithPolicy` | **删除** | `adapter.ts:17,772` |
| 2 | `settings.installSection` | **删除**（1.7 全库 0 命中） | `index.ts:346`、`fusion-host.ts:149` |
| 3 | `ctx.settingsScope` | **改名 → `ctx.configForms`**（`settingsScope` 0 命中） | `client/fusion-operations.ts:221-222`、`client/index.ts:89` |

**已验证仍然可用**（无需改动）：`llm.registerAdapter` / `registerConfigurableProviders` / `registerModelDiscovery`、
`credentials.resolve`、`connection.fetch.register`、`idleWatchdog` / `timeoutOf` / `MAX_TIMER_DELAY_MS`、
`EMPTY_RESPONSE_CODE` / `LlmError` / `assertUsableApiKey` / `attributionHeaders` / `contentHasImage` / `offloadedImageText`、
`agentEvents`（Fusion 依赖）、`settings.section` 插槽、`remote.settings.describe/mutate`、`remote.llm.discoverModels`。

---

## 3. 更深层的变更：1.7 重写了设置子系统

这是本次升级的**主要工作量**，也是「一个插件四个命名空间」这一设计的终点。

| | 1.6 及以前 | 1.7 起 |
| --- | --- | --- |
| 插件如何声明设置 | `settings.installSection(ns, schema, entry, hooks)` **注册命名空间** | **没有注册这回事**：插件自己的 `Config` 就是它的表单 |
| 设置存哪 | `settings.yaml` 里的一个 section | profile patch 里那一行 entry 的 config |
| 命名空间是什么 | 自己起的名字（如 `protocom-api`） | **Loader 行 id**（我们的行 id 就是 `protocom-api`） |
| 哪些字段可被用户改 | 注册过的命名空间全部 | **只有 `.volatile()` 字段**；`isVolatilePath` 会对其它路径拒绝写入 |
| 插件怎么读活值 | `setSource` 回调 + 自己缓存 | 字段本身就是**活引用** `{ get() }`，用 `config.x.get()` 现读 |
| 没有 volatile 字段会怎样 | 无此概念 | `volatileForm()` 返回 `undefined` → **整个插件不出现任何设置页** |

**对我们插件的致命影响**：`SettingsForms.describe()` 是**按 entry 迭代**的，一个 entry 产出一个 form。
而我们现在**一个插件行暴露四个设置命名空间**（`protocom-api`、`opencode-go`、`commandcode`、`model-fusion`）。
在 1.7 下这**无法表达** —— 一个插件行只有一个 Config、一个表单、一个 ns。

> 这正好印证了你之前的判断：「我们的插件有点像多功能插件了……最好的方式应该是『一个功能对应一个插件』」。
> 1.7 把这条从「建议」变成了「约束」。

---

## 4. 图像预算：1.7 换了架构

1.6 及以前：**adapter 自己**调 `offloadRequestImagesWithPolicy` 把超预算的图片换成占位文本。

1.7：

- adapter **不再自己卸载**，只负责**宣告**：算出还需卸载几张，然后
  `throw new LlmError(..., IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages: N })`。
- 由 **session 级插件** `@deepseek-ai/dsh-compaction-image-offload`（已含在 `dsh-base` 里）永久替换最旧的 N 张图并重试，**不消耗 provider 重试预算**。

参考实现（`llm-deepseek/src/images.ts:82-90`）：

```ts
const offloadImages = requiredImageOffload(messages, bounds(connection, representation),
  block => (versions.get(block.attachment.attachmentId) as RequestImageAttachment).bytes)
if (offloadImages > 0) {
  throw new LlmError(`...${offloadImages} more oldest occurrence(s) must be offloaded.`,
    IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages })
}
```

所以我们的改法是：**删掉本地卸载逻辑，改为按 1.7 契约抛 `IMAGE_OFFLOAD_REQUIRED`**。
`requiredImageOffload` / `IMAGE_OFFLOAD_REQUIRED_CODE` / `projectOffloadedImages` 在 1.7 均存在。

---

## 5. 客户端改动很小

`ctx.settingsScope` → `ctx.configForms`，接口几乎一一对应：

| 旧 `SettingsScope<T>` | 新 `ConfigForm<T>` |
| --- | --- |
| `bind({namespace})` | `ctx.configForms.get(entryId)` |
| `getSnapshot()` / `subscribe()` | 同名同义 |
| `mutate(ops, rev): Promise<void>` | `mutate(ops, rev): Promise<boolean>`（**返回布尔**） |
| `set` / `unset` | 同名，同样返回 `Promise<boolean>` |
| — | `ctx.configForms.whileServed([ns], cb)`：Host 服务该 entry 时才注册页面 |

`settings.section` 插槽**依然有效**（1.7 中 79 处引用），我们的设置页注册方式不用改。
第一方范式见 `packages/client/ui-settings-agent-loop/src/client/index.ts`。

---

## 6. 关于「外部 UI 进程天天爆炸」

**诚实结论：无法证实，本机没有留下证据。** 1.5 的运行时与日志目录都已不存在，`dsh-desktop` 下也没有 crash dump。
当时的服务是 `tsx` 未打包运行 + `patchReload: live`，进程崩溃可能来自宿主本身而非插件。

不过有两点与我们的插件相关、值得在迁移时顺手消除：

1. **客户端 bundle 体积**：154 KB（1.5 时 125 KB），且设置页会一次性构建整份模型目录（模型 × 上下文档位）。这是可观的 UI 进程内存占用。
2. **`trustedDependencies` / 构建期脚本**：与本机崩溃无直接证据关联。

建议：迁移完成后观察新环境是否复现；若复现，再用桌面端日志定位。**现在不做无证据的改动。**

---

## 7. 升级方案

### 选项 A：单插件 + 嵌套 Config（改动小，推荐先做）

```ts
Config = z.object({
  protocom:   Section.volatile(),   // 整块 volatile ⇒ 其下所有字段可写
  opencodeGo: Section.volatile(),
  commandcode:Section.volatile(),
  fusion:     Fusion.volatile(),
})
```

- Host：删掉全部 `installSection`；活值改 `config.protocom.get()`；表单自动生成于 ns `protocom-api`。
- Client：`settingsScope.bind({namespace})` → `configForms.get('protocom-api')`，ops 路径加前缀（`groups.aggregate.enabled` → `protocom.groups.aggregate.enabled`）。
- 代价：四个功能挤在一个设置页里（可用子分组渲染），且「一个功能一个插件」仍未达成。

### 选项 B：拆成多个插件（符合 1.7 模型，工作量大）

`dsh-protocom-api` / `dsh-opencode-go` / `dsh-commandcode` / `dsh-model-fusion` 各自一行、各自 Config、各自设置页。
每个插件一条 patch 行，安装 4 次。共享代码抽成一个内部包。

**建议**：先做 A 让插件在 1.7 上活过来（可验证、可回滚），再把 B 作为后续重构。

---

## 8. 分阶段实施计划

| 阶段 | 内容 | 验证 |
| --- | --- | --- |
| P0 | 修 `offloadRequestImagesWithPolicy` → 抛 `IMAGE_OFFLOAD_REQUIRED` | 单测 + 真实发图 |
| P1 | 设置子系统迁移到 `Config.volatile()`（Host + Client） | 设置页可读写、改完即时生效 |
| P2 | 客户端 `settingsScope` → `configForms` | Fusion 页可保存 |
| P3 | 升级 peer/dev 依赖到 `^0.1.7-rc.2`，重跑全套测试 | `pnpm run verify` 全绿 |
| P4 | 发布 1.0.0，桌面 profile 更新到新 tag | 重启后设置页出现、模型可选、能对话 |
| P5（后续） | 选项 B 拆分插件 | — |

---

## 9. 未提交的工作

工作区里还有上一轮未提交的改动（Command Code 账户面板、`AccountView` 文案等），约 17 个文件。
这些改动与 1.7 迁移会改到同一批文件，建议**先提交**再开始迁移，避免混在一起。
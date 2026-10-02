# 配置与凭据

## 界面配置（推荐）

设置 → 「Protocom API」「OpenCode Go」「Command Code」「ClinePass」**四个并列整页**（外加「Fusion 双模型」），中英双语。每张分组卡片可折叠：粘贴对应订阅的 API key 并保存，保存即启用该分组；用「刷新模型」拉取该分组自己的 listing。保存密钥时会先做形状校验（详见[功能详解](./features.md#凭据写入即校验)）。

## 配置文件方式

编辑 profile 的 patch（`~/.dsh/profiles/<profile>/cordis.patch.yml`；DSH 1.7 起不再是 `settings.yaml`，该文件已被宿主改名归档为 `settings.yaml.imported`）。一个插件行只有一个 `Config`，五个分节（`protocom` / `opencodeGo` / `commandcode` / `clinepass` / `fusion`）全部嵌在里面：

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
        # ...
    opencodeGo:
      groups:
        go:
          enabled: true
          apiKey: OPENCODE_GO_API_KEY
    commandcode:
      groups:
        cc:
          enabled: true
          apiKey: COMMANDCODE_API_KEY
    clinepass:
      groups:
        clinepass:
          enabled: true
          apiKey: CLINE_API_KEY
```

没写的分节由 schema 补默认值，所以只写 `protocom` 也能正常挂载。**界面方式不受影响**：设置页会自动渲染全部五个分节。

## 从 0.8.0 升级

分节从顶层收进了各自的名字下——1.7 下一个插件行只能有一个表单，所以各功能共用一个 `Config`。旧名与新字段的对照（与 `scripts/migrate-legacy-settings.mjs` 中的 `SECTIONS` 表一致）：

| 旧（≤0.8.0，顶层分节） | 新（1.0.0+，`Config` 字段） |
| --- | --- |
| `protocom-api:` | `protocom:` |
| `opencode-go:` | `opencodeGo:` |
| `commandcode:` | `commandcode:` |
| `model-fusion:` | `fusion:` |

`clinepass` **没有旧形状**——ClinePass 是 1.2.0 新增的族，不在 0.8.0 的迁移范围里。

旧值一般还留在 `~/.dsh/settings.yaml.imported`（宿主只在 `settings.yaml` 存在时导入一次，而那次导入发生在插件还没有可写表单的时候，因此**没有被导入**）。仓库自带迁移脚本：

```bash
node scripts/migrate-legacy-settings.mjs ~/.dsh/settings.yaml.imported migrated.yml
# 校验无误后把 migrated.yml 的内容追加到 profile 的 cordis.patch.yml
```

脚本会打印重命名对照，并在写出前用插件真实的 `Config` schema 校验结果——形状写错是**静默失败**（旧形状照样能解析，只是全部落到默认值，看起来像插件装了却没生效）。

## 凭据存储

密钥值放入 `~/.dsh/.credentials.yaml`，或启动时经同名环境变量注入：

```bash
PROTOCOM_AGGREGATE_API_KEY=sk-... pnpm dsh web
```

密钥只经凭据引用解析（优先凭据托管存储，其次环境变量），**永不落盘进配置**。每族有独立命名空间：

| family | 命名空间 | 默认引用 |
| --- | --- | --- |
| Protocom | `PROTOCOM_*` | `PROTOCOM_AGGREGATE_API_KEY` 等（按分组） |
| OpenCode Go | `OPENCODE_*` | `OPENCODE_GO_API_KEY` |
| Command Code | `COMMANDCODE_*` | `COMMANDCODE_API_KEY` |
| ClinePass | `CLINE_*` | `CLINE_API_KEY` |

密钥池场景下，每把引用都是一份独立订阅（如 `CLINE_API_KEY_2` 就是池里的第二把）。

# 0.2.0 测试清单

> 本版本包含**安全加固（4 项破坏性变更）**与**模型目录按分组收敛**。
> 自检：`pnpm run verify` = `vitest run` + `build && git diff --exit-code`；当前 157 用例全绿、构建确定性通过。

---

## 0. 先看这里：升级后如果插件不加载

四个破坏性变更里有两个会**在加载/解析配置时直接抛错**，不是静默降级。看到插件加载失败时按顺序排查：

| 现象（日志关键字） | 原因 | 处理 |
|---|---|---|
| `baseURL ... points away from the shipped endpoint` | 你用了自定义/中转端点，但没有显式确认 | 在 `protocom-api:` 下加 `allowCustomBaseURL: true`（**没有默认值**，必须主动写）；设置页「高级」里也加了同名勾选框 |
| `baseURL must use https` | 配了非回环的明文 `http://` | 换 https；只有 `localhost` / `::1` / `127.0.0.0/8` 允许 http |
| `apiKey must match /^PROTOCOM_.../` | 凭据引用名不在 `PROTOCOM_` 命名空间 | 改成 `PROTOCOM_xxx_API_KEY`，或改 `.credentials.yaml` 里的键名 |
| 余额面板显示「当前部署不提供余额信息」 | 该 profile 没有 `connection` 服务，或未通过载体围栏 | 属预期（headless/sdk）；Web/桌面下应正常 |

**最可能踩到的是第一条**：如果你的中转站不是 `relay.protocom.org`，升级后必须补 `allowCustomBaseURL: true`，否则插件不加载。

---

## 1. 问题一：菜单显示不全 + 128K 残留（本次主要验证项）

目录成员现在是「**该 route 自己的 /v1/models 结果** ∪ 名录中登记为该组的条目」，不再是整份全局名录。

- [ ] 同时启用 **aggregate + stepfun**，打开底部模型菜单：应看到**两个分组标题**（Protocom Aggregate / Protocom StepFun），阶跃星辰的模型在**它自己的分组里、不再被聚合组挤到视口外**。
- [ ] 菜单总行数应显著变短（原来每组都重复整份名录）。
- [ ] **128K 彻底消失**：阶跃星辰每个模型应显示 **200K / 256K / 400K / 1M** 四档（除非你在配置里显式改过 `contextLengths`）。
- [ ] 聚合组的模型不应再出现在阶跃星辰分组里（反之亦然）。
- [ ] 反向验证：把某个分组的密钥改错，使 listing 失败 —— 该分组应**回落到整份名录**而不是空菜单（这是刻意保留的安全网）。
- [ ] Codex 分组：即使 listing 抖动，`gpt-5.6-sol` / `gpt-5.6-luna` 仍应在（已登记为该组）。

## 2. 问题二：阶跃星辰 5

- [ ] **上下文**：四档已随上面生效。补名录条目后（等你给 id），未配置 `contextLengths` 时会以模型自身窗口（1M）为默认。
- [ ] **多模态**：**目前仍不可用**（发图会 `UNSUPPORTED_CONTENT`）——名录缺 StepFun 条目，`vision` 恒为 false。等你给模型 id。
- [ ] **二次使用后工具报错**：请按 §3 留证据。

## 3. 复现 "用两次后工具报错" 并留证据（关键）

猜测成本高，请直接用开关抓一次现场：

````powershell
# 1) 选一个空目录
$env:DSH_PROTOCOM_CAPTURE_DIR = "D:\protocom-capture"

# 2) 用同一个 profile 启动 DSH（环境变量必须传给 DSH 进程）
pnpm dsh web

# 3) 在 GUI 里复现：新会话 → 发消息 → 再发一条（或用一次工具后再用一次）
# 4) 失败后回到终端
Get-ChildItem D:\protocom-capture
```

会把**失败请求的完整 body**与**上游原样错误体**写成 `<时间>-<状态码>.json`。捕获只写 body、**从不写 header**，因此不含密钥；但 body 含对话内容（包括工具结果），所以默认关闭、只在需要时开。

把这 1 个 json 发我即可。同时麻烦确认两件事：

1. stepfun 组的 `protocol` 现在是 `chat-completions` 还是 `responses`？
2. 把 stepfun 的 `protocol` 切成 **`chat-completions`** 再试一次 —— 你贴的报错里是 `body.input`（responses 形状），如果是配置成了 responses 而中转站其实说 chat-completions，切回去可能立刻就好。

## 4. 安全加固的顺带影响（预期行为，不是 bug）

- [ ] 余额端点：裸 `curl` 现在是 **401**、伪造 Host 是 **403**（原先是 200）。GUI 内正常。
- [ ] **桌面端余额面板应恢复可用**（旧版在桌面端必然 404）。
- [ ] 上游截断的 responses 流现在会**判定为失败并丢弃**（不再把残缺的工具调用当完整调用执行）。若你的网关以 EOF 正常结束流，会看到 `STREAM_CLOSED` —— 这种情况请告诉我。
- [ ] 大工具调用（>1 MiB 的单个 SSE 事件）上限已放宽到 8 MiB。
- [ ] 流空闲超时默认 300s（新增 `streamIdleTimeoutMs`，可调）。

## 5. 回滚

````bash
git -C <repo> checkout 7c8bd48   # 回到加固前
# 或在 DSH 里指定旧版本安装
```

---

## 6. 这个版本**没有**做的事（避免误判）

- 未补 StepFun 5 / Grok 的名录条目（缺模型 id）→ 多模态、1M 默认窗口未生效。
- 未修 "二次使用后工具报错"（缺证据）。
- 未改设置页 UX（模型配置内联进分组卡片）——方案在 `MODEL_CATALOG_AND_STEPFUN_ANALYSIS.md` §3，待你确认后再动。

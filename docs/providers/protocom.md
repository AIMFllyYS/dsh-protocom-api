# Protocom 官方 API

> 默认端点：`https://relay.protocom.org` · 凭据命名空间 `PROTOCOM_*` · 遥测路由 `GET /api/protocom-api/balance`

这是本插件的第一个 family，也是唯一一个中转站性质的来源：一个端点、四个分组、四条独立的 provider route，各自配置 API key，互不影响。

| 分组 | provider route | 默认协议 | 内容 |
| --- | --- | --- | --- |
| `aggregate` | `protocom-aggregate` | chat-completions | 开源聚合模型 |
| `codex` | `protocom-codex` | responses | Codex 系列 |
| `stepfun` | `protocom-stepfun` | responses | 阶跃星辰系列 |
| `grok` | `protocom-grok` | chat-completions | Grok 系列 |

## 为什么 stepfun 默认走 responses

中转站为阶跃星辰提供的 chat-completions 门面是**转译层**，而且转译有缺陷：历史里一旦出现 assistant 文本或 reasoning，回放时被上游拒收（HTTP 400，报 210 个 schema 校验错误），于是**从第二轮对话起、以及每一轮工具调用都失败**。同一段对话发到 `/v1/responses` 则一切正常——工具调用、内联图片都通。所以该分组出厂即 responses；如果你手写过 `protocol: chat-completions`，删掉这行即可恢复默认。

## 思考强度

- relay 的 effort 词汇**逐模型实测**。`kimi-k3` 接受 `minimal/low/medium/high/xhigh/max`；**禁用词是 `none`，拒绝 `off`**——与 OpenCode Go 恰好相反，因此两族不共用词表。
- `codex` 分组走 responses 协议的 `reasoning.effort`。
- `stepfun` 上 effort **真实生效**：实测 `minimal`/`low` 的 reasoning token 为 0，`medium`/`high` 为 14/24；不设置时行为接近 `medium`。曾有一次会话在第一次工具调用之前就烧掉 28.5K reasoning token——那正是这个分组的词表缺失被补齐（0.6.1）的原因。
- `aggregate` 没有分组级默认词表：没有自述词表的模型曾经一路落到 `undefined`，菜单里**没有任何档位可选且不报错**。1.2.3 起逐模型实测补齐（relay 侧 15 个缺词表条目），注册表并加了重复 id 守卫。

## 拒绝服务的模型

实测端点拒绝服务的 id 收在 `REFUSED_CHAT_MODEL_IDS`，永不进菜单。两种情形都有：只被本通道拒绝（StepFun 的音频/图像模型 404、两个 3.5 快照 400），以及两条协议都拒绝（4 个 aggregate id 报 `not available on this endpoint`——它指向的 `/provider/v1/...` 实测是 Cloudflare HTML 页而非 API）。分组卡片里的「模型和上游 ID」折叠表会把它标注为「端点提供：否」。

## 常见问题

**阶跃星辰从第二轮开始报 `Upstream error: 400`**：见上文——0.3.x 及更早版本该分组走 chat-completions 门面，而该门面在这个中转站上无法回放任何历史。0.4.0 起默认走 responses 通道。

**某个 route 只有 chat-completions，一回放历史就 400**：中转站把 assistant 文本渲染成上游不接受的形状所致。若该 route 有 responses 通道，直接 `protocol: responses`；没有的话用 `assistantTextReplay: drop`（丢弃 assistant 自己的文字、保留工具调用）或 `user`（把这段文字改挂到 user 条目，角色归属被改写）。实测两者都能跑通，`keep`（默认）在这类 route 上必然 400。

**GLM 5.3 Flash 用一两次工具之后彻底停住，没有下一轮**：上游会间歇性地"只想不说"地收尾——思考满格、正文为空、`finish_reason: "stop"`（同一提示词实测 16 次里 5 次），而翻译层把思考也算作"有输出"，agent 被误判为正常完成：不报错、不重试、界面停在原地。0.6.1 起这种退化完成映射到可重试的 `EMPTY_RESPONSE`，自动重发该步（默认最多 5 次）。升级即可，无需改配置。

**阶跃星辰每次工具调用前都要思考很久**：`reasoning.effort` 在该中转站上真实生效（实测 `minimal`/`low` 的 reasoning token 为 0，`medium`/`high` 为 14/24），但 0.6.1 之前 `stepfun` 分组没有声明词表，模型菜单里**不出现 Effort 子菜单**，思考预算不可控。0.6.1 起可在对应模型的二级菜单里选 `minimal`/`low`/`medium`/`high`；想快就选 `minimal` 或 `low`。

**某个模型明明列在端点里却不在菜单**：它的 id 在拒绝名单里（见上文），实测端点不为它服务。

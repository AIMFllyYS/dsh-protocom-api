# 第三轮：模型元数据缺口（实测）

数据来源：对本机凭据实际请求 OpenCode Go 的 `/v1/models`（43 个 id），
与 `src/model-registry.ts` 的 `GO_REGISTRY`（30 个条目）逐 id 比对。

## 缺口一：13 个在售模型未收录

这些模型**线上正在提供**，但插件没有任何条目——它们会以原始 id 出现在菜单里，
没有上下文档位、没有思考深度、没有视觉标记：

| id | 备注 |
| --- | --- |
| `minimax-m2.7` | M2.5 的继任者 |
| `kimi-k2.5` | K2.6 已有条目，K2.5 缺失 |
| `glm-5` | GLM 5.3/5.2 已有，初代缺失 |
| `qwen3.5-plus` | 3.6/3.7/3.8 已有 |
| `mimo-v2-pro` | 与已收录的 v2.5-pro 不同代 |
| `mimo-v2-omni` | 多模态，**需确认视觉** |
| `mimo-v2.6-pro` | |
| `mimo-v2.6-flash` | |
| `space-bunny-free` | 免费档 |
| `longcat-2.5-preview-free` | 免费档，LongCat 2.0 已有 |
| `hy3-preview` | `hy3` 已有条目，preview 变体缺失 |
| `grok-4.5` | 4.6/4.7 已有 |
| `gpt-6-luna` | `gpt-5.6-luna` 已有，6 代缺失 |

## 缺口二：4 个条目在线不可见

`hy3`、`hy4-preview`、`kimi-k2.6`、`mimo-v2.5` —— 声明了但当前 listing 里没有。
**这不一定是错误**：listing 很可能按账号套餐过滤，换一个套餐就会出现。
保留条目是合理的（它们是「可能可用」的真相），但值得记录。

## 缺口三：多数已收录模型没有思考深度词表

抽查显示大量条目只有 `vision` 而**没有 `reasoning`**，例如
`minimax-m3`、`kimi-k3`、`deepseek-v4-pro`、`deepseek-v4.1-flash`、`grok-4.6`、`qwen3.8-max`。

**需要判断这是否正确**：如果这些模型确实接受思考深度，那么用户在这些模型上
同样看不到 Effort 子菜单——与 Command Code 是同一类缺陷，只是原因不同
（那里是来源沉默，这里是词表缺失）。

## 待办

1. 为 13 个缺失模型补齐条目（需要真实数据：窗口、档位、视觉）。
2. 确认哪些已收录模型**确实**支持思考深度，补上词表。
3. 数据来源优先级：`models.dev` 的 opencode-go 条目 → 上游 listing 自述 → 实测。

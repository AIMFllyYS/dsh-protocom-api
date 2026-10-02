# Command Code 订阅

> 默认端点：`https://api.commandcode.ai/provider` · provider route `commandcode` · 凭据命名空间 `COMMANDCODE_*`（默认 `COMMANDCODE_API_KEY`）· 遥测路由 `GET /api/commandcode/account`

一个分组、一条 route，承载你套餐包含的全部模型。路由名刻意不带套餐档位：Command Code 卖的是累计套餐（GOAT / Pro / Max），**哪些模型可用是服务端决定**——listing 已按账户过滤，如果路由以档位命名，套餐一变它就过期了。

实测 listing 共 **82 个模型**（2026-09-23，`GET /provider/v1/models` 无需密钥即可拉取），其中 **73 个可服务**：

| 分组 | provider route | 默认协议 | 说明 |
| --- | --- | --- | --- |
| `cc` | `commandcode` | chat-completions | 端点在自己的 listing 里声明每个模型走哪条通道 |

## 接入要点

- **按端点声明路由**：`supported_endpoints` 是路由真相——82 个中 65 个声明两条 OpenAI 通道都可、8 个仅 chat、**9 个（全是 Claude）仅 `/messages`**。仅 Anthropic 通道的模型发到 OpenAI 通道必 400，因此这 9 个**暂时隐藏**，而不是列出来每次调用都失败。
- **不带手写名录**：行内已披露 `context_length` 与 `supported_endpoints`，手写副本只会过期。
- **上下文档位**：从实测的九个不规则长度（200000/256000/262000/262144/400000/500000/1000000/1048576/1050000）取四档 200K/256K/400K/1M。其中几个只差几百 token，全部摆进菜单只会是噪音。
- **思考强度逐模型取自厂商自己的 CLI 目录**：该网关的列表只公布路由、能力页只公布布尔值，两处都没有深度列表。`deepseek-v4-pro` 是 `high/max`，`gpt-5.6-sol` 是 `low/medium/high/xhigh/max`；29 个模型厂商不接受任何深度，就不给控件——而不是伪造一个。
- **密钥引用**：`COMMANDCODE_*` 命名空间，默认 `COMMANDCODE_API_KEY`。

## 账户面板与套餐身份

设置页内嵌账户条，读 `GET /alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`、`/alpha/usage/summary`。**两个半边各自降级**：一半读不到只报那一半，不会把整块面板清空成"账号为空"。

套餐身份（`planId`，如 `individual-goat`）也在这里读——这是菜单的真正门槛：**listing 本身不做套餐过滤**，会广告出低档账号调不动的 Pro/Max 模型。插件读取套餐身份而不是写死名录，所以 GOAT 档新增模型会自动出现在菜单里，不需要等插件更新。

## 常见问题

**菜单是空的**：分组卡片上的「全不选」会把该组模型全部移入 `hiddenModels`，且没有确认步骤。用同一张卡上的「全选」一键恢复。

**列出的模型调不动**：listing 不做套餐过滤（见上文）——你看到的是端点广告的全部，你的套餐能用的是账户条上 `planId` 决定的那部分。

**Claude 模型不在菜单里**：9 个 Claude 仅声明 `/messages`（Anthropic 通道），本插件尚未实现该通道，因此隐藏而非列出来失败。

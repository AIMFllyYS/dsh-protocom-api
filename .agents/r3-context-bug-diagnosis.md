# 第三轮：上下文选择缺陷 —— 根因诊断（实测）

全部结论来自在 jsdom 中真实渲染组件、真实点击、观察真实回调，非推断。

## 复现结果

在 4 张分组卡片、5 行模型、每行 4 个上下文档位的环境下：

```
chips: 200K 256K 400K 1M*        ← * = 已选中
其中 1M 按钮 disabled=true        ← 「至少保留一个」守卫
点击 200K（可用）→ writeSettings 调用 1 次
写入: modelContexts["deepseek/deepseek-v4.1-flash"] = [204800, 1048576]
describeSettings delta: 1        ← 整个设置页重新加载一次
```

**状态机本身是对的。** 缺陷在于它的**触发条件**很容易变成「点了没反应」。

## 缺陷一：`disabled` 导致「无法点击」

`ProtocomSection.tsx:444`：

```tsx
disabled={!writable || busy || last}
```

其中 `last = on && chosen.length === 1`。默认状态下每个模型**只选中一个档位**（registry 给出的 `contextChoicesFor` 只返回窗口内的档位，而选中集合初始就是整个 ladder），
所以**用户唯一能看到「已选中」的那个按钮恰好是禁用的**。

从使用者的角度看：看得见的选中项点不动 → 「选择不同的上下文好像无法正常点击」。
而其余三个未选中项是可以点的——但它们点下去是**添加**一个档位，不是**切换**到它。

设计与预期不符：用户在「四选一」的语义下点击，实现的却是「多选累加」。

## 缺陷二：每次点击触发整页重载 → 「页面闪烁」

`ProtocomSection.tsx:551`：

```tsx
const write = (ops) => {
  setBusy(true)
  void operations.writeSettings(ops, revision)
    .then(async (outcome) => { await onChanged() })   // ← onChanged = load()
    .finally(() => { setBusy(false) })
}
```

`onChanged` 就是页面级的 `load()`（`:1076`），它会：

1. `describeSettings()` 重新拉取整份配置
2. `describeCredentials()` 重新拉取**全部四个分组**的凭据状态
3. `setState({ phase: 'ready', ... })` —— **state 对象引用变化，整棵子树重渲染**

期间 `busy=true` 会把**所有**分组的**所有**控件禁用（`disabled={!writable || busy}`），
重载完成后又全部恢复。**每点一次档位，整个设置页闪一次。**

实测 `describeSettings delta: 1`——一次点击一次全量拉取。在真实网络下这个往返就是可见的闪烁。

## 缺陷三（相关）：Registry 命中时 `1M` 恒被选中

`identityKey()` 把上游 id 归一到 registry 的主 id（`deepseek/deepseek-v4.1-flash`）。
而 `contexts[key]` 若为空，`chosen` 回退到 `fallback = variantLengths(model.contextOptions, group.contextLengths)`。

对 registry 已知模型，`contextOptions = contextChoicesFor(entry.contextWindow)`，
`deepseek-v4.1-flash` 的 `contextWindow = CONTEXT_1M`，于是 ladder = `[200K,256K,400K,1M]`，
**fallback 直接等于整条 ladder**——四个档位全部被标为已选中。

这就解释了截图里为什么 1M 是唯一「亮着」的：它是 `last` 守卫命中的那个（其余三个也 on，但守卫只禁用了 `chosen.length===1` 的情形……
实际观察到的是仅 1M 为 on，说明 `model.contextOptions` 在该路径下为 `undefined`，走了 `ladder = CONTEXT_LADDER` 而 `fallback = [model.contextWindow] = [1M]`）。

无论走哪条分支，**根因一致**：`fallback` 与 `ladder` 是两个独立推导的值，
当它们不等时，界面上就会出现「一个亮着且点不动、其余三个可以点」的错位状态。

## 结论：三处都要改

| # | 问题 | 方向 |
| --- | --- | --- |
| 1 | 唯一选中项被禁用，且语义是多选而非单选 | 明确语义；选中项必须可点击（或改成真正的单选/多选控件） |
| 2 | 每次点击整页重载并全局置 busy | 写入后用返回值就地更新，不要全量重拉；busy 只锁当前卡片 |
| 3 | fallback 与 ladder 不一致导致错位高亮 | 单一事实来源：ladder 与选中集合由同一函数推导 |

## 待研究（子智能体进行中）

「4 个可组合档位」到底应该是**多选**还是**单选**：
从代码看它是多选（每个档位在模型菜单里是独立条目，`:79` 的提示语也这么说），
但 UI 呈现成了互斥的样子。这需要交互设计层面的判断。

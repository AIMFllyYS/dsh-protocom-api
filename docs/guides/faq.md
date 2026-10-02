# 常见问题

跨供应商的通用问题汇总在这里；各供应商专属的问题在各自的文档里：[Protocom](../providers/protocom.md#常见问题) · [OpenCode Go](../providers/opencode-go.md#常见问题) · [Command Code](../providers/commandcode.md#常见问题) · [ClinePass](../providers/clinepass.md#常见问题)。

**模型实时探测报错**：依赖外部网络，公共 Wi-Fi / 防火墙常拦。实测约 60 秒缓存后会自动恢复，不影响已启用模型的调用。

**探测报 "group is disabled"**：该分组未启用。打开卡片上的启用开关，或直接保存一次密钥（会自动启用）。

**探测报 401 / 401 Unauthorized**：key 未配置或无效。设置面板显示的是引用解析结果——密钥值存在 OS 凭据仓库里，配置文件只存引用名，两者必须同时正确；确认密钥已保存且状态圆点为绿色。

**一个模型行都看不到 / 某个分组在设置页里看不到模型行**：分组被禁用或未配置密钥。启用并保存密钥后面板会自动拉取该分组自己的 listing（也可点「刷新模型」）。

**上下文变体不生效**：在**该分组卡片内**对应模型行上勾选档位（写回 `modelContexts`）。分组自带的梯子（StepFun 为 200K/256K/400K/1M）未手动改过时不落盘。另请确认 DSH ≥ 0.1.7-rc.2（`contextVariants` 从该版本起被 harness 识别）。

**粘贴图片**：聚焦 composer 输入框后 Ctrl+V 直接粘贴；模型需具备视觉能力（名录或设置中声明）。

**上传图片没有入口 / 报 `UNSUPPORTED_CONTENT`**：说明该模型的图片能力被显式关闭了（`visionModels` 为 `false`，或名录标注 `vision: false`，如 GLM 系）。在对应模型行点「仅文本 / 视觉」切换即可。

**发图后上游报错点名该模型**：未收录模型默认放行图片，遇到真正纯文本的模型时由上游拒绝。把该模型切成「仅文本」即可恢复本地拦截。

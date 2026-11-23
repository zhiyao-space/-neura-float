# 需求文档

## 1. 改动目标
在现有「共创」写作模块（cocreate）中实现图文结合：AI 生成正文时在合适场景处输出插图标记，模块按项目当前生图 API 配置自动生成画面插图；画风由用户已导入的 zip Vibe 编码（设置里的 NovelAI Vibe 列表）决定，无需新增导入入口——统一生图入口会自动注入启用的 vibes（已核实 `image-generation-service.ts` L697-732 的 vibes 注入不依赖 characterId）。

## 2. 探索结论（受影响文件，全部绝对路径）
- 主组件（全部视图内联）：`/home/project/src/components/cocreate/cocreate-app.tsx` —— `runCoCreateGeneration()` L1162（生成后挂接点）、`handleSend()` L1481、消息渲染 `CoCreateMarkdown` L170-180、章节阅读器渲染区、设置面板 L2889-3002
- LLM 引擎：`/home/project/src/lib/cocreate-engine.ts` —— `generateCoCreateReply()` L460、prompt 组装 `assemblePromptPayload`（插图指令可随 `cocreateWriteActions`/projectContext 注入）
- 工具/指令文案：`/home/project/src/lib/cocreate-tools.ts`（写模式动作指令，插图输出规则加在此处或 projectContext）
- 类型：`/home/project/src/lib/cocreate-types.ts` —— `CoCreateSettings` L56-62 加插图开关、`CoCreateChapter` 已有 content 字段可承载标记
- 生图入口：`/home/project/src/lib/image-generation-service.ts` —— `generateImageFromConfiguredApi({ description, appId })`，返回 `{ mediaRef, dataUrl, ... }`；vibes 自动注入已确认
- 持久化：`/home/project/src/lib/cocreate-storage.ts`（kv `ai_phone_cocreate_library_v1`，插图 mediaRef 直接写进正文文本，无新表）
- 样式：`/home/project/src/cocreate.css`（深色 `--cc-*` 变量体系，新增插图块样式沿用该体系）

## 3. 方案设计
### 3.1 插图指令（指令层）
- 在共创写模式系统指令（cocreate-tools.ts 的写动作说明 + projectContext）追加规则：AI 在正文关键场景（新场景开启、重要画面、章节高潮）输出 `[插图:纯英文画面描述]` 标签，描述必须 100% 纯英文 Danbooru 风格（沿用项目生图英文硬约束），每条回复最多 1-2 个标签；正文其余部分保持中文
- 章节归档（archive）时标签保留在章节 content 中，阅读器同样渲染

### 3.2 生图流程（服务层）
- 生成完成后（`runCoCreateGeneration()` 拿到 result、流式结束或整段返回后），后台异步解析 assistant 消息正文中的 `[插图:desc]` 标签
- 每个标签调用 `generateImageFromConfiguredApi({ description: desc, appId: "cocreate" })`（vibes 自动生效）；成功后把消息/章节正文中的标签改写为 `[插图:desc|mediaRef]`（保留原描述便于重新生成），失败保留原标签显示占位框（含重试按钮）
- 并发上限 1（串行），单条回复最多生成 2 张，防费用失控；受设置开关控制

### 3.3 渲染（UI 层）
- 新增共享解析函数：把正文拆为 文本段 / 插图块 序列
- 写作消息流：`CoCreateMarkdown` 渲染文本段，插图块渲染图片卡片（dataUrl 显示、生成中骨架、失败重试）；聊天媒体外壳透明问题注意给卡片自带背景+边框
- 章节阅读器：同样按 文本/插图 混排渲染
- 消息气泡是运行时热路径：改动后必须 `npx tsc --noEmit` 自查无新增错误

### 3.4 设置
- 共创设置面板（L2889-3002）新增「场景插图」开关（默认开）+「每条回复插图上限」（1/2/3）；关闭时不注入插图指令、不触发生图，已有 mediaRef 的插图仍正常显示

## 4. 业务规则
- mediaRef 直接内嵌在正文文本里，随 session 一起持久化，刷新不丢；重新生成按钮可对单张插图重跑
- 插图生成失败不阻塞正文展示；正文编辑器中标签文本可直接编辑
- discuss（讨论）模式不生图，仅 write 模式

## 5. 异常与边界
| 场景 | 处理 |
|---|---|
| 生图未配置/失败 | 占位框+重试，正文不受影响 |
| 描述含中文 | 统一入口已有 CJK 兜底清理，不会 400 |
| 消息被编辑/章节编辑后标签损坏 | 解析容错：仅识别合法 `[插图:...]` 格式，其余按普通文本 |
| 旧会话（无标签） | 完全兼容，行为不变 |

## 6. 实施步骤
1. `cocreate-types.ts`：`CoCreateSettings` 加 `illustrationEnabled`、`illustrationLimit`
2. `cocreate-storage.ts`：settings 默认值与 normalize 补新字段
3. `cocreate-tools.ts`：写模式指令加插图输出规则（纯英文约束）
4. `cocreate-app.tsx`：生成完成后插图解析+后台生图+标签改写持久化；`CoCreateMarkdown` 与阅读器渲染插图块；设置面板加开关
5. `cocreate.css`：插图卡片样式（骨架/占位/重试）
6. build + dev + 截图验收 + 推送 GitHub

## 7. 验收标准
- 写作模式让 AI 写一段场景，回复中出现插图卡片，图片按 vibes 画风生成
- 关闭「场景插图」开关后不再触发生图，已有插图仍显示
- 进入章节阅读器，正文与插图图文混排；刷新后插图仍在
- build/tsc 无新增错误

## 8. 风险评估
- 消息流是热路径，解析逻辑必须纯函数化并做好 null 容错，防止白屏
- 生图为后台异步，需处理组件卸载后的 setState 竞态（用 ref 标记挂载状态）
- vibes 编码在模型切换后需懒编码，首次生图可能较慢——UI 用骨架屏提示
# 需求文档

## 1. 改动目标
给「剧情」APP 增加配图能力：AI 续写的剧情中出现场景插图标签时，自动调用项目已配置的图像生成 API 生成配图，并以精美卡片形式嵌入剧情流；插图与「记忆」打通——插图随剧情摘要进入角色记忆投影，生图失败可重试。

## 2. 现状 vs 目标
- 现状：剧情消息（`StoryMessage`）只有文本渲染（`StoryHtmlRenderer`），无逐条配图；`StorySession.storyAvatar` 只是封面。生图统一入口 `generateImageFromConfiguredApi` 已存在，共创模块已有完整的「正文插图标签→生图→回填持久化」样板（cocreate-illustration.ts），剧情模块完全没接。
- 目标：剧情正文支持 `[插图:场景描述]` 标签（由 story-engine 生成 prompt 引导 AI 输出）；剧情流中标签渲染为精美插图卡片（骨架加载→生成图→失败重试）；mediaRef 回填进正文持久化，刷新不丢；插图事件写入记忆链路（短期记忆投影带上插图描述）。

## 3. 改动点说明
1. **新插图引擎（仿 cocreate-illustration.ts）**：新建 `src/lib/story-illustration.ts`，复用 `[插图:desc|mediaRef]` 标签协议（可从 cocreate-illustration 导出复用 split/extract/apply 函数，避免复制两份），生图 appId 用 `"story"`（settings-types.ts ContentAppId 已含）。生图 description 自动拼剧情上下文（角色名 + 插图描述）。
2. **数据结构**：`src/lib/story-storage.ts` 的 `StoryMessage` 增加可选字段 `imageMediaRefs?: Record<string, string>`（desc→mediaRef 映射，向后兼容；mediaRef 同时也回填进 rawContent 标签内，双保险）。Dexie 无 schema 校验，天然兼容。
3. **AI 输出引导**：`src/lib/story-engine.ts` 在生成 prompt 中追加轻量指令：场景转换/重要画面时输出 `[插图:一句话场景描述]`，每次回复最多 1 张，避免刷屏。
4. **渲染卡片**：`src/components/story/story-app-base.tsx` 渲染层改为经 splitIllustrationBlocks 拆块：文本块走原 StoryHtmlRenderer，插图块渲染为精美卡片——生成中显示骨架+进度态，完成后圆角大图 + 底部描述文字 + 光影渐变遮罩；失败显示重试按钮（点重试重新调生图并回填）。仿 cocreate-app.tsx L190-275 的骨架/失败/重试逻辑。
5. **生图触发**：在 handleSend 成功落库 assistant 消息后（story-app-base.tsx L1460-1472 之后），异步扫描 rawContent 的待生图标签（extractPending，限 1-2 张），逐张调用生图，完成后回填 mediaRef 并更新消息落库 + 刷新消息列表；生图请求绑定该次 generationRun 的 signal，切会话/中止时安全取消。
6. **记忆通连**：
   - `storySummary` 投影链已把剧情短期事件注入所有 APP 记忆流（story-storage.ts L938-970 → short-term-assembler.ts L518-537），在投影内容末尾附上已生成的插图描述（如「（配图：xxx）」），让记忆里能“想起”画面。
   - 生图成功时调用 `saveMemoryEntry`（memory-storage.ts L57）写入一条轻量长期记忆（仅对非 independentStory 会话），内容为插图描述 + 角色名，标记 source 为剧情配图。
7. **样式**：`src/story.css` 新增 `.story-illustration-card` 系列样式（圆角、阴影、渐变遮罩、骨架 shimmer、深浅色适配）；注意 src/ 下 CSS 有两套平铺副本的情况，本次只改剧情使用的 `src/story.css`，不碰 data-uri SVG（发布通道 lightningcss 会报错）。

## 4. 影响面与调用链
```
handleSend → generateStoryCompletion (story-engine.ts, prompt 新增插图指令)
           → pushStoryMessage 落库
           → [新] generateStoryIllustrations (story-illustration.ts)
               → generateImageFromConfiguredApi (image-generation-service.ts, appId="story")
               → applyIllustrationMediaRef 回填 → updateStoryMessage 落库
               → saveMemoryEntry (memory-storage.ts) 写长期记忆
           → 渲染: StoryHtmlRenderer → [新] splitIllustrationBlocks → 插图卡片组件
记忆读取链(已有, 仅内容增强): storySummary → loadStoryProjectionEntries → short-term-assembler → 各 APP 记忆流
```

## 5. 回归与兼容风险
| 风险点 | 是否破坏现有 | 兼容策略 | 需回归 |
|---|---|---|---|
| StoryMessage 新可选字段 | 否 | Dexie 无 schema 校验，旧数据缺字段正常 | 旧剧情会话打开/续写 |
| 插图标签泄露到剧情上下文 | 低 | 发送给 LLM 前剥离已回填/未回填的插图标签 | 剧情连续性 |
| 生图失败/无配置 API | 否 | 卡片显示失败+重试；未配置 API 时显示引导文案，不影响文本剧情 | 未配置 API 的账号 |
| 切换会话/中止生成时生图 | 否 | 绑定 generationRun signal，回填前校验 run 活跃 | 切会话后返回 |
| 记忆链 | 低 | 仅投影内容追加文案+新增一条记忆，不改结构 | 记忆面板显示 |

## 6. 涉及文件定位
- 新建 `src/lib/story-illustration.ts`（标签解析复用 cocreate-illustration 导出 + 剧情生图封装）
- `src/lib/cocreate-illustration.ts`：把 splitIllustrationBlocks / extractPendingIllustrations / applyIllustrationMediaRef 导出（已是模块级函数，加 export 即可）
- `src/lib/story-storage.ts`：StoryMessage 加 imageMediaRefs 字段；新增 updateStoryMessageImageRefs（若无现成更新函数）
- `src/lib/story-engine.ts`：生成 prompt 追加插图输出指令；上下文发送前剥离插图标签
- `src/components/story/story-app-base.tsx`：插图卡片渲染 + handleSend 后异步生图触发 + 重试处理
- `src/lib/story-storage.ts` L938-970：投影内容附插图描述
- `src/story.css`：卡片样式

## 7. 验收标准
- 剧情续写后，AI 回复中出现插图标签的位置渲染为精美图片卡片，图片自动生成并持久化，刷新后不丢
- 未配置生图 API 时卡片显示失败态+说明，不影响剧情文本
- 失败卡片可点重试并成功回填
- 生图成功的插图描述出现在角色记忆（短期投影与长期记忆），其他 APP 的记忆流可见
- 旧剧情会话（无插图）打开与续写完全正常
- `pnpm run build` 通过；`npx tsc --noEmit` 改动文件零新增错误；dev 预览剧情模块无控制台报错

## 8. 不改动范围
- 不改图像生成配置界面与 API 适配层（image-generation-service / settings-storage）
- 不改共创模块现有插图逻辑（仅复用其解析函数）
- 不做剧情封面的 AI 生成、不做逐段批量生图（每次回复限 1-2 张）
- 不改聊天室媒体气泡机制（插图仅在剧情 APP 内渲染）
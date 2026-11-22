# 需求文档

## 1. 改动目标
在现有虚拟手机项目内新增一个「图文小说」应用（仿番茄小说的 UI 与玩法）：有书城/书架/阅读器，小说由项目当前的 LLM API 配置生成正文、由当前生图 API 配置生成章节配图，实现"文字 + 图片画面"双结合；支持设置文风、每章字数、出场人物设定（可直接复用项目角色库）。进入应用即按项目内已有用户身份"模拟登录"，无需真实注册。

## 2. 现状 vs 目标
- 现状：手机桌面已有阅读（reading）、剧情（story）、漫卷（vnmode）等应用，但均为对话式/分支叙事，没有"长篇连载图文小说"形态；LLM 与生图 API 均已有统一入口。
- 目标：桌面新增「小说」图标 → 打开进入书城/书架 → 选书或新建作品 → 设置文风/字数/人物 → 逐章生成正文与插图 → 阅读器图文混排阅读，进度/书架本地持久化。

## 3. 探索结论（受影响文件，全部绝对路径）
- 注册桌面图标：`/home/project/src/lib/desktop-config.ts`（L3-32 IconId union、L58-74 默认页布局、L76-128 ICONS 元数据）
- 应用打开分发：`/home/project/src/components/desktop-shell.tsx`（L2426-2441 openApp；L4101-4307 renderAppBody 按 activeApp 渲染，如 L4233 diary 分支写法）
- LLM 请求出口：`/home/project/src/lib/llm-http.ts`（fetchLlmPayload）+ `/home/project/src/lib/llm-provider-adapter.ts`（buildProviderRequest 构造请求）；实施时参照 `/home/project/src/lib/story-engine.ts` 的真实调用方式定点补读
- 生图统一入口：`/home/project/src/lib/image-generation-service.ts` L645-653 `generateImageFromConfiguredApi({ description, characterId?, appId? })`，已内置"生图描述纯英文 + CJK 兜底清理"约束
- 角色复用：`/home/project/src/lib/character-storage.ts` L33 `loadCharacters()`；`/home/project/src/lib/character-types.ts`（persona/name/avatar）
- 模拟登录身份：`/home/project/src/lib/settings-storage.ts` L1256 `resolveUserIdentity()`（按 角色>APP>全局 解析当前用户身份）；类型见 `/home/project/src/components/settings/user-identity.tsx` L10-18（id/name/avatarUrl/bio 等）
- 持久化模式：`/home/project/src/lib/kv-db.ts`（kvGet/kvSet）——新建 `novel-storage.ts` 照此模式；样式新增 `src/novel.css` 并在 main.tsx 或组件内引入（参照现有 src/story.css 的挂载方式）

## 4. 功能设计（番茄小说风格）
### 4.1 页面结构（应用内四个 Tab/视图，仿番茄底部导航）
- **书城**：推荐卡片流（AI 预生成题材卡片：题材名+简介+封面），点「立即创作」一键建书；「新建作品」入口（书名、题材、简介）
- **书架**：我的作品列表（封面、书名、已读进度、更新章节数），长按/菜单可删除、编辑设定
- **创作设定页**：每本书可设 —— 文风（如 轻松幽默/热血/细腻言情/悬疑/古风/科幻，支持自定义）、每章字数（500/1000/1500/2000/3000）、出场人物设定（手动填写 + 从角色库一键导入 loadCharacters() 的角色作为书中人物）、插图风格偏好（传给生图的英文前缀）
- **阅读器**：顶部书名+章节名，正文图文混排（每章 1-2 张插图按场景插入），底部 上一章/下一章/继续生成下一章；阅读进度自动保存；字号/背景（日间/夜间/护眼）切换
### 4.2 生成逻辑
- 章节 prompt 组装：世界观+人物设定+前情摘要（自动压缩前几章）+文风+字数要求；要求 LLM 输出正文中穿插 `[插图:纯英文画面描述]` 标签（沿用项目"生图描述必须100%纯英文"硬性约束），正文保持中文
- 解析标签：文字进阅读器，每处标签调用 `generateImageFromConfiguredApi({ description, appId: "novel" })` 生成插图并落库；生图失败时显示占位框不阻塞正文
- 章节生成支持后台进行/取消（AbortController），生成中显示骨架屏
### 4.3 模拟登录
- 打开应用时调用 `resolveUserIdentity()` 取当前身份，作为"读者账号"展示（我的页：昵称、头像、书架归属）；无真实注册/登录流程，身份随项目设置变化

## 5. 业务规则
- 书籍/章节全量存 IndexedDB（kv-db：书籍元数据 + 章节正文 + 插图 mediaRef 引用），刷新不丢失
- 每本书的前情摘要：生成下一章前用最近 2 章结尾 500 字作为上下文，避免爆 token
- 删除书为二次确认；生成过程可随时停止，已生成内容不丢失
- 章节内插图数量上限 2 张，防止生图费用失控

## 6. 异常与边界
| 场景 | 处理 |
|---|---|
| LLM 未配置 API Key | 书城/创作入口提示"请先在设置中配置 AI 接口"，不白屏 |
| 生图未配置/失败 | 章节正常显示文字，插图位显示占位框+重试按钮 |
| 章节生成中断 | 保留已生成文本，标记"未完成"可继续 |
| 无任何作品 | 书架空态引导去书城 |
| 角色库为空 | 人物设定仅手动填写，导入按钮隐藏 |

## 7. 实施步骤
1. `src/lib/novel-types.ts` + `src/lib/novel-storage.ts`：类型与持久化（Book/Chapter/NovelSettings）
2. `src/lib/novel-engine.ts`：章节 prompt 组装、LLM 调用（参照 story-engine 的 buildProviderRequest+fetchLlmPayload 方式）、[插图:] 标签解析、插图生成调用
3. `src/components/novel/novel-app.tsx` 主壳 + 同目录子组件（书城/书架/设定/阅读器），样式写 `src/novel.css`
4. `desktop-config.ts` 注册 "novel" 图标（label「小说」，加入 PAGE_2_DEFAULT）；`desktop-shell.tsx` import + renderAppBody 分发
5. build + dev 验证，截图验收，推送 GitHub

## 8. 测试与验收
- `pnpm run build` 通过；`pnpm run dev` 后截图验收书城/书架/阅读器首屏
- 新建书 → 生成第 1 章：正文出现、插图位渲染（未配生图时占位）
- 刷新后书架与阅读进度仍在；删除书籍生效

## 9. 风险评估
- LLM 配置解析链路（buildProviderRequest 参数）需实施时定点读 story-engine 确认，避免凭空猜接口
- 长文本生成耗时：采用逐章生成+后台任务，不做一次性整本生成
- 生图描述中文风险：复用 image-generation-service 已有 CJK 兜底，插图书签另行要求纯英文
- tsc 存量约 50 处历史错误：仅保证新增文件无新增错误
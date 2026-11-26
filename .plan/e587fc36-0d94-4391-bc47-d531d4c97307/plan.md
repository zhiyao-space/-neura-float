# 需求文档

## 1. 改动目标
新增一个「古风雅集」内置小应用（不换现有 UI、不动整体界面）：集合几款古风趣味小功能，让古风人设的角色有对应玩法。所有图标用 @mdi/js 精美矢量字形 + 自绘装饰，全程零 emoji。

## 2. 探索结论（受影响文件，全部绝对路径）
- 桌面 App 注册：`/home/project/src/lib/desktop-config.ts`（IconId union L3-32、ICONS Record L76-128、PAGE_X_DEFAULT）
- 图标字形：`/home/project/src/components/icon-glyph.tsx`（MDI_PATHS Record L50-80，新增 IconId 必须同步加 key，否则白屏/方块兜底）
- 应用市场/桌面装配：桌面图标点击路由走 MainApp 的 app 分发（mixology/qa 等同为内联页面 App，可参照其路由挂载方式）
- LLM 调用参照：`/home/project/src/lib/cocreate-engine.ts` 的 sendLLMRequest 模式；聊天主链路 `/home/project/src/lib/chat-engine.ts` generateChatCompletion
- 类型契约：`/home/project/src/lib/character-types.ts` Character.tags 判断古风人设
- 样式：新增 `src/gufeng.css`（项目根平铺 CSS 一套即可，无 data-uri SVG）

## 3. 功能设计（首版四件套）
进入应用顶部先选对话角色（古风 tag 角色排前），底部四个雅玩入口：

1. **飞花令**：输入一个令字（花/月/风/雪…），AI 依令接诗句，双方轮流，判负判定+雅致成绩单卡片
2. **抽签问卜**：纯本地签筒动画，抽得签文（上上/中平/下签 + 签诗 + 解语），签文内置 24 支古签库，可点击让 AI 以角色口吻详解
3. **文言雅译**：输入现代白话，AI 转成文言/古风措辞，输出宣纸样式卡片
4. **历法雅鉴**：纯前端计算今日农历·干支·生肖·宜忌，每日一签式展示（不依赖 LLM）

视觉取向：宣纸米色 + 墨色 + 朱砂点缀，衬线古风字体气质，竖排题字装饰、印章式按钮（SVG/cCSS 自绘，无 emoji）。

## 4. 实施步骤
1. `desktop-config.ts`：IconId 加 `"gufeng"`、ICONS 加条目（label「古风雅集」，tone 用现成 --c-icon-amber 系）
2. `icon-glyph.tsx`：`@mdi/js` 取 mdiBrushOutline 或自绘一枝梅花 path，加入 MDI_PATHS
3. 新建 `src/components/gufeng/gufeng-app.tsx`：App 主体 + 三个 AI 玩法 + 历法组件；LLM 调用走项目现有 provider 配置（参照 cocreate-engine resolveRuntime/sendLLMRequest 模式，appId 用 `"gufeng"`）
4. 新建 `src/lib/gufeng-data.ts`：签文库、令字库、飞花令提示词、文言译指令（描述输出纯中文，生图无关）
5. 新建 `src/gufeng.css`：古风样式（宣纸底、墨字、朱砂印）
6. 桌面路由装配：参照 mixology 在 MainApp 的挂载方式把 gufeng-app 挂进应用分发
7. `AGENTS.md` 补一行教训：icon-glyph MDI_PATHS 必须与 IconId 同步

## 5. 异常与边界
| 场景 | 处理 |
|---|---|
| API 未配置 | 玩法按钮提示「请先在设置配置 API」，历法雅鉴仍可用 |
| AI 回复非诗句/超时 | 飞花令判失败前给 1 次重试，超时 30s 提示 |
| 输入为空/含 emoji | 轻提示，不进入请求 |
| 角色无古风 tag | 仍可玩，仅提示「为角色加『古风』标签可获得更贴合口吻」 |

## 6. 验收标准
- 桌面出现「古风雅集」精美图标（无 emoji），点击可进入应用
- 四个玩法均可操作：飞花令有来回应答、抽签有动画与签文、文言雅译输出文言卡片、历法显示今日农历干支
- build + dev 通过，不新增 tsc 错误

## 7. 本期不实现
- 不改聊天气泡/不往 chat-room 加互动类型（热路径风险大，后续迭代）
- 不做古风主题换肤、不动现有 UI

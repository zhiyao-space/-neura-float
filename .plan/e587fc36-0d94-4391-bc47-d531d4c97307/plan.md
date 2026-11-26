# 需求文档

## 1. 改动目标
在「与角色聊天」里加一组古风互动小功能：角色是古风人设（tags 含 古风/古代/武侠）时，聊天「+」面板出现「古风雅玩」入口，点开是一组精美的古风互动玩法；现代角色不显示该入口。整体视觉宣纸米色+墨色+朱砂，全部矢量字形与自绘装饰，零 emoji。

## 2. 探索结论（受影响文件，全部绝对路径）
- 聊天主组件 `/home/project/src/components/chat/chat-room.tsx`（热路径）：
  - L1149 `character` state（可直接读 `character.tags` 判断古风）
  - L3561 `sendRichMessage(mediaType, mediaData, content, mediaUrl)` 落库入口，自定义 mediaType 走它即可（gift/poke 分支是现成参照）
  - L945-957 `showPlusMenu` 面板渲染处（功能入口按钮加在这里）
  - L183-201 `CHAT_VISUAL_MEDIA_TYPES`、L232-247 `CHAT_MEDIA_BUBBLE_TYPES`：新增媒体气泡类型必须同时进两个 Set
- 已有互动参照：掷骰子（mediaType:"dice" + 翻滚动画）、红包（点开动画+结果卡）
- LLM 通道：`/home/project/src/lib/api-helpers.ts` `simpleLLMCall(config, messages, options)`，配置用 `loadApiConfigs()[0]`（与 gufeng-app.tsx 相同）
- 现有古风数据与提示词：`/home/project/src/lib/gufeng-data.ts`（可复用扩展）
- 样式：新增 `src/gufeng-chat.css`（聊天内弹层，遵守弹层自带上背景/边框的教训）

## 3. 玩法设计（聊天内古风雅玩，共五款）
「+」面板古风角色专属入口「雅玩」，点开横排五枚矢量印章式图标（无 emoji）：

1. **飞花传令**：选令字（花/月/风/雪…），AI 以角色口吻接一句含令字的诗，落一条「诗笺」卡片气泡
2. **月老签**：摇签动画 → 抽得签文诗笺气泡（复用 gufeng-data 24 签库），可点「请 TA 解签」让角色口吻解签再落一条
3. **投我木桃**：向角色赠古风信物（玉佩/香囊/折扇/梅花/长明灯），矢量信物卡 + 赠语，角色会自然接话
4. **对联求对**：AI 出上联，用户对下联，双方对联卡片上下并排展示
5. **称谓雅鉴**：AI 把当前对话里最近一句话改写成角色口吻的古风说法，生成「雅言」小卡

所有玩法结果都以自定义 mediaType `"gu_feng_play"` 落库（mediaData 携带 kind 区分渲染），触发角色正常回复（sendRichMessage 已带 setPendingGenerate(true)）。

## 4. 视觉风格
- 参考方向：宣纸质感卡片、墨色衬线字、朱砂印章点缀、细描边矢量图标（@mdi/js + 自绘 SVG path），留白疏朗、信息密度低
- 受影响区块：聊天「+」面板入口、雅玩弹层、五种结果卡气泡
- 弹层遵守项目教训：卡片自带背景色+边框，白底不隐形

## 5. 实施步骤
1. `gufeng-data.ts` 扩展：信物库、对联/称谓提示词、诗笺渲染所需字段
2. 新建 `src/components/chat/gufeng-chat-play.tsx`：雅玩弹层组件（五入口 + 各玩法交互 + 生成结果构造 mediaData），LLM 用 simpleLLMCall，API 未配置时仅可玩本地款（投木桃/月老签）
3. `chat-room.tsx` 接线：
   - 两个 Set 加 `"gu_feng_play"`（严格按行号两处）
   - L945 面板内按 `character?.tags` 条件渲染「雅玩」按钮
   - MessageBubble 渲染分支：按 mediaData.kind 渲染诗笺/签/信物/对联/雅言五种卡片
4. 新建 `src/gufeng-chat.css`，弹层与卡片样式
5. `npx tsc --noEmit` 自查 chat-room 与新文件零新增错误 → build → dev → 推送

## 6. 异常与边界
| 场景 | 处理 |
|---|---|
| API 未配置 | 飞花/对联/雅言按钮置灰提示，本地款（信物/抽签）可玩 |
| LLM 超时/报错 | 生成中骨架提示，失败 toast 重试，不落空消息 |
| 非古风角色 | 不显示入口 |
| 群聊 | 入口同样可用，口吻取当前主角色 |

## 7. 验收标准
- 古风角色聊天「+」面板出现「雅玩」，现代角色不出现
- 五款玩法均可操作并落「雅玩」卡片气泡，角色随后自然回复
- 卡片精美（宣纸卡+朱砂印+矢量图形），全程无 emoji
- build/dev 通过，chat-room 无新增 tsc 错误

## 8. 本期不实现
- 不改聊天引擎的回复逻辑（角色自然接话靠现有 pendingGenerate 机制）
- 不动现有红包/骰子等互动

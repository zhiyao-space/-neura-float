# 需求文档

## 1. 改动目标
用户要求：聊天「雅玩」古风页签里不要全是小游戏，还要有**古人用的器物/物品**（如佩剑、铜钱这类电视剧里常见的东西），数量越多越好。目标：在古风页签新增一个「器物阁」模块——点击任一器物，以精美卡片气泡发送到聊天里（带器物矢量图形 + 品名 + 铭文/用途描述），纯本地数据、无需 API，随点随发。

## 2. 已知事实（无需再探索，接线点均已确认）
- 弹层与气泡组件：`/home/project/src/components/chat/gufeng-chat-play.tsx`（284 行）——`GuFengPlayPanel`（古风/现代双页签，`view` 状态机 menu/feihua/gift/couplet/elegant + LLM 调用）与 `GuFengPlayBubble`（按 `mediaData.kind` 分支渲染）
- 数据层：`/home/project/src/lib/gufeng-data.ts`（117 行）——已有 `GUFENG_GIFTS`（信物：{name, icon(mdi path), message}）可作为器物的直接参照模板；`buildGufengPlayLabel(kind, data)` 需同步加分支
- 样式：`/home/project/src/gufeng-chat.css`——`.gfp-gift-row` / `.gfp-gift` 网格与 `.gfp-bubble-body.gift` 卡片样式可直接复用于器物
- 聊天接线：`chat-room.tsx` 两个 Set 已含 `"gu_feng_play"`、mediaType union 已加、message-bubble.tsx 已有 case 分发——**本轮无需动这三个文件**
-mdi 图标用内联 SVG path（GfpIcon 组件，viewBox 0 0 24 24）

## 3. 方案设计
新增「器物阁」：古风页签网格中第 6 个入口（现有 5 个：飞花传令/月老签/投我木桃/对联求对/称谓雅鉴），点开进入器物 12 件的宫格选择页，点击即发送「器物卡」气泡。

**12 件器物清单**（每件含 name / icon / inscription 铭文一句）：
1. 佩剑 —— 「剑者，心之刃也，非快意恩仇不可轻出。」
2. 铜钱 —— 「外圆内方，通行天下；一钱虽小，可问穷通。」
3. 罗盘 —— 「天南地北，皆归一针。」
4. 铜镜 —— 「以铜为镜，可正衣冠；以卿为镜，可照我心。」
5. 卷轴 —— 「一卷在手，江山万里。」
6. 酒壶 —— 「壶中日月长，杯里乾坤大。」
7. 香炉 —— 「一炉沉水香，静候知音来。」
8. 油纸伞 —— 「一伞烟雨，半世浮生。」
9. 灯笼 —— 「一盏灯火，照夜归人。」
10. 木笛 —— 「笛声三弄，梅心惊破。」
11. 锦囊 —— 「锦囊妙计，危时方启。」
12. 令牌 —— 「见令如见人，持令行四方。」

图标用 mdi path（sword/cash/compass/mirror→用近似矢量/scroll-text/glass-cocktail 类比/fire/umbrella/lamp/flute/purse/shield-key 等近似图形），全部内联字符串，与信物一致的风格。

## 4. 实施步骤
1. `gufeng-data.ts`：新增 `GuFengTool` 类型与 `GUFENG_TOOLS`（12 项）；`buildGufengPlayLabel` 加 `case "tool"`（返回 `[器物阁·品名] 铭文`）
2. `gufeng-chat-play.tsx`：
   - `PlayKind` 联合加 `"tool"`；`view` 联合加 `"tools"`
   - 古风菜单加第 6 项「器物阁」（icon 用卷轴/匣类 path）
   - 新增 `view === "tools"` 渲染：复用 `.gfp-gift-row`/`.gfp-gift` 样式的宫格，点击 `onSend("tool", { toolName, toolIcon, inscription }, ...)`
   - `GuFengPlayBubble` 加 `kind === "tool"` 分支（复用 `.gfp-bubble-body.gift` 居中卡片：大图形 + 品名 + 铭文）
3. CSS 无需新增（全部复用信物样式）；如需微调仅加 `.gfp-bubble-body.tool` 别名类
4. tsc 自查 → build → dev → 推送 GitHub

## 5. 受影响文件清单
- `/home/project/src/lib/gufeng-data.ts`（+器物库 + label 分支）
- `/home/project/src/components/chat/gufeng-chat-play.tsx`（+入口 +选择页 +气泡分支）
- （可选微调）`/home/project/src/gufeng-chat.css`
- **不动**：chat-room.tsx、message-bubble.tsx、chat-storage.ts（管道已通）

## 6. 验收标准
- [ ] 古风页签出现「器物阁」入口，点开为 12 件器物宫格
- [ ] 点击任一器物，聊天流出现器物卡气泡（图形+品名+铭文，宣纸卡片带朱砂印）
- [ ] 全程无需 API 配置即可用
- [ ] build 通过、dev 正常、已推送

## 7. 风险评估
- mdi path 近似图形可能个别不够形似 → 视觉验收时逐一检查，必要时微调 path
- 古风页签菜单增至 6 项（3 列 grid 两行）→ 布局无压力
- 其余玩法不受影响（只加分支不改动既有 kind）

## 8. 不改动范围
- 现有五款玩法与现代页签逻辑不动
- 聊天接线链路（chat-room/message-bubble/chat-storage）不动
# 需求文档

## 1. 改动目标
世界书导入新增 **TXT** 和 **HTML** 格式支持：导入时自动把文档切分为世界书条目（标题→条目备注、正文→条目内容），免去用户手写逐条录入。

## 2. 探索结论（受影响文件，全部绝对路径）
- 类型：`/home/project/src/lib/settings-types.ts` L10-28 —— `WorldBookEntry`（uid/key/content/comment/constant/position 等），`WorldBookConfig.entries`
- 现有 JSON 导入：`/home/project/src/lib/settings-storage.ts` L437-489（`parseWorldBookEntry`、`parseWorldBookFromJson`、`createWorldBook`）、`isUnsupportedWorldBookFormat`
- 导入 UI：`/home/project/src/components/settings/worldbook-manager.tsx` —— L275 file input `accept=".json"`；L289-314 `handleImport`（FileReader→parseWorldBookFromJson→persist）；L330 `makeNewEntry()` 可参照默认条目
- TXT 解析参照：`/home/project/src/lib/reading-parser.ts` —— `parseTxtContent` 有成熟的章节标题检测（中文"第X章"、Markdown heading 等）与分段逻辑
- HTML：项目未装 turndown/cheerio；用浏览器原生 `DOMParser` 剥标签即可，无新依赖
- 项目已有依赖：`jszip`、`marked`、`dompurify`（vibe/阅读模块在用，可复用）

## 3. 方案设计
### 3.1 新增解析模块 `src/lib/worldbook-import-parser.ts`
导出两个纯函数，均返回 `WorldBookConfig`（复用 `createWorldBook`）：

**`parseWorldBookFromTxt(text, fileName)`**
- 参照 reading-parser 的标题检测正则切分条目：`第X章/回/卷/节`、`Chapter X`、`【XXX】`、`## 标题` 等行视为条目标题
- 无任何标题时按**空行分段**：每个连续段落块为一个条目（取块首行前 12 字为备注）
- 每条目字段：`comment`=标题（无则"片段 N"）、`content`=该段正文、`key`=标题本身（让 AI 对话中提到该章节名时触发），`constant=false`，其余用默认值
- 书名取文件名（去扩展名）

**`parseWorldBookFromHtml(text, fileName)`**
- `new DOMParser().parseFromString(text, "text/html")`；取 `<title>` 或文件名作书名
- 以 `h1/h2/h3` 为界切分：每个标题下的内容（剥掉 script/style 后的 textContent，压缩空行）构成一个条目
- 无标题结构时：`<p>` 每若干段（按空行聚组）合为一个条目
- 字段策略同 TXT；若 HTML 含 meta keywords 则并入首个条目 key

### 3.2 导入 UI 接线（worldbook-manager.tsx）
- file input `accept` 改为 `.json,.txt,.html,.htm`
- `handleImport` 按扩展名/文件类型分发：`.txt` → parseWorldBookFromTxt；`.html/.htm` → parseWorldBookFromHtml；其余走原 JSON 逻辑
- 导入成功提示条目数（如"已导入 23 个条目"）；解析结果为空（0 条目）时报"未从文件中识别出任何条目"

## 4. 业务规则
- 条目均为 `constant=false`（关键词触发），key 默认填标题，导入后可在管理界面逐条改
- TXT/HTML 生成条目的 uid 用 `generateId("wb-entry")`，insertion_order 默认 50，position 默认 before_char
- 单文件条目上限 300，超出截断并提示

## 5. 异常与边界
| 场景 | 处理 |
|---|---|
| 空文件/无文本 | 报"文件内容为空" |
| HTML 无标题无段落 | 回退为整篇单条目（comment=文件名） |
| 超大文件（>2MB） | 报错提示文件过大 |
| 扩展名不可识别 | 走 JSON 解析，失败报原错误文案 |

## 6. 实施步骤
1. 新建 `src/lib/worldbook-import-parser.ts`（TXT/HTML 两个解析函数 + 标题检测正则）
2. `worldbook-manager.tsx`：accept 扩展、handleImport 分发、成功/空结果提示
3. tsc 自查 → build → dev → 推送 GitHub

## 7. 验收标准
- 导入一个带"第X章"标题的 TXT，生成对应数量条目，标题/内容/关键词正确
- 导入 HTML 世界书文件，按 h1-h3 切条目，正文无残留标签
- 原 JSON 导入行为不变

## 8. 风险评估
- HTML 结构千奇百怪：用 DOMParser + textContent 剥离，容错性强；极端结构回退整篇单条目
- TXT 标题误判：仅识别强特征行（第X章/【】/##），普通句子不会被当成标题
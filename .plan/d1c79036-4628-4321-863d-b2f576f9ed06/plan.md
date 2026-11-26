# 需求文档

## 1. 改动目标
用户已确认：古风小功能以聊天界面「+」功能弹窗里的「雅玩」模块为准（已上线），独立桌面 App「古风雅集」不再保留，顶部返回按钮问题不再处理。本轮任务是**把上一轮已动手的桌面 App 下线工作收尾干净**：上一轮在移除桌面注册与装配时，`desktop-shell.tsx` 的 mixology 分支丢失了一个闭合大括号，当前代码存在语法破损，必须修复并通过构建。

## 2. 现状 vs 目标
- 现状：
  - `src/lib/desktop-config.ts`：IconId、ICONS、PAGE_3_DEFAULT 中的 gufeng 已移除（已完成）
  - `src/components/icon-glyph.tsx`：`gufeng: mdiFlowerPoppy` 已移除，但文件顶部 `mdiFlowerPoppy` 的 import 仍在（第 43 行附近），属未使用残留
  - `src/components/desktop-shell.tsx`：GuFengApp import 与 gufeng 分支已移除，但**误删了 mixology 分支的闭合 `}`**（约 L4274-4276，`return <MixologyApp .../>;` 后直接跟下一个 if，语法错误）
  - `src/components/chat/chat-room.tsx`：雅玩入口已改为所有单聊角色可见（`showGufengPlayEntry={!!character && !session.isGroup}`）
  - `src/components/gufeng/gufeng-app.tsx` 与 `src/gufeng.css`：已无任何引用，属死代码
- 目标：桌面不再有古风雅集 App；语法修复、残留 import 清理、死文件删除；聊天内雅玩模块保持现状不动。

## 3. 改动点说明
1. 修复 `desktop-shell.tsx`：为 mixology 分支补回闭合 `}`（恢复为 `return <MixologyApp onClose={...} />;` 后换行 `}`）
2. 清理 `icon-glyph.tsx` 顶部未使用的 `mdiFlowerPoppy` import
3. 删除死文件 `src/components/gufeng/gufeng-app.tsx`（整目录若无他文件）与 `src/gufeng.css`
4. 全局确认无其他 `gufeng-app` / `GuFengApp` / `gufeng.css` 引用残留

## 4. 影响面与调用链
```
桌面图标注册(desktop-config.ts) → 图标渲染(icon-glyph.tsx) → 桌面装配(desktop-shell.tsx)
                                                      ↑ 本轮修复点（语法破损）
聊天「+」面板(chat-room.tsx) → 雅玩面板(gufeng-chat-play.tsx) → gufeng-data.ts / gufeng-chat.css 【不动】
```
删除的 gufeng-app.tsx 仅被已移除的 desktop-shell 分支引用，无其他调用方；gufeng-data.ts 同时服务聊天雅玩，**保留**。

## 5. 回归与兼容风险
| 风险点 | 是否破坏现有行为 | 策略 | 需回归验证 |
|---|---|---|---|
| mixology 分支缺 `}` | 是（编译失败） | 补回闭合括号 | build 通过 |
| 桌面已存 kv 里的 gufeng 图标布局数据 | 可能渲染出未知 id | IconGlyph 对未知 id 已有兜底，无 placeholder 配置则不渲染 | 桌面页 3 正常显示 |
| 聊天雅玩模块 | 否 | 不改动 | 「+」面板雅玩可开 |

## 6. 涉及文件定位
- `/home/project/src/components/desktop-shell.tsx`（补 `}`，约 L4274-4277）
- `/home/project/src/components/icon-glyph.tsx`（删 mdiFlowerPoppy import，L43 附近）
- 删除：`/home/project/src/components/gufeng/gufeng-app.tsx`、`/home/project/src/gufeng.css`

## 7. 验收标准
- [ ] `npx tsc --noEmit` 无本次改动引入的新错误
- [ ] `pnpm run build` 通过
- [ ] `pnpm run dev` 启动正常，桌面第三页无「古风雅集」图标、独家特调 App 可正常打开
- [ ] 聊天「+」面板「雅玩」模块打开正常（古风/现代页签）
- [ ] 改动推送 GitHub

## 8. 不改动范围
- 聊天雅玩面板功能、样式与卡片气泡逻辑一律不动
- gufeng-data.ts、gufeng-chat.css、message-bubble.tsx 不动
- 不处理旧版返回按钮问题（用户明确放弃）
# 需求文档

## 1. 改动目标
完整移除上一轮新增的「图文小说」应用模块（含全部注册接线与文件），恢复到无该模块的干净状态，便于后续重新整理。

## 2. 探索结论（受影响文件，全部绝对路径）
该模块为本项目上一轮由我新增，接线点已全部掌握，无需再探索：

**需删除的文件：**
- `/home/project/src/lib/novel-storage.ts`（类型+持久化）
- `/home/project/src/lib/novel-engine.ts`（LLM 章节生成+插图引擎）
- `/home/project/src/components/novel/novel-app.tsx`
- `/home/project/src/components/novel/novel-create.tsx`
- `/home/project/src/components/novel/novel-reader.tsx`
- `/home/project/src/novel.css`

**需移除接线的文件（各删 1-2 行，不动其他代码）：**
- `/home/project/src/lib/desktop-config.ts`：IconId union 中 `"novel"`、ICONS 里 novel 条目、PAGE_2_DEFAULT 中 `"novel"`
- `/home/project/src/components/icon-glyph.tsx`：novel 图标分支及 `mdiBookshelf` import
- `/home/project/src/components/desktop-shell.tsx`：`NovelApp` import、`activeApp === "novel"` 分发分支
- `/home/project/src/main.tsx`：`import "./novel.css"`

## 3. 实施步骤
1. grep `novel` 全量核对引用点，确认无遗漏（注意排除无关单词如 "novelai"——图像生成模块的 NovelAI 配置与本模块无关，绝不能动）
2. 删除 6 个模块文件
3. 逐一移除 4 个文件中的接线行
4. `npx tsc --noEmit` 确认无新增错误 → `pnpm run build` → `pnpm run dev`
5. 提交并推送 GitHub main 分支

## 4. 风险评估
- 唯一风险是误删同名的 `novelai`（生图服务商）相关代码——删除时只按精确路径/精确符号 `"novel"`/`NovelApp`/`mdiBookshelf`/`novel.css` 操作，并逐一核对 grep 结果
- 持久化的 kv 数据（ai_phone_novel_* 键）留在 IndexedDB 中无引用、无副作用，不做清理；用户后续重做时也不会冲突（届时会换命名）
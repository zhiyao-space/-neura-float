# AGENTS.md

## Dependencies
- 迁移自 GitHub 仓库 zhiyao-space/-wanwo-float-（原 Next.js 15 项目），保留原项目全部业务依赖：three/@react-three（3D 场景）、react-markdown 系（聊天渲染）、dexie（IndexedDB KV 存储）、jszip、dompurify、marked、pinyin-pro、qrcode、@supabase/realtime-js、@gltf-transform（模型优化）等
- 额外补装：`three-stdlib`、`@gltf-transform/core`、`@gltf-transform/extensions`、`meshoptimizer`（源码直接 import 但原 package.json 只作为间接依赖）、`esbuild`（rolldown-vite 压缩阶段需要）
- vite 使用 `npm:rolldown-vite@7.3.1` 替代（见下）

## Architecture
- 源码整体从原仓库 `components/`、`lib/`、`styles/` 平移到 `src/`，`public/` 静态资源（159MB 字体/模型/图标）原样复制；`@/` 路径别名沿用
- 路由：TanStack Router 文件路由替代 Next App Router，页面仅 5 个：`/`（MainApp 虚拟手机）、`/world-builder`、`/characters`、`/verify`、`/app-market/admin`
- 原 `next/dynamic` → React `lazy + Suspense`（WorldBuilder 的 SceneViewport）
- 原 19 组 `app/api/*` 服务端路由未迁移（Vite 无服务端运行时），依赖它们的功能（图片生成代理、语音克隆、Web Push、鉴权登录、微信助手等）会请求失败，后续可用 Meoo Cloud Edge Functions 补齐
- 构建配置在 vite.config.ts 拆了 vendor-three / vendor-markdown / vendor-media 三个 manualChunks

## What Didn't Work
- ❌ 原版 Vite(Rollup 4) 生产构建：8342 模块在 "rendering chunks" 阶段稳定 OOM（4GB 沙箱，manualChunks/minify false/调 heap 均无效）→ 换 `rolldown-vite`（Rust 打包器）后 17s 构建成功
- ❌ 原仓库 `screenshot-settings.tsx` 引用的 `deleteScreenshotRecord` 在任何历史提交中都未导出（上游坏引用）→ 在 `src/lib/screenshot/config.ts` 补齐实现（删索引 + 动态 import 清理媒体引用）

## Lessons
- CSS data-uri SVG 中未编码的 `url(%23n)`（utf8 裸 SVG）会被 lightningcss 压缩时报 `Unexpected token Delim('%')`，需把 `<` `>` 引号等统一 URL 编码
- 预览环境 WebSocket 502/SSL 报错来自沙箱代理不支持 HMR ws，属噪音；`cdn.jsdelivr.net` 在沙箱内不可达，外部 CDN 资源会 ERR_CONNECTION_RESET

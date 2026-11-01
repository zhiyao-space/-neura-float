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
- ❌ 原版 Vite(Rollup 4) 生产构建：8342 模块在 "rendering chunks" 阶段稳定 OOM（4GB 沙箱）→ 换 `rolldown-vite`（Rust 打包器，`npm:rolldown-vite@7.3.1` + esbuild + NODE_OPTIONS 2500MB）后 17s 构建成功
- ❌ build 与 dev 同时跑、或多个 vite 残留进程并存会 OOM/耗尽线程（Go 组件 errno=11 "cannot create OS thread"）→ 先 `lsof -i :3015 -t | xargs kill` 再 build，完成后重启 dev
- ❌ GitHub 直连推送偶发 GnuTLS TLS 中断，且后台 nohup git push 可能长时间无日志卡住 → 改用前台 `timeout 100 git push -v --progress` 带令牌直推（HTTP/1.1 + postBuffer 500MB），增量提交秒级完成

## Lessons
- CSS data-uri SVG 中未编码的 `url(%23n)` 会被 lightningcss 报 `Unexpected token Delim('%')`，需把 `<` `>` 引号统一 URL 编码
- 预览环境 WebSocket 502/SSL 报错来自沙箱代理不支持 HMR ws，属噪音；`cdn.jsdelivr.net` 在沙箱内不可达
- 存量 typecheck（tsc --noEmit）有约 50 处历史错误（qrcode 缺声明、ui/button 导出名不符等），build 本身可通过；改动的文件需自查别新增错误
- 前台短时 `timeout N git push -v --progress` 能拿到完整诊断输出；后台 nohup 推送日志为空时多半是卡在凭证或静默挂起
- 聊天室对 role="user" 且 content 为空的消息走 isHiddenChatFlowMessage → display:none；新增纯媒体气泡类型必须同时加进 chat-room.tsx 的 CHAT_VISUAL_MEDIA_TYPES 和 CHAT_MEDIA_BUBBLE_TYPES 两个集合，否则落库成功但界面不可见

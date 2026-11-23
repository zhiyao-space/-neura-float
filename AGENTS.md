# AGENTS.md

## Dependencies
- 迁移自 GitHub 仓库 zhiyao-space/-wanwo-float-（原 Next.js 15 项目），保留原项目全部业务依赖：three/@react-three（3D 场景）、react-markdown 系（聊天渲染）、dexie（IndexedDB KV 存储）、jszip（NovelAI ZIP 响应解包、vibe 编码文件解压）、dompurify、marked、pinyin-pro、qrcode、@supabase/realtime-js、@gltf-transform（模型优化）等
- 额外补装：`three-stdlib`、`@gltf-transform/core`、`@gltf-transform/extensions`、`meshoptimizer`（源码直接 import 但原 package.json 只作为间接依赖）、`esbuild`（rolldown-vite 压缩阶段需要）
- vite 使用 `npm:rolldown-vite@7.3.1` 替代（见下）

## Architecture
- 源码整体从原仓库 `components/`、`lib/`、`styles/` 平移到 `src/`，`public/` 静态资源（159MB 字体/模型/图标）原样复制；`@/` 路径别名沿用
- 路由：TanStack Router 文件路由替代 Next App Router，页面仅 5 个：`/`（MainApp 虚拟手机）、`/world-builder`、`/characters`、`/verify`、`/app-market/admin`
- 原 `next/dynamic` → React `lazy + Suspense`（WorldBuilder 的 SceneViewport）
- 原 19 组 `app/api/*` 服务端路由未迁移（Vite 无服务端运行时）：图像生成/模型拉取已改为浏览器直连（`/api/image-generation` 服务端转发分支已删除），其余依赖服务端的功能（语音克隆、Web Push、鉴权登录、微信助手等）仍会请求失败
- 图像生成配置存于 kv `ai_phone_image_generation_settings_v1`（settings-storage.ts）；NovelAI 原生格式生图在 `image-generation-service.ts` 的 `generateNovelAiDirect`，统一入口 `generateImageFromConfiguredApi`（角色生图/朋友圈/栖所/头像等都走它）；Vibe 画风参考存 IndexedDB 资产（`novelai.vibes`），解析在 `vibe-import.ts`

## What Didn't Work
- ❌ 原版 Vite(Rollup 4) 生产构建：8342 模块在 "rendering chunks" 阶段稳定 OOM（4GB 沙箱）→ 换 `rolldown-vite`（`npm:rolldown-vite@7.3.1` + esbuild + NODE_OPTIONS 2500MB）后 18s 构建成功
- ❌ build 与 dev 同时跑、或多个 vite 残留进程并存会 OOM/耗尽线程（errno=11 "cannot create OS thread"）→ 先 `lsof -i :3015 -t | xargs kill` 再 build，完成后重启 dev
- ❌ GitHub 直连推送偶发 GnuTLS TLS 中断，且后台 nohup git push 会静默挂起无日志 → 前台 `timeout 100 git push -v --progress` 带令牌直推
- ❌ 中转站模型列表只按 image/dall/flux 等关键词过滤会滤掉 novel/nai 类模型 → IMAGE_MODEL_HINTS 需补 novel/nai/anime，过滤空时回退全量

## Lessons
- CSS data-uri SVG 噪点纹理会被发布通道 lightningcss 报错（本地 rolldown-vite 能过但发布失败），根治办法是彻底移除 data-uri SVG；注意 src/ 下有两套 CSS（根平铺 `src/*.css` 与 `src/styles/*.css`），清理必须两套都做，漏一套发布仍报同样错误
- 预览环境 WebSocket 502/SSL 报错来自沙箱代理不支持 HMR ws，属噪音；`cdn.jsdelivr.net` 在沙箱内不可达
- 存量 typecheck（tsc --noEmit）有约 50 处历史错误（qrcode 缺声明、ui/button 导出名不符等），build 本身可通过；改动的文件需自查别新增错误
- 聊天室对 role="user" 且 content 为空的消息走 isHiddenChatFlowMessage → display:none；新增纯媒体气泡类型必须同时加进 chat-room.tsx 的 CHAT_VISUAL_MEDIA_TYPES 和 CHAT_MEDIA_BUBBLE_TYPES 两个集合，否则落库成功但界面不可见
- 媒体气泡外壳被 .chat-bubble-media 强制 transparent，卡片类气泡必须自带背景色+边框，否则白底卡片在白背景上"隐形"
- 聊天气泡组件是运行时热路径：气泡内引用未定义变量会炸掉整个聊天组件（白屏），vite build 不报这类错（仅 esbuild 转译）——改气泡组件后必须 `npx tsc --noEmit` 自查该文件无新增错误
- NovelAI 原生端点生成请求只认 encode-vibe 编码（Vibe Transfer 的 reference_image_multiple），塞原始图片 base64 会报 400 INVALID_NATIVE_REQUEST；原图条目需先 POST /ai/encode-vibe（中转站 /v1 前缀）并按 图片+强度+模型 缓存

# 需求文档

## 1. 改动目标
改造「图像生成 API」功能：
1. 按 NovelAI 官方逻辑结构/原生格式出图（中转站支持 NAI 原生格式，请求体形如 `{prompt, negative_prompt, size:[w,h], steps}`）
2. 填中转站地址+密钥拉取模型列表后，模型选择里要能看到中转站的 Novel 模型（现在被过滤只剩 gpt 类）
3. 删除「直连官方通道模式 / 服务端转发」的请求方式配置（只保留浏览器直连中转站一种方式）
4. 新增「导入 Vibe (PNG / 编码文件)」：导入 vibe 编码模型文件，生图互动时作为画风参考，角色生图同样走这套逻辑

## 2. 现状 vs 目标

| 项 | 现状 | 目标 |
|---|---|---|
| 请求方式 | 设置页有「服务端转发/浏览器直连」下拉（OpenAI 模式和 NovelAI 模式各一处） | 删除该下拉与 server 分支，仅浏览器直连中转站 |
| 模型列表 | `filterLikelyImageModels` 只按 image/dall/flux/sd 等关键词过滤，novel/nai 类模型名被滤掉 | 关键词补 novel/nai/anime 等；过滤后为空则显示全部；NovelAI 模式也真正拉取中转站 /models |
| NovelAI 生图 | 已有 NAI 原生格式 `generateNovelAiDirect`（input/action/parameters + ZIP 解包），但模型列表是硬编码 8 个内置模型 | 保留 NAI 原生结构，模型改为可从中转站拉取；参数按用户站文档支持 prompt/negative_prompt/size/steps |
| Vibe | 完全没有 | 新增文件导入（PNG / .naiv4vibe 等编码文件）→ base64 存储 → 生图时作为参考图参数（NAI 原生 `reference_image` / vibe 字段）→ 设置页可管理（启用/强度） |

## 3. 改动点说明
- **请求方式精简**：移除两处「请求方式」Select 及其 `server` 分支代码（服务端 /api 代理在本项目本就不存在）；`requestMode` 字段保留兼容旧配置读取但不再展示
- **模型拉取修复**：`IMAGE_MODEL_HINTS` 增加 "novel"、"nai" 等关键词；NovelAI 面板的「验证 Token」改为真正请求 `${baseUrl}/models`（带密钥），把中转站返回的 Novel 模型填入下拉
- **Vibe 导入**：设置页 NovelAI 面板新增「导入 Vibe (PNG / 编码文件)」按钮 + 文件列表管理；解析 PNG/编码文件为 base64 存入 IndexedDB/设置，生图请求时附加为 vibe 参考参数（含强度可调）；聊天/角色生图共用同一配置自动生效
- **角色生图**：`generateImageFromConfiguredApi` 统一入口不变，NovelAI 分支自动带上 vibe 参考与 NAI 原生参数

## 4. 影响面与调用链

```
设置页 image-generation-settings.tsx
  └─ fetchImageGenerationModels / fetchNaiModels（模型拉取，改过滤+真拉取）
  └─ Vibe 导入 UI（新增）
        └─ src/lib/vibe-import.ts（新建：PNG/编码文件解析→base64）
        └─ settings-storage.ts（vibes 列表持久化）
生图链路（不受 UI 改动影响，自动继承）：
moments-engine.ts generateMomentPhotoUrl ─┐
dwelling-image.ts / widget/avatar.ts 等 ──┴→ image-generation-service.ts generateImageFromConfiguredApi
      ├─ OpenAI 分支：generateImageDirect（保留）
      └─ NovelAI 分支：generateNovelAiDirect ← 增加 vibe 参考参数（novelai-image-config.ts 提供常量/规范化）
```

## 5. 回归与兼容风险

| 风险点 | 是否破坏现有行为 | 兼容策略 | 需回归测试 |
|---|---|---|---|
| 删 requestMode UI | 旧配置仍带该字段 | 类型保留字段，读取时忽略 | 设置页正常打开、保存 |
| 模型过滤放宽 | 可能多出非生图模型 | 过滤空时回退全量（现有逻辑） | 拉取后可见 novel 模型 |
| NovelAI 真拉取模型 | 验证按钮行为变化 | 拉取失败回退内置 NOVELAI_COMMON_MODELS | 验证/拉模型/生图 |
| vibe 参数附加 | 中转站不认会报错 | vibe 未导入时不附加；失败提示原始错误 | 导入 vibe 后生图成功、无 vibe 生图不受影响 |

## 6. 涉及文件定位
- `src/components/settings/image-generation-settings.tsx` — 删请求方式下拉、加 Vibe 导入 UI、NovelAI 模型下拉接真拉取
- `src/lib/image-generation-service.ts` — filterLikelyImageModels 关键词、fetchNovelAiModels 真拉取、generateNovelAiDirect 加 vibe 参数、删 server 分支调用路径
- `src/lib/settings-types.ts` — ImageGenerationSettings/NovelAiPreset 增加 vibes 字段类型
- `src/lib/settings-storage.ts` — 默认值与持久化加 vibes
- `src/lib/novelai-image-config.ts` — vibe 相关常量与参数规范化
- 新建 `src/lib/vibe-import.ts` — 文件解析（PNG 元数据/编码文件→base64 参考图）
- 参照实现：`src/components/settings/preset-manager.tsx` 的文件导入模式

## 7. 验收标准
- [ ] 图像生成 API 设置页不再出现「请求方式/直连官方通道」相关选项
- [ ] 填中转站地址+密钥拉取后，模型下拉能看到 novel 类模型
- [ ] 可导入 PNG/编码 vibe 文件，列表可见、可删除、可选启用
- [ ] 用导入的 vibe 生图成功（NAI 原生格式请求），不导 vibe 时生图不受影响
- [ ] 角色生图（聊天 [photo]/朋友圈照片）按同一配置出图
- [ ] pnpm run build 通过 + dev 预览正常

## 8. 不改动范围
- OpenAI 兼容生图分支逻辑保留（仅删 server 转发选项）
- 聊天/朋友圈/住宅/头像等生图调用点业务逻辑不动
- 其余设置页功能不动
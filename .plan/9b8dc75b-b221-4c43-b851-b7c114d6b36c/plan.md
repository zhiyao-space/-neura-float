# 需求文档

## 1. 改动目标
按你提供的《NovelAI Vibe 编码导入/导出实现文档》，把本项目现有的 Vibe 功能改造成**编码（encoded）为中心**的正确逻辑结构。关键认知纠偏：生成请求**只认编码**（`encode-vibe` 返回的二进制转 base64），不认原始图片 Base64——现有实现把导入图片的原图 base64 直接塞进 `reference_image_multiple`，对原生端点会报 400 INVALID_NATIVE_REQUEST。其他结构功能不动。

## 2. 现状 vs 目标

| 项 | 现状 | 目标 |
|---|---|---|
| zip 导入 | 只取压缩包里「第一个」能解析的文件 | 遍历包内**全部** `.naiv4vibe` 条目逐条导入（官方 Export as Encodings 打包格式：每张一个 .naiv4vibe） |
| .naiv4vibe 解析 | 当普通 JSON 找最长 base64 字段 | 标准 JSON.parse 取 `data` 字段（兼容 data/encoded/image 三种字段名），存为编码条目 |
| PNG 导入 | 直接把 PNG 当原图存入 | 读 PNG tEXt "Comment" 块 stealth_pngcomp 隐写（gzip JSON、alpha 通道最低位、列优先）提取内嵌 vibes[].data；没有则提示「无 Vibe 数据」 |
| 编码条目存储 | 无 encoded 概念，只存原图 assetId | 每条 vibe 支持「纯编码」（无原图，assetId 为空）与「原图待编码」两种形态 |
| 生成注入 | 原图 base64 直接进 reference_image_multiple | 编码进 `reference_image_multiple` + `use_reference_image:true` + `normalize_reference_strength_multiple:true`；原图条目生成时先经 `/v1/ai/encode-vibe` 编码并缓存（缓存键 = 图片+提取强度+模型） |
| V3 模型 | 三数组格式 | 模型名含 nai-diffusion-3 时用 V3 单值字段（reference_image / reference_information_extracted / reference_strength / normalize_reference_strength） |
| 导出 | 无 | 每条有序编码的 vibe 可导出：单条 `.naiv4vibe`（{prompt:"vibe encoding for NAIV4", information_extracted, data}）/多条打包 ZIP（store 方式，vibe_bundle_N_时间戳.zip） |

## 3. 影响面与调用链

```
设置页 image-generation-settings.tsx（Vibe 导入 UI / 编码徽标 / 导出按钮）
  └─ vibe-import.ts（重写导入分流：zip 全量 .naiv4vibe / .naiv4vibe / .json 捆绑 / PNG 隐写）
  └─ settings-types.ts + settings-storage.ts（NovelAiVibeReference 增加 encoded、source 字段）
生成链路（角色生图自动继承）：
moments-engine.ts 等业务 → image-generation-service.ts generateNovelAiDirect
  └─ vibe 数据准备：有 encoded 直接用；只有原图 → encode-vibe 编码并缓存
  └─ V4/V4.5 三数组 + normalize；V3 单值字段
```

## 4. 改动点说明
1. `src/lib/vibe-import.ts` 重写：
   - zip：遍历全部 `.naiv4vibe` 条目 → JSON.parse → 取 `data/encoded/image` 字段 → 逐条返回 `{ encoded, infoExtracted, name }`，无原图（b64/dataUrl 留空）
   - `.naiv4vibe` 单文件：同上
   - `.json` 捆绑：`{vibes:[{data,information_extracted,strength}]}` 或单对象
   - PNG：解析 tEXt "Comment"（stealth_pngcomp：alpha 最低位列优先读位流 → gzip 解压 → JSON.vibes）→ 逐条导入；失败提示「未找到 Vibe 编码数据（可能被二次压缩破坏）」
   - 返回类型改为数组 `parseVibeFile → parseVibeFiles`
2. `src/lib/settings-types.ts`：`NovelAiVibeReference` 增加 `encoded?: string`（编码本体 base64）、`source: "encoded" | "image"`；assetId 变为可选
3. `src/lib/settings-storage.ts`：normalize 兼容新字段（纯编码条目无 assetId 也能保存）
4. `src/lib/image-generation-service.ts` `generateNovelAiDirect` / NovelAI 分支：
   - 生成前对「原图条目」懒编码：`POST {baseUrl}/v1/ai/encode-vibe`（body: image/information_extracted/model），响应二进制转 base64 存回该条 vibe 的 encoded（缓存键 = 原图+提取强度+模型，改强度自动失效重编）
   - payload 注入：V4/V4.5 → `use_reference_image:true` + 三个平行数组（encoded 为空被过滤）+ `normalize_reference_strength_multiple:true`；V3 → 单值字段 + normalize
5. `src/components/settings/image-generation-settings.tsx`：
   - 导入逻辑改用 parseVibeFiles（zip 全量导入，支持多选）
   - 列表条目：纯编码条目显示「Vibe 编码」占位块 + 编码状态徽标；原图条目维持缩略图
   - 新增「导出编码」按钮：有序编码的条目逐条序列化为官方格式，单条下载 .naiv4vibe、多条 JSZip 打包（store 方式）
6. 设置页已新增的「接口地址 Base URL」沿用，encode-vibe 走同一中转站

## 5. 回归与兼容风险

| 风险点 | 兼容策略 | 需回归测试 |
|---|---|---|
| 旧数据只有原图无 encoded | 保留原图逻辑，生成时懒编码回填 | 旧 vibe 生图 |
| 中转站不支持 /v1/ai/encode-vibe | 报错文案带接口提示，不影响编码条目直接生图 | 导入官方编码后直接生图（零成本） |
| PNG 无隐写数据 | 明确提示原因（微信/QQ/截图二次压缩会破坏元数据） | 导入普通 PNG |
| export 需 encoded | 无编码条目导出按钮禁用并提示 | 导出 zip 再导入回环 |

## 6. 涉及文件
- `src/lib/vibe-import.ts`（重写）
- `src/lib/settings-types.ts`、`src/lib/settings-storage.ts`
- `src/lib/image-generation-service.ts`
- `src/components/settings/image-generation-settings.tsx`

## 7. 验收标准
- [ ] 导入你现有的 vibe_bundle zip：包内每个 .naiv4vibe 都成为独立条目，显示「Vibe 编码」徽标
- [ ] 编码条目直接生图成功（原生格式，不再 400 INVALID_NATIVE_REQUEST）
- [ ] PNG 隐写编码可提取导入；普通 PNG 给出明确「无 Vibe 数据」提示
- [ ] 原图条目生成时自动 encode-vibe 并缓存，第二次不再重编
- [ ] V3 模型注入单值字段，V4/V4.5 注入三数组 + normalize
- [ ] 导出 zip → 再导入回环成功
- [ ] pnpm run build + dev 双门禁通过，推送 GitHub

## 8. 不改动范围
- 生成请求其余参数（分辨率/采样器/负面词等）、角色生图调用点、OpenAI 兼容生图分支、其他设置页功能均不动
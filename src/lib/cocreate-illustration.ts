// lib/cocreate-illustration.ts
// 共创场景插图：解析正文中的 [插图:desc] / [插图:desc|mediaRef] 标签，
// 调用统一生图入口（自动注入全局 NovelAI vibes 画风），并把 mediaRef 回写进正文持久化。

import { generateImageFromConfiguredApi } from "./image-generation-service";
import { COCREATE_APP_ID } from "./cocreate-types";

/** 插图标签正则：[插图:描述] 或已回填引用的 [插图:描述|mediaRef]。 */
export const ILLUSTRATION_TAG_PATTERN = /\[插图[:：]\s*([^\]|]+?)(?:\|([^\]]+))?\]/g;

export type IllustrationBlock =
  | { type: "text"; content: string }
  | { type: "illustration"; desc: string; mediaRef: string | null };

/** 把带插图标签的正文拆为 文本/插图 块序列（渲染层复用，纯函数无副作用）。 */
export function splitIllustrationBlocks(content: string): IllustrationBlock[] {
  const blocks: IllustrationBlock[] = [];
  let last = 0;
  const pattern = new RegExp(ILLUSTRATION_TAG_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match.index > last) {
      blocks.push({ type: "text", content: content.slice(last, match.index) });
    }
    blocks.push({ type: "illustration", desc: match[1].trim(), mediaRef: match[2]?.trim() || null });
    last = match.index + match[0].length;
  }
  if (last < content.length) blocks.push({ type: "text", content: content.slice(last) });
  return blocks;
}

/** 提取正文中尚未回填 mediaRef 的插图描述（用于触发生图）。 */
export function extractPendingIllustrations(content: string, limit = 2): string[] {
  const pending: string[] = [];
  const pattern = new RegExp(ILLUSTRATION_TAG_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (!match[2]?.trim() && match[1].trim() && !pending.includes(match[1].trim())) {
      pending.push(match[1].trim());
      if (pending.length >= limit) break;
    }
  }
  return pending;
}

/** 把正文中指定描述的标签回填 mediaRef（找不到时原样返回）。 */
export function applyIllustrationMediaRef(content: string, desc: string, mediaRef: string): string {
  return content.replace(
    new RegExp(`\\[插图[:：]\\s*(${escapeRegExp(desc)})(\\|[^[\\]]+)?\\]`),
    `[插图:${desc}|${mediaRef}]`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 调用统一生图入口生成一张场景插图，返回 mediaRef；失败返回 null。 */
export async function generateIllustrationMediaRef(
  description: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await generateImageFromConfiguredApi({
    description,
    appId: COCREATE_APP_ID,
    signal,
  });
  return result?.mediaRef || null;
}

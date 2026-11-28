// 剧情场景插图：复用共创模块的 [插图:desc|mediaRef] 标签协议，
// 调用统一生图入口（appId 绑定 story，自动注入全局 NovelAI vibes 画风），
// 并把插图事件写入角色记忆（记忆通连）。

import { generateImageFromConfiguredApi } from "./image-generation-service";
import { saveMemoryEntry } from "./memory-storage";
import type { MemoryEntry } from "./memory-types";
import {
  ILLUSTRATION_TAG_PATTERN,
  splitIllustrationBlocks,
  extractPendingIllustrations,
  applyIllustrationMediaRef,
} from "./cocreate-illustration";

export {
  ILLUSTRATION_TAG_PATTERN,
  splitIllustrationBlocks,
  extractPendingIllustrations,
  applyIllustrationMediaRef,
};

/** 剧情配图标签：[插图:描述] 或已回填的 [插图:描述|mediaRef]。 */
export type StoryIllustrationBlock =
  | { type: "text"; content: string }
  | { type: "illustration"; desc: string; mediaRef: string | null };

/** 剥离正文中的插图标签（发送给 LLM 的上下文、记忆投影等纯文本场景使用）。 */
export function stripStoryIllustrationTags(text: string): string {
  if (!text || !text.includes("[插图")) return text;
  return text
    .replace(new RegExp(ILLUSTRATION_TAG_PATTERN.source, "g"), " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 收集正文中全部插图描述（已回填与否都算），用于记忆投影“配图：xxx”。 */
export function collectStoryIllustrationDescriptions(text: string, limit = 3): string[] {
  if (!text) return [];
  const descs: string[] = [];
  const pattern = new RegExp(ILLUSTRATION_TAG_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const desc = match[1]?.trim();
    if (desc && !descs.includes(desc)) {
      descs.push(desc);
      if (descs.length >= limit) break;
    }
  }
  return descs;
}

/** 调用统一生图入口生成一张剧情场景插图；失败/无配置返回 null。 */
export async function generateStoryIllustrationMediaRef(
  description: string,
  options?: { characterName?: string; signal?: AbortSignal },
): Promise<string | null> {
  const contextPrefix = options?.characterName?.trim() ? `${options.characterName.trim()}的剧情场景插画：` : "剧情场景插画：";
  const result = await generateImageFromConfiguredApi({
    description: `${contextPrefix}${description}`,
    appId: "story",
    signal: options?.signal,
  });
  return result?.mediaRef || null;
}

/** 生图成功后把“剧情配图”写入角色长期记忆（记忆通连），失败静默忽略。 */
export async function saveStoryIllustrationMemory(
  characterId: string,
  characterName: string,
  description: string,
  messageIds: string[] = [],
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `story_illu_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      characterId,
      sourceApp: "story",
      type: "long_term",
      content: `在剧情中出现过这样一幅画面（已生成配图）：${description}`,
      importance: 0.4,
      createdAt: now,
      updatedAt: now,
      sourceMessageIds: messageIds,
      metadata: { kind: "story_illustration", characterName },
    };
    await saveMemoryEntry(entry);
  } catch (error) {
    console.warn("[story-illustration] 写入配图记忆失败（忽略）:", error);
  }
}

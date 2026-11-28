// 剧情场景插图：复用共创模块的 [插图:desc|mediaRef] 标签协议，
// 调用统一生图入口（appId 绑定 story，自动注入全局 NovelAI vibes 画风），
// 并把插图事件写入角色记忆（记忆通连）。

import { generateImageFromConfiguredApi } from "./image-generation-service";
import { sendLLMRequest } from "./chat-engine";
import { resolveStoryConfigs } from "./story-engine";
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

const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff]/;

/**
 * 旧消息的插图描述可能是中文，而 NovelAI 会把中文字符全部过滤掉导致提示词近乎为空。
 * 这里在生图前检测到中文时，用当前对话 LLM 把画面描述翻译成英文 danbooru 风格提示词；
 * 翻译失败则原样返回（OpenAI 兼容引擎本身支持中文，不受影响）。
 */
async function translateIllustrationDescToEnglish(description: string, characterId?: string): Promise<string> {
  if (!CJK_PATTERN.test(description)) return description;
  try {
    const { apiConfig, preset, regexes } = resolveStoryConfigs(characterId || "");
    if (!apiConfig) return description;
    const translated = await sendLLMRequest(
      apiConfig,
      preset,
      [
        { role: "system", content: "You convert a Chinese scene description into a concise English image-generation prompt in danbooru tag style (comma-separated English phrases). Output ONLY the English prompt, no explanation, no Chinese characters." },
        { role: "user", content: description },
      ],
      regexes,
      { characterName: "" },
      { skipOutputRegex: true },
    );
    const text = (translated || "").trim().replace(/^["'“”]+|["'“”]+$/g, "");
    if (text && !CJK_PATTERN.test(text)) {
      console.info("[story-illustration] 中文画面描述已翻译为英文提示词:", text);
      return text;
    }
  } catch (error) {
    console.warn("[story-illustration] 画面描述英译失败，回退原文:", error);
  }
  return description;
}

/** 调用统一生图入口生成一张剧情场景插图；失败/无配置返回 null。 */
export async function generateStoryIllustrationMediaRef(
  description: string,
  options?: { characterName?: string; characterId?: string; signal?: AbortSignal },
): Promise<string | null> {
  const englishDescription = await translateIllustrationDescToEnglish(description, options?.characterId);
  const contextPrefix = options?.characterName?.trim() ? `${options.characterName.trim()} scene illustration, ` : "story scene illustration, ";
  const result = await generateImageFromConfiguredApi({
    description: `${contextPrefix}${englishDescription}`,
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

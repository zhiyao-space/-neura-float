// 图文小说引擎：章节 LLM 生成、[插图:...] 标签解析、插图生成
import { fetchLlmPayload } from "@/lib/llm-http";
import {
  buildProviderRequest,
  parseProviderResponse,
  providerKindForConfig,
  type LlmRequestMessage,
} from "@/lib/llm-provider-adapter";
import { generateImageFromConfiguredApi } from "@/lib/image-generation-service";
import {
  loadBindingConfig,
  loadApiConfigs,
  resolveBinding,
} from "@/lib/settings-storage";
import type { ApiConfig } from "@/lib/settings-types";
import {
  loadNovelChapters,
  saveNovelChapters,
  type NovelBook,
  type NovelChapter,
} from "@/lib/novel-storage";

/** 解析当前绑定配置下可用的 API 配置（appId "novel"）。未配置时抛错由调用方提示。 */
export function resolveNovelApiConfig(): ApiConfig {
  const bindings = loadBindingConfig();
  const slot = resolveBinding(bindings, undefined, "novel");
  const apiConfig = loadApiConfigs().find((config) => config.id === slot.apiConfigId);
  if (!apiConfig) {
    throw new Error("尚未配置 AI 接口，请先到 设置 → 接口配置/绑定管理 中完成配置");
  }
  return apiConfig;
}

function buildChapterMessages(book: NovelBook, contextBlock: string, chapterIndex: number): LlmRequestMessage[] {
  const chars = book.characters
    .map((c) => `- ${c.name}：${c.description}`)
    .join("\n");
  const system = [
    `你是一位连载小说作家，正在创作长篇小说《${book.title}》（题材：${book.genre}；文风：${book.style}）。`,
    book.intro ? `作品简介：${book.intro}` : "",
    chars ? `出场人物设定：\n${chars}` : "",
    contextBlock ? `前情梗概（供衔接，不要照抄）：\n${contextBlock}` : "这是第一章，请直接开篇。",
    "",
    "本次创作第 " + (chapterIndex + 1) + " 章，要求：",
    `- 正文约 ${book.chapterLength} 字，中文书写，以叙事推进为主，结尾留有悬念。`,
    "- 请先输出一行章节标题，格式为「第N章 标题」。正文分自然段，不要用 markdown 标题符号。",
    '- 在正文合适位置穿插 1-2 个插图标签，格式为 [插图:纯英文画面描述]，描述必须是100%纯英文（Danbooru 标签或英文短句），严禁任何中文字符，否则生图接口会报错。',
    "- 只输出小说内容本身，不要输出任何解释或额外说明。",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: "请开始创作本章内容。" },
  ];
}

function buildContextBlock(book: NovelBook, chapterIndex: number): string {
  if (chapterIndex <= 0) return "";
  const chapters = loadNovelChapters()
    .filter((c) => c.bookId === book.id && c.index < chapterIndex && (c.status === "done" || c.status === "partial"))
    .sort((a, b) => b.index - a.index)
    .slice(0, 2);
  return chapters
    .map((c) => `${c.title}（结尾节选）：${c.rawContent.replace(/\[插图:[^\]]*\]/g, "").slice(-500)}`)
    .reverse()
    .join("\n\n");
}

async function callLlm(apiConfig: ApiConfig, messages: LlmRequestMessage[], signal?: AbortSignal): Promise<string> {
  const payload = buildProviderRequest(apiConfig, null, messages);
  const response = await fetchLlmPayload(payload, { signal });
  if (!response.ok) {
    throw new Error(`AI 接口请求失败：HTTP ${response.status}`);
  }
  const data = await response.json();
  const parsed = parseProviderResponse(providerKindForConfig(apiConfig), data);
  const content = parsed.content?.trim();
  if (!content) throw new Error("AI 未返回有效内容");
  return content;
}

/** 单次 LLM 调用（书城推荐卡等轻量用途）。 */
export async function generateNovelText(prompt: string, signal?: AbortSignal): Promise<string> {
  const apiConfig = resolveNovelApiConfig();
  return callLlm(apiConfig, [
    { role: "system", content: "你是小说编辑，按要求输出，不要多余说明，使用中文。" },
    { role: "user", content: prompt },
  ], signal);
}

export type ChapterGenerationCallbacks = {
  onChapterUpdate: (chapter: NovelChapter) => void;
};

/** 生成一章：LLM 正文 → 解析插图标签 → 逐张生图（失败不阻塞）。返回落库后的章节。 */
export async function generateNovelChapter(
  book: NovelBook,
  chapterIndex: number,
  callbacks: ChapterGenerationCallbacks,
  signal?: AbortSignal,
): Promise<NovelChapter> {
  const existing = loadNovelChapters().find((c) => c.bookId === book.id && c.index === chapterIndex);
  const chapter: NovelChapter = {
    id: existing?.id || `nc_${book.id}_${chapterIndex}`,
    bookId: book.id,
    index: chapterIndex,
    title: `第${chapterIndex + 1}章`,
    rawContent: existing?.rawContent || "",
    status: "generating",
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  upsertChapter(chapter, callbacks);

  try {
    const apiConfig = resolveNovelApiConfig();
    const messages = buildChapterMessages(book, buildContextBlock(book, chapterIndex), chapterIndex);
    const raw = await callLlm(apiConfig, messages, signal);
    chapter.rawContent = raw;
    const titleMatch = raw.match(/^第\s*\d+\s*章\s*(.+)$/m);
    if (titleMatch) chapter.title = titleMatch[0].trim();
    upsertChapter(chapter, callbacks);

    // 解析插图标签，逐张生成（上限 2 张）
    const tags = [...raw.matchAll(/\[插图[:：]\s*([^\]]+)\]/g)].map((m) => m[1].trim()).slice(0, 2);
    for (const desc of tags) {
      if (signal?.aborted) break;
      try {
        const result = await generateImageFromConfiguredApi({
          description: book.illustrationStyle ? `${book.illustrationStyle}, ${desc}` : desc,
          appId: "novel",
          signal,
        });
        if (result) {
          chapter.rawContent = chapter.rawContent.replace(
            `[插图:${desc}]`,
            `[插图:${desc}]`,
          );
          chapter.rawContent = chapter.rawContent.replace(
            new RegExp(`\\[插图[:：]\\s*${desc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`),
            `[插图:${desc}|${result.mediaRef}]`,
          );
          upsertChapter(chapter, callbacks);
        }
      } catch {
        // 单张插图失败不阻塞正文
      }
    }
    chapter.status = "done";
    upsertChapter(chapter, callbacks);
    return chapter;
  } catch (error) {
    chapter.status = chapter.rawContent ? "partial" : "failed";
    chapter.error = error instanceof Error ? error.message : String(error);
    upsertChapter(chapter, callbacks);
    return chapter;
  }
}

function upsertChapter(chapter: NovelChapter, callbacks?: ChapterGenerationCallbacks): void {
  const chapters = loadNovelChapters();
  const idx = chapters.findIndex((c) => c.id === chapter.id);
  if (idx >= 0) chapters[idx] = { ...chapter };
  else chapters.push({ ...chapter });
  saveNovelChapters(chapters);
  callbacks?.onChapterUpdate({ ...chapter });
}

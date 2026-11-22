// 图文小说应用：类型定义与本地持久化（IndexedDB KV）
import { kvGet, kvSet } from "@/lib/kv-db";

export type NovelCharacterSetting = {
  id: string;
  name: string;
  description: string;
  /** 关联角色库角色 id（可选） */
  characterId?: string;
};

export type NovelBook = {
  id: string;
  title: string;
  genre: string;
  intro: string;
  style: string;
  chapterLength: number;
  characters: NovelCharacterSetting[];
  /** 插图英文风格前缀 */
  illustrationStyle: string;
  coverImagePrompt: string;
  coverImageRef?: string;
  createdAt: string;
  updatedAt: string;
};

export type NovelChapter = {
  id: string;
  bookId: string;
  index: number;
  title: string;
  /** 原始文本，含 [插图:...] 标签 */
  rawContent: string;
  status: "generating" | "done" | "failed" | "partial";
  error?: string;
  createdAt: string;
};

const BOOKS_KEY = "ai_phone_novel_books_v1";
const CHAPTERS_KEY = "ai_phone_novel_chapters_v1";
const PROGRESS_KEY = "ai_phone_novel_progress_v1";

export type NovelProgress = Record<string, { chapterIndex: number; updatedAt: string }>;

export function loadNovelBooks(): NovelBook[] {
  try {
    const raw = kvGet(BOOKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNovelBooks(books: NovelBook[]): void {
  kvSet(BOOKS_KEY, JSON.stringify(books));
}

export function loadNovelChapters(): NovelChapter[] {
  try {
    const raw = kvGet(CHAPTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNovelChapters(chapters: NovelChapter[]): void {
  kvSet(CHAPTERS_KEY, JSON.stringify(chapters));
}

export function loadNovelProgress(): NovelProgress {
  try {
    const raw = kvGet(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNovelProgress(progress: NovelProgress): void {
  kvSet(PROGRESS_KEY, JSON.stringify(progress));
}

export function createId(prefix = "nb"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const NOVEL_GENRES = [
  "都市", "玄幻", "仙侠", "科幻", "悬疑", "言情", "历史", "末世", "游戏",
] as const;

export const NOVEL_STYLES = [
  "轻松幽默", "热血爽文", "细腻言情", "悬疑烧脑", "古风雅致", "硬核科幻", "治愈日常",
] as const;

export const NOVEL_CHAPTER_LENGTHS = [500, 1000, 1500, 2000, 3000] as const;

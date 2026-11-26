// lib/worldbook-import-parser.ts
// 世界书 TXT / HTML 文件导入解析：把整篇文档按标题/段落切分为世界书条目。
import { createWorldBook } from "@/lib/settings-storage";
import type { WorldBookConfig, WorldBookEntry } from "@/lib/settings-types";

const MAX_ENTRIES = 300;

function localId(): string {
    return `wb-entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeEntry(comment: string, content: string, key: string, order: number): WorldBookEntry {
    return {
        uid: localId(),
        key,
        content,
        comment,
        use_regex: false,
        disable: false,
        constant: false,
        position: "before_char",
        depth: 0,
        probability: 100,
        useProbability: false,
        role: 0,
        insertion_order: 50 + order,
    };
}

function stripExt(fileName: string): string {
    return fileName.replace(/\.(txt|html?|md)$/i, "").trim() || "导入的世界书";
}

// 强特征标题行：第X章/回/卷/节/幕、Chapter X、【XXX】、## 标题、一、二、等序号标题
const TITLE_RE = /^\s*(?:(?:第\s*[0-9〇零一二三四五六七八九十百千]+\s*[章回卷节幕篇]|Chapter\s+\d+|序章|楔子|尾声|终章)\s*[::：.、]?\s*\S.*)|(?:#{1,4}\s+\S.*)|(?:【[^】]{1,40}】)$|(?:[一二三四五六七八九十]{1,3}[、.．]\s*\S{1,40})\s*$/;

function isTitleLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 60) return false;
    return TITLE_RE.test(trimmed);
}

function squeezeBlank(text: string): string {
    return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** TXT 解析：优先按标题行切条目；无标题时按空行段落聚组。 */
export function parseWorldBookFromTxt(text: string, fileName: string): WorldBookConfig | null {
    const raw = squeezeBlank(text);
    if (!raw) return null;
    const lines = raw.split("\n");
    const blocks: { comment: string; content: string }[] = [];

    let currentTitle = "";
    let currentLines: string[] = [];
    const flush = () => {
        const content = squeezeBlank(currentLines.join("\n"));
        if (content) blocks.push({ comment: currentTitle || `片段 ${blocks.length + 1}`, content });
        currentTitle = "";
        currentLines = [];
    };
    for (const line of lines) {
        if (isTitleLine(line)) {
            flush();
            currentTitle = line.trim().replace(/^#{1,4}\s+/, "");
        } else {
            currentLines.push(line);
        }
    }
    flush();

    // 无标题结构：按空行段落聚组
    if (blocks.length === 0 || (blocks.length === 1 && blocks[0].comment === "片段 1")) {
        const paras = raw.split(/\n\s*\n/).filter((p) => p.trim());
        if (paras.length > 1) {
            blocks.length = 0;
            paras.forEach((p, i) => {
                const firstLine = p.trim().split("\n")[0] || "";
                blocks.push({ comment: firstLine.slice(0, 12) || `片段 ${i + 1}`, content: p.trim() });
            });
        }
    }

    if (blocks.length === 0) return null;
    const wb = createWorldBook(stripExt(fileName));
    wb.entries = blocks.slice(0, MAX_ENTRIES).map((b, i) => makeEntry(b.comment, b.content, b.comment, i));
    return wb;
}

/** HTML 解析：以 h1-h3 标题切条目；无标题时按段落聚组；剥除脚本样式与标签。 */
export function parseWorldBookFromHtml(text: string, fileName: string): WorldBookConfig | null {
    if (typeof window === "undefined" || typeof DOMParser === "undefined") return null;
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,noscript,svg").forEach((el) => el.remove());
    const bookName = doc.querySelector("title")?.textContent?.trim() || stripExt(fileName);

    const blocks: { comment: string; content: string }[] = [];
    const headings = Array.from(doc.querySelectorAll("h1, h2, h3"));
    if (headings.length > 0) {
        headings.forEach((h, idx) => {
            const title = (h.textContent || "").trim();
            // 收集当前标题到下一个标题之间的兄弟内容
            const parts: string[] = [];
            let node: Element | null = h.nextElementSibling;
            const stop = idx + 1 < headings.length ? headings[idx + 1] : null;
            while (node && node !== stop) {
                const t = (node.textContent || "").trim();
                if (t) parts.push(t);
                node = node.nextElementSibling;
            }
            const content = squeezeBlank(parts.join("\n\n"));
            if (content) blocks.push({ comment: title || `片段 ${blocks.length + 1}`, content });
        });
    } else {
        const paras = Array.from(doc.querySelectorAll("p, li, div"))
            .map((el) => (el.textContent || "").trim())
            .filter((t) => t && !t.includes((doc.body.textContent || "").slice(0, 20).trim()));
        // 去重父级嵌套文本：只保留最细粒度（p 优先）
        const fine = Array.from(doc.querySelectorAll("p"))
            .map((el) => (el.textContent || "").trim())
            .filter(Boolean);
        const source = fine.length > 0 ? fine : paras;
        // 按每 3 段聚为一个条目
        for (let i = 0; i < source.length; i += 3) {
            const group = source.slice(i, i + 3).join("\n\n");
            const firstLine = source[i]?.split("\n")[0] || "";
            blocks.push({ comment: firstLine.slice(0, 12) || `片段 ${blocks.length + 1}`, content: group });
        }
    }

    if (blocks.length === 0) {
        const bodyText = squeezeBlank(doc.body?.textContent || "");
        if (!bodyText) return null;
        blocks.push({ comment: bookName, content: bodyText });
    }

    const wb = createWorldBook(bookName);
    wb.entries = blocks.slice(0, MAX_ENTRIES).map((b, i) => makeEntry(b.comment, b.content, b.comment, i));
    return wb;
}

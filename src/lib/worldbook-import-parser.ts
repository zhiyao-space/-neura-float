// lib/worldbook-import-parser.ts
// 世界书 TXT / HTML / Word 文档导入解析：整篇文档完整存为一个条目，不做拆分。
import { createWorldBook } from "@/lib/settings-storage";
import type { WorldBookConfig, WorldBookEntry } from "@/lib/settings-types";

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
    return fileName.replace(/\.(txt|html?|md|docx?)$/i, "").trim() || "导入的世界书";
}

function squeezeBlank(text: string): string {
    return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** 把整篇文本作为一个完整条目放进世界书。 */
function buildSingleEntryBook(bookName: string, content: string): WorldBookConfig | null {
    const raw = squeezeBlank(content);
    if (!raw) return null;
    const wb = createWorldBook(bookName);
    wb.entries = [makeEntry(bookName, raw, bookName, 0)];
    return wb;
}

/** TXT 解析：整篇文档完整存为一个条目。 */
export function parseWorldBookFromTxt(text: string, fileName: string): WorldBookConfig | null {
    return buildSingleEntryBook(stripExt(fileName), text);
}

/** HTML 解析：剥除脚本样式后取正文全文，完整存为一个条目。 */
export function parseWorldBookFromHtml(text: string, fileName: string): WorldBookConfig | null {
    if (typeof window === "undefined" || typeof DOMParser === "undefined") return null;
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,noscript,svg").forEach((el) => el.remove());
    const bookName = doc.querySelector("title")?.textContent?.trim() || stripExt(fileName);
    const bodyText = squeezeBlank(doc.body?.textContent || "");
    return buildSingleEntryBook(bookName, bodyText);
}

/** Word 文档（.docx）解析：用 mammoth 抽取全文，完整存为一个条目。 */
export async function parseWorldBookFromDocx(buffer: ArrayBuffer, fileName: string): Promise<WorldBookConfig | null> {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const html = result?.value || "";
    if (!html.trim()) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const bodyText = squeezeBlank(doc.body?.textContent || "");
    return buildSingleEntryBook(stripExt(fileName), bodyText);
}

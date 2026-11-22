// 图文小说：阅读器（图文混排、进度保存、字号/主题切换）
import { useEffect, useMemo, useState } from "react";
import { getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import {
  loadNovelProgress,
  saveNovelProgress,
  type NovelBook,
  type NovelChapter,
} from "@/lib/novel-storage";

export function NovelReader({
  book,
  chapters,
  onClose,
  onPrev,
  onNext,
  nextLoading,
  generating,
}: {
  book: NovelBook;
  chapters: NovelChapter[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  nextLoading: boolean;
  generating: boolean;
}) {
  const [chapterIndex, setChapterIndex] = useState(() => {
    const progress = loadNovelProgress();
    return progress[book.id]?.chapterIndex ?? 0;
  });
  const [theme, setTheme] = useState<"day" | "sepia" | "dark">("day");
  const [fontSize, setFontSize] = useState(15);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const chapter = useMemo(
    () => chapters.find((c) => c.index === chapterIndex) || null,
    [chapters, chapterIndex],
  );

  useEffect(() => {
    const progress = loadNovelProgress();
    progress[book.id] = { chapterIndex, updatedAt: new Date().toISOString() };
    saveNovelProgress(progress);
  }, [book.id, chapterIndex]);

  // 解析正文段落与插图标签，插图 mediaRef 转 dataUrl
  const blocks = useMemo(() => {
    if (!chapter) return [];
    const out: ({ type: "text"; content: string } | { type: "image"; mediaRef: string; desc: string })[] = [];
    const raw = chapter.rawContent
      .replace(/^第\s*\d+\s*章.*$/m, "")
      .trim();
    const pattern = /\[插图[:：]\s*([^|\]]+)(?:\|([^\]]+))?\]/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const before = raw.slice(last, match.index).trim();
      if (before) out.push({ type: "text", content: before });
      out.push({ type: "image", mediaRef: match[2] || "", desc: match[1].trim() });
      last = match.index + match[0].length;
    }
    const rest = raw.slice(last).trim();
    if (rest) out.push({ type: "text", content: rest });
    return out;
  }, [chapter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const block of blocks) {
        if (block.type === "image" && block.mediaRef && !imageUrls[block.mediaRef]) {
          const url = await getChatImageFromIndexedDB(block.mediaRef).catch(() => null);
          if (url) next[block.mediaRef] = url;
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setImageUrls((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => { cancelled = true; };
  }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`novel-reader ${theme === "dark" ? "dark" : ""} ${theme === "sepia" ? "sepia" : ""}`}>
      <div className="novel-header">
        <button className="novel-header-back" onClick={onClose} aria-label="返回书架">‹</button>
        <div className="novel-header-title" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {book.title} · {chapter?.title || `第${chapterIndex + 1}章`}
        </div>
        <button className="novel-header-back" onClick={() => setFontSize((s) => (s >= 19 ? 13 : s + 1))} aria-label="字号">Aa</button>
        <button className="novel-header-back" onClick={() => setTheme(theme === "day" ? "sepia" : theme === "sepia" ? "dark" : "day")} aria-label="主题">
          {theme === "dark" ? "🌙" : theme === "sepia" ? "🍂" : "☀️"}
        </button>
      </div>
      <div className="novel-reader-body" style={{ ["--novel-font-size" as string]: `${fontSize}px` }}>
        {generating && !chapter ? (
          <div className="novel-empty">正在生成本章内容…</div>
        ) : !chapter ? (
          <div className="novel-empty">本章尚未生成</div>
        ) : (
          <>
            <h2>{chapter.title}</h2>
            {blocks.map((block, i) =>
              block.type === "text" ? (
                block.content.split(/\n+/).filter(Boolean).map((para, j) => (
                  <p key={`${i}-${j}`}>{para}</p>
                ))
              ) : block.mediaRef && imageUrls[block.mediaRef] ? (
                <div className="novel-illust" key={i}>
                  <img src={imageUrls[block.mediaRef]} alt={block.desc} />
                </div>
              ) : (
                <div className="novel-illust novel-illust-placeholder" key={i}>
                  {block.mediaRef ? "插图加载中…" : "插图未生成（未配置生图或生成失败）"}
                </div>
              ),
            )}
            {chapter.status === "generating" && <div className="novel-empty">章节仍在生成中…</div>}
          </>
        )}
      </div>
      <div className="novel-reader-footer">
        <button className="novel-btn secondary" onClick={onPrev} disabled={chapterIndex <= 0}>上一章</button>
        <button className="novel-btn" onClick={onNext} disabled={nextLoading}>
          {generating ? "生成中…" : "下一章"}
        </button>
      </div>
    </div>
  );
}

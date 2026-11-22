// 图文小说应用主壳：书城 / 书架 / 我的（模拟登录身份）
import { useCallback, useMemo, useRef, useState } from "react";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { generateNovelChapter, generateNovelText, resolveNovelApiConfig } from "@/lib/novel-engine";
import {
  loadNovelBooks,
  loadNovelChapters,
  saveNovelBooks,
  NOVEL_GENRES,
  type NovelBook,
  type NovelChapter,
} from "@/lib/novel-storage";
import { NovelReader } from "./novel-reader";
import { NovelCreate } from "./novel-create";

type View = "store" | "shelf" | "mine" | "create" | "reader";

type StoreIdea = { title: string; intro: string; genre: string };

const STORE_FALLBACK: StoreIdea[] = [
  { title: "都市重启计划", intro: "一觉醒来回到高三，这一次他要改写所有人的命运。", genre: "都市" },
  { title: "星海拾遗人", intro: "在废弃星域打捞残骸的少年，捡到了一段会说话的记忆。", genre: "科幻" },
  { title: "巷子深处的面馆", intro: "深夜营业的小面馆，每碗面都对应一个客人的心事。", genre: "治愈" },
  { title: "雾都疑云", intro: "连绵大雾笼罩的城市里，第七起失踪案出现了转机。", genre: "悬疑" },
];

export function NovelApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (msg: string) => void }) {
  const [view, setView] = useState<View>("store");
  const [books, setBooks] = useState<NovelBook[]>(() => loadNovelBooks());
  const [chapters, setChapters] = useState<NovelChapter[]>(() => loadNovelChapters());
  const [editingBook, setEditingBook] = useState<NovelBook | null>(null);
  const [readingBook, setReadingBook] = useState<NovelBook | null>(null);
  const [generatingBookId, setGeneratingBookId] = useState<string | null>(null);
  const [storeIdeas, setStoreIdeas] = useState<StoreIdea[]>(STORE_FALLBACK);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [toast, setToast] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const identity = useMemo(() => resolveUserIdentity(undefined, "novel"), []);
  const chaptersVersion = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const refreshChapters = useCallback(() => {
    setChapters(loadNovelChapters());
  }, []);

  const persistBooks = (next: NovelBook[]) => {
    setBooks(next);
    saveNovelBooks(next);
  };

  const hasApi = (() => {
    try {
      resolveNovelApiConfig();
      return true;
    } catch {
      return false;
    }
  })();

  const startGeneration = async (book: NovelBook, chapterIndex: number) => {
    setGeneratingBookId(book.id);
    setReadingBook(book);
    setView("reader");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await generateNovelChapter(
        book,
        chapterIndex,
        { onChapterUpdate: () => refreshChapters() },
        controller.signal,
      );
      refreshChapters();
    } finally {
      setGeneratingBookId(null);
      abortRef.current = null;
    }
  };

  const handleCreateBook = (book: NovelBook) => {
    persistBooks([book, ...books.filter((b) => b.id !== book.id)]);
    setEditingBook(null);
    void startGeneration(book, 0);
  };

  const refreshStoreIdeas = async () => {
    if (!hasApi) {
      showToast("尚未配置 AI 接口，请先到设置中配置");
      return;
    }
    setIdeaLoading(true);
    try {
      const raw = await generateNovelText(
        `请推荐 4 个原创小说点子，题材从 ${NOVEL_GENRES.join("/")} 中选择。输出 4 行，每行格式：书名|一句话简介|题材。不要输出其他内容。`,
      );
      const ideas = raw.split("\n").map((line) => {
        const [title, intro, genre] = line.replace(/^[-\d.、\s]+/, "").split("|");
        return { title: (title || "").trim(), intro: (intro || "").trim(), genre: (genre || "都市").trim() };
      }).filter((i) => i.title && i.intro);
      if (ideas.length > 0) setStoreIdeas(ideas.slice(0, 4));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "推荐生成失败");
    } finally {
      setIdeaLoading(false);
    }
  };

  const bookChapters = (bookId: string) =>
    chapters.filter((c) => c.bookId === bookId).sort((a, b) => a.index - b.index);

  if (view === "reader" && readingBook) {
    const list = bookChapters(readingBook.id);
    const current = list.length > 0 ? list[list.length - 1].index + 1 : 0;
    return (
      <div className="novel-app">
        <NovelReader
          book={readingBook}
          chapters={list}
          onClose={() => { abortRef.current?.abort(); setView("shelf"); }}
          onPrev={() => {
            const readerEl = document.querySelector(".novel-reader-body");
            const prevIndex = Math.max(0, current - 2);
            void startGeneration(readingBook, prevIndex).then(() => {
              if (readerEl) readerEl.scrollTop = 0;
            });
          }}
          onNext={() => {
            if (!hasApi) { showToast("尚未配置 AI 接口，请先到设置中配置"); return; }
            if (generatingBookId) return;
            void startGeneration(readingBook, current);
          }}
          nextLoading={generatingBookId === readingBook.id}
          generating={generatingBookId === readingBook.id}
        />
      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="novel-app">
        <NovelCreate
          initial={editingBook}
          onSave={handleCreateBook}
          onCancel={() => { setEditingBook(null); setView("store"); }}
        />
      </div>
    );
  }

  return (
    <div className="novel-app">
      <div className="novel-header">
        <div className="novel-header-title" style={{ flex: 1 }}>图文小说</div>
        <span style={{ fontSize: 11, color: "oklch(0.5 0.02 40)" }}>
          {identity ? `读者：${identity.name}` : "游客"}
        </span>
        <button className="novel-header-back" onClick={onClose} aria-label="退出">✕</button>
      </div>
      <div className="novel-body">
        {view === "store" && (
          <>
            <div className="novel-hero">
              <h2>每个灵感，都值得一本书</h2>
              <p>AI 为你创作正文与插图，图文双线连载</p>
              <button
                className="novel-btn"
                style={{ marginTop: 12 }}
                onClick={() => { setEditingBook(null); setView("create"); }}
              >
                ✎ 新建作品
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="novel-section-title" style={{ margin: 0 }}>书城推荐</div>
              <button className="novel-btn secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => void refreshStoreIdeas()} disabled={ideaLoading}>
                {ideaLoading ? "灵感生成中…" : "换一批"}
              </button>
            </div>
            <div className="novel-store-grid" style={{ marginTop: 10 }}>
              {storeIdeas.map((idea) => (
                <div
                  key={idea.title}
                  className="novel-store-card"
                  onClick={() => {
                    if (!hasApi) { showToast("尚未配置 AI 接口，请先到设置中配置"); return; }
                    setEditingBook(null);
                    setView("create");
                    onNotice?.(`已选择《${idea.title}》灵感，请在设定中完善后保存`);
                    showToast(`灵感《${idea.title}》已备好，去完善设定吧`);
                  }}
                >
                  <h3>{idea.title}</h3>
                  <p>{idea.intro}</p>
                  <span className="novel-tag">{idea.genre}</span>
                </div>
              ))}
            </div>
            {!hasApi && <div className="novel-error" style={{ marginTop: 12 }}>尚未配置 AI 接口：请到 设置 → 接口配置/绑定管理 完成后再创作。</div>}
          </>
        )}
        {view === "shelf" && (
          <>
            <div className="novel-section-title">我的书架（{books.length}）</div>
            {books.length === 0 ? (
              <div className="novel-empty">书架还是空的，去书城挑一个灵感开始创作吧</div>
            ) : (
              <div className="novel-shelf-list">
                {books.map((book) => {
                  const list = bookChapters(book.id);
                  const doneCount = list.filter((c) => c.status === "done" || c.status === "partial").length;
                  return (
                    <div key={book.id} className="novel-shelf-item" onClick={() => void startGeneration(book, doneCount)}>
                      <div className="novel-cover">{book.title.slice(0, 4)}</div>
                      <div className="novel-shelf-info">
                        <h3>{book.title}</h3>
                        <p>{book.genre} · {book.style} · {book.chapterLength}字/章</p>
                        <div className="novel-shelf-meta">
                          <span>已生成 {doneCount} 章</span>
                          {generatingBookId === book.id && <span style={{ color: "var(--novel-accent)" }}>生成中…</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
                        <button
                          className="novel-btn secondary"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); setEditingBook(book); setView("create"); }}
                        >
                          设定
                        </button>
                        <button
                          className="novel-char-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`删除《${book.title}》及其全部章节？`)) {
                              persistBooks(books.filter((b) => b.id !== book.id));
                            }
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {view === "mine" && (
          <>
            <div className="novel-section-title">读者身份</div>
            <div className="novel-shelf-item" style={{ cursor: "default" }}>
              <div className="novel-cover" style={{ borderRadius: "50%", width: 52, height: 52, fontSize: 16 }}>
                {identity?.name?.slice(0, 1) || "客"}
              </div>
              <div className="novel-shelf-info">
                <h3>{identity?.name || "游客"}</h3>
                <p>{identity?.bio || "本项目内置身份，随设置同步，无需注册登录"}</p>
              </div>
            </div>
            <div className="novel-section-title">数据概览</div>
            <div className="novel-store-grid">
              <div className="novel-store-card" style={{ cursor: "default" }}>
                <h3>{books.length}</h3>
                <p>在架作品</p>
              </div>
              <div className="novel-store-card" style={{ cursor: "default" }}>
                <h3>{chapters.filter((c) => c.status === "done" || c.status === "partial").length}</h3>
                <p>累计章节</p>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="novel-tabbar">
        <button className={view === "store" ? "active" : ""} onClick={() => setView("store")}>🏪<span>书城</span></button>
        <button className={view === "shelf" ? "active" : ""} onClick={() => setView("shelf")}>📚<span>书架</span></button>
        <button className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>👤<span>我的</span></button>
      </div>
      {toast && <div className="novel-toast">{toast}</div>}
    </div>
  );
}

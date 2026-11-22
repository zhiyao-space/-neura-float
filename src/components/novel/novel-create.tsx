// 图文小说：新建/编辑作品设定（文风、字数、出场人物、插图风格）
import { useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import {
  NOVEL_CHAPTER_LENGTHS,
  NOVEL_GENRES,
  NOVEL_STYLES,
  createId,
  type NovelBook,
  type NovelCharacterSetting,
} from "@/lib/novel-storage";

export function NovelCreate({
  initial,
  onSave,
  onCancel,
}: {
  initial?: NovelBook | null;
  onSave: (book: NovelBook) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [genre, setGenre] = useState(initial?.genre || NOVEL_GENRES[0]);
  const [intro, setIntro] = useState(initial?.intro || "");
  const [style, setStyle] = useState(initial?.style || NOVEL_STYLES[0]);
  const [chapterLength, setChapterLength] = useState(initial?.chapterLength || 1000);
  const [characters, setCharacters] = useState<NovelCharacterSetting[]>(initial?.characters || []);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [illustrationStyle, setIllustrationStyle] = useState(
    initial?.illustrationStyle || "anime illustration, soft lighting, detailed",
  );
  const libraryCharacters = loadCharacters();

  const addCharacter = (name: string, description: string, characterId?: string) => {
    if (!name.trim()) return;
    setCharacters((prev) => [
      ...prev.filter((c) => c.name !== name.trim()),
      { id: createId("npc"), name: name.trim(), description: description.trim(), characterId },
    ]);
    setNewName("");
    setNewDesc("");
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    onSave({
      id: initial?.id || createId(),
      title: title.trim(),
      genre,
      intro: intro.trim(),
      style,
      chapterLength,
      characters,
      illustrationStyle: illustrationStyle.trim(),
      coverImagePrompt: initial?.coverImagePrompt || "",
      coverImageRef: initial?.coverImageRef,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    });
  };

  return (
    <>
      <div className="novel-header">
        <button className="novel-header-back" onClick={onCancel} aria-label="返回">‹</button>
        <div className="novel-header-title" style={{ flex: 1 }}>{initial ? "编辑作品" : "新建作品"}</div>
        <button className="novel-btn" onClick={handleSave} disabled={!title.trim()}>保存</button>
      </div>
      <div className="novel-body">
        <div className="novel-form">
          <label>
            书名
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给作品起个名字" />
          </label>
          <label>
            题材
            <div className="novel-chips">
              {NOVEL_GENRES.map((g) => (
                <button key={g} className={g === genre ? "active" : ""} onClick={() => setGenre(g)}>{g}</button>
              ))}
            </div>
          </label>
          <label>
            文风
            <div className="novel-chips">
              {NOVEL_STYLES.map((s) => (
                <button key={s} className={s === style ? "active" : ""} onClick={() => setStyle(s)}>{s}</button>
              ))}
            </div>
          </label>
          <label>
            每章字数
            <div className="novel-chips">
              {NOVEL_CHAPTER_LENGTHS.map((n) => (
                <button key={n} className={n === chapterLength ? "active" : ""} onClick={() => setChapterLength(n)}>{n}字</button>
              ))}
            </div>
          </label>
          <label>
            作品简介
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="一句话或一段话介绍这个世界" />
          </label>
          <label>
            插图风格（英文，传给生图模型）
            <input value={illustrationStyle} onChange={(e) => setIllustrationStyle(e.target.value)} />
          </label>
          <label>
            出场人物设定（{characters.length} 位）
            <div className="novel-form">
              {characters.map((c) => (
                <div className="novel-char-row" key={c.id}>
                  <b>{c.name}</b>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</span>
                  <button className="novel-char-del" onClick={() => setCharacters((prev) => prev.filter((x) => x.id !== c.id))}>删除</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="姓名" style={{ flex: "0 0 90px" }} />
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="人物设定简介" />
                <button className="novel-btn secondary" onClick={() => addCharacter(newName, newDesc)}>添加</button>
              </div>
            </div>
          </label>
          {libraryCharacters.length > 0 && (
            <label>
              从角色库导入
              <div className="novel-chips">
                {libraryCharacters.slice(0, 12).map((c) => (
                  <button
                    key={c.id}
                    className={characters.some((x) => x.characterId === c.id) ? "active" : ""}
                    onClick={() => addCharacter(c.name, c.briefPersona || c.persona.slice(0, 120), c.id)}
                  >
                    + {c.name}
                  </button>
                ))}
              </div>
            </label>
          )}
        </div>
      </div>
    </>
  );
}

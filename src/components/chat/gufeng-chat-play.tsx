// components/chat/gufeng-chat-play.tsx —— 聊天内嵌「雅玩」弹层 + 结果卡片气泡
// 顶部可切 古风/现代 两种模式；古风=飞花传令/月老签/投我木桃/对联求对/称谓雅鉴，现代=真心话大冒险/心情盲盒
import { useState } from "react";
import type { ChatMessage } from "@/lib/chat-storage";
import { loadApiConfigs } from "@/lib/settings-storage";
import { simpleLLMCall } from "@/lib/api-helpers";
import type { Character } from "@/lib/character-types";
import {
    CHAT_FEIHUA_SYSTEM_PROMPT,
    COUPLET_SYSTEM_PROMPT,
    ELEGANT_SYSTEM_PROMPT,
    GUFENG_GIFTS,
    GUFENG_SIGNS,
    GUFENG_TOKEN_CHARS,
    GUFENG_TOOLS,
    buildGufengPersona,
} from "@/lib/gufeng-data";
import "@/gufeng-chat.css";

type PlayKind = "verse" | "sign" | "gift" | "tool" | "couplet" | "elegant" | "truth_dare" | "mood_box";

const ICONS: Record<string, string> = {
    feihua: "M12,2C12.89,2 13.66,2.5 14.06,3.23C14.5,3.03 15,2.92 15.5,2.92C17.71,2.92 19.5,4.71 19.5,6.92C19.5,7.42 19.4,7.89 19.22,8.32C20.35,8.81 21.15,9.92 21.15,11.23C21.15,12.54 20.35,13.65 19.22,14.14C19.4,14.57 19.5,15.04 19.5,15.54C19.5,17.75 17.71,19.54 15.5,19.54C15,19.54 14.53,19.45 14.1,19.27C13.61,20.35 12.52,21.15 11.23,21.15C9.94,21.15 8.85,20.35 8.36,19.27C7.93,19.45 7.46,19.54 6.96,19.54C4.75,19.54 2.96,17.75 2.96,15.54C2.96,15.04 3.06,14.57 3.24,14.14C2.11,13.65 1.31,12.54 1.31,11.23C1.31,9.92 2.11,8.81 3.24,8.32C3.06,7.89 2.96,7.42 2.96,6.92C2.96,4.71 4.75,2.92 6.96,2.92C7.46,2.92 7.93,3.01 8.36,3.19C8.85,2.11 9.94,1.31 11.23,1.31L12,2Z",
    sign: "M12,2A3,3 0 0,1 15,5V7A3,3 0 0,1 12,10A3,3 0 0,1 9,7V5A3,3 0 0,1 12,2M7,10H17L19,22H5L7,10Z",
    gift: "M21,1.38v19.24L2,11.98L21,1.38M21,0L2,10.62v2.76L21,24V0Z",
    couplet: "M20.44,3.56C19.19,2.31 16.56,3.06 14.44,5.19L5.19,14.44C3.06,16.56 2.31,19.19 3.56,20.44C4.81,21.69 7.44,20.94 9.56,18.81L18.81,9.56C20.94,7.44 21.69,4.81 20.44,3.56Z",
    elegant: "M20.44,3.56C19.19,2.31 16.56,3.06 14.44,5.19L5.19,14.44C3.06,16.56 2.31,19.19 3.56,20.44C4.81,21.69 7.44,20.94 9.56,18.81L18.81,9.56C20.94,7.44 21.69,4.81 20.44,3.56Z",
    truth: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z",
    mood: "M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z",
    tools: "M6,2H18A2,2 0 0,1 20,4V16A2,2 0 0,1 18,18H6A2,2 0 0,1 4,16V4A2,2 0 0,1 6,2M7,6V8H17V6H7M7,10V12H17V10H7M7,14V16H14V14H7M6,20H18V22H6V20Z",
};

function GfpIcon({ path, size = 22 }: { path: string; size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
            <path d={path} />
        </svg>
    );
}

function personaOf(character: Character | null): string {
    if (!character) return "";
    return buildGufengPersona(character.name, (character as Record<string, unknown>).persona as string || (character as Record<string, unknown>).description as string || "", character.tags || []);
}

export function GuFengPlayPanel({ character, onClose, onSend }: {
    character: Character | null;
    onClose: () => void;
    onSend: (kind: PlayKind, data: Record<string, unknown>, content: string) => void;
}) {
    const isAncient = !!character?.tags?.some((t) => t.includes("古风") || t.includes("古代") || t.includes("武侠"));
    const [mode, setMode] = useState<"gufeng" | "modern">(isAncient ? "gufeng" : "modern");
    const [view, setView] = useState<"menu" | "feihua" | "gift" | "tools" | "couplet" | "elegant" | "truth_dare">("menu");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const persona = personaOf(character);
    const hasApi = !!loadApiConfigs()[0];

    async function askLLM(system: string, userText: string): Promise<string> {
        const res = await simpleLLMCall(loadApiConfigs()[0], [
            { role: "system", content: system },
            { role: "user", content: userText },
        ], { temperature: 0.9, label: "gufeng-chat" });
        if (res.error || !res.content) throw new Error(res.error || "一时语塞，请再试一次。");
        return res.content.trim();
    }

    // ── 古风玩法动作 ──
    async function playFeihua(tokenChar: string) {
        setBusy(true); setErr(null);
        try {
            const verse = await askLLM(CHAT_FEIHUA_SYSTEM_PROMPT(tokenChar, persona), "请接令。");
            onSend("verse", { tokenChar, verse }, `[飞花令·${tokenChar}] ${verse}`);
            onClose();
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    }

    function playSign() {
        const sign = GUFENG_SIGNS[Math.floor(Math.random() * GUFENG_SIGNS.length)];
        onSend("sign", { level: sign.level, poem: sign.poem, note: sign.note }, `[月老签·${sign.level}]`);
        onClose();
    }

    function playGift(giftIndex: number) {
        const gift = GUFENG_GIFTS[giftIndex];
        onSend("gift", { giftName: gift.name, giftIcon: gift.icon, giftMessage: gift.message }, gift.message);
        onClose();
    }

    function playTool(toolIndex: number) {
        const tool = GUFENG_TOOLS[toolIndex];
        onSend("tool", { toolName: tool.name, toolIcon: tool.icon, inscription: tool.inscription }, `[器物阁·${tool.name}] ${tool.inscription}`);
        onClose();
    }

    const [upper, setUpper] = useState<string | null>(null);
    const [lowerInput, setLowerInput] = useState("");

    async function playCoupletStart() {
        setBusy(true); setErr(null);
        try {
            const u = await askLLM(COUPLET_SYSTEM_PROMPT(persona), "请出一句上联。");
            setUpper(u);
            setView("couplet");
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    }

    function playCoupletSend() {
        const lower = lowerInput.trim();
        if (!upper || !lower) return;
        onSend("couplet", { upper, lower }, `[对联] 上联「${upper}」下联「${lower}」`);
        onClose();
    }

    const [elegantInput, setElegantInput] = useState("");

    async function playElegant() {
        const text = elegantInput.trim();
        if (!text) return;
        setBusy(true); setErr(null);
        try {
            const elegant = await askLLM(ELEGANT_SYSTEM_PROMPT(persona), text);
            onSend("elegant", { elegant, origin: text }, `[雅言] ${elegant}`);
            onClose();
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    }

    // ── 现代玩法动作 ──
    const MODERN_DARES = ["讲一件最近让你心跳加速的小事", "用唱歌的方式念出这句话", "说出你手机里最舍不得删的一张照片背后的事", "模仿对方的语气再说一遍上一句话", "坦白最近一次偷懒都在干什么"];
    const MODERN_MOODS = [
        { tag: "元气满格", text: "今天也是电量百分百的你，去把好运一点点捡回来。" },
        { tag: "需要被哄", text: "检测到一点点低电量，建议立即接收一个拥抱。" },
        { tag: "灵感在线", text: "今天脑子里的小剧场格外热闹，写下来一定好看。" },
        { tag: "宜摸鱼", text: "允许自己慢半拍，风会替你把没跑完的路走完。" },
    ];

    function playTruthDare() {
        const pick = MODERN_DARES[Math.floor(Math.random() * MODERN_DARES.length)];
        onSend("truth_dare", { dare: pick }, `[真心话大冒险] ${pick}`);
        onClose();
    }

    function playMoodBox() {
        const mood = MODERN_MOODS[Math.floor(Math.random() * MODERN_MOODS.length)];
        onSend("mood_box", { tag: mood.tag, text: mood.text }, `[心情盲盒·${mood.tag}] ${mood.text}`);
        onClose();
    }

    const ancientItems = [
        { key: "feihua", label: "飞花传令", onClick: () => setView("feihua") },
        { key: "sign", label: "月老签", onClick: playSign },
        { key: "gift", label: "投我木桃", onClick: () => setView("gift") },
        { key: "couplet", label: "对联求对", onClick: playCoupletStart },
        { key: "elegant", label: "称谓雅鉴", onClick: () => setView("elegant") },
        { key: "tools", label: "器物阁", onClick: () => setView("tools") },
    ];
    const modernItems = [
        { key: "truth", label: "真心话大冒险", onClick: playTruthDare },
        { key: "mood", label: "心情盲盒", onClick: playMoodBox },
    ];
    const items = mode === "gufeng" ? ancientItems : modernItems;
    const needsApi = view === "feihua" || view === "couplet" || view === "elegant" || mode === "modern";

    return (
        <div className="gfp-overlay" onClick={onClose}>
            <div className="gfp-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="gfp-sheet-head">
                    <span className="gfp-sheet-title">{mode === "gufeng" ? "古风雅玩" : "现代趣玩"}</span>
                    <div className="gfp-mode-switch" role="tablist">
                        <button className={`gfp-mode-tab${mode === "gufeng" ? " active" : ""}`} onClick={() => { setMode("gufeng"); setView("menu"); }}>古风</button>
                        <button className={`gfp-mode-tab${mode === "modern" ? " active" : ""}`} onClick={() => { setMode("modern"); setView("menu"); }}>现代</button>
                    </div>
                    <button className="gfp-close" onClick={onClose} aria-label="关闭">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                {view === "menu" && (
                    <div className="gfp-grid">
                        {items.map((it) => (
                            <button key={it.key} className="gfp-entry" onClick={it.onClick} disabled={busy || (needsApi && !hasApi)}>
                                <GfpIcon path={ICONS[it.key]} />
                                <span>{it.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {view === "feihua" && (
                    <div className="gfp-body">
                        <div className="gfp-hint">择一个令字，请 {character?.name || "对方"} 接一句含令字的诗。</div>
                        <div className="gfp-token-row">
                            {GUFENG_TOKEN_CHARS.map((ch) => (
                                <button key={ch} className="gfp-token" disabled={busy} onClick={() => playFeihua(ch)}>{ch}</button>
                            ))}
                        </div>
                    </div>
                )}

                {view === "gift" && (
                    <div className="gfp-body">
                        <div className="gfp-hint">择一件信物相赠。</div>
                        <div className="gfp-gift-row">
                            {GUFENG_GIFTS.map((g, i) => (
                                <button key={g.name} className="gfp-gift" disabled={busy} onClick={() => playGift(i)}>
                                    <GfpIcon path={g.icon} size={26} />
                                    <span>{g.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {view === "tools" && (
                    <div className="gfp-body">
                        <div className="gfp-hint">器物阁 · 择一件古人随身之物相示。</div>
                        <div className="gfp-gift-row">
                            {GUFENG_TOOLS.map((t, i) => (
                                <button key={t.name} className="gfp-gift" disabled={busy} onClick={() => playTool(i)}>
                                    <GfpIcon path={t.icon} size={26} />
                                    <span>{t.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {view === "couplet" && (
                    <div className="gfp-body">
                        <div className="gfp-hint">上联</div>
                        <div className="gfp-card-line">{upper}</div>
                        <input className="gfp-input" placeholder="对出你的下联……" value={lowerInput} onChange={(e) => setLowerInput(e.target.value)} disabled={busy} />
                        <button className="gfp-send" disabled={busy || !lowerInput.trim()} onClick={playCoupletSend}>落 笔</button>
                    </div>
                )}

                {view === "elegant" && (
                    <div className="gfp-body">
                        <div className="gfp-hint">输入一句现代白话，改写成古风雅言。</div>
                        <input className="gfp-input" placeholder="例如：我很想你……" value={elegantInput} onChange={(e) => setElegantInput(e.target.value)} disabled={busy} />
                        <button className="gfp-send" disabled={busy || !elegantInput.trim()} onClick={playElegant}>{busy ? "研磨中……" : "成 言"}</button>
                    </div>
                )}

                {busy && <div className="gfp-hint">雅士凝思中……</div>}
                {err && <div className="gfp-err">{err}</div>}
                {!hasApi && mode === "modern" && <div className="gfp-err">未配置 API，现代玩法暂不可用；可在设置中配置后使用。</div>}
            </div>
        </div>
    );
}

/** 雅玩结果卡片气泡 */
export function GuFengPlayBubble({ msg }: { msg: ChatMessage }) {
    const d = (msg.mediaData || {}) as Record<string, unknown>;
    const kind = String(d.kind || "");
    const ancient = ["verse", "sign", "gift", "tool", "couplet", "elegant"].includes(kind);

    return (
        <div className={`gfp-bubble${ancient ? "" : " modern"}`}>
            <div className="gfp-bubble-kind">
                {ancient && <span className="gfp-seal">雅</span>}
                {kind === "verse" && <div className="gfp-bubble-body"><div className="gfp-bubble-title">飞花令 · {String(d.tokenChar)}</div><div className="gfp-bubble-verse">{String(d.verse)}</div></div>}
                {kind === "sign" && (
                    <div className="gfp-bubble-body">
                        <div className="gfp-bubble-title">月老签 · {String(d.level)}</div>
                        <div className="gfp-bubble-verse center">{((d.poem as string[]) || []).map((line, i) => <div key={i}>{line}</div>)}</div>
                        <div className="gfp-bubble-note">{String(d.note)}</div>
                    </div>
                )}
                {kind === "gift" && (
                    <div className="gfp-bubble-body gift">
                        <GfpIcon path={String(d.giftIcon)} size={34} />
                        <div className="gfp-bubble-title">{String(d.giftName)}</div>
                        <div className="gfp-bubble-note">{String(d.giftMessage)}</div>
                    </div>
                )}
                {kind === "tool" && (
                    <div className="gfp-bubble-body gift">
                        <GfpIcon path={String(d.toolIcon)} size={34} />
                        <div className="gfp-bubble-title">器物阁 · {String(d.toolName)}</div>
                        <div className="gfp-bubble-note">{String(d.inscription)}</div>
                    </div>
                )}
                {kind === "couplet" && (
                    <div className="gfp-bubble-body">
                        <div className="gfp-bubble-title">对联</div>
                        <div className="gfp-bubble-verse"><span className="gfp-tag">上</span>{String(d.upper)}</div>
                        <div className="gfp-bubble-verse"><span className="gfp-tag">下</span>{String(d.lower)}</div>
                    </div>
                )}
                {kind === "elegant" && (
                    <div className="gfp-bubble-body">
                        <div className="gfp-bubble-title">雅言</div>
                        <div className="gfp-bubble-verse">{String(d.elegant)}</div>
                        <div className="gfp-bubble-note">原句：{String(d.origin)}</div>
                    </div>
                )}
                {kind === "truth_dare" && (
                    <div className="gfp-bubble-body">
                        <div className="gfp-bubble-title">真心话大冒险</div>
                        <div className="gfp-bubble-verse">{String(d.dare)}</div>
                    </div>
                )}
                {kind === "mood_box" && (
                    <div className="gfp-bubble-body">
                        <div className="gfp-bubble-title">心情盲盒 · {String(d.tag)}</div>
                        <div className="gfp-bubble-verse">{String(d.text)}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

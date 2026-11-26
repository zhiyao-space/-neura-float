// components/gufeng/gufeng-app.tsx —— 古风雅集：飞花令 / 抽签问卜 / 文言雅译 / 历法雅鉴
import { useMemo, useRef, useState } from "react";
import {
    mdiArrowLeft,
    mdiFlower,
    mdiCards,
    mdiFeather,
    mdiCalendarTextOutline,
} from "@mdi/js";
import "@/gufeng.css";
import { loadCharacters } from "@/lib/character-storage";
import { loadApiConfigs } from "@/lib/settings-storage";
import { simpleLLMCall } from "@/lib/api-helpers";
import {
    FEIHUA_SYSTEM_PROMPT,
    GUFENG_SIGNS,
    GUFENG_TOKEN_CHARS,
    GUFENG_YI,
    GUFENG_JI,
    SIGN_SYSTEM_PROMPT,
    WENYAN_SYSTEM_PROMPT,
    buildGufengPersona,
    ganzhiYear,
} from "@/lib/gufeng-data";

type Feature = "home" | "feihua" | "oracle" | "wenyan" | "calendar";

function GfIcon({ path, size = 1, className }: { path: string; size?: number; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" width={`${size}rem`} height={`${size}rem`} className={className} aria-hidden fill="currentColor">
            <path d={path} />
        </svg>
    );
}

type VerseRound = { who: "you" | "host"; text: string };

const FEAT_META: Record<Exclude<Feature, "home">, { name: string; sub: string; icon: string }> = {
    feihua: { name: "飞花令", sub: "以令字行酒吟诗", icon: mdiFlower },
    oracle: { name: "抽签问卜", sub: "摇筒求签问机缘", icon: mdiCards },
    wenyan: { name: "文言雅译", sub: "白话译作古文", icon: mdiFeather },
    calendar: { name: "历法雅鉴", sub: "今日农历与干支", icon: mdiCalendarTextOutline },
};

function pickLunar(date: Date): { lunarText: string; ganzhi: string; zodiac: string; yi: string; ji: string } {
    let lunarText = "";
    try {
        lunarText = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "long", day: "numeric" }).format(date);
    } catch {
        lunarText = "";
    }
    const { ganzhi, zodiac } = ganzhiYear(date);
    const dayIdx = Math.floor(date.getTime() / 86400000);
    return {
        lunarText,
        ganzhi: `${ganzhi}年`,
        zodiac: `属${zodiac}`,
        yi: GUFENG_YI[dayIdx % GUFENG_YI.length],
        ji: GUFENG_JI[(dayIdx * 7 + 3) % GUFENG_JI.length],
    };
}

export function GuFengApp({ onClose }: { onClose: () => void }) {
    const [feature, setFeature] = useState<Feature>("home");
    const characters = useMemo(() => loadCharacters(), []);
    const [roleIdx, setRoleIdx] = useState(0);
    const role = characters[roleIdx];
    const persona = role ? buildGufengPersona(role.name, role.persona || "", role.tags || []) : "";
    const isAncient = !!role?.tags?.some((t) => t.includes("古风") || t.includes("古代") || t.includes("武侠"));
    const apiConfig = useMemo(() => loadApiConfigs()[0] || null, []);

    async function askLLM(system: string, userText: string): Promise<string> {
        const res = await simpleLLMCall(apiConfig!, [
            { role: "system", content: system },
            { role: "user", content: userText },
        ], { temperature: 0.85, label: "gufeng" });
        if (res.error || !res.content) throw new Error(res.error || "雅集先生一时语塞，请再试一次。");
        return res.content.trim();
    }

    return (
        <div className="gufeng-root">
            <div className="gufeng-topbar">
                <button className="gufeng-back" onClick={() => (feature === "home" ? onClose() : setFeature("home"))} aria-label="返回">
                    <GfIcon path={mdiArrowLeft} size={0.9} />
                </button>
                <span className="gufeng-title-seal">雅</span>
                <span className="gufeng-title">{feature === "home" ? "古风雅集" : FEAT_META[feature].name}</span>
            </div>
            <div className="gufeng-body">
                {characters.length > 0 && (
                    <div className="gufeng-card">
                        <div className="gufeng-section-title">同席雅士{isAncient ? "（此席具古风风致）" : ""}</div>
                        <div className="gufeng-roles">
                            {characters.slice(0, 12).map((c, i) => (
                                <button key={c.id} className={`gufeng-role-chip${i === roleIdx ? " active" : ""}`} onClick={() => setRoleIdx(i)}>
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {!apiConfig && feature !== "home" && feature !== "calendar" && (
                    <div className="gufeng-card gufeng-err">尚未配置 API，请先到设置中配置后使用 AI 玩法；历法雅鉴无需 API。</div>
                )}
                {feature === "home" && <HomeView onPick={setFeature} />}
                {feature === "feihua" && <FeiHuaView enabled={!!apiConfig} persona={persona} ask={askLLM} />}
                {feature === "oracle" && <OracleView enabled={!!apiConfig} persona={persona} ask={askLLM} />}
                {feature === "wenyan" && <WenYanView enabled={!!apiConfig} persona={persona} ask={askLLM} />}
                {feature === "calendar" && <CalendarView />}
            </div>
        </div>
    );
}

function HomeView({ onPick }: { onPick: (f: Feature) => void }) {
    return (
        <div className="gufeng-grid">
            {(Object.keys(FEAT_META) as Exclude<Feature, "home">[]).map((key) => (
                <button key={key} className="gufeng-entry" onClick={() => onPick(key)}>
                    <GfIcon className="gf-icon" path={FEAT_META[key].icon} size={1} />
                    <div className="gf-name">{FEAT_META[key].name}</div>
                    <div className="gf-sub">{FEAT_META[key].sub}</div>
                </button>
            ))}
        </div>
    );
}

function FeiHuaView({ enabled, persona, ask }: { enabled: boolean; persona: string; ask: (sys: string, user: string) => Promise<string> }) {
    const [tokenChar, setTokenChar] = useState("花");
    const [rounds, setRounds] = useState<VerseRound[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        const verse = input.trim();
        if (!verse || busy) return;
        setInput("");
        setErr(null);
        setRounds((prev) => [...prev, { who: "you", text: verse }]);
        setBusy(true);
        try {
            const history = [...(rounds.length ? rounds : []), { who: "you" as const, text: verse }]
                .map((r) => `${r.who === "you" ? "客方" : "主持人"}：${r.text}`)
                .join("\n");
            const reply = await ask(FEIHUA_SYSTEM_PROMPT(tokenChar, persona), history || `请主持人先出一句含「${tokenChar}」的诗句开令。`);
            setRounds((prev) => [...prev, { who: "host", text: reply.replace(/\n{2,}/g, "\n") }]);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="gufeng-card">
                <div className="gufeng-section-title">择令字</div>
                <div className="gufeng-roles">
                    {GUFENG_TOKEN_CHARS.map((ch) => (
                        <button key={ch} className={`gufeng-role-chip${ch === tokenChar ? " active" : ""}`} onClick={() => { setTokenChar(ch); setRounds([]); }}>
                            {ch}
                        </button>
                    ))}
                </div>
            </div>
            <div className="gufeng-card">
                <div className="gufeng-section-title">令簿 · 每句须含「{tokenChar}」</div>
                {rounds.length === 0 && <div style={{ fontSize: 13, color: "#8a7a60" }}>客方先吟一句，主持人依令接句并点评。</div>}
                <div>
                    {rounds.map((r, i) => (
                        <div key={i} className="gufeng-verse-row">
                            <span className={`gufeng-verse${r.who === "host" ? " ai" : ""}`} style={{ whiteSpace: "pre-wrap" }}>{r.text}</span>
                            <span className="gf-who">{r.who === "you" ? "客" : "主"}</span>
                        </div>
                    ))}
                    {busy && <div className="gufeng-verse ai" style={{ opacity: 0.6 }}>主持人凝思中……</div>}
                </div>
                {err && <div className="gufeng-err" style={{ marginTop: 6 }}>{err}</div>}
            </div>
            <textarea
                className="gufeng-textarea"
                placeholder="输入含令字的诗句……"
                value={input}
                disabled={!enabled || busy}
                onChange={(e) => setInput(e.target.value)}
            />
            <button className="gufeng-btn" disabled={!enabled || busy || !input.trim()} onClick={submit}>行 令</button>
        </>
    );
}

function OracleView({ enabled, persona, ask }: { enabled: boolean; persona: string; ask: (sys: string, user: string) => Promise<string> }) {
    const [rolling, setRolling] = useState(false);
    const [sign, setSign] = useState<(typeof GUFENG_SIGNS)[number] | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    function draw() {
        if (rolling || busy) return;
        setSign(null);
        setNote(null);
        setErr(null);
        setRolling(true);
        window.setTimeout(() => {
            const s = GUFENG_SIGNS[Math.floor(Math.random() * GUFENG_SIGNS.length)];
            setRolling(false);
            setSign(s);
        }, 1100);
    }

    async function interpret() {
        if (!sign || busy) return;
        setBusy(true);
        setErr(null);
        try {
            setNote(await ask(SIGN_SYSTEM_PROMPT(sign.level, sign.poem.join("，"), persona), "请为此签解签。"));
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="gufeng-card" style={{ textAlign: "center" }}>
                <div className={`gufeng-shake${rolling ? " rolling" : ""}`} onClick={draw} role="button" aria-label="摇签筒">
                    {rolling ? "" : "签"}
                </div>
                <div style={{ fontSize: 12, color: "#8a7a60" }}>{rolling ? "签筒摇动中……" : "点击签筒求签"}</div>
            </div>
            {sign && (
                <div className="gufeng-card">
                    <span className="gufeng-sign-level">{sign.level}</span>
                    <div className="gufeng-sign-poem">
                        {sign.poem.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                    <div className="gufeng-sign-note">签曰：{sign.note}</div>
                </div>
            )}
            {sign && !note && (
                <button className="gufeng-btn" disabled={!enabled || busy} onClick={interpret}>
                    {busy ? "解签中……" : "请雅士解签"}
                </button>
            )}
            {note && <div className="gufeng-card"><div className="gufeng-sign-note" style={{ borderTop: "none", paddingTop: 0 }}>{note}</div></div>}
            {err && <div className="gufeng-err">{err}</div>}
        </>
    );
}

function WenYanView({ enabled, persona, ask }: { enabled: boolean; persona: string; ask: (sys: string, user: string) => Promise<string> }) {
    const [input, setInput] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function translate() {
        const text = input.trim();
        if (!text || busy) return;
        setBusy(true);
        setErr(null);
        setResult(null);
        try {
            setResult(await ask(WENYAN_SYSTEM_PROMPT(persona), text));
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <textarea
                className="gufeng-textarea"
                placeholder="粘贴现代白话文字，译作文言……"
                value={input}
                disabled={!enabled || busy}
                onChange={(e) => setInput(e.target.value)}
            />
            <button className="gufeng-btn" disabled={!enabled || busy || !input.trim()} onClick={translate}>
                {busy ? "研磨落笔中……" : "雅 译"}
            </button>
            {err && <div className="gufeng-err">{err}</div>}
            {result && <div className="gufeng-card"><div className="gufeng-verse ai" style={{ whiteSpace: "pre-wrap" }}>{result}</div></div>}
        </>
    );
}

function CalendarView() {
    const info = useMemo(() => pickLunar(new Date()), []);
    return (
        <div className="gufeng-card gufeng-calandar">
            <div className="gufeng-section-title" style={{ justifyContent: "center" }}>今日历象</div>
            <div className="gf-lunar">{info.lunarText || "农历佳日"}</div>
            <div className="gf-ganzhi">{info.ganzhi} · {info.zodiac}</div>
            <div className="gf-yiji">
                <span><b>宜</b>{info.yi}</span>
                <span><b>忌</b>{info.ji}</span>
            </div>
            <div style={{ fontSize: 11, color: "#8a7a60", marginTop: 10 }}>宜忌为雅趣轮转之笔，姑妄听之。</div>
        </div>
    );
}

import JSZip from "jszip";

export type ParsedVibeEntry = {
    name: string;
    /** 编码本体 base64（来自 .naiv4vibe / zip 内条目 / PNG 隐写）。生成请求直接使用。 */
    encoded?: string;
    /** 原图（PNG/JPEG/WebP 无隐写数据时的回退）。 */
    blob?: Blob;
    /** 导出时刻的信息提取强度（官方 .naiv4vibe 自带）。 */
    informationExtracted?: number;
};

export type ExportableVibe = {
    name: string;
    encoded: string;
    informationExtracted: number;
};

const VIBE_DATA_KEYS = ["data", "encoded", "image", "source_image"];

function cleanBase64(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
    return cleaned.length > 64 && /^[A-Za-z0-9+/=]+$/.test(cleaned) ? cleaned : null;
}

function pickEncoded(obj: Record<string, unknown>): string | null {
    for (const key of VIBE_DATA_KEYS) {
        const value = cleanBase64(obj[key]);
        if (value) return value;
    }
    // 兜底：任意嵌套找最长 base64 串
    let best: { length: number; b64: string } = { length: 0, b64: "" };
    const walk = (input: unknown) => {
        if (typeof input === "string") {
            const cleaned = cleanBase64(input);
            if (cleaned && cleaned.length > best.length) best = { length: cleaned.length, b64: cleaned };
        } else if (Array.isArray(input)) input.forEach(walk);
        else if (input && typeof input === "object") Object.values(input).forEach(walk);
    };
    walk(obj);
    return best.b64 || null;
}

// ---------- PNG tEXt 提取（stealth_pngcomp 隐写） ----------

type PngInfo = { width: number; height: number; bitDepth: number; colorType: number; idat: Uint8Array[] };

function parsePngChunks(uint8: Uint8Array): { textChunks: Record<string, string>; info: PngInfo | null } {
    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
    const textChunks: Record<string, string> = {};
    let info: PngInfo | null = null;
    let offset = 8;
    const decoder = new TextDecoder();
    while (offset + 8 <= uint8.length) {
        const length = view.getUint32(offset);
        const type = decoder.decode(uint8.subarray(offset + 4, offset + 8));
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > uint8.length) break;
        if (type === "tEXt") {
            const raw = uint8.subarray(dataStart, dataEnd);
            const sep = raw.indexOf(0);
            if (sep > 0) {
                const keyword = decoder.decode(raw.subarray(0, sep));
                textChunks[keyword] = decoder.decode(raw.subarray(sep + 1));
            }
        } else if (type === "IHDR" && !info) {
            info = {
                width: view.getUint32(dataStart),
                height: view.getUint32(dataStart + 4),
                bitDepth: uint8[dataStart + 8],
                colorType: uint8[dataStart + 9],
                idat: [],
            };
        } else if (type === "IDAT" && info) {
            info.idat.push(uint8.subarray(dataStart, dataEnd));
        }
        offset = dataEnd + 4; // 跳过 CRC
        if (type === "IEND") break;
    }
    return { textChunks, info };
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unfilterScanlines(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
    const stride = width * bpp;
    const out = new Uint8Array(height * stride);
    let pos = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[pos++];
        const row = out.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x++) {
            const value = raw[pos + x] || 0;
            const left = x >= bpp ? row[x - bpp] : 0;
            const up = y > 0 ? out[(y - 1) * stride + x] : 0;
            const upLeft = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
            let result = value;
            if (filter === 1) result = value + left;
            else if (filter === 2) result = value + up;
            else if (filter === 3) result = value + ((left + up) >> 1);
            else if (filter === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
                result = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
            }
            row[x] = result & 0xff;
        }
        pos += stride;
    }
    return out;
}

/**
 * 解码 PNG tEXt "Comment"（官方前端 stealth_pngcomp 隐写）：
 * alpha 通道最低位、列优先位流 → gzip JSON → vibes[].data。
 */
async function decodeStealthPngcomp(uint8: Uint8Array): Promise<{ encoded: string; informationExtracted?: number }[] | null> {
    const { textChunks, info } = parsePngChunks(uint8);
    const magic = textChunks["stealth_pngcomp"] ?? textChunks["Comment"] === "stealth_pngcomp" ? "stealth_pngcomp" : "";
    const marker = textChunks["stealth_pngcomp"];
    if (!marker || !info || info.bitDepth !== 8 || info.colorType !== 6) return null;
    void magic;

    const raw = new Uint8Array((await Promise.all(info.idat.map(part => inflateRaw(part))))
        .reduce((acc, part) => { acc.push(...part); return acc; }, [] as number[]));
    const pixels = unfilterScanlines(raw, info.width, info.height, 4);

    // alpha 最低位，列优先收集
    const totalAlphaBits = info.width * info.height;
    const bits: number[] = [];
    for (let x = 0; x < info.width && bits.length < totalAlphaBits; x++) {
        for (let y = 0; y < info.height; y++) {
            bits.push((pixels[y * info.width * 4 + x * 4 + 3] & 1));
        }
    }
    const readBits = (start: number, count: number): number => {
        let value = 0;
        for (let i = 0; i < count; i++) value = (value << 1) | (bits[start + i] ?? 0);
        return value;
    };
    // magic: 16 字符 ASCII
    let magicText = "";
    for (let i = 0; i < 16; i++) magicText += String.fromCharCode(readBits(i * 8, 8));
    if (magicText !== "stealth_pngcomp") return null;
    const dataLen = readBits(128, 32);
    if (dataLen <= 0 || 160 + dataLen * 8 > bits.length) return null;
    const payload = new Uint8Array(dataLen);
    for (let i = 0; i < dataLen; i++) payload[i] = readBits(160 + i * 8, 8);

    const stream = new Blob([payload.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(await new Response(stream).arrayBuffer()))) as
        { vibes?: { data?: string; information_extracted?: number }[]; data?: string; information_extracted?: number };
    const list = Array.isArray(json.vibes) ? json.vibes : [json];
    const results: { encoded: string; informationExtracted?: number }[] = [];
    for (const item of list) {
        const encoded = cleanBase64(item?.data);
        if (encoded) results.push({ encoded, informationExtracted: item?.information_extracted });
    }
    return results.length > 0 ? results : null;
}

// ---------- 主入口 ----------

async function parseVibeJson(text: string, fallbackName: string): Promise<ParsedVibeEntry[]> {
    const json = JSON.parse(text) as Record<string, unknown>;
    const list: Record<string, unknown>[] = Array.isArray(json.vibes)
        ? (json.vibes as Record<string, unknown>[])
        : [json];
    const entries: ParsedVibeEntry[] = [];
    for (const item of list) {
        const encoded = pickEncoded(item);
        if (encoded) {
            entries.push({
                name: fallbackName,
                encoded,
                informationExtracted: typeof item.information_extracted === "number" ? item.information_extracted : undefined,
            });
        }
    }
    if (entries.length === 0) throw new Error(`${fallbackName}：编码文件内未找到 vibe 编码数据（data 字段）。`);
    return entries;
}

async function parseImageVibe(file: File): Promise<ParsedVibeEntry[]> {
    const baseName = file.name.replace(/\.[^.]+$/, "") || "vibe";
    const uint8 = new Uint8Array(await file.arrayBuffer());
    const isPng = uint8[0] === 0x89 && uint8[1] === 0x50;
    if (isPng) {
        try {
            const stealth = await decodeStealthPngcomp(uint8);
            if (stealth) {
                return stealth.map((item, idx) => ({
                    name: stealth.length > 1 ? `${baseName} #${idx + 1}` : baseName,
                    encoded: item.encoded,
                    informationExtracted: item.informationExtracted,
                }));
            }
        } catch {
            // 隐写解析失败，回退原图
        }
    }
    // 普通图片：保留原图，生成时懒编码
    return [{ name: baseName, blob: file.slice(0, file.size, file.type || "image/png") }];
}

/**
 * 解析「导入 Vibe (PNG / 编码文件)」：
 * - zip：遍历全部 .naiv4vibe 条目逐条导入（官方 Export as Encodings 打包格式）
 * - .naiv4vibe / .json：取 data/encoded/image 字段（编码本体）
 * - PNG/JPEG/WebP：优先读 tEXt "Comment" 的 stealth_pngcomp 隐写编码；没有则保留原图待编码
 */
export async function parseVibeFiles(file: File): Promise<ParsedVibeEntry[]> {
    const baseName = file.name.replace(/\.[^.]+$/, "") || "vibe";

    if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const entries = Object.keys(zip.files)
            .map(name => ({ name, file: zip.files[name] }))
            .filter(item => !item.file.dir)
            .sort((a, b) => a.name.localeCompare(b.name));
        const results: ParsedVibeEntry[] = [];
        const errors: string[] = [];
        for (const entry of entries) {
            const fileName = entry.name.split("/").pop() || entry.name;
            try {
                if (/\.(naiv4vibe|naiv4image|naiv1style|style|json)$/i.test(fileName)) {
                    const text = await entry.file.async("string");
                    const parsed = await parseVibeJson(text, fileName.replace(/\.[^.]+$/, "") || fileName);
                    for (const item of parsed) results.push({ ...item, name: results.length === 0 && parsed.length === 1 ? baseName : `${baseName}/${item.name}` });
                } else if (/\.(png|jpe?g|webp|image)$/i.test(fileName)) {
                    const innerBuffer = await entry.file.async("arraybuffer");
                    const innerFile = new File([innerBuffer], fileName);
                    const parsed = await parseImageVibe(innerFile);
                    for (const item of parsed) results.push({ ...item, name: `${baseName}/${item.name}` });
                } else if (/\.zip$/i.test(fileName)) {
                    const innerBuffer = await entry.file.async("arraybuffer");
                    const innerFile = new File([innerBuffer], fileName);
                    const parsed = await parseVibeFiles(innerFile);
                    for (const item of parsed) results.push({ ...item, name: `${baseName}/${item.name}` });
                }
            } catch (error) {
                errors.push(`${fileName}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (results.length === 0) {
            throw new Error(`${file.name}：压缩包内未找到可用的 vibe 编码文件。${errors[0] ? `（${errors[0]}）` : ""}`);
        }
        return results;
    }

    if (/\.(naiv4vibe|naiv4image|naiv1style|style|json)$/i.test(file.name)) {
        return parseVibeJson(new TextDecoder().decode(await file.arrayBuffer()), baseName);
    }

    return parseImageVibe(file);
}

// ---------- 导出 ----------

/** 序列化为官方 .naiv4vibe 内容：{prompt, information_extracted, data}。 */
export function serializeVibeEntry(vibe: ExportableVibe): string {
    return JSON.stringify({
        prompt: "vibe encoding for NAIV4",
        information_extracted: vibe.informationExtracted,
        data: vibe.encoded,
    });
}

/**
 * 导出编码：单条 → .naiv4vibe 文件；多条 → ZIP（store 不压缩，官方同款）。
 * 返回 { blob, filename }。
 */
export async function exportVibesArchive(vibes: ExportableVibe[]): Promise<{ blob: Blob; filename: string }> {
    if (vibes.length === 0) throw new Error("没有可导出的 Vibe 编码（纯原图条目需先生成一次完成编码）。");
    const timestamp = Date.now();
    if (vibes.length === 1) {
        const text = serializeVibeEntry(vibes[0]);
        return { blob: new Blob([text], { type: "application/json" }), filename: `vibe_1_${timestamp}.naiv4vibe` };
    }
    const zip = new JSZip();
    vibes.forEach((vibe, idx) => {
        zip.file(`vibe_${String(idx + 1).padStart(2, "0")}.naiv4vibe`, serializeVibeEntry(vibe), { compression: "STORE" });
    });
    const blob = await zip.generateAsync({ compression: "STORE", type: "blob" });
    return { blob, filename: `vibe_bundle_${vibes.length}_${timestamp}.zip` };
}

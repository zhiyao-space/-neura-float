import JSZip from "jszip";

export type ParsedVibeFile = {
    name: string;
    blob: Blob;
};

function base64ToBlob(b64: string, mimeType = "image/png"): Blob {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
}

// 在任意嵌套 JSON 里找出最长的 base64 图片串（NAI vibe 文件把编码图存在 image / source_image 等字段）。
function findLongestBase64(value: unknown, best: { length: number; b64: string } = { length: 0, b64: "" }): { length: number; b64: string } {
    if (typeof value === "string") {
        const cleaned = value.replace(/^data:[^;]+;base64,/, "").trim();
        if (cleaned.length > best.length && cleaned.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(cleaned)) {
            return { length: cleaned.length, b64: cleaned };
        }
        return best;
    }
    if (Array.isArray(value)) {
        for (const item of value) best = findLongestBase64(item, best);
        return best;
    }
    if (value && typeof value === "object") {
        for (const item of Object.values(value as Record<string, unknown>)) best = findLongestBase64(item, best);
    }
    return best;
}

/**
 * 解析「导入 Vibe (PNG / 编码文件)」选择的文件：
 * - PNG / JPEG / WebP 图片直接作为 vibe 参考图；
 * - .naiv4vibe / .naiv4image / .naiv1style / .style 等编码文件为 JSON（可能 zip 包裹），提取内嵌 base64 图片。
 */
export async function parseVibeFile(file: File): Promise<ParsedVibeFile> {
    const baseName = file.name.replace(/\.[^.]+$/, "") || "vibe";

    if (file.type.startsWith("image/")) {
        return { name: baseName, blob: file };
    }

    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const isZip = uint8[0] === 0x50 && uint8[1] === 0x4b;

    if (isZip) {
        const zip = await JSZip.loadAsync(buffer);
        const entry = Object.keys(zip.files)
            .map(name => ({ name, file: zip.files[name] }))
            .find(item => !item.file.dir && /\.(png|jpe?g|webp|json|txt)$/i.test(item.name));
        if (!entry) throw new Error(`${file.name}：压缩包内未找到可用的 vibe 文件。`);
        const innerBuffer = await entry.file.async("arraybuffer");
        const innerFile = new File([innerBuffer], entry.name.split("/").pop() || entry.name);
        const parsed = await parseVibeFile(innerFile);
        return { name: baseName, blob: parsed.blob };
    }

    const text = new TextDecoder().decode(uint8).trim();
    try {
        const json = JSON.parse(text) as unknown;
        const best = findLongestBase64(json);
        if (best.b64) {
            return { name: baseName, blob: base64ToBlob(best.b64) };
        }
        throw new Error(`${file.name}：编码文件内未找到图片数据。`);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`${file.name}：无法识别的 vibe 编码文件格式。`);
        }
        throw error;
    }
}

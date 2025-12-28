
export const API_CONFIG = {
    baseUrl: 'https://foxi-ai.top', // Default, can be overridden
    apiKey: '', // User must provide
    timeoutMs: 300_000, // 300 秒
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = API_CONFIG.timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒）`);
        }
        // 浏览器网络层错误（例如 net::ERR_CONNECTION_CLOSED / CORS 阻止 / 断网）通常会表现为 TypeError: Failed to fetch
        if (err instanceof TypeError) {
            throw new Error(
                '网络请求失败：连接被中断（可能是服务端主动断开、网络/代理不稳定、或请求体过大导致网关重置连接）。'
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

const isLikelyBase64 = (value) => {
    if (!value || typeof value !== 'string') return false;
    // very loose check: base64 chars, optional padding, no whitespace
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 64;
};

const parseDataUrl = (value) => {
    if (!value || typeof value !== 'string') return null;
    if (!value.startsWith('data:image/')) return null;
    const [meta, b64] = value.split(',');
    if (!b64) return null;
    const mimeType = meta.split(';')[0].slice('data:'.length) || 'image/png';
    return { mimeType, base64: b64 };
};

const base64ToBlob = (base64, mimeType = 'image/png') => {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
};

/**
 * Download remote image and convert to base64
 */
const downloadImageAsBase64 = async (imageUrl) => {
    try {
        const response = await fetchWithTimeout(imageUrl, {
            method: 'GET',
        });
        
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status}`);
        }
        
        const blob = await response.blob();
        const mimeType = blob.type || 'image/png';
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];
                resolve({ mimeType, base64 });
            };
            reader.onerror = reject;
        });
    } catch (error) {
        console.error('Error downloading image:', error);
        throw error;
    }
};

export async function uploadFile({ dataUrl, apiKey, baseUrl, filename = 'upload.png' }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/files`;

    // 支持传入 data:image/... 或 https://...
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
        throw new Error('上传失败：缺少文件数据');
    }
    if (/^https?:\/\//i.test(dataUrl)) {
        return { url: dataUrl };
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) throw new Error('上传失败：仅支持图片 dataURL');

    const formData = new FormData();
    formData.append('file', base64ToBlob(parsed.base64, parsed.mimeType), filename);

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: formData
    });

    if (!response.ok) {
        let message = '文件上传失败';
        try {
            const err = await response.json();
            message = err.error?.message || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    const data = await response.json();
    if (!data?.url) throw new Error('文件上传失败：响应中缺少 url');
    return data; // { id, url, ... }
}

const extractBase64ImageFromChat = async (payload) => {
    // Try common shapes (provider variations)
    const candidates = [];

    // 1) OpenAI-like images API passthrough
    const directB64 = payload?.data?.[0]?.b64_json;
    if (typeof directB64 === 'string') candidates.push({ mimeType: 'image/png', base64: directB64 });

    // 2) chat.completions: choices[0].message.content (string or array)
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        // Check for markdown image format: ![image](url)
        const markdownImageMatch = content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
        if (markdownImageMatch) {
            const imageUrl = markdownImageMatch[1];
            try {
                return await downloadImageAsBase64(imageUrl);
            } catch (error) {
                console.error('Failed to download markdown image:', error);
                // Continue to try other formats
            }
        }

        const asDataUrl = parseDataUrl(content);
        if (asDataUrl) return asDataUrl;

        // maybe it is a raw base64 string
        if (isLikelyBase64(content)) return { mimeType: 'image/png', base64: content };

        // maybe it is JSON in string
        try {
            const obj = JSON.parse(content);
            const b64 = obj?.b64_json || obj?.image || obj?.data?.b64_json;
            const dataUrl = obj?.data_url || obj?.image_url || obj?.url;
            const parsed = parseDataUrl(dataUrl);
            if (parsed) return parsed;
            if (typeof b64 === 'string' && isLikelyBase64(b64)) return { mimeType: obj?.mime_type || 'image/png', base64: b64 };
        } catch {
            // ignore
        }
    }

    if (Array.isArray(content)) {
        for (const part of content) {
            const url = part?.image_url?.url || part?.image_url || part?.url;
            const parsed = parseDataUrl(url);
            if (parsed) return parsed;
            const b64 = part?.b64_json || part?.b64 || part?.image?.b64_json;
            if (typeof b64 === 'string' && isLikelyBase64(b64)) return { mimeType: part?.mime_type || 'image/png', base64: b64 };
        }
    }

    // 3) some providers place images in a separate field
    const maybeImages = payload?.images || payload?.output?.images || payload?.choices?.[0]?.message?.images;
    if (Array.isArray(maybeImages)) {
        for (const img of maybeImages) {
            const parsed = parseDataUrl(img?.data_url || img?.url);
            if (parsed) return parsed;
            const b64 = img?.b64_json || img?.b64;
            if (typeof b64 === 'string' && isLikelyBase64(b64)) return { mimeType: img?.mime_type || 'image/png', base64: b64 };
        }
    }

    // fallback to candidates
    if (candidates.length > 0) return candidates[0];
    return null;
};

/**
 * Helper to convert Blob/File to Base64
 */
export const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Remove data:image/...;base64,
        reader.onerror = error => reject(error);
    });
};

/**
 * Call the Gemini Image Generation API
 */
export async function generateImage({ prompt, aspectRatio = '1:1', apiKey, baseUrl, model, size = '1024x1024' }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/images/generations`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: JSON.stringify({
            prompt,
            model: model || "gemini-2.5-flash-image",
            n: 1,
            size: size,
            aspect_ratio: aspectRatio,
            response_format: "b64_json"
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '生成失败');
    }

    return await response.json();
}

/**
 * 使用 OpenAI Chat Completions 格式的“绘图模型”（例如 gemini-3-pro-image-preview）
 * 说明：不同服务商返回图片的字段可能不同，这里做了尽可能兼容的解析。
 */
export async function generateImageViaChatCompletions({ prompt, apiKey, baseUrl, model }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/chat/completions`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: prompt }]
                }
            ]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '生成失败');
    }

    const data = await response.json();
    const extracted = await extractBase64ImageFromChat(data);
    if (!extracted) throw new Error('生成失败：未从响应中解析到图片数据');
    return extracted; // { mimeType, base64 }
}

export async function editImageViaChatCompletions({ imageDataUrl, maskDataUrl, prompt, apiKey, baseUrl, model }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/chat/completions`;

    // 先上传为 URL，避免把超大 base64 塞进 JSON 导致连接被网关断开
    const uploadedImage = await uploadFile({
        dataUrl: imageDataUrl,
        apiKey,
        baseUrl,
        filename: 'image.png',
    });
    const uploadedMask = await uploadFile({
        dataUrl: maskDataUrl,
        apiKey,
        baseUrl,
        filename: 'mask.png',
    });

    const instruction =
        `你将收到两张图片：第一张为原图，第二张为遮罩。\n` +
        `编辑规则（必须严格遵守）：\n` +
        `1) 只允许修改遮罩中【白色】区域的内容；遮罩中【黑色】区域必须与原图保持完全一致（像素级不变）。\n` +
        `2) 不要改动黑色区域的任何内容：包括但不限于构图、背景、人物/物体位置、轮廓、大小、颜色、光照、阴影、清晰度、对比度、风格、文字水印等。\n` +
        `3) 白色区域的边缘要自然融合，避免溢出到黑色区域；不要产生新的改动区域或额外元素。\n` +
        `4) 如果指令与“仅修改白色区域/黑色区域完全不变”冲突，优先保证黑色区域不变。\n` +
        `编辑要求：\n${prompt}\n` +
        `仅输出一张编辑后的图片，不要输出任何解释文字。`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: instruction },
                        { type: 'image_url', image_url: { url: uploadedImage.url } },
                        { type: 'image_url', image_url: { url: uploadedMask.url } },
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '编辑失败');
    }

    const data = await response.json();
    const extracted = await extractBase64ImageFromChat(data);
    if (!extracted) throw new Error('编辑失败：未从响应中解析到图片数据');
    return extracted; // { mimeType, base64 }
}

/**
 * Call the Image Edit API using OpenAI-compatible format
 * According to API docs: /v1/images/edits with multipart/form-data
 * Sends image and mask as separate file uploads
 */
export async function editImage({ imageBase64, maskBase64, prompt, apiKey, baseUrl, model, imageMimeType = 'image/png' }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/images/edits`;

    // Create FormData
    const formData = new FormData();
    formData.append('model', model || 'nano-banana');
    formData.append('prompt', prompt);

    // Append image files
    const imageBlob = base64ToBlob(imageBase64, imageMimeType);
    const maskBlob = base64ToBlob(maskBase64);

    formData.append('image', imageBlob, 'image.png');
    formData.append('image', maskBlob, 'mask.png');

    formData.append('response_format', 'b64_json');

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
            // Don't set Content-Type - browser will set it with boundary
        },
        body: formData
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '编辑失败');
    }

    const data = await response.json();
    // Return base64 image data
    return data.data?.[0]?.b64_json;
}

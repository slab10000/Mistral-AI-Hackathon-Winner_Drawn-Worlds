import { callVision } from './mistral';

const VISION_TO_AGE_PROMPT = `You are recognizing a child's handwritten age from a drawing.

Return EXACTLY one token and nothing else:
- A single integer from 3 to 12 if the age is clearly visible
- UNRECOGNIZED if you are not sure or cannot read a clear age

STRICT OUTPUT RULES:
- Output must be either: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, or UNRECOGNIZED
- No JSON
- No markdown
- No explanation
- No extra words
- No punctuation`;

const VISION_TO_AGE_FALLBACK_PROMPT = `Read the main handwritten age number in this image.

Return exactly one token:
- One integer from 3 to 12, or
- UNRECOGNIZED if uncertain.

No extra text.`;

const WORD_TO_AGE: Record<string, number> = {
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  ELEVEN: 11,
  TWELVE: 12,
};

function parseAgeToken(raw: string): number | null {
  const cleaned = raw.trim().replace(/^```[a-z]*\s*|```$/gi, '').trim();
  const upper = cleaned.toUpperCase();

  if (!upper || upper.includes('UNRECOGNIZED')) return null;

  const direct = upper.match(/^\D*(\d{1,2})\D*$/);
  if (direct) {
    const value = Number(direct[1]);
    return value >= 3 && value <= 12 ? value : null;
  }

  const numericMatches = Array.from(upper.matchAll(/\b(\d{1,2})\b/g)).map(m => Number(m[1]));
  const wordMatches = Object.entries(WORD_TO_AGE)
    .filter(([word]) => new RegExp(`\\b${word}\\b`).test(upper))
    .map(([, age]) => age);

  const candidates = [...numericMatches, ...wordMatches].filter(n => Number.isInteger(n) && n >= 3 && n <= 12);
  const unique = Array.from(new Set(candidates));
  return unique.length === 1 ? unique[0] : null;
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load canvas image for age recognition'));
    img.src = dataUrl;
  });
}

function findInkBounds(data: Uint8ClampedArray, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < 245 || g < 245 || b < 245) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function thresholdCanvas(canvas: HTMLCanvasElement, threshold: number): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = gray < threshold ? 0 : 255;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

async function buildAgeRecognitionVariants(imageDataUrl: string): Promise<string[]> {
  const image = await loadImage(imageDataUrl);

  const src = document.createElement('canvas');
  src.width = image.width;
  src.height = image.height;
  const sctx = src.getContext('2d');
  if (!sctx) return [imageDataUrl];

  sctx.fillStyle = '#FFFFFF';
  sctx.fillRect(0, 0, src.width, src.height);
  sctx.drawImage(image, 0, 0);

  const srcData = sctx.getImageData(0, 0, src.width, src.height);
  const bounds = findInkBounds(srcData.data, src.width, src.height);

  if (!bounds) return [imageDataUrl];

  const pad = Math.max(18, Math.round(Math.max(bounds.w, bounds.h) * 0.08));
  const cropX = Math.max(0, bounds.x - pad);
  const cropY = Math.max(0, bounds.y - pad);
  const cropW = Math.min(src.width - cropX, bounds.w + pad * 2);
  const cropH = Math.min(src.height - cropY, bounds.h + pad * 2);

  const normalized = document.createElement('canvas');
  normalized.width = 512;
  normalized.height = 512;
  const nctx = normalized.getContext('2d');
  if (!nctx) return [imageDataUrl];

  nctx.fillStyle = '#FFFFFF';
  nctx.fillRect(0, 0, normalized.width, normalized.height);

  const safeW = Math.max(1, cropW);
  const safeH = Math.max(1, cropH);
  const targetPad = 56;
  const scale = Math.min((normalized.width - targetPad * 2) / safeW, (normalized.height - targetPad * 2) / safeH);
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  const dx = (normalized.width - drawW) / 2;
  const dy = (normalized.height - drawH) / 2;

  nctx.drawImage(src, cropX, cropY, safeW, safeH, dx, dy, drawW, drawH);

  const highContrast = document.createElement('canvas');
  highContrast.width = normalized.width;
  highContrast.height = normalized.height;
  const hcctx = highContrast.getContext('2d');
  if (!hcctx) return [imageDataUrl, normalized.toDataURL('image/png')];

  hcctx.drawImage(normalized, 0, 0);

  const strongThreshold = thresholdCanvas(highContrast, 215);
  const softThresholdCanvas = document.createElement('canvas');
  softThresholdCanvas.width = normalized.width;
  softThresholdCanvas.height = normalized.height;
  const stctx = softThresholdCanvas.getContext('2d');
  if (!stctx) return [imageDataUrl, normalized.toDataURL('image/png'), strongThreshold];

  stctx.drawImage(normalized, 0, 0);
  const softThreshold = thresholdCanvas(softThresholdCanvas, 235);

  return [strongThreshold, softThreshold, normalized.toDataURL('image/png'), imageDataUrl];
}

async function recognizeAgeWithPrompt(
  imageDataUrl: string,
  prompt: string,
  apiKey: string,
): Promise<number | null> {
  try {
    const raw = await callVision(imageDataUrl, prompt, apiKey, { temperature: 0, maxTokens: 20 });
    return parseAgeToken(raw);
  } catch {
    return null;
  }
}

/**
 * Recognize kid age from a canvas snapshot.
 * Returns a number in [3, 12] or null when unrecognized.
 */
export async function visionToAge(
  imageDataUrl: string,
  apiKey: string,
): Promise<number | null> {
  const variants = await buildAgeRecognitionVariants(imageDataUrl).catch(() => [imageDataUrl]);
  const votes: number[] = [];

  // Try a strict pass first on the best preprocessed variant.
  const first = await recognizeAgeWithPrompt(variants[0], VISION_TO_AGE_PROMPT, apiKey);
  if (first !== null) votes.push(first);

  // Fallback passes for ambiguous handwriting.
  for (const variant of variants.slice(1, 3)) {
    const strict = await recognizeAgeWithPrompt(variant, VISION_TO_AGE_PROMPT, apiKey);
    if (strict !== null) votes.push(strict);
  }

  if (votes.length === 0) {
    const fallback = await recognizeAgeWithPrompt(variants[0], VISION_TO_AGE_FALLBACK_PROMPT, apiKey);
    if (fallback !== null) votes.push(fallback);
  }

  if (votes.length === 0) return null;

  const counts = new Map<number, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);

  let bestAge: number | null = null;
  let bestCount = 0;

  for (const [age, count] of counts.entries()) {
    if (count > bestCount) {
      bestAge = age;
      bestCount = count;
    }
  }

  if (bestAge === null) return null;
  const tied = Array.from(counts.values()).filter(c => c === bestCount).length > 1;
  return tied ? null : bestAge;
}

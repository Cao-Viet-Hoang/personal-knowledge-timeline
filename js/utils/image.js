/**
 * Image compression & management utility.
 * Compresses images client-side using Canvas API before storing as base64.
 * Supports: file upload, clipboard paste, drag & drop.
 *
 * Two compression profiles:
 *   - "photo"      → aggressive resize + lossy compression (small file)
 *   - "screenshot"  → higher resolution + higher quality (preserve text clarity)
 */

// ── Config ─────────────────────────────────────────────

const PROFILES = {
  photo: {
    maxWidth: 1024,
    maxHeight: 768,
    quality: 0.72,
    preferredFormat: "image/webp",
    fallbackFormat: "image/jpeg",
  },
  screenshot: {
    maxWidth: 1440,
    maxHeight: 1080,
    quality: 0.88,
    preferredFormat: "image/webp",
    fallbackFormat: "image/png",   // PNG keeps text crisp when WebP unavailable
  },
};

const IMAGE_CONFIG = {
  /** Per-image soft limit in bytes (base64) — warn beyond this */
  warnPerImageBytes: 150 * 1024,       // 150 KB
  /** Total images data per entry — warn beyond this */
  warnTotalEntryBytes: 700 * 1024,     // 700 KB
  /** Hard limit per entry (Firestore doc limit is 1 MiB; leave room for other fields) */
  hardLimitEntryBytes: 900 * 1024,     // 900 KB
  maxImagesPerEntry: 10,
  defaultProfile: "photo",
};

// ── Format detection ───────────────────────────────────

let _supportsWebP = null;

function supportsWebPBlob() {
  if (_supportsWebP !== null) return Promise.resolve(_supportsWebP);
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    c.toBlob(
      (blob) => {
        _supportsWebP = blob !== null && blob.size > 0;
        resolve(_supportsWebP);
      },
      "image/webp",
      0.5
    );
  });
}

// ── Core compression ───────────────────────────────────

/**
 * Heuristic: is this image likely a screenshot rather than a photo?
 * Checks pixel data for large flat-color regions (typical of UI/text).
 * @param {HTMLCanvasElement} canvas
 * @param {number} w
 * @param {number} h
 * @returns {boolean}
 */
function looksLikeScreenshot(canvas, w, h) {
  const ctx = canvas.getContext("2d");
  // Sample a horizontal strip at ~40% height (usually inside content area)
  const sampleY = Math.round(h * 0.4);
  const sampleW = Math.min(w, 200);
  const data = ctx.getImageData(0, sampleY, sampleW, 1).data;

  // Count how many adjacent pixels have identical color
  let flatRuns = 0;
  for (let i = 4; i < data.length; i += 4) {
    if (
      data[i] === data[i - 4] &&
      data[i + 1] === data[i - 3] &&
      data[i + 2] === data[i - 2]
    ) {
      flatRuns++;
    }
  }

  // If >60% of adjacent pixels are identical → likely screenshot / UI
  const ratio = flatRuns / (sampleW - 1);
  return ratio > 0.6;
}

/**
 * Compress an image File/Blob → base64 data URL string.
 * @param {File|Blob} file
 * @param {"photo"|"screenshot"|"auto"} profile - compression profile
 * @returns {Promise<{dataUrl: string, sizeBytes: number, width: number, height: number, profile: string}>}
 */
export async function compressImage(file, profile = "auto") {
  const bitmap = await createImageBitmap(file);
  const { width: ow, height: oh } = bitmap;

  // Pre-draw at original size for screenshot detection if needed
  let detectedProfile = profile;
  if (profile === "auto") {
    // Quick heuristic: clipboard images (no name) from paste are usually screenshots
    const isPaste = !file.name || file.name === "image.png";
    // PNG sources are more likely screenshots than photos
    const isPng = file.type === "image/png";
    if (isPaste || isPng) {
      // Run pixel-level check
      const tmpCanvas = document.createElement("canvas");
      const sampleW = Math.min(ow, 200);
      const sampleH = Math.min(oh, 200);
      tmpCanvas.width = sampleW;
      tmpCanvas.height = sampleH;
      const tmpCtx = tmpCanvas.getContext("2d");
      tmpCtx.drawImage(bitmap, 0, 0, sampleW, sampleH);
      detectedProfile = looksLikeScreenshot(tmpCanvas, sampleW, sampleH) ? "screenshot" : "photo";
    } else {
      detectedProfile = "photo";
    }
  }

  const cfg = PROFILES[detectedProfile] || PROFILES.photo;

  // Calculate target dimensions (fit inside max bounds, keep aspect ratio)
  let w = ow;
  let h = oh;
  if (w > cfg.maxWidth) {
    h = Math.round(h * (cfg.maxWidth / w));
    w = cfg.maxWidth;
  }
  if (h > cfg.maxHeight) {
    w = Math.round(w * (cfg.maxHeight / h));
    h = cfg.maxHeight;
  }

  // Draw onto canvas
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Use high-quality resampling for text clarity
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Choose format
  const useWebP = await supportsWebPBlob();
  const mimeType = useWebP ? cfg.preferredFormat : cfg.fallbackFormat;

  // Convert to blob
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, mimeType, cfg.quality)
  );

  // Convert blob to base64 data URL
  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    sizeBytes: blob.size,
    width: w,
    height: h,
    profile: detectedProfile,
  };
}

/**
 * Compress multiple files in sequence.
 * @param {File[]|FileList} files
 * @param {"photo"|"screenshot"|"auto"} profile
 * @returns {Promise<Array<{dataUrl, sizeBytes, width, height, profile}>>}
 */
export async function compressImages(files, profile = "auto") {
  const results = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    results.push(await compressImage(file, profile));
  }
  return results;
}

// ── Size checks ────────────────────────────────────────

/**
 * Estimate total base64 size of images array.
 * @param {Array<{dataUrl: string}>} images
 * @returns {number} total bytes
 */
export function totalImagesSize(images) {
  return images.reduce((sum, img) => sum + (img.dataUrl?.length || 0), 0);
}

/**
 * Check images against limits and return warning/error messages.
 * @param {Array<{dataUrl: string, sizeBytes: number}>} images
 * @returns {{ ok: boolean, level: 'ok'|'warn'|'error', message: string, totalBytes: number }}
 */
export function checkImageLimits(images) {
  const totalBytes = totalImagesSize(images);

  if (images.length > IMAGE_CONFIG.maxImagesPerEntry) {
    return {
      ok: false,
      level: "error",
      message: `Tối đa ${IMAGE_CONFIG.maxImagesPerEntry} ảnh mỗi entry. Hiện có ${images.length} ảnh.`,
      totalBytes,
    };
  }

  if (totalBytes > IMAGE_CONFIG.hardLimitEntryBytes) {
    return {
      ok: false,
      level: "error",
      message: `Tổng dung lượng ảnh (${formatBytes(totalBytes)}) vượt giới hạn ${formatBytes(IMAGE_CONFIG.hardLimitEntryBytes)}. Hãy xóa bớt ảnh.`,
      totalBytes,
    };
  }

  if (totalBytes > IMAGE_CONFIG.warnTotalEntryBytes) {
    return {
      ok: true,
      level: "warn",
      message: `Dung lượng ảnh khá lớn (${formatBytes(totalBytes)}). Cân nhắc xóa bớt để tiết kiệm dung lượng.`,
      totalBytes,
    };
  }

  return { ok: true, level: "ok", message: "", totalBytes };
}

// ── Clipboard (paste) support ──────────────────────────

/**
 * Extract image files from a ClipboardEvent.
 * @param {ClipboardEvent} event
 * @returns {File[]}
 */
export function getImagesFromClipboard(event) {
  const items = event.clipboardData?.items;
  if (!items) return [];
  const files = [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/**
 * Extract image files from a DragEvent.
 * @param {DragEvent} event
 * @returns {File[]}
 */
export function getImagesFromDrop(event) {
  const dt = event.dataTransfer;
  if (!dt?.files) return [];
  return [...dt.files].filter((f) => f.type.startsWith("image/"));
}

// ── Helpers ────────────────────────────────────────────

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export { IMAGE_CONFIG, PROFILES };

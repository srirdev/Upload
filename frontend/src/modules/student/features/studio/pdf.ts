/**
 * Real-document rendering for the Print Preview Studio (PDF.js, loaded on demand).
 *
 * Memory: a large PDF is never rasterised all at once. Pages render on request (only the visible spread,
 * neighbours and on-screen thumbnails ask), at most two at a time, into an LRU cache of image URLs that
 * revokes what it evicts. At most a few parsed documents are kept; evicted ones are destroyed.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { api, ApiError } from "@/shared/api/client";

export interface LoadedDoc {
  kind: "pdf" | "image";
  pages: number;
  /** Page size in PDF points (1/72 in), portrait/landscape detection and aspect ratio. */
  size: (page: number) => Promise<{ w: number; h: number }>;
  /** Object URL of the page rendered at roughly `cssWidth` CSS pixels wide (cached). */
  render: (page: number, cssWidth: number) => Promise<string>;
}

/*
 * The "legacy" build ships polyfills (Map#getOrInsertComputed, Math.sumPrecise, ...) that the modern build
 * expects natively; without them PDF.js stalls in browsers a few versions old (incl. embedded editors).
 */
let pdfjs: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
function loadPdfJs() {
  pdfjs ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  pdfjs.catch(() => (pdfjs = null)); // allow a retry after a failed load
  return pdfjs;
}

/** Rejects if `p` takes longer than `ms` (a stalled worker must surface as an error, not an endless spinner). */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/* ---- LRU of rendered page images ---------------------------------------------------------------- */
const MAX_IMAGES = 48;
const images = new Map<string, Promise<string>>();
function cached(key: string, make: () => Promise<string>): Promise<string> {
  const hit = images.get(key);
  if (hit) {
    images.delete(key); // refresh recency
    images.set(key, hit);
    return hit;
  }
  const p = make();
  images.set(key, p);
  p.catch(() => images.delete(key));
  while (images.size > MAX_IMAGES) {
    const [oldKey, old] = images.entries().next().value!;
    images.delete(oldKey);
    old.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
  }
  return p;
}

/* ---- Two-at-a-time render queue --------------------------------------------------------------- */
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await job();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/* ---- Documents ----------------------------------------------------------------------------------- */
const MAX_DOCS = 3;
const docs = new Map<string, Promise<LoadedDoc>>();

/** Fetches the bytes through the API (owner-only, same origin) and opens them. `preview` = converted PDF. */
export function openDocument(orderId: string, docId: string, contentType: string, preview: boolean): Promise<LoadedDoc> {
  const key = `${docId}:${preview ? "p" : "o"}`;
  const hit = docs.get(key);
  if (hit) return hit;
  const p = (async (): Promise<LoadedDoc> => {
    const blob = await fetchBytes(orderId, docId, preview);
    return contentType.startsWith("image/") && !preview ? openImage(key, blob) : openPdf(key, blob);
  })();
  docs.set(key, p);
  p.catch(() => docs.delete(key));
  while (docs.size > MAX_DOCS) {
    const [oldKey, old] = docs.entries().next().value!;
    docs.delete(oldKey);
    old.then((d) => (d as LoadedDoc & { destroy?: () => void }).destroy?.()).catch(() => undefined);
  }
  return p;
}

/**
 * The document bytes via the same-origin `/file` route. If that route isn't there (an API started before it
 * existed answers a bare "Not Found"), fall back to the short-lived signed URL the API has always offered.
 */
async function fetchBytes(orderId: string, docId: string, preview: boolean): Promise<Blob> {
  const q = preview ? "?preview=true" : "";
  try {
    return await api<Blob>(`/orders/${orderId}/documents/${docId}/file${q}`, { blob: true });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404 && e.message === "Not Found")) throw e;
  }
  const { url } = await api<{ url: string }>(`/orders/${orderId}/documents/${docId}/url${q}`);
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, "We couldn't download this document for preview.");
  return res.blob();
}

async function openPdf(key: string, blob: Blob): Promise<LoadedDoc> {
  const lib = await withTimeout(loadPdfJs(), 30_000, "The preview engine couldn't load. Check your connection and try again.");
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  let pdf: PDFDocumentProxy;
  try {
    pdf = await withTimeout(task.promise, 30_000, "The preview engine didn't respond. Check your connection and try again.");
  } catch (e) {
    void task.destroy();
    throw e;
  }
  const sizes = new Map<number, Promise<{ w: number; h: number }>>();
  const size = (n: number) => {
    if (!sizes.has(n)) {
      sizes.set(n, pdf.getPage(n).then((pg) => {
        const v = pg.getViewport({ scale: 1 });
        return { w: v.width, h: v.height };
      }));
    }
    return sizes.get(n)!;
  };
  return {
    kind: "pdf",
    pages: pdf.numPages,
    size,
    destroy: () => void task.destroy(),
    render: (n, cssWidth) => {
      const bucket = Math.min(1600, Math.max(120, Math.ceil(cssWidth / 120) * 120)); // reuse renders across small zoom steps
      return cached(`${key}:${n}:${bucket}`, () =>
        limited(async () => {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale: (bucket * dpr) / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          page.cleanup();
          const out = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Render failed"))), "image/jpeg", 0.9));
          canvas.width = canvas.height = 0; // release the bitmap now
          return URL.createObjectURL(out);
        }),
      );
    },
  } as LoadedDoc;
}

async function openImage(key: string, blob: Blob): Promise<LoadedDoc> {
  const url = URL.createObjectURL(blob);
  const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => rej(new Error("This image can't be displayed"));
    img.src = url;
  });
  return {
    kind: "image",
    pages: 1,
    size: async () => dims,
    destroy: () => URL.revokeObjectURL(url),
    render: async () => url,
  } as LoadedDoc;
}

/** Test hook: forget everything (revokes cached URLs). */
export function resetPdfCaches() {
  images.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => undefined));
  images.clear();
  docs.clear();
}

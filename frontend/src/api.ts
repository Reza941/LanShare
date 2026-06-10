import type { Session, ShareBundle } from "./types";

const STORAGE_KEY = "lanshare_session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function headers(token?: string): HeadersInit {
  return token ? { "X-Session-Token": token } : {};
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.message ?? "خطایی رخ داد.";
  } catch {
    return "خطایی رخ داد.";
  }
}

export async function join(displayName: string): Promise<Session> {
  const res = await fetch("/api/session/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  const session: Session = {
    userId: data.userId,
    token: data.token,
    displayName: data.displayName,
  };
  saveSession(session);
  return session;
}

export async function validateSession(token: string): Promise<Session | null> {
  const res = await fetch("/api/session/me", { headers: headers(token) });
  if (!res.ok) return null;
  const data = await res.json();
  const existing = loadSession();
  const session: Session = {
    userId: data.id,
    token,
    displayName: data.displayName,
  };
  saveSession(session);
  return session;
}

export async function leave(token: string) {
  await fetch("/api/session/leave", {
    method: "POST",
    headers: headers(token),
  });
  clearSession();
}

function mapBundle(x: Record<string, unknown>): ShareBundle {
  const files = (x.files as Record<string, unknown>[] | undefined)?.map((f) => ({
    id: String(f.id),
    originalFileName: String(f.originalFileName),
    sizeBytes: Number(f.sizeBytes),
    contentType: String(f.contentType),
    relativePath: f.relativePath ? String(f.relativePath) : undefined,
  })) ?? [];

  return {
    id: String(x.id),
    title: String(x.title),
    authorName: String(x.authorName),
    authorId: String(x.authorId),
    createdAt: String(x.createdAt),
    fileCount: Number(x.fileCount),
    totalSizeBytes: Number(x.totalSizeBytes),
    files,
  };
}

export async function fetchShares(): Promise<ShareBundle[]> {
  const res = await fetch("/api/shares?limit=100");
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.map((x: Record<string, unknown>) => mapBundle(x));
}

export async function createShare(
  token: string,
  title: string,
  files: File[],
  paths: (string | null)[],
  onProgress?: (pct: number) => void
): Promise<string> {
  const form = new FormData();
  form.append("title", title);
  files.forEach((f, i) => {
    form.append("files", f);
    form.append("paths", paths[i] ?? "");
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/shares");
    xhr.setRequestHeader("X-Session-Token", token);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.message ?? "اشتراک‌گذاری شد");
        } catch {
          resolve("اشتراک‌گذاری شد");
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.message ?? "ارسال ناموفق"));
        } catch {
          reject(new Error("ارسال ناموفق"));
        }
      }
    };

    xhr.onerror = () => reject(new Error("اتصال قطع شد"));
    xhr.send(form);
  });
}

export async function downloadAll(bundle: ShareBundle): Promise<void> {
  if (bundle.files.length === 0) throw new Error("فایلی برای دانلود نیست.");

  const res = await fetch(`/api/shares/${bundle.id}/download-zip`);
  if (!res.ok) throw new Error(await parseError(res));

  const blob = await res.blob();
  triggerDownload(blob, `${bundle.title}.zip`);
}

export async function downloadAllFiles(
  bundle: ShareBundle,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (bundle.files.length === 0) throw new Error("فایلی برای دانلود نیست.");

  const total = bundle.files.length;
  for (let i = 0; i < total; i++) {
    const f = bundle.files[i];
    onProgress?.(i + 1, total);
    const blob = await fetchFileBlob(f.id);
    triggerDownload(blob, f.originalFileName);
    if (i < total - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  onProgress?.(total, total);
}

export async function addFilesToShare(
  token: string,
  bundleId: string,
  files: File[],
  paths: (string | null)[],
  onProgress?: (pct: number) => void
): Promise<ShareBundle> {
  const form = new FormData();
  files.forEach((f, i) => {
    form.append("files", f);
    form.append("paths", paths[i] ?? "");
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/shares/${bundleId}/files`);
    xhr.setRequestHeader("X-Session-Token", token);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(mapBundle(JSON.parse(xhr.responseText)));
        } catch {
          reject(new Error("خطا در پردازش پاسخ"));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.message ?? "افزودن فایل ناموفق"));
        } catch {
          reject(new Error("افزودن فایل ناموفق"));
        }
      }
    };

    xhr.onerror = () => reject(new Error("اتصال قطع شد"));
    xhr.send(form);
  });
}

export async function deleteFile(token: string, fileId: string): Promise<ShareBundle> {
  const res = await fetch(`/api/shares/files/${fileId}`, {
    method: "DELETE",
    headers: { "X-Session-Token": token },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapBundle(await res.json());
}

export async function deleteShare(token: string, bundleId: string): Promise<void> {
  const res = await fetch(`/api/shares/${bundleId}`, {
    method: "DELETE",
    headers: { "X-Session-Token": token },
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchFileBlob(fileId: string): Promise<Blob> {
  const res = await fetch(`/api/shares/files/${fileId}/download`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.blob();
}

export async function downloadSingleFile(fileId: string, fileName: string) {
  const blob = await fetchFileBlob(fileId);
  triggerDownload(blob, fileName);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function postInstruction(text: string): Promise<void> {
  await fetch("/api/console", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function getPending(): Promise<{ instruction?: string; response?: string }> {
  const res = await fetch("/api/console/pending");
  if (!res.ok) return {};
  return res.json();
}

export async function getResponse(): Promise<{ text?: string }> {
  const res = await fetch("/api/console/response");
  if (!res.ok) return {};
  return res.json();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} گیگابایت`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "همین الان";
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  return d.toLocaleDateString("fa-IR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

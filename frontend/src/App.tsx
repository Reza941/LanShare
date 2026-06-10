import { useCallback, useEffect, useRef, useState } from "react";
import {
  addFilesToShare,
  clearSession,
  createShare,
  deleteFile,
  deleteShare,
  downloadAll,
  downloadAllFiles,
  downloadSingleFile,
  fetchFileBlob,
  fetchShares,
  formatSize,
  formatTime,
  getPending,
  join,
  leave,
  loadSession,
  postInstruction,
  validateSession,
} from "./api";
import { createHub } from "./signalr";
import type { Session, ShareBundle, ShareFile } from "./types";

function fileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼";
  if (contentType === "application/pdf") return "📄";
  if (contentType.startsWith("video/")) return "🎬";
  if (contentType.startsWith("audio/")) return "🎵";
  if (contentType.includes("zip") || contentType.includes("rar") || contentType.includes("tar") || contentType.includes("7z") || contentType.includes("gzip"))
    return "📦";
  if (contentType.startsWith("text/")) return "📝";
  if (contentType.includes("word") || contentType.includes("document") || contentType.includes("sheet") || contentType.includes("presentation"))
    return "📝";
  if (contentType.includes("json") || contentType.includes("xml") || contentType.includes("javascript"))
    return "📝";
  return "📎";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [shares, setShares] = useState<ShareBundle[]>([]);
  const [sharesLoading, setSharesLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ bundleId: string; files: ShareFile[]; index: number } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [folderMode, setFolderMode] = useState(false);
  const [addFileBundleId, setAddFileBundleId] = useState<string | null>(null);
  const [addFileFolderMode, setAddFileFolderMode] = useState(false);
  const [addFileUploadPct, setAddFileUploadPct] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; action: () => void } | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleResponse, setConsoleResponse] = useState<string | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const addFolderRef = useRef<HTMLInputElement>(null);
  const hubRef = useRef<ReturnType<typeof createHub> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastKey((k) => k + 1);
    setTimeout(() => setToast(""), 4000);
  }, []);

  const refreshShares = useCallback(async () => {
    setSharesLoading(true);
    try {
      const list = await fetchShares();
      setShares(list);
    } finally {
      setSharesLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = loadSession();
      if (saved) {
        const valid = await validateSession(saved.token);
        if (valid) {
          setSession(valid);
          setBooting(false);
          return;
        }
        clearSession();
      }
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const hub = createHub(session.token, {
      onShareCreated: (share) => {
        if (!cancelled) {
          setShares((prev) => [share, ...prev.filter((s) => s.id !== share.id)]);
          showToast(`محتوای جدید: ${share.title}`);
          if (navigator.vibrate) navigator.vibrate(150);
        }
      },
      onShareDeleted: (shareId) => {
        if (!cancelled) {
          setShares((prev) => prev.filter((s) => s.id !== shareId));
        }
      },
      onShareUpdated: (share) => {
        if (!cancelled) {
          setShares((prev) => prev.map((s) => (s.id === share.id ? share : s)));
        }
      },
      onDisconnected: () => {
        if (!cancelled) setConnected(false);
      },
      onReconnected: () => {
        if (!cancelled) {
          setConnected(true);
          refreshShares().catch(() => {});
        }
      },
    });

    hubRef.current = hub;

    (async () => {
      try {
        await hub.start();
        if (cancelled) return;
        setConnected(true);
        await refreshShares();
      } catch {
        if (!cancelled) setError("اتصال به سرور برقرار نشد.");
      }
    })();

    return () => {
      cancelled = true;
      hub.stop();
    };
  }, [session, refreshShares, showToast]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setJoining(true);
    try {
      const s = await join(nameInput.trim());
      setSession(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (session) {
      await hubRef.current?.stop();
      await leave(session.token).catch(() => {});
    }
    clearSession();
    setSession(null);
    setShares([]);
  };

  const handleFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list) setSelectedFiles(Array.from(list));
    e.target.value = "";
  };

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || selectedFiles.length === 0) return;

    setUploadPct(0);
    try {
      const paths = selectedFiles.map((f) =>
        "webkitRelativePath" in f && f.webkitRelativePath
          ? f.webkitRelativePath.replace(/\\/g, "/")
          : null
      );
      const msg = await createShare(
        session.token,
        shareTitle.trim(),
        selectedFiles,
        paths,
        setUploadPct
      );
      showToast(msg);
      setShowModal(false);
      setShareTitle("");
      setSelectedFiles([]);
      setFolderMode(false);
      await refreshShares();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "ارسال ناموفق");
    } finally {
      setUploadPct(null);
    }
  };

  const handleDownloadZip = async (bundle: ShareBundle) => {
    setDownloadProgress("ZIP");
    try {
      await downloadAll(bundle);
      showToast("فایل ZIP با موفقیت دانلود شد");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "دانلود ناموفق");
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleDownloadFiles = async (bundle: ShareBundle) => {
    setDownloadProgress("...");
    try {
      await downloadAllFiles(bundle, (cur, total) => {
        setDownloadProgress(`${cur}/${total}`);
      });
      showToast(`${bundle.fileCount} فایل دانلود شد`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "دانلود ناموفق");
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleAddFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list || list.length === 0 || !session || !addFileBundleId) return;

    const files = Array.from(list);
    const paths = files.map((f) =>
      "webkitRelativePath" in f && f.webkitRelativePath
        ? f.webkitRelativePath.replace(/\\/g, "/")
        : null
    );

    setAddFileUploadPct(0);
    try {
      const updated = await addFilesToShare(session.token, addFileBundleId, files, paths, (pct) => setAddFileUploadPct(pct));
      setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`${files.length} فایل اضافه شد`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "افزودن فایل ناموفق");
    } finally {
      setAddFileUploadPct(null);
      setAddFileBundleId(null);
    }
  };

  const loadPreview = useCallback(async (files: ShareFile[], idx: number) => {
    setPreviewLoading(true);
    try {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
      const blob = await fetchFileBlob(files[idx].id);
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } catch {
      showToast("خطا در بارگذاری پیش‌نمایش");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewBlobUrl, showToast]);

  const openPreview = useCallback((files: ShareFile[], idx: number) => {
    setPreview({ bundleId: "", files, index: idx });
    loadPreview(files, idx);
  }, [loadPreview]);

  const closePreview = useCallback(() => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreview(null);
    setPreviewBlobUrl(null);
  }, [previewBlobUrl]);

  const navPreview = useCallback((dir: -1 | 1) => {
    if (!preview) return;
    const newIdx = preview.index + dir;
    if (newIdx < 0 || newIdx >= preview.files.length) return;
    setPreview((p) => p ? { ...p, index: newIdx } : null);
    loadPreview(preview.files, newIdx);
  }, [preview, loadPreview]);

  useEffect(() => {
    if (!preview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") navPreview(1);
      else if (e.key === "ArrowLeft") navPreview(-1);
      else if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [preview, navPreview, closePreview]);

  const handleDeleteFile = async (fileId: string, bundle: ShareBundle) => {
    if (!session) return;
    setConfirmModal({
      message: "این فایل حذف شود؟",
      action: async () => {
        try {
          const updated = await deleteFile(session.token, fileId);
          setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          showToast("فایل حذف شد");
        } catch (err) {
          showToast(err instanceof Error ? err.message : "حذف ناموفق");
        }
      },
    });
  };

  const handleDeleteShare = async (bundle: ShareBundle) => {
    if (!session) return;
    setConfirmModal({
      message: `آیا از حذف «${bundle.title}» اطمینان دارید؟`,
      action: async () => {
        try {
          setDownloadProgress("...");
          await deleteShare(session.token, bundle.id);
          setShares((prev) => prev.filter((s) => s.id !== bundle.id));
          showToast(`«${bundle.title}» حذف شد`);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "حذف ناموفق");
        } finally {
          setDownloadProgress(null);
        }
      },
    });
  };

  const handleConsoleSubmit = async () => {
    if (!consoleInput.trim() || consoleLoading) return;
    setConsoleLoading(true);
    setConsoleResponse(null);
    try {
      await postInstruction(consoleInput.trim());
      setConsoleInput("");
      setConsoleLoading(false);
      showToast("دستور ارسال شد");
    } catch {
      setConsoleResponse("خطا در ارسال دستور");
      setConsoleLoading(false);
    }
  };

  if (booting) {
    return (
      <div className="page login-page">
        <p className="loading-text">در حال بارگذاری...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page login-page">
        <div className="login-card">
          <div className="logo">📂</div>
          <h1>فضای اشتراک فایل</h1>
          <p className="subtitle">نام خود را یک بار وارد کنید — همه فایل‌های اشتراک‌گذاری‌شده را می‌بینید</p>
          <form onSubmit={handleJoin}>
            <label htmlFor="name">نام شما</label>
            <input
              id="name"
              type="text"
              placeholder="مثلاً: علی"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoComplete="off"
              maxLength={64}
              required
              minLength={2}
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={joining}>
              {joining ? "در حال ورود..." : "ورود به فضای مشترک"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page app-page">
      <header className="header">
        <div>
          <h1>فضای مشترک</h1>
          <span className={`status ${connected ? "online" : "offline"}`}>
            {session.displayName} · {connected ? "● آنلاین" : "○ در حال اتصال..."}
          </span>
        </div>
        <button type="button" className="btn ghost small" onClick={handleLeave}>
          تغییر نام
        </button>
      </header>

      {!connected && (
        <div className="offline-banner">
          <span>⚠ ارتباط با سرور قطع شد</span>
          <button
            type="button"
            className="btn ghost tiny"
            style={{ color: "inherit", borderColor: "rgba(255,255,255,0.4)", flexShrink: 0 }}
            onClick={async () => {
              try { await hubRef.current?.start(); } catch {}
            }}
          >
            تلاش مجدد
          </button>
        </div>
      )}

      <main className="main">
        {shares.length === 0 && !sharesLoading ? (
          <div className="empty">
            <div className="empty-icon">📂</div>
            <p>هنوز محتوایی اشتراک گذاشته نشده.</p>
            <p>اولین نفری باشید که فایل می‌گذارد!</p>
            <button type="button" className="btn primary empty-btn" onClick={() => setShowModal(true)}>
              اولین اشتراک را ایجاد کنید
            </button>
          </div>
        ) : shares.length === 0 && sharesLoading ? (
          <ul className="share-list">
            {[1, 2, 3].map((i) => (
              <li key={i} className="share-card skeleton-card">
                <div className="skeleton-line w-60" />
                <div className="skeleton-line w-40" />
                <div className="skeleton-line w-80" />
                <div className="skeleton-actions">
                  <div className="skeleton-btn" />
                  <div className="skeleton-btn" />
                  <div className="skeleton-icon" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.id} className={`share-card${s.authorId === session.userId ? " own-share" : ""}`}>
                <div className="share-header">
                  <div>
                    <h2>
                      {s.title}
                      {s.authorId === session.userId && <span className="own-badge">مال شما</span>}
                    </h2>
                    <p className="share-meta">
                      {s.authorName} · {formatTime(s.createdAt)} · {s.fileCount} فایل · {formatSize(s.totalSizeBytes)}
                    </p>
                  </div>
                  <div className="share-actions">
                    <button
                      type="button"
                      className="btn primary small-btn zip-btn"
                      onClick={() => handleDownloadZip(s)}
                      disabled={downloadProgress !== null}
                    >
                      {downloadProgress === "ZIP" ? "⏳ زیپ" : "📦 زیپ"}
                    </button>
                    <button
                      type="button"
                      className="btn primary small-btn files-btn"
                      onClick={() => handleDownloadFiles(s)}
                      disabled={downloadProgress !== null}
                    >
                      {downloadProgress && downloadProgress !== "ZIP" ? `⏳ ${downloadProgress}` : "📥 فایل‌ها"}
                    </button>
                    <button
                      type="button"
                      className="btn icon-btn delete-btn"
                      onClick={() => handleDeleteShare(s)}
                      aria-label="حذف"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="expand-btn"
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                >
                  {expandedId === s.id ? "▲ بستن فهرست" : "▼ مشاهده فایل‌ها"}
                </button>

                {expandedId === s.id && (
                  <ul className="file-list">
                    {s.files.map((f, fi) => (
                      <li key={f.id}>
                        <span className="file-icon">{fileIcon(f.contentType)}</span>
                        <span
                          className={f.relativePath ? "has-path" : ""}
                          onClick={() => f.contentType.startsWith("image/") && openPreview(s.files, fi)}
                          style={f.contentType.startsWith("image/") ? { cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px" } : undefined}
                          title={f.contentType.startsWith("image/") ? "پیش‌نمایش" : undefined}
                        >
                          {f.relativePath ?? f.originalFileName}
                        </span>
                        <span className="file-size">{formatSize(f.sizeBytes)}</span>
                        <div className="file-actions">
                          <button
                            type="button"
                            className="btn ghost tiny"
                            onClick={() =>
                              downloadSingleFile(f.id, f.originalFileName)
                                .then(() => showToast("دانلود شد"))
                                .catch((err) => showToast(err.message))
                            }
                          >
                            دانلود
                          </button>
                          <button
                            type="button"
                            className="btn icon-btn file-delete"
                            onClick={() => handleDeleteFile(f.id, s)}
                            aria-label="حذف فایل"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                    <li className="add-file-row">
                      <button
                        type="button"
                        className="btn ghost tiny add-file-btn"
                        onClick={() => {
                          setAddFileBundleId(s.id);
                          setAddFileFolderMode(false);
                          setTimeout(() => addFileRef.current?.click(), 10);
                        }}
                        disabled={addFileUploadPct !== null}
                      >
                        {addFileUploadPct !== null ? `⏳ ${addFileUploadPct}%` : "+ افزودن فایل"}
                      </button>
                      <button
                        type="button"
                        className="btn ghost tiny add-file-btn"
                        onClick={() => {
                          setAddFileBundleId(s.id);
                          setAddFileFolderMode(true);
                          setTimeout(() => addFolderRef.current?.click(), 10);
                        }}
                        disabled={addFileUploadPct !== null}
                      >
                        {addFileUploadPct !== null ? `⏳ ${addFileUploadPct}%` : "+ افزودن پوشه"}
                      </button>
                      <input
                        ref={addFileRef}
                        type="file"
                        multiple
                        hidden
                        onChange={handleAddFiles}
                      />
                      <input
                        ref={addFolderRef}
                        type="file"
                        {...{ webkitdirectory: "" } as any}
                        hidden
                        onChange={handleAddFiles}
                      />
                    </li>
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <button
        type="button"
        className="fab"
        onClick={() => setShowModal(true)}
        aria-label="اشتراک جدید"
      >
        +
      </button>

      {showModal && (
        <div className="modal-backdrop" onClick={() => uploadPct === null && setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>اشتراک محتوای جدید</h2>
            <form onSubmit={handleCreateShare}>
              <label htmlFor="title">نام این محتوا</label>
              <input
                id="title"
                type="text"
                placeholder="مثلاً: گزارش پروژه، عکس‌های جلسه..."
                value={shareTitle}
                onChange={(e) => setShareTitle(e.target.value)}
                maxLength={128}
                required
                minLength={2}
                disabled={uploadPct !== null}
              />

              <label>انتخاب محتوا</label>
              <div className="picker-mode">
                <button
                  type="button"
                  className={`btn mode-btn${!folderMode ? " active" : ""}`}
                  onClick={() => setFolderMode(false)}
                  disabled={uploadPct !== null}
                >
                  📄 فایل
                </button>
                <button
                  type="button"
                  className={`btn mode-btn${folderMode ? " active" : ""}`}
                  onClick={() => setFolderMode(true)}
                  disabled={uploadPct !== null}
                >
                  📁 پوشه
                </button>
              </div>
              <button
                type="button"
                className="btn ghost file-picker"
                onClick={() =>
                  folderMode
                    ? folderRef.current?.click()
                    : fileRef.current?.click()
                }
                disabled={uploadPct !== null}
              >
                📎 {folderMode ? "انتخاب پوشه" : selectedFiles.length > 0
                  ? `${selectedFiles.length} فایل انتخاب شده`
                  : "انتخاب فایل‌ها"}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={handleFilesPick}
              />
              <input
                ref={folderRef}
                type="file"
                {...{ webkitdirectory: "" } as any}
                hidden
                onChange={handleFilesPick}
              />

              {selectedFiles.length > 0 && (
                <ul className="picked-files">
                  {selectedFiles.map((f, i) => (
                    <li key={`${f.name}-${f.size}-${i}`}>
                      <span className="file-path">
                        {f.webkitRelativePath ? f.webkitRelativePath.replace(/\\/g, "/") : f.name}
                      </span>
                      <span className="file-size">{formatSize(f.size)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowModal(false)}
                  disabled={uploadPct !== null}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={uploadPct !== null || selectedFiles.length === 0}
                >
                  {uploadPct !== null ? `در حال آپلود ${uploadPct}%` : "اشتراک‌گذاری"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-text">{confirmModal.message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmModal(null)}>
                انصراف
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const action = confirmModal.action;
                  setConfirmModal(null);
                  action();
                }}
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="lightbox-backdrop" onClick={closePreview}>
          <button type="button" className="lightbox-close" onClick={closePreview}>✕</button>
          {preview.index > 0 && (
            <button type="button" className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); navPreview(-1); }}>‹</button>
          )}
          {preview.index < preview.files.length - 1 && (
            <button type="button" className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); navPreview(1); }}>›</button>
          )}
          <div className="lightbox-counter">
            {preview.index + 1} از {preview.files.length}
            <span className="lightbox-filename">{preview.files[preview.index].originalFileName}</span>
          </div>
          {previewLoading ? (
            <div className="lightbox-spinner" />
          ) : previewBlobUrl ? (
            <img src={previewBlobUrl} className="lightbox-img" alt="preview" onClick={(e) => e.stopPropagation()} />
          ) : null}
        </div>
      )}

      <button
        type="button"
        className="console-fab"
        onClick={() => setShowConsole((p) => !p)}
        aria-label="کنسول"
      >
        ⌨
      </button>

      {showConsole && (
        <div className="console-modal">
          <div className="console-header">
            <h3>کنسول دستورات</h3>
            <button type="button" className="console-close" onClick={() => setShowConsole(false)}>✕</button>
          </div>
          <div className="console-body">
            <textarea
              className="console-input"
              rows={5}
              placeholder="دستور خود را اینجا بنویسید..."
              value={consoleInput}
              onChange={(e) => setConsoleInput(e.target.value)}
              disabled={consoleLoading}
            />
            <button
              type="button"
              className="btn primary"
              onClick={handleConsoleSubmit}
              disabled={consoleLoading || !consoleInput.trim()}
            >
              {consoleLoading ? "در انتظار پاسخ..." : "ارسال"}
            </button>
            <button type="button" className="btn ghost tiny" onClick={async () => { const d = await (await fetch("/api/console/pending")).json(); if (d.response) setConsoleResponse(d.response); else showToast("پاسخی نیست"); }}>
              بررسی پاسخ
            </button>
            {consoleResponse && (
              <div className="console-response">
                <strong>پاسخ:</strong>
                <pre>{consoleResponse}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast" key={toastKey}>{toast}</div>}
    </div>
  );
}

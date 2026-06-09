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
  fetchShares,
  formatSize,
  formatTime,
  join,
  leave,
  loadSession,
  validateSession,
} from "./api";
import { createHub } from "./signalr";
import type { Session, ShareBundle } from "./types";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [shares, setShares] = useState<ShareBundle[]>([]);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [folderMode, setFolderMode] = useState(false);
  const [addFileBundleId, setAddFileBundleId] = useState<string | null>(null);
  const [addFileFolderMode, setAddFileFolderMode] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("lanshare_theme") || "light");

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("lanshare_theme", next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const addFolderRef = useRef<HTMLInputElement>(null);
  const hubRef = useRef<ReturnType<typeof createHub> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }, []);

  const refreshShares = useCallback(async () => {
    const list = await fetchShares();
    setShares(list);
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

    try {
      const updated = await addFilesToShare(session.token, addFileBundleId, files, paths);
      setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`${files.length} فایل اضافه شد`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "افزودن فایل ناموفق");
    } finally {
      setAddFileBundleId(null);
    }
  };

  const handleDeleteFile = async (fileId: string, bundle: ShareBundle) => {
    if (!session) return;
    if (!confirm("این فایل حذف شود؟")) return;
    try {
      const updated = await deleteFile(session.token, fileId);
      setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast("فایل حذف شد");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حذف ناموفق");
    }
  };

  const handleDeleteShare = async (bundle: ShareBundle) => {
    if (!session) return;
    if (!confirm(`آیا از حذف «${bundle.title}» اطمینان دارید؟`)) return;
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
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="تغییر تم">
            {theme === "light" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
          <button type="button" className="btn ghost small" onClick={handleLeave}>
            تغییر نام
          </button>
        </div>
      </header>

      <main className="main">
        {shares.length === 0 ? (
          <div className="empty">
            <p>هنوز محتوایی اشتراک گذاشته نشده.</p>
            <p>اولین نفری باشید که فایل می‌گذارد!</p>
          </div>
        ) : (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.id} className="share-card">
                <div className="share-header">
                  <div>
                    <h2>{s.title}</h2>
                    <p className="share-meta">
                      {s.authorName} · {formatTime(s.createdAt)} · {s.fileCount} فایل · {formatSize(s.totalSizeBytes)}
                    </p>
                  </div>
                  <div className="share-actions">
                    <button
                      type="button"
                      className="btn primary small-btn"
                      onClick={() => handleDownloadZip(s)}
                      disabled={downloadProgress !== null}
                    >
                      {downloadProgress === "ZIP" ? "⏳ زیپ" : "📦 زیپ"}
                    </button>
                    <button
                      type="button"
                      className="btn primary small-btn"
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
                    {s.files.map((f) => (
                      <li key={f.id}>
                        <span className={f.relativePath ? "has-path" : ""}>
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
                      >
                        + افزودن فایل
                      </button>
                      <button
                        type="button"
                        className="btn ghost tiny add-file-btn"
                        onClick={() => {
                          setAddFileBundleId(s.id);
                          setAddFileFolderMode(true);
                          setTimeout(() => addFolderRef.current?.click(), 10);
                        }}
                      >
                        + افزودن پوشه
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
                        webkitdirectory=""
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
                webkitdirectory=""
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

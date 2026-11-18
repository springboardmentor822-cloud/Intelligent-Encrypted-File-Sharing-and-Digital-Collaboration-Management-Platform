"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Download,
  Eye,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Archive,
  Music,
  Video,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ArrowLeft,
  KeyRound,
  ExternalLink,
  X,
  File
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function GuestSharePageContent() {
  const params = useParams();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [shareInfo, setShareInfo] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null); // 'expired', 'revoked', 'exhausted', 'not_found', 'error'
  const [errorMessage, setErrorMessage] = useState("");

  // Guest Password Verification
  const [guestPassword, setGuestPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [guestToken, setGuestToken] = useState("");

  // Download & Preview states
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch Public Share Info
  useEffect(() => {
    let isMounted = true;
    if (!token) return;

    axios.get(`${API_BASE}/share/${token}/info`)
      .then((res) => {
        if (!isMounted) return;
        setShareInfo(res.data);
        if (res.data.max_downloads && res.data.downloads_count >= res.data.max_downloads) {
          setErrorStatus("exhausted");
          setErrorMessage("This share link has reached its maximum allowable download limit. No further downloads are permitted.");
          setLoading(false);
          return;
        }
        if (!res.data.has_guest_password) {
          setIsUnlocked(true);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        const status = err.response?.status;
        const detail = err.response?.data?.detail || "Share link unavailable.";

        if (status === 410) {
          if (detail.toLowerCase().includes("expired")) {
            setErrorStatus("expired");
          } else {
            setErrorStatus("exhausted");
          }
        } else if (status === 404) {
          setErrorStatus("not_found");
        } else {
          setErrorStatus("error");
        }
        setErrorMessage(detail);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle Guest Password Submission
  const handleVerifyPassword = async (e) => {
    e?.preventDefault();
    if (!guestPassword.trim()) {
      setVerifyError("Please enter the guest password.");
      return;
    }

    setVerifying(true);
    setVerifyError("");

    try {
      const res = await axios.post(`${API_BASE}/share/${token}/verify`, {
        guest_password: guestPassword.trim()
      });

      if (res.data.valid) {
        setIsUnlocked(true);
        setGuestToken(res.data.guest_token);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || "Incorrect guest password. Access denied.";
      setVerifyError(detail);
    } finally {
      setVerifying(false);
    }
  };

  // Trigger Decrypted File Download
  const handleDownload = async () => {
    if (!shareInfo || shareInfo.permission === "view") return;

    // Guard if already reached
    if (shareInfo.max_downloads && (shareInfo.downloads_count || 0) >= shareInfo.max_downloads) {
      setErrorStatus("exhausted");
      setErrorMessage("This share link has reached its maximum allowable download limit. No further downloads are permitted.");
      return;
    }

    setDownloading(true);

    try {
      const queryParams = new URLSearchParams();
      if (guestToken) {
        queryParams.append("guest_token", guestToken);
      } else if (guestPassword) {
        queryParams.append("guest_password", guestPassword);
      }

      const downloadUrl = `${API_BASE}/share/${token}/download?${queryParams.toString()}`;
      const response = await axios.get(downloadUrl, {
        responseType: "blob",
      });

      // Create download link in browser
      const blob = new Blob([response.data], {
        type: shareInfo.mime_type || "application/octet-stream",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", shareInfo.item_name || "download");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Increment downloads_count in state immediately
      const currentCount = shareInfo.downloads_count || 0;
      const newCount = currentCount + 1;
      const maxDownloads = shareInfo.max_downloads;
      const limitReached = Boolean(maxDownloads && newCount >= maxDownloads);

      setShareInfo((prev) => ({
        ...prev,
        downloads_count: newCount,
      }));

      // If download quota is reached, transition cleanly after 1 second
      if (limitReached) {
        setTimeout(() => {
          setErrorStatus("exhausted");
          setErrorMessage(
            `Download completed! You have used the allowable download (${newCount} of ${maxDownloads}). This single-use link has now expired and no further downloads are available.`
          );
        }, 1200);
      }
    } catch (err) {
      console.error("Download failed:", err);
      let detail = "";
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          detail = parsed.detail || "";
        } catch (_) {}
      } else if (err.response?.data?.detail) {
        detail = err.response.data.detail;
      }

      if (err.response?.status === 410) {
        setErrorStatus("exhausted");
        setErrorMessage(detail || "This share link has reached its maximum allowable download limit. No further downloads are permitted.");
      } else {
        alert(detail || "Download failed. Please re-enter guest credentials.");
      }
    } finally {
      setDownloading(false);
    }
  };

  // Trigger In-Browser Decrypted Preview
  const handlePreview = async () => {
    setPreviewOpen(true);
    setLoadingPreview(true);

    try {
      const queryParams = new URLSearchParams();
      if (guestToken) {
        queryParams.append("guest_token", guestToken);
      } else if (guestPassword) {
        queryParams.append("guest_password", guestPassword);
      }

      const previewUrl = `${API_BASE}/share/${token}/preview?${queryParams.toString()}`;
      const res = await axios.get(previewUrl, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      setPreviewContent(blobUrl);
    } catch (err) {
      console.error("Preview failed:", err);
      if (err.response?.status === 410) {
        setErrorStatus("exhausted");
        setErrorMessage("This share link has reached its limit or expired.");
      } else {
        setPreviewContent("error");
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  const getFileCategoryIcon = (category) => {
    switch (category) {
      case "code":
        return <FileCode className="h-10 w-10 text-emerald-500" />;
      case "spreadsheet":
        return <FileSpreadsheet className="h-10 w-10 text-green-600" />;
      case "image":
        return <ImageIcon className="h-10 w-10 text-violet-500" />;
      case "archive":
        return <Archive className="h-10 w-10 text-amber-500" />;
      case "presentation":
        return <FileText className="h-10 w-10 text-orange-500" />;
      default:
        return <FileText className="h-10 w-10 text-blue-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-10 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-white flex items-center gap-2">
              TrustShare <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Secure Portal</span>
            </h1>
            <p className="text-[11px] text-slate-400">Authenticated AES-256-GCM Secure Sharing</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Zero Plaintext at Rest
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-xl mx-auto my-auto py-8">
        {loading ? (
          <div className="bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-800 p-8 shadow-2xl text-center">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
            <p className="text-sm font-medium text-slate-300">Establishing end-to-end cryptographic handshake...</p>
          </div>
        ) : errorStatus ? (
          /* Error & Expiration States */
          <div className="bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-700/70 p-8 shadow-2xl text-center animate-in fade-in zoom-in-95">
            <div className={`h-16 w-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
              errorStatus === "exhausted"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
            }`}>
              {errorStatus === "exhausted" ? (
                <CheckCircle2 className="h-8 w-8" />
              ) : (
                <ShieldAlert className="h-8 w-8" />
              )}
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              {errorStatus === "expired"
                ? "Share Link Expired"
                : errorStatus === "exhausted"
                ? "Download Limit Reached"
                : errorStatus === "not_found"
                ? "Link Inactive or Revoked"
                : "Access Restricted"}
            </h2>

            <p className="text-sm text-slate-300 mb-6 leading-relaxed max-w-md mx-auto">
              {errorMessage}
            </p>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 text-left mb-6 space-y-1.5">
              <div className="flex justify-between">
                <span>Security Standard:</span>
                <span className="text-slate-300 font-mono">AES-256-GCM Envelope</span>
              </div>
              <div className="flex justify-between">
                <span>Download Status:</span>
                <span className={errorStatus === "exhausted" ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                  {errorStatus === "exhausted" ? "All Allowed Downloads Completed" : "Automatic Immediate Termination"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Access Status:</span>
                <span className="text-slate-300">
                  {errorStatus === "exhausted"
                    ? "No more options to download are available for this link."
                    : "Request a new secure link from the document owner."}
                </span>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Platform Home</span>
            </Link>
          </div>
        ) : !isUnlocked ? (
          /* GUEST PASSWORD GATE */
          <div className="bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-700/70 p-6 sm:p-8 shadow-2xl animate-in fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Protected Document Access</h2>
                <p className="text-xs text-slate-400">
                  Shared by <span className="font-semibold text-slate-200">{shareInfo?.owner_username}</span>
                </p>
              </div>
            </div>

            {/* Document preview header */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 flex items-center gap-3 mb-6">
              {getFileCategoryIcon(shareInfo?.category)}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{shareInfo?.item_name}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  <span>{formatBytes(shareInfo?.file_size)}</span>
                  <span>•</span>
                  <span className="capitalize">{shareInfo?.category}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-medium">AES-256 Encrypted</span>
                </div>
              </div>
            </div>

            {/* Security Notice: Original Password Protection */}
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-500/30 mb-6 text-xs text-blue-200 flex items-start gap-3">
              <KeyRound className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white block mb-0.5">Guest Password Protection Active</span>
                To protect the document owner&apos;s personal vault credentials, the owner&apos;s original master password cannot be used here. Please enter the specific <strong className="text-sky-300">Guest Access Passcode</strong> provided for this share grant.
              </div>
            </div>

            {verifyError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs mb-4 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{verifyError}</span>
              </div>
            )}

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Enter Guest Passcode
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={guestPassword}
                    onChange={(e) => setGuestPassword(e.target.value)}
                    placeholder="Enter guest passcode..."
                    className="w-full px-4 py-3 bg-slate-950/70 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-medium cursor-pointer"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={verifying}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Verifying Guest Passcode...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" />
                    <span>Unlock Document</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* UNLOCKED DOCUMENT PORTAL */
          <div className="bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-700/70 p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95">
            {/* Header Badge */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase block">
                    Verified Access Granted
                  </span>
                  <span className="text-xs text-slate-400">
                    Shared by {shareInfo?.owner_username}
                  </span>
                </div>
              </div>

              <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${
                shareInfo?.permission === "view"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}>
                {shareInfo?.permission === "view" ? "View-Only Access" : "Full Access (Download & View)"}
              </span>
            </div>

            {/* Document Highlight Card */}
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 mb-6 flex items-start gap-4">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                {getFileCategoryIcon(shareInfo?.category)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-white break-words">{shareInfo?.item_name}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500 block">File Size</span>
                    <span className="text-slate-200 font-semibold">{formatBytes(shareInfo?.file_size)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Encryption Standard</span>
                    <span className="text-emerald-400 font-semibold">AES-256-GCM</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Expiration</span>
                    <span className="text-slate-200">
                      {shareInfo?.expires_at ? new Date(shareInfo.expires_at).toLocaleString() : "Never (Permanent)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Downloads Used</span>
                    <span className="text-slate-200 font-medium">
                      {shareInfo?.downloads_count || 0}
                      {shareInfo?.max_downloads ? ` / ${shareInfo.max_downloads}` : " (Unlimited)"}
                      {shareInfo?.max_downloads && ((shareInfo?.downloads_count || 0) >= shareInfo.max_downloads) && (
                        <span className="ml-1 text-[11px] text-amber-400 font-semibold block sm:inline">(Limit Reached)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {shareInfo?.max_downloads && ((shareInfo?.downloads_count || 0) >= shareInfo.max_downloads) ? (
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Download Limit Reached ({shareInfo?.downloads_count} / {shareInfo?.max_downloads} Used)
                  </div>
                  <p className="text-xs text-slate-300">
                    The maximum allowable download quota for this document has been reached. No more options to download are available for this link.
                  </p>
                </div>
              ) : shareInfo?.permission === "download" ? (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {downloading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Decrypting & Streaming File...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5" />
                      <span>Download Decrypted Document</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>The document owner has disabled downloading for this link. You can view it online below.</span>
                </div>
              )}

              <button
                onClick={handlePreview}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Eye className="h-4 w-4 text-sky-400" />
                <span>Preview Document Online</span>
              </button>
            </div>

            {/* Security Guarantee Strip */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Envelope Decryption Verified</span>
              </div>
              <span className="font-mono text-slate-500">SHA-256 Validated</span>
            </div>
          </div>
        )}
      </main>

      {/* Online Document Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-blue-500" />
                <h4 className="text-sm font-bold text-white truncate max-w-md">{shareInfo?.item_name}</h4>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Decrypted Stream
                </span>
              </div>
              <button
                onClick={() => {
                  setPreviewOpen(false);
                  if (previewContent && previewContent !== "error") {
                    URL.revokeObjectURL(previewContent);
                  }
                  setPreviewContent(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 bg-slate-950/90 overflow-auto flex items-center justify-center p-4">
              {loadingPreview ? (
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                  <p className="text-xs text-slate-400 font-medium">Decrypting payload on the fly with AES-256-GCM...</p>
                </div>
              ) : previewContent === "error" ? (
                <div className="text-center text-rose-400 p-6">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
                  <p className="text-sm font-semibold">Preview generation failed</p>
                  <p className="text-xs text-slate-400 mt-1">Please try downloading the document directly.</p>
                </div>
              ) : shareInfo?.category === "image" ? (
                <img
                  src={previewContent}
                  alt={shareInfo?.item_name}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                />
              ) : shareInfo?.mime_type === "application/pdf" ? (
                <iframe
                  src={previewContent}
                  title="Document Preview"
                  className="w-full h-full rounded-lg border border-slate-800"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <FileText className="h-12 w-12 text-slate-600 mb-3" />
                  <p className="text-sm font-semibold text-slate-300">Inline viewer not supported for this MIME type</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {shareInfo?.item_name} ({shareInfo?.mime_type}). Use the download button to inspect on your device.
                  </p>
                  {shareInfo?.permission === "download" && (
                    <button
                      onClick={handleDownload}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download File</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto py-4 text-center text-xs text-slate-500 border-t border-slate-800/80">
        <p>TrustShare Enterprise Cryptographic Security Platform • End-to-End Vault Access</p>
      </footer>
    </div>
  );
}

export default function GuestSharePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans">
          <div className="h-10 w-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium text-slate-400">Loading secure guest portal...</p>
        </div>
      }
    >
      <GuestSharePageContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Shield, Lock, Download, AlertTriangle, ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { api } from "@/lib/api";

function ShareDownloadContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || searchParams.get("share") || "";

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [fileData, setFileData] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setError("No sharing token provided in URL.");
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get(`/files/public/share/${token}/info`);
        setFileData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Invalid, expired, or revoked share link.");
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const handleDownload = async () => {
    if (!token || !fileData) return;
    setDownloading(true);
    try {
      const res = await api.get(`/files/public/share/${token}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      if (fileData.permission === "view") {
        window.open(url, "_blank");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileData.original_filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err: any) {
      alert("Failed to decrypt and retrieve file. Link may have expired or exceeded download limit.");
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 lg:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              TrustShare
            </span>
            <p className="text-[10px] text-slate-500 -mt-0.5">Encrypted Recipient Gateway</p>
          </div>
        </div>

        <a
          href="/"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Go to Platform</span>
        </a>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-7 shadow-2xl space-y-6 relative">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/20">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Encrypted File Delivery</h2>
              <p className="text-xs text-slate-400">Authenticated via 256-bit secure share token</p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-slate-400 font-mono">Verifying token & cryptographic credentials...</p>
            </div>
          ) : error ? (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-rose-300">Access Restricted</h4>
                  <p className="text-xs text-rose-400/90 leading-relaxed">{error}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center">
                Please contact the file owner to request a new temporary share link.
              </p>
              <div className="pt-2 flex justify-center">
                <a
                  href="/"
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                >
                  Return to Home
                </a>
              </div>
            </div>
          ) : fileData ? (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> AES-256-GCM Verified
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Expires: {fileData.expires_at ? fileData.expires_at.slice(0, 16).replace("T", " ") : "N/A"}
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="truncate flex-1">
                    <p className="font-semibold text-white text-base truncate">{fileData.original_filename}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {formatFileSize(fileData.file_size)} • Permission: <span className="text-emerald-400 capitalize">{fileData.permission}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
                When you click below, the server retrieves the encrypted ciphertext, unwraps the per-file Data Encryption Key (DEK), and verifies the authentication tag before delivering the file.
              </div>

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-xl shadow-emerald-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloading
                    ? "Decrypting & Streaming File..."
                    : fileData.permission === "view"
                    ? "Decrypt & View File"
                    : "Decrypt & Download File"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500">
        © 2026 TrustShare Platform. Intelligent Encrypted File Sharing.
      </footer>
    </div>
  );
}

export default function ShareDownloadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>}>
      <ShareDownloadContent />
    </Suspense>
  );
}


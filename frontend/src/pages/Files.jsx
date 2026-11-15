// One page, five views of the same file list:  mine | shared | recent | favorites | trash
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronRight, Clock, Download, Eye, Folder, FolderPlus, LayoutGrid, List, Share2, Star, Trash2,
  Undo2, Upload, UploadCloud, FolderOpen, Users,
} from "lucide-react";
import api, { downloadFile, errorMessage, previewFile } from "../lib/api";
import { formatBytes, timeAgo } from "../lib/format";
import { canUpload, useAuth } from "../store/auth";
import FileTile from "../components/FileTile";
import FileUploader from "../components/FileUploader";
import Modal from "../components/Modal";
import ShareModal from "../components/ShareModal";
import { EmptyState, PageHeader, Seal } from "../components/ui";

const CHIPS = [["", "All"], ["image", "Images"], ["video", "Videos"], ["pdf", "PDFs"], ["document", "Documents"], ["spreadsheet", "Sheets"], ["presentation", "Slides"], ["text", "Text"]];

// words and icons for each view
const MODES = {
  mine: { kicker: "01 — Vault", title: "My Files", sub: "Every file here is sealed with its own AES-256 key.", icon: FolderOpen,
    empty: ["No files here yet", "Drop a file above or click Upload to add your first one."] },
  shared: { kicker: "02 — Incoming", title: "Shared with Me", sub: "Files other people gave you access to. You can only do what they allowed.", icon: Users,
    empty: ["Nothing has been shared with you yet", "When someone shares a file with your email it will appear here."] },
  recent: { kicker: "04 — Timeline", title: "Recent", sub: "Files you uploaded, opened or downloaded lately, newest first.", icon: Clock,
    empty: ["No recent activity", "Upload, preview or download a file and it will show up here."] },
  favorites: { kicker: "05 — Pinned", title: "Favorites", sub: "Files you starred for quick access.", icon: Star,
    empty: ["No favorites yet", "Click the star on any file to pin it here."] },
  trash: { kicker: "06 — Recoverable", title: "Trash", sub: "Deleted files stay here (still encrypted) for 30 days. Restore them or delete them forever.", icon: Trash2,
    empty: ["Trash is empty", "Files you delete are kept here for 30 days before they are removed for good."] },
};

export default function Files({ mode = "mine" }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const folderId = mode === "mine" ? params.get("folder") || "" : "";
  const cfg = MODES[mode];

  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [path, setPath] = useState([]);
  const [view, setView] = useState("list");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [dropped, setDropped] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [shareFile, setShareFile] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const fileParams = { scope: mode };
      if (q) fileParams.q = q;
      if (category) fileParams.category = category;
      if (folderId) fileParams.folder_id = folderId;
      const requests = [api.get("/files", { params: fileParams })];
      if (mode === "mine" && !q) requests.push(api.get("/folders", { params: folderId ? { parent_id: folderId } : {} }));
      const [filesRes, foldersRes] = await Promise.all(requests);
      setFiles(filesRes.data);
      setFolders(foldersRes ? foldersRes.data : []);
      if (folderId) setPath((await api.get(`/folders/${folderId}/path`)).data); else setPath([]);
    } catch (e) { setError(await errorMessage(e)); }
    finally { setLoading(false); }
  }, [mode, q, category, folderId]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); window.dispatchEvent(new Event("storage-changed")); };
  const openFolder = (id) => { const p = new URLSearchParams(); if (id) p.set("folder", id); setParams(p); };
  const run = async (fn) => { try { setError(""); await fn(); } catch (e) { setError(await errorMessage(e)); } };

  const createFolder = () => run(async () => {
    await api.post("/folders", { name: folderName, parent_id: folderId || null });
    setShowNewFolder(false); setFolderName(""); load();
  });
  const removeFolder = (f) => run(async () => {
    if (!confirm(`Delete folder "${f.name}"?`)) return;
    await api.delete(`/folders/${f.id}`); load();
  });
  const toTrash = (f) => run(async () => { await api.delete(`/files/${f.id}`); refresh(); });
  const restore = (f) => run(async () => { await api.post(`/files/${f.id}/restore`); refresh(); });
  const deleteForever = (f) => run(async () => {
    if (!confirm(`Delete "${f.original_name}" forever? This cannot be undone.`)) return;
    await api.delete(`/files/${f.id}/permanent`); refresh();
  });
  const emptyTrash = () => run(async () => {
    if (!confirm("Delete everything in the Trash forever?")) return;
    await api.delete("/files/trash/empty"); refresh();
  });
  const toggleStar = (f) => run(async () => {
    if (f.is_favorite) await api.delete(`/files/${f.id}/favorite`); else await api.post(`/files/${f.id}/favorite`);
    // change the star instantly; in the Favorites view an un-starred file disappears
    setFiles((list) => (mode === "favorites" && f.is_favorite ? list.filter((x) => x.id !== f.id)
      : list.map((x) => (x.id === f.id ? { ...x, is_favorite: !x.is_favorite } : x))));
    window.dispatchEvent(new Event("storage-changed"));
  });

  const openUploader = (list) => { setDropped(list || null); setShowUpload(true); };
  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    if (canUpload(user) && e.dataTransfer.files.length) openUploader(e.dataTransfer.files);
  };

  const iconBtn = "rounded-lg p-2 text-slate-500 hover:bg-paper-100 hover:text-slate-900";
  const Actions = ({ f }) => {
    if (mode === "trash") {
      return (
        <div className="flex items-center gap-1">
          <button className="btn-secondary !px-3 !py-1.5" onClick={() => restore(f)}><Undo2 size={14} /> Restore</button>
          <button title="Delete forever" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => deleteForever(f)}><Trash2 size={16} /></button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-0.5">
        <button title={f.is_favorite ? "Remove from favorites" : "Add to favorites"} className={iconBtn} onClick={() => toggleStar(f)}>
          <Star size={16} className={f.is_favorite ? "fill-amber-400 text-amber-500" : ""} />
        </button>
        <button title="Preview" className={iconBtn} onClick={() => run(() => previewFile(f))}><Eye size={16} /></button>
        {f.access_level !== "view" && <button title="Download" className={iconBtn} onClick={() => run(() => downloadFile(f))}><Download size={16} /></button>}
        {f.access_level === "admin" && (
          <>
            <button title="Share" className="rounded-lg p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-700" onClick={() => setShareFile(f)}><Share2 size={16} /></button>
            <button title="Move to Trash" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => toTrash(f)}><Trash2 size={16} /></button>
          </>
        )}
      </div>
    );
  };

  const title = q ? `Results for "${q}"` : mode === "mine" && folderId ? path[path.length - 1]?.name || "Folder" : cfg.title;
  const showOwner = mode !== "mine" && mode !== "trash";
  const When = ({ f }) => <span title={new Date(mode === "trash" ? f.deleted_at : f.created_at).toLocaleString()}>
    {mode === "trash" ? `deleted ${timeAgo(f.deleted_at)}` : timeAgo(f.created_at)}</span>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader kicker={cfg.kicker} title={title} subtitle={cfg.sub}>
        <div className="flex overflow-hidden rounded-xl border border-paper-300 bg-white">
          <button className={`p-2.5 ${view === "list" ? "bg-brand-50 text-brand-700" : ""}`} onClick={() => setView("list")}><List size={16} /></button>
          <button className={`p-2.5 ${view === "grid" ? "bg-brand-50 text-brand-700" : ""}`} onClick={() => setView("grid")}><LayoutGrid size={16} /></button>
        </div>
        {mode === "mine" && canUpload(user) && (
          <>
            <button className="btn-secondary" onClick={() => setShowNewFolder(true)}><FolderPlus size={16} /> New folder</button>
            <button className="btn-primary" onClick={() => openUploader(null)}><Upload size={16} /> Upload</button>
          </>
        )}
        {mode === "trash" && files.length > 0 && <button className="btn-danger" onClick={emptyTrash}><Trash2 size={16} /> Empty Trash</button>}
      </PageHeader>

      {mode === "mine" && !q && (
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <button className="hover:text-brand-700" onClick={() => openFolder("")}>Home</button>
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1"><ChevronRight size={14} />
              <button className="hover:text-brand-700" onClick={() => openFolder(p.id)}>{p.name}</button></span>
          ))}
        </div>
      )}

      {mode === "mine" && canUpload(user) && !q && (
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          onClick={() => openUploader(null)}
          className={`flex cursor-pointer items-center gap-4 rounded-[20px] border-2 border-dashed p-5 transition ${
            dragging ? "border-brand-500 bg-brand-50" : "border-paper-300 bg-white/60 hover:border-brand-400 hover:bg-white"}`}>
          <span className="rounded-2xl bg-brand-50 p-3 text-brand-600"><UploadCloud size={26} /></span>
          <div>
            <div className="font-medium">Drop files here to encrypt &amp; upload</div>
            <div className="text-xs text-slate-500">or click to browse — PDF, images, Word, Excel, PowerPoint, TXT, CSV, MP4/MOV/WEBM up to 25 MB</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {CHIPS.map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${category === key ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-paper-300 hover:bg-paper-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {folders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {folders.map((f) => (
            <div key={f.id} onClick={() => openFolder(f.id)}
              className="group flex cursor-pointer items-center justify-between rounded-2xl border border-paper-200 bg-white p-3.5 transition hover:border-brand-300 hover:shadow-sm">
              <span className="flex items-center gap-3 truncate">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><Folder size={20} /></span>
                <span className="truncate font-medium">{f.name}</span>
              </span>
              <button className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); removeFolder(f); }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Loading...</p>
      ) : files.length === 0 ? (
        <EmptyState icon={cfg.icon} title={q ? "No files match your search" : cfg.empty[0]} text={q ? "Try another word." : cfg.empty[1]} />
      ) : view === "list" ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-200 bg-paper-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr><th className="p-3.5">Name</th><th>Size</th><th>{mode === "trash" ? "Deleted" : "Uploaded"}</th>{showOwner && <th>Owner</th>}<th>Access</th><th className="pr-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-50">
                  <td className="p-3.5">
                    <span className="flex items-center gap-3"><FileTile category={f.category} size={36} />
                      <span><span className="block font-medium">{f.original_name}</span><Seal version={f.kek_version || "v1"} compact /></span></span>
                  </td>
                  <td className="tabular text-slate-600">{formatBytes(f.size_bytes)}</td>
                  <td className="text-slate-600"><When f={f} /></td>
                  {showOwner && <td className="text-slate-600">{f.owner_email}</td>}
                  <td><span className="rounded-full bg-paper-100 px-2 py-0.5 text-xs capitalize">{f.is_owner ? "owner" : f.access_level}</span></td>
                  <td className="pr-3"><div className="flex justify-end"><Actions f={f} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {files.map((f) => (
            <div key={f.id} className="card flex flex-col items-center gap-2 p-4 text-center transition hover:shadow-md">
              <FileTile category={f.category} size={56} />
              <div className="w-full truncate text-sm font-medium" title={f.original_name}>{f.original_name}</div>
              <div className="text-xs text-slate-500">{formatBytes(f.size_bytes)} · <When f={f} /></div>
              <Seal version={f.kek_version || "v1"} compact />
              <Actions f={f} />
            </div>
          ))}
        </div>
      )}

      {showUpload && <FileUploader folderId={folderId} initialFiles={dropped} onClose={() => { setShowUpload(false); setDropped(null); }} onDone={refresh} />}
      {shareFile && <ShareModal file={shareFile} onClose={() => { setShareFile(null); load(); }} />}
      {showNewFolder && (
        <Modal title="New folder" onClose={() => setShowNewFolder(false)}>
          <input autoFocus className="input" placeholder="Folder name" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowNewFolder(false)}>Cancel</button>
            <button className="btn-primary" disabled={!folderName.trim()} onClick={createFolder}>Create</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

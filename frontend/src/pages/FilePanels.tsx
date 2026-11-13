import { useCallback, useState } from "react";
import { Copy, Download, Eye, FileArchive, FileSpreadsheet, FileText, Film, Folder as FolderIcon, Image as Img, Link2, MoreVertical, Pencil, RotateCcw, Star, Trash2, FolderInput, UserPlus } from "lucide-react";
import { api, errMsg, fmtBytes, fmtDate, openBlob } from "../api";
import { Badge, Confirm, ErrorBox, Field, Modal, Notice, Spinner } from "../ui";
import { useFetch } from "../hooks";

export function FileIcon({ ext, cat }: { ext: string; cat?: string }) {
  const m: Record<string, [any, string]> = { pdf: [FileText, "bg-red-50 text-red-500"], doc: [FileText, "bg-blue-50 text-blue-600"], docx: [FileText, "bg-blue-50 text-blue-600"], xls: [FileSpreadsheet, "bg-emerald-50 text-emerald-600"], xlsx: [FileSpreadsheet, "bg-emerald-50 text-emerald-600"], csv: [FileSpreadsheet, "bg-emerald-50 text-emerald-600"] };
  const [I, c] = m[ext] || (cat === "images" ? [Img, "bg-violet-50 text-violet-600"] : cat === "videos" ? [Film, "bg-rose-50 text-rose-500"] : [FileArchive, "bg-slate-100 text-slate-500"]);
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${c}`}><I className="h-[18px] w-[18px]" /></span>;
}

export function ShareModal({ file, onClose, onDone }: { file: any; onClose: () => void; onDone?: () => void }) {
  const [kind, setKind] = useState<"link" | "user">("link"); const [perm, setPerm] = useState("download"); const [hours, setHours] = useState(24); const [email, setEmail] = useState(""); const [maxDl, setMaxDl] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [res, setRes] = useState<any>(null); const [copied, setCopied] = useState(false); const [passcode, setPasscode] = useState("");
  // Always hand out a link on the origin the user is actually browsing, even if the
  // backend saw a different Origin/Referer (proxies, tunnels, custom domains).
  const shareUrl = res?.url ? String(res.url).replace(/^https?:\/\/[^/]+/i, window.location.origin) : "";
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareUrl; ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const submit = async () => { setBusy(true); setErr(null);
    try { const r = await api.post("/shares", { file_id: file.id, kind, permission: perm, expires_in_hours: hours, recipient_email: kind === "user" ? email : undefined, max_downloads: maxDl ? Number(maxDl) : undefined, passcode: passcode.trim() ? passcode.trim() : undefined }); setRes(r.data); onDone?.(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title={`Share “${file.name}”`}>
    {res ? <div className="space-y-4"><Notice kind="success">{res.kind === "link" ? "Link created." : `Shared with ${res.recipient_email}.`}</Notice>
      {res.passcode_protected && <Notice kind="warn"><span className="font-semibold">Passcode required.</span> Recipients must enter the passcode you set before they can open this share.</Notice>}
      {shareUrl && <><div className="flex gap-2"><input readOnly aria-label="Share link" className="input font-mono text-xs" value={shareUrl} onFocus={(e) => e.target.select()} /><button className="btn-secondary" onClick={copyLink}><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy"}</button></div><Notice kind="warn">{res.note}</Notice></>}
      <p className="text-sm text-slate-500">Expires {fmtDate(res.expires_at)} · {res.permission === "download" ? "view & download" : "view only"}</p><div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Done</button></div></div>
    : <div className="space-y-4">{err && <ErrorBox message={err} />}
      <div role="radiogroup" aria-label="Share type" className="grid grid-cols-2 gap-2">{([["link", Link2, "Share link"], ["user", UserPlus, "Specific user"]] as const).map(([k, I, l]) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${kind === k ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200"}`}><I className="h-4 w-4" />{l}</button>)}</div>
      {kind === "user" && <Field label="Recipient's email" htmlFor="rcpt" hint="Must be a registered TrustShare user"><input id="rcpt" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
      <Field label="Permission" htmlFor="perm"><select id="perm" className="input" value={perm} onChange={(e) => setPerm(e.target.value)}><option value="download">View and download</option><option value="view">View only (no download)</option></select></Field>
      <Field label="Expires after" htmlFor="exp"><select id="exp" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option><option value={720}>30 days</option><option value={2160}>90 days</option></select></Field>
      {<Field label="Passcode (optional)" htmlFor="pc" hint="4–64 characters. Recipients must enter it before accessing the file."><input id="pc" type="text" autoComplete="off" className="input" placeholder="No passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} /></Field>}
      {kind === "link" && <Field label="Download limit (optional)" htmlFor="mx"><input id="mx" type="number" min={1} className="input" placeholder="Unlimited" value={maxDl} onChange={(e) => setMaxDl(e.target.value)} /></Field>}
      <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || (kind === "user" && !email)} onClick={submit}>{busy && <Spinner className="h-4 w-4" />}Create</button></div></div>}
  </Modal>;
}

function FolderPicker({ onPick, onClose }: { onPick: (id: string | null) => void; onClose: () => void }) {
  const [parent, setParent] = useState<string | null>(null);
  const { data, loading } = useFetch<any>("/folders", { parent_id: parent ?? undefined });
  return <Modal open onClose={onClose} title="Move to folder">
    <div className="mb-3 flex flex-wrap items-center gap-1 text-sm"><button className="font-semibold text-brand-600" onClick={() => setParent(null)}>My Files</button>{data?.breadcrumbs.map((b: any) => <span key={b.id}>/ <button className="font-semibold text-brand-600" onClick={() => setParent(b.id)}>{b.name}</button></span>)}</div>
    <div className="max-h-60 space-y-1 overflow-auto">{loading ? <Spinner /> : data?.items.map((f: any) => <button key={f.id} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setParent(f.id)}><FolderIcon className="h-4 w-4 text-brand-600" />{f.name}</button>)}{!loading && !data?.items.length && <p className="p-3 text-sm text-slate-500">No subfolders here.</p>}</div>
    <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onPick(parent)}>Move here</button></div></Modal>;
}

/** Row actions menu + the modals that go with it. `mode` decides which actions are offered. */
export function FileRow({ f, mode, onChange, onNotify }: { f: any; mode: "files" | "trash"; onChange: () => void; onNotify: (m: string, err?: boolean) => void }) {
  const [open, setOpen] = useState(false); const [share, setShare] = useState(false); const [rename, setRename] = useState(false); const [name, setName] = useState(f.name);
  const [move, setMove] = useState(false); const [del, setDel] = useState<null | "trash" | "perm">(null); const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); onNotify(ok); onChange(); } catch (e) { onNotify(errMsg(e), true); } finally { setBusy(false); setDel(null); setRename(false); setMove(false); } }, [onChange, onNotify]);
  const dl = () => run(() => openBlob(`/files/${f.id}/download`, f.name), "Download started");
  const previewable = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "mp4", "webm"].includes(f.ext);
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50";
  return <>
    <div className="flex items-center justify-end gap-1">
      {mode === "files" && <button className="btn-ghost" aria-label={f.favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => run(() => f.favorite ? api.delete(`/files/${f.id}/favorite`) : api.put(`/files/${f.id}/favorite`), f.favorite ? "Removed from favorites" : "Added to favorites")}><Star className={`h-4 w-4 ${f.favorite ? "fill-amber-400 text-amber-400" : ""}`} /></button>}
      {mode === "files" && <button className="btn-ghost" aria-label={`Download ${f.name}`} onClick={dl}><Download className="h-4 w-4" /></button>}
      {mode === "trash" && <button className="btn-secondary !py-1.5" onClick={() => run(() => api.post(`/files/${f.id}/restore`), "File restored")}><RotateCcw className="h-4 w-4" />Restore</button>}
      {mode === "trash" && <button className="btn-ghost text-red-600" aria-label="Delete permanently" onClick={() => setDel("perm")}><Trash2 className="h-4 w-4" /></button>}
      {mode === "files" && <div className="relative"><button className="btn-ghost" aria-label={`More actions for ${f.name}`} aria-expanded={open} onClick={() => setOpen(!open)}>{busy ? <Spinner className="h-4 w-4" /> : <MoreVertical className="h-4 w-4" />}</button>
        {open && <><div className="fixed inset-0 z-30" onClick={() => setOpen(false)} /><div className="card absolute right-0 z-40 w-48 p-1.5 text-left" onClick={() => setOpen(false)}>
          {previewable ? <button className={item} onClick={() => run(() => openBlob(`/files/${f.id}/preview`), "Opened preview")}><Eye className="h-4 w-4" />Preview</button> : <p className="px-3 py-2 text-xs text-slate-400">No preview for .{f.ext}</p>}
          <button className={item} onClick={() => setShare(true)}><Link2 className="h-4 w-4" />Share</button>
          <button className={item} onClick={() => setRename(true)}><Pencil className="h-4 w-4" />Rename</button>
          <button className={item} onClick={() => setMove(true)}><FolderInput className="h-4 w-4" />Move</button>
          <button className={`${item} text-red-600`} onClick={() => setDel("trash")}><Trash2 className="h-4 w-4" />Move to Trash</button></div></>}</div>}
    </div>
    {share && <ShareModal file={f} onClose={() => setShare(false)} onDone={() => onNotify("Share created")} />}
    {move && <FolderPicker onClose={() => setMove(false)} onPick={(id) => run(() => api.patch(`/files/${f.id}`, { move: true, folder_id: id }), "File moved")} />}
    <Modal open={rename} onClose={() => setRename(false)} title="Rename file"><Field label="File name" htmlFor="rn"><input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field><div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setRename(false)}>Cancel</button><button className="btn-primary" disabled={busy || !name.trim()} onClick={() => run(() => api.patch(`/files/${f.id}`, { name }), "Renamed")}>Save</button></div></Modal>
    <Confirm open={!!del} danger busy={busy} title={del === "perm" ? "Delete permanently?" : "Move to Trash?"} confirmLabel={del === "perm" ? "Delete forever" : "Move to Trash"} onClose={() => setDel(null)}
      message={del === "perm" ? <>“{f.name}” and its encrypted copy will be removed, and all of its share links will stop working. This cannot be undone.</> : <>“{f.name}” will move to Trash. Its share links stop working while it is there.</>}
      onConfirm={() => run(() => api.delete(`/files/${f.id}`, { params: { permanent: del === "perm" } }), del === "perm" ? "Deleted permanently" : "Moved to Trash")} />
  </>;
}

export const catBadge = (c: string) => <Badge tone={{ documents: "blue", images: "green", videos: "red", others: "purple" }[c] || "slate"}>{c}</Badge>;
export { fmtBytes, fmtDate };

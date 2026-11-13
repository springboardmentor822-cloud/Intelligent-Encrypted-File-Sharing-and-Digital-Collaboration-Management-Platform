import { useCallback, useRef, useState } from "react";
import { Download, Eye, FolderLock, KeyRound, Lock, LogOut, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { api, errMsg, fmtBytes, fmtDate, openBlob } from "../api";
import { useFetch } from "../hooks";
import { Confirm, Empty, ErrorBox, Field, Loading, Notice, PageHeader, Section, Spinner, Table } from "../ui";
import { FileIcon } from "./FilePanels";

function useToast() {
  const [t, setT] = useState<{ m: string; err?: boolean } | null>(null);
  const notify = useCallback((m: string, err?: boolean) => { setT({ m, err }); setTimeout(() => setT(null), 4000); }, []);
  const node = t && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${t.err ? "bg-red-600" : "bg-navy-900"}`}>{t.m}</div>;
  return { notify, node };
}

export default function SecureFolder() {
  const { data, error, loading, reload } = useFetch<any>("/secure-folder/status");
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const { notify, node } = useToast();

  const headers = token ? { "X-Secure-Token": token } : {};
  const files = useFetch<any>(token ? "/secure-folder/files" : null, {}, { headers });

  const setup = async () => {
    setErr(null);
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords do not match.");
    setBusy(true);
    try { await api.post("/secure-folder/setup", { password: pw }); setPw(""); setPw2(""); notify("Secure Folder created — now unlock it."); reload(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const unlock = async () => {
    setErr(null); setBusy(true);
    try { const r = await api.post("/secure-folder/unlock", { password: pw }); setToken(r.data.secure_token); setPw(""); notify("Secure Folder unlocked"); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const lock = async () => { try { await api.post("/secure-folder/lock", {}, { headers }); } catch { /* stateless */ } setToken(null); setPw(""); notify("Secure Folder locked"); };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const unlocked = !!token;

  return <>
    <PageHeader title="Secure Folder" subtitle="A private, password-protected vault. Files here are hidden from your normal file list and cannot be shared."
      icon={<FolderLock className="h-5 w-5" />}
      actions={unlocked ? <button className="btn-secondary" onClick={lock}><LogOut className="h-4 w-4" />Lock</button> : undefined} />

    {!data.enabled ? (
      <div className="mx-auto max-w-md">
        <Section title="Create your Secure Folder">
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-lavender-50 p-3 text-sm text-lavender-700"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>Set a password for your Secure Folder. You'll need it every time you open the vault. We store only a salted hash — never the password itself.</p></div>
          {err && <div className="mb-3"><ErrorBox message={err} /></div>}
          <div className="space-y-4">
            <Field label="Create password" htmlFor="spw" hint="At least 8 characters, with letters and numbers"><input id="spw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Confirm password" htmlFor="spw2"><input id="spw2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <button className="btn-primary w-full" disabled={busy} onClick={setup}>{busy ? <Spinner className="h-4 w-4" /> : <><KeyRound className="h-4 w-4" />Create Secure Folder</>}</button>
          </div>
        </Section>
      </div>
    ) : !unlocked ? (
      <div className="mx-auto max-w-md">
        <Section title="Unlock Secure Folder">
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-grad-brand text-white shadow-glow"><Lock className="h-8 w-8" /></div>
            <p className="mt-3 text-sm text-slate-600">This vault is locked. Enter your Secure Folder password to continue.</p>
            <p className="mt-1 text-xs text-slate-400">{data.file_count} file(s) · {fmtBytes(data.size)}</p>
          </div>
          {err && <div className="mb-3"><ErrorBox message={err} /></div>}
          <div className="space-y-4">
            <Field label="Password" htmlFor="upw"><input id="upw" type="password" autoComplete="current-password" className="input" placeholder="Enter Secure Folder password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} autoFocus /></Field>
            <button className="btn-primary w-full" disabled={busy || !pw} onClick={unlock}>{busy ? <Spinner className="h-4 w-4" /> : <><KeyRound className="h-4 w-4" />Unlock</>}</button>
          </div>
        </Section>
      </div>
    ) : (
      <VaultView files={files} headers={headers} onNotify={notify} />
    )}
    {node}
  </>;
}

function VaultView({ files, headers, onNotify }: { files: ReturnType<typeof useFetch<any>>; headers: any; onNotify: (m: string, err?: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [del, setDel] = useState<any>(null);
  const upload = async (fs: FileList | null) => {
    if (!fs?.length) return; setBusy(true);
    try { for (const f of Array.from(fs)) { const fd = new FormData(); fd.append("file", f); await api.post("/secure-folder/upload", fd, { headers }); } onNotify("Uploaded to Secure Folder"); files.reload(); }
    catch (e) { onNotify(errMsg(e), true); } finally { setBusy(false); }
  };
  const remove = async () => { try { await api.post(`/secure-folder/files/${del.id}/remove`, {}, { headers }); onNotify("Moved out of Secure Folder"); setDel(null); files.reload(); } catch (e) { onNotify(errMsg(e), true); } };
  const trash = async (f: any) => { try { await api.delete(`/secure-folder/files/${f.id}`, { headers }); onNotify("Moved to trash"); files.reload(); } catch (e) { onNotify(errMsg(e), true); } };

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-grad-soft p-4">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-lavender-600 shadow-sm"><ShieldCheck className="h-5 w-5" /></div>
        <div><p className="font-bold text-navy-900">Vault unlocked</p><p className="text-xs text-slate-500">Access expires automatically after 15 minutes for your safety.</p></div></div>
      <div className="flex gap-2"><input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} aria-label="Upload to Secure Folder" />
        <button className="btn-primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}Upload</button></div>
    </div>
    <Section title="Vault contents">
      {files.error ? <ErrorBox message={files.error} onRetry={files.reload} /> : files.loading ? <Loading /> : <Table rowKey={(f: any) => f.id} rows={files.data?.items || []}
        empty={<Empty title="Your Secure Folder is empty" hint="Upload files to keep them in this private, password-protected vault." icon={<FolderLock className="mb-3 h-9 w-9 text-slate-300" />} />}
        cols={[
          { key: "n", header: "File", render: (f: any) => <span className="flex items-center gap-3"><FileIcon ext={f.ext} cat={f.category} /><span className="font-semibold">{f.name}</span></span> },
          { key: "s", header: "Size", render: (f: any) => fmtBytes(f.size) },
          { key: "d", header: "Added", render: (f: any) => fmtDate(f.created_at) },
          { key: "a", header: "", className: "text-right", render: (f: any) => <div className="flex justify-end gap-1">
            {["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "mp4", "webm"].includes(f.ext) && <button className="btn-ghost" aria-label="Preview" onClick={() => openBlob(`/secure-folder/files/${f.id}/preview`, undefined, headers)}><Eye className="h-4 w-4" /></button>}
            <button className="btn-ghost" aria-label="Download" onClick={() => openBlob(`/secure-folder/files/${f.id}/download`, f.name, headers)}><Download className="h-4 w-4" /></button>
            <button className="btn-ghost" aria-label="Move out of vault" onClick={() => setDel(f)}><X className="h-4 w-4" /></button>
            <button className="btn-ghost text-red-600" aria-label="Delete" onClick={() => trash(f)}><Trash2 className="h-4 w-4" /></button>
          </div> },
        ]} />}
    </Section>
    <Confirm open={!!del} title="Move out of Secure Folder?" confirmLabel="Move out" message={<>“{del?.name}” will return to your normal My Files list and can then be shared.</>} onClose={() => setDel(null)} onConfirm={remove} />
  </>;
}

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, BarChart3, ChevronRight, CloudUpload, Download, Eye, FolderPlus, Globe, HardDrive, KeyRound, Link2, Lock, RefreshCw, Settings as Cog, Share2, ShieldCheck, Upload, UserCheck, Users, X, FileText, Database, Fingerprint } from "lucide-react";
import { api, errMsg, fmtBytes, fmtDate, openBlob } from "../api";
import { useAuth } from "../auth";
import { useDebounced, useFetch, useRange } from "../hooks";
import { Badge, Confirm, Empty, ErrorBox, Field, Loading, Modal, Notice, PageHeader, Pagination, RangeSelect, Section, Spinner, SrSummary, StatCard, Table, statusTone } from "../ui";
import { CAT_COLORS, DARK_RED, Donut, Lines, SimpleBars, StackedBars } from "./charts";
import { FileIcon, FileRow, ShareModal, catBadge } from "./FilePanels";

function useToast() {
  const [t, setT] = useState<{ m: string; err?: boolean } | null>(null);
  const notify = useCallback((m: string, err?: boolean) => { setT({ m, err }); setTimeout(() => setT(null), 4000); }, []);
  const node = t && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${t.err ? "bg-red-600" : "bg-navy-900"}`}>{t.m}</div>;
  return { notify, node };
}

/* ---------------- Upload modal ---------------- */
function UploadModal({ folderId, onClose, onDone }: { folderId: string | null; onClose: () => void; onDone: () => void }) {
  type Item = { name: string; pct: number; state: "queued" | "up" | "done" | "err"; msg?: string };
  const [items, setItems] = useState<Item[]>([]); const [drag, setDrag] = useState(false); const busy = items.some((i) => i.state === "up"); const input = useRef<HTMLInputElement>(null);
  const start = async (files: File[]) => {
    const base = items.length; setItems((x) => [...x, ...files.map((f) => ({ name: f.name, pct: 0, state: "queued" as const }))]);
    for (let i = 0; i < files.length; i++) {
      const idx = base + i; const upd = (p: Partial<Item>) => setItems((x) => x.map((it, j) => j === idx ? { ...it, ...p } : it));
      const fd = new FormData(); fd.append("file", files[i]); if (folderId) fd.append("folder_id", folderId); upd({ state: "up" });
      try { await api.post("/files/upload", fd, { onUploadProgress: (e) => upd({ pct: Math.round((e.loaded / (e.total || files[i].size)) * 100) }) }); upd({ state: "done", pct: 100 }); onDone(); }
      catch (e) { upd({ state: "err", msg: errMsg(e) }); }
    }
  };
  return <Modal open onClose={busy ? () => { } : onClose} title="Upload files" wide>
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); start(Array.from(e.dataTransfer.files)); }}
      className={`grid place-items-center rounded-2xl border-2 border-dashed p-8 text-center ${drag ? "border-brand-600 bg-brand-50" : "border-slate-300"}`}>
      <CloudUpload className="h-10 w-10 text-brand-600" /><p className="mt-2 font-semibold">Drag files here, or</p>
      <button className="btn-primary mt-3" onClick={() => input.current?.click()}><Upload className="h-4 w-4" />Choose files</button>
      <input ref={input} type="file" multiple hidden onChange={(e) => { start(Array.from(e.target.files || [])); e.target.value = ""; }} aria-label="Choose files to upload" />
      <p className="mt-3 text-xs text-slate-500">Documents, images, audio, video, archives and more. Up to 25 MB each. Files are encrypted on the server before storage.</p></div>
    <ul className="mt-4 space-y-3">{items.map((it, i) => <li key={i}><div className="flex items-center justify-between text-sm"><span className="truncate font-medium">{it.name}</span><span className={it.state === "err" ? "text-red-600" : "text-slate-500"}>{it.state === "err" ? "Failed" : it.state === "done" ? "Encrypted & stored" : it.state === "queued" ? "Waiting" : `${it.pct}%`}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={it.pct} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full transition-all ${it.state === "err" ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${it.pct}%` }} /></div>{it.msg && <p className="mt-1 text-xs text-red-600">{it.msg}</p>}</li>)}</ul>
    <div className="mt-5 flex justify-end"><button className="btn-secondary" disabled={busy} onClick={onClose}>{busy ? "Uploading…" : "Close"}</button></div></Modal>;
}

/* ---------------- Files list (My Files / Recent / Favorites / Trash) ---------------- */
function FilesList({ view, title, subtitle }: { view: "all" | "recent" | "favorites" | "trash"; title: string; subtitle: string }) {
  const [sp, setSp] = useSearchParams(); const q0 = sp.get("q") || "";
  const [q, setQ] = useState(q0); useEffect(() => setQ(q0), [q0]); const dq = useDebounced(q);
  const [folder, setFolder] = useState<string | null>(null); const [cat, setCat] = useState(""); const [sort, setSort] = useState("date"); const [order, setOrder] = useState("desc"); const [page, setPage] = useState(1);
  const [upload, setUpload] = useState(false); const [newFolder, setNewFolder] = useState(false); const [fname, setFname] = useState(""); const [ferr, setFerr] = useState<string | null>(null); const [emptyAsk, setEmptyAsk] = useState(false);
  const { notify, node } = useToast();
  useEffect(() => setPage(1), [dq, cat, folder, sort, order]);
  const files = useFetch<any>("/files", { view, folder_id: view === "all" && !dq ? folder ?? undefined : undefined, q: dq || undefined, category: cat || undefined, sort, order, page, page_size: 25 });
  const folders = useFetch<any>(view === "all" && !dq ? "/folders" : null, { parent_id: folder ?? undefined });
  const reload = useCallback(() => { files.reload(); folders.reload(); }, [files.reload, folders.reload]); // eslint-disable-line
  const th = (k: string, label: string) => <button className="inline-flex items-center gap-1 font-semibold uppercase" onClick={() => { if (sort === k) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder("asc"); } }}>{label}{sort === k && (order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>;
  const mkFolder = async () => { setFerr(null); try { await api.post("/folders", { name: fname, parent_id: folder }); setNewFolder(false); setFname(""); reload(); notify("Folder created"); } catch (e) { setFerr(errMsg(e)); } };
  const mode = view === "trash" ? "trash" : "files";
  return <>
    <PageHeader title={title} subtitle={subtitle} actions={view === "all" ? <><button className="btn-secondary" onClick={() => setNewFolder(true)}><FolderPlus className="h-4 w-4" />New folder</button><button className="btn-primary" onClick={() => setUpload(true)}><Upload className="h-4 w-4" />Upload</button></> : undefined} />
    {view === "trash" && <div className="mb-4"><Notice>Files in Trash and their share links are inaccessible. Delete permanently to remove the encrypted copy.</Notice></div>}
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        {view === "all" && <nav aria-label="Folder path" className="flex items-center gap-1 text-sm">
          <button className="font-semibold text-brand-600" onClick={() => setFolder(null)}>My Files</button>{folders.data?.breadcrumbs.map((b: any) => <span key={b.id} className="flex items-center gap-1"><ChevronRight className="h-3 w-3 text-slate-400" /><button className="font-semibold text-brand-600" onClick={() => setFolder(b.id)}>{b.name}</button></span>)}</nav>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="fq">Search files</label><input id="fq" className="input !w-48 !py-2" placeholder="Search by name…" value={q} onChange={(e) => { setQ(e.target.value); setSp(e.target.value ? { q: e.target.value } : {}, { replace: true }); }} />
          <label className="sr-only" htmlFor="fc">File type</label><select id="fc" className="input !w-auto !py-2" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All types</option><option value="documents">Documents</option><option value="images">Images</option><option value="videos">Videos</option><option value="others">Others</option></select>
          {view !== "recent" && <><label className="sr-only" htmlFor="fs">Sort by</label><select id="fs" className="input !w-auto !py-2" value={`${sort}:${order}`} onChange={(e) => { const [s, o] = e.target.value.split(":"); setSort(s); setOrder(o); }}><option value="date:desc">Newest</option><option value="date:asc">Oldest</option><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="size:desc">Largest</option><option value="size:asc">Smallest</option><option value="type:asc">Type</option></select></>}</div>
      </div>
      {files.error ? <div className="p-4"><ErrorBox message={files.error} onRetry={files.reload} /></div> : files.loading && !files.data ? <Loading /> : <>
        {view === "all" && !dq && !!folders.data?.items.length && <div className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">{folders.data.items.map((f: any) => <button key={f.id} onClick={() => setFolder(f.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-brand-600 hover:bg-brand-50/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><FolderPlus className="h-4 w-4" /></span><span className="truncate text-base font-semibold">{f.name}</span></button>)}</div>}
        <Table rowKey={(f: any) => f.id} rows={files.data?.items || []}
          empty={<Empty title={dq || cat ? "No files match your search" : view === "trash" ? "Trash is empty" : view === "favorites" ? "No favorites yet" : view === "recent" ? "No recent files" : "No files yet"} hint={view === "all" && !dq ? "Upload a file to get started. It will be encrypted before it is stored." : view === "favorites" ? "Star a file in My Files to find it here." : undefined} />}
          cols={[{ key: "n", header: "Name", render: (f: any) => <div className="flex items-center gap-3"><FileIcon ext={f.ext} cat={f.category} /><div className="min-w-0"><p className="truncate text-lg font-semibold text-slate-900">{f.name}</p>{view === "trash" && <p className="text-sm text-slate-500">Deleted {fmtDate(f.deleted_at)}</p>}</div></div> },
            { key: "s", header: "Size", render: (f: any) => fmtBytes(f.size) }, { key: "t", header: "Type", render: (f: any) => catBadge(f.category) }, { key: "d", header: "Uploaded", render: (f: any) => fmtDate(f.created_at) },
            { key: "a", header: "Actions", className: "text-right", render: (f: any) => <FileRow f={f} mode={mode} onChange={reload} onNotify={notify} /> }]} />
        {files.data && <Pagination page={page} pageSize={25} total={files.data.total} onChange={setPage} />}</>}
    </div>
    {upload && <UploadModal folderId={folder} onClose={() => setUpload(false)} onDone={reload} />}
    <Modal open={newFolder} onClose={() => setNewFolder(false)} title="New folder">{ferr && <div className="mb-3"><ErrorBox message={ferr} /></div>}<Field label="Folder name" htmlFor="nf"><input id="nf" className="input" value={fname} onChange={(e) => setFname(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fname && mkFolder()} autoFocus /></Field><div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setNewFolder(false)}>Cancel</button><button className="btn-primary" disabled={!fname.trim()} onClick={mkFolder}>Create</button></div></Modal>
    {node}
  </>;
}
export const MyFiles = () => <FilesList view="all" title="My Files" subtitle="Everything you've uploaded, encrypted at rest." />;
export const Recent = () => <FilesList view="recent" title="Recent" subtitle="Files you've uploaded, opened or changed most recently." />;
export const Favorites = () => <FilesList view="favorites" title="Favorites" subtitle="Files you've starred." />;
export const Trash = () => <FilesList view="trash" title="Trash" subtitle="Restore files or remove them permanently." />;

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const { user } = useAuth(); const a = useFetch<any>("/analytics/overview", { }); const st = useFetch<any>("/users/me/storage"); const act = useFetch<any>("/activity", { page_size: 6 }); const sh = useFetch<any>("/shares/with-me");
  if (a.error) return <ErrorBox message={a.error} onRetry={a.reload} />; if (!a.data || !st.data) return <Loading />;
  const s = a.data.summary;
  return <>
    <PageHeader title={`Welcome back, ${user?.full_name.split(" ")[0]}`} subtitle="Here's what's happening with your files." actions={<><Link to="/app/files" className="btn-primary"><Upload className="h-4 w-4" />Upload files</Link><Link to="/app/shared-by-me" className="btn-secondary"><Share2 className="h-4 w-4" />Share</Link></>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<HardDrive className="h-7 w-7 text-brand-600" />} tint="bg-brand-50" label="Storage used" value={fmtBytes(st.data.used)} sub={`of ${fmtBytes(st.data.quota)}`} />
      <StatCard icon={<CloudUpload className="h-7 w-7 text-emerald-600" />} tint="bg-emerald-50" label="Uploads (30 days)" value={s.uploads.value} change={s.uploads.change_pct} />
      <StatCard icon={<Download className="h-7 w-7 text-violet-600" />} tint="bg-violet-50" label="Downloads (30 days)" value={s.downloads.value} change={s.downloads.change_pct} />
      <StatCard icon={<Share2 className="h-7 w-7 text-rose-500" />} tint="bg-rose-50" label="Shares (30 days)" value={s.shares.value} change={s.shares.change_pct} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Recent uploads" right={<Link to="/app/recent" className="text-base font-semibold text-brand-600">View all</Link>}>
        <Table rowKey={(f: any) => f.id} rows={a.data.recent_uploads.slice(0, 5)} empty={<Empty title="No uploads yet" hint="Upload your first file from My Files." />} cols={[{ key: "n", header: "File", render: (f: any) => <span className="flex items-center gap-2"><FileIcon ext={f.ext} />{f.name}</span> }, { key: "s", header: "Size", render: (f: any) => fmtBytes(f.size) }, { key: "d", header: "Date", render: (f: any) => fmtDate(f.created_at) }]} /></Section>
      <Section title="Shared with me" right={<Link to="/app/shared-with-me" className="text-base font-semibold text-brand-600">View all</Link>}>
        <Table rowKey={(x: any) => x.id} rows={(sh.data?.items || []).slice(0, 5)} empty={<Empty title="Nothing shared with you" />} cols={[{ key: "n", header: "File", render: (x: any) => x.file.name }, { key: "o", header: "From", render: (x: any) => x.file.owner.name }, { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{x.status}</Badge> }]} /></Section>
      <Section title="Recent downloads"><Table rowKey={(_: any, ) => Math.random()} rows={a.data.recent_downloads.slice(0, 5)} empty={<Empty title="No downloads yet" />} cols={[{ key: "n", header: "File", render: (x: any) => x.name }, { key: "b", header: "By", render: (x: any) => x.by }, { key: "d", header: "Date", render: (x: any) => fmtDate(x.created_at) }]} /></Section>
      <Section title="Recent activity" right={<Link to="/app/activity" className="text-base font-semibold text-brand-600">View all</Link>}>
        {act.data?.items.length ? <ul className="divide-y divide-slate-100">{act.data.items.map((x: any) => <li key={x.id} className="flex items-center justify-between py-2.5 text-base"><span className="font-medium">{x.action}</span><span className="text-sm
         text-slate-500">{fmtDate(x.created_at)}</span></li>)}</ul> : <Empty title="No activity yet" />}</Section>
    </div></>;
}

/* ---------------- Shared with me / by me ---------------- */
export function SharedWithMe() {
  const { data, error, loading, reload } = useFetch<any>("/shares/with-me"); const { notify, node } = useToast();
  const [grants, setGrants] = useState<Record<string, string>>({});
  const [gate, setGate] = useState<any>(null); const [code, setCode] = useState(""); const [gbusy, setGbusy] = useState(false); const [gerr, setGerr] = useState<string | null>(null);

  const run = async (id: string, kind: "view" | "download", name: string, token?: string) => {
    const headers = token ? { "X-Share-Passcode-Token": token } : undefined;
    try {
      if (kind === "view") await openBlob(`/shares/${id}/view`, undefined, headers);
      else await openBlob(`/shares/${id}/download`, name, headers);
      reload();
    } catch (e: any) {
      const detail = e.response?.data instanceof Blob ? JSON.parse(await e.response.data.text()).detail : errMsg(e);
      notify(detail, true);
      // The server marks a locked share with `X-Share-Passcode: required`; fall back to the status/detail
      // in case a proxy strips the header so the passcode prompt always appears.
      const needsPasscode = e.response?.headers?.["x-share-passcode"] === "required"
        || (e.response?.status === 401 && /passcode/i.test(String(detail)));
      if (needsPasscode) { setGrants((g) => { const n = { ...g }; delete n[id]; return n; }); setGate({ id, kind, name }); }
      reload();
    }
  };

  const act = (x: any, kind: "view" | "download") => {
    const tok = grants[x.id];
    if (x.passcode_protected && !tok) { setCode(""); setGerr(null); setGate({ id: x.id, kind, name: x.file.name }); return; }
    run(x.id, kind, x.file.name, tok);
  };

  const unlock = async () => {
    setGbusy(true); setGerr(null);
    try {
      const r = await api.post(`/shares/${gate.id}/verify`, { passcode: code });
      const tok = r.data.passcode_token;
      setGrants((g) => ({ ...g, [gate.id]: tok }));
      const g = gate; setGate(null); setCode("");
      await run(g.id, g.kind, g.name, tok);
    } catch (e) { setGerr(errMsg(e)); }
    finally { setGbusy(false); }
  };

  return <><PageHeader title="Shared with Me" subtitle="Files other TrustShare users have shared directly with you. Downloads are decrypted on the server only after your access is verified." />
    <div className="card">{error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading ? <Loading /> : <Table rowKey={(x: any) => x.id} rows={data.items} empty={<Empty title="Nothing shared with you yet" hint="When someone shares a file with your account it will appear here. Link shares are opened from the link itself." />}
      cols={[{ key: "n", header: "File", render: (x: any) => <span className="flex items-center gap-3"><FileIcon ext={x.file.ext} cat={x.file.category} /><span className="font-semibold">{x.file.name}</span>{x.passcode_protected && <Badge tone="amber"><KeyRound className="h-3 w-3" />Passcode</Badge>}</span> }, { key: "o", header: "Owner", render: (x: any) => x.file.owner.name }, { key: "p", header: "Permission", render: (x: any) => <Badge tone={x.permission === "download" ? "green" : "blue"}>{x.permission === "download" ? "View & download" : "View only"}</Badge> },
        { key: "e", header: "Expires", render: (x: any) => fmtDate(x.expires_at) }, { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{x.status.replace("_", " ")}</Badge> },
        { key: "a", header: "Actions", className: "text-right", render: (x: any) => x.status !== "active" ? <span className="text-xs text-slate-400">Unavailable</span> : <div className="flex justify-end gap-1">{["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "mp4", "webm"].includes(x.file.ext) && <button className="btn-ghost" aria-label="View" onClick={() => act(x, "view")}><Eye className="h-4 w-4" /></button>}{x.permission === "download" && <button className="btn-ghost" aria-label="Download" onClick={() => act(x, "download")}><Download className="h-4 w-4" /></button>}</div> }]} />}</div>
    <Modal open={!!gate} onClose={() => setGate(null)} title="Passcode required">
      <p className="mb-3 text-sm text-slate-600">This share is protected. Ask the owner for the passcode to open <span className="font-semibold">{gate?.name}</span>.</p>
      {gerr && <div className="mb-3"><Notice kind="warn">{gerr}</Notice></div>}
      <label htmlFor="share-pc" className="mb-1.5 block text-sm font-semibold text-slate-700">Passcode</label>
      <input id="share-pc" className="input" type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && code) unlock(); }} />
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setGate(null)}>Cancel</button><button className="btn-primary" disabled={!code || gbusy} onClick={unlock}>{gbusy ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}Unlock & open</button></div>
    </Modal>{node}</>;
}

export function SharedByMe() {
  const { data, error, loading, reload } = useFetch<any>("/shares/mine"); const dl = useFetch<any>("/downloads/mine"); const { notify, node } = useToast();
  const [revoke, setRevoke] = useState<any>(null); const [busy, setBusy] = useState(false); const [pick, setPick] = useState(false); const [target, setTarget] = useState<any>(null); const [search, setSearch] = useState(""); const ds = useDebounced(search);
  const files = useFetch<any>(pick ? "/files" : null, { q: ds || undefined, page_size: 10 });
  const doRevoke = async () => { setBusy(true); try { await api.post(`/shares/${revoke.id}/revoke`); notify("Share revoked"); setRevoke(null); reload(); } catch (e) { notify(errMsg(e), true); } finally { setBusy(false); } };
  return <><PageHeader title="Shared by Me" subtitle="Links and shares you've created. Revoke any time." actions={<button className="btn-primary" onClick={() => setPick(true)}><Link2 className="h-4 w-4" />New share</button>} />
    <div className="card">{error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading ? <Loading /> : <Table rowKey={(x: any) => x.id} rows={data.items} empty={<Empty title="You haven't shared anything" hint="Create a share link or share with another user." />}
      cols={[{ key: "f", header: "File", render: (x: any) => <span className="flex items-center gap-2 font-semibold">{x.file_name}{x.passcode_protected && <Badge tone="amber"><KeyRound className="h-3 w-3" />Passcode</Badge>}</span> }, { key: "k", header: "Type", render: (x: any) => x.kind === "link" ? <Badge tone="blue">Link</Badge> : <Badge tone="purple">{x.recipient_email}</Badge> }, { key: "p", header: "Permission", render: (x: any) => x.permission },
        { key: "e", header: "Expires", render: (x: any) => fmtDate(x.expires_at) }, { key: "u", header: "Uses", render: (x: any) => x.max_downloads ? `${x.use_count} / ${x.max_downloads}` : x.use_count }, { key: "s", header: "Status", render: (x: any) => <Badge tone={statusTone(x.status)}>{x.status.replace("_", " ")}</Badge> },
        { key: "a", header: "", className: "text-right", render: (x: any) => x.status === "active" ? <button className="btn-secondary !py-1.5 text-red-600" onClick={() => setRevoke(x)}>Revoke</button> : null }]} />}</div>
    <Section className="mt-5" title="Download history for my files"><Table rowKey={(_: any, ) => Math.random()} rows={dl.data?.items || []} empty={<Empty title="No downloads yet" />} cols={[{ key: "f", header: "File", render: (x: any) => x.file_name }, { key: "a", header: "Action", render: (x: any) => x.action }, { key: "b", header: "By", render: (x: any) => x.by }, { key: "v", header: "Via", render: (x: any) => x.via }, { key: "d", header: "Date", render: (x: any) => fmtDate(x.created_at) }]} /></Section>
    <Modal open={pick} onClose={() => setPick(false)} title="Choose a file to share"><input aria-label="Search your files" className="input mb-3" placeholder="Search your files…" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="max-h-72 space-y-1 overflow-auto">{files.loading ? <Spinner /> : files.data?.items.length ? files.data.items.map((f: any) => <button key={f.id} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setTarget(f); setPick(false); }}><FileIcon ext={f.ext} cat={f.category} />{f.name}</button>) : <p className="p-3 text-sm text-slate-500">No files found.</p>}</div></Modal>
    {target && <ShareModal file={target} onClose={() => setTarget(null)} onDone={reload} />}
    <Confirm open={!!revoke} danger busy={busy} title="Revoke this share?" confirmLabel="Revoke" message="Anyone using this link or share will immediately lose access." onClose={() => setRevoke(null)} onConfirm={doRevoke} />{node}</>;
}

/* ---------------- Storage ---------------- */
export function StoragePage() {
  const { data, error, reload } = useFetch<any>("/users/me/storage");
  if (error) return <ErrorBox message={error} onRetry={reload} />; if (!data) return <Loading />;
  const pct = Math.round((data.used / data.quota) * 100 * 10) / 10;
  return <><PageHeader title="Storage" subtitle="Your quota is enforced by the server." />
    <div className="grid gap-5 lg:grid-cols-3">
      <Section title="Usage" className="lg:col-span-2"><div className="flex items-end justify-between"><p className="text-3xl font-bold">{fmtBytes(data.used)}</p><p className="text-sm text-slate-500">of {fmtBytes(data.quota)} · {fmtBytes(data.available)} available</p></div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div><p className="mt-1 text-xs text-slate-500">{pct}% used (includes files in Trash)</p></Section>
      <Section title="Trash"><p className="text-2xl font-bold">{fmtBytes(data.trash.bytes)}</p><p className="text-sm text-slate-500">{data.trash.files} file(s) still count toward your quota.</p><Link to="/app/trash" className="btn-secondary mt-4">Open Trash</Link></Section></div>
    <Section className="mt-5" title="By file type"><Table rowKey={(c: any) => c.category} rows={data.by_category} empty={<Empty title="No files yet" />} cols={[{ key: "c", header: "Category", render: (c: any) => catBadge(c.category) }, { key: "f", header: "Files", render: (c: any) => c.files }, { key: "b", header: "Size", render: (c: any) => fmtBytes(c.bytes) }]} /></Section></>;
}

/* ---------------- File security panel (file dashboard) ---------------- */
function FileSecurityPanel() {
  const { data } = useFetch<any>("/my-security/overview");
  if (!data) return null;
  const f = data.files, s = data.shares, se = data.series;
  return <div className="mt-6">
    <h2 className="mb-3 text-lg font-extrabold tracking-tight text-navy-950">File security analytics</h2>
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <Section title="Temporary Share Links"><div className="flex items-center gap-5"><Donut height={170} data={s.by_status.map((c: any, i: number) => ({ name: c.name, value: c.value, color: DARK_RED[i % DARK_RED.length] }))} center={<div><p className="text-lg font-bold">{s.total}</p><p className="text-[11px] text-slate-500">links</p></div>} />
        <ul className="flex-1 space-y-1.5 text-xs">{s.by_status.map((c: any, i: number) => <li key={c.name} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 capitalize"><i className="h-2.5 w-2.5 rounded-full" style={{ background: DARK_RED[i % DARK_RED.length] }} />{c.name}</span><span className="text-slate-600">{c.value}</span></li>)}</ul></div></Section>
      <Section title="Download Tracking"><Lines area data={se.downloads} keys={["count"]} colors={{ count: "#991b1b" }} names={{ count: "Downloads" }} height={180} empty="No downloads yet" /></Section>
      <Section title="Audit Logging"><Lines area data={se.denied} keys={["count"]} colors={{ count: "#7f1d1d" }} names={{ count: "Denied events" }} height={180} empty="No denied events yet" /></Section>
      <Section title="Secure Token Generation"><SimpleBars data={f.by_master_key} xKey="version" yKey="files" color="#b91c1c" height={180} empty="No encrypted files" /><p className="mt-1 text-[11px] text-slate-500">{f.algorithm} · active master key v{f.active_master_key}</p></Section>
      <Section title="Key Rotation"><SimpleBars data={f.key_age} xKey="bucket" yKey="files" color="#dc2626" height={180} empty="No files" /><p className="mt-1 text-[11px] text-slate-500">{f.rotation_due} file(s) due · policy every {f.policy_days} days</p></Section>
      <Section title="Sign-in security"><Lines data={se.sign_ins} keys={["failed", "success"]} colors={{ failed: "#7f1d1d", success: "#ef4444" }} names={{ failed: "Failed", success: "Successful" }} height={180} empty="No sign-ins yet" /></Section>
    </div>
  </div>;
}

/* ---------------- Analytics ---------------- */
export function Analytics() {
  const r = useRange(30); const { data, error, loading, reload } = useFetch<any>("/analytics/overview", { start: r.start, end: r.end });
  const [uploadsFilter, setUF] = useState("all");
  const s = data?.summary; const used = s?.storage_used || 0;
  return <><PageHeader title="File Analytics" subtitle="Detailed insights about your file storage, uploads, downloads and sharing activity." actions={<RangeSelect r={r} />} />
    {error ? <ErrorBox message={error} onRetry={reload} /> : !data ? <Loading /> : <div className={loading ? "opacity-60 transition" : "transition"}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Database className="h-7 w-7 text-brand-600" />} tint="bg-brand-50" label="Total Storage Used" value={fmtBytes(used)} sub={`of ${fmtBytes(s.quota)}`} />
        <StatCard icon={<CloudUpload className="h-7 w-7 text-emerald-600" />} tint="bg-emerald-50" label="Total Uploads" value={s.uploads.value} change={s.uploads.change_pct} sub="files uploaded in range" />
        <StatCard icon={<Download className="h-7 w-7 text-violet-600" />} tint="bg-violet-50" label="Total Downloads" value={s.downloads.value} change={s.downloads.change_pct} sub="of your files downloaded" />
        <StatCard icon={<Share2 className="h-7 w-7 text-rose-500" />} tint="bg-rose-50" label="Total Shares" value={s.shares.value} change={s.shares.change_pct} sub="shares created" /></div>
      <p className="mt-1 text-xs text-slate-500">Percent changes compare with the previous period of equal length and are hidden when that period had no activity.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Section title="Storage Usage Statistics"><div className="flex flex-wrap items-center gap-6"><Donut data={data.storage_by_type.map((c: any) => ({ name: c.category, value: c.bytes, color: CAT_COLORS[c.category] }))} center={<div><p className="text-xl font-bold">{fmtBytes(used)}</p><p className="text-sm text-slate-500">of {fmtBytes(s.quota)}</p></div>} />
          <ul className="flex-1 space-y-3 text-sm">{data.storage_by_type.map((c: any) => <li key={c.category} className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 capitalize"><i className="h-3 w-3 rounded-full" style={{ background: CAT_COLORS[c.category] }} />{c.category}</span><span className="text-slate-600">{fmtBytes(c.bytes)} ({c.percent}%)</span></li>)}</ul></div>
          <SrSummary>Storage by type: {data.storage_by_type.map((c: any) => `${c.category} ${fmtBytes(c.bytes)}`).join(", ")}.</SrSummary></Section>
        <Section title="File Upload Reports" right={<select aria-label="Upload category" className="input !w-auto !py-1.5 text-xs" value={uploadsFilter} onChange={(e) => setUF(e.target.value)}><option value="all">All categories</option>{Object.keys(CAT_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}</select>}>
          <StackedBars data={data.uploads_series} keys={uploadsFilter === "all" ? Object.keys(CAT_COLORS) : [uploadsFilter]} colors={CAT_COLORS} empty="No uploads in this period" /></Section>
        <Section title="Download Analytics" right={<span className="text-sm text-slate-500">{data.downloads_totals.total} total · {data.downloads_totals.unique_users} unique · {data.downloads_totals.shared} via shares</span>}>
          <Lines area data={data.downloads_series} keys={["total", "unique_users", "shared"]} colors={{ total: "#7f1d1d", unique_users: "#b91c1c", shared: "#dc2626" }} names={{ total: "Total Downloads", unique_users: "Unique Users", shared: "Shared Files Downloads" }} empty="No downloads in this period" /><p className="mt-2 text-xs text-slate-500">Unique users counts signed-in users plus distinct IP addresses for anonymous link visitors.</p></Section>
        <Section title="Sharing Activity Reports"><StackedBars data={data.shares_series} keys={["direct", "link"]} colors={{ direct: "#991b1b", link: "#dc2626" }} empty="No shares in this period" /><p className="mt-2 text-xs text-slate-500">{data.sharing_note}</p></Section>
        <Section title="Recent Uploads" right={<Link to="/app/files" className="text-base font-semibold text-brand-600">View All</Link>}><Table rowKey={(f: any) => f.id} rows={data.recent_uploads.slice(0, 6)} empty={<Empty title="No uploads yet" />} cols={[{ key: "n", header: "File Name", render: (f: any) => <span className="flex items-center gap-2"><FileIcon ext={f.ext} />{f.name}</span> }, { key: "s", header: "Size", render: (f: any) => fmtBytes(f.size) }, { key: "t", header: "Type", render: (f: any) => f.ext.toUpperCase() }, { key: "d", header: "Date & Time", render: (f: any) => fmtDate(f.created_at) }]} /></Section>
        <Section title="Recent Downloads"><Table rowKey={(_: any, ) => Math.random()} rows={data.recent_downloads.slice(0, 6)} empty={<Empty title="No downloads yet" />} cols={[{ key: "n", header: "File Name", render: (f: any) => f.name }, { key: "b", header: "Downloaded By", render: (f: any) => f.by }, { key: "s", header: "Size", render: (f: any) => fmtBytes(f.size) }, { key: "d", header: "Date & Time", render: (f: any) => fmtDate(f.created_at) }]} /></Section>
      </div>
      <FileSecurityPanel /></div>}</>;
}

/* ---------------- Activity ---------------- */
export function ActivityLogs() {
  const [page, setPage] = useState(1); const [type, setType] = useState("");
  const { data, error, loading, reload } = useFetch<any>("/activity/me", { page, page_size: 25, activity_type: type || undefined });
  const TYPES = ["login", "login_failed", "logout", "file_upload", "file_download", "file_view", "share_create", "share_revoke", "share_access", "unauthorized_access"];
  return <><PageHeader title="Activity Logs" subtitle="Actions you performed and events concerning your own files." actions={<select aria-label="Filter activity" className="input !w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All activity</option>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>} />
    <div className="card">{error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <><Table rowKey={(x: any) => x.id} rows={data.items} empty={<Empty title="No activity yet" />}
      cols={[{ key: "a", header: "Activity", render: (x: any) => <span className="font-semibold capitalize">{String(x.activity_type).replace(/_/g, " ")}</span> }, { key: "o", header: "Result", render: (x: any) => <Badge tone={x.status === "success" ? "green" : "red"}>{x.status}</Badge> },
        { key: "f", header: "File", render: (x: any) => x.file_name || (x.file_id ? x.file_id : "—") }, { key: "i", header: "IP", render: (x: any) => x.ip || "—" }, { key: "d", header: "Date & Time", render: (x: any) => fmtDate(x.created_at) }]} /><Pagination page={page} pageSize={25} total={data.total} onChange={setPage} /></>}</div></>;
}

/* ---------------- Security (user) ---------------- */
export function SecurityPage() {
  const { data, error, reload } = useFetch<any>("/security/status"); const [sel, setSel] = useState<any>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />; if (!data) return <Loading />;
  const d = data; const anyOAuth = d.oauth.google || d.oauth.microsoft;
  const cards = [
    { icon: Lock, t: "AES-256 Encryption", st: d.encryption.enabled ? ["Active", "green"] : ["Inactive", "red"], d: "Files are encrypted on the server with AES-256-GCM before being written to storage. Keys never reach your browser.", rows: [["Algorithm", d.encryption.algorithm], ["Scheme", d.encryption.scheme], ["Master key version", `v${d.encryption.key_version}`], ["Key source", d.encryption.key_source], ["Storage backend", d.encryption.storage_backend], ["Your encrypted files", d.encryption.files_encrypted]] },
    { icon: Globe, t: "HTTPS/TLS Communication", st: d.transport.request_over_https ? ["Active", "green"] : ["Not in use", "amber"], d: "TLS protects data in transit. It must be provided by the deployment (a TLS-terminating proxy).", rows: [["This connection uses HTTPS", d.transport.request_over_https ? "Yes" : "No (plain HTTP)"], ["HSTS enforced by server", d.transport.https_enforced ? "Yes" : "No"], ["Note", d.transport.note]] },
    { icon: KeyRound, t: "JWT Authentication", st: ["Active", "green"], d: "API access uses short-lived signed tokens that are checked on every request and revoked when you sign out.", rows: [["Signing algorithm", d.jwt.algorithm], ["Token lifetime", `${d.jwt.access_token_minutes} minutes (${d.jwt.remember_me_days} days with Remember me)`], ["Revoked on sign-out", "Yes"], ["Refresh tokens", "Not used; sign in again on expiry"]] },
    { icon: UserCheck, t: "OAuth2 Authentication", st: anyOAuth ? ["Configured", "green"] : ["Active", "slate"], d: "Sign in with Google or Microsoft when the administrator has configured provider credentials.", rows: [["Google", d.oauth.google ? "Configured" : "Not configured"], ["Microsoft", d.oauth.microsoft ? "Configured" : "Not configured"], ["Your account linked to", d.oauth.linked_provider || "Password only"]] },
    { icon: Users, t: "Role-Based Access Control", st: ["Active", "green"], d: "Your role is stored on the server. You cannot change it, and administrator data is unavailable to standard users.", rows: [["Your role", d.rbac.role], ["Self-service role change", "Not possible"]] },
    { icon: Link2, t: "Temporary Share Links", st: ["Active", "green"], d: "Create links with view/download permission and an expiry, and revoke them any time.", rows: [["Active links/shares", d.share_links.active], ["Total created", d.share_links.total]], link: ["/app/shared-by-me", "Manage my shares"] },
    { icon: Download, t: "Download Tracking", st: ["Active", "green"], d: "Every authorised download or view of your files is recorded.", rows: [["Records for your files", d.download_tracking.records]], link: ["/app/shared-by-me", "See download history"] },
    { icon: FileText, t: "Audit Logging", st: ["Active", "green"], d: "Security-relevant actions are written to an append-only, hash-chained log. You see only your own activity.", rows: [["Entries about you", d.audit.my_entries]], link: ["/app/activity", "Open Activity Logs"] },
    { icon: Fingerprint, t: "Secure Token Generation", st: ["Active", "green"], d: "Share tokens are 256 bits from a cryptographically secure generator and only a SHA-256 hash is stored.", rows: [["Token size", `${d.tokens.share_token_bytes * 8} bits`], ["Stored as", d.tokens.stored_as]] },
    { icon: RefreshCw, t: "Key Rotation", st: ["Manual", "blue"], d: "Administrators can rotate the master key; existing files stay readable because only their data keys are re-wrapped.", rows: [["Active key version", `v${d.key_rotation.active_version}`], ["Last rotation", d.key_rotation.last_rotation ? fmtDate(d.key_rotation.last_rotation) : "Never"], ["Automatic rotation", "Not configured"], ["Note", d.key_rotation.note]] },
  ];
  return <><PageHeader icon={<ShieldCheck className="h-5 w-5" />} title="Security" subtitle="Live status of the protections applied to your files and account." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map((c) => <div key={c.t} className="card flex flex-col p-4"><div className="flex items-start justify-between gap-2"><span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><c.icon className="h-5 w-5" /></span><Badge tone={c.st[1]}>{c.st[0]}</Badge></div>
      <h2 className="mt-3 text-sm font-bold">{c.t}</h2><p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">{c.d}</p><button className="mt-3 self-start text-sm font-semibold text-brand-600 hover:underline" onClick={() => setSel(c)}>Learn More →</button></div>)}</div>
    <SecurityCharts />
    <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.t || ""} wide>{sel && <><p className="text-sm text-slate-600">{sel.d}</p><dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{sel.rows.map(([k, v]: any) => <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm"><dt className="text-slate-500">{k}</dt><dd className="max-w-[60%] text-right font-medium">{String(v)}</dd></div>)}</dl>{sel.link && <Link to={sel.link[0]} className="btn-primary mt-4" onClick={() => setSel(null)}>{sel.link[1]}</Link>}</>}</Modal></>;
}

/* ---------------- Security charts (user) ---------------- */
function SecurityCharts() {
  const r = useRange(30);
  const { data, error, loading, reload } = useFetch<any>("/my-security/overview", { start: r.start, end: r.end });
  const keys = useFetch<any>("/my-security/keys");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const rotate = async () => {
    setBusy(true); setMsg(null);
    try { const res = await api.post("/my-security/keys/rotate", { mode: "data_key", only_due: true }); setMsg(`Rotated ${res.data.rotated} file key(s)${res.data.failed?.length ? `, ${res.data.failed.length} failed` : ""}.`); keys.reload(); reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  if (error) return <div className="mt-5"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) return <div className="mt-5"><Loading /></div>;
  const f = data.files, s = data.shares, se = data.series, pt = data.password_trigger;
  const tone = pt.state === "alert" ? "red" : pt.state === "watching" ? "amber" : "green";
  return <div className={`mt-6 ${loading ? "opacity-60 transition" : "transition"}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-extrabold tracking-tight text-navy-950">File &amp; Security Analytics</h2>
      <RangeSelect r={r} />
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={<Lock className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Encrypted files" value={f.encrypted} sub={`${f.algorithm} · key v${f.active_master_key}`} />
      <StatCard icon={<RefreshCw className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Rotation due" value={f.rotation_due} sub={`policy every ${f.policy_days} days`} />
      <StatCard icon={<Link2 className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Temporary share links" value={s.total} sub={`${s.passcode_protected} passcode-protected`} />
      <StatCard icon={<ShieldCheck className="h-7 w-7 text-red-800" />} tint="bg-red-50" label="Failed sign-ins" value={pt.failed_in_range} sub={`${pt.failed_in_window} in last ${pt.window_minutes} min`} />
    </div>

    <div className="mt-5">
      <Section title="Incorrect-password security trigger"
        right={<Badge tone={tone}>{pt.state === "alert" ? "Alert" : pt.state === "watching" ? "Watching" : "Clear"}</Badge>}>
        <p className="text-sm text-slate-600">The trigger fires when {pt.threshold} or more incorrect password attempts occur within {pt.window_minutes} minutes on your account.
          Currently <strong>{pt.failed_in_window}</strong> failed attempt(s) in that window.</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pt.failed_in_window} aria-valuemin={0} aria-valuemax={pt.threshold}>
          <div className={`h-full rounded-full ${pt.state === "alert" ? "bg-red-700" : "bg-red-400"}`} style={{ width: `${Math.min(100, (pt.failed_in_window / Math.max(1, pt.threshold)) * 100)}%` }} /></div>
        {pt.recent_failed?.length > 0 && <ul className="mt-3 space-y-1 text-xs text-slate-600">{pt.recent_failed.slice(0, 5).map((x: any, i: number) => <li key={i} className="flex flex-wrap justify-between gap-2 rounded-lg bg-red-50/60 px-3 py-1.5"><span>{fmtDate(x.at)} · {x.ip || "unknown IP"}</span><span className="text-slate-500">{x.reason || "wrong password"}</span></li>)}</ul>}
      </Section>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Section title="Files by encryption master key"><SimpleBars data={f.by_master_key} xKey="version" yKey="files" color="#7f1d1d" empty="No files yet" /></Section>
      <Section title="Encryption key age distribution"><SimpleBars data={f.key_age} xKey="bucket" yKey="files" color="#991b1b" empty="No files yet" /></Section>
      <Section title="Files by type"><div className="flex flex-wrap items-center gap-6"><Donut data={f.by_type.map((c: any, i: number) => ({ name: c.category, value: c.files, color: DARK_RED[i % DARK_RED.length] }))} center={<div><p className="text-xl font-bold">{f.total}</p><p className="text-sm text-slate-500">files</p></div>} />
        <ul className="flex-1 space-y-2 text-sm">{f.by_type.map((c: any, i: number) => <li key={c.category} className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 capitalize"><i className="h-3 w-3 rounded-full" style={{ background: DARK_RED[i % DARK_RED.length] }} />{c.category}</span><span className="text-slate-600">{c.files}</span></li>)}</ul></div></Section>
      <Section title="Share links by status"><div className="flex flex-wrap items-center gap-6"><Donut data={s.by_status.map((c: any, i: number) => ({ name: c.name, value: c.value, color: DARK_RED[i % DARK_RED.length] }))} center={<div><p className="text-xl font-bold">{s.total}</p><p className="text-sm text-slate-500">shares</p></div>} />
        <ul className="flex-1 space-y-2 text-sm">{s.by_status.map((c: any, i: number) => <li key={c.name} className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 capitalize"><i className="h-3 w-3 rounded-full" style={{ background: DARK_RED[i % DARK_RED.length] }} />{c.name}</span><span className="text-slate-600">{c.value}</span></li>)}</ul></div></Section>
      <Section title="Sign-in attempts"><Lines data={se.sign_ins} keys={["failed", "success"]} colors={{ failed: "#7f1d1d", success: "#ef4444" }} names={{ failed: "Failed", success: "Successful" }} empty="No sign-ins in this period" /></Section>
      <Section title="Downloads of your files"><Lines area data={se.downloads} keys={["count"]} colors={{ count: "#991b1b" }} names={{ count: "Downloads" }} empty="No downloads in this period" /></Section>
      <Section title="Denied access attempts"><Lines area data={se.denied} keys={["count"]} colors={{ count: "#b91c1c" }} names={{ count: "Denied" }} empty="No denied attempts in this period" /></Section>
      <Section title="Active shares by permission"><SimpleBars data={s.active_by_permission} xKey="name" yKey="value" color="#dc2626" empty="No active shares" /></Section>
    </div>

    <div className="mt-5">
      <Section title="Key rotation" right={<button className="btn-primary !py-1.5 text-xs" disabled={busy || !keys.data?.due} onClick={rotate}>{busy && <Spinner className="h-3.5 w-3.5" />}Rotate due keys</button>}>
        {msg && <div className="mb-3"><Notice kind="success">{msg}</Notice></div>}
        <p className="mb-3 text-sm text-slate-600">Data keys are replaced on request. Files are re-encrypted under a fresh AES-256 key; the old ciphertext is removed only after the database commit succeeds.
          {keys.data && <> <strong>{keys.data.due}</strong> of {keys.data.total} file(s) are due for rotation (policy: every {keys.data.policy?.rotate_every_days} days).</>}</p>
        <Table rowKey={(x: any) => x.id} rows={(keys.data?.files || []).slice(0, 10)} empty={<Empty title="No files yet" />}
          cols={[{ key: "n", header: "File", render: (x: any) => x.name }, { key: "k", header: "Master key", render: (x: any) => `v${x.kek_version}` },
            { key: "a", header: "Key age", render: (x: any) => `${x.age_days}d` }, { key: "l", header: "Last rotated", render: (x: any) => x.last_rotated ? fmtDate(x.last_rotated) : "Never" },
            { key: "s", header: "Status", render: (x: any) => <Badge tone={x.due ? "red" : "green"}>{x.due ? "Due" : "Current"}</Badge> }]} />
      </Section>
    </div>
  </div>;
}

/* ---------------- Settings ---------------- */
export function SettingsPage() {
  const { user, refresh } = useAuth(); const [name, setName] = useState(user?.full_name || ""); const [msg, setMsg] = useState<{ k: "success" | "err"; m: string } | null>(null);
  const [prefs, setPrefs] = useState<any>(user?.prefs || {}); const [pw, setPw] = useState({ cur: "", next: "" }); const [busy, setBusy] = useState("");
  const ok = (m: string) => setMsg({ k: "success", m }); const bad = (e: any) => setMsg({ k: "err", m: errMsg(e) });
  return <><PageHeader title="Settings" subtitle="Manage your profile and sign-in details." />{msg && <div className="mb-4">{msg.k === "err" ? <ErrorBox message={msg.m} /> : <Notice kind="success">{msg.m}</Notice>}</div>}
    <div className="grid max-w-4xl gap-5">
      <Section title="Profile"><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" htmlFor="sn"><input id="sn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Email" htmlFor="se" hint="Email cannot be changed here"><input id="se" className="input" value={user?.email} disabled /></Field></div>
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">Role: <Badge tone="blue">{user?.role}</Badge> Email verification: <Badge tone={user?.is_verified ? "green" : "amber"}>{user?.is_verified ? "Verified" : "Not verified"}</Badge></div>
        <button className="btn-primary mt-4" disabled={busy === "p" || !name.trim()} onClick={async () => { setBusy("p"); try { await api.patch("/users/me", { full_name: name }); await refresh(); ok("Profile updated"); } catch (e) { bad(e); } finally { setBusy(""); } }}>{busy === "p" && <Spinner className="h-4 w-4" />}Save profile</button></Section>
      <Section title="Notification preferences"><p className="mb-3 text-sm text-slate-500">Preferences are saved to your account. Email delivery is not configured on this server, so they currently have no outgoing effect.</p>
        {[["notify_shares", "Tell me when files are shared with me"], ["notify_security", "Tell me about security events on my account"]].map(([k, l]) => <label key={k} className="flex items-center gap-3 py-1.5 text-sm"><input type="checkbox" className="h-4 w-4 rounded" checked={!!prefs[k]} onChange={async (e) => { const n = { ...prefs, [k]: e.target.checked }; setPrefs(n); try { await api.patch("/users/me", { prefs: n }); await refresh(); } catch (x) { bad(x); } }} />{l}</label>)}</Section>
      <Section title="Password">{user?.has_password ? <><div className="grid gap-4 sm:grid-cols-2"><Field label="Current password" htmlFor="cp"><input id="cp" type="password" autoComplete="current-password" className="input" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></Field><Field label="New password" htmlFor="np" hint="8+ characters, letters and numbers"><input id="np" type="password" autoComplete="new-password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field></div>
        <button className="btn-primary mt-4" disabled={busy === "w" || !pw.cur || !pw.next} onClick={async () => { setBusy("w"); try { await api.post("/users/me/password", { current_password: pw.cur, new_password: pw.next }); setPw({ cur: "", next: "" }); ok("Password changed"); } catch (e) { bad(e); } finally { setBusy(""); } }}>{busy === "w" && <Spinner className="h-4 w-4" />}Change password</button></> : <p className="text-sm text-slate-500">Your account signs in with {user?.oauth_provider}; there is no local password.</p>}</Section>
      <Section title="Session"><p className="text-sm text-slate-600">Access tokens expire automatically and are revoked on sign-out.</p></Section></div></>;
}

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import {
  ChevronRight, Download, Eye, Folder as FolderIcon, FolderInput, FolderPlus, History, MoreVertical, Pencil, RotateCcw,
  Share2, Star, Trash2, UploadCloud, Clock, FileX2,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { downloadFrom, fetchBlob } from '@/lib/download';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';
import { ConfirmModal, MoveModal, PromptModal, VersionsModal } from './FileDialogs';
import PreviewModal from './PreviewModal';
import ShareModal from './ShareModal';
import { useToast } from './Toast';
import UploadModal from './UploadModal';
import { EmptyState, ErrorNote, FileIcon, Menu, MenuItem, PageLoader, Table } from './ui';

const CATS = [['', 'All'], ['documents', 'Documents'], ['images', 'Images'], ['videos', 'Videos'], ['others', 'Others']];
const EMPTY = {
  all: ['No files here yet', 'Upload a file to encrypt and store it securely.'],
  recent: ['Nothing recent', 'Files you upload will show up here.'],
  favorites: ['No favorites yet', 'Star a file to find it quickly later.'],
  trash: ['Trash is empty', 'Deleted files stay here for 30 days before they’re removed for good.'],
};

/** Shared file explorer for My Files, Recent, Favorites and Trash. */
export default function FilesBrowser({ view = 'all' }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = user.role !== 'guest';
  const folderId = router.query.folder || null;
  const q = router.query.q || '';

  const [files, setFiles] = useState(null);
  const [folders, setFolders] = useState([]);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('updated_at');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    if (!router.isReady) return;
    api.get('/files', { params: { view, folder_id: folderId || undefined, q: q || undefined, category: category || undefined, sort, order: sort === 'name' ? 'asc' : 'desc' } })
      .then((r) => { setFiles(r.data.items); setError(''); }).catch((e) => setError(errorMessage(e)));
  }, [router.isReady, view, folderId, q, category, sort]);
  const loadFolders = useCallback(() => api.get('/folders').then((r) => setFolders(r.data.items)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFolders(); }, [loadFolders]);
  const refresh = () => { load(); loadFolders(); };

  const run = (fn, ok) => async () => { try { await fn(); if (ok) toast(ok); refresh(); } catch (e) { toast(e.message || errorMessage(e), 'error'); } };
  const browse = view === 'all' && !q && !category;
  const subfolders = browse ? folders.filter((f) => (f.parent_id || null) === folderId) : [];
  const crumbs = [];
  for (let id = folderId; id;) { const f = folders.find((x) => x.id === id); if (!f) break; crumbs.unshift(f); id = f.parent_id; }
  const go = (id) => router.push({ pathname: '/app/files', query: id ? { folder: id } : {} });

  const download = (f) => downloadFrom(`/files/${f.id}/download`, f.name);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          {view === 'all' && !q && (<>
            <button className={clsx('rounded-lg px-2 py-1 font-semibold', !folderId ? 'text-ink' : 'text-brand-600 hover:bg-brand-50')} onClick={() => go(null)}>My Files</button>
            {crumbs.map((c, i) => (<span key={c.id} className="flex items-center gap-1"><ChevronRight className="h-4 w-4 text-ink-faint" />
              <button className={clsx('rounded-lg px-2 py-1 font-semibold', i === crumbs.length - 1 ? 'text-ink' : 'text-brand-600 hover:bg-brand-50')} onClick={() => go(c.id)}>{c.name}</button></span>))}
          </>)}
          {q && <span className="text-ink-soft">Results for “<b className="text-ink">{q}</b>” · <button className="font-semibold text-brand-600" onClick={() => router.push('/app/files')}>Clear</button></span>}
        </div>
        {canWrite && view !== 'trash' && (
          <div className="flex gap-2">
            {view === 'all' && <button className="btn-secondary" onClick={() => setDialog({ type: 'newFolder' })}><FolderPlus className="h-4 w-4" />New folder</button>}
            <button className="btn-primary" onClick={() => setDialog({ type: 'upload' })}><UploadCloud className="h-4 w-4" />Upload</button>
          </div>)}
      </div>

      {view !== 'trash' && view !== 'recent' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
            {CATS.map(([k, l]) => <button key={k} onClick={() => setCategory(k)} aria-pressed={category === k}
              className={clsx('rounded-full px-3.5 py-1.5 text-sm font-semibold', category === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-soft ring-1 ring-slate-200 hover:bg-slate-50')}>{l}</button>)}
          </div>
          <select aria-label="Sort by" className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated_at">Last modified</option><option value="created_at">Date uploaded</option><option value="name">Name</option><option value="size">Size</option>
          </select>
        </div>)}

      {view === 'trash' && files?.length > 0 && <p className="mb-3 flex items-center gap-2 text-sm text-ink-soft"><Clock className="h-4 w-4" />Files in the trash are removed permanently after 30 days.</p>}
      <ErrorNote>{error}</ErrorNote>
      <div className="card overflow-hidden">
        {!files && !error ? <PageLoader /> : files && (subfolders.length + files.length === 0) ? (
          <EmptyState icon={view === 'trash' ? FileX2 : FolderIcon} title={q || category ? 'No matching files' : EMPTY[view][0]} hint={q || category ? 'Try a different search or filter.' : EMPTY[view][1]}
            action={canWrite && view === 'all' && !q && !category && <button className="btn-primary" onClick={() => setDialog({ type: 'upload' })}><UploadCloud className="h-4 w-4" />Upload a file</button>} />
        ) : files && (
          <Table>
            <thead className="bg-slate-50/60"><tr><th className="th">Name</th><th className="th">Size</th><th className="th">{view === 'trash' ? 'Deleted' : 'Modified'}</th><th className="th w-12"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {subfolders.map((f) => (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="td"><button className="flex items-center gap-3 font-semibold" onClick={() => go(f.id)}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-500"><FolderIcon className="h-[18px] w-[18px]" /></div>{f.name}</button></td>
                  <td className="td text-ink-soft">{f.file_count} file{f.file_count === 1 ? '' : 's'}</td><td className="td text-ink-soft">{formatDate(f.created_at)}</td>
                  <td className="td">{canWrite && <Menu trigger={<button className="btn-ghost !p-1.5" aria-label={`Actions for ${f.name}`}><MoreVertical className="h-4 w-4" /></button>}>
                    <MenuItem icon={Pencil} onClick={() => setDialog({ type: 'renameFolder', folder: f })}>Rename</MenuItem>
                    <MenuItem icon={Trash2} danger onClick={() => setDialog({ type: 'deleteFolder', folder: f })}>Delete</MenuItem></Menu>}</td>
                </tr>))}
              {files.map((f) => (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <FileIcon category={f.category} name={f.name} />
                      <button className="min-w-0 truncate text-left font-semibold hover:text-brand-600 disabled:cursor-default disabled:hover:text-ink" disabled={view === 'trash'} onClick={() => setDialog({ type: 'preview', file: f })}>{f.name}</button>
                      {f.is_favorite && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />}
                      {f.current_version > 1 && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-ink-soft">v{f.current_version}</span>}
                    </div>
                  </td>
                  <td className="td text-ink-soft">{formatBytes(f.size_bytes)}</td>
                  <td className="td whitespace-nowrap text-ink-soft" title={formatDate(view === 'trash' ? f.deleted_at : f.updated_at, true)}>{timeAgo(view === 'trash' ? f.deleted_at : f.updated_at)}</td>
                  <td className="td">
                    <Menu trigger={<button className="btn-ghost !p-1.5" aria-label={`Actions for ${f.name}`}><MoreVertical className="h-4 w-4" /></button>}>
                      {view === 'trash' ? (<>
                        <MenuItem icon={RotateCcw} onClick={run(() => api.post(`/files/${f.id}/restore`), 'File restored')}>Restore</MenuItem>
                        <MenuItem icon={Trash2} danger onClick={() => setDialog({ type: 'purge', file: f })}>Delete permanently</MenuItem></>) : (<>
                        <MenuItem icon={Eye} onClick={() => setDialog({ type: 'preview', file: f })}>Preview</MenuItem>
                        <MenuItem icon={Download} onClick={run(() => download(f))}>Download</MenuItem>
                        {canWrite && <MenuItem icon={Share2} onClick={() => setDialog({ type: 'share', file: f })}>Share</MenuItem>}
                        {canWrite && <MenuItem icon={Star} onClick={run(() => api.patch(`/files/${f.id}`, { is_favorite: !f.is_favorite }))}>{f.is_favorite ? 'Remove from favorites' : 'Add to favorites'}</MenuItem>}
                        {canWrite && <MenuItem icon={Pencil} onClick={() => setDialog({ type: 'rename', file: f })}>Rename</MenuItem>}
                        {canWrite && <MenuItem icon={FolderInput} onClick={() => setDialog({ type: 'move', file: f })}>Move</MenuItem>}
                        {canWrite && <MenuItem icon={History} onClick={() => setDialog({ type: 'versions', file: f })}>Versions</MenuItem>}
                        {canWrite && <MenuItem icon={Trash2} danger onClick={run(() => api.delete(`/files/${f.id}`), 'Moved to trash')}>Move to trash</MenuItem>}</>)}
                    </Menu>
                  </td>
                </tr>))}
            </tbody>
          </Table>)}
      </div>

      {dialog?.type === 'upload' && <UploadModal folderId={folderId} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === 'newFolder' && <PromptModal title="New folder" label="Folder name" cta="Create" onClose={() => setDialog(null)}
        onSubmit={async (name) => { await api.post('/folders', { name, parent_id: folderId }); refresh(); }} />}
      {dialog?.type === 'renameFolder' && <PromptModal title="Rename folder" label="Folder name" initial={dialog.folder.name} onClose={() => setDialog(null)}
        onSubmit={async (name) => { await api.patch(`/folders/${dialog.folder.id}`, { name }); refresh(); }} />}
      {dialog?.type === 'deleteFolder' && <ConfirmModal title="Delete folder?" danger cta="Delete folder" onClose={() => setDialog(null)}
        message={`“${dialog.folder.name}” and its subfolders will be deleted. Files inside move to the trash.`}
        onConfirm={async () => { await api.delete(`/folders/${dialog.folder.id}`); refresh(); }} />}
      {dialog?.type === 'rename' && <PromptModal title="Rename file" label="File name" initial={dialog.file.name} onClose={() => setDialog(null)}
        onSubmit={async (name) => { await api.patch(`/files/${dialog.file.id}`, { name }); refresh(); }} />}
      {dialog?.type === 'purge' && <ConfirmModal title="Delete permanently?" danger cta="Delete forever" onClose={() => setDialog(null)}
        message={`“${dialog.file.name}” and all its versions will be erased from storage. This can’t be undone.`}
        onConfirm={async () => { await api.delete(`/files/${dialog.file.id}/permanent`); refresh(); }} />}
      {dialog?.type === 'move' && <MoveModal file={dialog.file} folders={folders} onMoved={refresh} onClose={() => setDialog(null)} />}
      {dialog?.type === 'versions' && <VersionsModal file={dialog.file} onChanged={refresh} onClose={() => setDialog(null)} />}
      {dialog?.type === 'share' && <ShareModal file={dialog.file} onClose={() => setDialog(null)} />}
      {dialog?.type === 'preview' && <PreviewModal name={dialog.file.name} load={() => fetchBlob(`/files/${dialog.file.id}/view`)} onDownload={() => download(dialog.file).catch((e) => toast(e.message, 'error'))} onClose={() => setDialog(null)} />}
    </div>
  );
}

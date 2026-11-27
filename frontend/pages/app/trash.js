import AppShell from '@/components/AppShell';
import FilesBrowser from '@/components/FilesBrowser';
export default function Page() {
  return <AppShell title="Trash" subtitle="Deleted files you can still restore." roles={['admin', 'user']}><FilesBrowser view="trash" /></AppShell>;
}

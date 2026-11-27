import AppShell from '@/components/AppShell';
import FilesBrowser from '@/components/FilesBrowser';
export default function Page() {
  return <AppShell title="Recent" subtitle="Your latest uploads." roles={['admin', 'user']}><FilesBrowser view="recent" /></AppShell>;
}

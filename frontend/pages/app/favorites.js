import AppShell from '@/components/AppShell';
import FilesBrowser from '@/components/FilesBrowser';
export default function Page() {
  return <AppShell title="Favorites" subtitle="Files you’ve starred." roles={['admin', 'user']}><FilesBrowser view="favorites" /></AppShell>;
}

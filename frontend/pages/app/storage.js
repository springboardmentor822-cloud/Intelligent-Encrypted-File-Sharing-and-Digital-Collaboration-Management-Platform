import AppShell from '@/components/AppShell';
import StorageView from '@/components/StorageView';
export default function Page() {
  return <AppShell title="Storage" subtitle="See what’s using your space." roles={['admin', 'user']}><StorageView /></AppShell>;
}

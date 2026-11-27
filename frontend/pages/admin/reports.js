import AppShell from '@/components/AppShell';
import ReportsView from '@/components/ReportsView';

export default function Page() {
  return (
    <AppShell title="Reports" subtitle="File upload, download, sharing, user activity and security reports." roles={['admin']}>
      <ReportsView />
    </AppShell>
  );
}

import AppShell from '@/components/AppShell';
import StorageAnalytics from '@/components/StorageAnalytics';

export default function Page() {
  return (
    <AppShell title="Storage Analytics" subtitle="Storage consumption, user-wise usage and file activity across the platform." roles={['admin']}>
      <StorageAnalytics />
    </AppShell>
  );
}

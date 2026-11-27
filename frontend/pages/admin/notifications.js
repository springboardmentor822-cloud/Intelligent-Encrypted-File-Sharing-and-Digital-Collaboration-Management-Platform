import AppShell from '@/components/AppShell';
import NotificationAdmin from '@/components/NotificationAdmin';

export default function Page() {
  return (
    <AppShell title="Notification Management" subtitle="Review every notification and send announcements." roles={['admin']}>
      <NotificationAdmin />
    </AppShell>
  );
}

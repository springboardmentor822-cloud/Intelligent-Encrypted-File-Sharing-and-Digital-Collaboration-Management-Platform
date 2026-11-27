import AppShell from '@/components/AppShell';
import NotificationsPage from '@/components/NotificationsPage';

export default function Page() {
  return (
    <AppShell title="Notifications" subtitle="Your notification history: shares, downloads, alerts and reminders.">
      <NotificationsPage />
    </AppShell>
  );
}

import AppShell from '@/components/AppShell';
import { AdminHome } from '@/components/AdminViews';
export default function Page() {
  return (
    <AppShell title="Admin Dashboard" subtitle="Platform health, usage and security at a glance." roles={['admin']}>
      <AdminHome />
    </AppShell>
  );
}

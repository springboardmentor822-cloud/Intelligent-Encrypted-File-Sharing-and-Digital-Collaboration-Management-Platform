import AppShell from '@/components/AppShell';
import { AdminUsers } from '@/components/AdminViews';
export default function Page() {
  return (
    <AppShell title="User Management" subtitle="Add people, change roles and manage account access." roles={['admin']}>
      <AdminUsers />
    </AppShell>
  );
}

import AppShell from '@/components/AppShell';
import { AdminLogs } from '@/components/AdminSecurity';
export default function Page() {
  return (
    <AppShell title="Activity Logs" subtitle="Audit trail, sign-ins, security events and blocked requests." roles={['admin']}>
      <AdminLogs />
    </AppShell>
  );
}

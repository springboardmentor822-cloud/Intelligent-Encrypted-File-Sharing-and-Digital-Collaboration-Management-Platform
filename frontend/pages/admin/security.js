import AppShell from '@/components/AppShell';
import { SecurityDashboard } from '@/components/AdminSecurity';
export default function Page() {
  return (
    <AppShell title="Security Dashboard" subtitle="Monitor login activity, access attempts, security events and audit logs." roles={['admin']}>
      <SecurityDashboard />
    </AppShell>
  );
}

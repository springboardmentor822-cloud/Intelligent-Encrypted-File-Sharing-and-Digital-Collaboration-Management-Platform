import AppShell from '@/components/AppShell';
import { AdminSystem } from '@/components/AdminViews';
export default function Page() {
  return (
    <AppShell title="System Monitoring" subtitle="Service health and encryption key management." roles={['admin']}>
      <AdminSystem />
    </AppShell>
  );
}

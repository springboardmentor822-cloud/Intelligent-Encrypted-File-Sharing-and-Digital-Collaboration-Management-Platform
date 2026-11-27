import AppShell from '@/components/AppShell';
import { AdminSharing } from '@/components/AdminViews';
export default function Page() {
  return (
    <AppShell title="Sharing Reports" subtitle="How files are being shared across TrustShare." roles={['admin']}>
      <AdminSharing />
    </AppShell>
  );
}

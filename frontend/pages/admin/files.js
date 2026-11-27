import AppShell from '@/components/AppShell';
import { AdminFiles } from '@/components/AdminViews';
export default function Page() {
  return (
    <AppShell title="File Management" subtitle="Every file on the platform. Details only, never contents." roles={['admin']}>
      <AdminFiles />
    </AppShell>
  );
}

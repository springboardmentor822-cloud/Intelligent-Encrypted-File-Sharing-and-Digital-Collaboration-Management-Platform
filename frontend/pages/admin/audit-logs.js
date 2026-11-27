import AppShell from '@/components/AppShell';
import AuditExplorer from '@/components/AuditExplorer';

export default function Page() {
  return (
    <AppShell title="Audit Logs" subtitle="The complete history of user and file activity. Filter, investigate and export." roles={['admin']}>
      <AuditExplorer />
    </AppShell>
  );
}

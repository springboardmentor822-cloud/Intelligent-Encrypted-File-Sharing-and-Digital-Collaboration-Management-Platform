import AppShell from '@/components/AppShell';
import FileAnalytics from '@/components/FileAnalytics';
export default function Page() {
  return (
    <AppShell title="Analytics" subtitle="Storage, uploads, downloads and sharing across all users." roles={['admin']}>
      <FileAnalytics endpoint="/admin/analytics" />
    </AppShell>
  );
}

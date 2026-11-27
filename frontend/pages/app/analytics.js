import AppShell from '@/components/AppShell';
import FileAnalytics from '@/components/FileAnalytics';
export default function Page() {
  return <AppShell title="File Analytics" subtitle="Detailed insights about your file storage, uploads, downloads and sharing activity." roles={['admin', 'user']}><FileAnalytics endpoint="/analytics/files" /></AppShell>;
}

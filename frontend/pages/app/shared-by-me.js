import AppShell from '@/components/AppShell';
import { SharedByMe } from '@/components/SharedViews';
export default function Page() {
  return <AppShell title="Shared by Me" subtitle="Links and people that can access your files." roles={['admin', 'user']}><SharedByMe /></AppShell>;
}

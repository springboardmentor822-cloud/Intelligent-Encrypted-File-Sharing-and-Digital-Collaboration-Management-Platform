import AppShell from '@/components/AppShell';
import { SharedWithMe } from '@/components/SharedViews';
export default function Page() {
  return <AppShell title="Shared with Me" subtitle="Files other people have shared with you."><SharedWithMe /></AppShell>;
}

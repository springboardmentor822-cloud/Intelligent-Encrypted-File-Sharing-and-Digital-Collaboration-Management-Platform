import AppShell from '@/components/AppShell';
import ActivityView from '@/components/ActivityView';
export default function Page() {
  return <AppShell title="Activity Logs" subtitle="What you and others did with your files."><ActivityView /></AppShell>;
}

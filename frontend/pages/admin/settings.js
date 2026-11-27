import AppShell from '@/components/AppShell';
import SettingsView from '@/components/SettingsView';
export default function Page() {
  return (
    <AppShell title="Settings" subtitle="Manage your profile and password." roles={['admin']}>
      <SettingsView />
    </AppShell>
  );
}

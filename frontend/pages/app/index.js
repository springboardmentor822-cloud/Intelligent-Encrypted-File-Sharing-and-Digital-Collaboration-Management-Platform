import AppShell from '@/components/AppShell';
import DashboardHome from '@/components/DashboardHome';
export default function Page() {
  return <AppShell title="Dashboard" subtitle="Your secure workspace at a glance." roles={['admin', 'user']}><DashboardHome /></AppShell>;
}

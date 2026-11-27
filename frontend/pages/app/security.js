import AppShell from '@/components/AppShell';
import { UserSecurity } from '@/components/SecurityPanels';
export default function Page() {
  return <AppShell title="Security" subtitle="Your files and account are protected with advanced security measures."><UserSecurity /></AppShell>;
}

import AppShell from '@/components/AppShell';
import SecurityMonitoring from '@/components/SecurityMonitoring';

export default function Page() {
  return (
    <AppShell title="Security Monitoring" subtitle="Suspicious-activity detection, security alerts and investigation status." roles={['admin']}>
      <SecurityMonitoring />
    </AppShell>
  );
}

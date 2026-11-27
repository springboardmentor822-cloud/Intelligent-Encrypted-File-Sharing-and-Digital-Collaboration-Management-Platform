import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import AuthShell, { MfaStep } from '@/components/AuthShell';
import { ErrorNote, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';

export default function OAuthCallback() {
  const router = useRouter();
  const { exchangeOAuth } = useAuth();
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (!router.isReady || started.current) return;
    started.current = true;
    const code = router.query.code;
    if (!code) { setError('This sign-in link is not valid.'); return; }
    exchangeOAuth(String(code))
      .then((res) => (res.mfa_required ? setMfaToken(res.mfa_token) : router.replace(homeFor(res))))
      .catch((e) => setError(errorMessage(e)));
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthShell title={mfaToken ? 'Two-step verification' : 'Signing you in…'} subtitle={mfaToken ? 'Enter the code from your authenticator app.' : 'One moment.'}>
      <ErrorNote>{error}</ErrorNote>
      {mfaToken ? <MfaStep mfaToken={mfaToken} onDone={(u) => router.replace(homeFor(u))} /> : !error && <Spinner className="h-7 w-7" />}
    </AuthShell>
  );
}

import Head from 'next/head';
import '@/styles/globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>TrustShare · Secure file sharing</title>
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 36'%3E%3Cpath d='M16 1 3 6v10c0 9 5.6 16 13 19 7.4-3 13-10 13-19V6L16 1z' fill='%230b63f3'/%3E%3C/svg%3E" />
      </Head>
      <AuthProvider><ToastProvider><Component {...pageProps} /></ToastProvider></AuthProvider>
    </>
  );
}

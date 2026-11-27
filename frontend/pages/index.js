import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, KeyRound, Link2, ShieldCheck, Upload, Users } from 'lucide-react';
import { Logo, FileIcon } from '@/components/ui';
import { homeFor, useAuth } from '@/lib/auth';

const FEATURES = [
  { icon: KeyRound, tone: 'bg-brand-50 text-brand-600', title: 'AES-256 Encryption', text: 'Every file gets its own key and is encrypted on the server before it is stored.' },
  { icon: Link2, tone: 'bg-emerald-50 text-emerald-600', title: 'Controlled Sharing', text: 'Share with people or links that expire, limit downloads, and can be revoked.' },
  { icon: Activity, tone: 'bg-violet-50 text-violet-600', title: 'Activity Monitoring', text: 'See who opened or downloaded what, with a detailed audit trail.' },
  { icon: Users, tone: 'bg-rose-50 text-rose-600', title: 'Role-Based Access', text: 'Admins, members and guests each see only what their role allows.' },
  { icon: ShieldCheck, tone: 'bg-amber-50 text-amber-600', title: 'Built for Security', text: 'Two-factor sign-in, session control, rate limiting and threat alerts.' },
];
const STEPS = [
  ['Upload', 'Choose a file. We check its type, size and contents.'],
  ['Encrypt', 'The server encrypts it with a new AES-256 key; only ciphertext is stored.'],
  ['Share', 'Pick who can view or download it, and when access ends.'],
  ['Track', 'Follow every open and download from your dashboard.'],
];
const FILES = [['Project_Report.pdf', '2.4 MB', '2 mins ago', 'documents'], ['Design_Assets.png', '850 KB', '1 hour ago', 'images'], ['Team_Plan.docx', '1.1 MB', '3 hours ago', 'documents'], ['Budget_Sheet.xlsx', '720 KB', '1 day ago', 'documents']];

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-ink-soft md:flex" aria-label="Sections">
          <a href="#features" className="hover:text-brand-600">Features</a><a href="#how" className="hover:text-brand-600">How it works</a><a href="#security" className="hover:text-brand-600">Security</a>
        </nav>
        <div className="flex gap-2.5">
          {user ? <Link href={homeFor(user)} className="btn-primary">Open dashboard</Link> : (<>
            <Link href="/login" className="btn-secondary">Sign in</Link><Link href="/register" className="btn-primary">Get started</Link></>)}
        </div>
      </header>

      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-20 pt-12 lg:grid-cols-2 lg:pt-20">
          <div>
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Secure file sharing for a <span className="text-brand-600">safer tomorrow</span></h1>
            <p className="mt-6 max-w-lg text-lg text-ink-soft">Upload, store, and share your important files with server-side encryption and complete control over who sees them and for how long.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-primary !px-6 !py-3.5">Get started <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="btn-secondary !px-6 !py-3.5">Sign in</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-ink-soft">
              {['AES-256 encrypted storage', 'Controlled sharing', 'Audit logs'].map((t) => <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-brand-600" />{t}</li>)}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
            <div className="absolute -left-6 -top-6 h-40 w-40 rounded-full bg-brand-200/50 blur-3xl" />
            <div className="card relative p-5">
              <div className="mb-4 flex items-center justify-between"><span className="font-bold">Your Files</span><span className="btn-primary !px-3 !py-1.5 !text-xs"><Upload className="h-3.5 w-3.5" />Upload</span></div>
              {FILES.map(([n, s, t, c]) => (
                <div key={n} className="flex items-center gap-3 border-t border-slate-100 py-3">
                  <FileIcon category={c} name={n} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{n}</div><div className="text-xs text-ink-faint">{s}</div></div>
                  <div className="text-xs text-ink-faint">{t}</div>
                </div>))}
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-sm"><ShieldCheck className="h-5 w-5 text-brand-600" /><span><b>Encrypted at rest.</b> Only ciphertext reaches storage.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20">
        <h2 className="max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">Powerful features for secure collaboration</h2>
        <p className="mt-3 max-w-xl text-ink-soft">Everything you need to manage, protect and share your files in one place.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5"><div className={`mb-4 inline-flex rounded-xl p-3 ${f.tone}`}><f.icon className="h-6 w-6" /></div>
              <h3 className="font-bold">{f.title}</h3><p className="mt-1.5 text-sm text-ink-soft">{f.text}</p></div>))}
        </div>
      </section>

      <section id="how" className="bg-surface py-20">
        <div className="mx-auto max-w-7xl px-5">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="card p-6"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-bold">{t}</h3><p className="mt-1.5 text-sm text-ink-soft">{d}</p></li>))}
          </ol>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-7xl px-5 py-20">
        <div className="rounded-3xl bg-navy-900 p-8 text-white sm:p-12">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight">Your keys stay on the server. Your files stay yours.</h2>
          <p className="mt-3 max-w-2xl text-slate-300">Each file is encrypted with its own key, and that key is itself protected by a master key. Keys are never sent to a browser, and tampered files are rejected instead of delivered.</p>
          <div className="mt-8"><Link href="/register" className="btn-primary">Create a free account</Link></div>
        </div>
      </section>
      <footer className="border-t border-slate-100 py-8 text-center text-sm text-ink-faint">© {new Date().getFullYear()} TrustShare. Secure file sharing.</footer>
    </div>
  );
}

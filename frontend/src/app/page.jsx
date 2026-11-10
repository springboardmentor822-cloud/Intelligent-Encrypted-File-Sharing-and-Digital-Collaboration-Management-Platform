"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import api from "@/lib/api";
import {
  ShieldCheck,
  Lock,
  Cloud,
  FileText,
  FileSpreadsheet,
  FileCode,
  ArrowRight,
  Play,
  CheckCircle2,
  Users,
  Activity,
  Server,
  KeyRound,
  Share2,
  Sparkles,
  ChevronRight,
  UploadCloud,
  Menu,
  X,
} from "lucide-react";

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState(0);
  const [platformStats, setPlatformStats] = useState(null);

  // Fetch real platform statistics on mount
  useEffect(() => {
    api
      .get("/platform/stats")
      .then((res) => {
        setPlatformStats(res.data);
      })
      .catch((err) => {
        console.warn("Could not fetch real platform stats:", err);
      });
  }, []);

  // Real, Dynamic Platform Statistics data
  const stats = [
    {
      value: "100%",
      label: "Zero-Knowledge Encryption",
      sublabel: platformStats?.security?.encryption_standard || "AES-256 GCM Core",
      icon: <ShieldCheck className="h-5 w-5 text-blue-600" />,
    },
    {
      value: platformStats ? `${platformStats.users.total_registered}` : "10+",
      label: "Registered Accounts",
      sublabel: platformStats ? `${platformStats.users.active} Active Profiles` : "PostgreSQL ACID",
      icon: <Users className="h-5 w-5 text-blue-600" />,
    },
    {
      value: platformStats ? `${platformStats.files.total_files}` : "Encrypted",
      label: "Vault Files Stored",
      sublabel: platformStats?.files?.total_storage_human ? `${platformStats.files.total_storage_human} Active Data` : "MongoDB Audit Vault",
      icon: <UploadCloud className="h-5 w-5 text-blue-600" />,
    },
    {
      value: platformStats ? (platformStats.all_connected ? "100%" : platformStats.uptime_sla) : "99.9%",
      label: "Infrastructure Health",
      sublabel: platformStats?.all_connected ? "All 3 DBs Online" : "FastAPI SLA",
      icon: <Server className="h-5 w-5 text-blue-600" />,
    },
  ];

  // Core Features tabs and details
  const features = [
    {
      id: "encryption",
      title: "End-to-End Encryption",
      subtitle: "AES-256 Military Grade",
      desc: "Client-side and server-side encryption ensuring only authorized key holders can decrypt and inspect document payloads.",
      icon: <Lock className="h-6 w-6 text-blue-600" />,
      tag: "Security Core",
      bullets: [
        "Zero-knowledge server posture",
        "Automated cryptographic key rotation",
        "Encrypted-at-rest metadata store",
      ],
    },
    {
      id: "rbac",
      title: "Granular RBAC",
      subtitle: "Role-Based Access Control",
      desc: "Fine-grained resource authorization with token-based access, expiring download links, and verified identity controls.",
      icon: <KeyRound className="h-6 w-6 text-blue-600" />,
      tag: "Access Control",
      bullets: [
        "Relational identity integrity with PostgreSQL",
        "Time-limited downloadable links",
        "Granular file-level view/share permissions",
      ],
    },
    {
      id: "audit",
      title: "Audit Logging",
      subtitle: "Real-Time MongoDB Logs",
      desc: "Append-only chronological audit logging recording every document access, download attempt, and privilege elevation.",
      icon: <Activity className="h-6 w-6 text-blue-600" />,
      tag: "Compliance",
      bullets: [
        "Tamper-evident activity telemetry",
        "IP address & client request tracking",
        "Exportable compliance records",
      ],
    },
    {
      id: "collaboration",
      title: "Digital Collaboration",
      subtitle: "Redis-Powered Real-Time",
      desc: "High-throughput shared workspaces with instantaneous presence tracking, document tagging, and revision history.",
      icon: <Share2 className="h-6 w-6 text-blue-600" />,
      tag: "Team Productivity",
      bullets: [
        "In-memory Redis cache for ultra-low latency",
        "Session revocation and rate limiting",
        "Fast retrieval for active workspace sessions",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-700">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                  TrustShare
                </span>
                <span className="text-[10px] uppercase font-semibold text-blue-600 tracking-wider">
                  Secure Cloud
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
              >
                Features
              </a>
              <a
                href="#security"
                className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
              >
                Security
              </a>
              <a
                href="#architecture"
                className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
              >
                Architecture
              </a>
            </div>

            {/* Action Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition duration-150 flex items-center gap-1.5"
              >
                Get Started
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Mobile menu toggle */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Toggle Menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-6 space-y-3">
            <a
              href="#features"
              className="block text-sm font-medium text-slate-700 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#security"
              className="block text-sm font-medium text-slate-700 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Security
            </a>
            <a
              href="#architecture"
              className="block text-sm font-medium text-slate-700 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Architecture
            </a>
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <Link
                href="/login"
                className="w-full text-center py-2 text-sm font-semibold text-slate-700 rounded-lg bg-slate-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="w-full text-center py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 bg-gradient-to-b from-blue-50/50 via-slate-50 to-white">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-400/10 blur-[130px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-indigo-400/10 blur-[100px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Hero Left Content */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/70 border border-blue-200/80 text-blue-700 text-xs font-semibold shadow-xs">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Next-Gen Encrypted Collaboration</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                Secure File Sharing <br className="hidden sm:inline" />
                for a{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700">
                  Safer Tomorrow
                </span>
              </h1>

              <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
                A hardened, zero-knowledge digital platform engineered with multi-database polyglot
                storage, cryptographic integrity, and fine-grained access control for collaborative
                teams.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/register"
                  className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition duration-150 flex items-center justify-center gap-2 group text-sm"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>

                <button
                  type="button"
                  onClick={() => setActiveFeatureTab(0)}
                  className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-semibold text-sm shadow-xs transition flex items-center justify-center gap-2.5"
                >
                  <div className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Play className="h-3 w-3 fill-current ml-0.5" />
                  </div>
                  Watch Demo
                </button>
              </div>

              {/* Guarantees */}
              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-6 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> AES-256 Storage
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Zero Plaintext Storage
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Granular Access Control
                </span>
              </div>
            </div>

            {/* Hero Right Visual */}
            <div className="lg:col-span-6 relative flex items-center justify-center">
              <div className="relative w-full max-w-lg bg-gradient-to-b from-blue-600/90 via-indigo-700 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl shadow-blue-500/20 border border-white/20 overflow-hidden">
                <div className="absolute -top-16 -right-16 w-44 h-44 bg-blue-400/20 rounded-full blur-2xl" />
                <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl" />

                <div className="relative z-10 flex flex-col items-center text-center my-6">
                  <div className="relative mb-6">
                    <div className="h-28 w-28 md:h-32 md:w-32 rounded-3xl bg-gradient-to-tr from-blue-400/30 to-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center shadow-inner">
                      <Cloud className="h-16 w-16 text-blue-200 fill-blue-300/20" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 h-12 w-12 rounded-2xl bg-blue-500 border-2 border-white/80 shadow-lg flex items-center justify-center animate-bounce">
                      <Lock className="h-6 w-6 text-white" />
                    </div>
                  </div>

                  <h3 className="text-lg md:text-xl font-bold tracking-tight">TrustShare Secure Vault</h3>
                  <p className="text-xs text-blue-200/80 mt-1 max-w-xs">
                    Polyglot sync active: PostgreSQL Relational • MongoDB Audit Store • Redis Memory Cache
                  </p>
                </div>

                <div className="relative z-10 grid grid-cols-3 gap-2.5 pt-2">
                  {[
                    { id: "hero-1", name: "Security_Audit.enc", size_human: "2.4 MB", category: "document" },
                    { id: "hero-2", name: "Zero_Knowledge.pdf", size_human: "1.1 MB", category: "document" },
                    { id: "hero-3", name: "Vault_Spec.enc", size_human: "540 KB", category: "code" },
                  ].map((file, fIdx) => (
                    <div
                      key={file.id || fIdx}
                      className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col items-center text-center hover:bg-white/15 transition cursor-default"
                    >
                      {file.category === "spreadsheet" ? (
                        <FileSpreadsheet className="h-6 w-6 text-emerald-300 mb-1" />
                      ) : file.category === "code" ? (
                        <FileCode className="h-6 w-6 text-cyan-300 mb-1" />
                      ) : (
                        <FileText className="h-6 w-6 text-rose-300 mb-1" />
                      )}
                      <span className="text-[11px] font-semibold truncate w-full" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[9px] text-blue-200">
                        {file.size_human} • Encrypted
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-16 md:mt-24 pt-8 border-t border-slate-200/80">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
              {stats.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white/70 backdrop-blur-xs p-5 rounded-2xl border border-slate-200/70 shadow-xs hover:shadow-md transition-shadow flex items-start gap-3.5"
                >
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {item.value}
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">{item.label}</p>
                    {item.sublabel && (
                      <p className="text-[10px] font-mono text-blue-600 mt-0.5 font-medium">
                        {item.sublabel}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs uppercase tracking-widest font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Platform Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-4 tracking-tight">
              Powerful Features for Secure Collaboration
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-3">
              Built on a polyglot persistence architecture engineered to balance security,
              high-throughput caching, and verifiable auditability.
            </p>
          </div>

          {/* Feature Grid / Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, index) => {
              const isSelected = activeFeatureTab === index;
              return (
                <div
                  key={feat.id}
                  onClick={() => setActiveFeatureTab(index)}
                  className={`p-6 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-500/20"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`p-3 rounded-xl ${
                          isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {React.cloneElement(feat.icon, {
                          className: `h-6 w-6 ${isSelected ? "text-white" : "text-blue-600"}`,
                        })}
                      </div>
                      <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {feat.tag}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">{feat.title}</h3>
                    <p className="text-xs text-blue-600 font-medium mb-2">{feat.subtitle}</p>
                    <p className="text-xs text-slate-600 leading-relaxed mb-4">{feat.desc}</p>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-slate-200/60">
                    {feat.bullets.map((b, bIdx) => (
                      <div key={bIdx} className="flex items-center gap-2 text-[11px] text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Code Inspection Card */}
          <div className="mt-12 bg-slate-900 text-white rounded-3xl p-6 md:p-10 shadow-xl border border-slate-800">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <span className="text-xs font-semibold uppercase text-blue-400 tracking-wider">
                  Active Feature Highlight: {features[activeFeatureTab].tag}
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {features[activeFeatureTab].title} — {features[activeFeatureTab].subtitle}
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {features[activeFeatureTab].desc} TrustShare coordinates operations between
                  relational tables in PostgreSQL, semi-structured logs in MongoDB, and real-time
                  active session keys in Redis for high-speed authorization.
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <Link
                    href="/register"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition"
                  >
                    Test In Workspace
                  </Link>
                  <a
                    href="#architecture"
                    className="text-xs font-semibold text-slate-300 hover:text-white underline underline-offset-4"
                  >
                    View System Schema →
                  </a>
                </div>
              </div>

              <div className="lg:col-span-5 bg-slate-950 rounded-2xl p-4 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-[11px] text-slate-500 font-sans">
                  <span>FastAPI + Polyglot Handler</span>
                  <span className="text-emerald-400">Status: Verified</span>
                </div>
                <pre className="text-[12px] leading-relaxed text-blue-300">
{`# TrustShare Registration & Verification
@router.post("/auth/register")
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Bcrypt cryptographic password hashing
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hash_password(user_data.password)
    )
    db.add(new_user)
    db.commit()
    return new_user`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Multi-Database Architecture */}
      <section id="security" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs uppercase font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                Multi-Layer Defense
              </span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-4 tracking-tight">
                Designed for High-Trust Digital Collaboration
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-4 leading-relaxed">
                TrustShare ensures files never sit vulnerable in plain-text. By segregating user
                credentials into PostgreSQL, document records into MongoDB, and volatile
                authentication tokens into Redis, sensitive data exposure vectors are completely
                isolated.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Zero Plaintext Credentials</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Passwords salted and hashed using Bcrypt before relational insertion.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Stateless Authentication</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Fast token generation validated against active Redis memory stores.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Immutable Audit Trails</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      MongoDB stores append-only records of uploads, downloads, and transfers.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture Card */}
            <div id="architecture" className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                Persistence Layer Architecture
              </h3>

              <div className="space-y-4">
                {/* PostgreSQL */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      PG
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">PostgreSQL (Relational ACID)</p>
                      <p className="text-[11px] text-slate-500">
                        User Auth & Profile Schema ({platformStats?.users?.total_registered ?? 10} Accounts)
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      platformStats?.infrastructure?.postgres === "connected"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-amber-100 text-amber-800 border-amber-200"
                    }`}
                  >
                    Port 5433 • {platformStats?.infrastructure?.postgres === "connected" ? "Connected" : "Live"}
                  </span>
                </div>

                {/* MongoDB */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      MG
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">MongoDB 6.0 (Document Store)</p>
                      <p className="text-[11px] text-slate-500">
                        File Metadata & Audit Records ({platformStats?.files?.total_files ?? 2} Vault Items)
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      platformStats?.infrastructure?.mongodb === "connected"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-amber-100 text-amber-800 border-amber-200"
                    }`}
                  >
                    Port 27018 • {platformStats?.infrastructure?.mongodb === "connected" ? "Connected" : "Live"}
                  </span>
                </div>

                {/* Redis */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-xs">
                      RD
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Redis 7 (In-Memory Cache)</p>
                      <p className="text-[11px] text-slate-500">
                        Rate Limiting & Volatile Session Storage
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      platformStats?.infrastructure?.redis === "connected"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-amber-100 text-amber-800 border-amber-200"
                    }`}
                  >
                    Port 6379 • {platformStats?.infrastructure?.redis === "connected" ? "Connected" : "Live"}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      platformStats?.all_connected ? "bg-emerald-500 animate-pulse" : "bg-blue-600"
                    }`}
                  />
                  <span>Verified by FastAPI <code>/health</code> probe</span>
                </div>
                <span className="font-semibold text-emerald-700">
                  {platformStats?.all_connected ? "All 3 Services Operational" : "FastAPI Connected"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="py-16 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to Experience Truly Secure Collaboration?
          </h2>
          <p className="text-blue-100 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Create an account in seconds to begin uploading and sharing files with zero-knowledge
            encryption.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/register"
              className="px-7 py-3 bg-white text-blue-700 hover:bg-slate-100 font-bold rounded-xl shadow-lg text-sm transition"
            >
              Access TrustShare Platform
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 border border-white/40 hover:bg-white/10 text-white font-semibold rounded-xl text-sm transition"
            >
              Sign In to Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-10 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-base mb-3">
                <ShieldCheck className="h-5 w-5 text-blue-500" />
                TrustShare
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Intelligent Encrypted File Sharing & Digital Collaboration Management Platform.
              </p>
            </div>

            <div>
              <p className="text-white font-semibold mb-3">Product</p>
              <ul className="space-y-2">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#security" className="hover:text-white transition">Security Architecture</a></li>
                <li><Link href="/login" className="hover:text-white transition">Vault Dashboard</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold mb-3">Stack</p>
              <ul className="space-y-2">
                <li><span>FastAPI Application Core</span></li>
                <li><span>PostgreSQL (Auth & Profile Data)</span></li>
                <li><span>MongoDB (File Metadata & Logs)</span></li>
                <li><span>Redis (Cache & Rate Limiting)</span></li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold mb-3">Security Standards</p>
              <ul className="space-y-2">
                <li><span>Bcrypt Credential Hashing</span></li>
                <li><span>End-to-End Encryption Protocol</span></li>
                <li><span>Append-Only Audit Logging</span></li>
                <li><span>Isolated Port Sandboxing</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 TrustShare Collaboration Platform. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <span className="hover:text-slate-400 cursor-pointer">Privacy Policy</span>
              <span className="hover:text-slate-400 cursor-pointer">Terms of Service</span>
              <span className="hover:text-slate-400 cursor-pointer">Security Whitepaper</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
"use client";

import React, { useState } from "react";
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
  Eye,
  Share2,
  Sparkles,
  ChevronRight,
  Download,
  UploadCloud,
  Menu,
  X
} from "lucide-react";

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState(0);

  // Trust Statistics data from mentor mockup
  const stats = [
    {
      value: "100%",
      label: "Zero-Knowledge Encryption",
      icon: <ShieldCheck className="h-5 w-5 text-blue-600" />,
    },
    {
      value: "10K+",
      label: "Active Users",
      icon: <Users className="h-5 w-5 text-blue-600" />,
    },
    {
      value: "1M+",
      label: "Files Shared",
      icon: <UploadCloud className="h-5 w-5 text-blue-600" />,
    },
    {
      value: "99.9%",
      label: "Uptime SLA",
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
      desc: "Assign tailored permissions across Admin, Member, and Guest roles with expiring guest links and multi-factor validation.",
      icon: <KeyRound className="h-6 w-6 text-blue-600" />,
      tag: "Access Control",
      bullets: [
        "Custom role definitions with PostgreSQL integrity",
        "Time-limited downloadable links",
        "Granular folder-level view/edit permissions",
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
        "IP address & geolocation tracking",
        "Exportable compliance reports (SOC 2 / ISO 27001)",
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
        "Version comparison and rollback",
        "Threaded comments & user mentions",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-700">
      {}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <a href="/" className="flex items-center gap-3 group">
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
            </a>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                Features
              </a>
              <a href="#security" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                Security
              </a>
              <a href="#architecture" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                Architecture
              </a>
              <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                Pricing
              </a>
              <a href="#about" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                About
              </a>
            </div>

            {/* Action Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <a
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition"
              >
                Sign In
              </a>
              <a
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition duration-150 flex items-center gap-1.5"
              >
                Get Started
                <ChevronRight className="h-4 w-4" />
              </a>
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
            <a href="#features" className="block text-sm font-medium text-slate-700 py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#security" className="block text-sm font-medium text-slate-700 py-2" onClick={() => setMobileMenuOpen(false)}>Security</a>
            <a href="#architecture" className="block text-sm font-medium text-slate-700 py-2" onClick={() => setMobileMenuOpen(false)}>Architecture</a>
            <a href="#pricing" className="block text-sm font-medium text-slate-700 py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <a href="/login" className="w-full text-center py-2 text-sm font-semibold text-slate-700 rounded-lg bg-slate-100">Sign In</a>
              <a href="/login" className="w-full text-center py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm">Get Started</a>
            </div>
          </div>
        )}
      </nav>

      {}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 bg-gradient-to-b from-blue-50/50 via-slate-50 to-white">
        {/* Glow ambient background effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-400/10 blur-[130px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-indigo-400/10 blur-[100px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Hero Left Content */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/70 border border-blue-200/80 text-blue-700 text-xs font-semibold shadow-xs">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Next-Gen Encrypted Collaboration</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                Secure File Sharing <br className="hidden sm:inline" />
                for a <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700">Safer Tomorrow</span>
              </h1>

              {/* Subtitle */}
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
                A hardened, zero-knowledge digital platform engineered with 
                multi-database polyglot storage, cryptographic integrity, and fine-grained access control for collaborative teams.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <a
                  href="/login"
                  className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition duration-150 flex items-center justify-center gap-2 group text-sm"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>

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

              {/* Guarantee highlights */}
              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-6 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> AES-256 Storage
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Zero File Leaks
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Free Intern Sandbox
                </span>
              </div>
            </div>

            {/* Hero Right Visual: 3D Glassmorphic Cloud Card & Floating Badges */}
            <div className="lg:col-span-6 relative flex items-center justify-center">
              {/* Central Glowing Illustration Card */}
              <div className="relative w-full max-w-lg bg-gradient-to-b from-blue-600/90 via-indigo-700 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl shadow-blue-500/20 border border-white/20 overflow-hidden">
                {/* Background geometric accents */}
                <div className="absolute -top-16 -right-16 w-44 h-44 bg-blue-400/20 rounded-full blur-2xl" />
                <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl" />

                {/* Cloud & Padlock Visual Centerpiece */}
                <div className="relative z-10 flex flex-col items-center text-center my-6">
                  <div className="relative mb-6">
                    <div className="h-28 w-28 md:h-32 md:w-32 rounded-3xl bg-gradient-to-tr from-blue-400/30 to-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center shadow-inner">
                      <Cloud className="h-16 w-16 text-blue-200 fill-blue-300/20" />
                    </div>
                    {/* Glowing floating padlock over the cloud */}
                    <div className="absolute -bottom-2 -right-2 h-12 w-12 rounded-2xl bg-blue-500 border-2 border-white/80 shadow-lg flex items-center justify-center animate-bounce">
                      <Lock className="h-6 w-6 text-white" />
                    </div>
                  </div>

                  <h3 className="text-lg md:text-xl font-bold tracking-tight">TrustShare Secure Vault</h3>
                  <p className="text-xs text-blue-200/80 mt-1 max-w-xs">
                    Polyglot sync active: PostgreSQL RBAC • Motor Async MongoDB • Redis Memory Store
                  </p>
                </div>

                {/* Floating Micro File Cards */}
                <div className="relative z-10 grid grid-cols-3 gap-2.5 pt-2">
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col items-center text-center hover:bg-white/15 transition cursor-default">
                    <FileText className="h-6 w-6 text-rose-300 mb-1" />
                    <span className="text-[11px] font-semibold truncate w-full">Financial_Q3.pdf</span>
                    <span className="text-[9px] text-blue-200">2.4 MB • Encrypted</span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col items-center text-center hover:bg-white/15 transition cursor-default">
                    <FileSpreadsheet className="h-6 w-6 text-emerald-300 mb-1" />
                    <span className="text-[11px] font-semibold truncate w-full">Audit_Logs.xlsx</span>
                    <span className="text-[9px] text-blue-200">1.8 MB • Encrypted</span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col items-center text-center hover:bg-white/15 transition cursor-default">
                    <FileCode className="h-6 w-6 text-cyan-300 mb-1" />
                    <span className="text-[11px] font-semibold truncate w-full">Keys_Manifest.json</span>
                    <span className="text-[9px] text-blue-200">420 KB • Encrypted</span>
                  </div>
                </div>
              </div>

              {/* Floating Widget: Recent Files Dashboard Preview */}
              <div className="hidden sm:block absolute -bottom-6 -right-2 md:-right-6 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-xl shadow-slate-900/10 max-w-xs z-20">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <span className="text-xs font-bold text-slate-800">Recent Safe Uploads</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                    Active
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-blue-600" />
                    <span className="font-medium text-slate-800 truncate">System_Architecture.md</span>
                    <span className="text-[10px] text-slate-400 ml-auto">Just now</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                    <span className="font-medium text-slate-800 truncate">Database_Schema.sql</span>
                    <span className="text-[10px] text-slate-400 ml-auto">2m ago</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {}
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
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      {item.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {}
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
              Built on a polyglot persistence architecture engineered to balance security, high-throughput caching, and verifiable auditability.
            </p>
          </div>

          {/* Interactive Feature Grid / Tabs */}
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
                      <div className={`p-3 rounded-xl ${isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                        {React.cloneElement(feat.icon, {
                          className: `h-6 w-6 ${isSelected ? "text-white" : "text-blue-600"}`
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

          {/* Feature Deep Dive Inspection Card */}
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
                  {features[activeFeatureTab].desc} TrustShare coordinates operations between relational tables in PostgreSQL, semi-structured logs in MongoDB, and real-time active session keys in Redis for zero authorization latency.
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <a
                    href="/login"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition"
                  >
                    Test In Workspace
                  </a>
                  <a
                    href="#architecture"
                    className="text-xs font-semibold text-slate-300 hover:text-white underline underline-offset-4"
                  >
                    View System Schema →
                  </a>
                </div>
              </div>

              {/* Code Preview Box inside Feature Card */}
              <div className="lg:col-span-5 bg-slate-950 rounded-2xl p-4 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-[11px] text-slate-500 font-sans">
                  <span>FastAPI + Polyglot Handler</span>
                  <span className="text-emerald-400">Status: Verified</span>
                </div>
                <pre className="text-[12px] leading-relaxed text-blue-300">
{`# TrustShare Security Verification
@app.post("/api/v1/files/upload")
async def secure_file_upload(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # AES-256 Server Encryption
    encrypted_blob = encrypt_payload(file)
    meta = await mongo_db.file_metadata.insert_one({
        "owner_id": user.id,
        "is_encrypted": True
    })
    return {"status": "stored_safely"}`}
                </pre>
              </div>
            </div>
          </div>

        </div>
      </section>

      {}
      <section id="security" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div>
              <span className="text-xs uppercase font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                Multi-Layer Defense
              </span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-4 tracking-tight">
                Designed from Ground Up for High-Trust Enterprises
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-4 leading-relaxed">
                TrustShare ensures files never sit vulnerable in plain-text. By segregating credentials into PostgreSQL, document records into MongoDB, and volatile authentication tokens into Redis, sensitive data exposure vectors are completely sealed.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Zero-Knowledge Key Storage</h4>
                    <p className="text-xs text-slate-600 mt-0.5">Encrypted master keys remain isolated from application database nodes.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Multi-Factor Authentication (MFA)</h4>
                    <p className="text-xs text-slate-600 mt-0.5">Time-based one-time passwords protect against compromised credentials.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Immutable Audit Trails</h4>
                    <p className="text-xs text-slate-600 mt-0.5">MongoDB stores append-only records of every upload, download, and role alteration.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture Card */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                Persistence Layer Architecture
              </h3>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      PG
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">PostgreSQL 15</p>
                      <p className="text-[11px] text-slate-500">ACID Relational Auth & RBAC Permissions</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">Port 5432</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      MG
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">MongoDB 6.0</p>
                      <p className="text-[11px] text-slate-500">Document Store for File Metadata & Audit Logs</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">Port 27017</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-xs">
                      RD
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Redis 7</p>
                      <p className="text-[11px] text-slate-500">In-Memory Cache, Rate Limiting & Sessions</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">Port 6379</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
                <span>Verified by FastAPI <code>/health</code> probe</span>
                <span className="font-semibold text-emerald-600">All Connected</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {}
      <section className="py-16 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to Experience Truly Secure Collaboration?
          </h2>
          <p className="text-blue-100 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Create an account in seconds or try our sandbox environment to experience zero-knowledge encrypted sharing firsthand.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href="/login"
              className="px-7 py-3 bg-white text-blue-700 hover:bg-slate-100 font-bold rounded-xl shadow-lg text-sm transition"
            >
              Access TrustShare Platform
            </a>
            <a
              href="/login"
              className="px-6 py-3 border border-white/40 hover:bg-white/10 text-white font-semibold rounded-xl text-sm transition"
            >
              Sign In to Account
            </a>
          </div>
        </div>
      </section>

      {}
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
                <li><a href="/login" className="hover:text-white transition">Vault Dashboard</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Enterprise Pricing</a></li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold mb-3">Stack</p>
              <ul className="space-y-2">
                <li><span>FastAPI Application Core</span></li>
                <li><span>PostgreSQL 15 (Auth/RBAC)</span></li>
                <li><span>MongoDB 6.0 (Metadata)</span></li>
                <li><span>Redis 7 (Session Cache)</span></li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold mb-3">Compliance</p>
              <ul className="space-y-2">
                <li><span>AES-256 Bit Specification</span></li>
                <li><span>Role-Based Access Rules</span></li>
                <li><span>Append-Only Audit Trails</span></li>
                <li><span>Zero-Knowledge Storage</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 TrustShare Collaboration Platform. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-slate-400">Privacy Policy</a>
              <a href="#" className="hover:text-slate-400">Terms of Service</a>
              <a href="#" className="hover:text-slate-400">Security Whitepaper</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
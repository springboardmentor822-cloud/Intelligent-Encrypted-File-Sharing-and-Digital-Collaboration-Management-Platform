"use client";

import React, { useState } from "react";
import {
  Lock,
  Globe,
  KeyRound,
  Users,
  ShieldCheck,
  Link as LinkIcon,
  BarChart3,
  FileCheck,
  Cpu,
  RefreshCw,
  CheckCircle2,
  X,
  ExternalLink,
  Shield,
  Layers,
  ArrowRight
} from "lucide-react";

export default function UserSecuritySection() {
  const [selectedFeature, setSelectedFeature] = useState(null);

  const securityFeatures = [
    {
      id: "aes-256",
      title: "AES-256 Encryption",
      icon: <Lock className="h-6 w-6 text-emerald-600" />,
      iconBg: "bg-emerald-50 border-emerald-100",
      status: "Active",
      description: "All files are encrypted using industry-standard AES-256 encryption before storage.",
      details: {
        headline: "AES-256-GCM Envelope Encryption Architecture",
        algorithm: "AES-256-GCM (Galois/Counter Mode)",
        keyLength: "256-bit Key Encryption Key (KEK) + Unique per-file Data Encryption Keys (DEKs)",
        specs: [
          "Envelope Encryption: Each file is encrypted using its own unique 256-bit Data Encryption Key (DEK).",
          "Zero Plaintext Storage: Ciphertext and cryptographic nonces are stored on disk with zero plaintext exposed.",
          "Tamper Resistance: Authenticated 128-bit GCM authentication tags detect any byte-level tampering or corruption."
        ]
      }
    },
    {
      id: "https-tls",
      title: "HTTPS/TLS Communication",
      icon: <Globe className="h-6 w-6 text-blue-600" />,
      iconBg: "bg-blue-50 border-blue-100",
      status: "Active",
      description: "All data is transmitted securely using HTTPS/TLS encryption.",
      details: {
        headline: "Transport Layer Security (TLS 1.3 / 1.2)",
        algorithm: "TLS_AES_256_GCM_SHA384 & ECDHE Forward Secrecy",
        keyLength: "2048/4096-bit RSA / 256-bit ECC",
        specs: [
          "Encrypted in Transit: Protects data moving between client web browser and TrustShare backend API.",
          "Perfect Forward Secrecy: Unique session keys ensure historical traffic cannot be decrypted even if private keys are compromised.",
          "HSTS Enforcement: Strict Transport Security headers reject unencrypted HTTP connections."
        ]
      }
    },
    {
      id: "jwt-auth",
      title: "JWT Authentication",
      icon: <KeyRound className="h-6 w-6 text-purple-600" />,
      iconBg: "bg-purple-50 border-purple-100",
      status: "Active",
      description: "Secure token-based authentication for protected API access.",
      details: {
        headline: "Stateless RFC 7519 JSON Web Token Framework",
        algorithm: "HS256 (HMAC with SHA-256)",
        keyLength: "256-bit Cryptographic Secret Signature",
        specs: [
          "Stateless Authorization: Protected API routes authenticate bearer tokens without continuous DB lookups.",
          "Instant Blacklisting: Redis cache maintains real-time session revocation lists for instant logouts.",
          "Short Expiration & Refresh: Tokens expire automatically after 24 hours to mitigate credential replay attacks."
        ]
      }
    },
    {
      id: "oauth2",
      title: "OAuth2 Authentication",
      icon: <Users className="h-6 w-6 text-rose-600" />,
      iconBg: "bg-rose-50 border-rose-100",
      status: "Active",
      description: "Sign in using your Google or Microsoft account.",
      details: {
        headline: "Federated Enterprise OAuth2 & OpenID Connect",
        algorithm: "OAuth 2.0 Authorization Code Flow with PKCE",
        keyLength: "OIDC RSA-256 JWT Verification",
        specs: [
          "Single Sign-On (SSO): Seamless and trusted authentication through Google and Microsoft identity providers.",
          "Zero Credential Leakage: Third-party passwords are never handled or stored by TrustShare.",
          "Multi-Tenant Isolation: User identities are strictly partitioned and mapped to internal tenant roles."
        ]
      }
    },
    {
      id: "rbac",
      title: "Role-Based Access Control",
      icon: <ShieldCheck className="h-6 w-6 text-blue-600" />,
      iconBg: "bg-blue-50 border-blue-100",
      status: "Active",
      description: "Access and permissions are managed based on your role.",
      details: {
        headline: "Backend-Enforced Role-Based Access Control (RBAC)",
        algorithm: "FastAPI Dependency Injection + PostgreSQL Constraint Enforcement",
        keyLength: "Granular Role Enumerations (Admin, Standard User)",
        specs: [
          "Strict Backend Enforcement: Unauthorized requests immediately trigger HTTP 403 Forbidden at the API layer.",
          "Isolated Admin Telemetry: Administrative security dashboards and system moderation tools are restricted to verified admins.",
          "Fine-Grained Permissions: File owners control view vs. download permissions on shared resources."
        ]
      }
    },
    {
      id: "temp-links",
      title: "Temporary Share Links",
      icon: <LinkIcon className="h-6 w-6 text-cyan-600" />,
      iconBg: "bg-cyan-50 border-cyan-100",
      status: "Active",
      description: "Create time-limited secure links with custom permissions.",
      details: {
        headline: "Time-To-Live (TTL) Link Lifecycle Engine",
        algorithm: "ISO-8601 UTC Expiration Timestamps & Quota Checks",
        keyLength: "High-Entropy 256-bit URL-Safe Tokenization",
        specs: [
          "Configurable Expiration: Presets for 1 hour, 24 hours, 7 days, 30 days, or custom expiration timestamps.",
          "Max Download Quotas: Restrict link usage to a maximum download count (e.g., 5 downloads) before automatic expiry.",
          "Immediate Revocation: Owners can instantly disable any active link with one click."
        ]
      }
    },
    {
      id: "download-tracking",
      title: "Download Tracking",
      icon: <BarChart3 className="h-6 w-6 text-blue-600" />,
      iconBg: "bg-blue-50 border-blue-100",
      status: "Active",
      description: "Track all file downloads and access history.",
      details: {
        headline: "Real-Time File Access & Download Auditing",
        algorithm: "Atomic Counter Increments + Telemetry Journaling",
        keyLength: "MongoDB Activity Log Collections",
        specs: [
          "Download Counting: Exact counters maintained for both internal and guest-shared downloads.",
          "Caller Telemetry: Logs recipient IP addresses, timestamps, and browser user-agent headers.",
          "Download Limits: Blocks access as soon as the predefined download quota is reached."
        ]
      }
    },
    {
      id: "audit-logging",
      title: "Audit Logging",
      icon: <FileCheck className="h-6 w-6 text-indigo-600" />,
      iconBg: "bg-indigo-50 border-indigo-100",
      status: "Active",
      description: "Maintain detailed logs of all security events and file activities.",
      details: {
        headline: "Immutable Security Audit Journal",
        algorithm: "Append-Only Event Store with ISO-8601 Timestamps",
        keyLength: "MongoDB Activity Log Indexed Collections",
        specs: [
          "Comprehensive Action Coverage: Logs logins, failed authentications, password changes, and file operations.",
          "Search & Filter: Administrators and users can filter logs by action type, username, and time range.",
          "Non-Repudiation: Every cryptographic file access or decryption event is permanently tracked."
        ]
      }
    },
    {
      id: "secure-tokens",
      title: "Secure Token Generation",
      icon: <Cpu className="h-6 w-6 text-sky-600" />,
      iconBg: "bg-sky-50 border-sky-100",
      status: "Active",
      description: "Generate secure tokens for file access and sharing.",
      details: {
        headline: "CSPRNG Cryptographic Token Generation",
        algorithm: "secrets.token_urlsafe(32) with 256-bit Entropy",
        keyLength: "256-bit Cryptographically Secure Random Bits",
        specs: [
          "Cryptographic Randomness: Uses OS-level entropy pool (urandom / CryptGenRandom).",
          "Brute-Force Immunity: 2^256 search space makes token guessing mathematically infeasible.",
          "URL-Safe Formatting: Clean, safe strings for sharing across email, messaging, and browsers."
        ]
      }
    },
    {
      id: "key-rotation",
      title: "Key Rotation",
      icon: <RefreshCw className="h-6 w-6 text-teal-600" />,
      iconBg: "bg-teal-50 border-teal-100",
      status: "Active",
      description: "Encryption keys are rotated periodically for enhanced security.",
      details: {
        headline: "KMS Envelope Key Rotation Strategy",
        algorithm: "Re-wrapping of DEKs via Rotated Master KEK",
        keyLength: "256-bit Key Versioning System",
        specs: [
          "Zero Downtime: Individual per-file DEKs are re-wrapped with new KEK versions without moving data.",
          "Policy Compliance: Adheres to SOC2, ISO 27001, and NIST periodic key replacement standards.",
          "Cryptographic Segregation: Master KEK stored securely and isolated from file payload disks."
        ]
      }
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Title Header matching Image 2 bottom */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-xs">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Security
          </h1>
          <p className="text-sm text-slate-500">
            Your files and account are protected with advanced security measures
          </p>
        </div>
      </div>

      {/* 10 Security Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {securityFeatures.map((feat) => (
          <div
            key={feat.id}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Icon & Active Badge */}
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${feat.iconBg}`}
                >
                  {feat.icon}
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {feat.status}
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition">
                {feat.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {feat.description}
              </p>
            </div>

            {/* Learn More Link */}
            <div className="pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setSelectedFeature(feat)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all cursor-pointer"
              >
                <span>Learn More</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Technical Deep Dive Modal */}
      {selectedFeature && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div
                  className={`h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 ${selectedFeature.iconBg}`}
                >
                  {selectedFeature.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      {selectedFeature.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedFeature.details.headline}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFeature(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="bg-blue-50/70 border border-blue-100 p-3.5 rounded-xl">
                <p className="text-[11px] font-semibold text-blue-900 mb-1">
                  Cryptographic Specification:
                </p>
                <div className="grid grid-cols-2 gap-2 text-slate-700 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-sans">
                      Algorithm
                    </span>
                    {selectedFeature.details.algorithm}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-sans">
                      Key Size
                    </span>
                    {selectedFeature.details.keyLength}
                  </div>
                </div>
              </div>

              <div>
                <p className="font-semibold text-slate-800 mb-2">Security Architecture:</p>
                <ul className="space-y-2 text-slate-600 leading-relaxed">
                  {selectedFeature.details.specs.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedFeature(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                Close Specification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

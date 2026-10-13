"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Search,
  UploadCloud,
  FileText,
  Clock,
  Trash2,
  Share2,
  HardDrive,
  LogOut,
  Bell,
  MoreVertical,
  Download,
  Lock,
  Plus
} from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("all-files");
  const [searchQuery, setSearchQuery] = useState("");

  // Sample placeholder files representing workspace state
  const files = [
    {
      id: "f1",
      name: "Q3_Financial_Audit.pdf",
      size: "2.4 MB",
      type: "PDF",
      uploadedAt: "Oct 12, 2026",
      isEncrypted: true,
    },
    {
      id: "f2",
      name: "System_Architecture_Spec.docx",
      size: "1.8 MB",
      type: "DOCX",
      uploadedAt: "Oct 11, 2026",
      isEncrypted: true,
    },
    {
      id: "f3",
      name: "User_Activity_Metrics.xlsx",
      size: "4.1 MB",
      type: "XLSX",
      uploadedAt: "Oct 09, 2026",
      isEncrypted: true,
    },
    {
      id: "f4",
      name: "Network_Topology_Diagram.png",
      size: "820 KB",
      type: "PNG",
      uploadedAt: "Oct 07, 2026",
      isEncrypted: true,
    },
  ];

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col justify-between p-5 border-r border-slate-800">
        <div>
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-8 px-2">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">TrustShare</span>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1 text-sm font-medium">
            <button
              onClick={() => setActiveTab("all-files")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                activeTab === "all-files"
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>My Vault</span>
            </button>

            <button
              onClick={() => setActiveTab("shared")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                activeTab === "shared"
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Share2 className="h-4 w-4" />
              <span>Shared Files</span>
            </button>

            <button
              onClick={() => setActiveTab("recent")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                activeTab === "recent"
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>Recent Activity</span>
            </button>

            <button
              onClick={() => setActiveTab("trash")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                activeTab === "trash"
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Trash2 className="h-4 w-4" />
              <span>Trash</span>
            </button>
          </nav>
        </div>

        {/* Storage Capacity Bar & Logout */}
        <div className="space-y-5 pt-6 border-t border-slate-800">
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs">
            <div className="flex items-center justify-between text-slate-300 mb-2 font-medium">
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                <span>Storage</span>
              </div>
              <span className="text-slate-400">4.5 / 10 GB</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-500 h-1.5 rounded-full w-[45%]" />
            </div>
          </div>

          <Link
            href="/login"
            className="flex items-center gap-2.5 text-xs font-medium text-slate-400 hover:text-red-400 px-2 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files by name or type..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
            />
          </div>

          {/* User Profile Summary */}
          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-slate-600 relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200">
                P
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <p className="font-semibold text-slate-800">Workspace User</p>
                <p className="text-slate-400">Standard Access</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Body */}
        <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto">
          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workspace Files</h1>
              <p className="text-xs text-slate-500 mt-0.5">Encrypted document storage with multi-database persistence</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Upload File</span>
            </button>
          </div>

          {/* Upload Dropzone Preview */}
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 bg-white/50 transition">
            <UploadCloud className="h-9 w-9 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Drag & drop files here to encrypt and store</p>
            <p className="text-xs text-slate-400 mt-1">Supported formats: PDF, DOCX, XLSX, PNG (Up to 25 MB)</p>
          </div>

          {/* Files Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Name</th>
                    <th className="px-5 py-3.5">Size</th>
                    <th className="px-5 py-3.5">Type</th>
                    <th className="px-5 py-3.5">Upload Date</th>
                    <th className="px-5 py-3.5">Security</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5 font-semibold text-slate-800 flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <span>{file.name}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{file.size}</td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                          {file.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{file.uploadedAt}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                          <Lock className="h-3 w-3" />
                          <span>AES-256</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            title="Download"
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            title="Options"
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredFiles.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-slate-400">
                        No files matching your search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
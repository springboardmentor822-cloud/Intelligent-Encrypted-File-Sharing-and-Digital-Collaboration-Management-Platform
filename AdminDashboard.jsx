import React, { useState } from 'react';

export default function AdminDashboard({ onLogout, onNavigate }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'overview', 'files'
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  // Live Users Database
  const [users, setUsers] = useState([
    { id: 1, name: 'System Administrator', email: 'admin@trustshare.io', role: 'ADMIN', status: 'Active', joined: 'Oct 10, 2026' },
    { id: 2, name: 'Sarah Connor', email: 'sarah.c@acme-corp.com', role: 'USER', status: 'Active', joined: 'Oct 12, 2026' },
    { id: 3, name: 'Guest Auditor', email: 'auditor@external.org', role: 'GUEST', status: 'Pending Review', joined: 'Oct 15, 2026' },
    { id: 4, name: 'Alex Morgan', email: 'alex.morgan@finance.org', role: 'USER', status: 'Active', joined: 'Oct 16, 2026' }
  ]);

  // Form state for adding user
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('USER');

  // File Vault state
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Toggle Role Live (Admin -> User -> Guest -> Admin)
  const toggleUserRole = (id) => {
    setUsers(users.map(u => {
      if (u.id === id) {
        const nextRole = u.role === 'ADMIN' ? 'USER' : (u.role === 'USER' ? 'GUEST' : 'ADMIN');
        showToast(`Updated ${u.name}'s role to ${nextRole}`);
          <nav className="space-y-1 text-sm font-medium">
            <a href="#admin-dash" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">📊 Dashboard</a>
            <button onClick={() => onNavigate('admin-rbac')} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-left">
              👥 User Management
            </button>
            <a href="#files" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">📁 File Management</a>
            <a href="#sharing" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">📤 Sharing Reports</a>
            <button onClick={() => onNavigate('admin-security')} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-blue-600/15 text-cyan-300 font-semibold border-l-4 border-blue-500 text-left">
              🛡️ Security Dashboard
            </button>
            <a href="#analytics" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">📈 Analytics</a>
            <a href="#monitoring" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">🖥️ System Monitoring</a>
            <a href="#activity-logs" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">📋 Activity Logs</a>
            <a href="#settings" className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">⚙️ Settings</a>
          </nav>
  };

  // Add User Handler
  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;

    const newUser = {
      id: Date.now(),
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      status: 'Active',
      joined: 'Today'
    };

    setUsers([newUser, ...users]);
    setNewUserName('');
    setNewUserEmail('');
    setShowAddUserModal(false);
    showToast(`Account created for ${newUser.email} (${newUser.role})`);
  };

  // File Upload Handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadProgress(40);
    setTimeout(() => setUploadProgress(80), 300);
    setTimeout(() => {
      setUploadProgress(100);
      setShowUploadModal(false);
      const newFile = {
        id: Date.now(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.name.split('.').pop().toUpperCase(),
        time: 'Just now'
      };
      setUploadedFiles(prev => [newFile, ...prev]);
      showToast(`Uploaded & Encrypted: ${file.name}`);
    }, 600);
  };

  // Filtered users for search
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const userCount = users.filter(u => u.role === 'USER').length;
  const guestCount = users.filter(u => u.role === 'GUEST').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Floating Notification Toast */}
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 bg-blue-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl border border-blue-400 flex items-center gap-2">
            <span>✓</span> {toastMessage}
          </div>
        )}

        {/* Top Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-500/30">
              TS
            </div>
            <div>
              <span className="font-bold text-white text-lg block">TrustShare Administration Panel</span>
              <span className="text-xs text-slate-400">Role-Based Access Control (RBAC) & Security Cluster</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-medium">
              ● Database Synced
            </span>
            <span className="text-xs bg-blue-500/10 text-cyan-400 border border-blue-500/30 px-3 py-1 rounded-full font-semibold">
              Administrator: admin@trustshare.io
            </span>
            {onLogout && (
              <button onClick={onLogout} className="text-xs text-red-400 hover:text-red-300 transition">Logout</button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              👥 User Management & RBAC ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              📊 System Overview & Storage
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${activeTab === 'files' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              📁 Global File Vault ({uploadedFiles.length})
            </button>
          </div>

          {/* Quick RBAC stats pill */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span>Admins: <b className="text-red-400">{adminCount}</b></span>
            <span>•</span>
            <span>Users: <b className="text-blue-400">{userCount}</b></span>
            <span>•</span>
            <span>Guests: <b className="text-amber-400">{guestCount}</b></span>
          </div>
        </div>

        {/* TAB 1: USER MANAGEMENT (RBAC) */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Registered Accounts & RBAC Permissions</h2>
                <p className="text-xs text-slate-400 mt-0.5">Role definitions: ADMIN (Full Control), USER (Workspace Access), GUEST (Read-Only).</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search user, email, role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20"
                >
                  + Add New User
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 uppercase border-b border-slate-800 bg-slate-950/40">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Interactive Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-semibold text-white">{u.name}</td>
                      <td className="py-3.5 px-4 font-mono">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          u.role === 'ADMIN' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                          u.role === 'USER' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                          'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${u.status === 'Active' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-slate-800'}`}>
                          ● {u.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">{u.joined}</td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => toggleUserRole(u.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium transition"
                          title="Click to cycle role between Admin, User, Guest"
                        >
                          Change Role
                        </button>
                        <button
                          onClick={() => toggleUserStatus(u.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${u.status === 'Active' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                        >
                          {u.status === 'Active' ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SYSTEM OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-semibold text-slate-400 uppercase">Total Accounts</span>
                <div className="text-2xl font-bold text-white mt-1">{users.length} Users</div>
                <span className="text-xs text-emerald-400">PostgreSQL Verified</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-semibold text-slate-400 uppercase">Storage Quota</span>
                <div className="text-2xl font-bold text-white mt-1">5.0 GB Max</div>
                <span className="text-xs text-purple-400">Limit: 25 MB / file</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-semibold text-slate-400 uppercase">Encrypted Documents</span>
                <div className="text-2xl font-bold text-white mt-1">{uploadedFiles.length} Files</div>
                <span className="text-xs text-cyan-400">MongoDB Indexed</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-semibold text-slate-400 uppercase">Redis Session Cache</span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">Operational</div>
                <span className="text-xs text-slate-400">Sub-ms latency</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FILE VAULT */}
        {activeTab === 'files' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Global File Vault</h2>
                <p className="text-xs text-slate-400">Documents verified by backend type validation & stored safely</p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30"
              >
                + Upload Secure Document
              </button>
            </div>

            {uploadedFiles.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                No documents uploaded yet. Click "+ Upload Secure Document" to upload a test file!
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {uploadedFiles.map(f => (
                    <tr key={f.id}>
                      <td className="py-3 px-4 text-white font-medium">{f.name}</td>
                      <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-mono">{f.type}</span></td>
                      <td className="py-3 px-4">{f.size}</td>
                      <td className="py-3 px-4"><span className="text-emerald-400">✓ Encrypted</span></td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => setUploadedFiles(uploadedFiles.filter(item => item.id !== f.id))} className="text-red-400 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* MODAL 1: ADD NEW USER (RBAC) */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">Add User & Assign Role (RBAC)</h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g. David Miller"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="e.g. david@trustshare.io"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Assigned Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="USER">USER (Standard Access)</option>
                  <option value="ADMIN">ADMIN (Full Control)</option>
                  <option value="GUEST">GUEST (Read-Only)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UPLOAD FILE */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-white text-base">Upload Secure Document</h3>
            <label className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer block bg-slate-950">
              <input type="file" className="hidden" onChange={handleFileUpload} />
              <p className="text-xs text-white">Click to select file from PC (Max 25 MB)</p>
              <p className="text-[11px] text-slate-400 mt-1">Accepts PDF, DOCX, XLSX, PNG</p>
            </label>
            {uploadProgress > 0 && (
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
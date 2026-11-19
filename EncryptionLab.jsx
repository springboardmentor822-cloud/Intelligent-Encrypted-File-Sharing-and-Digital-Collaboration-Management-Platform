import React, { useState } from 'react';

export default function EncryptionLab({ onNavigate, user, onLogout }) {
  const [inputText, setInputText] = useState('CONFIDENTIAL: TrustShare Q4 Enterprise Financial Audit & Key Store 2026.');
  const [encryptionResult, setEncryptionResult] = useState(null);
  const [decryptResult, setDecryptResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tampered, setTampered] = useState(false);

  // Quick Preset Samples
  const samples = [
    'CONFIDENTIAL: TrustShare Q4 Enterprise Financial Audit & Key Store 2026.',
    'PATIENT HEALTH RECORD: ID #84920 - Blood Chemistry & Genomic Sequencing (HIPAA Enforced).',
    'DATABASE CREDENTIALS: root_user@trustshare_cluster_primary:sk_live_9482710492837'
  ];

  // Perform Live Encryption (calls the isolated backend demo KEK)
  const handleEncrypt = async () => {
    try {
      setLoading(true);
      setDecryptResult(null);
      setTampered(false);

      const res = await fetch('http://localhost:8000/api/v1/crypto/encrypt-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plaintext: inputText })
      });

      if (res.ok) {
        const data = await res.json();
        setEncryptionResult(data);
      } else {
        const data = await res.json();
        throw new Error(data.detail || 'The encryption service rejected the request.');
      }
    } catch (e) {
      setEncryptionResult({
        status: 'FAILED',
        error: e.message || 'Unable to reach the TrustShare encryption service.',
        integrity_verified: false
      });
    } finally {
      setLoading(false);
    }
  };

  // Perform Live Decryption & Verification
  const handleDecrypt = async (useTampered = false) => {
    if (!encryptionResult) return;

    try {
      let cipherToTest = encryptionResult.full_ciphertext_hex;

      if (useTampered) {
        // Flip a byte to simulate hacker tampering
        const arr = cipherToTest.split('');
        arr[4] = arr[4] === 'a' ? 'b' : 'a';
        cipherToTest = arr.join('');
        setTampered(true);
      } else {
        setTampered(false);
      }

      const res = await fetch('http://localhost:8000/api/v1/crypto/decrypt-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_ciphertext_hex: cipherToTest,
          dek_hex: encryptionResult.dek_hex,
          nonce_hex: encryptionResult.nonce_hex
        })
      });

      if (res.ok) {
        const data = await res.json();
        setDecryptResult(data);
      } else {
        const data = await res.json();
        setDecryptResult({
          status: 'FAILED',
          error: data.detail || 'Decryption verification failed.',
          integrity_verified: false,
          auth_tag_status: 'TAMPER_DETECTED (Integrity Check Failed!)'
        });
      }
    } catch (e) {
      setDecryptResult({
        status: 'FAILED',
        error: e.message || 'Unable to reach the TrustShare decryption service.',
        integrity_verified: false,
        auth_tag_status: 'VERIFICATION_UNAVAILABLE'
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#080d1a] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800/90 bg-[#0c1427]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg text-white tracking-tight">TrustShare Cryptographic Lab</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                AES-256-GCM AEAD
              </span>
            </div>
            <span className="text-xs text-slate-400">Interactive Envelope Encryption &amp; In-Memory Decryption Studio</span>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('file-analytics')}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            ← Vault Files
          </button>
          <button
            onClick={() => onNavigate('admin-security')}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
          >
            Admin Security →
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 transition flex items-center gap-1"
            >
              <span>🚪</span>
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </nav>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full p-6 space-y-8 flex-1">
        {/* Hero Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-[#0d1a33] to-[#08152e] border border-cyan-500/20 rounded-3xl p-6 lg:p-8 shadow-2xl">
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                Cryptographic Suite • NIST SP 800-38D Standard
              </div>
              <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                AES-256-GCM Envelope Encryption Visualizer
              </h1>
              <p className="text-xs lg:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Experience how TrustShare safeguards sensitive files before storage. Every document receives a fresh 
                <span className="text-cyan-300 font-bold"> 256-bit Data Encryption Key (DEK)</span> and a 
                <span className="text-emerald-300 font-bold"> 96-bit Nonce</span>, wrapped with Master 
                <span className="text-purple-300 font-bold"> Key-Encryption-Key (KEK)</span> envelopes with 
                <span className="text-amber-300 font-bold"> 128-bit GHASH authentication tags</span>.
              </p>
            </div>

            {/* Metrics Chips */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-3">
              <div className="bg-slate-900/80 border border-slate-700/60 p-3 rounded-2xl text-center">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Key Length</div>
                <div className="text-lg font-black text-cyan-400">256 Bits</div>
                <div className="text-[9px] text-slate-500">2^256 combinations</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700/60 p-3 rounded-2xl text-center">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Nonce Space</div>
                <div className="text-lg font-black text-emerald-400">96 Bits</div>
                <div className="text-[9px] text-slate-500">CSPRNG generated</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700/60 p-3 rounded-2xl text-center">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Auth Tag</div>
                <div className="text-lg font-black text-amber-400">128 Bits</div>
                <div className="text-[9px] text-slate-500">Zero tamper tolerance</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700/60 p-3 rounded-2xl text-center">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Entropy</div>
                <div className="text-lg font-black text-purple-400">7.98 / 8.0</div>
                <div className="text-[9px] text-slate-500">Maximum randomness</div>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Plaintext Input */}
          <div className="lg:col-span-5 bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                    01
                  </div>
                  <h3 className="text-sm font-bold text-white">Plaintext Input Payload</h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {inputText.length} Bytes
                </span>
              </div>

              {/* Sample Presets */}
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quick Presets:</div>
                <div className="flex flex-wrap gap-1.5">
                  {samples.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setInputText(s)}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      Sample {i + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div>
                <textarea
                  rows="6"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Enter sensitive data or payload to encrypt..."
                  className="w-full bg-[#080d1a] border border-slate-700 rounded-2xl p-4 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                ></textarea>
              </div>
            </div>

            <button
              onClick={handleEncrypt}
              disabled={loading || !inputText}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Generating Cryptographic Envelope...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                  <span>Encrypt with AES-256-GCM Envelope →</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Cryptographic Inspection Pipeline */}
          <div className="lg:col-span-7 bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                  02
                </div>
                <h3 className="text-sm font-bold text-white">Cryptographic Envelope Pipeline</h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                AES-GCM Authenticated Mode
              </span>
            </div>

            {!encryptionResult ? (
              <div className="py-16 text-center text-slate-500 space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800/60 flex items-center justify-center text-slate-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                </div>
                <div className="text-xs font-semibold">Ready for Encryption</div>
                <p className="text-[11px] text-slate-600 max-w-sm mx-auto">
                  Click the button on the left to derive cryptographic parameters, encrypt the payload, and wrap the key.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Data Encryption Key (DEK) */}
                <div className="bg-[#080d1a] border border-slate-800/90 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      1. Generated Data Encryption Key (256-bit DEK)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">32 Bytes • Unique Per File</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-300 break-all bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    {encryptionResult.dek_hex}
                  </div>
                </div>

                {/* 2. Nonce / Initialization Vector */}
                <div className="bg-[#080d1a] border border-slate-800/90 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      2. Cryptographic Nonce (96-bit IV)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">12 Bytes • Replay Protection</span>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-300 break-all bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    {encryptionResult.nonce_hex}
                  </div>
                </div>

                {/* 3. AES-256 Ciphertext */}
                <div className="bg-[#080d1a] border border-slate-800/90 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-blue-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      3. AES-GCM Encrypted Ciphertext
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{encryptionResult.ciphertext_hex.length / 2} Bytes</span>
                  </div>
                  <div className="font-mono text-[11px] text-blue-200 break-all bg-slate-900/80 p-2 rounded-xl border border-slate-800 max-h-20 overflow-y-auto">
                    {encryptionResult.ciphertext_hex}
                  </div>
                </div>

                {/* 4. Auth Tag & Envelope Key */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#080d1a] border border-slate-800/90 rounded-2xl p-3 space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      4. GCM Auth Tag (16 Bytes)
                    </span>
                    <div className="font-mono text-[10px] text-amber-200 break-all bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                      {encryptionResult.auth_tag_hex}
                    </div>
                  </div>

                  <div className="bg-[#080d1a] border border-slate-800/90 rounded-2xl p-3 space-y-1">
                    <span className="text-[10px] font-bold text-purple-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                      5. Wrapped Key Envelope (KEK)
                    </span>
                    <div className="font-mono text-[10px] text-purple-200 break-all bg-slate-900/80 p-1.5 rounded-lg border border-slate-800 truncate">
                      {encryptionResult.wrapped_dek_hex}
                    </div>
                  </div>
                </div>

                {/* Decryption & Tamper Verification Buttons */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2.5">
                  <button
                    onClick={() => handleDecrypt(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>✓ Decrypt &amp; Verify Integrity</span>
                  </button>

                  <button
                    onClick={() => handleDecrypt(true)}
                    className="py-2.5 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-bold text-xs transition flex items-center gap-1.5"
                  >
                    <span>⚡ Tamper 1 Bit (Simulate Attack)</span>
                  </button>
                </div>

                {/* Decryption Result Banner */}
                {decryptResult && (
                  <div
                    className={`p-4 rounded-2xl border text-xs space-y-2 animate-fade-in ${
                      decryptResult.status === 'SUCCESS'
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                        : 'bg-red-950/40 border-red-500/40 text-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-2">
                        <span>{decryptResult.status === 'SUCCESS' ? '🛡️' : '⛔'}</span>
                        <span>{decryptResult.auth_tag_status}</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase">
                        {decryptResult.integrity_verified ? 'Authenticity 100%' : 'Cryptographic Rejection'}
                      </span>
                    </div>

                    {decryptResult.status === 'SUCCESS' ? (
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Recovered Plaintext:</div>
                        <div className="font-mono text-white bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 mt-1">
                          {decryptResult.decrypted_plaintext}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-red-300">
                        {decryptResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

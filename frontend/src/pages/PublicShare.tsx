import { useParams } from "react-router-dom";
import { Download, Eye, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import axios from "axios";
import { fmtBytes, fmtDate } from "../api";
import { useFetch } from "../hooks";
import { Badge, ErrorBox, Loading, Logo, Notice, Spinner } from "../ui";

export default function PublicShare() {
  const { token } = useParams(); const base = `/api/public/shares/${token}`;
  const { data, error, loading } = useFetch<any>(`/public/shares/${token}`);
  const [err, setErr] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pcErr, setPcErr] = useState<string | null>(null);

  const locked = !!data?.passcode_protected && !grant;

  const verify = async (e: FormEvent) => {
    e.preventDefault(); setPcErr(null); setVerifying(true);
    try {
      const r = await axios.post(`${base}/verify`, { passcode });
      setGrant(r.data.passcode_token);
    } catch (x: any) {
      setPcErr(x.response?.data?.detail || "Incorrect passcode");
    } finally { setVerifying(false); }
  };

  const act = async (kind: "view" | "download") => {
    setErr(null);
    // Open the view tab synchronously so the browser does not block it as a pop-up.
    const win = kind === "view" ? window.open("about:blank", "_blank") : null;
    if (win) win.opener = null;
    try {
      const r = await axios.get(`${base}/${kind}`, { responseType: "blob", headers: grant ? { "X-Share-Passcode-Token": grant } : {} });
      const u = URL.createObjectURL(r.data);
      if (kind === "view") {
        if (win) win.location.href = u; else window.open(u, "_blank", "noopener");
      } else {
        const a = document.createElement("a"); a.href = u; a.download = data.file_name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 5000);
      }
    } catch (e: any) {
      if (win) win.close();
      const locked = e.response?.headers?.["x-share-passcode"] === "required"
        || (e.response?.status === 401 && data?.passcode_protected);
      if (locked) { setGrant(null); setPcErr("Please enter the passcode again."); }
      else {
        let msg = "The file could not be opened. Please try again.";
        try {
          if (e.response?.data instanceof Blob) msg = JSON.parse(await e.response.data.text()).detail || msg;
          else msg = e.response?.data?.detail || e.message || msg;
        } catch { /* keep the friendly fallback */ }
        setErr(msg);
      }
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-grad-hero p-4">
      <div className="absolute inset-0 bg-grad-mesh opacity-60" />
      <div className="card relative w-full max-w-md p-8 text-center"><div className="mb-6 flex justify-center"><Logo /></div>
        {loading ? <Loading /> : error ? <><ErrorBox message={error.includes("expired") || error.includes("revoked") ? `This link is ${error.replace("This link is ", "")}` : error} /><p className="mt-4 text-sm text-slate-500">Ask the owner to send you a new link.</p></> : data && <>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-grad-brand text-white shadow-glow"><Lock className="h-7 w-7" /></div>
          <h1 className="mt-4 break-words text-xl font-bold">{data.file_name}</h1><p className="mt-1 text-sm text-slate-500">{fmtBytes(data.size)} · expires {fmtDate(data.expires_at)}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2"><Badge tone={data.permission === "download" ? "green" : "blue"}>{data.permission === "download" ? "View & download" : "View only"}</Badge>{data.passcode_protected && <Badge tone="amber"><KeyRound className="mr-1 h-3 w-3" />Passcode protected</Badge>}</div>

          {locked ? (
            <form onSubmit={verify} className="mt-6 space-y-3 text-left">
              <Notice kind="info"><span className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4" />This share is passcode protected</span><p className="mt-1 text-xs">Enter the passcode the sender shared with you to continue.</p></Notice>
              {pcErr && <ErrorBox message={pcErr} />}
              <label htmlFor="pc" className="text-sm font-semibold text-slate-800">Passcode</label>
              <input id="pc" type="password" autoComplete="off" className="input" placeholder="Enter passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
              <button className="btn-primary w-full" disabled={verifying || !passcode}>{verifying ? <Spinner className="h-4 w-4" /> : <><KeyRound className="h-4 w-4" />Unlock</>}</button>
            </form>
          ) : <>
            {grant && <div className="mt-4"><Notice kind="success">Passcode accepted. You can access this file now.</Notice></div>}
            {err && <div className="mt-4 text-left"><ErrorBox message={err} /></div>}
            <div className="mt-6 flex gap-3">{data.can_preview && <button className="btn-secondary flex-1" onClick={() => act("view")}><Eye className="h-4 w-4" />View</button>}
              {data.permission === "download" ? <button className="btn-primary flex-1" onClick={() => act("download")}><Download className="h-4 w-4" />Download</button> : !data.can_preview && <p className="text-sm text-slate-500">Preview is unavailable for this file type and downloads are not permitted.</p>}</div>
          </>}
          <p className="mt-6 text-xs text-slate-400">Stored encrypted. Decrypted only for this authorised request.</p></>}
      </div></div>);
}

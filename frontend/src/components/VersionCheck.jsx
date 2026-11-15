// Red banner that appears when the React app and the API are not the same version.
// That is the exact situation when "the UI did not change": one of them is an old build.
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import api from "../lib/api";
import { APP_VERSION } from "../version";

export default function VersionCheck() {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.get("/").then((r) => setInfo(r.data)).catch(() => setInfo({ unreachable: true })); }, []);
  if (!info) return null;
  if (info.unreachable) return <Banner title="Cannot reach the backend">Is it running? Try <code>docker compose up -d</code> and refresh.</Banner>;
  if (info.version === APP_VERSION) return null;
  return (
    <Banner title={`Old backend detected (backend ${info.version || "2.x"}, app ${APP_VERSION})`}>
      The backend container is still an old build, so new pages cannot get their data. Run in the project folder:{" "}
      <code>docker compose down</code> then <code>docker compose build --no-cache</code> then <code>docker compose up -d</code>
    </Banner>
  );
}

function Banner({ title, children }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle size={20} className="mt-0.5 shrink-0" />
      <div><div className="font-bold">{title}</div><div className="mt-0.5 [&_code]:rounded [&_code]:bg-red-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">{children}</div></div>
    </div>
  );
}

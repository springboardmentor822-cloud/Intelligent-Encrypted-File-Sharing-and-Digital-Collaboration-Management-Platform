// File Analytics page: the date filter + the shared charts component.
import { useEffect, useState } from "react";
import api, { errorMessage } from "../lib/api";
import ActivityAnalytics from "../components/ActivityAnalytics";
import { DateRangeFilter, PageHeader } from "../components/ui";

export default function FileAnalytics() {
  const [range, setRange] = useState({ days: 30 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api.get("/reports/file-analytics", { params: range }).then((r) => setData(r.data)).catch(async (e) => setError(await errorMessage(e)));
  }, [range]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="File Analytics"
        subtitle={data?.range.scope === "platform" ? "Detailed insights about storage, uploads, downloads and sharing across the whole platform."
          : "Detailed insights about your file storage, uploads, downloads and sharing activity."}>
        <DateRangeFilter value={range} onChange={setRange} range={data?.range} />
      </PageHeader>
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!data ? <p className="py-20 text-center text-slate-500">{error ? "" : "Loading analytics..."}</p> : <ActivityAnalytics data={data} />}
    </div>
  );
}

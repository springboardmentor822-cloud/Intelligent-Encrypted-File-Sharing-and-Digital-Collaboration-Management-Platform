import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "./api";

export function useFetch<T = any>(url: string | null, params?: Record<string, any>, config?: Record<string, any>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const key = url + JSON.stringify(params || {}) + JSON.stringify(config?.headers || {});
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current; setLoading(true); setError(null);
    try { const r = await api.get(url, { params, ...config }); if (n === seq.current) setData(r.data); }
    catch (e) { if (n === seq.current) setError(errMsg(e)); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function useRange(initialDays = 30) {
  const today = new Date(); const from = new Date(); from.setDate(today.getDate() - (initialDays - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [preset, setPreset] = useState<string>(String(initialDays));
  const [start, setStart] = useState(iso(from)); const [end, setEnd] = useState(iso(today));
  const choose = (p: string) => {
    setPreset(p);
    if (p !== "custom") { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - (Number(p) - 1)); setStart(iso(s)); setEnd(iso(e)); }
  };
  return { preset, start, end, choose, setStart, setEnd };
}

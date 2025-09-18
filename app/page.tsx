"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, Legend, Brush
} from "recharts";

// ---------- tiny helpers ----------
const cx = (...xs: Array<string | false | undefined | null>) => xs.filter(Boolean).join(" ");
const OMDB_KEY = process.env.NEXT_PUBLIC_OMDB_KEY; // optional; enables posters

function fmt(n: any, digits = 1) {
  if (n == null || Number.isNaN(n)) return "–";
  return Number(n).toFixed(digits);
}
function parseNumber(x: any) {
  if (x == null) return null;
  if (typeof x === "number") return x;
  const v = Number(String(x).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function parseDateMaybe(x: any) { if (!x) return null; const d = new Date(x); return isNaN(d.getTime()) ? null : d; }
function splitGenres(str: any) { return !str ? [] : String(str).split(",").map((g) => g.trim()).filter(Boolean); }
function toDMY(d: Date | null) { if (!d) return ""; const dd = String(d.getDate()).padStart(2,"0"); const mm = String(d.getMonth()+1).padStart(2,"0"); const yy = d.getFullYear(); return `${dd}/${mm}/${yy}`; }
function downloadCSVFromRows(rows: any[], filename = "filtered.csv") {
  const csv = Papa.unparse(rows); const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function uniqueDays(dates: Date[]) { const set = new Set(dates.map(d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())); return Array.from(set).sort((a,b)=>a-b).map(ms => new Date(ms)); }
function longestStreak(dates: Date[]) {
  const days = uniqueDays(dates); if (!days.length) return { len:0,start:null as Date|null,end:null as Date|null };
  let best={len:1,start:days[0],end:days[0]}, curStart=days[0], curLen=1;
  for (let i=1;i<days.length;i++){ const prev=days[i-1], cur=days[i]; const diff=(cur.getTime()-prev.getTime())/86400000;
    if (Math.abs(diff-1)<1e-6) curLen++; else { if (curLen>best.len) best={len:curLen,start:curStart,end:prev}; curStart=cur; curLen=1; } }
  if (curLen>best.len) best={len:curLen,start:curStart,end:days[days.length-1]}; return best;
}
function longestGap(dates: Date[]) {
  const days=uniqueDays(dates); if (days.length<2) return {days:0,start:null as Date|null,end:null as Date|null};
  let best={days:0,start:days[0],end:days[1]}; for (let i=1;i<days.length;i++){ const gap=Math.round((days[i].getTime()-days[i-1].getTime())/86400000); if (gap>best.days) best={days:gap,start:days[i-1],end:days[i]}; }
  return best;
}
function imdbIdFromUrl(url: string) { const m = /tt\d+/.exec(url || ""); return m ? m[0] : null; }

// ---------- palettes (accent only; base stays neutral) ----------
const PALETTES = {
  violet: { 500: "#8b5cf6", 600: "#7c3aed" },
  emerald:{ 500: "#10b981", 600: "#059669" },
  rose:   { 500: "#f43f5e", 600: "#e11d48" },
  cyan:   { 500: "#06b6d4", 600: "#0891b2" },
  amber:  { 500: "#f59e0b", 600: "#d97706" },
};
type AccentKey = keyof typeof PALETTES;

// ---------- main ----------
type Row = {
  [k: string]: any;
  __title: string; __type: string; __url: string; __genres: string[]; __directors: string; __tconst: string;
  __yourRating: number|null; __imdbRating: number|null; __runtime: number|null; __year: number|null;
  __dateRated: Date|null; __releaseDate: Date|null;
};

export default function App() {
  // theme
  const [isDark, setIsDark] = useState(true);
  const [accent, setAccent] = useState<AccentKey>(() => (localStorage.getItem("accent") as AccentKey) || "violet");

  // data
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // filters
  const [q, setQ] = useState("");
  const [minYear, setMinYear] = useState(1900);
  const [maxYear, setMaxYear] = useState(2100);
  const [minYourRating, setMinYourRating] = useState(0);
  const [titleType, setTitleType] = useState("all");
  const [genreFilter, setGenreFilter] = useState<string[]>([]);

  // table: sort + pagination
  type SortKey = "title"|"year"|"your"|"imdb"|"date";
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  // posters (cache per imdb id)
  const [posterCache, setPosterCache] = useState<Record<string, string>>({});

  // URL source
  const [csvUrl, setCsvUrl] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("ratings_source_url"); if (saved) setCsvUrl(saved);
    const themeSaved = localStorage.getItem("theme_dark"); if (themeSaved != null) setIsDark(themeSaved === "1");
  }, []);
  useEffect(() => { document.documentElement.style.backgroundColor = isDark ? "#0a0a0a" : "#fafafa"; }, [isDark]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback((file: File) => {
    setError(""); setIsLoading(true);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => { setRawRows(Array.isArray(res.data) ? (res.data as any[]) : []); setIsLoading(false); setPage(1); },
      error: (err) => { setError(err?.message || "Failed to parse CSV"); setIsLoading(false); }
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }, [onFile]);
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData?.getData("text/plain");
    if (text && text.includes(",")) { e.preventDefault(); setIsLoading(true); const res = Papa.parse(text, { header: true, skipEmptyLines: true }); setRawRows(res.data as any[]); setIsLoading(false); setPage(1); }
  }, []);

  const fetchCsvFromUrl = async (url: string) => {
    try { setError(""); setIsLoading(true);
      const resp = await fetch(url); const text = await resp.text();
      const res = Papa.parse(text, { header: true, skipEmptyLines: true });
      setRawRows(res.data as any[]); setIsLoading(false); setPage(1);
    } catch { setError("Could not fetch CSV from that URL."); setIsLoading(false); }
  };
  const saveAndFetch = async () => { localStorage.setItem("ratings_source_url", csvUrl); await fetchCsvFromUrl(csvUrl); };
  useEffect(() => { if (csvUrl && rawRows.length === 0) fetchCsvFromUrl(csvUrl); /* eslint-disable-next-line */ }, [csvUrl]);

  // normalize
  const rows: Row[] = useMemo(() => (rawRows || []).map((r: any, i: number) => {
    const yourRating = parseNumber(r["Your Rating"] ?? r["your rating"] ?? r["rating"]);
    const imdbRating = parseNumber(r["IMDb Rating"] ?? r["imdb rating"]);
    const runtime = parseNumber(r["Runtime (mins)"] ?? r["runtime"]);
    const year = parseNumber(r["Year"] ?? r["year"]);
    const dateRated = parseDateMaybe(r["Date Rated"] ?? r["date rated"] ?? r["rated_at"]);
    const releaseDate = parseDateMaybe(r["Release Date"] ?? r["release date"]);
    const title = r["Title"] ?? r["title"] ?? "";
    const type = r["Title Type"] ?? r["title type"] ?? r["type"] ?? "";
    const url = r["URL"] ?? r["url"] ?? "";
    const genres = splitGenres(r["Genres"] ?? r["genres"] ?? "");
    const directors = r["Directors"] ?? r["directors"] ?? "";
    const tconst = r["Const"] ?? r["const"] ?? String(i);
    return { ...r, __title:title, __type:type, __url:url, __genres:genres, __directors:directors, __tconst:tconst,
      __yourRating:yourRating, __imdbRating:imdbRating, __runtime:runtime, __year:year, __dateRated:dateRated, __releaseDate:releaseDate };
  }), [rawRows]);

  // years bounds
  const allYears = useMemo(() => {
    const ys = rows.map(r => r.__year).filter((x): x is number => Number.isFinite(x));
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : [1900, 2100];
  }, [rows]);
  useEffect(() => { setMinYear(allYears[0]); setMaxYear(allYears[1]); }, [allYears]);

  const allTypes = useMemo(() => Array.from(new Set(rows.map(r => r.__type).filter(Boolean))).sort(), [rows]);
  const allGenres = useMemo(() => { const set = new Set<string>(); rows.forEach(r => r.__genres.forEach(g => set.add(g))); return Array.from(set).sort(); }, [rows]);

  // filtering
  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return rows.filter(r => {
      const yearOk = !Number.isFinite(r.__year as any) || ((r.__year as number) >= minYear && (r.__year as number) <= maxYear);
      const typeOk = titleType === "all" || r.__type === titleType;
      const yourOk = !Number.isFinite(r.__yourRating as any) || (r.__yourRating as number) >= minYourRating;
      const textOk = !qLower || r.__title.toLowerCase().includes(qLower);
      const genresOk = genreFilter.length === 0 || r.__genres.some(g => genreFilter.includes(g));
      return yearOk && typeOk && yourOk && textOk && genresOk;
    });
  }, [rows, q, minYear, maxYear, titleType, minYourRating, genreFilter]);

  // facts
  const facts = useMemo(() => {
    const n = filtered.length;
    const your = filtered.map(r => r.__yourRating).filter(Number.isFinite) as number[];
    const imdb = filtered.map(r => r.__imdbRating).filter(Number.isFinite) as number[];
    const avgYour = your.length ? your.reduce((a,b)=>a+b,0)/your.length : null;
    const avgImdb = imdb.length ? imdb.reduce((a,b)=>a+b,0)/imdb.length : null;
    const runtimes = filtered.map(r => r.__runtime).filter(Number.isFinite) as number[];
    const totalHours = runtimes.reduce((a,b)=>a+b,0)/60;
    const dates = filtered.map(r => r.__dateRated).filter(Boolean) as Date[];
    const streak = longestStreak(dates);
    const gap = longestGap(dates);
    let disagree: any = null;
    filtered.forEach(r => {
      if (!Number.isFinite(r.__yourRating) || !Number.isFinite(r.__imdbRating)) return;
      const delta = Math.abs((r.__yourRating as number) - (r.__imdbRating as number));
      if (!disagree || delta > disagree.delta) disagree = { title: r.__title, your: r.__yourRating, imdb: r.__imdbRating, delta };
    });
    const dirMap = new Map<string,{sum:number,n:number}>();
    filtered.forEach(r => {
      if (!r.__directors) return;
      r.__directors.split(",").map(d=>d.trim()).filter(Boolean).forEach(d => {
        const m = dirMap.get(d) || {sum:0,n:0};
        if (Number.isFinite(r.__yourRating)) { m.sum += r.__yourRating as number; m.n += 1; dirMap.set(d,m); }
      });
    });
    let topDirector: any = null;
    dirMap.forEach((m,d) => { if (m.n>=3){ const avg=m.sum/m.n; if (!topDirector || avg>topDirector.avg) topDirector={director:d,avg,n:m.n}; }});
    // DOW
    const dow = Array.from({length:7},(_,i)=>({day:i,sum:0,n:0}));
    filtered.forEach(r => { if (r.__dateRated && Number.isFinite(r.__yourRating)) { const d = (r.__dateRated as Date).getDay(); dow[d].sum += r.__yourRating as number; dow[d].n += 1; }});
    const dowAvg = dow.map(d => ({ dow: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.day], avg: d.n? d.sum/d.n : 0, n: d.n }));
    // last 24 months
    const monthMap=new Map<string,number>();
    filtered.forEach(r => { if(!r.__dateRated) return; const y=(r.__dateRated as Date).getFullYear(); const m=(r.__dateRated as Date).getMonth()+1; const key=`${y}-${String(m).padStart(2,"0")}`; monthMap.set(key,(monthMap.get(key)||0)+1);});
    const months: {month:string;count:number}[]=[]; const now=new Date();
    for (let i=23;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; months.push({month:key, count: monthMap.get(key)||0});}
    return { n, avgYour, avgImdb, totalHours, streak, gap, disagree, topDirector, dowAvg, months };
  }, [filtered]);

  // charts data
  const timeSeries = useMemo(() =>
    filtered.filter(r => r.__dateRated && Number.isFinite(r.__yourRating))
      .map(r => ({ x: (r.__dateRated as Date).getTime(), date: r.__dateRated as Date, your: r.__yourRating as number }))
      .sort((a,b)=>a.x-b.x)
  , [filtered]);

  const ratingHistogram = useMemo(() => {
    const bins = Array.from({length:10},(_,i)=>({bucket:i+1,count:0}));
    filtered.forEach(r => { if(Number.isFinite(r.__yourRating) && (r.__yourRating as number)>=1 && (r.__yourRating as number)<=10){ bins[(r.__yourRating as number)-1].count += 1; }});
    return bins;
  }, [filtered]);

  const yourVsImdb = useMemo(() =>
    filtered.filter(r => Number.isFinite(r.__yourRating) && Number.isFinite(r.__imdbRating))
      .map(r => ({ your: r.__yourRating as number, imdb: r.__imdbRating as number, title: r.__title }))
  , [filtered]);

  const runtimeVsYour = useMemo(() =>
    filtered.filter(r => Number.isFinite(r.__runtime) && Number.isFinite(r.__yourRating))
      .map(r => ({ runtime: r.__runtime as number, your: r.__yourRating as number, title: r.__title }))
  , [filtered]);

  const byYearAvg = useMemo(() => {
    const map = new Map<number,{year:number,sum:number,n:number}>();
    filtered.forEach(r => {
      if (!Number.isFinite(r.__year) || !Number.isFinite(r.__yourRating)) return;
      const m = map.get(r.__year as number) || {year: r.__year as number, sum:0, n:0};
      m.sum += r.__yourRating as number; m.n += 1; map.set(r.__year as number, m);
    });
    return Array.from(map.values()).map(m => ({ year:m.year, avg:m.sum/m.n, n:m.n })).sort((a,b)=>a.year-b.year);
  }, [filtered]);

  const genreCounts = useMemo(() => {
    const map = new Map<string,number>();
    filtered.forEach(r => r.__genres.forEach(g => map.set(g, (map.get(g)||0)+1)));
    return Array.from(map.entries()).map(([genre,count])=>({genre,count})).sort((a,b)=>b.count-a.count).slice(0,15);
  }, [filtered]);

  // sorting
  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const cmp = (a: Row, b: Row) => {
      let va: any, vb: any;
      if (sortKey === "title") { va = a.__title?.toLowerCase() || ""; vb = b.__title?.toLowerCase() || ""; }
      else if (sortKey === "year") { va = a.__year ?? -Infinity; vb = b.__year ?? -Infinity; }
      else if (sortKey === "your") { va = a.__yourRating ?? -Infinity; vb = b.__yourRating ?? -Infinity; }
      else if (sortKey === "imdb") { va = a.__imdbRating ?? -Infinity; vb = b.__imdbRating ?? -Infinity; }
      else { va = a.__dateRated ? (a.__dateRated as Date).getTime() : -Infinity; vb = b.__dateRated ? (b.__dateRated as Date).getTime() : -Infinity; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    };
    return arr.sort(cmp);
  }, [filtered, sortKey, sortDir]);

  // pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageStart = (page - 1) * pageSize;
  const pageRows = useMemo(() => sorted.slice(pageStart, pageStart + pageSize), [sorted, pageStart, pageSize]);

  // posters: fetch only for current page (requires OMDb key); cache by tt id
  useEffect(() => {
    if (!OMDB_KEY) return;
    const ids = pageRows.map(r => imdbIdFromUrl(r.__url || "")).filter(Boolean) as string[];
    const need = ids.filter(id => !posterCache[id]);
    if (!need.length) return;
    (async () => {
      const updates: Record<string,string> = {};
      await Promise.all(need.map(async (id) => {
        try {
          const res = await fetch(`https://www.omdbapi.com/?i=${id}&apikey=${OMDB_KEY}`);
          const j = await res.json();
          if (j?.Poster && j.Poster !== "N/A") updates[id] = j.Poster;
        } catch {}
      }));
      if (Object.keys(updates).length) setPosterCache(prev => ({ ...prev, ...updates }));
    })();
  }, [pageRows, posterCache]);

  // theme classes
  const baseText = isDark ? "text-neutral-200" : "text-neutral-900";
  const baseBg = isDark ? "bg-neutral-950" : "bg-neutral-50";
  const panel = isDark ? "bg-neutral-900/40 border-white/10" : "bg-white border-black/10";
  const subtle = isDark ? "text-neutral-400" : "text-neutral-600";
  const ACC = PALETTES[accent];

  const AccentBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
    <button {...props}
      className={cx("px-3 py-2 rounded-xl font-medium text-white border", props.className)}
      style={{ background: `linear-gradient(135deg, ${ACC[500]}, ${ACC[600]})`, borderColor: ACC[600] }}
    />
  );
  const GhostBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
    <button {...props}
      className={cx("px-3 py-2 rounded-xl font-medium border transition", isDark ? "bg-neutral-800 border-white/10 text-white" : "bg-white border-black/10 text-neutral-800", props.className)}
    />
  );

  // ui
  return (
    <div className={cx("min-h-screen", baseBg, baseText)} onDrop={onDrop} onDragOver={(e)=>e.preventDefault()} onPaste={onPaste}>
      {/* loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="h-14 w-14 rounded-full border-4 border-white/30 border-t-white animate-spin" />
        </div>
      )}

      <header className={cx("sticky top-0 z-40 backdrop-blur border-b",
        isDark ? "supports-[backdrop-filter]:bg-neutral-950/60 bg-neutral-900/70 border-white/10" : "supports-[backdrop-filter]:bg-white/60 bg-white/80 border-black/10")}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl" style={{ background: `linear-gradient(135deg, ${ACC[500]}, ${ACC[600]})` }} />
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight mr-auto">IMDb Ratings Visualizer</h1>

          {/* Accent color switcher */}
          <div className="hidden sm:flex items-center gap-1 mr-2">
            {Object.keys(PALETTES).map((k) => (
              <button key={k} onClick={()=>{ setAccent(k as AccentKey); localStorage.setItem("accent", k); }}
                title={k} className="h-6 w-6 rounded-full border" style={{ background:(PALETTES as any)[k][500], borderColor:(PALETTES as any)[k][600], outline: accent===k ? "2px solid white" : "none" }} />
            ))}
          </div>

          <AccentBtn onClick={() => fileInputRef.current?.click()}>Upload CSV</AccentBtn>
          <GhostBtn onClick={() => { const next=!isDark; setIsDark(next); localStorage.setItem("theme_dark", next ? "1" : "0"); }}>
            {isDark ? "Dark" : "Light"}
          </GhostBtn>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onFile(f); }} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-24">
        {/* empty & URL input */}
        {rawRows.length === 0 && (
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className={cx("rounded-2xl border p-6", panel)}>
              <h2 className="text-lg font-semibold mb-2">Drop your CSV</h2>
              <p className={cx("text-sm mb-3", subtle)}>Drag & drop file anywhere, click <em>Upload CSV</em>, or paste CSV text. Header row required.</p>
              <div className={cx("mt-4 py-10 rounded-xl text-center border border-dashed", isDark ? "border-white/20" : "border-black/20")}>Drop file anywhere on this page</div>
            </div>
            <div className={cx("rounded-2xl border p-6", panel)}>
              <h2 className="text-lg font-semibold mb-2">Load from a URL</h2>
              <div className="flex gap-2">
                <input value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} placeholder="https://…/my-ratings.csv"
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
                <AccentBtn onClick={saveAndFetch}>Save & Fetch</AccentBtn>
              </div>
              <p className={cx("text-xs mt-2", subtle)}>Google Drive: use <code>https://drive.google.com/uc?export=download&id=FILE_ID</code> (make file public).</p>
            </div>
          </section>
        )}

        {error && (
          <div className={cx("mt-4 p-3 rounded-xl text-sm", isDark ? "bg-red-500/10 border border-red-500/30 text-red-200" : "bg-red-100 border border-red-300 text-red-800")}>
            {error}
          </div>
        )}

        {/* controls */}
        {rawRows.length > 0 && (
          <section className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className={cx("block text-sm mb-1", subtle)}>Search title</label>
                <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="e.g., Dune"
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
              </div>
              <div>
                <label className={cx("block text-sm mb-1", subtle)}>Min Your Rating</label>
                <input type="number" min={0} max={10} value={minYourRating} onChange={(e)=>setMinYourRating(parseNumber(e.target.value) ?? 0)}
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
              </div>
              <div>
                <label className={cx("block text-sm mb-1", subtle)}>Title Type</label>
                <select value={titleType} onChange={(e)=>setTitleType(e.target.value)}
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")}>
                  <option value="all">All</option>
                  {allTypes.map(t => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div>
                <label className={cx("block text-sm mb-1", subtle)}>Year range</label>
                <div className="flex gap-2">
                  <input type="number" value={minYear} onChange={(e)=>setMinYear(parseNumber(e.target.value) ?? minYear)}
                    className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
                  <input type="number" value={maxYear} onChange={(e)=>setMaxYear(parseNumber(e.target.value) ?? maxYear)}
                    className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
                </div>
              </div>
            </div>

            {/* genre chips */}
            {allGenres.length > 0 && (
              <div className={cx("rounded-2xl border p-4", panel)}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={cx("text-sm", subtle)}>Filter by Genres</h3>
                  <button onClick={()=>setGenreFilter([])} className="text-xs px-2 py-1 rounded-lg border"
                    style={{ background:`${ACC[500]}22`, color:"#fff", borderColor:ACC[500] }}>Clear</button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-[140px] overflow-auto pr-1">
                  {allGenres.map(g => {
                    const active = genreFilter.includes(g);
                    return (
                      <button key={g} onClick={()=> setGenreFilter(prev => active ? prev.filter(x=>x!==g) : [...prev,g])}
                        className="px-2 py-1 rounded-lg border text-xs"
                        style={{
                          background: active ? ACC[500] : (isDark ? "#1f1f1f" : "#fff"),
                          color: active ? "#0b0b0b" : (isDark ? "#fff" : "#111"),
                          borderColor: active ? ACC[600] : (isDark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.12)")
                        }}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* summary cards */}
        {rawRows.length > 0 && (
          <section className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              {label:"Titles", val:facts.n},
              {label:"Avg Your Rating", val:fmt(facts.avgYour)},
              {label:"Avg IMDb Rating", val:fmt(facts.avgImdb)},
              {label:"Estimated Watch-time", val:`${fmt(facts.totalHours,1)} hrs`}
            ].map((c,i)=>(
              <div key={i} className={cx("rounded-2xl border p-4", panel)}>
                <div className={cx("text-xs", subtle)}>{c.label}</div>
                <div className="text-2xl font-semibold">{c.val}</div>
              </div>
            ))}
          </section>
        )}

        {rawRows.length > 0 && (
          <section className="mt-4 grid gap-4 md:grid-cols-3">
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm font-semibold mb-1">Longest rating streak</div>
              <div className={cx("text-sm", subtle)}>
                {facts.streak.len>0 ? <>{facts.streak.len} days{facts.streak.start&&facts.streak.end && <> ({toDMY(facts.streak.start)} → {toDMY(facts.streak.end)})</>}</> : "–"}
              </div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm font-semibold mb-1">Longest gap between ratings</div>
              <div className={cx("text-sm", subtle)}>
                {facts.gap.days>0 ? <>{facts.gap.days} days{facts.gap.start&&facts.gap.end && <> ({toDMY(facts.gap.start)} → {toDMY(facts.gap.end)})</>}</> : "–"}
              </div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm font-semibold mb-1">Biggest disagreement</div>
              <div className={cx("text-sm", subtle)}>
                {facts.disagree ? <><span className="font-medium">{facts.disagree.title}</span> — you: {facts.disagree.your}, IMDb: {facts.disagree.imdb} (Δ {fmt(facts.disagree.delta,1)})</> : "–"}
              </div>
            </div>
          </section>
        )}

        {rawRows.length > 0 && facts.topDirector && (
          <div className={cx("mt-4 rounded-2xl border p-4", panel)}>
            <div className="text-sm"><span className="font-semibold">Top director by your average</span> (≥3 titles): {facts.topDirector.director} — {fmt(facts.topDirector.avg)} across {facts.topDirector.n} titles</div>
          </div>
        )}

        {/* charts */}
        {rawRows.length > 0 && (
          <section className="mt-6 grid gap-6">
            <div className={cx("rounded-2xl border p-4", panel)}>
              <h3 className="font-semibold mb-3">Ratings over time (Your Rating)</h3>
              <div className="w-full h-72">
                <ResponsiveContainer>
                  <LineChart data={timeSeries} margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d)=>toDMY(new Date(d))} />
                    <YAxis domain={[0,10]} />
                    <Tooltip labelFormatter={(v)=>toDMY(new Date(v as number))} formatter={(v)=>[v,"Your Rating"]} />
                    <Legend />
                    <Line type="monotone" dataKey="your" dot={false} stroke={ACC[500]} />
                    <Brush dataKey="date" height={20} stroke={ACC[600]} travellerWidth={10} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className={cx("rounded-2xl border p-4", panel)}>
                <h3 className="font-semibold mb-3">Your Rating distribution</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <BarChart data={ratingHistogram}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill={ACC[500]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={cx("rounded-2xl border p-4", panel)}>
                <h3 className="font-semibold mb-3">Your Rating vs IMDb Rating</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="imdb" name="IMDb" domain={[0,10]} />
                      <YAxis type="number" dataKey="your" name="Your" domain={[0,10]} />
                      <Tooltip cursor={{ strokeDasharray:"3 3" }} formatter={(v,n)=>[v as number, n as string]} labelFormatter={()=>""} />
                      <Legend />
                      <Scatter name="Titles" data={yourVsImdb} fill={ACC[500]} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className={cx("rounded-2xl border p-4", panel)}>
                <h3 className="font-semibold mb-3">Average Your Rating by Year</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <LineChart data={byYearAvg}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" />
                      <YAxis domain={[0,10]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="avg" stroke={ACC[500]} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={cx("rounded-2xl border p-4", panel)}>
                <h3 className="font-semibold mb-3">Top Genres</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <BarChart data={genreCounts} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="genre" width={120} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill={ACC[500]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className={cx("rounded-2xl border p-4", panel)}>
              <h3 className="font-semibold mb-3">Monthly rating activity (last 24 months)</h3>
              <div className="w-full h-72">
                <ResponsiveContainer>
                  <BarChart data={facts.months}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize:10 }} interval={2} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill={ACC[500]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* table w/ sorting + pagination + posters */}
        {rawRows.length > 0 && (
          <section className={cx("mt-6 rounded-2xl border p-4", panel)}>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="font-semibold">Your titles</h3>
              <div className="flex items-center gap-2">
                <label className={cx("text-sm", subtle)}>Rows per page</label>
                <select value={pageSize} onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }}
                  className={cx("px-2 py-1 rounded-lg border text-sm", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <AccentBtn onClick={()=>downloadCSVFromRows(filtered)}>Export filtered CSV</AccentBtn>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className={cx("text-left border-b", isDark ? "text-neutral-400 border-white/10" : "text-neutral-600 border-black/10")}>
                  <tr>
                    <Th label="Title" active={sortKey==="title"} dir={sortDir} onClick={()=>toggleSort("title")} />
                    <Th label="Your"  active={sortKey==="your"}  dir={sortDir} onClick={()=>toggleSort("your")} />
                    <Th label="IMDb"  active={sortKey==="imdb"}  dir={sortDir} onClick={()=>toggleSort("imdb")} />
                    <Th label="Year"  active={sortKey==="year"}  dir={sortDir} onClick={()=>toggleSort("year")} />
                    <th className="py-2 pr-4">Genres</th>
                    <th className="py-2 pr-4">Type</th>
                    <Th label="Rated on" active={sortKey==="date"} dir={sortDir} onClick={()=>toggleSort("date")} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => {
                    const id = imdbIdFromUrl(r.__url || "");
                    const poster = id ? posterCache[id] : undefined;
                    return (
                      <tr key={(r.__tconst || "") + i} className={cx("border-b", isDark ? "border-white/5" : "border-black/5")}>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-8 rounded-sm overflow-hidden bg-black/20 flex-shrink-0">
                              {poster ? <img src={poster} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" />}
                            </div>
                            {r.__url ? (
                              <a href={r.__url} target="_blank" rel="noreferrer" className="underline underline-offset-2"
                                 style={{ color: ACC[500] }}>{r.__title}</a>
                            ) : r.__title}
                          </div>
                        </td>
                        <td className="py-2 pr-4">{fmt(r.__yourRating,0)}</td>
                        <td className="py-2 pr-4">{fmt(r.__imdbRating,1)}</td>
                        <td className="py-2 pr-4">{Number.isFinite(r.__year) ? r.__year : ""}</td>
                        <td className={cx("py-2 pr-4", subtle)}>{r.__genres.join(", ")}</td>
                        <td className={cx("py-2 pr-4", subtle)}>{r.__type}</td>
                        <td className={cx("py-2 pr-4", subtle)}>{toDMY(r.__dateRated)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* pagination controls */}
            <div className="flex items-center justify-between mt-3">
              <div className={cx("text-xs", subtle)}>Page {page} of {totalPages} — showing {pageRows.length} of {sorted.length}</div>
              <div className="flex items-center gap-2">
                <GhostBtn onClick={()=>setPage(1)} disabled={page===1}>⏮</GhostBtn>
                <GhostBtn onClick={()=>setPage(p => Math.max(1, p-1))} disabled={page===1}>‹ Prev</GhostBtn>
                <GhostBtn onClick={()=>setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}>Next ›</GhostBtn>
                <GhostBtn onClick={()=>setPage(totalPages)} disabled={page===totalPages}>⏭</GhostBtn>
              </div>
            </div>
          </section>
        )}

        <section className={cx("mt-10 text-xs space-y-2", subtle)}>
          <p>Columns detected: <code>Your Rating</code>, <code>IMDb Rating</code>, <code>Runtime (mins)</code>, <code>Year</code>, <code>Genres</code>, <code>Title Type</code>, <code>Date Rated</code>, <code>URL</code>.</p>
          <p>Optional posters via OMDb. Set <code>NEXT_PUBLIC_OMDB_KEY</code> to enable. Posters are fetched only for the current page and cached.</p>
        </section>
      </main>
    </div>
  );

  // --- local helpers for table header ---
  function Th({ label, active, dir, onClick }: {label:string;active:boolean;dir:"asc"|"desc";onClick:()=>void}) {
    return (
      <th className="py-2 pr-4 select-none">
        <button onClick={onClick} className="inline-flex items-center gap-1">
          {label}{active && <span>{dir === "asc" ? " ▲" : " ▼"}</span>}
        </button>
      </th>
    );
  }
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
    setPage(1);
  }
}

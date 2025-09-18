"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  Legend,
  Brush,
} from "recharts";

// === Small classnames helper ===
const cx = (...xs) => xs.filter(Boolean).join(" ");

// === Utilities ===
function fmt(n, digits = 1) {
  if (Number.isNaN(n) || n == null) return "–";
  return Number(n).toFixed(digits);
}

function parseNumber(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return x;
  const cleaned = String(x).replace(/[^0-9.\-]/g, "");
  if (cleaned === "") return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

function parseDateMaybe(x) {
  if (!x) return null;
  const d = new Date(x);
  return isNaN(d.getTime()) ? null : d;
}

function splitGenres(str) {
  if (!str) return [];
  return String(str)
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

function downloadCSVFromRows(rows, filename = "filtered.csv") {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function uniqueDays(dates) {
  const set = new Set(dates.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()));
  return Array.from(set).sort((a, b) => a - b).map((ms) => new Date(ms));
}

function longestStreak(dates) {
  const days = uniqueDays(dates);
  if (days.length === 0) return { len: 0, start: null, end: null };
  let best = { len: 1, start: days[0], end: days[0] };
  let curStart = days[0];
  let curLen = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const cur = days[i];
    const diff = (cur - prev) / (24 * 3600 * 1000);
    if (Math.abs(diff - 1) < 1e-6) {
      curLen += 1;
    } else {
      if (curLen > best.len) best = { len: curLen, start: curStart, end: prev };
      curStart = cur;
      curLen = 1;
    }
  }
  if (curLen > best.len) best = { len: curLen, start: curStart, end: days[days.length - 1] };
  return best;
}

function longestGap(dates) {
  const days = uniqueDays(dates);
  if (days.length < 2) return { days: 0, start: null, end: null };
  let best = { days: 0, start: days[0], end: days[1] };
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((days[i] - days[i - 1]) / (24 * 3600 * 1000));
    if (gap > best.days) best = { days: gap, start: days[i - 1], end: days[i] };
  }
  return best;
}

// === Main Component ===
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [rawRows, setRawRows] = useState([]);
  const [error, setError] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [minYear, setMinYear] = useState(1900);
  const [maxYear, setMaxYear] = useState(2100);
  const [minYourRating, setMinYourRating] = useState(0);
  const [titleType, setTitleType] = useState("all");
  const [genreFilter, setGenreFilter] = useState([]);

  // Source URL (persisted)
  const [csvUrl, setCsvUrl] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("ratings_source_url");
    if (saved) setCsvUrl(saved);
    const themeSaved = localStorage.getItem("theme_dark");
    if (themeSaved != null) setIsDark(themeSaved === "1");
  }, []);

  useEffect(() => {
    document.documentElement.style.backgroundColor = isDark ? "#0a0a0a" : "#fafafa";
  }, [isDark]);

  const fileInputRef = useRef(null);

  const onFile = useCallback((file) => {
    setError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRawRows(Array.isArray(res.data) ? res.data : []);
      },
      error: (err) => setError(err?.message || "Failed to parse CSV"),
    });
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  const onPaste = useCallback((e) => {
    const text = e.clipboardData?.getData("text/plain");
    if (text && text.includes(",")) {
      e.preventDefault();
      const res = Papa.parse(text, { header: true, skipEmptyLines: true });
      setRawRows(res.data);
    }
  }, []);

  const fetchCsvFromUrl = async (url) => {
    try {
      setError("");
      const resp = await fetch(url);
      const text = await resp.text();
      const res = Papa.parse(text, { header: true, skipEmptyLines: true });
      setRawRows(res.data);
    } catch (e) {
      setError("Could not fetch CSV from that URL.");
    }
  };

  const saveAndFetch = async () => {
    localStorage.setItem("ratings_source_url", csvUrl);
    await fetchCsvFromUrl(csvUrl);
  };

  // Auto-load if we have a saved URL
  useEffect(() => {
    if (csvUrl && rawRows.length === 0) {
      fetchCsvFromUrl(csvUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvUrl]);

  // Normalize rows
  const rows = useMemo(() => {
    return (rawRows || []).map((r, i) => {
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
      return {
        ...r,
        __title: title,
        __type: type,
        __url: url,
        __genres: genres,
        __directors: directors,
        __tconst: tconst,
        __yourRating: yourRating,
        __imdbRating: imdbRating,
        __runtime: runtime,
        __year: year,
        __dateRated: dateRated,
        __releaseDate: releaseDate,
      };
    });
  }, [rawRows]);

  const allYears = useMemo(() => {
    const ys = rows.map((r) => r.__year).filter((x) => Number.isFinite(x));
    if (ys.length === 0) return [1900, 2100];
    return [Math.min(...ys), Math.max(...ys)];
  }, [rows]);

  useEffect(() => {
    setMinYear(allYears[0]);
    setMaxYear(allYears[1]);
  }, [allYears[0], allYears[1]]);

  const allTypes = useMemo(() => Array.from(new Set(rows.map((r) => r.__type).filter(Boolean))).sort(), [rows]);

  const allGenres = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => r.__genres.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [rows]);

  // Apply filters
  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return rows.filter((r) => {
      const yearOk = !Number.isFinite(r.__year) || (r.__year >= minYear && r.__year <= maxYear);
      const typeOk = titleType === "all" || r.__type === titleType;
      const yourOk = !Number.isFinite(r.__yourRating) || r.__yourRating >= minYourRating;
      const textOk = !qLower || r.__title.toLowerCase().includes(qLower);
      const genresOk = genreFilter.length === 0 || r.__genres.some((g) => genreFilter.includes(g));
      return yearOk && typeOk && yourOk && textOk && genresOk;
    });
  }, [rows, q, minYear, maxYear, titleType, minYourRating, genreFilter]);

  // Summary stats & fascinating facts
  const facts = useMemo(() => {
    const n = filtered.length;
    const your = filtered.map((r) => r.__yourRating).filter(Number.isFinite);
    const imdb = filtered.map((r) => r.__imdbRating).filter(Number.isFinite);
    const avgYour = your.length ? your.reduce((a, b) => a + b, 0) / your.length : null;
    const avgImdb = imdb.length ? imdb.reduce((a, b) => a + b, 0) / imdb.length : null;

    const runtimes = filtered.map((r) => r.__runtime).filter(Number.isFinite);
    const totalMins = runtimes.reduce((a, b) => a + b, 0);
    const totalHours = totalMins / 60;

    const dates = filtered.map((r) => r.__dateRated).filter(Boolean);
    const streak = longestStreak(dates);
    const gap = longestGap(dates);

    // Biggest disagreement with IMDb
    let disagree = null;
    filtered.forEach((r) => {
      if (!Number.isFinite(r.__yourRating) || !Number.isFinite(r.__imdbRating)) return;
      const delta = Math.abs(r.__yourRating - r.__imdbRating);
      if (!disagree || delta > disagree.delta) disagree = { title: r.__title, your: r.__yourRating, imdb: r.__imdbRating, delta };
    });

    // Top director by avg (min 3 titles)
    const dirMap = new Map();
    filtered.forEach((r) => {
      if (!r.__directors) return;
      r.__directors.split(',').map((d) => d.trim()).filter(Boolean).forEach((d) => {
        const m = dirMap.get(d) || { sum: 0, n: 0 };
        if (Number.isFinite(r.__yourRating)) {
          m.sum += r.__yourRating; m.n += 1; dirMap.set(d, m);
        }
      });
    });
    let topDirector = null;
    dirMap.forEach((m, d) => {
      if (m.n >= 3) {
        const avg = m.sum / m.n;
        if (!topDirector || avg > topDirector.avg) topDirector = { director: d, avg, n: m.n };
      }
    });

    // Day-of-week averages
    const dow = Array.from({ length: 7 }, (_, i) => ({ day: i, sum: 0, n: 0 }));
    filtered.forEach((r) => {
      if (r.__dateRated && Number.isFinite(r.__yourRating)) {
        const d = r.__dateRated.getDay();
        dow[d].sum += r.__yourRating; dow[d].n += 1;
      }
    });
    const dowAvg = dow.map((d) => ({
      dow: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.day],
      avg: d.n ? d.sum / d.n : 0,
      n: d.n,
    }));

    // Monthly activity (last 24 months)
    const monthMap = new Map(); // key YYYY-MM
    filtered.forEach((r) => {
      if (!r.__dateRated) return;
      const y = r.__dateRated.getFullYear();
      const m = r.__dateRated.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });
    const months = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ month: key, count: monthMap.get(key) || 0 });
    }

    return { n, avgYour, avgImdb, totalHours, streak, gap, disagree, topDirector, dowAvg, months };
  }, [filtered]);

  // Charts data
  const timeSeries = useMemo(() => {
    const pts = filtered
      .filter((r) => r.__dateRated && Number.isFinite(r.__yourRating))
      .map((r) => ({ x: r.__dateRated.getTime(), date: r.__dateRated, your: r.__yourRating }))
      .sort((a, b) => a.x - b.x);
    return pts;
  }, [filtered]);

  const ratingHistogram = useMemo(() => {
    const bins = Array.from({ length: 10 }, (_, i) => ({ bucket: i + 1, count: 0 }));
    filtered.forEach((r) => {
      if (Number.isFinite(r.__yourRating) && r.__yourRating >= 1 && r.__yourRating <= 10) {
        bins[r.__yourRating - 1].count += 1;
      }
    });
    return bins;
  }, [filtered]);

  const yourVsImdb = useMemo(() => {
    return filtered
      .filter((r) => Number.isFinite(r.__yourRating) && Number.isFinite(r.__imdbRating))
      .map((r) => ({ your: r.__yourRating, imdb: r.__imdbRating, title: r.__title }));
  }, [filtered]);

  const runtimeVsYour = useMemo(() => {
    return filtered
      .filter((r) => Number.isFinite(r.__runtime) && Number.isFinite(r.__yourRating))
      .map((r) => ({ runtime: r.__runtime, your: r.__yourRating, title: r.__title }));
  }, [filtered]);

  const byYearAvg = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      if (!Number.isFinite(r.__year) || !Number.isFinite(r.__yourRating)) return;
      const m = map.get(r.__year) || { year: r.__year, sum: 0, n: 0 };
      m.sum += r.__yourRating; m.n += 1; map.set(r.__year, m);
    });
    return Array.from(map.values()).map((m) => ({ year: m.year, avg: m.sum / m.n, n: m.n })).sort((a, b) => a.year - b.year);
  }, [filtered]);

  const genreCounts = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => r.__genres.forEach((g) => map.set(g, (map.get(g) || 0) + 1)));
    return Array.from(map.entries()).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [filtered]);

  const ratedTable = useMemo(() => filtered.slice().sort((a, b) => (b.__dateRated?.getTime() || 0) - (a.__dateRated?.getTime() || 0)).slice(0, 200), [filtered]);

  // Theme classes
  const bg = isDark ? "bg-neutral-950" : "bg-neutral-50";
  const text = isDark ? "text-neutral-200" : "text-neutral-900";
  const panel = isDark ? "bg-neutral-900/40 border-white/10" : "bg-white border-black/10";
  const subtle = isDark ? "text-neutral-400" : "text-neutral-600";

  return (
    <div className={cx("min-h-screen", bg, text)}>
      <header className={cx("sticky top-0 z-40 backdrop-blur border-b", isDark ? "supports-[backdrop-filter]:bg-neutral-950/60 bg-neutral-900/70 border-white/10" : "supports-[backdrop-filter]:bg-white/60 bg-white/80 border-black/10")}>        
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-400 to-violet-700" />
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">IMDb Ratings Visualizer</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cx("px-3 py-2 rounded-xl font-medium hover:opacity-90 border border-violet-600 bg-violet-500 text-white")}
            >Upload CSV</button>
            <button
              onClick={() => { const next = !isDark; setIsDark(next); localStorage.setItem("theme_dark", next ? "1" : "0"); }}
              className={cx("px-3 py-2 rounded-xl font-medium border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")}
              title="Toggle theme"
            >{isDark ? "Dark" : "Light"}</button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-24" onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onPaste={onPaste}>
        {rawRows.length === 0 && (
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className={cx("rounded-2xl border p-6", panel)}>
              <h2 className="text-lg font-semibold mb-2">Drop your CSV</h2>
              <p className={cx("text-sm mb-3", subtle)}>Drag & drop, click <em>Upload CSV</em>, or paste CSV text. Header row required.</p>
              <div className={cx("mt-4 py-10 rounded-xl text-center border border-dashed", isDark ? "border-white/20" : "border-black/20")}>Drop file anywhere on this page</div>
            </div>
            <div className={cx("rounded-2xl border p-6", panel)}>
              <h2 className="text-lg font-semibold mb-2">Load from a URL</h2>
              <div className="flex gap-2">
                <input value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} placeholder="https://…/my-ratings.csv"
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
                <button onClick={saveAndFetch} className={cx("px-3 py-2 rounded-xl font-medium border border-violet-600 bg-violet-500 text-white hover:bg-violet-600 transition")}>Save & Fetch</button>
              </div>
              <p className={cx("text-xs mt-2", subtle)}>Tip: For Google Drive, use <code>https://drive.google.com/uc?export=download&id=FILE_ID</code> (make file public).</p>
            </div>
          </section>
        )}

        {error && (
          <div className={cx("mt-4 p-3 rounded-xl text-sm", isDark ? "bg-red-500/10 border border-red-500/30 text-red-200" : "bg-red-100 border border-red-300 text-red-800")}>{error}</div>
        )}

        {/* Controls */}
        {rawRows.length > 0 && (
          <section className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className={cx("block text-sm mb-1", subtle)}>Search title</label>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g., Dune"
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
              </div>
              <div>
                <label className={cx("block text-sm mb-1", subtle)}>Min Your Rating</label>
                <input type="number" min={0} max={10} value={minYourRating} onChange={(e) => setMinYourRating(parseNumber(e.target.value) ?? 0)}
                  className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
              </div>
              <div>
                <label className={cx("block text-sm mb-1", subtle)}>Title Type</label>
                <select value={titleType} onChange={(e) => setTitleType(e.target.value)} className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")}>                  <option value="all">All</option>
                  {allTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div>
                <label className={cx("block text-sm mb-1", subtle)}>Year range</label>
                <div className="flex gap-2">
                  <input type="number" value={minYear} onChange={(e) => setMinYear(parseNumber(e.target.value) ?? minYear)} className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
                  <input type="number" value={maxYear} onChange={(e) => setMaxYear(parseNumber(e.target.value) ?? maxYear)} className={cx("w-full px-3 py-2 rounded-xl outline-none border", isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10")} />
                </div>
              </div>
            </div>

            {/* Genres */}
            {allGenres.length > 0 && (
              <div className={cx("rounded-2xl border p-4", panel)}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={cx("text-sm", subtle)}>Filter by Genres</h3>
                  <button onClick={() => setGenreFilter([])} className={cx("text-xs px-2 py-1 rounded-lg border border-violet-400 text-violet-100 bg-violet-500/10 hover:bg-violet-500/20")}>Clear</button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-[140px] overflow-auto pr-1">
                  {allGenres.map((g) => {
                    const active = genreFilter.includes(g);
                    return (
                      <button key={g} onClick={() => setGenreFilter((prev) => active ? prev.filter((x) => x !== g) : [...prev, g])}
                        className={cx("px-2 py-1 rounded-lg border text-xs", active ? "bg-violet-500 text-white border-violet-500" : (isDark ? "bg-neutral-800 border-white/10" : "bg-white border-black/10"))}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Summary + Fascinating facts */}
        {rawRows.length > 0 && (
          <section className="mt-6 grid gap-4 md:grid-cols-4">
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className={cx("text-xs", subtle)}>Titles</div>
              <div className="text-2xl font-semibold">{facts.n}</div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className={cx("text-xs", subtle)}>Avg Your Rating</div>
              <div className="text-2xl font-semibold">{fmt(facts.avgYour)}</div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className={cx("text-xs", subtle)}>Avg IMDb Rating</div>
              <div className="text-2xl font-semibold">{fmt(facts.avgImdb)}</div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className={cx("text-xs", subtle)}>Estimated Watch‑time</div>
              <div className="text-2xl font-semibold">{fmt(facts.totalHours, 1)} hrs</div>
            </div>
          </section>
        )}

        {rawRows.length > 0 && (
          <section className="mt-4 grid gap-4 md:grid-cols-3">
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm font-semibold mb-1">Longest rating streak</div>
              <div className={cx("text-sm", subtle)}>
                {facts.streak.len > 0 ? (
                  <>
                    {facts.streak.len} days
                    {facts.streak.start && facts.streak.end && (
                      <span> ({facts.streak.start.toLocaleDateString()} → {facts.streak.end.toLocaleDateString()})</span>
                    )}
                  </>
                ) : "–"}
              </div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm font-semibold mb-1">Longest gap between ratings</div>
              <div className={cx("text-sm", subtle)}>
                {facts.gap.days > 0 ? (
                  <>
                    {facts.gap.days} days
                    {facts.gap.start && facts.gap.end && (
                      <span> ({facts.gap.start.toLocaleDateString()} → {facts.gap.end.toLocaleDateString()})</span>
                    )}
                  </>
                ) : "–"}
              </div>
            </div>
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm font-semibold mb-1">Biggest disagreement</div>
              <div className={cx("text-sm", subtle)}>
                {facts.disagree ? (
                  <>
                    <span className="font-medium">{facts.disagree.title}</span> — you: {facts.disagree.your}, IMDb: {facts.disagree.imdb} (Δ {fmt(facts.disagree.delta, 1)})
                  </>
                ) : "–"}
              </div>
            </div>
          </section>
        )}

        {rawRows.length > 0 && facts.topDirector && (
          <section className="mt-4">
            <div className={cx("rounded-2xl border p-4", panel)}>
              <div className="text-sm"><span className="font-semibold">Top director by your average</span> (≥3 titles): {facts.topDirector.director} — {fmt(facts.topDirector.avg)} across {facts.topDirector.n} titles</div>
            </div>
          </section>
        )}

        {/* Charts */}
        {rawRows.length > 0 && (
          <section className="mt-6 grid gap-6">
            <div className={cx("rounded-2xl border p-4", panel)}>
              <h3 className="font-semibold mb-3">Ratings over time (Your Rating)</h3>
              <div className="w-full h-72">
                <ResponsiveContainer>
                  <LineChart data={timeSeries} margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString()} />
                    <YAxis domain={[0, 10]} />
                    <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} formatter={(v) => [v, "Your Rating"]} />
                    <Legend />
                    <Line type="monotone" dataKey="your" dot={false} />
                    <Brush dataKey="date" height={20} stroke="#8884d8" travellerWidth={10} />
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
                      <Bar dataKey="count" />
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
                      <XAxis type="number" dataKey="imdb" name="IMDb" domain={[0, 10]} />
                      <YAxis type="number" dataKey="your" name="Your" domain={[0, 10]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [v, n]} labelFormatter={() => ""} />
                      <Legend />
                      <Scatter name="Titles" data={yourVsImdb} />
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
                      <YAxis domain={[0, 10]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="avg" />
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
                      <Bar dataKey="count" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className={cx("rounded-2xl border p-4", panel)}>
                <h3 className="font-semibold mb-3">Runtime vs Your Rating</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="runtime" name="Runtime (mins)" />
                      <YAxis type="number" dataKey="your" name="Your Rating" domain={[0, 10]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [v, n]} labelFormatter={() => ""} />
                      <Legend />
                      <Scatter name="Titles" data={runtimeVsYour} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={cx("rounded-2xl border p-4", panel)}>
                <h3 className="font-semibold mb-3">Average by Day of Week</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <BarChart data={facts.dowAvg}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dow" />
                      <YAxis domain={[0, 10]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="avg" />
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
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* Table + Export */}
        {rawRows.length > 0 && (
          <section className={cx("mt-6 rounded-2xl border p-4", panel)}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Most recently rated (first 200 rows)</h3>
              <button onClick={() => downloadCSVFromRows(filtered)} className={cx("px-3 py-2 rounded-xl font-medium", isDark ? "bg-white text-neutral-900" : "bg-neutral-900 text-white")}>
                Download filtered CSV
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className={cx("text-left border-b", isDark ? "text-neutral-400 border-white/10" : "text-neutral-600 border-black/10")}><tr>
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Your</th>
                    <th className="py-2 pr-4">IMDb</th>
                    <th className="py-2 pr-4">Year</th>
                    <th className="py-2 pr-4">Genres</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Rated on</th>
                  </tr>
                </thead>
                <tbody>
                  {ratedTable.map((r, i) => (
                    <tr key={r.__tconst + i} className={cx("border-b", isDark ? "border-white/5" : "border-black/5")}><td className="py-2 pr-4">
                        {r.__url ? (
                          <a href={r.__url} target="_blank" rel="noreferrer" className={cx("underline underline-offset-2", isDark ? "decoration-white/30 hover:decoration-white" : "decoration-black/30 hover:decoration-black")}>                            {r.__title}
                          </a>
                        ) : (
                          r.__title
                        )}
                      </td>
                      <td className="py-2 pr-4">{fmt(r.__yourRating, 0)}</td>
                      <td className="py-2 pr-4">{fmt(r.__imdbRating, 1)}</td>
                      <td className="py-2 pr-4">{Number.isFinite(r.__year) ? r.__year : ""}</td>
                      <td className={cx("py-2 pr-4", subtle)}>{r.__genres.join(", ")}</td>
                      <td className={cx("py-2 pr-4", subtle)}>{r.__type}</td>
                      <td className={cx("py-2 pr-4", subtle)}>{r.__dateRated ? r.__dateRated.toLocaleDateString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={cx("mt-10 text-xs space-y-2", subtle)}>
          <p>
            Columns detected: <code>Your Rating</code>, <code>IMDb Rating</code>, <code>Runtime (mins)</code>, <code>Year</code>, <code>Genres</code>, <code>Title Type</code>, <code>Date Rated</code>, <code>URL</code>.
          </p>
          <p>
            Note: IMDb doesn’t expose a personal-ratings API. For automatic loading, save your exported CSV to a public link (e.g. Google Drive → <code>uc?export=download&id=…</code>) and paste it above. The app will remember it.
          </p>
        </section>
      </main>
    </div>
  );
}

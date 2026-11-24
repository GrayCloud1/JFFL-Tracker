(() => {
const C = window.TRACKER_CONFIG;
const S = "https://api.sleeper.app/v1", S2 = "https://api.sleeper.com";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = u => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(r.status + " " + u); return r.json(); });
const ESPN2SLP = { WSH: "WAS", JAC: "JAX" };
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => "position[]=" + p).join("&");
const PAL = ["#c8102e", "#1f5fbf", "#0a8a5f", "#7b3fbf", "#e07000", "#0f8fa8", "#8a5a2b", "#c2378a", "#6b8a00", "#4a5560", "#b8860b", "#2b3a8f"];
const f1 = x => (+x).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const tFmt = (t, sec) => new Date(t).toLocaleTimeString([], sec ? { hour: "numeric", minute: "2-digit", second: "2-digit" } : { hour: "numeric", minute: "2-digit" });
const fp = p => p >= 0.9995 ? "✓" : p <= 0.0005 ? "—" : p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : Math.round(p * 100) + "%";
const amer = p => { if (p >= 0.9995) return "LOCK"; if (p <= 0.0005) return "—"; const r5 = x => Math.round(x / 5) * 5;
  return p >= 0.5 ? "−" + Math.max(100, r5(100 * p / (1 - p))) : "+" + Math.min(99995, Math.max(100, r5(100 * (1 - p) / p))); };
const half = x => (Math.round(x * 2) / 2).toFixed(1);

let prevFinals = null, T = {}, nextAt = 0, lastFetch = 0, lastChange = 0, lastSig = "", timer = null, anyLive = false, histKey = "", hist = [];

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const color = id => PAL[(id - 1) % PAL.length];
function initials(name) {
  let w = String(name).replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean);
  if (w.some(x => /[A-Za-z]/.test(x))) w = w.filter(x => /[A-Za-z]/.test(x));
  if (!w.length) return String(name).slice(0, 2).toUpperCase() || "?";
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}
const mono = id => `<span class="mono" style="background:${color(id)}" aria-hidden="true">${esc(initials(T[id].name))}</span>`;
const code = id => { let w = String(T[id].name).replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean); if (w.some(x => /[A-Za-z]/.test(x))) w = w.filter(x => /[A-Za-z]/.test(x));
  return (w.length > 2 ? w.map(x => x[0]).join("").slice(0, 3) : w.length === 2 ? w[0][0] + w[1].slice(0, 2) : (w[0] || "TM").slice(0, 3)).toUpperCase(); };
function heat(p) {
  if (p <= 0.0005) return `<span class="heat" style="color:var(--mute)">—</span>`;
  const a = 0.07 + 0.88 * Math.min(1, p);
  return `<span class="heat" style="background:rgba(var(--heat),${a.toFixed(2)});color:${a > 0.55 ? "#fff" : "var(--ink)"}">${fp(p)}</span>`;
}

// ---------- history (per viewer, per league + week) ----------
function loadHist(key) { if (histKey === key) return; histKey = key; try { hist = JSON.parse(localStorage.getItem(key) || "[]"); } catch { hist = []; } }
function pushHist(e) { hist.push(e); if (hist.length > 500) hist = hist.slice(-500); try { localStorage.setItem(histKey, JSON.stringify(hist)); } catch {} }

// ---------- data ----------
async function gameClock(season, week) {
  const frac = {}, live = [];
  try {
    const e = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
    for (const ev of e.events || []) {
      const st = ev.status, s = st.type.state; let f = 1;
      if (s === "post") f = 0;
      else if (s === "in") {
        const [m, sec] = String(st.displayClock || "0:00").split(":").map(Number);
        f = st.period > 4 ? 0.01 : Math.max(0.005, ((4 - st.period) * 900 + (m * 60 + (sec || 0))) / 3600);
        live.push(ev.shortName + " " + st.type.shortDetail);
      }
      for (const c of ev.competitions[0].competitors) frac[ESPN2SLP[c.team.abbreviation] || c.team.abbreviation] = f;
    }
  } catch (err) {
    const sch = await get(`${S2}/schedule/nfl/regular/${season}`);
    for (const g of sch.filter(g => g.week == week)) {
      const f = g.status === "complete" ? 0 : g.status === "in_game" ? 0.5 : 1;
      frac[g.home] = frac[g.away] = f; if (f === 0.5) live.push(`${g.away} @ ${g.home}`);
    }
  }
  return { frac, live };
}

async function liveWeek(L, week) {
  const [mus, proj, clock] = await Promise.all([
    get(`${S}/league/${C.leagueId}/matchups/${week}`),
    get(`${S2}/projections/nfl/${L.season}/${week}?season_type=regular&${POS}`),
    gameClock(L.season, week)
  ]);
  const rec = L.scoring_settings.rec, key = rec >= 1 ? "pts_ppr" : rec >= 0.5 ? "pts_half_ppr" : "pts_std";
  const P = {}; for (const p of proj) P[p.player_id] = p;
  const teams = {};
  for (const m of mus) {
    const items = [];
    (m.starters || []).forEach(pid => {
      if (!pid || pid === "0") return;
      const p = P[pid]; if (!p) return;
      const nfl = p.team, f = clock.frac[nfl] ?? 0;
      let mu = (p.stats && p.stats[key]) || 0;
      if (f === 1 && ["Out", "IR", "Sus", "PUP"].includes(p.player && p.player.injury_status)) mu = 0;
      if (f > 0 && mu > 0) items.push({ nfl, mu: mu * f, sd: 0.62 * mu * Math.sqrt(f) });
    });
    teams[m.roster_id] = { live: m.custom_points ?? m.points ?? 0, items };
  }
  return { week, teams, pairs: pairsOf(mus), live: clock.live };
}

function pairsOf(mus) {
  const by = {};
  for (const m of mus) if (m.matchup_id != null) (by[m.matchup_id] ||= []).push(m.roster_id);
  return Object.entries(by).filter(([, v]) => v.length === 2).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function drawLive(wk) {
  const sc = {}, z = {};
  for (const id in wk.teams) {
    const t = wk.teams[id]; let x = t.live;
    for (const it of t.items) { const zt = z[it.nfl] ??= gauss(); x += it.mu + it.sd * (0.5 * zt + 0.866 * gauss()); }
    sc[id] = Math.max(x, t.live - 3);
  }
  return sc;
}
const drawAvg = a => Math.max(0, a + (0.18 * a + 8) * gauss());
const projOf = t => t.live + t.items.reduce((s, i) => s + i.mu, 0);

// ---------- brackets ----------
function seedBracket(f) {
  const P = f.length;
  if (P === 6) return [{ m: 1, r: 1, t1: f[2], t2: f[5] }, { m: 2, r: 1, t1: f[3], t2: f[4] }, { m: 3, r: 2, t1: f[0], t2_from: { w: 2 } }, { m: 4, r: 2, t1: f[1], t2_from: { w: 1 } }, { m: 5, r: 3, p: 1, t1_from: { w: 3 }, t2_from: { w: 4 } }];
  if (P === 4) return [{ m: 1, r: 1, t1: f[0], t2: f[3] }, { m: 2, r: 1, t1: f[1], t2: f[2] }, { m: 3, r: 2, p: 1, t1_from: { w: 1 }, t2_from: { w: 2 } }];
  if (P === 8) return [{ m: 1, r: 1, t1: f[0], t2: f[7] }, { m: 2, r: 1, t1: f[3], t2: f[4] }, { m: 3, r: 1, t1: f[1], t2: f[6] }, { m: 4, r: 1, t1: f[2], t2: f[5] },
    { m: 5, r: 2, t1_from: { w: 1 }, t2_from: { w: 2 } }, { m: 6, r: 2, t1_from: { w: 3 }, t2_from: { w: 4 } }, { m: 7, r: 3, p: 1, t1_from: { w: 5 }, t2_from: { w: 6 } }];
  return null;
}
function play(br, pick) {
  const res = {}, reach = {};
  const who = (t, f) => t ?? (f ? (f.w ? res[f.w]?.w : res[f.l]?.l) : null);
  for (const m of br) {
    const a = who(m.t1, m.t1_from), b = who(m.t2, m.t2_from);
    if (a != null) reach[a] = Math.max(reach[a] || 0, m.r);
    if (b != null) reach[b] = Math.max(reach[b] || 0, m.r);
    let w, l;
    if (m.w) { w = m.w; l = m.l; } else if (a == null || b == null) { w = a ?? b; l = null; } else { w = pick(a, b, m); l = w === a ? b : a; }
    res[m.m] = { w, l };
  }
  const fin = br.find(m => m.p === 1) || br[br.length - 1];
  return { reach, champ: res[fin.m].w };
}

// ---------- standings ----------
function standings(L, R) {
  const med = !!L.settings.league_average_match, base = {}, avg = {};
  for (const r of R) {
    const s = r.settings, g = (s.wins + s.losses + (s.ties || 0)) / (med ? 2 : 1) || 1, pf = s.fpts + (s.fpts_decimal || 0) / 100;
    base[r.roster_id] = { w: s.wins, l: s.losses, t: s.ties || 0, pf }; avg[r.roster_id] = pf / g;
  }
  return { base, avg, med };
}
function seedField(ids, W, PF, P, wc) {
  const top = [...ids].sort((a, b) => W[b] - W[a] || PF[b] - PF[a]).slice(0, P - wc);
  return [...top, ...ids.filter(i => !top.includes(i)).sort((a, b) => PF[b] - PF[a]).slice(0, wc)];
}

// ---------- simulation ----------
function simulate(L, R, mode, weeks, br, liveWk, round) {
  const N = C.sims, ids = R.map(r => r.roster_id), P = L.settings.playoff_teams || 6;
  const wc = Math.min(C.pfWildcardSpots || 0, P), byes = 2 ** Math.ceil(Math.log2(P)) - P;
  const { base, avg, med } = standings(L, R);
  const O = {}; ids.forEach(i => O[i] = { make: 0, bye: 0, seeds: Array(P).fill(0), reach: {}, final: 0, champ: 0, wMin: 1e9, wMax: -1 });
  const wp = {}, fields = {};
  let maxR = 0;
  for (let n = 0; n < N; n++) {
    let bracket = br, liveSc = null;
    if (mode === "race") {
      const W = {}, PF = {};
      ids.forEach(i => { W[i] = base[i].w; PF[i] = base[i].pf; });
      for (const wk of weeks) {
        const sc = {}; if (wk.future) ids.forEach(i => sc[i] = drawAvg(avg[i])); else Object.assign(sc, drawLive(wk));
        ids.forEach(i => PF[i] += sc[i] ?? 0);
        for (const [a, b] of wk.pairs) { const w = sc[a] >= sc[b] ? a : b; W[w]++; if (wk.cur) wp[a + "-" + b] = (wp[a + "-" + b] || 0) + (w === a); }
        if (med) [...ids].sort((a, b) => sc[b] - sc[a]).slice(0, Math.floor(ids.length / 2)).forEach(i => W[i]++);
      }
      ids.forEach(i => { O[i].wMin = Math.min(O[i].wMin, W[i]); O[i].wMax = Math.max(O[i].wMax, W[i]); });
      const field = seedField(ids, W, PF, P, wc);
      field.forEach((i, k) => { O[i].make++; O[i].seeds[k]++; if (k < byes) O[i].bye++; });
      const key = field.join(","); fields[key] = (fields[key] || 0) + 1;
      bracket = seedBracket(field);
      if (!bracket) continue;
    } else {
      liveSc = drawLive(liveWk);
      for (const [a, b] of liveWk.pairs) wp[a + "-" + b] = (wp[a + "-" + b] || 0) + (liveSc[a] >= liveSc[b]);
    }
    const out = play(bracket, (a, b, m) => {
      if (liveSc && m.r === round && liveWk.teams[a] && liveWk.teams[b]) return liveSc[a] >= liveSc[b] ? a : b;
      return drawAvg(avg[a]) >= drawAvg(avg[b]) ? a : b;
    });
    const fin = bracket.find(m => m.p === 1) || bracket[bracket.length - 1]; maxR = fin.r;
    for (const t in out.reach) { const o = O[t]; for (let r = 1; r <= out.reach[t]; r++) o.reach[r] = (o.reach[r] || 0) + 1; if (out.reach[t] === fin.r) o.final++; }
    if (out.champ != null) O[out.champ].champ++;
  }
  ids.forEach(i => { const o = O[i]; o.make /= N; o.bye /= N; o.final /= N; o.champ /= N; o.seeds = o.seeds.map(c => c / N); for (const r in o.reach) o.reach[r] /= N; });
  for (const k in wp) wp[k] /= N;
  const best = Object.entries(fields).sort((a, b) => b[1] - a[1])[0];
  return { O, wp, P, wc, byes, med, base, maxR, field: best ? best[0].split(",").map(Number) : null };
}

// ---------- render ----------
function renderTicker(wk, wp, labels) {
  if (!wk || !wk.pairs.length) { $("tickerBar").hidden = true; return; }
  $("tickerBar").hidden = false;
  $("ticker").innerHTML = wk.pairs.map(([a, b], k) => {
    const ta = wk.teams[a], tb = wk.teams[b], done = !ta.items.length && !tb.items.length, p = wp[a + "-" + b] ?? 0.5;
    const cls = (x, y) => done ? (x.live >= y.live ? "w" : "l") : "";
    return `<div class="tk"><div class="h">${done ? "FINAL" : Math.round(Math.max(p, 1 - p) * 100) + "% " + esc(code(p >= .5 ? a : b))}</div>
      <span class="${cls(ta, tb)}">${esc(code(a))}</span><span class="s ${cls(ta, tb)}">${f1(ta.live)}</span><span class="${cls(tb, ta)}">${esc(code(b))}</span><span class="s ${cls(tb, ta)}">${f1(tb.live)}</span></div>`;
  }).join("");
}

function renderKPIs(res, mode, alive, wk) {
  const ids = Object.keys(res.O).map(Number), fav = ids.sort((a, b) => res.O[b].champ - res.O[a].champ)[0];
  const k = [];
  k.push(`<div class="kpi">${mono(fav)}<div><div class="k">Title favorite</div><div class="v">${fp(res.O[fav].champ)}</div><div class="d">${esc(T[fav].name)} · ${amer(res.O[fav].champ)}</div></div></div>`);
  if (mode === "race" && alive.length) {
    const open = res.P - ids.filter(i => res.O[i].make >= 0.9995).length;
    k.push(`<div class="kpi"><div><div class="k">Playoff race</div><div class="v">${open} spot${open === 1 ? "" : "s"} left</div><div class="d">${alive.length} teams still alive</div></div></div>`);
  } else {
    const first = hist[0] && hist[0].m;
    let mv = null; if (first) for (const i of ids) { const d = res.O[i].champ - (first[i] ?? res.O[i].champ); if (!mv || Math.abs(d) > Math.abs(mv.d)) mv = { i, d }; }
    k.push(mv && Math.abs(mv.d) >= 0.02 ? `<div class="kpi">${mono(mv.i)}<div><div class="k">Biggest mover</div><div class="v" style="color:${mv.d > 0 ? "var(--fav)" : "var(--dog)"}">${mv.d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(mv.d) * 100)} pts</div><div class="d">${esc(T[mv.i].name)} since ${tFmt(hist[0].t)}</div></div></div>`
      : `<div class="kpi"><div><div class="k">Field</div><div class="v">${res.P} teams</div><div class="d">${res.byes ? res.byes + " first-round byes" : "Single elimination"}</div></div></div>`);
  }
  if (wk && wk.pairs.length) {
    const open = wk.pairs.filter(([a, b]) => wk.teams[a].items.length || wk.teams[b].items.length);
    const close = open.map(([a, b]) => ({ a, b, p: res.wp[a + "-" + b] ?? .5 })).sort((x, y) => Math.abs(x.p - .5) - Math.abs(y.p - .5))[0];
    k.push(close ? `<div class="kpi"><div><div class="k">Closest matchup</div><div class="v">${Math.round(Math.max(close.p, 1 - close.p) * 100)}–${Math.round(Math.min(close.p, 1 - close.p) * 100)}</div><div class="d">${esc(T[close.a].name)} vs ${esc(T[close.b].name)}</div></div></div>`
      : `<div class="kpi"><div><div class="k">This week</div><div class="v">All final</div><div class="d">${wk.pairs.length} matchups complete</div></div></div>`);
  }
  $("kpis").innerHTML = k.join("");
}

function renderTable(res, mode, alive) {
  const { O, base } = res, raceAlive = mode === "race" && alive.length;
  const metric = i => raceAlive ? O[i].make : O[i].champ;
  let ids = Object.keys(O).map(Number);
  if (mode !== "race") ids = ids.filter(i => O[i].reach[1] || O[i].final || O[i].champ);
  ids.sort((a, b) => (raceAlive ? O[b].make - O[a].make : 0) || O[b].champ - O[a].champ || O[b].final - O[a].final || O[b].make - O[a].make);
  const first = hist[0] && hist[0].m;
  const cols = mode === "race" ? ["Make playoffs", "First-round bye", "Make final", "Win title", "Title odds"] : ["Make final", "Win title", "Title odds"];
  const hideIdx = mode !== "race" ? [] : raceAlive ? [1, 2] : [0, 1];
  $("fHead").innerHTML = `<tr><th></th><th>Team</th>${cols.map((c, k) => `<th class="${hideIdx.includes(k) ? "hide-s" : ""}${k === cols.length - 1 ? " oc" : ""}">${c}</th>`).join("")}</tr>`;
  const cutAt = raceAlive ? res.P : -1;
  $("fBody").innerHTML = ids.map((i, k) => {
    const o = O[i], b = base[i];
    const recTxt = o.wMin === o.wMax && mode === "race" ? `${o.wMin}-${b.w + b.l + res.gpw - o.wMin}` : `${b.w}-${b.l}`;
    const d = first && first[i] != null ? Math.round((metric(i) - first[i]) * 100) : 0;
    const seed = mode === "race" ? o.seeds.indexOf(Math.max(...o.seeds)) + 1 : 0;
    const sub = `${recTxt}${b.t ? "-" + b.t : ""} · ${f1(b.pf + (res.wkLive?.[i] ?? 0))} PF${mode === "race" && o.make >= 0.5 ? ` · ${o.make >= 0.9995 ? "" : "proj. "}${ord(seed)} seed` : ""}`;
    const cells = mode === "race" ? [o.make, o.bye, o.final, o.champ] : [o.final, o.champ];
    const out = mode === "race" ? o.make <= 0.0005 : o.champ <= 0.0005 && o.final <= 0.0005;
    return `<tr class="${out ? "out" : ""}${k === cutAt ? " cut" : ""}"><td class="rk">${k + 1}</td>
      <td class="tm"><div class="team">${mono(i)}<div style="min-width:0"><div class="n">${esc(T[i].name)}${d ? `<span class="dl ${d > 0 ? "up" : "dn"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>` : ""}</div><div class="r">${sub}</div></div></div></td>
      ${cells.map((p, c) => `<td class="${hideIdx.includes(c) ? "hide-s" : ""}">${heat(p)}</td>`).join("")}
      <td class="oc"><span class="odds${o.champ >= 0.5 ? " fav" : ""}">${amer(o.champ)}</span></td></tr>`;
  }).join("");
  $("fTitle").textContent = raceAlive ? "Playoff odds" : mode === "race" ? "Championship odds" : "Championship odds";
  $("fCap").textContent = `${C.sims.toLocaleString()} simulations${first ? " · ▲▼ change since " + tFmt(hist[0].t) : ""}`;
}

function renderBracket(res, br, mode, liveWk, round, seedOf, decided) {
  if (!br) { $("bracket").hidden = true; return; }
  $("bracket").hidden = false;
  const { O, maxR } = res, rounds = Math.max(...br.map(m => m.r));
  const names = r => r === rounds ? "Championship" : r === rounds - 1 ? "Semifinals" : r === 1 ? "First round" : "Round " + r;
  const cols = [];
  for (let r = 1; r <= rounds; r++) {
    const ms = br.filter(m => m.r === r);
    cols.push(`<div class="round"><h3>${names(r)}${mode !== "race" && r === round ? " · live" : ""}</h3>${ms.map(m => {
      const isLive = mode !== "race" && r === round && m.t1 && m.t2 && liveWk.teams[m.t1] && liveWk.teams[m.t2];
      const pg = isLive ? res.wp[m.t1 + "-" + m.t2] ?? res.wp[m.t2 + "-" + m.t1] ?? .5 : null;
      const slot = (t, f, first) => {
        if (t == null) return `<div class="slot tbd"><span class="sd"></span><span></span><span class="n">${f ? (f.w ? "Winner" : "Loser") + " of game " + (f.w || f.l) : "TBD"}</span><span></span></div>`;
        const o = O[t], adv = r === rounds ? o.champ : (o.reach[r + 1] || 0);
        const pTxt = isLive ? `${f1(liveWk.teams[t].live)} · ${Math.round((first ? pg : 1 - pg) * 100)}%` : m.w ? (m.w === t ? "W" : "L") : fp(adv);
        const cls = m.w ? (m.w === t ? "win" : "lose") : "";
        return `<div class="slot ${cls}"><span class="sd">${seedOf[t] || ""}</span>${mono(t)}<span class="n">${esc(T[t].name)}</span><span class="p">${pTxt}</span></div>`;
      };
      return `<div class="match${r === rounds ? " champ" : ""}">${isLive ? '<span class="tag">LIVE</span>' : ""}${slot(m.t1, m.t1_from, true)}${slot(m.t2, m.t2_from, false)}</div>`;
    }).join("")}</div>`);
  }
  $("bk").style.gridTemplateColumns = `repeat(${rounds},minmax(220px,1fr))`;
  $("bk").innerHTML = cols.join("");
  $("bTitle").textContent = mode === "race" && !decided ? "Projected bracket" : "Bracket";
  $("bCap").textContent = mode === "race" && !decided ? "Most likely field · % = chance to advance" : mode === "race" ? "% = chance to advance" : "Live games show score · win %; others show chance to advance";
}

function needle(p, ca, cb) {
  const cx = 130, cy = 118, R = 100, ang = Math.PI * p, x = cx + 86 * Math.cos(ang), y = cy - 86 * Math.sin(ang);
  const arc = (a0, a1, col) => { const p0 = [cx + R * Math.cos(a0), cy - R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy - R * Math.sin(a1)];
    return `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${R} ${R} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" fill="none" stroke="${col}" stroke-width="16"/>`; };
  const ticks = [0.1, 0.25, 0.5, 0.75, 0.9].map(t => { const a = Math.PI * t; return `<line x1="${cx + 110 * Math.cos(a)}" y1="${cy - 110 * Math.sin(a)}" x2="${cx + 118 * Math.cos(a)}" y2="${cy - 118 * Math.sin(a)}" stroke="var(--mute)" stroke-width="1.5"/>`; }).join("");
  return `<svg class="needle" viewBox="0 0 260 132" role="img" aria-label="Win probability ${Math.round(p * 100)} percent">
    ${arc(Math.PI, Math.PI / 2, ca)}${arc(Math.PI / 2, 0, cb)}
    <path d="M${cx - 100} ${cy} A100 100 0 0 1 ${cx + 100} ${cy}" fill="none" stroke="var(--panel)" stroke-width="16" opacity=".55"/>
    ${ticks}<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="7" fill="var(--ink)"/></svg>`;
}

function renderGames(wk, res, title, labels) {
  if (!wk || !wk.pairs.length) { $("matchups").hidden = true; return; }
  $("matchups").hidden = false; $("mTitle").textContent = title;
  $("games").innerHTML = wk.pairs.map(([a, b], k) => {
    const ta = wk.teams[a], tb = wk.teams[b], done = !ta.items.length && !tb.items.length;
    const p = done ? (ta.live >= tb.live ? 1 : 0) : (res.wp[a + "-" + b] ?? .5);
    const pa = projOf(ta), pb = projOf(tb), favA = pa >= pb, sp = half(Math.abs(pa - pb));
    const side = (id, t, pr, pj, cls) => `<div class="side ${cls}"><span class="n">${esc(T[id].name)}</span><span class="sc">${f1(t.live)}</span><span class="pj">${t.items.length ? `proj ${f1(pj)} · ${t.items.length} left` : "done"}</span></div>`;
    return `<div class="card mu"><div class="top2"><span>${labels ? labels[k] : "Matchup " + (k + 1)}</span><span class="${done ? "" : "lv"}">${done ? "Final" : "Win probability"}</span></div>
      ${needle(p, color(a), color(b))}
      <div class="vs">${side(a, ta, p, pa, "a")}<div class="mid">${done ? "FINAL" : Math.round(Math.max(p, 1 - p) * 100) + "%<br><span style='font-weight:600;font-size:11px'>" + esc(code(p >= .5 ? a : b)) + "</span>"}</div>${side(b, tb, 1 - p, pb, "b")}</div>
      ${done ? "" : `<div class="line"><span>Spread <b>${esc(code(favA ? a : b))} −${sp}</b></span><span>O/U <b>${half(pa + pb)}</b></span><span>ML <b>${esc(code(a))} ${amer(p)}</b> / <b>${esc(code(b))} ${amer(1 - p)}</b></span></div>`}</div>`;
  }).join("");
}

function renderTrend(ids, heading) {
  const pts = hist.filter(h => h.m);
  $("trend").hidden = !ids.length; $("tTitle").textContent = heading;
  if (pts.length < 2) { $("figWrap").innerHTML = `<div class="empty">The chart builds as odds move. Keep this page open during games.</div>`; $("legend").innerHTML = ""; return; }
  if (!$("trendSvg")) $("figWrap").innerHTML = `<svg id="trendSvg" role="img" aria-label="Odds over time"></svg>`;
  const svg = $("trendSvg"), draw = () => {
    const W = svg.clientWidth, H = svg.clientHeight, l = 44, r = 16, t = 16, b = 28;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, x = v => l + (v - t0) / Math.max(1, t1 - t0) * (W - l - r), y = p => t + (1 - p) * (H - t - b);
    let g = [0, .25, .5, .75, 1].map(p => `<line x1="${l}" x2="${W - r}" y1="${y(p)}" y2="${y(p)}" stroke="var(--line)"/><text x="${l - 8}" y="${y(p) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${p * 100}%</text>`).join("");
    g += `<text x="${l}" y="${H - 8}" font-size="11" fill="var(--mute)">${tFmt(t0)}</text><text x="${W - r}" y="${H - 8}" font-size="11" fill="var(--mute)" text-anchor="end">${tFmt(t1)}</text>`;
    ids.forEach(id => { const d = pts.filter(h => h.m[id] != null).map(h => `${x(h.t).toFixed(1)},${y(h.m[id]).toFixed(1)}`);
      if (d.length) { const last = d[d.length - 1].split(","); g += `<polyline points="${d.join(" ")}" fill="none" stroke="${color(id)}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color(id)}"/>`; } });
    svg.innerHTML = g;
  };
  draw(); (svg._ro ||= new ResizeObserver(draw)).observe(svg);
  $("legend").innerHTML = ids.map(id => `<span style="--c:${color(id)}">${esc(T[id].name)}</span>`).join("");
}

// ---------- main ----------
async function refresh() {
  clearTimeout(timer);
  try {
    const [L, users, R, st] = await Promise.all([get(`${S}/league/${C.leagueId}`), get(`${S}/league/${C.leagueId}/users`), get(`${S}/league/${C.leagueId}/rosters`), get(`${S}/state/nfl`)]);
    const U = {}; users.forEach(u => U[u.user_id] = u);
    T = {}; R.forEach(r => { const u = U[r.owner_id] || {}; T[r.roster_id] = { name: (u.metadata && u.metadata.team_name) || u.display_name || "Team " + r.roster_id }; });
    $("lg").textContent = L.name.toUpperCase().slice(0, 8);
    document.title = `${L.name} Playoff Forecast`;
    const pws = L.settings.playoff_week_start, lastReg = pws - 1, lastScored = L.settings.last_scored_leg || 0;
    const curWeek = st.season_type === "regular" ? (st.leg || st.week) : (st.season_type === "post" || st.season_type === "off") ? 99 : 1;
    const ids = R.map(r => r.roster_id), P = L.settings.playoff_teams || 6, wc = Math.min(C.pfWildcardSpots || 0, P);
    let wkShown, res, mode, labels = null;
    if (lastScored < lastReg && curWeek < 99) {
      mode = "race";
      const weeks = [], liveW = Math.min(curWeek, lastReg);
      for (let w = lastScored + 1; w <= lastReg; w++) {
        if (w <= curWeek) { const wk = await liveWeek(L, w); wk.cur = w === liveW; weeks.push(wk); }
        else weeks.push({ future: true, pairs: pairsOf(await get(`${S}/league/${C.leagueId}/matchups/${w}`)) });
      }
      wkShown = weeks.find(w => w.cur);
      loadHist(`jffl2:${C.leagueId}:${L.season}:w${liveW}`);
      res = simulate(L, R, mode, weeks);
      res.gpw = weeks.length * (res.med ? 2 : 1);
      $("eyebrow").textContent = `${L.season} season · Week ${liveW}${lastReg - liveW ? ` · ${lastReg - liveW + 1} weeks left` : " · final regular-season week"}`;
    } else {
      mode = "playoffs";
      const brAll = await get(`${S}/league/${C.leagueId}/winners_bracket`);
      const br = brAll.filter(m => !m.p || m.p === 1).sort((a, b) => a.r - b.r || a.m - b.m);
      const maxR = Math.max(...br.map(m => m.r)), round = Math.min(maxR, Math.max(1, curWeek - pws + 1));
      wkShown = await liveWeek(L, pws + round - 1);
      const inBr = new Set(br.flatMap(m => [m.t1, m.t2]).filter(Boolean));
      wkShown = { ...wkShown, pairs: br.filter(m => m.r === round && m.t1 && m.t2 && wkShown.teams[m.t1] && wkShown.teams[m.t2]).map(m => [m.t1, m.t2]) };
      labels = br.filter(m => m.r === round && m.t1 && m.t2 && wkShown.teams[m.t1] && wkShown.teams[m.t2]).map(m => m.p === 1 ? "Championship" : "Game " + m.m);
      loadHist(`jffl2:${C.leagueId}:${L.season}:w${wkShown.week}`);
      res = simulate(L, R, mode, null, br, wkShown, round);
      res.br = br; res.round = round; res.inBr = inBr;
      $("eyebrow").textContent = `${L.season} playoffs · ${round >= maxR ? "Championship week" : "Round " + round} · Week ${wkShown.week}`;
    }
    res.wkLive = wkShown ? Object.fromEntries(Object.entries(wkShown.teams).map(([k, v]) => [k, v.live])) : {};
    const alive = mode === "race" ? ids.filter(i => res.O[i].make > 0.0005 && res.O[i].make < 0.9995) : [];
    const metricOf = i => mode === "race" && alive.length ? res.O[i].make : res.O[i].champ;
    const prevM = hist.length ? hist[hist.length - 1].m : null;
    const newM = Object.fromEntries(ids.map(i => [i, metricOf(i)]));
    pushHist({ t: Date.now(), m: newM });
    // sound cues: biggest odds swing since the last refresh, newly final matchups, new points
    let swing = 0; if (prevM) for (const i of ids) { const d = newM[i] - (prevM[i] ?? newM[i]); if (Math.abs(d) >= 0.10 && Math.abs(d) > Math.abs(swing)) swing = d; }
    const finalsNow = new Set((wkShown?.pairs || []).filter(([a, b]) => !wkShown.teams[a].items.length && !wkShown.teams[b].items.length).map(p => p.join("-")));
    const newFinals = prevFinals ? [...finalsNow].filter(k => !prevFinals.has(k)).length : 0; prevFinals = finalsNow;

    // standings-based seeds for display
    const { base } = standings(L, R);
    const W = {}, PF = {}; ids.forEach(i => { W[i] = base[i].w; PF[i] = base[i].pf; });
    const seedOf = {};
    if (mode === "race") (res.field || []).forEach((i, k) => seedOf[i] = k + 1); else seedField(ids, W, PF, P, wc).forEach((i, k) => seedOf[i] = k + 1);

    $("title").textContent = mode === "race" ? (alive.length ? "Playoff Forecast" : "Championship Forecast") : "Championship Forecast";
    renderTicker(wkShown, res.wp, labels);
    renderKPIs(res, mode, alive, wkShown);
    renderTable(res, mode, alive);
    renderBracket(res, mode === "race" ? (res.field ? seedBracket(res.field) : null) : res.br, mode, wkShown, res.round, seedOf, mode === "race" && !alive.length);
    renderGames(wkShown, res, mode === "race" ? `Week ${wkShown?.week ?? ""} matchups` : "Live games", labels);
    const contenders = ids.filter(i => metricOf(i) > 0.0005);
    const ever = [...new Set(hist.flatMap(h => Object.keys(h.m || {}).filter(i => h.m[i] > 0.0005 && (mode !== "race" || !alive.length || h.m[i] < 0.9995))))].map(Number);
    renderTrend((ever.length ? ever : contenders).filter(i => T[i]), mode === "race" && alive.length ? "Playoff odds over time" : "Title odds over time");
    $("rules").textContent = `Rules modeled: seeds 1–${P - wc} by record (PF breaks ties)${wc ? `; ${wc === 1 ? "seed " + P + " goes" : "the last " + wc + " seeds go"} to the highest PF among the rest` : ""}.${res.med ? " Each week the top half of scorers gets an extra win." : ""}${res.byes ? ` Top ${res.byes} seeds get a first-round bye.` : ""}`;

    anyLive = !!(wkShown && wkShown.live && wkShown.live.length);
    const sig = wkShown ? Object.values(wkShown.teams).map(t => t.live).join(",") : "";
    const scored = !!lastSig && sig !== lastSig;
    if (sig !== lastSig) { if (lastSig) lastChange = Date.now(); lastSig = sig; }
    window.JFFLSound?.onRefresh({ scored, swing, finals: newFinals });
    lastFetch = Date.now();
    $("pill").className = "pill" + (anyLive ? " live" : "");
    $("pillT").textContent = anyLive ? "LIVE" : "UPDATED " + tFmt(lastFetch).toUpperCase();
    $("status").textContent = anyLive ? `NFL games in progress: ${wkShown.live.join(" · ")}` : "No NFL games in progress. Not affiliated with Sleeper, ESPN or the NFL.";
    tick();
  } catch (err) {
    console.error(err);
    $("pill").className = "pill"; $("pillT").textContent = "RETRYING";
    $("meta").textContent = "Couldn't reach Sleeper. Trying again shortly.";
  }
  nextAt = Date.now() + C.refreshSeconds * 1000;
  timer = setTimeout(refresh, C.refreshSeconds * 1000);
}

function tick() {
  if (!lastFetch) return;
  const ago = s => s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  $("meta").innerHTML = `Updated <b>${tFmt(lastFetch, true)}</b> · next update in <b>${Math.max(0, Math.round((nextAt - Date.now()) / 1000))}s</b>${lastChange ? ` · scores moved ${ago(Math.round((Date.now() - lastChange) / 1000))}` : ""}`;
}

$("refresh").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastFetch > 30000) refresh(); });
setInterval(tick, 1000);
refresh();
})();

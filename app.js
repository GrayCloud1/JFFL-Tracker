(() => {
const C = window.TRACKER_CONFIG;
const S = "https://api.sleeper.app/v1", S2 = "https://api.sleeper.com";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = u => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(r.status + " " + u); return r.json(); });
const ESPN2SLP = { WSH: "WAS", JAC: "JAX" };
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => "position[]=" + p).join("&");
const PAL = ["#c8102e", "#1f5fbf", "#0a8a5f", "#7b3fbf", "#e07000", "#0f8fa8", "#8a5a2b", "#c2378a", "#6b8a00", "#4a5560", "#b8860b", "#2b3a8f"];
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
// phones run fewer simulations to save battery; the odds barely change
const SIMS = matchMedia("(max-width: 700px)").matches || (navigator.hardwareConcurrency || 8) <= 4 ? Math.min(C.sims, 6000) : C.sims;
const f1 = x => (+x).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const tFmt = (t, sec) => new Date(t).toLocaleTimeString([], sec ? { hour: "numeric", minute: "2-digit", second: "2-digit" } : { hour: "numeric", minute: "2-digit" });
const fp = p => p >= 0.9995 ? "✓" : p <= 0.0005 ? "—" : p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : Math.round(p * 100) + "%";
const fpw = p => p >= 0.9995 ? "100%" : p <= 0.0005 ? "0%" : fp(p);
const amer = p => { if (p >= 0.9995) return "LOCK"; if (p <= 0.0005) return "—"; const r5 = x => Math.round(x / 5) * 5;
  return p >= 0.5 ? "−" + Math.max(100, r5(100 * p / (1 - p))) : "+" + Math.min(99995, Math.max(100, r5(100 * (1 - p) / p))); };
const half = x => (Math.round(x * 2) / 2).toFixed(1);

let roundWeeks = () => 1; // weeks per playoff round (JFFL: 2)
const left = t => t.items.filter(i => !i.fut).length; // starters still to play (excludes a not-yet-played week)
let prevFinals = null, T = {}, nextAt = 0, lastFetch = 0, lastChange = 0, lastSig = "", timer = null, anyLive = false, histKey = "", hist = [];
const PV = {}, openRows = new Set();
// last big play per matchup: built by comparing each starter's points between refreshes
let prevPP = null, prevWP = {}, IMP = {}, impKey = "", SC = {};
// On each page load the latest play per team comes from ESPN's play-by-play; while the page stays open, live stats take over.
function loadImp(key) { if (impKey === key) return; impKey = key; prevWP = {};
  try { IMP = JSON.parse(localStorage.getItem(key) || "{}"); } catch { IMP = {}; }
  // one last play per team now ("3-7:3"); move any older one-per-matchup entry to its team
  for (const k of Object.keys(IMP)) if (!k.includes(":")) { const m = IMP[k]; if (m && m.rid != null && !IMP[k + ":" + m.rid]) IMP[k + ":" + m.rid] = m; delete IMP[k]; }
  prevPP = null; try { localStorage.removeItem(key + ":base"); } catch {} }
function saveImp() { try { localStorage.setItem(impKey, JSON.stringify(IMP)); } catch {} }

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const color = id => PAL[(id - 1) % PAL.length];
const words = name => { let w = String(name).replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean); return w.some(x => /[A-Za-z]/.test(x)) ? w.filter(x => /[A-Za-z]/.test(x)) : w; };
function initials(name) { const w = words(name); if (!w.length) return String(name).slice(0, 2).toUpperCase() || "?"; return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); }
// short, readable team name for tight spots (ticker, matchup lines, chart labels on phones)
function shortName(name) {
  let w = String(name).replace(/^\s*team\s+/i, "").split(/\s+/).map(x => x.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}$]+$/gu, "")).filter(Boolean);
  while (w.length > 1 && !/\p{L}/u.test(w[0]) && /[\/:]/.test(w[0])) w.shift();
  let s = w[0] || String(name);
  for (let k = 1; k < w.length && s.length < 6 && (s + " " + w[k]).length <= 12; k++) s += " " + w[k];
  return s.length > 12 ? s.slice(0, 11) + "…" : s;
}
const code = id => T[id].short;
// every team avatar gets a ring in the team's color, so it matches the title bar, trend chart and matchup meters
const mono = (id, cls = "") => `<span class="mono ring ${cls}" style="--ring:${color(id)};background:${color(id)}" aria-hidden="true">${esc(initials(T[id].name))}${T[id].img ? `<img src="${esc(T[id].img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
const nm = id => esc(T[id].name);
const anim = (k, v, f = "p") => `data-k="${k}" data-v="${v}" data-f="${f}"`;
function heat(p, k) {
  if (p <= 0.0005) return `<span class="heat" style="color:var(--mute)">—</span>`;
  const a = 0.07 + 0.88 * Math.min(1, p);
  return `<span class="heat" ${k ? anim(k, p) : ""} style="background:rgba(var(--heat),${a.toFixed(2)});color:${a > 0.55 ? "#fff" : "var(--ink)"}">${fp(p)}</span>`;
}

// count numbers toward their new value and flash green/red when odds move
function animateAll() {
  document.querySelectorAll("[data-k]").forEach(el => {
    const k = el.dataset.k, v = +el.dataset.v, f = el.dataset.f, o = PV[k]; PV[k] = v;
    if (o == null || Math.abs(o - v) < (f === "pts" ? 0.05 : 0.005)) return;
    el.classList.remove("fu", "fd"); void el.offsetWidth; el.classList.add(v > o ? "fu" : "fd");
    if (REDUCE) return;
    const t0 = performance.now(), fmt = f === "pts" ? f1 : f === "pw" ? fpw : fp;
    const step = t => { const q = Math.min(1, (t - t0) / 800), e = 1 - (1 - q) ** 3; el.textContent = fmt(o + (v - o) * e); if (q < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ---------- history (per viewer, per league + week) ----------
function loadHist(key) { if (histKey === key) return; histKey = key; try { hist = JSON.parse(localStorage.getItem(key) || "[]"); } catch { hist = []; } }
function pushHist(e) { hist.push(e); if (hist.length > 500) hist = hist.slice(-500); try { localStorage.setItem(histKey, JSON.stringify(hist)); } catch {} }

// ---------- data ----------
async function gameClock(season, week) {
  const frac = {}, live = [], plays = {}, events = []; let next = null;
  try {
    const e = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
    for (const ev of e.events || []) {
      const st = ev.status, s = st.type.state; let f = 1;
      if (s === "pre" && ev.date && (!next || ev.date < next)) next = ev.date;
      if (s !== "pre") events.push({ id: ev.id, teams: ev.competitions[0].competitors.map(c => ESPN2SLP[c.team.abbreviation] || c.team.abbreviation) });
      if (s === "post") f = 0;
      else if (s === "in") {
        const [m, sec] = String(st.displayClock || "0:00").split(":").map(Number);
        f = st.period > 4 ? 0.01 : Math.max(0.005, ((4 - st.period) * 900 + (m * 60 + (sec || 0))) / 3600);
        live.push(ev.shortName + " " + st.type.shortDetail);
      }
      const lp = s === "in" && ev.competitions[0].situation?.lastPlay?.text;
      for (const c of ev.competitions[0].competitors) { const ab = ESPN2SLP[c.team.abbreviation] || c.team.abbreviation; frac[ab] = f; if (lp) plays[ab] = { text: lp, when: st.type.shortDetail }; }
    }
  } catch (err) {
    const sch = await get(`${S2}/schedule/nfl/regular/${season}`);
    for (const g of sch.filter(g => g.week == week)) {
      const f = g.status === "complete" ? 0 : g.status === "in_game" ? 0.5 : 1;
      frac[g.home] = frac[g.away] = f; if (f === 0.5) live.push(`${g.away} @ ${g.home}`);
    }
  }
  return { frac, live, plays, next, events };
}

async function liveWeek(L, week) {
  const [mus, proj, clock, stats] = await Promise.all([
    get(`${S}/league/${C.leagueId}/matchups/${week}`),
    get(`${S2}/projections/nfl/${L.season}/${week}?season_type=regular&${POS}`),
    gameClock(L.season, week),
    get(`${S2}/stats/nfl/${L.season}/${week}?season_type=regular&${POS}`).catch(() => []) // live box-score stats, used to describe plays
  ]);
  SC = L.scoring_settings || {};
  const ST = {}; for (const x of stats || []) ST[x.player_id] = { s: x.stats || {}, t: x.updated_at || 0 };
  const rec = L.scoring_settings.rec, key = rec >= 1 ? "pts_ppr" : rec >= 0.5 ? "pts_half_ppr" : "pts_std";
  const P = {}; for (const p of proj) P[p.player_id] = p;
  const teams = {};
  for (const m of mus) {
    const items = [], pp = {}, who = {}, st = {};
    (m.starters || []).forEach(pid => {
      if (!pid || pid === "0") return;
      pp[pid] = (m.players_points || {})[pid] || 0; st[pid] = ST[pid] || { s: {}, t: 0 };
      const p = P[pid]; if (!p) return;
      const nfl = p.team, f = clock.frac[nfl] ?? 0;
      let mu = (p.stats && p.stats[key]) || 0;
      if (f === 1 && ["Out", "IR", "Sus", "PUP"].includes(p.player && p.player.injury_status)) mu = 0;
      const pl = p.player || {}, name = pl.position === "DEF" ? `${nfl} D/ST` : pl.last_name ? `${(pl.first_name || "")[0] ? pl.first_name[0] + ". " : ""}${pl.last_name}` : `${nfl} ${pl.position || "player"}`;
      who[pid] = { name, last: pl.last_name || "", fi: (pl.first_name || "")[0] || "", nfl, pos: pl.position || "" };
      if (f > 0 && mu > 0) items.push({ nfl, mu: mu * f, sd: 0.62 * mu * Math.sqrt(f), name, pos: pl.position || "", f, pid });
    });
    teams[m.roster_id] = { live: m.custom_points ?? m.points ?? 0, items, pp, who, st };
  }
  return { week, teams, pairs: pairsOf(mus), live: clock.live, plays: clock.plays, next: clock.next, events: clock.events };
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
    res[m.m] = { w, l, a, b };
  }
  const fin = br.find(m => m.p === 1) || br[br.length - 1];
  return { reach, champ: res[fin.m].w, res };
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
// Besides the odds, it records conditional counts ("if this team wins / if that game goes this way")
// that power the "What each team needs" cards.
function simulate(L, R, mode, weeks, br, liveWk, round) {
  const N = SIMS, ids = R.map(r => r.roster_id), P = L.settings.playoff_teams || 6;
  const wc = Math.min(C.pfWildcardSpots || 0, P), byes = 2 ** Math.ceil(Math.log2(P)) - P;
  const { base, avg, med } = standings(L, R);
  const O = {}; ids.forEach(i => O[i] = { make: 0, bye: 0, seeds: Array(P).fill(0), reach: {}, final: 0, champ: 0, wMin: 1e9, wMax: -1 });
  const wp = {}, fields = {}, cond = {}, takers = {};
  ids.forEach(i => { cond[i] = {}; takers[i] = {}; });
  const inc = (i, key, hit) => { const c = cond[i][key] ||= [0, 0]; c[0]++; if (hit) c[1]++; };
  const curWk = mode === "race" ? weeks.find(w => w.cur) : liveWk;
  const pairs = curWk ? curWk.pairs : [];
  const pairOf = {}; pairs.forEach((p, k) => { pairOf[p[0]] = k; pairOf[p[1]] = k; });
  let maxR = 0;
  for (let n = 0; n < N; n++) {
    let bracket = br, liveSc = null, curWin = null, curTop = null, field = null;
    if (mode === "race") {
      const W = {}, PF = {};
      ids.forEach(i => { W[i] = base[i].w; PF[i] = base[i].pf; });
      for (const wk of weeks) {
        const sc = {}; if (wk.future) ids.forEach(i => sc[i] = drawAvg(avg[i])); else Object.assign(sc, drawLive(wk));
        ids.forEach(i => PF[i] += sc[i] ?? 0);
        const wins = wk.pairs.map(([a, b]) => sc[a] >= sc[b] ? a : b);
        wins.forEach(w => W[w]++);
        let top = null;
        if (med) { top = new Set([...ids].sort((a, b) => sc[b] - sc[a]).slice(0, Math.floor(ids.length / 2))); top.forEach(i => W[i]++); }
        if (wk.cur) { curWin = wins; curTop = top; wk.pairs.forEach(([a, b], k) => wp[a + "-" + b] = (wp[a + "-" + b] || 0) + (wins[k] === a)); }
      }
      ids.forEach(i => { O[i].wMin = Math.min(O[i].wMin, W[i]); O[i].wMax = Math.max(O[i].wMax, W[i]); });
      field = seedField(ids, W, PF, P, wc);
      field.forEach((i, k) => { O[i].make++; O[i].seeds[k]++; if (k < byes) O[i].bye++; });
      const key = field.join(","); fields[key] = (fields[key] || 0) + 1;
      if (curWin) {
        const inField = new Set(field), last = wc ? field[P - 1] : null;
        for (const i of ids) {
          const made = inField.has(i), k = pairOf[i];
          if (k != null) inc(i, "A" + (curWin[k] === i ? 1 : 0), made);
          if (curTop) inc(i, "B" + (curTop.has(i) ? 1 : 0), made);
          if (k != null && curTop) inc(i, "A" + (curWin[k] === i ? 1 : 0) + "B" + (curTop.has(i) ? 1 : 0), made);
          curWin.forEach((w, j) => { if (j !== k) inc(i, "P" + j + (w === pairs[j][0] ? "a" : "b"), made); });
          if (!made && last != null) takers[i][last] = (takers[i][last] || 0) + 1;
        }
      }
      bracket = seedBracket(field);
      if (!bracket) continue;
    } else {
      liveSc = drawLive(liveWk);
      curWin = liveWk.pairs.map(([a, b]) => liveSc[a] >= liveSc[b] ? a : b);
      liveWk.pairs.forEach(([a, b], k) => wp[a + "-" + b] = (wp[a + "-" + b] || 0) + (curWin[k] === a));
    }
    const out = play(bracket, (a, b, m) => {
      if (liveSc && m.r === round && liveWk.teams[a] && liveWk.teams[b]) return liveSc[a] >= liveSc[b] ? a : b;
      let sa = 0, sb = 0; for (let k = roundWeeks(m.r); k > 0; k--) { sa += drawAvg(avg[a]); sb += drawAvg(avg[b]); }
      return sa >= sb ? a : b;
    });
    const fin = bracket.find(m => m.p === 1) || bracket[bracket.length - 1]; maxR = fin.r;
    for (const t in out.reach) { const o = O[t]; for (let r = 1; r <= out.reach[t]; r++) o.reach[r] = (o.reach[r] || 0) + 1; if (out.reach[t] === fin.r) o.final++; }
    if (out.champ != null) O[out.champ].champ++;
    if (mode !== "race" && curWin) for (const i of ids) {
      const won = out.champ === i, k = pairOf[i];
      if (k != null) inc(i, "A" + (curWin[k] === i ? 1 : 0), won);
      curWin.forEach((w, j) => { if (j !== k) inc(i, "P" + j + (w === pairs[j][0] ? "a" : "b"), won); });
    }
  }
  ids.forEach(i => { const o = O[i]; o.make /= N; o.bye /= N; o.final /= N; o.champ /= N; o.seeds = o.seeds.map(c => c / N); for (const r in o.reach) o.reach[r] /= N; });
  for (const k in wp) wp[k] /= N;
  const best = Object.entries(fields).sort((a, b) => b[1] - a[1])[0];
  return { O, wp, P, wc, byes, med, base, avg, maxR, cond, takers, pairs, pairOf, field: best ? best[0].split(",").map(Number) : null };
}

// ---------- "what each team needs" ----------
const cp = (c, key) => { const x = c[key]; return x && x[0] >= 40 ? x[1] / x[0] : null; };
function needsFor(i, res, mode, wk) {
  const { O, cond, takers, pairs, pairOf, wc, base } = res, c = cond[i], o = O[i];
  const p = mode === "race" ? o.make : o.champ, label = mode === "race" ? "playoffs" : "title";
  const k = pairOf[i], pair = k != null ? pairs[k] : null, opp = pair ? (pair[0] === i ? pair[1] : pair[0]) : null;
  const me = wk?.teams[i], them = opp != null ? wk?.teams[opp] : null;
  const myLeft = me ? left(me) : 0, oppLeft = them ? left(them) : 0, gameDone = pair && !me?.items.length && !them?.items.length;
  const pw = cp(c, "A1"), pl = cp(c, "A0"), pt = cp(c, "B1"), pb = cp(c, "B0");
  const lines = [], chips = [];
  let head;
  if (p >= 0.9995) head = mode === "race" ? "Clinched a playoff spot" : "Champion";
  else if (p <= 0.0005) head = "Eliminated";
  else if (pw != null && pl != null && pw >= 0.995 && pl < 0.98) head = mode === "race" ? "In with a win" : "Win and they're champs";
  else if (cp(c, "A1B1") >= 0.995 && pw < 0.995) head = "In with a win and a top-half score";
  else if (pt != null && pt >= 0.995 && pb < 0.98) head = "In with a top-half score";
  else if (pl != null && pl <= 0.005 && pw > 0.02) head = mode === "race" ? "Must win" : "Win or go home";
  else head = p >= 0.75 ? "In control" : p >= 0.4 ? "On the bubble" : "Needs help";
  if (mode !== "race" && !pair && res.br) {
    // a team with a bye this round: say who they'll face next
    const nx = res.br.find(m => m.r === res.round + 1 && (m.t1 === i || m.t2 === i)), f = nx && (nx.t1 === i ? nx.t2_from : nx.t1_from);
    const src = f && res.br.find(m => m.m === (f.w || f.l));
    head = "First-round bye";
    if (src && src.t1 && src.t2) lines.push(`Plays the ${f.w ? "winner" : "loser"} of <b>${nm(src.t1)}</b> vs <b>${nm(src.t2)}</b> next round.`);
  }
  if (pair && !gameDone && me && them) {
    const lead = me.live - them.live;
    if (!me.items.length && them.items.length) lines.push(`Done at <b>${f1(me.live)}</b>. Needs <b>${nm(opp)}</b> to finish under that (now ${f1(them.live)}, ${oppLeft} still to play, proj. ${f1(projOf(them))}).`);
    else if (me.items.length && !them.items.length) lines.push(`Needs <b>${f1(Math.max(0, them.live - me.live + 0.01))}+</b> more to beat <b>${nm(opp)}</b> (${f1(them.live)}, done). Projected to add ${f1(projOf(me) - me.live)}.`);
    else lines.push(`${lead >= 0 ? "Leads" : "Trails"} <b>${nm(opp)}</b> ${f1(me.live)}–${f1(them.live)}, ${myLeft} vs ${oppLeft} players left (proj. ${f1(projOf(me))}–${f1(projOf(them))}${me.items.some(x => x.fut) ? " over both weeks" : ""}).`);
  } else if (pair && gameDone && me && them) lines.push(`${me.live >= them.live ? "Beat" : "Lost to"} <b>${nm(opp)}</b> ${f1(me.live)}–${f1(them.live)}.`);
  if (pw != null && pl != null && Math.abs(pw - pl) >= 0.02) chips.push([mode === "race" ? "If they win" : "Title odds with a win", pw], [mode === "race" ? "If they lose" : "With a loss", pl]);
  if (pt != null && pb != null && Math.abs(pt - pb) >= 0.08) chips.push([`Top-half score`, pt], [`Bottom half`, pb]);
  let bestH = null;
  pairs.forEach((pr, j) => { if (j === k) return; const a = cp(c, "P" + j + "a"), b = cp(c, "P" + j + "b"); if (a == null || b == null) return;
    const d = a - b; if (!bestH || Math.abs(d) > Math.abs(bestH.d)) bestH = { j, d, a, b, pr }; });
  if (bestH && Math.abs(bestH.d) >= (mode === "race" ? 0.08 : 0.015)) {
    const [x, y] = bestH.d > 0 ? bestH.pr : [bestH.pr[1], bestH.pr[0]], hi = Math.max(bestH.a, bestH.b), lo = Math.min(bestH.a, bestH.b);
    const xt = wk?.teams[x], yt = wk?.teams[y], doneXY = xt && yt && !xt.items.length && !yt.items.length;
    if (!doneXY) lines.push(`Root for <b>${nm(x)}</b> over <b>${nm(y)}</b>: ${mode === "race" ? "playoff" : "title"} odds ${fpw(hi)} vs ${fpw(lo)}.`);
  }
  if (mode === "race" && wc && p > 0.0005 && p < 0.9995 && o.make > 0 && o.seeds[res.P - 1] / o.make >= 0.3) {
    const tk = Object.entries(takers[i]).sort((a, b) => b[1] - a[1])[0], misses = Object.values(takers[i]).reduce((s, v) => s + v, 0);
    if (tk && misses && tk[1] / misses >= 0.5 && +tk[0] !== i) {
      const t = +tk[0], myPF = base[i].pf + (me?.live || 0), tPF = base[t].pf + (wk?.teams[t]?.live || 0), gap = tPF - myPF;
      const myRest = me ? projOf(me) - me.live : 0, tRest = wk?.teams[t] ? projOf(wk.teams[t]) - wk.teams[t].live : 0;
      lines.push(gap > 0 ? `Wildcard race vs <b>${nm(t)}</b>: down ${f1(gap)} PF, so needs to outscore them by ${f1(gap)}+ the rest of the way (proj. +${f1(myRest)} vs +${f1(tRest)}).`
        : `Wildcard race vs <b>${nm(t)}</b>: up ${f1(-gap)} PF (proj. +${f1(myRest)} vs +${f1(tRest)} still to come).`);
    }
  }
  if (me && left(me)) lines.push(`Still playing: ${me.items.filter(x => !x.fut).sort((a, b) => b.mu - a.mu).slice(0, 3).map(x => `${esc(x.name)} (${f1(x.mu)})`).join(", ")}${left(me) > 3 ? ` +${left(me) - 3} more` : ""}.`);
  return { p, head, lines, chips, label };
}

function renderNeeds(res, mode, ids, wk) {
  if (mode === "none") { $("needs").hidden = true; return; }
  const list = ids.filter(i => { const p = mode === "race" ? res.O[i].make : res.O[i].champ; return p > 0.0005 && p < (mode === "race" ? 0.995 : 0.9995); })
    .sort((a, b) => (mode === "race" ? res.O[b].make - res.O[a].make : res.O[b].champ - res.O[a].champ));
  if (!list.length || (mode !== "race" && !wk?.pairs.length)) { $("needs").hidden = true; return; }
  $("needs").hidden = false;
  $("nTitle").textContent = mode === "race" ? "What each team needs" : "Paths to the title";
  $("nCap").textContent = mode === "race" ? `${list.length} teams still in the hunt` : "Live, from every simulated finish";
  $("needGrid").innerHTML = list.map(i => {
    const n = needsFor(i, res, mode, wk);
    const [hiT, midT] = mode === "race" ? [0.75, 0.4] : [0.3, 0.12];
    const tone = n.p >= hiT ? "var(--fav)" : n.p >= midT ? "var(--y)" : "var(--dog)";
    return `<article class="card need" style="--tone:${tone};--team:${color(i)}"><div class="nh">${mono(i, "lg")}<div class="nt"><div class="n">${nm(i)}</div><div class="hd">${esc(n.head)}</div></div>
      <div class="np"><span ${anim("n" + i, n.p, "pw")}>${fpw(n.p)}</span><small>${n.label}</small></div></div>
      ${n.chips.length ? `<div class="chips">${n.chips.map(([t, v], j) => `<span class="chip"><small>${t}</small><b ${anim("c" + i + "_" + j, v, "pw")}>${fpw(v)}</b></span>`).join("")}</div>` : ""}
      <ul>${n.lines.map(l => `<li>${l}</li>`).join("")}</ul></article>`;
  }).join("");
}

// ---------- render ----------
function renderTicker(wk, wp, labels) {
  if (!wk || !wk.pairs.length) { $("tickerBar").hidden = true; return; }
  $("tickerBar").hidden = false;
  $("ticker").innerHTML = wk.pairs.map(([a, b], k) => {
    const ta = wk.teams[a], tb = wk.teams[b], done = !ta.items.length && !tb.items.length, p = wp[a + "-" + b] ?? 0.5;
    const cls = (x, y) => done ? (x.live >= y.live ? "w" : "l") : "";
    return `<div class="tk"><div class="h">${done ? "FINAL" : Math.round(Math.max(p, 1 - p) * 100) + "% " + esc(code(p >= .5 ? a : b))}</div>
      <span class="${cls(ta, tb)}">${esc(code(a))}</span><span class="s ${cls(ta, tb)}" ${anim("tk" + a, ta.live, "pts")}>${f1(ta.live)}</span><span class="${cls(tb, ta)}">${esc(code(b))}</span><span class="s ${cls(tb, ta)}" ${anim("tk" + b, tb.live, "pts")}>${f1(tb.live)}</span></div>`;
  }).join("");
}

function renderTitleBar(res, ids) {
  const list = ids.filter(i => res.O[i].champ > 0.0005).sort((a, b) => res.O[b].champ - res.O[a].champ);
  $("tbWrap").hidden = !list.length; if (!list.length) return;
  $("tbBar").innerHTML = list.map(i => { const p = res.O[i].champ;
    return `<div class="seg2" style="flex:${p} 1 0;background:${color(i)}" title="${nm(i)}: ${fp(p)}">${p >= 0.09 ? `${mono(i, "sm")}<b>${fp(p)}</b>` : p >= 0.03 ? mono(i, "sm") : ""}</div>`; }).join("");
}

function detailRow(i, res, mode, wk, span) {
  const o = res.O[i], t = wk?.teams[i], rounds = res.maxR || 3;
  const later = Array.from({ length: rounds - 1 }, (_, r) => [r + 2 === rounds ? "Make final" : "Reach round " + (r + 2), o.reach[r + 2] || 0]);
  const steps = mode === "race" ? [["Make playoffs", o.make], ...(res.byes ? [["First-round bye", o.bye]] : []), ...later, ["Win title", o.champ]] : [...later, ["Win title", o.champ]];
  const seeds = mode === "race" && o.make > 0.0005 ? `<div class="dsec"><div class="dh">Seed chances</div><div class="seeds">${o.seeds.map((p, s) => `<div><span style="height:${Math.max(2, p * 46)}px"></span><b>${s + 1}</b><small>${p >= .005 ? Math.round(p * 100) + "%" : ""}</small></div>`).join("")}</div></div>` : "";
  // every starter with their points so far; players still to play also show what they're projected to add
  const rows = t ? Object.keys(t.pp).map(pid => {
    const w = t.who[pid] || { name: "Starter", pos: "", nfl: "" }, it = t.items.find(x => x.pid === pid), pts = t.pp[pid] || 0;
    const st = !it ? (pts ? "done" : "no game / out") : it.f >= 1 ? `yet to play · proj. ${f1(it.mu)}` : `playing · +${f1(it.mu)} proj.`;
    return `<li><span>${esc(w.name)} <small>${w.pos && w.pos !== "DEF" ? esc(w.pos) + " · " + esc(w.nfl) + " · " : ""}${st}</small></span><b>${f1(pts)}</b></li>`;
  }).join("") + t.items.filter(x => x.fut).map(x => `<li><span>${esc(x.name)} <small>not played yet</small></span><b>+${f1(x.mu)}</b></li>`).join("") : "";
  const players = t ? `<div class="dsec"><div class="dh">${t.items.some(x => x.fut) ? "This game" : "This week"} · ${f1(t.live)} pts${t.items.length ? `, proj. ${f1(projOf(t))}` : ", done"}</div><ul class="pl">${rows}</ul></div>` : "";
  return `<tr class="detail" data-for="${i}"${openRows.has(i) ? "" : " hidden"}><td colspan="${span}"><div class="dwrap">
    <div class="dsec"><div class="dh">Path to the title</div><div class="path">${steps.map(([l, p]) => `<div><small>${l}</small><div class="track"><i style="width:${p * 100}%"></i></div><b>${fpw(p)}</b></div>`).join("")}</div></div>
    ${seeds}${players}</div></td></tr>`;
}

function renderTable(res, mode, alive, wk) {
  const { O, base } = res, raceAlive = mode === "race" && alive.length;
  const metric = i => raceAlive ? O[i].make : O[i].champ;
  let ids = Object.keys(O).map(Number);
  if (mode !== "race") ids = ids.filter(i => O[i].reach[1] || O[i].final || O[i].champ);
  ids.sort((a, b) => (raceAlive ? O[b].make - O[a].make : 0) || O[b].champ - O[a].champ || O[b].final - O[a].final || O[b].make - O[a].make);
  const first = hist[0] && hist[0].m;
  const cols = mode === "race" ? ["Make playoffs", "First-round bye", "Make final", "Win title", "Title odds"] : ["Make final", "Win title", "Title odds"];
  const hideIdx = mode !== "race" ? [] : raceAlive ? [1, 2] : [0, 1];
  $("fHead").innerHTML = `<tr><th></th><th>Team</th>${cols.map((c, k) => `<th class="${hideIdx.includes(k) ? "hide-s" : ""}${k === cols.length - 1 ? " oc" : ""}">${c}</th>`).join("")}</tr>`;
  const cutAt = raceAlive ? res.P : -1, span = cols.length + 2;
  $("fBody").innerHTML = ids.map((i, k) => {
    const o = O[i], b = base[i];
    const recTxt = o.wMin === o.wMax && mode === "race" ? `${o.wMin}-${b.w + b.l + res.gpw - o.wMin}` : `${b.w}-${b.l}`;
    // skip the arrow for a team that wasn't in the playoff picture when the history started (e.g. added to the bracket later)
    const d = first && first[i] != null && !(mode !== "race" && first[i] <= 0.0005) ? Math.round((metric(i) - first[i]) * 100) : 0;
    const seed = mode === "race" ? o.seeds.indexOf(Math.max(...o.seeds)) + 1 : 0;
    const sub = `${recTxt}${b.t ? "-" + b.t : ""} · ${f1(b.pf + (res.wkLive?.[i] ?? 0))} PF${mode === "race" && o.make >= 0.5 ? ` · ${o.make >= 0.9995 ? "" : "proj. "}${ord(seed)} seed` : ""}`;
    const cells = mode === "race" ? [o.make, o.bye, o.final, o.champ] : [o.final, o.champ];
    const keys = mode === "race" ? ["mk", "by", "fn", "ch"] : ["fn", "ch"];
    const out = mode === "race" ? o.make <= 0.0005 : o.champ <= 0.0005 && o.final <= 0.0005;
    return `<tr class="row${out ? " out" : ""}${k === cutAt ? " cut" : ""}${openRows.has(i) ? " open" : ""}" data-id="${i}" tabindex="0" aria-expanded="${openRows.has(i)}"><td class="rk">${k + 1}</td>
      <td class="tm"><div class="team">${mono(i)}<div style="min-width:0"><div class="n">${nm(i)}${d ? `<span class="dl ${d > 0 ? "up" : "dn"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>` : ""}</div><div class="r">${sub}</div></div><span class="chev" aria-hidden="true">▾</span></div></td>
      ${cells.map((p, c) => `<td class="${hideIdx.includes(c) ? "hide-s" : ""}">${heat(p, keys[c] + i)}</td>`).join("")}
      <td class="oc"><span class="odds${o.champ >= 0.5 ? " fav" : ""}">${amer(o.champ)}</span></td></tr>${detailRow(i, res, mode, wk, span)}`;
  }).join("");
  $("fTitle").textContent = raceAlive ? "Playoff odds" : "Championship odds";
  $("fCap").textContent = `Tap a team for details · ${SIMS.toLocaleString()} simulations${first ? " · ▲▼ since " + tFmt(hist[0].t) : ""}`;
}
$("fBody").addEventListener("click", e => toggleRow(e.target.closest("tr.row")));
$("fBody").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const r = e.target.closest("tr.row"); if (r) { e.preventDefault(); toggleRow(r); } } });
function toggleRow(r) {
  if (!r) return; const id = +r.dataset.id, d = r.nextElementSibling, open = !openRows.has(id);
  open ? openRows.add(id) : openRows.delete(id); r.classList.toggle("open", open); r.setAttribute("aria-expanded", open); if (d) d.hidden = !open;
}

function renderBracket(res, br, mode, liveWk, round, seedOf, decided) {
  if (!br) { $("bracket").hidden = true; return; }
  $("bracket").hidden = false;
  const { O } = res, rounds = Math.max(...br.map(m => m.r));
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
        return `<div class="slot ${cls}"><span class="sd">${seedOf[t] || ""}</span>${mono(t, "sm")}<span class="n">${nm(t)}</span><span class="p">${pTxt}</span></div>`;
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

document.head.insertAdjacentHTML("beforeend", "<style>.imp{flex-direction:column;gap:8px}.imp .dot{display:none}.imp .ir{display:flex;gap:9px;align-items:flex-start}.imp .ir .mono{flex:none;margin-top:2px}.imp .ir.new{animation:fu 1.8s ease-out}</style>");
// one "Last play" line per team, so a big play for one side can't be buried by the other side's next play
function impactBox(a, b) {
  const pts = d => `${d >= 0 ? "+" : "−"}${f1(Math.abs(d))} pts`;
  const row = id => {
    const m = IMP[a + "-" + b + ":" + id]; if (!m || !T[id] || !("play" in m)) return "";
    const mins = Math.round((Date.now() - m.t) / 60000), ago = mins < 1 ? "just now" : mins < 60 ? mins + "m ago" : Math.round(mins / 60) + "h ago";
    const what = m.play ? `${esc(m.name)}: ${esc(m.play)}` : esc(m.name) + " " + pts(m.delta || 0); // player name always leads
    let sub = m.delta != null ? `${pts(m.delta)} for ${esc(code(id))}` : `For ${esc(code(id))}`;
    if (m.before != null) { const d = Math.round((m.after - m.before) * 100);
      sub += ` · win odds <b>${Math.round(m.before * 100)}% → ${Math.round(m.after * 100)}%</b>${d ? ` <span class="${d > 0 ? "up" : "dn"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>` : ""}`; }
    return `<div class="ir${mins < 1 ? " new" : ""}">${mono(id, "xs")}<div><span class="mt">Last play · </span>${m.td ? '<span class="tdtag">TD</span>' : ""}<b>${what}</b> <span class="mt">· ${ago}</span><br><span class="mt">${sub}</span></div></div>`;
  };
  const rows = row(a) + row(b);
  return rows ? `<div class="imp">${rows}</div>` : "";
}

function renderGames(wk, res, title, labels) {
  if (!wk || !wk.pairs.length) { $("matchups").hidden = true; return; }
  $("matchups").hidden = false; $("mTitle").textContent = title;
  const kick = wk.next ? new Date(wk.next) : null;
  $("mCap").textContent = wk.live?.length ? "Live win probability · projected line" : kick ? `Next kickoff ${kick.toLocaleDateString([], { weekday: "short" })} ${tFmt(kick)} · win probability from projections` : "Win probability · projected line";
  const order = wk.pairs.map((p, k) => ({ p, k, done: !wk.teams[p[0]].items.length && !wk.teams[p[1]].items.length })).sort((a, b) => a.done - b.done);
  $("games").innerHTML = order.map(({ p: [a, b], k, done }) => {
    const ta = wk.teams[a], tb = wk.teams[b];
    if (done) return `<div class="card mu fin"><div class="top2"><span>${labels ? labels[k] : "Matchup " + (k + 1)}</span><span>Final</span></div>
      ${[[a, ta, tb], [b, tb, ta]].map(([id, t, u]) => `<div class="fr${t.live >= u.live ? " w" : ""}">${mono(id, "sm")}<span class="n">${nm(id)}</span><b>${f1(t.live)}</b></div>`).join("")}</div>`;
    const p = res.wp[a + "-" + b] ?? .5;
    const pa = projOf(ta), pb = projOf(tb), favA = pa >= pb, sp = half(Math.abs(pa - pb));
    const side = (id, t, pj, cls) => `<div class="side ${cls}"><span class="n">${nm(id)}</span><span class="sc" ${anim("gs" + id, t.live, "pts")}>${f1(t.live)}</span><span class="pj">${t.items.length ? `proj ${f1(pj)}${left(t) ? ` · ${left(t)} left` : ""}` : "done"}</span></div>`;
    return `<div class="card mu"><div class="top2"><span>${labels ? labels[k] : "Matchup " + (k + 1)}</span><span class="lv">Win probability</span></div>
      ${needle(p, color(a), color(b))}
      <div class="vs">${side(a, ta, pa, "a")}<div class="mid"><span ${anim("gp" + a + "-" + b, Math.max(p, 1 - p))}>${fp(Math.max(p, 1 - p))}</span><br><span style='font-weight:600;font-size:11px'>${esc(code(p >= .5 ? a : b))}</span></div>${side(b, tb, pb, "b")}</div>
      <div class="line"><span>Spread <b>${esc(code(favA ? a : b))} −${sp}</b></span><span>O/U <b>${half(pa + pb)}</b></span><span>ML <b>${esc(code(a))} ${amer(p)}</b> / <b>${esc(code(b))} ${amer(1 - p)}</b></span></div>${impactBox(a, b)}</div>`;
  }).join("");
}

function renderTrend(ids, heading) {
  const pts = hist.filter(h => h.m);
  $("tTitle").textContent = heading;
  if (!ids.length || !pts.length) { $("trend").hidden = true; return; }
  $("trend").hidden = false;
  const last = pts[pts.length - 1].m;
  // only teams that have mattered, biggest first, at most 7 lines
  const sel = ids.filter(i => pts.some(h => (h.m[i] || 0) >= 0.02)).sort((a, b) => (last[b] || 0) - (last[a] || 0)).slice(0, 7);
  if (!sel.length) { $("trend").hidden = true; return; }
  $("tCap").textContent = pts.length > 1 ? `Since ${tFmt(pts[0].t)} · hover or tap the chart for exact odds` : "Lines fill in as odds change while the page is open";
  if (!$("trendSvg") || !$("tip")) $("figWrap").innerHTML = `<svg id="trendSvg" role="img" aria-label="Odds over time"></svg><div class="tip" id="tip" hidden></div>`;
  const svg = $("trendSvg"), tip = $("tip");
  const draw = () => {
    const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
    const narrow = W < 560, lab = id => narrow ? code(id) : T[id].name.length > 18 ? T[id].name.slice(0, 17) + "…" : T[id].name;
    const l = 40, r = narrow ? 118 : 190, t = 14, b = 30, iw = W - l - r, ih = H - t - b;
    const vmax = Math.max(...pts.flatMap(h => sel.map(i => h.m[i] || 0)));
    const yMax = Math.min(1, Math.max(0.2, Math.ceil((vmax + 0.04) * 10) / 10)), step = yMax > 0.5 ? 0.25 : 0.1;
    const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 60000);
    const x = v => l + (pts.length > 1 ? (v - t0) / (t1 - t0) : 1) * iw, y = p => t + (1 - Math.min(p, yMax) / yMax) * ih;
    let g = "";
    for (let v = 0; v <= yMax + 1e-9; v += step) g += `<line x1="${l}" x2="${l + iw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"${v ? ' stroke-dasharray="2 4"' : ""}/><text x="${l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${Math.round(v * 100)}%</text>`;
    if (pts.length > 1) {
      const span = (t1 - t0) / 60000, mins = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480].find(m => span / m <= (narrow ? 3 : 6)) || 720;
      for (let tt = Math.ceil(t0 / (mins * 60000)) * mins * 60000; tt <= t1; tt += mins * 60000)
        g += `<line x1="${x(tt)}" x2="${x(tt)}" y1="${t + ih}" y2="${t + ih + 4}" stroke="var(--mute)"/><text x="${x(tt)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--mute)">${tFmt(tt)}</text>`;
    }
    sel.slice().reverse().forEach(id => {
      const d = pts.filter(h => h.m[id] != null).map(h => `${x(h.t).toFixed(1)},${y(h.m[id]).toFixed(1)}`);
      if (d.length === 1) g += `<line x1="${l}" x2="${l + iw}" y1="${y(last[id] || 0)}" y2="${y(last[id] || 0)}" stroke="${color(id)}" stroke-width="2" stroke-dasharray="4 5" opacity=".45"/>`;
      if (d.length > 1) g += `<polyline points="${d.join(" ")}" fill="none" stroke="${color(id)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      const [lx, ly] = d[d.length - 1].split(","); g += `<circle cx="${lx}" cy="${ly}" r="4.5" fill="${color(id)}" stroke="var(--panel)" stroke-width="2"/>`;
    });
    // end-of-line labels, nudged apart so they never overlap
    const L = sel.map(id => ({ id, y: y(last[id] || 0) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < L.length; k++) if (L[k].y - L[k - 1].y < 17) L[k].y = L[k - 1].y + 17;
    const over = L.length ? L[L.length - 1].y - (t + ih + 4) : 0; if (over > 0) L.forEach(o => o.y -= over);
    for (let k = 0; k < L.length; k++) if (L[k].y < t + 4) L[k].y = t + 4 + k * 17;
    L.forEach(o => { g += `<text x="${l + iw + 10}" y="${o.y + 4}" font-size="12" font-weight="700" fill="${color(o.id)}">${esc(lab(o.id))} <tspan fill="var(--ink)">${fp(last[o.id] || 0)}</tspan></text>`; });
    g += `<line id="cross" x1="0" x2="0" y1="${t}" y2="${t + ih}" stroke="var(--ink)" stroke-width="1" opacity="0"/><rect id="hit" x="${l}" y="${t}" width="${iw}" height="${ih}" fill="transparent"/>`;
    svg.innerHTML = g;
    const move = e => {
      if (pts.length < 2) return;
      const rc = svg.getBoundingClientRect(), mx = (e.touches ? e.touches[0].clientX : e.clientX) - rc.left;
      let k = 0, best = 1e9; pts.forEach((h, j) => { const dx = Math.abs(x(h.t) - mx); if (dx < best) { best = dx; k = j; } });
      const h = pts[k], cx = x(h.t), cr = svg.querySelector("#cross"); cr.setAttribute("x1", cx); cr.setAttribute("x2", cx); cr.setAttribute("opacity", ".35");
      tip.hidden = false;
      tip.innerHTML = `<b>${tFmt(h.t, true)}</b>${sel.slice().sort((a, b) => (h.m[b] || 0) - (h.m[a] || 0)).map(id => `<div><i style="background:${color(id)}"></i>${nm(id)}<span>${fp(h.m[id] || 0)}</span></div>`).join("")}`;
      const tw = tip.offsetWidth; let lft = cx + 12; if (lft + tw > W - 4) lft = cx - 12 - tw; tip.style.left = Math.max(4, lft) + "px"; tip.style.top = t + "px";
    };
    const hide = () => { tip.hidden = true; const cr = svg.querySelector("#cross"); cr && cr.setAttribute("opacity", "0"); };
    const hit = svg.querySelector("#hit");
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", hide);
  };
  draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw && svg._draw()); svg._ro.observe(svg); } svg._draw = draw;
  $("legend").innerHTML = "";
}

// "Last play": every refresh, compare each starter's live box-score stats with what we saw before.
// Any change that moves their fantasy score (using this league's scoring) becomes the matchup's
// last play, described from the stat change, e.g. "30-yard reception" or "42-yard field goal".
function playText(pos, a, b) {
  const d = k => (b[k] || 0) - (a[k] || 0), n = k => Math.round(d(k));
  const yds = (v, what) => v > 0 ? `${v}-yard ${what}` : v < 0 ? `${what} for a ${-v}-yard loss` : `no-gain ${what}`;
  if (pos === "DEF") {
    const t = [];
    if (d("def_td") > 0 || d("def_st_td") > 0) t.push("defensive touchdown");
    if (d("int") > 0) t.push("interception"); if (d("fum_rec") > 0) t.push("fumble recovery");
    if (d("sack") > 0) t.push(d("sack") > 1 ? `${n("sack")} sacks` : "sack"); if (d("safe") > 0) t.push("safety");
    if (d("blk_kick") > 0) t.push("blocked kick"); if (d("pts_allow") > 0) t.push(`gave up ${n("pts_allow")} points`);
    return t.join(", ");
  }
  if (pos === "K") {
    const t = [];
    if (d("fgm") > 0) t.push(d("fgm") === 1 && d("fgm_yds") > 0 ? `${n("fgm_yds")}-yard field goal` : d("fgm") > 1 ? `${n("fgm")} field goals` : "field goal");
    if (d("fgmiss") > 0) t.push("missed field goal"); if (d("xpm") > 0) t.push(d("xpm") > 1 ? `${n("xpm")} extra points` : "extra point"); if (d("xpmiss") > 0) t.push("missed extra point");
    return t.join(", ");
  }
  const t = [];
  if (d("pass_cmp") > 0 || d("pass_td") > 0) t.push(d("pass_td") > 0 ? (d("pass_cmp") > 1 ? "touchdown pass" : `${n("pass_yd")}-yard touchdown pass`) : d("pass_cmp") > 1 ? `${n("pass_cmp")} completions for ${n("pass_yd")} yards` : yds(n("pass_yd"), "completion"));
  if (d("pass_int") > 0) t.push("interception thrown");
  if (d("rec") > 0 || d("rec_td") > 0) t.push(d("rec_td") > 0 ? (d("rec") > 1 ? "touchdown catch" : `${n("rec_yd")}-yard touchdown catch`) : d("rec") > 1 ? `${n("rec")} catches for ${n("rec_yd")} yards` : yds(n("rec_yd"), "reception"));
  if (d("rush_att") > 0 || d("rush_td") > 0) t.push(d("rush_td") > 0 ? (d("rush_att") > 1 ? "touchdown run" : `${n("rush_yd")}-yard touchdown run`) : d("rush_att") > 1 ? `${n("rush_att")} carries for ${n("rush_yd")} yards` : yds(n("rush_yd"), "run"));
  if (d("pass_2pt") + d("rush_2pt") + d("rec_2pt") > 0) t.push("2-point conversion");
  if (d("fum_lost") > 0) t.push("fumble lost");
  return t.join(", ");
}
// First load: any matchup without a saved last play gets one from ESPN's play-by-play, so every card
// has its most recent scoring play even for a first-time visitor. After that, live stats take over.
let seeded = false;
const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function espnPlay(p, who, teamOf) {
  const txt = p.text || "", type = p.type?.text || "", y = Math.round(p.statYardage || 0);
  if (/no play/i.test(txt) || /penalty|timeout|end of|kickoff|punt/i.test(type)) return "";
  const td = /touchdown/i.test(type) || /TOUCHDOWN/.test(txt);
  if (who.pos === "DEF") {
    const off = teamOf(p.start?.team?.id);
    if (!off || off === who.nfl) return "";
    if (td && /interception|fumble|return/i.test(type)) return "defensive touchdown";
    if (p.scoringPlay && p.scoreValue) return `gave up ${p.scoreValue} points`;
    if (/sack/i.test(type)) return "sack";
    if (/interception/i.test(type)) return "interception";
    if (p.isTurnover && /fumble/i.test(type + txt)) return "fumble recovery";
    return "";
  }
  if (!who.last || !who.fi) return "";
  const re = new RegExp("\\b" + escRe(who.fi) + "\\.\\s?" + escRe(who.last) + "\\b", "i");
  if (!re.test(txt)) return "";
  if (who.pos === "K") {
    if (/field goal/i.test(type) && /good/i.test(type + txt)) return `${y}-yard field goal`;
    if (new RegExp(escRe(who.last) + "[^.]*extra point is GOOD", "i").test(txt)) return "extra point";
    return "";
  }
  const yd = w => y > 0 ? `${y}-yard ${w}` : y < 0 ? `${w} for a ${-y}-yard loss` : "";
  const passer = new RegExp(escRe(who.fi) + "\\.\\s?" + escRe(who.last) + "\\s+pass", "i").test(txt);
  if (/pass/i.test(type) && /incomplet|intercept/i.test(type)) return passer && /intercept/i.test(type) ? "interception thrown" : "";
  if (/reception|passing touchdown|pass/i.test(type) || / pass /.test(txt)) {
    if (passer) return td ? `${y}-yard touchdown pass` : yd("completion");
    return td ? `${y}-yard touchdown catch` : yd("reception");
  }
  if (/rush/i.test(type) || /\b(left|right|up the middle)\b/.test(txt)) return td ? `${y}-yard touchdown run` : yd("run");
  if (/fumble/i.test(type + txt) && p.isTurnover) return "fumble lost";
  return "";
}
// ESPN play-by-play for the given NFL teams' games, newest first
async function pbp(wk, teams) {
  const evs = (wk.events || []).filter(e => e.teams.some(t => teams.has(t)));
  const sums = await Promise.all(evs.map(e => get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`).catch(() => null)));
  const plays = [];
  sums.forEach(sm => {
    if (!sm) return;
    const ids = {}; for (const c of sm.header?.competitions?.[0]?.competitors || []) ids[c.team?.id ?? c.id] = ESPN2SLP[c.team?.abbreviation] || c.team?.abbreviation;
    const teamOf = id => ids[id], gt = new Set(Object.values(ids));
    const dr = [...(sm.drives?.previous || []), ...(sm.drives?.current ? [sm.drives.current] : [])];
    for (const d of dr) for (const p of d.plays || []) plays.push({ p, teamOf, gt, t: Date.parse(p.wallclock) || 0 });
  });
  return plays.sort((x, y) => y.t - x.t || (+y.p.sequenceNumber || 0) - (+x.p.sequenceNumber || 0));
}
// Live stats tell us WHO scored and how many points; the play-by-play tells us exactly WHAT happened.
// (Stats can update a few plays at once, so describing from them alone can merge plays, e.g. a "118-yard touchdown pass".)
async function describePlays(wk, fresh) {
  if (!fresh.length) return;
  const plays = await pbp(wk, new Set(fresh.map(f => f.w.nfl)));
  for (const f of fresh) {
    // only a play newer than the previous stat snapshot, and it must agree on whether it was a touchdown
    const m = IMP[f.key]; if (!m) continue;
    const hit = plays.find(x => x.gt.has(f.w.nfl) && x.t > f.since && espnPlay(x.p, f.w, x.teamOf));
    const text = hit && espnPlay(hit.p, f.w, hit.teamOf);
    if (!text || /touchdown/.test(text) !== m.td) continue;
    m.play = text;
  }
  saveImp();
}
async function seedPlays(wk) {
  // every team: a saved play can be stale (page was closed while games went on) or worded from merged stats,
  // so ESPN's latest play wins unless the saved one is clearly newer (more than 5 minutes)
  const need = wk.pairs.flatMap(([a, b]) => [a, b].map(id => ({ key: a + "-" + b + ":" + id, id })));
  if (!need.length) return;
  const teams = new Set(); need.forEach(n => Object.values(wk.teams[n.id].who).forEach(w => teams.add(w.nfl)));
  const plays = await pbp(wk, teams);
  for (const { key, id } of need) {
    outer: for (const { p, teamOf, gt, t } of plays) {
      for (const pid in wk.teams[id].who) {
        const w = wk.teams[id].who[pid]; if (!gt.has(w.nfl)) continue;
        const text = espnPlay(p, w, teamOf);
        if (text) { const old = IMP[key]; if (!old || !("play" in old) || (t && t > old.t - 300000)) IMP[key] = { t: t || Date.now(), rid: id, name: w.name, delta: null, play: text, td: /touchdown/.test(text) }; break outer; }
      }
    }
  }
  saveImp();
}
const statPts = (a, b) => { let p = 0; for (const k in SC) { const v = (b[k] || 0) - (a[k] || 0); if (v) p += v * SC[k]; } return Math.round(p * 100) / 100; };
function trackPlays(wk, wp) {
  const fresh = []; if (!wk) return fresh;
  const first = !prevPP; if (first) prevPP = {};
  for (const [a, b] of wk.pairs) {
    const key = a + "-" + b, pNow = wp[key] ?? 0.5, side = (id, p) => id === a ? p : 1 - p;
    if (!first) {
      const best = {}; // most recent scoring play for each team
      for (const id of [a, b]) for (const pid in wk.teams[id].st) {
        const now = wk.teams[id].st[pid], was = prevPP[id]?.[pid];
        if (!was) { (prevPP[id] ||= {})[pid] = now; continue; } // first sighting (a player's first play of the game still counts below)
        const pts = statPts(was.s, now.s);
        if (Math.abs(pts) < 0.05) continue;
        const c = { id, pid, pts, text: playText(wk.teams[id].who[pid]?.pos, was.s, now.s), t: now.t, since: was.t || 0 };
        prevPP[id][pid] = now; // every scoring change counts once; the most recent one is shown
        if (!c.text) continue; // a stat correction with no actual play (e.g. +0.1) doesn't replace the last play
        const o = best[id]; if (!o || c.t > o.t || (c.t === o.t && Math.abs(c.pts) > Math.abs(o.pts))) best[id] = c;
      }
      for (const id in best) {
        const c = best[id], who = wk.teams[c.id].who[c.pid] || { name: "A starter" };
        IMP[key + ":" + c.id] = { t: Math.min(Date.now(), c.t || Date.now()), rid: c.id, name: who.name, delta: c.pts, play: c.text,
          td: /touchdown/.test(c.text), before: prevWP[key] != null ? side(c.id, prevWP[key]) : null, after: side(c.id, pNow) };
        if (who.nfl) fresh.push({ key: key + ":" + c.id, w: who, since: c.since || c.t - 600000 });
      }
      if (Object.keys(best).length) prevWP[key] = pNow;
    } else {
      for (const id of [a, b]) prevPP[id] = { ...wk.teams[id].st };
      prevWP[key] = pNow;
    }
  }
  saveImp();
  return fresh;
}

// ---------- hall of champions ----------
// Past champions come from Sleeper (this league's previous seasons) plus any older ones in config.js.
let CHAMPS = null, champsBusy = false;
const avatarOf = u => { const md = u.metadata || {}; return /^https?:\/\//.test(md.avatar || "") ? md.avatar : u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null; };
async function loadChamps(L) {
  if (CHAMPS || champsBusy) return; champsBusy = true;
  const key = `jfflchamps:${C.leagueId}`; let list = null;
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 864e5) list = c.list; } catch {}
  if (!list) {
    list = [];
    let id = L.status === "complete" ? L.league_id : L.previous_league_id;
    for (let k = 0; k < 15 && id && id !== "0"; k++) {
      try {
        const lg = await get(`${S}/league/${id}`);
        if (lg.status === "complete") {
          const f = (await get(`${S}/league/${id}/winners_bracket`) || []).find(m => m.p === 1);
          if (f && f.w) {
            const [R, U] = await Promise.all([get(`${S}/league/${id}/rosters`), get(`${S}/league/${id}/users`)]);
            const r = R.find(x => x.roster_id === f.w), u = U.find(x => x.user_id === r?.owner_id) || {};
            list.push({ season: lg.season, team: String((u.metadata || {}).team_name || u.display_name || "Champion").trim(), user: u.display_name || "", img: avatarOf(u) });
          }
        }
        id = lg.previous_league_id;
      } catch { break; }
    }
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), list })); } catch {}
  }
  const extra = (C.pastChampions || []).filter(e => !list.some(x => String(x.season) === String(e.season)));
  CHAMPS = [...list, ...extra].sort((a, b) => a.season - b.season);
  champsBusy = false; renderChamps(L);
}
const SIL = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="silg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a424c"/><stop offset="1" stop-color="#14181d"/></linearGradient></defs><circle cx="50" cy="38" r="17" fill="url(#silg)"/><path d="M18 92c2-20 15-31 32-31s30 11 32 31z" fill="url(#silg)"/></svg>`;
function renderChamps(L) {
  if (!CHAMPS || !CHAMPS.length) { $("champs").hidden = true; return; }
  $("champs").hidden = false;
  const av = (c, cls) => `<div class="av ${cls || ""}" style="background:${PAL[(+c.season) % PAL.length]}">${esc(initials(c.team))}${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>`;
  const past = CHAMPS.slice(0, -1), reign = CHAMPS[CHAMPS.length - 1], open = L.status !== "complete";
  $("hofRow").innerHTML = past.map(c => `<div class="hof past">${av(c)}<span class="yr">${esc(c.season)}</span><b title="${esc(c.team)}">${esc(c.team)}</b><small>${esc(c.user)}</small></div>`).join("")
    + `<div class="hof reign" id="hofReign"><span class="crown" aria-hidden="true">\u{1F451}</span>${av(reign, "lg")}<span class="yr">${esc(reign.season)}</span><span class="tag">Reigning champ</span><b title="${esc(reign.team)}">${esc(reign.team)}</b><small>${esc(reign.user)}</small></div>`
    + (open ? `<div class="hof lock"><div class="av lg sil">${SIL}<span>?</span></div><span class="yr">${esc(L.season)}</span><span class="tag">Up for grabs</span><b>???</b></div>` : "");
  $("hCap").textContent = `${CHAMPS.length} champion${CHAMPS.length === 1 ? "" : "s"} since ${CHAMPS[0].season}`;
  const row = $("hofRow"), r = $("hofReign"); if (row.scrollWidth > row.clientWidth) row.scrollLeft = r.offsetLeft - (row.clientWidth - r.offsetWidth) / 2;
}

// ---------- main ----------
// Refresh fast while NFL games are live, slowly otherwise, and not at all while the page is hidden
// (phone locked, another app or tab in front) so idle phones don't burn battery.
const waitMs = () => (anyLive ? C.refreshSeconds : (C.idleRefreshSeconds || 120)) * 1000;
async function refresh() {
  clearTimeout(timer); timer = null;
  if (document.hidden) { nextAt = 0; return; }
  try {
    const [L, users, R, st] = await Promise.all([get(`${S}/league/${C.leagueId}`), get(`${S}/league/${C.leagueId}/users`), get(`${S}/league/${C.leagueId}/rosters`), get(`${S}/state/nfl`)]);
    const U = {}; users.forEach(u => U[u.user_id] = u);
    T = {}; R.forEach(r => { const u = U[r.owner_id] || {}, md = u.metadata || {};
      const img = /^https?:\/\//.test(md.avatar || "") ? md.avatar : u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null;
      const name = md.team_name || u.display_name || "Team " + r.roster_id, nick = (C.nicknames || {})[u.display_name] || (C.nicknames || {})[name.trim()];
      T[r.roster_id] = { name, img, short: nick || shortName(name) }; });
    $("lg").textContent = L.name.toUpperCase().slice(0, 8);
    document.title = `${L.name} Odds`;
    const pws = L.settings.playoff_week_start, lastReg = pws - 1, lastScored = L.settings.last_scored_leg || 0;
    const curWeek = st.season_type === "regular" ? (st.leg || st.week) : (st.season_type === "post" || st.season_type === "off") ? 99 : 1;
    const ids = R.map(r => r.roster_id), P = L.settings.playoff_teams || 6, wc = Math.min(C.pfWildcardSpots || 0, P);
    let wkShown, res, mode, labels = null;
    if (lastScored < lastReg && curWeek < 99) {
      mode = "race";
      { const rt = L.settings.playoff_round_type || 0, nR = Math.ceil(Math.log2(L.settings.playoff_teams || 6)); roundWeeks = r => rt === 2 || (rt === 1 && r === nR) ? 2 : 1; }
      const weeks = [], liveW = Math.min(curWeek, lastReg);
      for (let w = lastScored + 1; w <= lastReg; w++) {
        if (w <= curWeek) { const wk = await liveWeek(L, w); wk.cur = w === liveW; weeks.push(wk); }
        else weeks.push({ future: true, pairs: pairsOf(await get(`${S}/league/${C.leagueId}/matchups/${w}`)) });
      }
      wkShown = weeks.find(w => w.cur);
      loadHist(`jffl2:${C.leagueId}:${L.season}:w${liveW}`); loadImp(`jfflimp:${C.leagueId}:${L.season}:w${liveW}`);
      res = simulate(L, R, mode, weeks);
      res.gpw = weeks.length * (res.med ? 2 : 1);
      $("eyebrow").textContent = `${L.season} season · Week ${liveW}${lastReg - liveW ? ` · ${lastReg - liveW + 1} weeks left` : " · final regular-season week"}`;
    } else {
      mode = "playoffs";
      const brAll = await get(`${S}/league/${C.leagueId}/winners_bracket`);
      const br = brAll.filter(m => !m.p || m.p === 1).sort((a, b) => a.r - b.r || a.m - b.m);
      const maxR = Math.max(...br.map(m => m.r)), rt = L.settings.playoff_round_type || 0;
      // Sleeper: 0 = 1 week per round, 1 = two-week championship, 2 = every round is two weeks
      roundWeeks = r => rt === 2 || (rt === 1 && r === maxR) ? 2 : 1;
      const startOf = r => { let w = pws; for (let k = 1; k < r; k++) w += roundWeeks(k); return w; };
      let round = 1; while (round < maxR && curWeek >= startOf(round + 1)) round++;
      const rStart = startOf(round), rLen = roundWeeks(round), wIn = Math.min(rLen, Math.max(1, curWeek - rStart + 1));
      wkShown = await liveWeek(L, rStart + wIn - 1);
      const { avg } = standings(L, R);
      if (wIn > 1) { // second week of a two-week game: add the first week's final points
        for (const m of await get(`${S}/league/${C.leagueId}/matchups/${rStart}`)) if (wkShown.teams[m.roster_id]) wkShown.teams[m.roster_id].live += m.custom_points ?? m.points ?? 0;
      }
      for (let k = wIn; k < rLen; k++) for (const id in wkShown.teams) { // week(s) of this game not played yet
        const a = avg[id] || 0; wkShown.teams[id].items.push({ nfl: "_wk" + k + "_" + id, mu: a, sd: 0.18 * a + 8, name: `Week ${rStart + k} (season avg.)`, pos: "", f: 1, fut: true });
      }
      const live = br.filter(m => m.r === round && m.t1 && m.t2 && wkShown.teams[m.t1] && wkShown.teams[m.t2]);
      wkShown = { ...wkShown, pairs: live.map(m => [m.t1, m.t2]) };
      const wkTag = rLen > 1 ? ` · week ${wIn} of ${rLen}` : "";
      labels = live.map(m => (m.p === 1 ? "Championship" : "Game " + m.m) + wkTag);
      loadHist(`jffl2:${C.leagueId}:${L.season}:w${rStart}`); loadImp(`jfflimp:${C.leagueId}:${L.season}:w${rStart + wIn - 1}`);
      res = simulate(L, R, mode, null, br, wkShown, round);
      res.br = br; res.round = round;
      $("eyebrow").textContent = `${L.season} playoffs · ${round >= maxR ? "Championship" : "Round " + round} · ${rLen > 1 ? `Week ${wIn} of ${rLen}` : "Week " + rStart}`;
    }
    res.wkLive = wkShown ? Object.fromEntries(Object.entries(wkShown.teams).map(([k, v]) => [k, v.live])) : {};
    const alive = mode === "race" ? ids.filter(i => res.O[i].make > 0.0005 && res.O[i].make < 0.9995) : [];
    const metricOf = i => mode === "race" && alive.length ? res.O[i].make : res.O[i].champ;
    const prevM = hist.length ? hist[hist.length - 1].m : null;
    const newM = Object.fromEntries(ids.map(i => [i, metricOf(i)]));
    pushHist({ t: Date.now(), m: newM });
    let swing = 0; if (prevM) for (const i of ids) { const d = newM[i] - (prevM[i] ?? newM[i]); if (Math.abs(d) >= 0.10 && Math.abs(d) > Math.abs(swing)) swing = d; }
    const finalsNow = new Set((wkShown?.pairs || []).filter(([a, b]) => !wkShown.teams[a].items.length && !wkShown.teams[b].items.length).map(p => p.join("-")));
    const newFinals = prevFinals ? [...finalsNow].filter(k => !prevFinals.has(k)).length : 0; prevFinals = finalsNow;

    if (!seeded && wkShown) { seeded = true; await seedPlays(wkShown).catch(() => {}); }
    await describePlays(wkShown, trackPlays(wkShown, res.wp)).catch(() => {});
    const { base } = standings(L, R);
    const W = {}, PF = {}; ids.forEach(i => { W[i] = base[i].w; PF[i] = base[i].pf; });
    const seedOf = {};
    if (mode === "race") (res.field || []).forEach((i, k) => seedOf[i] = k + 1);
    else {
      // seeds come from the bracket Sleeper actually has (the commissioner can edit it), using standings only to order teams
      const order = seedField(ids, W, PF, ids.length, 0), rank = i => { const k = order.indexOf(i); return k < 0 ? 99 : k; }, by = (a, b) => rank(a) - rank(b);
      const r1 = res.br.filter(m => m.r === 1 && m.t1 && m.t2), r2 = res.br.filter(m => m.r === 2);
      const byes = r2.map(m => m.t1 ?? m.t2).filter(x => x != null && !r1.some(g => g.t1 === x || g.t2 === x)).sort(by);
      if (P === 6 && r1.length === 2 && byes.length === 2) {
        const m1 = r2.find(m => (m.t1 ?? m.t2) === byes[0]), f = m1 && (m1.t1 === byes[0] ? m1.t2_from : m1.t1_from);
        const g45 = r1.find(g => f && g.m === (f.w || f.l)) || r1[0], g36 = r1.find(g => g !== g45);
        const [s4, s5] = [g45.t1, g45.t2].sort(by), [s3, s6] = [g36.t1, g36.t2].sort(by);
        [byes[0], byes[1], s3, s4, s5, s6].forEach((i, k) => seedOf[i] = k + 1);
      } else seedField(ids, W, PF, P, wc).forEach((i, k) => seedOf[i] = k + 1);
    }

    $("title").textContent = mode === "race" ? (alive.length ? "Playoff Forecast" : "Championship Forecast") : "Championship Forecast";
    renderTicker(wkShown, res.wp, labels);
    renderTitleBar(res, ids);
    renderNeeds(res, mode === "race" ? (alive.length ? "race" : "none") : "playoffs", ids, wkShown);
    renderTable(res, mode, alive, wkShown);
    renderBracket(res, mode === "race" ? (res.field ? seedBracket(res.field) : null) : res.br, mode, wkShown, res.round, seedOf, mode === "race" && !alive.length);
    renderGames(wkShown, res, wkShown?.live?.length ? "Live games" : mode === "race" ? `Week ${wkShown?.week ?? ""} matchups` : "This week's games", labels);
    const contenders = ids.filter(i => metricOf(i) > 0.0005);
    const ever = [...new Set(hist.flatMap(h => Object.keys(h.m || {}).filter(i => h.m[i] > 0.0005 && (mode !== "race" || !alive.length || h.m[i] < 0.9995))))].map(Number);
    // in the playoffs, only chart teams that are in the bracket (drops anyone removed from it)
    const inBr = mode === "race" ? null : new Set(res.br.flatMap(m => [m.t1, m.t2]).filter(x => x != null));
    renderTrend((ever.length ? ever : contenders).filter(i => T[i] && (!inBr || inBr.has(i))), mode === "race" && alive.length ? "Playoff odds over time" : "Title odds over time");
    $("rules").textContent = `Rules modeled: seeds 1–${P - wc} by record (PF breaks ties)${wc ? `; ${wc === 1 ? "seed " + P + " goes" : "the last " + wc + " seeds go"} to the highest PF among the rest` : ""}.${res.med ? " Each week the top half of scorers gets an extra win." : ""}${res.byes ? ` Top ${res.byes} seeds get a first-round bye.` : ""}`;
    animateAll();
    if (!CHAMPS) loadChamps(L).catch(() => {});

    anyLive = !!(wkShown && wkShown.live && wkShown.live.length);
    const sig = wkShown ? Object.values(wkShown.teams).map(t => t.live).join(",") : "";
    const scored = !!lastSig && sig !== lastSig;
    if (sig !== lastSig) { if (lastSig) lastChange = Date.now(); lastSig = sig; }
    window.JFFLSound?.onRefresh({ scored, swing, finals: newFinals });
    lastFetch = Date.now();
    $("pill").className = "pill" + (anyLive ? " live" : "");
    $("pillT").textContent = anyLive ? "LIVE" : "UPDATED " + tFmt(lastFetch).toUpperCase();
    $("status").textContent = anyLive ? `NFL games in progress: ${wkShown.live.join(" · ")}` : "No NFL games in progress.";
    tick();
  } catch (err) {
    console.error(err);
    $("pill").className = "pill"; $("pillT").textContent = "RETRYING";
    $("meta").textContent = "Couldn't reach Sleeper. Trying again shortly.";
  }
  if (document.hidden) { nextAt = 0; return; }
  nextAt = Date.now() + waitMs();
  timer = setTimeout(refresh, waitMs());
}

function tick() {
  if (!lastFetch || !nextAt) return;
  const ago = s => s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  if (!anyLive) { $("meta").innerHTML = `Updated <b>${tFmt(lastFetch)}</b>`; return; }
  $("meta").innerHTML = `Updated <b>${tFmt(lastFetch, true)}</b> · next update in <b>${Math.max(0, Math.round((nextAt - Date.now()) / 1000))}s</b>${lastChange ? ` · scores moved ${ago(Math.round((Date.now() - lastChange) / 1000))}` : ""}`;
}

$("refresh").addEventListener("click", refresh);
// light / dark / auto theme, remembered per device
{
  const ICON = {
    auto: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/></svg>'
  };
  const NAME = { auto: "Auto (matches your device)", light: "Light", dark: "Dark" };
  const btn = $("thBtn"), meta = document.querySelector('meta[name="theme-color"]');
  let mode = "auto"; try { mode = localStorage.getItem("jfflTheme") || "auto"; } catch {}
  const apply = () => {
    document.documentElement.style.colorScheme = mode === "auto" ? "" : mode;
    const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (meta) meta.content = dark ? "#0f1215" : "#ffffff";
    btn.innerHTML = ICON[mode]; btn.title = "Theme: " + NAME[mode]; btn.setAttribute("aria-label", "Color theme: " + NAME[mode] + ". Click to change.");
  };
  btn.addEventListener("click", () => { mode = { auto: "light", light: "dark", dark: "auto" }[mode] || "auto"; try { mode === "auto" ? localStorage.removeItem("jfflTheme") : localStorage.setItem("jfflTheme", mode); } catch {} apply(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", apply);
  apply();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { clearTimeout(timer); timer = null; nextAt = 0; return; }
  if (Date.now() - lastFetch >= Math.min(waitMs(), 15000)) refresh();
  else { nextAt = lastFetch + waitMs(); timer = setTimeout(refresh, Math.max(0, nextAt - Date.now())); }
});
setInterval(tick, 1000);
refresh();
})();

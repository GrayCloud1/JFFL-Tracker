(() => {
const C = window.TRACKER_CONFIG;
const S = "https://api.sleeper.app/v1", S2 = "https://api.sleeper.com";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = u => fetch(u, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(r.status + " " + u); return r.json(); });
const ESPN2SLP = { WSH: "WAS", JAC: "JAX" };
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => "position[]=" + p).join("&");
const pct = p => p >= 0.9995 ? "In" : p <= 0.0005 ? "Out" : p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : Math.round(p * 100) + "%";
const col = p => p >= 0.8 ? "var(--g)" : p >= 0.45 ? "var(--y)" : "var(--o)";
const f1 = x => (+x).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const LINE = ["#2f7de1", "#e2572b", "#1c9e64", "#b04fd1", "#d49a00", "#e0457b", "#00a3b4", "#7a8c2a"];
const clockFmt = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

let lastFetch = 0, lastChange = 0, lastSig = "", timer = null, anyLive = false, histKey = "", hist = [];

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// ---------- history (kept in this browser, per league + week) ----------
function loadHist(key) { histKey = key; try { hist = JSON.parse(localStorage.getItem(key) || "[]"); } catch { hist = []; } }
function pushHist(entry) {
  hist.push(entry); if (hist.length > 400) hist = hist.slice(-400);
  try { localStorage.setItem(histKey, JSON.stringify(hist)); } catch {}
}

// ---------- data ----------
async function gameClock(season, week) {
  const frac = {}, live = [];
  try {
    const e = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
    for (const ev of e.events || []) {
      const st = ev.status, s = st.type.state;
      let f = 1;
      if (s === "post") f = 0;
      else if (s === "in") {
        const [m, sec] = String(st.displayClock || "0:00").split(":").map(Number);
        f = st.period > 4 ? 0.01 : Math.max(0.005, ((4 - st.period) * 900 + (m * 60 + (sec || 0))) / 3600);
        live.push(ev.shortName.replace(" @ ", " @ ").replace(" VS ", " vs ") + " · " + st.type.shortDetail);
      }
      for (const c of ev.competitions[0].competitors) frac[ESPN2SLP[c.team.abbreviation] || c.team.abbreviation] = f;
    }
  } catch (err) {
    const sch = await get(`${S2}/schedule/nfl/regular/${season}`);
    for (const g of sch.filter(g => g.week == week)) {
      const f = g.status === "complete" ? 0 : g.status === "in_game" ? 0.5 : 1;
      frac[g.home] = frac[g.away] = f;
      if (f === 0.5) live.push(`${g.away} @ ${g.home} · live`);
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

function drawWeek(wk, avg) {
  const sc = {};
  if (wk.future) { for (const id in avg) sc[id] = Math.max(0, avg[id] + (0.18 * avg[id] + 8) * gauss()); return sc; }
  const z = {};
  for (const id in wk.teams) {
    const t = wk.teams[id]; let x = t.live;
    for (const it of t.items) { const zt = z[it.nfl] ??= gauss(); x += it.mu + it.sd * (0.5 * zt + 0.866 * gauss()); }
    sc[id] = Math.max(x, t.live - 3);
  }
  return sc;
}
const proj = t => t.live + t.items.reduce((s, i) => s + i.mu, 0);

// ---------- regular-season race ----------
function simRace(L, R, weeks) {
  const N = C.sims, ids = R.map(r => r.roster_id), P = L.settings.playoff_teams || 6;
  const wc = Math.min(C.pfWildcardSpots || 0, P), med = !!L.settings.league_average_match;
  const byes = 2 ** Math.ceil(Math.log2(P)) - P;
  const base = {}, avg = {};
  for (const r of R) {
    const s = r.settings, g = (s.wins + s.losses + (s.ties || 0)) / (med ? 2 : 1) || 1;
    const pf = s.fpts + (s.fpts_decimal || 0) / 100;
    base[r.roster_id] = { w: s.wins, l: s.losses, t: s.ties || 0, pf }; avg[r.roster_id] = pf / g;
  }
  const out = {}, fields = {};
  ids.forEach(i => out[i] = { make: 0, seeds: Array(P).fill(0), h2h: 0, wMin: 1e9, wMax: -1, games: 0 });
  for (let n = 0; n < N; n++) {
    const W = {}, PF = {};
    ids.forEach(i => { W[i] = base[i].w; PF[i] = base[i].pf; });
    for (const wk of weeks) {
      const sc = drawWeek(wk, avg);
      ids.forEach(i => PF[i] += sc[i] ?? 0);
      for (const [a, b] of wk.pairs) { const w = sc[a] >= sc[b] ? a : b; W[w]++; if (wk.cur) out[w].h2h++; }
      if (med) [...ids].sort((a, b) => sc[b] - sc[a]).slice(0, Math.floor(ids.length / 2)).forEach(i => W[i]++);
    }
    ids.forEach(i => { out[i].wMin = Math.min(out[i].wMin, W[i]); out[i].wMax = Math.max(out[i].wMax, W[i]); });
    const byRec = [...ids].sort((a, b) => W[b] - W[a] || PF[b] - PF[a]);
    const top = byRec.slice(0, P - wc);
    const rest = ids.filter(i => !top.includes(i)).sort((a, b) => PF[b] - PF[a]).slice(0, wc);
    const field = [...top, ...rest];
    field.forEach((i, k) => { out[i].make++; out[i].seeds[k]++; });
    const key = field.join(","); fields[key] = (fields[key] || 0) + 1;
  }
  const gpw = weeks.reduce((s, w) => s + (med ? 2 : 1), 0);
  ids.forEach(i => { const o = out[i]; o.games = gpw; o.make /= N; o.seeds = o.seeds.map(c => c / N); o.h2h /= N; });
  const best = Object.entries(fields).sort((a, b) => b[1] - a[1])[0];
  return { out, base, P, wc, med, byes, field: best[0].split(",").map(Number), fieldP: best[1] / N };
}

// ---------- hero bracket ----------
function slot(seed, name, hint, cls = "") { return `<div class="slot ${cls}"><div class="seed">${seed ?? ""}</div><div class="n">${name}</div><div class="h">${hint || ""}</div></div>`; }

function heroFromRace(T, res, alive, champWeek) {
  const { out, P, wc, byes, field } = res;
  const s = k => { const id = field[k]; if (id == null) return slot(k + 1, "TBD", "", "tbd"); const p = out[id].seeds[k];
    const hint = p >= 0.995 ? "locked" : `${Math.round(p * 100)}% here`;
    return slot(k + 1, esc(T[id].name), hint, `${k >= P - wc ? "wc" : ""} ${out[id].make < 0.9 ? "shaky" : ""}`); };
  const r1 = [], pairsR1 = [];
  for (let a = byes, b = P - 1; a < b; a++, b--) pairsR1.push([a, b]);
  pairsR1.forEach(([a, b]) => r1.push(`<div class="game">${s(a)}${s(b)}</div>`));
  const r2 = [];
  for (let i = 0; i < byes; i++) { const g = pairsR1[byes - 1 - i]; r2.push(`<div class="game">${s(i)}${slot("", `Winner ${g[0] + 1}/${g[1] + 1}`, "", "tbd")}</div>`); }
  const side = alive.length
    ? `<div class="side"><h3>ON THE BUBBLE</h3><div class="bubble">${alive.map(i => `<div class="r"><span>${esc(T[i].name)}</span><b style="color:${out[i].make >= .8 ? "#37d08c" : out[i].make >= .45 ? "#e7b53c" : "#ff9a66"}">${pct(out[i].make)}</b></div>`).join("")}</div></div>`
    : `<div class="side"><h3>CHAMPIONSHIP</h3><div class="champ">Week ${champWeek}</div></div>`;
  $("bk").innerHTML = `<div class="col"><h3>${byes ? "ROUND 1" : "SEMIFINALS"}${alive.length ? " · PROJECTED" : ""}</h3>${r1.join("")}</div>
    ${byes ? `<div class="col"><h3>ROUND 2 · BYES</h3>${r2.join("")}</div>` : ""}${side}`;
}

// ---------- sections ----------
function renderOdds(T, res, wk, alive) {
  const { out, base } = res;
  const first = hist[0] && hist[0].make;
  const rows = alive.length ? alive : res.field;
  $("oddsSec").hidden = false;
  $("oddsTitle").textContent = alive.length ? "Playoff odds" : "Playoff field";
  const open = res.P - res.field.filter(i => out[i].make >= 0.9995).length;
  $("oddsCap").textContent = alive.length ? `${alive.length} teams for ${open} spot${open === 1 ? "" : "s"}${first ? " · change since " + clockFmt(hist[0].t) : ""}` : "Every spot is decided";
  $("rows").innerHTML = rows.map(i => {
    const b = base[i], p = out[i].make, pfNow = b.pf + (wk && wk.teams[i] ? wk.teams[i].live : 0);
    const d = first && first[i] != null ? Math.round((p - first[i]) * 100) : 0;
    const seed = out[i].seeds.indexOf(Math.max(...out[i].seeds)) + 1;
    const o = out[i], recTxt = o.wMin === o.wMax ? `${o.wMin}-${b.w + b.l + b.t + o.games - o.wMin - b.t}${b.t ? "-" + b.t : ""}` : `${b.w}-${b.l}${b.t ? "-" + b.t : ""}`;
    return `<div class="tr"><div><div class="nm">${esc(T[i].name)}</div><div class="sub">${recTxt} · ${f1(pfNow)} PF · ${alive.length ? "likely " : ""}${ord(seed)} seed</div></div>
      <div class="track" role="img" aria-label="${pct(p)}"><i style="width:${p * 100}%;background:${col(p)}"></i></div>
      <div><div class="pc" style="color:${col(p)}">${pct(p)}</div>${d ? `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}</span>` : ""}</div></div>`;
  }).join("");
}

function spark(series) {
  if (series.length < 2) return `<svg class="spark" viewBox="0 0 300 46" preserveAspectRatio="none"><line x1="0" y1="23" x2="300" y2="23" stroke="var(--line)" stroke-dasharray="3 4"/></svg>`;
  const pts = series.map((v, k) => `${(k / (series.length - 1) * 300).toFixed(1)},${(44 - v * 42).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 300 46" preserveAspectRatio="none" role="img" aria-label="Win probability trend"><line x1="0" y1="23" x2="300" y2="23" stroke="var(--line)" stroke-dasharray="3 4"/><polyline points="${pts}" fill="none" stroke="var(--g)" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderGames(wk, T, winP, title, labels) {
  $("gamesSec").hidden = false; $("gamesTitle").textContent = title;
  $("games").innerHTML = wk.pairs.map(([a, b], k) => {
    const pa = winP(a, b), key = a + "-" + b;
    const series = hist.map(h => h.wp && h.wp[key]).filter(v => v != null);
    const side = (id, p) => { const t = wk.teams[id], left = t.items.length, final = !wk.teams[a].items.length && !wk.teams[b].items.length;
      return `<div class="tm${final && p > 0.5 ? " win" : ""}"><div class="t">${esc(T[id].name)}</div><div class="s">${f1(t.live)}</div><div class="w" style="color:${p >= .5 ? "var(--g)" : "var(--o)"}">${final ? "" : Math.round(p * 100) + "%"}</div>
        <div class="p">${left ? `proj ${f1(proj(t))} · ${left} to play` : "done"}</div></div>`; };
    const fin = !wk.teams[a].items.length && !wk.teams[b].items.length;
    return `<div class="panel mu"><div class="lbl"><span>${labels ? labels[k] : "Matchup " + (k + 1)}</span><span>${fin ? "Final" : "Win chance"}</span></div>${side(a, pa)}${side(b, 1 - pa)}${fin ? "" : spark(series)}</div>`;
  }).join("");
}

function renderTrend(T, ids) {
  const pts = hist.filter(h => h.make);
  if (pts.length < 2 || !ids.length) { $("trendSec").hidden = !ids.length; $("trend").innerHTML = ""; $("legend").innerHTML = `<span style="--c:var(--line)">Leave this page open and the chart fills in as odds move</span>`; return; }
  $("trendSec").hidden = false;
  const svg = $("trend"), draw = () => {
    const W = svg.clientWidth, H = svg.clientHeight, l = 40, r = 14, t = 14, b = 26;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1, x = v => l + (v - t0) / Math.max(1, t1 - t0) * (W - l - r), y = p => t + (1 - p) * (H - t - b);
    let g = [0, .25, .5, .75, 1].map(p => `<line x1="${l}" x2="${W - r}" y1="${y(p)}" y2="${y(p)}" stroke="var(--line)"/><text x="${l - 8}" y="${y(p) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${p * 100}%</text>`).join("");
    g += `<text x="${l}" y="${H - 6}" font-size="11" fill="var(--mute)">${clockFmt(t0)}</text><text x="${W - r}" y="${H - 6}" font-size="11" fill="var(--mute)" text-anchor="end">${clockFmt(t1)}</text>`;
    ids.forEach((id, k) => { const d = pts.filter(h => h.make[id] != null).map(h => `${x(h.t).toFixed(1)},${y(h.make[id]).toFixed(1)}`).join(" ");
      g += `<polyline points="${d}" fill="none" stroke="${LINE[k % LINE.length]}" stroke-width="2.4" stroke-linejoin="round"/>`; });
    svg.innerHTML = g;
  };
  draw(); (svg._ro ||= new ResizeObserver(draw)).observe(svg);
  $("legend").innerHTML = ids.map((id, k) => `<span style="--c:${LINE[k % LINE.length]}">${esc(T[id].name)}</span>`).join("");
}

// ---------- playoffs ----------
async function playoffs(L, T, curWeek) {
  const pws = L.settings.playoff_week_start, br = await get(`${S}/league/${C.leagueId}/winners_bracket`);
  const maxR = Math.max(...br.map(m => m.r)), round = Math.min(maxR, Math.max(1, curWeek - pws + 1));
  const wk = await liveWeek(L, pws + round - 1);
  loadHist(`jffl:${C.leagueId}:${L.season}:w${wk.week}`);
  const pmemo = {}, winP = (a, b) => { const k = a + "-" + b; if (pmemo[k] != null) return pmemo[k]; const ta = wk.teams[a], tb = wk.teams[b]; if (!ta || !tb) return 0.5;
    let w = 0; for (let n = 0; n < 10000; n++) { const s = drawWeek({ teams: { a: ta, b: tb } }); if (s.a >= s.b) w++; } return pmemo[k] = w / 10000; };
  const from = f => f ? `${f.w ? "Winner" : "Loser"} of game ${f.w || f.l}` : "TBD";
  const label = m => m.p === 1 ? "Championship" : m.p === 3 ? "3rd place" : m.p === 5 ? "5th place" : m.p ? ord(m.p) + " place" : `Game ${m.m}`;
  $("title").textContent = round >= maxR ? "Championship Week" : `Playoffs · Round ${round}`;
  const cols = [];
  for (let r = 1; r <= maxR; r++) {
    cols.push(`<div class="col"><h3>ROUND ${r}${r === round ? " · LIVE" : ""}</h3>${br.filter(m => m.r === r && (!m.p || m.p === 1)).map(m => {
      const live = r === round && m.t1 && m.t2 && wk.teams[m.t1] && wk.teams[m.t2], p1 = live ? winP(m.t1, m.t2) : null;
      const sd = (t, f, p) => t ? slot("", esc(T[t].name), live ? `${f1(wk.teams[t].live)} · ${Math.round(p * 100)}%` : m.w === t ? "won" : "", m.w && m.w !== t ? "tbd" : "") : slot("", from(f), "", "tbd");
      return `<div class="game">${sd(m.t1, m.t1_from, p1)}${sd(m.t2, m.t2_from, 1 - p1)}</div>`; }).join("")}</div>`);
  }
  $("bk").innerHTML = cols.join("");
  $("bk").style.gridTemplateColumns = `repeat(${maxR},minmax(0,1fr))`;
  const games = br.filter(m => m.r === round && m.t1 && m.t2 && wk.teams[m.t1] && wk.teams[m.t2]);
  const view = { ...wk, pairs: games.map(m => [m.t1, m.t2]) };
  const wp = {}; view.pairs.forEach(([a, b]) => wp[a + "-" + b] = winP(a, b));
  pushHist({ t: Date.now(), wp });
  renderGames(view, T, winP, `Round ${round} games`, games.map(label));
  $("oddsSec").hidden = true; $("trendSec").hidden = true; $("rules").textContent = "";
  return wk;
}

// ---------- main ----------
async function refresh() {
  clearTimeout(timer);
  try {
    const [L, users, R, st] = await Promise.all([get(`${S}/league/${C.leagueId}`), get(`${S}/league/${C.leagueId}/users`), get(`${S}/league/${C.leagueId}/rosters`), get(`${S}/state/nfl`)]);
    const U = {}; users.forEach(u => U[u.user_id] = u);
    const T = {}; R.forEach(r => { const u = U[r.owner_id] || {}; T[r.roster_id] = { name: (u.metadata && u.metadata.team_name) || u.display_name || "Team " + r.roster_id }; });
    const pws = L.settings.playoff_week_start, lastReg = pws - 1, lastScored = L.settings.last_scored_leg || 0;
    const curWeek = st.season_type === "regular" ? (st.leg || st.week) : (st.season_type === "post" || st.season_type === "off") ? 99 : 1;
    let wkShown;
    if (lastScored < lastReg && curWeek < 99) {
      const weeks = [], liveW = Math.min(curWeek, lastReg);
      for (let w = lastScored + 1; w <= lastReg; w++) {
        if (w <= curWeek) { const wk = await liveWeek(L, w); wk.cur = w === liveW; weeks.push(wk); }
        else weeks.push({ future: true, pairs: pairsOf(await get(`${S}/league/${C.leagueId}/matchups/${w}`)) });
      }
      wkShown = weeks.find(w => w.cur);
      loadHist(`jffl:${C.leagueId}:${L.season}:w${liveW}`);
      $("eyebrow").textContent = `${L.name.toUpperCase()} · WEEK ${liveW}${lastReg - liveW ? ` · ${lastReg - liveW + 1} WEEKS LEFT` : " · FINAL REGULAR-SEASON WEEK"}`;
      const res = simRace(L, R, weeks);
      const alive = Object.keys(res.out).map(Number).filter(i => res.out[i].make > 0.0005 && res.out[i].make < 0.9995).sort((a, b) => res.out[b].make - res.out[a].make);
      const wp = {}; if (wkShown) wkShown.pairs.forEach(([a, b]) => wp[a + "-" + b] = res.out[a].h2h);
      const make = {}; Object.keys(res.out).forEach(i => make[i] = res.out[i].make);
      pushHist({ t: Date.now(), make, wp });
      $("title").textContent = alive.length ? "Playoff Picture" : "Playoff Field Set";
      heroFromRace(T, res, alive, pws + Math.ceil(Math.log2(res.P)) - 1);
      renderOdds(T, res, wkShown, alive);
      if (wkShown) renderGames(wkShown, T, a => res.out[a].h2h, `Week ${liveW} matchups`);
      const ever = [...new Set(hist.flatMap(h => Object.keys(h.make || {}).filter(i => h.make[i] > 0.0005 && h.make[i] < 0.9995)))].map(Number);
      renderTrend(T, ever.length ? ever : alive);
      const { P, wc, med } = res;
      $("rules").textContent = `Seeds 1–${P - wc} go by record (PF breaks ties)${wc ? `; ${wc === 1 ? "seed " + P + " goes" : "the last " + wc + " seeds go"} to the most PF among the rest` : ""}.${med ? " The top half of scorers each week gets an extra win." : ""}`;
    } else {
      $("eyebrow").textContent = `${L.name.toUpperCase()} · ${curWeek >= 99 ? L.season + " SEASON" : "WEEK " + curWeek}`;
      wkShown = await playoffs(L, T, curWeek);
    }
    anyLive = !!(wkShown && wkShown.live && wkShown.live.length);
    const sig = wkShown ? Object.values(wkShown.teams).map(t => t.live).join(",") : "";
    if (sig !== lastSig) { if (lastSig) lastChange = Date.now(); lastSig = sig; }
    lastFetch = Date.now();
    $("dot").className = "dot " + (anyLive ? "live" : "");
    $("st2").textContent = anyLive ? wkShown.live.join(" · ") : "No NFL games in progress";
    tick();
  } catch (err) {
    console.error(err);
    $("dot").className = "dot err"; $("st1").textContent = "Can't reach Sleeper · retrying";
  }
  timer = setTimeout(refresh, (anyLive ? C.refreshSeconds : 300) * 1000);
}

function tick() {
  if (!lastFetch) return;
  const ago = s => s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  $("st1").textContent = (anyLive ? "LIVE · " : "") + "Updated " + ago(Math.round((Date.now() - lastFetch) / 1000)) + (lastChange ? ` · scores moved ${ago(Math.round((Date.now() - lastChange) / 1000))}` : "");
}

$("refresh").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastFetch > 30000) refresh(); });
setInterval(tick, 5000);
refresh();
})();

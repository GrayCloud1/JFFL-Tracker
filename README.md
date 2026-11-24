# JFFL Live Tracker

A live playoff tracker for the JFFL Sleeper league. It's one static page: every visitor's browser pulls live data straight from Sleeper's public API (plus ESPN's scoreboard for game clocks) and reruns the odds in place, so there is no server and no API keys.

**What it shows**

- **Regular season:** a projected playoff bracket, playoff odds for every team still in the race, live matchups with win probability, and an odds-over-time chart.
- **Playoffs:** the live bracket, each game's score and win probability, and every team's live championship odds.
- **What each team needs:** a card for every team still alive showing their odds if they win or lose, who to root for, the score they need, and who's still playing.
- Sleeper avatars, a "who wins it all" bar, animated odds changes, tap-to-expand team details, sound effects and optional piano/jazz music.

Odds refresh every 20 seconds while NFL games are live and every 2 minutes otherwise, with a countdown to the next update. The page pauses while it's in the background (phone locked, another tab in front) and catches up as soon as it's opened again.

## Turn on GitHub Pages (one time)

1. In this repo, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main`, folder `/ (root)`, then click **Save**.
3. After a minute the site is live at `https://graycloud1.github.io/JFFL-Tracker/`.

## Custom domain

The site lives at **https://jfflodds.com** (registered at Porkbun). The `CNAME` file in this repo tells GitHub Pages to serve that domain, and the old github.io link redirects to it. DNS at Porkbun:

| Type | Host | Answer |
|---|---|---|
| A | (blank) | 185.199.108.153 |
| A | (blank) | 185.199.109.153 |
| A | (blank) | 185.199.110.153 |
| A | (blank) | 185.199.111.153 |
| CNAME | www | graycloud1.github.io |

Keep auto-renew on at Porkbun so the domain never lapses.

## Nice to have (ideas for later)

Ideas we've talked about but are holding off on, so the main page stays focused.

**Live matchup polish** (prototyped and tested on Nov 24, not published)
- **Last big play** on each live matchup card: the starter whose points just jumped, ESPN's play description when it names them, and the win-odds swing (e.g. "Josh Allen 12-yd TD pass · +6.4 pts · win odds 66% → 71% ▲5").
- **Touchdown celebration**: a football burst and "TOUCHDOWN!" over the matchup card when a starter scores 5.5+ at once, plus a short fanfare for anyone with sound effects on.
- **"What it means" line** under each matchup: each team's title (or playoff) odds with a win vs. a loss.

**Layout**
- **Live / Breakdown tabs**: keep live games, odds and bracket on the main view, and move the stat boxes, scenario cards, "who wins it all" legend and odds-over-time chart to a second tab (jfflodds.com/#breakdown).
- **Compact matchup styles** to fit more games per phone screen: tug-of-war win bar, score-vs-projection bars, or a win-odds game-flow line. (Decided to keep the meter for now.)

**From comparing with jfflplayoffs2026.netlify.app**
- **What-if picker**: tap who wins each game and watch the odds update.
- **"My team"**: pick your team once and keep it highlighted and pinned.
- **Recent form**: weight the last 4 weeks more when simulating future games.
- **League nicknames** for short names (e.g. "Comm. Holden", "Kumon Nelson") via `nicknames` in `config.js`.

**Social** (needs a small free backend such as Firebase or Supabase)
- **Chat room** on the site, or simply a button that opens the league's Sleeper chat.
- **Emote reactions** on matchups people are watching, shared live with everyone.

## Settings

Edit `config.js`:

| Setting | What it does |
|---|---|
| `leagueId` | Sleeper league ID |
| `pfWildcardSpots` | Playoff spots awarded by total PF instead of record (JFFL uses 1) |
| `refreshSeconds` | Seconds between refreshes while NFL games are live |
| `idleRefreshSeconds` | Seconds between refreshes when no games are on |
| `nicknames` | Optional short names for the ticker, matchup lines and phone chart labels, e.g. `connorhouston: "Houston"`. Left empty, a short name is picked from each team name |
| `sims` | Simulations per refresh (more is smoother, but slower on phones) |

Everything else, including playoff teams, the playoff start week, the top-half scoring win and PPR scoring, is read from the league's Sleeper settings.

## How the odds work

For every starter who hasn't finished playing, the page takes Sleeper's projection, scales it by how much of their NFL game is left, and draws a random outcome around it. Players on the same NFL team move partly together. It plays out the rest of the week thousands of times using the league's rules (H2H win, top-half scoring win, PF tiebreakers, PF wildcard) and counts how often each team makes the playoffs. Later weeks of the regular season use each team's scoring average.

The "odds over time" chart and the trend lines on each matchup are saved in each viewer's own browser, so they fill in while the page is open.

## Files

- `index.html`: layout and styles
- `app.js`: data fetching, simulation and rendering
- `config.js`: league settings

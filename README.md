# JFFL Live Tracker

A live playoff tracker for the JFFL Sleeper league. It's one static page: every visitor's browser pulls live data straight from Sleeper's public API (plus ESPN's scoreboard for game clocks) and reruns the odds in place, so there is no server and no API keys.

**What it shows**

- **Regular season:** a projected playoff bracket, playoff odds for every team still in the race, live matchups with win probability, and an odds-over-time chart.
- **Playoffs:** the live bracket, each game's score and win probability, and every team's live championship odds.
- **What each team needs:** a card for every team still alive showing their odds if they win or lose, who to root for, the score they need, and who's still playing.
- Sleeper avatars, a "who wins it all" bar, animated odds changes, tap-to-expand team details, sound effects and optional piano/jazz music.

Odds refresh every 60 seconds, with a countdown to the next update.

## Turn on GitHub Pages (one time)

1. In this repo, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main`, folder `/ (root)`, then click **Save**.
3. After a minute the site is live at `https://graycloud1.github.io/JFFL-Tracker/`. Share that link with the league.

## Settings

Edit `config.js`:

| Setting | What it does |
|---|---|
| `leagueId` | Sleeper league ID |
| `pfWildcardSpots` | Playoff spots awarded by total PF instead of record (JFFL uses 1) |
| `refreshSeconds` | How often odds refresh, in seconds |
| `sims` | Simulations per refresh (more is smoother, but slower on phones) |

Everything else, including playoff teams, the playoff start week, the top-half scoring win and PPR scoring, is read from the league's Sleeper settings.

## How the odds work

For every starter who hasn't finished playing, the page takes Sleeper's projection, scales it by how much of their NFL game is left, and draws a random outcome around it. Players on the same NFL team move partly together. It plays out the rest of the week thousands of times using the league's rules (H2H win, top-half scoring win, PF tiebreakers, PF wildcard) and counts how often each team makes the playoffs. Later weeks of the regular season use each team's scoring average.

The "odds over time" chart and the trend lines on each matchup are saved in each viewer's own browser, so they fill in while the page is open.

## Files

- `index.html`: layout and styles
- `app.js`: data fetching, simulation and rendering
- `config.js`: league settings

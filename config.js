// League settings for the tracker. Most rules are read from Sleeper automatically;
// only the custom ones Sleeper doesn't know about live here.
window.TRACKER_CONFIG = {
  leagueId: "1354645149811998720",

  // JFFL rule: the last playoff spot goes to the highest-PF team among
  // everyone who missed the top seeds by record. Set to 0 to turn off.
  pfWildcardSpots: 1,

  // How often the page refreshes, in seconds: while NFL games are live, and otherwise.
  // The page stops refreshing entirely while it's in the background.
  refreshSeconds: 20,
  idleRefreshSeconds: 120,

  // Short names shown in tight spots (scores ticker, matchup lines, chart labels on phones).
  // Left empty, the site picks one from each team name ("Team Houston" -> "Houston").
  // To override, add  "sleeper username or full team name": "Nickname",  e.g.
  //   connorhouston: "Houston",
  nicknames: {
  },

  // Champions from before the league moved to Sleeper (Sleeper's own history is added automatically).
  // e.g. { season: 2021, team: "Team Name", user: "Owner name", img: "https://link-to-photo.jpg" },
  pastChampions: [
  ],

  // Number of simulations per refresh.
  sims: 20000
};

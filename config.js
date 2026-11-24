// League settings for the tracker. Most rules are read from Sleeper automatically;
// only the custom ones Sleeper doesn't know about live here.
window.TRACKER_CONFIG = {
  leagueId: "1354645149811998720",

  // JFFL rule: the last playoff spot goes to the highest-PF team among
  // everyone who missed the top seeds by record. Set to 0 to turn off.
  pfWildcardSpots: 1,

  // How often the page refreshes live data and odds, in seconds.
  refreshSeconds: 60,

  // Number of simulations per refresh.
  sims: 20000
};

const API = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");
const TOURNAMENT_END = new Date("2026-07-19T00:00:00Z");
const INDIA_TZ = "Asia/Kolkata";

const fallbackEvents = [
  {
    id: "760495",
    date: "2026-07-01T16:00:00Z",
    stage: "Round of 32",
    status: "Scheduled",
    state: "pre",
    completed: false,
    venue: "Mercedes-Benz Stadium, Atlanta, Georgia",
    broadcasts: "FOX, Telemundo, FOX One",
    teams: [
      { name: "England", abbreviation: "ENG", score: "0", logo: "https://a.espncdn.com/i/teamlogos/countries/500/eng.png" },
      { name: "Congo DR", abbreviation: "COD", score: "0", logo: "https://a.espncdn.com/i/teamlogos/countries/500/rdc.png" }
    ],
    links: { gamecast: "https://www.espn.com/soccer/scoreboard/_/league/fifa.world", fifa: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026" }
  }
];

let events = [];

const els = {
  dataStatus: document.querySelector("#data-status"),
  liveGrid: document.querySelector("#live-grid"),
  fixturesList: document.querySelector("#fixtures-list"),
  resultsList: document.querySelector("#results-list"),
  stageFilter: document.querySelector("#stage-filter"),
  teamSearch: document.querySelector("#team-search"),
  refresh: document.querySelector("#refresh"),
  lastRefresh: document.querySelector("#last-refresh"),
  metricMatches: document.querySelector("#metric-matches"),
  metricGoals: document.querySelector("#metric-goals"),
  completed: document.querySelector("#stat-completed"),
  upcoming: document.querySelector("#stat-upcoming"),
  totalGoals: document.querySelector("#stat-total-goals"),
  avgGoals: document.querySelector("#stat-avg-goals"),
  teamLeaders: document.querySelector("#team-leaders"),
  venueList: document.querySelector("#venue-list"),
  teamCloud: document.querySelector("#team-cloud")
};

function tournamentDates() {
  const dates = [];
  const cursor = new Date(TOURNAMENT_START);
  while (cursor <= TOURNAMENT_END) {
    dates.push(cursor.toISOString().slice(0, 10).replaceAll("-", ""));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function stageSlug(stage = "") {
  const text = stage.toLowerCase();
  if (text.includes("group")) return "group";
  if (text.includes("32")) return "round-of-32";
  if (text.includes("16")) return "rd-of-16";
  if (text.includes("quarter")) return "quarterfinals";
  if (text.includes("semi")) return "semifinals";
  if (text.includes("final") || text.includes("3rd")) return "finals";
  return "all";
}

function fmtDate(iso) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TZ,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function parseEvent(event) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const teams = competitors
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((entry) => ({
      name: entry.team?.displayName || entry.team?.shortDisplayName || "TBD",
      abbreviation: entry.team?.abbreviation || "TBD",
      score: entry.score ?? "",
      logo: entry.team?.logo || "",
      winner: entry.winner
    }));
  const venueBits = [
    competition.venue?.fullName,
    competition.venue?.address?.city,
    competition.venue?.address?.country
  ].filter(Boolean);
  const gamecast = event.links?.find((link) => /gamecast|summary|boxscore/i.test(link.text || link.rel?.join(" ") || ""))?.href
    || `https://www.espn.com/soccer/match/_/gameId/${event.id}`;

  return {
    id: event.id,
    date: event.date,
    stage: event.season?.slug?.replaceAll("-", " ") || competition.altGameNote || "FIFA World Cup",
    status: competition.status?.type?.shortDetail || competition.status?.type?.description || "Scheduled",
    state: competition.status?.type?.state || "pre",
    completed: Boolean(competition.status?.type?.completed),
    venue: venueBits.join(", ") || "Venue TBA",
    broadcasts: competition.broadcasts?.map((b) => b.names?.join(", ")).filter(Boolean).join(", ") || "Broadcast TBA",
    teams,
    links: {
      gamecast,
      fifa: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
    }
  };
}

async function fetchDay(date) {
  const response = await fetchWithTimeout(`${API}?dates=${date}&limit=20`, 6500);
  if (!response.ok) throw new Error(`ESPN ${response.status}`);
  const data = await response.json();
  return (data.events || []).map(parseEvent);
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadData() {
  els.dataStatus.textContent = "Loading live data";
  els.refresh.disabled = true;

  try {
    const allResponse = await fetchWithTimeout(`${API}?dates=20260611-20260719&limit=200`, 7000);
    let allEvents = [];
    if (allResponse.ok) {
      const allData = await allResponse.json();
      allEvents = (allData.events || []).map(parseEvent);
    }
    const chunks = allEvents.length >= 20 ? [{ status: "fulfilled", value: allEvents }] : await Promise.allSettled(tournamentDates().map(fetchDay));
    events = chunks.flatMap((chunk) => chunk.status === "fulfilled" ? chunk.value : []);
    const unique = new Map(events.map((event) => [event.id, event]));
    events = [...unique.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!events.length) throw new Error("No events returned");
    els.dataStatus.textContent = "Live ESPN data";
  } catch (error) {
    events = fallbackEvents;
    els.dataStatus.textContent = "Offline snapshot";
  } finally {
    els.refresh.disabled = false;
    els.lastRefresh.textContent = new Intl.DateTimeFormat("en-IN", {
      timeZone: INDIA_TZ,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date());
    render();
  }
}

function matchCard(event) {
  const isLive = event.state === "in";
  const rows = event.teams.map((team) => `
    <div class="team-row">
      ${team.logo ? `<img src="${team.logo}" alt="">` : "<span></span>"}
      <span>${team.name}</span>
      <span class="score">${team.score}</span>
    </div>
  `).join("");

  return `
    <article class="match-card ${isLive ? "live" : ""}">
      <div class="match-meta"><span>${event.status}</span><span>${fmtDate(event.date)} IST</span></div>
      ${rows}
      <p>${event.stage} · ${event.venue}</p>
      <p><strong>Broadcast:</strong> ${event.broadcasts}</p>
      <div class="match-actions">
        <a href="${event.links.gamecast}" target="_blank" rel="noreferrer">Live score</a>
        <a href="${event.links.fifa}" target="_blank" rel="noreferrer">FIFA link</a>
      </div>
    </article>
  `;
}

function matchRow(event) {
  const names = event.teams.map((team) => team.name).join(" vs ");
  const score = event.completed ? event.teams.map((team) => team.score).join(" - ") : event.status;
  return `
    <article class="match-row">
      <time>${fmtDate(event.date)} IST</time>
      <div class="fixture-teams">${names}<small>${event.venue}</small></div>
      <span class="badge">${score}</span>
    </article>
  `;
}

function renderLive() {
  const now = Date.now();
  const liveOrNext = events
    .filter((event) => event.state === "in" || new Date(event.date).getTime() >= now - 3 * 60 * 60 * 1000)
    .slice(0, 4);
  els.liveGrid.innerHTML = liveOrNext.length ? liveOrNext.map(matchCard).join("") : `<p class="empty">No live or upcoming matches found in the loaded feed.</p>`;
}

function renderFixtures() {
  const stage = els.stageFilter.value;
  const upcoming = events.filter((event) => !event.completed && (stage === "all" || stageSlug(event.stage) === stage));
  els.fixturesList.innerHTML = upcoming.length ? upcoming.map(matchRow).join("") : `<p class="empty">No upcoming fixtures match this filter.</p>`;
}

function renderResults() {
  const q = els.teamSearch.value.trim().toLowerCase();
  const completed = events
    .filter((event) => event.completed)
    .filter((event) => !q || event.teams.some((team) => team.name.toLowerCase().includes(q)))
    .reverse();
  els.resultsList.innerHTML = completed.length ? completed.map(matchRow).join("") : `<p class="empty">No completed results match this search yet.</p>`;
}

function renderStats() {
  const completed = events.filter((event) => event.completed);
  const upcoming = events.filter((event) => !event.completed);
  const goals = completed.reduce((sum, event) => sum + event.teams.reduce((total, team) => total + (Number(team.score) || 0), 0), 0);
  const teamTotals = new Map();
  const venues = new Map();
  const teams = new Map();

  events.forEach((event) => {
    venues.set(event.venue, (venues.get(event.venue) || 0) + 1);
    event.teams.forEach((team) => {
      const normalizedName = team.name.toLowerCase();
      if (!/^(tbd|tba|to be determined)$/i.test(team.name)) {
        teams.set(normalizedName, team);
      }
      if (event.completed) teamTotals.set(team.name, (teamTotals.get(team.name) || 0) + (Number(team.score) || 0));
    });
  });

  els.metricMatches.textContent = events.length || 104;
  els.metricGoals.textContent = goals || "Live";
  els.completed.textContent = completed.length;
  els.upcoming.textContent = upcoming.length;
  els.totalGoals.textContent = goals;
  els.avgGoals.textContent = completed.length ? (goals / completed.length).toFixed(2) : "0.00";

  els.teamLeaders.innerHTML = [...teamTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, total]) => `<li><strong>${name}</strong> · ${total} goals</li>`)
    .join("") || `<li>Leaders appear after completed results load.</li>`;

  els.venueList.innerHTML = [...venues.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([venue, count]) => `<li><strong>${venue}</strong> · ${count} matches</li>`)
    .join("");

  els.teamCloud.innerHTML = [...teams.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((team) => `<span class="team-chip">${team.logo ? `<img src="${team.logo}" alt="">` : ""}${team.name}</span>`)
    .join("");
}

function render() {
  renderLive();
  renderFixtures();
  renderResults();
  renderStats();
}

els.stageFilter.addEventListener("change", renderFixtures);
els.teamSearch.addEventListener("input", renderResults);
els.refresh.addEventListener("click", loadData);

events = fallbackEvents;
render();
loadData();

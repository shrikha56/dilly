const STORAGE_KEY = "dilly-state";
const DAY_MS = 24 * 60 * 60 * 1000;

function getDefaultState() {
  return {
    settings: {
      spendingThreshold: 30,
      pauseDurationSeconds: 30,
      intentionalMode: false,
      isPaused: false
    },
    stats: {
      events: []
    }
  };
}

async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = stored[STORAGE_KEY];

  return {
    settings: {
      ...getDefaultState().settings,
      ...(parsed?.settings || {})
    },
    stats: {
      events: Array.isArray(parsed?.stats?.events) ? parsed.stats.events : []
    }
  };
}

async function writeState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state
  });
}

function pruneEvents(events) {
  const cutoff = Date.now() - 120 * DAY_MS;
  return events.filter((event) => {
    return event && typeof event.timestamp === "number" && event.timestamp >= cutoff;
  });
}

function getWindowStart(days) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (days === 7) {
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    return start.getTime();
  }

  if (days === 30) {
    start.setDate(1);
    return start.getTime();
  }

  return Date.now() - days * DAY_MS;
}

function getEventKey(event, index) {
  if (event.productKey) {
    return event.productKey;
  }

  return `${event.site || "unknown"}::legacy::${index}`;
}

function getLatestTerminalOutcomes(events, startTime) {
  const latestByProduct = new Map();

  events.forEach((event, index) => {
    if (event.timestamp < startTime) {
      return;
    }

    if (event.type !== "dismissed" && event.type !== "confirmed") {
      return;
    }

    latestByProduct.set(getEventKey(event, index), event);
  });

  return Array.from(latestByProduct.values());
}

function countUniqueProducts(events, startTime) {
  const keys = new Set();

  events.forEach((event, index) => {
    if (event.timestamp < startTime) {
      return;
    }

    keys.add(getEventKey(event, index));
  });

  return keys.size;
}

function getLocalDayKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDismissedDayKeys(events) {
  const keys = new Set();

  events.forEach((event) => {
    if (event.type === "dismissed") {
      keys.add(getLocalDayKey(event.timestamp));
    }
  });

  return keys;
}

function getCurrentStreak(dayKeys) {
  const orderedKeys = Array.from(dayKeys).sort();
  if (!orderedKeys.length) {
    return 0;
  }

  let streak = 1;
  for (let index = orderedKeys.length - 1; index > 0; index -= 1) {
    const previous = new Date(`${orderedKeys[index - 1]}T00:00:00`);
    previous.setDate(previous.getDate() + 1);
    if (getLocalDayKey(previous.getTime()) === orderedKeys[index]) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function getBestStreak(dayKeys) {
  const orderedKeys = Array.from(dayKeys).sort();
  if (!orderedKeys.length) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let index = 1; index < orderedKeys.length; index += 1) {
    const previous = new Date(`${orderedKeys[index - 1]}T00:00:00`);
    const currentDate = new Date(`${orderedKeys[index]}T00:00:00`);
    previous.setDate(previous.getDate() + 1);

    if (getLocalDayKey(previous.getTime()) === getLocalDayKey(currentDate.getTime())) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

async function buildSnapshot(state) {
  const events = pruneEvents(state.stats.events);
  if (events.length !== state.stats.events.length) {
    state.stats.events = events;
    await writeState(state);
  }

  const weekStart = getWindowStart(7);
  const monthStart = getWindowStart(30);
  const latestWeeklyOutcomes = getLatestTerminalOutcomes(events, weekStart);
  const latestMonthlyOutcomes = getLatestTerminalOutcomes(events, monthStart);
  const latestAllTimeOutcomes = getLatestTerminalOutcomes(events, 0);
  const dismissedDayKeys = getDismissedDayKeys(events);

  const pausedThisWeek = latestWeeklyOutcomes.filter((event) => event.type === "dismissed").length;
  const pausedThisMonth = latestMonthlyOutcomes.filter((event) => event.type === "dismissed").length;
  const yesThisMonth = latestMonthlyOutcomes.filter((event) => event.type === "confirmed").length;
  const shownThisMonth = countUniqueProducts(events.filter((event) => event.type === "shown"), monthStart);
  const reconsideredThisMonth = countUniqueProducts(events, monthStart);
  const currentStreak = getCurrentStreak(dismissedDayKeys);
  const bestStreak = getBestStreak(dismissedDayKeys);

  return {
    settings: state.settings,
    stats: {
      pausedThisWeek,
      pausedThisMonth,
      notTodayThisMonth: pausedThisMonth,
      yesThisMonth,
      shownThisMonth,
      reconsideredThisMonth,
      currentStreak,
      bestStreak,
      summaryLine:
        pausedThisWeek > 0
          ? `You've paused ${pausedThisWeek} purchase${pausedThisWeek === 1 ? "" : "s"} this week.`
          : "Every small pause counts. You're building the habit."
    }
  };
}

async function handleMessage(message) {
  const state = await readState();

  if (message.action === "get-state") {
    return {
      ok: true,
      data: await buildSnapshot(state)
    };
  }

  if (message.action === "get-settings") {
    return {
      ok: true,
      data: state.settings
    };
  }

  if (message.action === "update-settings") {
    state.settings = {
      ...state.settings,
      ...(message.patch || {})
    };

    await writeState(state);

    return {
      ok: true,
      data: await buildSnapshot(state)
    };
  }

  if (message.action === "clear-stats") {
    state.stats.events = [];
    await writeState(state);

    return {
      ok: true,
      data: await buildSnapshot(state)
    };
  }

  if (message.action === "record-event") {
    const nextEvent = {
      type: message.eventType,
      site: message.site || "",
      productKey: message.productKey || "",
      price: typeof message.price === "number" ? message.price : null,
      timestamp: Date.now()
    };

    state.stats.events = pruneEvents(state.stats.events);
    state.stats.events.push(nextEvent);
    await writeState(state);

    return {
      ok: true,
      data: await buildSnapshot(state)
    };
  }

  return {
    ok: false,
    error: "Unknown action."
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  const forwardableActions = new Set([
    "get-state",
    "get-settings",
    "update-settings",
    "record-event",
    "clear-stats"
  ]);

  if (!forwardableActions.has(message.action)) {
    return false;
  }

  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

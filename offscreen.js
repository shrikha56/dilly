const STORAGE_KEY = "dilly-state";
const DAY_MS = 24 * 60 * 60 * 1000;

function getDefaultState() {
  return {
    settings: {
      spendingThreshold: 30,
      pauseDurationSeconds: 30,
      intentionalMode: false,
      isPaused: false,
      userGoal: "",
      userName: "",
      goalPromptDismissed: false,
      goalSetAt: null,
      motivationPhotoDataUrl: null
    },
    stats: {
      events: []
    }
  };
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      settings: {
        ...getDefaultState().settings,
        ...(parsed.settings || {})
      },
      stats: {
        events: Array.isArray(parsed?.stats?.events) ? parsed.stats.events : []
      }
    };
  } catch (error) {
    return getDefaultState();
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function countEvents(events, type, startTime) {
  return events.filter((event) => event.type === type && event.timestamp >= startTime).length;
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

function buildSnapshot(state) {
  const events = pruneEvents(state.stats.events);
  if (events.length !== state.stats.events.length) {
    state.stats.events = events;
    writeState(state);
  }

  const weekStart = getWindowStart(7);
  const monthStart = getWindowStart(30);
  const latestWeeklyOutcomes = getLatestTerminalOutcomes(events, weekStart);
  const latestMonthlyOutcomes = getLatestTerminalOutcomes(events, monthStart);

  const pausedThisWeek = latestWeeklyOutcomes.filter((event) => event.type === "dismissed").length;
  const pausedThisMonth = latestMonthlyOutcomes.filter((event) => event.type === "dismissed").length;
  const yesThisMonth = latestMonthlyOutcomes.filter((event) => event.type === "confirmed").length;
  const shownThisMonth = countUniqueProducts(events.filter((event) => event.type === "shown"), monthStart);
  const reconsideredThisMonth = countUniqueProducts(events, monthStart);

  return {
    settings: state.settings,
    stats: {
      pausedThisWeek,
      pausedThisMonth,
      notTodayThisMonth: pausedThisMonth,
      yesThisMonth,
      shownThisMonth,
      reconsideredThisMonth,
      summaryLine:
        pausedThisWeek > 0
          ? `You've paused ${pausedThisWeek} purchase${pausedThisWeek === 1 ? "" : "s"} this week.`
          : "Every small pause counts. You're building the habit."
    }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "dilly-offscreen") {
    return false;
  }

  try {
    const state = readState();

    if (message.action === "get-state") {
      sendResponse({
        ok: true,
        data: buildSnapshot(state)
      });
      return false;
    }

    if (message.action === "get-settings") {
      sendResponse({
        ok: true,
        data: state.settings
      });
      return false;
    }

    if (message.action === "update-settings") {
      state.settings = {
        ...state.settings,
        ...(message.patch || {})
      };
      writeState(state);
      sendResponse({
        ok: true,
        data: buildSnapshot(state)
      });
      return false;
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
      writeState(state);

      sendResponse({
        ok: true,
        data: buildSnapshot(state)
      });
      return false;
    }

    sendResponse({
      ok: false,
      error: "Unknown action."
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return false;
});

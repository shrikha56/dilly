const elements = {
  intentionalMode: document.getElementById("intentionalMode"),
  spendingThreshold: document.getElementById("spendingThreshold"),
  pauseDurationOptions: document.getElementById("pauseDurationOptions"),
  isPaused: document.getElementById("isPaused"),
  thresholdNote: document.getElementById("thresholdNote"),
  pausedThisWeek: document.getElementById("pausedThisWeek"),
  notTodayThisMonth: document.getElementById("notTodayThisMonth"),
  yesThisMonth: document.getElementById("yesThisMonth"),
  currentStreak: document.getElementById("currentStreak"),
  bestStreak: document.getElementById("bestStreak"),
  summaryLine: document.getElementById("summaryLine")
};
const STORAGE_KEY = "dilly-state";

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function formatDayKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeLocalStats(events) {
  const now = new Date();

  const weekDate = new Date(now);
  weekDate.setHours(0, 0, 0, 0);
  weekDate.setDate(weekDate.getDate() - ((weekDate.getDay() + 6) % 7));
  const weekStart = weekDate.getTime();

  const monthDate = new Date(now);
  monthDate.setDate(1);
  monthDate.setHours(0, 0, 0, 0);
  const monthStart = monthDate.getTime();

  const weekOutcomes = new Map();
  const monthOutcomes = new Map();

  for (const ev of events) {
    if (ev.type !== "dismissed" && ev.type !== "confirmed") {
      continue;
    }
    const key = ev.productKey || `${ev.site || "unknown"}::${ev.timestamp}`;
    if (ev.timestamp >= weekStart) {
      weekOutcomes.set(key, ev);
    }
    if (ev.timestamp >= monthStart) {
      monthOutcomes.set(key, ev);
    }
  }

  let pausedThisWeek = 0;
  for (const ev of weekOutcomes.values()) {
    if (ev.type === "dismissed") {
      pausedThisWeek += 1;
    }
  }

  let notTodayThisMonth = 0;
  let yesThisMonth = 0;
  for (const ev of monthOutcomes.values()) {
    if (ev.type === "dismissed") {
      notTodayThisMonth += 1;
    }
    if (ev.type === "confirmed") {
      yesThisMonth += 1;
    }
  }

  const dismissedDays = new Set();
  for (const ev of events) {
    if (ev.type === "dismissed") {
      dismissedDays.add(formatDayKey(ev.timestamp));
    }
  }

  const sorted = Array.from(dismissedDays).sort();
  let currentStreak = sorted.length ? 1 : 0;
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    prev.setDate(prev.getDate() + 1);
    if (formatDayKey(prev.getTime()) === sorted[i]) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  let bestStreak = sorted.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    prev.setDate(prev.getDate() + 1);
    if (formatDayKey(prev.getTime()) === sorted[i]) {
      run += 1;
      if (run > bestStreak) {
        bestStreak = run;
      }
    } else {
      run = 1;
    }
  }

  return {
    pausedThisWeek,
    notTodayThisMonth,
    yesThisMonth,
    currentStreak,
    bestStreak,
    summaryLine:
      pausedThisWeek > 0
        ? `You've paused ${pausedThisWeek} purchase${pausedThisWeek === 1 ? "" : "s"} this week.`
        : "Every small pause counts. You're building the habit."
  };
}

async function getState() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await sendMessage({ action: "get-state" });
      if (response?.ok) {
        return response.data;
      }
    } catch (error) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = stored?.[STORAGE_KEY] || {};
  const settings = {
    spendingThreshold: 30,
    pauseDurationSeconds: 30,
    intentionalMode: false,
    isPaused: false,
    ...(parsed.settings || {})
  };
  const events = Array.isArray(parsed?.stats?.events) ? parsed.stats.events : [];

  return {
    settings,
    stats: computeLocalStats(events)
  };
}

async function updateSettings(patch) {
  const response = await sendMessage({
    action: "update-settings",
    patch
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not save Dilly settings.");
  }

  return response.data;
}

async function fallbackUpdateSettings(patch) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = stored?.[STORAGE_KEY] || {};
  const next = {
    settings: {
      spendingThreshold: 30,
      pauseDurationSeconds: 30,
      intentionalMode: false,
      isPaused: false,
      ...(parsed.settings || {}),
      ...patch
    },
    stats: parsed.stats || { events: [] }
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  const events = Array.isArray(next.stats?.events) ? next.stats.events : [];
  return {
    settings: next.settings,
    stats: computeLocalStats(events)
  };
}

function renderState(state) {
  const { settings, stats } = state;
  const pauseDurationSeconds = Math.max(10, Number(settings.pauseDurationSeconds) || 30);

  elements.intentionalMode.checked = Boolean(settings.intentionalMode);
  elements.isPaused.checked = Boolean(settings.isPaused);
  elements.spendingThreshold.value = Math.max(0, Number(settings.spendingThreshold) || 0);
  elements.spendingThreshold.disabled = Boolean(settings.intentionalMode);
  Array.from(elements.pauseDurationOptions.querySelectorAll("[data-seconds]")).forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.seconds) === pauseDurationSeconds);
  });

  elements.thresholdNote.textContent = settings.intentionalMode
    ? "Intentional Mode is on, so Dilly will pause every add to cart."
    : `Dilly will only step in when the detected item price is above $${Math.max(
        0,
        Number(settings.spendingThreshold) || 0
      )}.`;

  elements.pausedThisWeek.textContent = String(stats.pausedThisWeek || 0);
  elements.notTodayThisMonth.textContent = String(stats.notTodayThisMonth || 0);
  elements.yesThisMonth.textContent = String(stats.yesThisMonth || 0);
  elements.currentStreak.textContent = String(stats.currentStreak || 0);
  elements.bestStreak.textContent = String(stats.bestStreak || 0);
  elements.summaryLine.textContent = stats.summaryLine || "Your cart will still be here tomorrow.";
}

async function saveAndRender(patch) {
  try {
    const state = await updateSettings(patch);
    renderState(state);
  } catch (error) {
    try {
      const fallback = await fallbackUpdateSettings(patch);
      renderState(fallback);
    } catch (fallbackError) {
      elements.summaryLine.textContent = "Dilly couldn't save that change just now.";
    }
  }
}

async function bootstrap() {
  try {
    const state = await getState();
    renderState(state);
  } catch (error) {
    elements.summaryLine.textContent = "Dilly couldn't load right now.";
  }
}

elements.intentionalMode.addEventListener("change", async (event) => {
  await saveAndRender({
    intentionalMode: event.target.checked
  });
});

elements.isPaused.addEventListener("change", async (event) => {
  await saveAndRender({
    isPaused: event.target.checked
  });
});

elements.spendingThreshold.addEventListener("change", async (event) => {
  const nextValue = Math.max(0, Number(event.target.value) || 0);
  await saveAndRender({
    spendingThreshold: nextValue
  });
});

elements.pauseDurationOptions.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-seconds]");
  if (!button) {
    return;
  }

  await saveAndRender({
    pauseDurationSeconds: Math.max(10, Number(button.dataset.seconds) || 30)
  });
});

bootstrap();

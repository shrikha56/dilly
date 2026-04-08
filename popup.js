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
  summaryLine: document.getElementById("summaryLine"),
  goalBlockFull: document.getElementById("goalBlockFull"),
  goalBlockCompact: document.getElementById("goalBlockCompact"),
  goalBlockSet: document.getElementById("goalBlockSet"),
  goalEditor: document.getElementById("goalEditor"),
  goalEditorTitle: document.getElementById("goalEditorTitle"),
  userGoalInput: document.getElementById("userGoalInput"),
  userGoalDisplay: document.getElementById("userGoalDisplay"),
  userGoalEditInput: document.getElementById("userGoalEditInput"),
  saveGoalBtn: document.getElementById("saveGoalBtn"),
  skipGoalBtn: document.getElementById("skipGoalBtn"),
  openGoalEditorBtn: document.getElementById("openGoalEditorBtn"),
  editGoalBtn: document.getElementById("editGoalBtn"),
  confirmGoalEditBtn: document.getElementById("confirmGoalEditBtn"),
  cancelGoalEditBtn: document.getElementById("cancelGoalEditBtn"),
  goalProgressSection: document.getElementById("goalProgressSection"),
  goalProgressNotToday: document.getElementById("goalProgressNotToday"),
  goalProgressDays: document.getElementById("goalProgressDays"),
  goalProgressYes: document.getElementById("goalProgressYes"),
  goalProgressHint: document.getElementById("goalProgressHint"),
  motivationPhotoInput: document.getElementById("motivationPhotoInput"),
  motivationPhotoPreview: document.getElementById("motivationPhotoPreview"),
  motivationPhotoEmpty: document.getElementById("motivationPhotoEmpty"),
  removeMotivationPhotoBtn: document.getElementById("removeMotivationPhotoBtn"),
  userNameInput: document.getElementById("userNameInput"),
  userNameDisplay: document.getElementById("userNameDisplay"),
  editNameBtn: document.getElementById("editNameBtn")
};

const MAX_PHOTO_DATA_URL_CHARS = 420000;

function normalizeUserName(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

let userNameSaveTimer = null;
let lastRenderedUserName = "";
let nameEditing = false;

function scheduleUserNameSave() {
  if (!elements.userNameInput) {
    return;
  }
  window.clearTimeout(userNameSaveTimer);
  userNameSaveTimer = window.setTimeout(async () => {
    userNameSaveTimer = null;
    const next = normalizeUserName(elements.userNameInput.value);
    if (next === lastRenderedUserName) {
      return;
    }
    await saveAndRender({ userName: next });
  }, 400);
}

function compressImageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 400;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error("bad_image"));
          return;
        }
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("bad_image"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.88;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > MAX_PHOTO_DATA_URL_CHARS && quality > 0.42) {
          quality -= 0.06;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > MAX_PHOTO_DATA_URL_CHARS) {
          reject(new Error("too_large"));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("bad_image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

function renderMotivationPhoto(settings) {
  const url = settings.motivationPhotoDataUrl && String(settings.motivationPhotoDataUrl).trim();
  const isDataImage = Boolean(url && /^data:image\//i.test(url));

  if (url && !isDataImage) {
    saveAndRender({ motivationPhotoDataUrl: null }).catch(() => {});
  }

  if (elements.motivationPhotoPreview) {
    elements.motivationPhotoPreview.onerror = null;
  }

  if (url && isDataImage && elements.motivationPhotoPreview) {
    elements.motivationPhotoPreview.onerror = function handleBadPhoto() {
      this.onerror = null;
      this.removeAttribute("src");
      this.hidden = true;
      if (elements.motivationPhotoEmpty) {
        elements.motivationPhotoEmpty.hidden = false;
      }
      if (elements.removeMotivationPhotoBtn) {
        elements.removeMotivationPhotoBtn.hidden = true;
      }
      saveAndRender({ motivationPhotoDataUrl: null }).catch(() => {});
    };
    elements.motivationPhotoPreview.src = url;
    elements.motivationPhotoPreview.hidden = false;
    if (elements.motivationPhotoEmpty) {
      elements.motivationPhotoEmpty.hidden = true;
    }
    if (elements.removeMotivationPhotoBtn) {
      elements.removeMotivationPhotoBtn.hidden = false;
    }
  } else if (elements.motivationPhotoPreview) {
    elements.motivationPhotoPreview.removeAttribute("src");
    elements.motivationPhotoPreview.hidden = true;
    if (elements.motivationPhotoEmpty) {
      elements.motivationPhotoEmpty.hidden = false;
    }
    if (elements.removeMotivationPhotoBtn) {
      elements.removeMotivationPhotoBtn.hidden = true;
    }
  }
}

let goalEditorOpen = false;
const STORAGE_KEY = "dilly-state";

function buildGoalSavePatch(nextTrimmed, previousSettings) {
  const patch = {
    userGoal: nextTrimmed,
    goalPromptDismissed: true
  };
  if (!nextTrimmed) {
    patch.goalSetAt = null;
    return patch;
  }
  const prev = String(previousSettings.userGoal || "").trim();
  if (prev !== nextTrimmed) {
    patch.goalSetAt = Date.now();
  }
  return patch;
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function formatDayKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeLocalStats(events, settings) {
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

  const goalProgress =
    settings && typeof globalThis.dillyComputeGoalProgress === "function"
      ? globalThis.dillyComputeGoalProgress(events, settings)
      : null;

  return {
    pausedThisWeek,
    notTodayThisMonth,
    yesThisMonth,
    currentStreak,
    bestStreak,
    goalProgress,
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
    userGoal: "",
    userName: "",
    goalPromptDismissed: false,
    goalSetAt: null,
    motivationPhotoDataUrl: null,
    ...(parsed.settings || {})
  };
  const events = Array.isArray(parsed?.stats?.events) ? parsed.stats.events : [];

  return {
    settings,
    stats: computeLocalStats(events, settings)
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
      userGoal: "",
      userName: "",
      goalPromptDismissed: false,
      goalSetAt: null,
      motivationPhotoDataUrl: null,
      ...(parsed.settings || {}),
      ...patch
    },
    stats: parsed.stats || { events: [] }
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  const events = Array.isArray(next.stats?.events) ? next.stats.events : [];
  return {
    settings: next.settings,
    stats: computeLocalStats(events, next.settings)
  };
}

function renderGoalUI(settings) {
  const goal = String(settings.userGoal || "").trim();
  const dismissed = Boolean(settings.goalPromptDismissed);

  elements.goalBlockFull.hidden = true;
  elements.goalBlockCompact.hidden = true;
  elements.goalBlockSet.hidden = true;
  elements.goalEditor.hidden = true;

  if (goalEditorOpen) {
    elements.goalEditor.hidden = false;
    elements.goalEditorTitle.textContent = goal ? "Edit" : "Add";
    elements.userGoalEditInput.value = settings.userGoal || "";
    return;
  }

  if (goal) {
    elements.goalBlockSet.hidden = false;
    elements.userGoalDisplay.textContent = goal;
    return;
  }

  if (!dismissed) {
    elements.goalBlockFull.hidden = false;
    elements.userGoalInput.value = settings.userGoal || "";
    return;
  }

  elements.goalBlockCompact.hidden = false;
}

function renderState(state) {
  const { settings, stats } = state;
  const pauseDurationSeconds = Math.max(10, Number(settings.pauseDurationSeconds) || 30);

  renderGoalUI(settings);
  renderMotivationPhoto(settings);

  if (elements.userNameInput) {
    const v = normalizeUserName(settings.userName || "");
    elements.userNameInput.value = v;
    lastRenderedUserName = v;
    if (v && !nameEditing) {
      elements.userNameDisplay.textContent = v;
      elements.userNameDisplay.hidden = false;
      elements.userNameInput.hidden = true;
      elements.editNameBtn.hidden = false;
    } else {
      elements.userNameDisplay.hidden = true;
      elements.userNameInput.hidden = false;
      elements.editNameBtn.hidden = true;
    }
  }

  elements.intentionalMode.checked = Boolean(settings.intentionalMode);
  elements.spendingThreshold.value = Math.max(0, Number(settings.spendingThreshold) || 0);
  elements.spendingThreshold.disabled = Boolean(settings.intentionalMode);
  Array.from(elements.pauseDurationOptions.querySelectorAll("[data-seconds]")).forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.seconds) === pauseDurationSeconds);
  });

  document.querySelectorAll(".dilly-seg-btn").forEach((btn) => {
    const isEvery = btn.dataset.mode === "every";
    btn.classList.toggle("is-active", isEvery ? Boolean(settings.intentionalMode) : !Boolean(settings.intentionalMode));
  });

  const thresholdRow = document.getElementById("thresholdRow");
  if (thresholdRow) {
    thresholdRow.hidden = Boolean(settings.intentionalMode);
  }

  if (elements.thresholdNote) {
    elements.thresholdNote.textContent = settings.intentionalMode
      ? ""
      : `Dilly will pause you on items over $${Math.max(0, Number(settings.spendingThreshold) || 0)}.`;
  }

  elements.pausedThisWeek.textContent = String(stats.pausedThisWeek || 0);
  elements.notTodayThisMonth.textContent = String(stats.notTodayThisMonth || 0);
  elements.yesThisMonth.textContent = String(stats.yesThisMonth || 0);
  elements.currentStreak.textContent = String(stats.currentStreak || 0);
  elements.bestStreak.textContent = String(stats.bestStreak || 0);
  elements.summaryLine.textContent = stats.summaryLine || "Your cart will still be here tomorrow.";

  const gp = stats.goalProgress;
  const goalText = String(settings.userGoal || "").trim();
  if (gp && goalText && elements.goalProgressSection) {
    elements.goalProgressSection.hidden = false;
    elements.goalProgressNotToday.textContent = String(gp.notTodayCount ?? 0);
    elements.goalProgressDays.textContent = String(gp.activeDays ?? 0);
    elements.goalProgressYes.textContent = String(gp.yesAfterPauseCount ?? 0);
    if (elements.goalProgressHint) {
      elements.goalProgressHint.textContent =
        gp.since > 0 ? "Since your last goal edit." : "Includes older pauses. Edit goal to reset.";
    }
  } else if (elements.goalProgressSection) {
    elements.goalProgressSection.hidden = true;
  }
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
    // silent
  }
}

function flushUserNameOnClose() {
  window.clearTimeout(userNameSaveTimer);
  userNameSaveTimer = null;
  const el = elements.userNameInput;
  if (!el) {
    return;
  }
  const next = normalizeUserName(el.value);
  if (next === lastRenderedUserName) {
    return;
  }
  lastRenderedUserName = next;
  try {
    chrome.runtime.sendMessage({ action: "update-settings", patch: { userName: next } });
  } catch (_) {}
}

if (elements.userNameInput) {
  elements.userNameInput.addEventListener("input", () => {
    const next = normalizeUserName(elements.userNameInput.value);
    try {
      chrome.runtime.sendMessage({ action: "update-settings", patch: { userName: next } });
    } catch (_) {}
    scheduleUserNameSave();
  });
  elements.userNameInput.addEventListener("blur", () => {
    const v = normalizeUserName(elements.userNameInput.value);
    if (v) {
      nameEditing = false;
      getState().then((state) => renderState(state));
    }
  });
}

if (elements.editNameBtn) {
  elements.editNameBtn.addEventListener("click", () => {
    nameEditing = true;
    elements.userNameDisplay.hidden = true;
    elements.userNameInput.hidden = false;
    elements.editNameBtn.hidden = true;
    elements.userNameInput.focus();
  });
}
window.addEventListener("pagehide", flushUserNameOnClose);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushUserNameOnClose();
  }
});

elements.intentionalMode.addEventListener("change", async (event) => {
  await saveAndRender({
    intentionalMode: event.target.checked
  });
});

document.querySelectorAll(".dilly-seg-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    await saveAndRender({ intentionalMode: mode === "every" });
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

elements.saveGoalBtn.addEventListener("click", async () => {
  const raw = elements.userGoalInput.value || "";
  const trimmed = raw.trim();
  if (!trimmed) {
    elements.summaryLine.textContent = "Add a few words for your goal, or tap Skip for now.";
    return;
  }
  goalEditorOpen = false;
  try {
    const state = await getState();
    await saveAndRender(buildGoalSavePatch(trimmed, state.settings));
  } catch (error) {
    await saveAndRender(buildGoalSavePatch(trimmed, {}));
  }
});

elements.skipGoalBtn.addEventListener("click", async () => {
  goalEditorOpen = false;
  await saveAndRender({
    goalPromptDismissed: true
  });
});

elements.openGoalEditorBtn.addEventListener("click", () => {
  goalEditorOpen = true;
  getState().then((state) => renderState(state));
});

elements.editGoalBtn.addEventListener("click", () => {
  goalEditorOpen = true;
  getState().then((state) => renderState(state));
});

elements.confirmGoalEditBtn.addEventListener("click", async () => {
  const trimmed = String(elements.userGoalEditInput.value || "").trim();
  goalEditorOpen = false;
  try {
    const state = await getState();
    await saveAndRender(buildGoalSavePatch(trimmed, state.settings));
  } catch (error) {
    await saveAndRender(buildGoalSavePatch(trimmed, {}));
  }
});

elements.cancelGoalEditBtn.addEventListener("click", async () => {
  goalEditorOpen = false;
  try {
    const state = await getState();
    renderState(state);
  } catch (error) {
    // silent
  }
});

elements.motivationPhotoInput.addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file || !file.type.startsWith("image/")) {
    return;
  }
  try {
    const dataUrl = await compressImageFileToDataUrl(file);
    await saveAndRender({ motivationPhotoDataUrl: dataUrl });
  } catch (error) {
    const err = error && error.message;
    elements.summaryLine.textContent =
      err === "too_large" ? "That photo is too large. Try a smaller image." : "Could not use that photo.";
  }
});

elements.removeMotivationPhotoBtn.addEventListener("click", async () => {
  await saveAndRender({ motivationPhotoDataUrl: null });
});

bootstrap();

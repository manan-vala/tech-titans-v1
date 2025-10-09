// overlay.js - overlay + debounced API suggestion logic (replaces clock)
// Shows suggestions (default "suggestions") in an overlay 10px above
// 'footer div[tabindex="-1"]' and toggles on/off via chrome.storage or messages.

const OVERLAY_ID = "whatsapp-api-overlay";
const FOOTER_SELECTOR = 'footer div[tabindex="-1"]';
const DEBOUNCE_MS = 500; // wait after typing stops
const COOLDOWN_MS = 2000; // minimum gap between API calls

let debounceTimer = null;
let cooldownTimer = null;
let lastApiCallTime = 0;
let inFlight = false;
let pendingText = null;
let listenerAttached = false;
let pollingHandle = null;
let mutationObserver = null;

console.log("Overlay + suggestions script loaded");

// ---------- Overlay UI ----------
function createOverlay() {
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = OVERLAY_ID;
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "2147483647",
    background: "rgba(0,0,0,0.78)",
    color: "white",
    padding: "10px 14px",
    borderRadius: "15px",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "16px",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    maxWidth: "380px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
    transition: "opacity 120ms ease",
    opacity: "1",
  });
  el.textContent = "suggestions"; // default text
  document.documentElement.appendChild(el);
  return el;
}

function showOverlayText(text) {
  const el = createOverlay();
  el.style.opacity = "1";
  el.textContent = text || "suggestions";
  positionOverlay();
}

function showLoading() {
  showOverlayText("Loading…");
}

function showError(msg) {
  showOverlayText("Error: " + (msg || "request failed"));
}

function removeOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  if (pollingHandle) {
    clearInterval(pollingHandle);
    pollingHandle = null;
  }
  console.log("Overlay removed");
}

// ---------- Positioning ----------
function positionOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;
  const target = document.querySelector(FOOTER_SELECTOR);
  if (!target) {
    // fallback: top-right
    el.style.left = `${Math.max(
      window.innerWidth - el.offsetWidth - 12,
      12
    )}px`;
    el.style.top = `12px`;
    return;
  }
  const rect = target.getBoundingClientRect();
  const overlayWidth = el.offsetWidth;
  let left = rect.left;
  left = Math.min(Math.max(left, 6), window.innerWidth - overlayWidth - 6);
  let top = rect.top - el.offsetHeight - 10; // 10px above
  if (top < 6) top = 6;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

// ---------- API call (fetch) ----------
async function callOpenAIResponse(prompt) {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);

  if (!apiKey) throw new Error("API key not found");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      input: prompt,
    }),
  });

  const data = await response.json();

  // The unified Responses API puts output text here:
  const text = data.output?.[0]?.content?.[0]?.text || "";
  console.log("Response:", text);

  return text;
}

async function doFetchApi(text) {
  // Note: fetch from content script may be blocked by CORS if server doesn't allow it.
  const prompt = `You are an AI assistant that predicts what a user is trying to type. Given an incomplete message, provide only one concise and natural suggestion with the fully completed message.\n\nUser Text:\n${text}`;
  const response = await callOpenAIResponse(prompt);
  return response;
}

// attemptSend handles cooldown/in-flight/pending logic and actually calls the API
async function attemptSend(text) {
  // clear pending because we're handling it now (or scheduling)
  pendingText = null;
  const now = Date.now();
  const elapsed = now - lastApiCallTime;

  if (inFlight) {
    // request ongoing, remember latest text to send later
    pendingText = text;
    return;
  }

  if (elapsed < COOLDOWN_MS) {
    // in cooldown — schedule a trailing send with latest text
    pendingText = text;
    if (!cooldownTimer) {
      const wait = COOLDOWN_MS - elapsed;
      cooldownTimer = setTimeout(() => {
        cooldownTimer = null;
        if (pendingText) attemptSend(pendingText);
      }, wait);
    }
    return;
  }

  // send now
  inFlight = true;
  lastApiCallTime = Date.now();
  showLoading();
  console.log("Sending API request:", text);
  try {
    const data = await doFetchApi(text);
    // choose display format (string or JSON)
    const display =
      typeof data === "string" ? data : JSON.stringify(data, null, 2);
    // const display = data;
    console.log(`display : ${display.suggestion}`);
    showOverlayText(display);
    console.log("API response received");
  } catch (err) {
    console.error("API request failed:", err);
    showError(err.message || "request failed");
  } finally {
    inFlight = false;
    // If we have pending text, schedule attempt respecting cooldown
    if (pendingText) {
      const remaining = Math.max(
        0,
        COOLDOWN_MS - (Date.now() - lastApiCallTime)
      );
      setTimeout(() => {
        if (pendingText) attemptSend(pendingText);
      }, remaining);
    }
  }
}

// schedule call after debounce
function scheduleApiCall(text) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    attemptSend(text);
  }, DEBOUNCE_MS);
}

// ---------- Input detection & listener ----------
const INPUT_SELECTORS_TO_TRY = [
  'div[aria-placeholder="Type a message"][contenteditable="true"]',
  'div[contenteditable="true"][data-tab]', // common whatsapp selector
  'div[aria-label="Type a message"]',
  'div[role="textbox"][contenteditable="true"]',
];

function findInputElement() {
  for (const sel of INPUT_SELECTORS_TO_TRY) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function getInputTextFromTarget(target) {
  if (!target) return "";
  if (target.isContentEditable) return target.innerText.trim();
  if ("value" in target) return target.value.trim();
  return target.textContent ? target.textContent.trim() : "";
}

function attachInputListenerOnce() {
  if (listenerAttached) return;
  const input = findInputElement();
  if (!input) {
    // poll for the input for a short while (SPA load)
    if (!pollingHandle) {
      pollingHandle = setInterval(() => {
        const el = findInputElement();
        if (el) {
          clearInterval(pollingHandle);
          pollingHandle = null;
          attachInputListenerOnce();
        }
      }, 600);
      // stop polling after 30s
      setTimeout(() => {
        if (pollingHandle) {
          clearInterval(pollingHandle);
          pollingHandle = null;
        }
      }, 30000);
    }
    return;
  }

  // Attach listener
  input.addEventListener("input", (e) => {
    const text = getInputTextFromTarget(e.target);
    if (!text) {
      // when empty, optionally clear overlay or show default
      showOverlayText("suggestions");
      return;
    }
    scheduleApiCall(text);
  });

  // Keep overlay positioned
  window.addEventListener("scroll", positionOverlay, { passive: true });
  window.addEventListener("resize", positionOverlay);

  // Observe DOM changes to reposition if needed
  mutationObserver = new MutationObserver(() => {
    positionOverlay();
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  listenerAttached = true;
  console.log("Input listener attached");
  createOverlay(); // ensure overlay exists
  positionOverlay();
}

// ---------- Enable / Disable control ----------
function enableOverlayFlow() {
  console.log("enableOverlay called");
  // attach the input listener (it handles polling for element)
  attachInputListenerOnce();
  // show default overlay initially
  showOverlayText("suggestions");
}

function disableOverlayFlow() {
  console.log("disableOverlay called");
  // cleanup UI and timers
  removeOverlay();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (cooldownTimer) {
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
  inFlight = false;
  pendingText = null;
  listenerAttached = false;
  // remove listeners we added (scroll/resize)
  try {
    window.removeEventListener("scroll", positionOverlay);
    window.removeEventListener("resize", positionOverlay);
  } catch (e) {}
}

// ---------- Storage + Message integration ----------
chrome.storage.local.get({ overlayEnabled: false }, (res) => {
  console.log("Initial storage overlayEnabled =", res.overlayEnabled);
  if (res.overlayEnabled) enableOverlayFlow();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("overlayEnabled" in changes) {
    console.log(
      "storage.onChanged overlayEnabled ->",
      changes.overlayEnabled.newValue
    );
    if (changes.overlayEnabled.newValue) enableOverlayFlow();
    else disableOverlayFlow();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== "overlay-toggle") return;
  console.log("Received overlay-toggle message:", msg.enabled);
  if (msg.enabled) enableOverlayFlow();
  else disableOverlayFlow();
});

// Start: don't auto-enable here — respect storage/messages. (storage handler above will enable if needed)

// ---------- Copy-to-clipboard utility & handlers ----------

async function fallbackCopyTextToClipboard(text) {
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      // Make textarea out of view
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) resolve();
      else reject(new Error("execCommand copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

async function copyTextToClipboard(text) {
  if (!text) throw new Error("No text to copy");
  // prefer navigator.clipboard
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    // fallthrough to fallback below
    console.warn("navigator.clipboard.writeText failed, falling back:", err);
  }
  // fallback
  await fallbackCopyTextToClipboard(text);
}

function showTransientStatus(msg, ms = 1400) {
  let statusEl = document.getElementById(OVERLAY_ID + "-status");
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = OVERLAY_ID + "-status";
    Object.assign(statusEl.style, {
      position: "fixed",
      zIndex: "2147483648",
      padding: "6px 10px",
      borderRadius: "10px",
      fontSize: "13px",
      fontFamily: "Arial, Helvetica, sans-serif",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.85)",
      color: "white",
      transition: "opacity 120ms ease",
      opacity: "0",
    });
    document.documentElement.appendChild(statusEl);
  }
  statusEl.textContent = msg;
  // position near overlay if overlay exists
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    const rect = overlay.getBoundingClientRect();
    statusEl.style.left = `${Math.min(
      Math.max(rect.left, 6),
      window.innerWidth - 120
    )}px`;
    statusEl.style.top = `${rect.top - 34}px`;
  } else {
    statusEl.style.left = `12px`;
    statusEl.style.top = `12px`;
  }
  statusEl.style.opacity = "1";
  clearTimeout(statusEl._hideTimeout);
  statusEl._hideTimeout = setTimeout(() => {
    statusEl.style.opacity = "0";
  }, ms);
}

async function copyOverlayText() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    showTransientStatus("No overlay to copy");
    return;
  }
  const text = overlay.innerText?.trim();
  if (!text) {
    showTransientStatus("Nothing to copy");
    return;
  }
  try {
    await copyTextToClipboard(text);
    showTransientStatus("Copied!");
  } catch (err) {
    console.error("Copy failed:", err);
    showTransientStatus("Copy failed");
  }
}

// keyboard fallback inside page (works when page has focus)
window.addEventListener("keydown", (e) => {
  // Use code to avoid locale differences; check ctrlKey/shiftKey for cross-platform
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (isCtrlOrCmd && e.shiftKey && e.code === "KeyY") {
    // Prevent website default handlers (where reasonable)
    try {
      e.preventDefault();
    } catch (err) {}
    copyOverlayText();
  }
});

// chrome runtime message handler: also handle copyOverlay
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "overlay-toggle") {
    // existing behavior
    if (msg.enabled) enableOverlayFlow();
    else disableOverlayFlow();
    return;
  }
  if (msg.action === "copyOverlay") {
    copyOverlayText()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    // indicate async response
    return true;
  }
});

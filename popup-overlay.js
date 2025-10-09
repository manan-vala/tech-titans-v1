// popup-overlay.js (improved)
const btn = document.getElementById("overlayBtn");

// Update button text according to storage
function updateButtonText(enabled) {
  btn.textContent = enabled ? "Turn OFF" : "Click Me";
}

// Initialize button state from storage
chrome.storage.local.get({ overlayEnabled: false }, (data) => {
  console.log("Initial overlayEnabled =", data.overlayEnabled);
  updateButtonText(data.overlayEnabled);
});

// Click handler toggles storage state
btn.addEventListener("click", () => {
  chrome.storage.local.get({ overlayEnabled: false }, (data) => {
    const newState = !data.overlayEnabled;
    chrome.storage.local.set({ overlayEnabled: newState }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error setting storage:", chrome.runtime.lastError);
      } else {
        console.log("overlayEnabled toggled ->", newState);
        // No need to update button text here — storage.onChanged listener handles it
      }
    });
  });
});

// Listen for storage changes and update button text
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("overlayEnabled" in changes) {
    const newVal = changes.overlayEnabled.newValue;
    console.log("storage change detected overlayEnabled ->", newVal);
    updateButtonText(newVal);
  }
});

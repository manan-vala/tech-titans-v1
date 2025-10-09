const form = document.getElementById("keyForm");
const status = document.getElementById("status");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const key = document.getElementById("apiKey").value.trim();
  if (!key) {
    status.textContent = "Please enter a valid key.";
    return;
  }

  // Save securely to chrome.storage.local
  chrome.storage.local.set({ apiKey: key }, () => {
    status.textContent = "API key saved! You can close this tab.";
    // Optionally navigate to options or the extension popup:
    // chrome.runtime.openOptionsPage();
  });
});

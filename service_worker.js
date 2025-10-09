// Listen for install and open onboarding page
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("onboard/onboard.html"),
    });
  }
});

// service_worker.js

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-overlay") {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "copyOverlay" },
          (resp) => {
            // optional: handle response or lastError
            if (chrome.runtime.lastError) {
              console.warn(
                "Could not send message to tab:",
                chrome.runtime.lastError.message
              );
            }
          }
        );
      }
    } catch (err) {
      console.error("Error handling copy-overlay command:", err);
    }
  }
});

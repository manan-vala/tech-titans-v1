const fetchBtn = document.getElementById("fetchBtn");
const status = document.getElementById("status");
const fetchedWrap = document.getElementById("fetchedWrap");
const resultDiv = document.getElementById("result");
const formalizeBtn = document.getElementById("formalizeBtn");
const formalizedWrap = document.getElementById("formalizedWrap");
const formalizedDiv = document.getElementById("formalized");
const casualizeBtn = document.getElementById("casualizeBtn");
const casualizedWrap = document.getElementById("casualizedWrap");
const casualizedDiv = document.getElementById("casualized");
const copyBtn = document.getElementById("copyBtn");
const copyFormalBtn = document.getElementById("copyFormalBtn");
const copyCasualBtn = document.getElementById("copyCasualBtn");
const insertBtnFormal = document.getElementById("insertBtnFormal");
const insertBtnCasual = document.getElementById("insertBtnCasual");
const errorDiv = document.getElementById("error");

// const SERVER_URL = "http://localhost:8080/api";

async function ensureContentScript(tabId) {
  // ensure content.js is injected (safe to call multiple times)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (e) {
    // extension may not have scripting permission for this tab
    console.warn("scripting.executeScript failed:", e);
  }
}

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

fetchBtn.addEventListener("click", async () => {
  errorDiv.textContent = "";
  status.textContent = "Fetching...";
  fetchedWrap.classList.add("hidden");
  formalizedWrap.classList.add("hidden");

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    errorDiv.textContent = "No active tab found.";
    status.textContent = "";
    return;
  }

  await ensureContentScript(tab.id);

  chrome.tabs.sendMessage(tab.id, { action: "fetchText" }, (response) => {
    if (chrome.runtime.lastError) {
      errorDiv.textContent = "Error: " + chrome.runtime.lastError.message;
      status.textContent = "";
      return;
    }
    const text = response?.text || "";
    status.textContent = "";
    if (!text) {
      resultDiv.innerText = "(no text found)";
    } else {
      resultDiv.innerText = text;
    }
    fetchedWrap.classList.remove("hidden");
  });
});

formalizeBtn.addEventListener("click", async () => {
  errorDiv.textContent = "";
  // formalizedWrap.classList.add("hidden");
  const text = resultDiv.innerText.trim();
  if (!text) {
    errorDiv.textContent = "Nothing to formalize.";
    return;
  }

  formalizeBtn.disabled = true;
  formalizeBtn.innerText = "Formalizing...";

  try {
    const prompt = `Convert the following text into a formal tone. Preserve meaning and keep it roughly similar length unless necessary.\n\nText:\n${text}`;
    const formalText = await callOpenAIResponse(prompt);

    formalizedDiv.innerText = formalText;
    formalizedWrap.style.display = "block";
  } catch (err) {
    console.error(err);
    errorDiv.textContent = "Error formalizing text: " + err.message;
  } finally {
    formalizeBtn.disabled = false;
    formalizeBtn.innerText = "Make it formal";
  }
});

casualizeBtn.addEventListener("click", async () => {
  errorDiv.textContent = "";
  // formalizedWrap.classList.add("hidden");
  const text = resultDiv.innerText.trim();
  if (!text) {
    errorDiv.textContent = "Nothing to make casual...";
    return;
  }

  casualizeBtn.disabled = true;
  casualizeBtn.innerText = "Making casual...";

  try {
    const prompt = `Convert the following text into a casual tone with appropriate emojis. Preserve meaning and keep it roughly similar length unless necessary.\n\nText:\n${text}`;
    const casualText = await callOpenAIResponse(prompt);

    casualizedDiv.innerText = casualText;
    casualizedWrap.style.display = "block";
  } catch (err) {
    console.error(err);
    errorDiv.textContent = "Error making text casual : " + err.message;
  } finally {
    casualizeBtn.disabled = false;
    casualizeBtn.innerText = "Make it casual";
  }
});

copyBtn.addEventListener("click", async () => {
  const text = resultDiv.innerText;
  if (!text) {
    errorDiv.textContent = "Nothing to copy.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "Copied!";
    setTimeout(() => (status.textContent = ""), 1500);
  } catch (e) {
    errorDiv.textContent = "Copy failed: " + e.message;
  }
});

copyFormalBtn.addEventListener("click", async () => {
  const text = formalizedDiv.innerText;
  if (!text) {
    errorDiv.textContent = "Nothing to copy.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "Copied!";
    setTimeout(() => (status.textContent = ""), 1500);
  } catch (e) {
    errorDiv.textContent = "Copy failed: " + e.message;
  }
});

copyCasualBtn.addEventListener("click", async () => {
  const text = casualizedDiv.innerText;
  if (!text) {
    errorDiv.textContent = "Nothing to copy.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "Copied!";
    setTimeout(() => (status.textContent = ""), 1500);
  } catch (e) {
    errorDiv.textContent = "Copy failed: " + e.message;
  }
});

insertBtnFormal.addEventListener("click", async () => {
  errorDiv.textContent = "";
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    errorDiv.textContent = "No active tab found.";
    return;
  }

  const textToInsert = formalizedDiv.innerText;
  if (!textToInsert) {
    errorDiv.textContent = "Nothing to insert.";
    return;
  }

  try {
    // Focus the window then the tab so the page is active when we run the injected code.
    // This also closes the popup, which is fine because we will execute the script directly in the tab.
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });

    // Execute insertion code directly inside the page context.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        // Find probable editable element (try known stable selectors, fallbacks)
        const candidateSelectors = [
          '[contenteditable="true"][data-tab="10"]',
          '[contenteditable="true"][data-testid="conversation-compose-box-input"]', // possible alternative
          '[contenteditable="true"]',
        ];
        let editable = null;
        for (const sel of candidateSelectors) {
          editable = document.querySelector(sel);
          if (editable) break;
        }
        // fallback: find contenteditable that seems like input by aria-placeholder/label
        if (!editable) {
          editable = Array.from(
            document.querySelectorAll('[contenteditable="true"]')
          ).find(
            (el) =>
              el.getAttribute("aria-label") === "Type a message" ||
              el.getAttribute("aria-placeholder") === "Type a message"
          );
        }

        if (!editable) {
          return { success: false, error: "Editable input not found" };
        }

        editable.focus();

        // Build a synthetic paste event with clipboard data set to text
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        let pasteEvent;
        try {
          pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });
        } catch (e) {
          // Some browsers may not allow new ClipboardEvent; fallback to a generic Event and attach clipboardData if possible
          pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
          pasteEvent.clipboardData = dt;
        }

        editable.dispatchEvent(pasteEvent);

        // Also dispatch an input event in case WhatsApp listens to it
        editable.dispatchEvent(
          new InputEvent("input", { bubbles: true, cancelable: true })
        );

        return { success: true };
      },
      args: [textToInsert],
    });

    // results is an array of injection results (one per frame); use first
    const result = (results && results[0] && results[0].result) || {};
    if (result.success) {
      // The popup is likely closed after focusing the tab; if it still exists, show status.
      // We'll try to update UI if popup still open.
      status.textContent = "Inserted!";
      setTimeout(() => (status.textContent = ""), 1500);
    } else {
      errorDiv.textContent = "Insert failed: " + (result.error || "unknown");
    }
  } catch (err) {
    console.error("Insert error:", err);
    errorDiv.textContent = "Insert failed: " + (err?.message || String(err));
  }
});

insertBtnCasual.addEventListener("click", async () => {
  errorDiv.textContent = "";
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    errorDiv.textContent = "No active tab found.";
    return;
  }

  const textToInsert = casualizedDiv.innerText;
  if (!textToInsert) {
    errorDiv.textContent = "Nothing to insert.";
    return;
  }

  try {
    // Focus the window then the tab so the page is active when we run the injected code.
    // This also closes the popup, which is fine because we will execute the script directly in the tab.
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });

    // Execute insertion code directly inside the page context.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        // Find probable editable element (try known stable selectors, fallbacks)
        const candidateSelectors = [
          '[contenteditable="true"][data-tab="10"]',
          '[contenteditable="true"][data-testid="conversation-compose-box-input"]', // possible alternative
          '[contenteditable="true"]',
        ];
        let editable = null;
        for (const sel of candidateSelectors) {
          editable = document.querySelector(sel);
          if (editable) break;
        }
        // fallback: find contenteditable that seems like input by aria-placeholder/label
        if (!editable) {
          editable = Array.from(
            document.querySelectorAll('[contenteditable="true"]')
          ).find(
            (el) =>
              el.getAttribute("aria-label") === "Type a message" ||
              el.getAttribute("aria-placeholder") === "Type a message"
          );
        }

        if (!editable) {
          return { success: false, error: "Editable input not found" };
        }

        editable.focus();

        // Build a synthetic paste event with clipboard data set to text
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        let pasteEvent;
        try {
          pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });
        } catch (e) {
          // Some browsers may not allow new ClipboardEvent; fallback to a generic Event and attach clipboardData if possible
          pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
          pasteEvent.clipboardData = dt;
        }

        editable.dispatchEvent(pasteEvent);

        // Also dispatch an input event in case WhatsApp listens to it
        editable.dispatchEvent(
          new InputEvent("input", { bubbles: true, cancelable: true })
        );

        return { success: true };
      },
      args: [textToInsert],
    });

    // results is an array of injection results (one per frame); use first
    const result = (results && results[0] && results[0].result) || {};
    if (result.success) {
      // The popup is likely closed after focusing the tab; if it still exists, show status.
      // We'll try to update UI if popup still open.
      status.textContent = "Inserted!";
      setTimeout(() => (status.textContent = ""), 1500);
    } else {
      errorDiv.textContent = "Insert failed: " + (result.error || "unknown");
    }
  } catch (err) {
    console.error("Insert error:", err);
    errorDiv.textContent = "Insert failed: " + (err?.message || String(err));
  }
});

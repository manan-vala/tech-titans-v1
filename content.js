chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === "fetchText") {
        const el = document.querySelector(
          'div[aria-placeholder="Type a message"] span.selectable-text.copyable-text'
        );
        const text = el ? el.innerText.trim() : null;
        sendResponse({ text });
        return;
      }

      if (request.action === "insertText") {
        (async () => {
          const text = request.text || "";
          const editable =
            document.querySelector('[contenteditable="true"][data-tab="10"]') ||
            document.querySelector('[contenteditable="true"]');
          if (!editable)
            return sendResponse({
              success: false,
              error: "Editable input not found",
            });

          editable.focus();
          try {
            // try clipboard write — may fail if page not focused
            await navigator.clipboard.writeText(text);
            const dt = new DataTransfer();
            dt.setData("text/plain", text);
            const pasteEvent = new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: dt,
            });
            editable.dispatchEvent(pasteEvent);
            editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
            sendResponse({ success: true });
          } catch (err) {
            sendResponse({ success: false, error: String(err) });
          }
        })();
        return true;
      }
    } catch (err) {
      console.error("content.js handler error:", err);
      sendResponse({ success: false, error: String(err) });
      return;
    }
  })();

  // Return true to indicate async response (keeps channel open)
  return true;
});

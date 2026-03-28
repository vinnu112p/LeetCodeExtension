// ============================================================
// AlgoPush — Page Script (runs in MAIN WORLD)
// This script has access to window.monaco
// ============================================================

(function () {
  // Listen for code extraction requests from content script
  window.addEventListener("lc-ai-sync-extract-code", () => {
    let code = null;
    let language = null;
    let error = null;

    try {
      if (typeof monaco === 'undefined' || !monaco.editor) {
        error = "Monaco editor not available";
      } else {
        const models = monaco.editor.getModels();
        if (models && models.length > 0 && models[0]) {
          code = models[0].getValue();
          language = models[0].getLanguageId ? models[0].getLanguageId() : null;
          if (!code || code.length < 5) {
            error = "Editor is empty";
            code = null;
          }
        } else {
          error = "No Monaco models found";
        }
      }
    } catch (e) {
      error = e.message;
    }

    // Send code back to content script via custom event
    window.dispatchEvent(new CustomEvent("lc-ai-sync-code-result", {
      detail: { code, language, error }
    }));
  });

  // Also expose a debug helper in the page console
  window.LeetCodeAISync = {
    getCode: () => {
      try {
        return monaco.editor.getModels()[0].getValue();
      } catch (e) {
        console.error("Monaco not available:", e);
        return null;
      }
    },
    getLanguage: () => {
      try {
        return monaco.editor.getModels()[0].getLanguageId();
      } catch (e) {
        console.error("Monaco not available:", e);
        return null;
      }
    },
    check: () => {
      console.log("Monaco:", typeof monaco !== 'undefined' ? '✅' : '❌');
      try {
        const models = monaco.editor.getModels();
        console.log("Models:", models.length);
        console.log("Language:", models[0].getLanguageId ? models[0].getLanguageId() : "unknown");
        console.log("Code length:", models[0].getValue().length, "chars");
      } catch (e) {
        console.log("Error:", e.message);
      }
    }
  };

  console.log("[AlgoPush] Page script loaded. Debug: LeetCodeAISync.getCode()");
})();

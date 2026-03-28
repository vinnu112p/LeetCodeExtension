// ============================================================
// AlgoPush — Content Script
// Injected into: leetcode.com/problems/*
// Features: Approach panel, robust extraction, manual sync
// ============================================================

(function () {
  "use strict";

  let approachPanelOpen = false;
  let lastDetectedLanguage = null;
  let isProcessing = false;
  let toastTimeout = null;

  // ═══════════════════════════════════════════════════════════
  // Inject pageScript.js into the PAGE'S MAIN WORLD
  // Content scripts can't access window.monaco (isolated world)
  // The page script CAN access monaco and sends code back via events
  // ═══════════════════════════════════════════════════════════
  function injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('pageScript.js');
      script.onload = () => script.remove(); // Clean up after injection
      (document.head || document.documentElement).appendChild(script);
      console.log("[AlgoPush] Page script injected into main world");
    } catch (e) {
      console.error("[AlgoPush] Failed to inject page script:", e);
    }
  }

  // Inject immediately
  injectPageScript();

  // ─── Init ────────────────────────────────────────────────
  function init() {
    waitForPageLoad(() => {
      injectFloatingButton();
      injectApproachButton();
    });
  }

  function waitForPageLoad(cb) {
    // LeetCode is a SPA; wait for the problem content to be ready
    // Monaco loads asynchronously, so we'll handle it during extraction
    const check = setInterval(() => {
      const hasProblem = document.querySelector('[data-track-load="description_content"]') ||
                         document.querySelector('.elfjS') ||
                         document.querySelector('[class*="description"]');
      
      if (hasProblem) {
        clearInterval(check);
        console.log("✅ Page ready, buttons injected");
        setTimeout(cb, 800);
      }
    }, 500);
    setTimeout(() => clearInterval(check), 15000);
  }

  // ─── Floating Action Button (Manual Sync) ─────────────────
  function injectFloatingButton() {
    if (document.getElementById("lc-ai-sync-fab")) return;

    const fab = document.createElement("div");
    fab.id = "lc-ai-sync-fab";
    fab.title = "Sync to GitHub with AI";
    fab.innerHTML = `
      <div class="fab-icon">⚡</div>
      <div class="fab-label">Sync</div>
    `;
    fab.addEventListener("click", () => handleManualSync({ mode: "instant" }));
    document.body.appendChild(fab);
  }

  // ─── Approach Button (injected near problem title) ─────────
  function injectApproachButton() {
    if (document.getElementById("lc-approach-btn")) return;

    // Try multiple selectors for LeetCode's dynamic layout
    const targetSelectors = [
      '[data-track-load="description_content"]',
      '.elfjS',
      '[class*="description__"]',
    ];

    let target = null;
    for (const sel of targetSelectors) {
      target = document.querySelector(sel);
      if (target) break;
    }

    if (!target) return;

    const container = document.createElement("div");
    container.id = "lc-approach-container";
    container.innerHTML = `
      <button id="lc-approach-btn" class="lc-ai-btn">
        <span class="btn-icon">🧠</span>
        <span>Get Approach</span>
      </button>
      <button id="lc-manual-push-btn" class="lc-ai-btn lc-push-btn">
        <span class="btn-icon">📤</span>
        <span>Push to GitHub</span>
      </button>
    `;

    // Insert before the problem description
    target.parentNode.insertBefore(container, target);

    document.getElementById("lc-approach-btn").addEventListener("click", handleGetApproach);
    document.getElementById("lc-manual-push-btn").addEventListener("click", () => handleManualSync({ mode: "review" }));
  }

  // ─── Handle Manual Sync Button ─────────────────────────────
  async function handleManualSync({ mode = "review" } = {}) {
    if (isProcessing) {
      showToast("⏳ Already processing...", "info");
      return;
    }

    isProcessing = true;
    const settings = await getSettings();

    if (!settings.githubToken) {
      showToast("⚠️ Configure GitHub settings in the extension popup first!", "error");
      isProcessing = false;
      return;
    }

    const problemData = extractProblemData();
    const userCode = await extractUserCode();
    const language = extractLanguage(userCode);

    if (!userCode) {
      showToast("❌ Could not extract your code. Make sure you're on a problem page with code written.", "error");
      isProcessing = false;
      return;
    }

    const isInstant = mode === "instant";
    showToast(isInstant ? "⚡ Instant sync in progress..." : "🔄 Syncing with AI analysis...", "info", 0);

    if (settings.aiEnabled && settings.groqApiKey) {
      chrome.runtime.sendMessage({
        type: "GET_APPROACH",
        data: {
          problemTitle: problemData.title,
          problemDescription: problemData.description,
          userCode,
          language,
          difficulty: problemData.difficulty,
        },
      }, async (aiResult) => {
        if (aiResult?.error) {
          showToast(`⚠️ AI unavailable: ${aiResult.error}. Pushing code only...`, "warning");
          await pushToGithub({ problemData, userCode, language, settings });
        } else {
          if (isInstant) {
            await pushToGithub({
              problemData,
              userCode,
              language,
              settings,
              optimizedCode: aiResult.optimizedCode,
              approach: aiResult.approach,
            });
          } else {
            showApproachPanel(aiResult.approach, {
              showPush: true,
              onPush: () => {
                pushToGithub({
                  problemData,
                  userCode,
                  language,
                  settings,
                  optimizedCode: aiResult.optimizedCode,
                  approach: aiResult.approach,
                });
              },
            });
          }
        }
        isProcessing = false;
      });
    } else {
      await pushToGithub({ problemData, userCode, language, settings });
      isProcessing = false;
    }
  }

  // ─── Handle Get Approach Button ────────────────────────────
  async function handleGetApproach() {
    if (approachPanelOpen) {
      closeApproachPanel();
      return;
    }

    const settings = await getSettings();
    if (!settings.groqApiKey) {
      showToast("⚠️ Groq API key not set. Configure it in the extension popup!", "error");
      return;
    }

    const btn = document.getElementById("lc-approach-btn");
    if (btn) {
      btn.innerHTML = `<span class="btn-icon spin">⟳</span><span>Analyzing...</span>`;
      btn.disabled = true;
    }

    const problemData = extractProblemData();
    const userCode = await extractUserCode();
    const language = extractLanguage(userCode);

    chrome.runtime.sendMessage({
      type: "GET_APPROACH",
      data: {
        problemTitle: problemData.title,
        problemDescription: problemData.description,
        userCode: userCode || "(no code written yet)",
        language: language || "python",
        difficulty: problemData.difficulty,
      },
    }, (result) => {
      if (btn) {
        btn.innerHTML = `<span class="btn-icon">🧠</span><span>Get Approach</span>`;
        btn.disabled = false;
      }

      if (result?.error) {
        showToast(`❌ ${result.error}`, "error");
        return;
      }

      showApproachPanel(result.approach, { showPush: false });
    });
  }

  // ─── Approach Panel (slide-in from right) ──────────────────
  function showApproachPanel(approach, options = {}) {
    const { showPush = true, onPush = null } = options;

    closeApproachPanel();
    approachPanelOpen = true;

    const panel = document.createElement("div");
    panel.id = "lc-approach-panel";

    const rendered = renderMarkdown(approach);

    panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">
          <span class="panel-icon">🧠</span>
          <span>AI Approach Analysis</span>
          <span class="powered-badge">AI</span>
        </div>
        <button class="panel-close" id="lc-panel-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="approach-content">${rendered}</div>
        <div class="panel-actions">
          ${showPush ? `<button class="panel-action-btn primary" id="lc-panel-push">
            <span>📤</span> Push to GitHub (My Solution + Optimized + Approach)
          </button>` : ""}
          <button class="panel-action-btn secondary" id="lc-panel-close2">
            Got it, close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Animate in
    requestAnimationFrame(() => panel.classList.add("panel-open"));

    document.getElementById("lc-panel-close").addEventListener("click", closeApproachPanel);
    document.getElementById("lc-panel-close2").addEventListener("click", closeApproachPanel);
    const pushBtn = document.getElementById("lc-panel-push");
    if (pushBtn) {
      pushBtn.addEventListener("click", () => {
        closeApproachPanel();
        if (onPush) onPush();
      });
    }
  }

  function closeApproachPanel() {
    const panel = document.getElementById("lc-approach-panel");
    if (panel) {
      panel.classList.remove("panel-open");
      setTimeout(() => panel.remove(), 300);
    }
    approachPanelOpen = false;
  }

  // ─── Push to GitHub ─────────────────────────────────────────
  async function pushToGithub({ problemData, userCode, language, settings, optimizedCode, approach }) {
    const fab = document.getElementById("lc-ai-sync-fab");
    if (fab) fab.classList.add("syncing");

    chrome.runtime.sendMessage({
      type: "PUSH_TO_GITHUB",
      data: { problemData, userCode, optimizedCode, approach, language },
    }, (result) => {
      if (fab) fab.classList.remove("syncing");
      isProcessing = false; // Reset processing flag

      if (result?.error) {
        showToast(`❌ GitHub push failed: ${result.error}`, "error", 5000);
      } else {
        const filesMsg = result.filesCount ? `(${result.filesCount} files)` : "";
        showToast(`🎉 Pushed to GitHub! ${filesMsg} → ${result.folderPath || ""}`, "success", 5000);
      }
    });
  }

  // ─── Data Extraction ────────────────────────────────────────
  function extractProblemData() {
    const titleEl = document.querySelector('[data-cy="question-title"]') ||
                    document.querySelector('div[class*="title"] a') ||
                    document.querySelector('div[class*="question-title"]') ||
                    document.querySelector('div[class*="QuestionTitle"]');

    const rawTitle = titleEl?.textContent?.trim() || document.title.split(" - ")[0] || "Unknown Problem";

    // Extract number from title like "1. Two Sum" or from URL
    let number = "0";
    let title = rawTitle;

    const numMatch = rawTitle.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      number = numMatch[1];
      title = numMatch[2];
    } else {
      const urlMatch = window.location.pathname.match(/\/problems\/([^/]+)/);
      if (urlMatch) title = urlMatch[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    // Difficulty
    const diffEl = document.querySelector('[class*="difficulty"]') ||
                   document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
                   document.querySelector('[class*="Difficulty"]');
    const difficulty = diffEl?.textContent?.trim() || "Medium";

    // Description
    const description = extractProblemDescription();

    return {
      title,
      number,
      difficulty,
      description,
      url: window.location.href,
    };
  }

  async function extractUserCode(retryCount = 0) {
    const MAX_RETRIES = 4;
    const RETRY_DELAY = 1500;

    // ═══════════════════════════════════════════════════════════
    // Extract code via pageScript.js (runs in main world with Monaco access)
    // Communication: content script <-> page script via CustomEvents
    // ═══════════════════════════════════════════════════════════

    return new Promise((resolve) => {
      let resolved = false;

      // Listen for the response from pageScript.js
      const handler = (event) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('lc-ai-sync-code-result', handler);

        const { code, language, error } = event.detail || {};

        if (language) {
          lastDetectedLanguage = normalizeLanguage(language);
        }

        if (code && code.length >= 10) {
          console.log(`✅ Full code extracted via Monaco (${code.length} chars)`);
          resolve(code);
        } else if (retryCount < MAX_RETRIES) {
          console.log(`⚠ Extraction attempt ${retryCount + 1} failed: ${error || 'empty code'}. Retrying...`);
          setTimeout(() => {
            extractUserCode(retryCount + 1).then(resolve);
          }, RETRY_DELAY);
        } else {
          console.error(`❌ Code extraction failed after ${MAX_RETRIES} retries: ${error}`);
          console.log("💡 Try in console: LeetCodeAISync.getCode()");
          resolve(null);
        }
      };

      window.addEventListener('lc-ai-sync-code-result', handler);

      // Ask pageScript.js to extract code
      window.dispatchEvent(new CustomEvent('lc-ai-sync-extract-code'));

      // Timeout safety: if pageScript never responds
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('lc-ai-sync-code-result', handler);

        console.log(`⚠ No response from page script (attempt ${retryCount + 1})`);

        if (retryCount < MAX_RETRIES) {
          // Re-inject page script in case it wasn't loaded
          injectPageScript();
          setTimeout(() => {
            extractUserCode(retryCount + 1).then(resolve);
          }, RETRY_DELAY);
        } else {
          console.error("❌ Page script not responding. Monaco may not be loaded.");
          resolve(null);
        }
      }, 2000);
    });
  }

  function extractLanguage(userCode = "") {
    if (lastDetectedLanguage && lastDetectedLanguage !== "unknown") {
      return lastDetectedLanguage;
    }

    // URL often includes selected language after submission view
    try {
      const params = new URLSearchParams(window.location.search);
      const langParam = params.get("lang") || params.get("language");
      if (langParam) return normalizeLanguage(langParam);
    } catch (_) {}

    // Try to detect language from button/selector first
    try {
      const langButton = document.querySelector('[class*="language"], [id*="language"]');
      if (langButton) {
        const text = (langButton.textContent || langButton.innerText).trim();
        if (text.length > 0 && text.length < 20) {
          return normalizeLanguage(text);
        }
      }
    } catch (_) {}

    // Check tab titles or labels
    try {
      const tabs = document.querySelectorAll('[class*="tab"], [role="tab"]');
      for (const tab of tabs) {
        const text = (tab.textContent || tab.innerText).toLowerCase();
        if (["java", "python", "python3", "cpp", "c++", "javascript", "typescript", "go", "rust"].some(l => text.includes(l))) {
          return normalizeLanguage(text.split(' ')[0]);
        }
      }
    } catch (_) {}

    // Look at code content to infer language
    try {
      if (userCode.includes('public class') || userCode.includes('class Solution {')) return 'java';
      if (userCode.includes('def ') || userCode.includes('class Solution:')) return 'python';
      if (userCode.includes('#include') || userCode.includes('std::')) return 'cpp';
      if (userCode.includes('function ') || userCode.includes('const ') || userCode.includes('let ')) return 'javascript';
      if (userCode.includes('fn ') || userCode.includes('impl ')) return 'rust';
    } catch (_) {}

    return "unknown";
  }

  function normalizeLanguage(raw) {
    const lang = (raw || "").toString().trim().toLowerCase();
    const map = {
      python3: "python",
      py: "python",
      csharp: "c#",
      cplusplus: "cpp",
      javascriptreact: "javascript",
      typescriptreact: "typescript",
    };

    if (!lang) return "unknown";
    if (map[lang]) return map[lang];
    if (lang.includes("python")) return "python";
    if (lang.includes("java") && !lang.includes("javascript")) return "java";
    if (lang.includes("javascript")) return "javascript";
    if (lang.includes("typescript")) return "typescript";
    if (lang.includes("c++") || lang === "cpp") return "cpp";
    if (lang.includes("c#")) return "c#";
    if (lang.includes("golang") || lang === "go") return "go";
    if (lang.includes("rust")) return "rust";
    if (lang.includes("kotlin")) return "kotlin";
    if (lang.includes("swift")) return "swift";
    if (lang.includes("php")) return "php";
    if (lang.includes("ruby")) return "ruby";
    if (lang.includes("scala")) return "scala";
    if (lang.includes("mysql") || lang === "sql") return "sql";

    if (/^\d+\.?$/.test(lang)) return "unknown";
    return lang;
  }

  function extractProblemDescription() {
    const descEl = document.querySelector('[data-track-load="description_content"]') ||
                   document.querySelector('.elfjS') ||
                   document.querySelector('[class*="description"]');
    if (!descEl) return "";

    const clone = descEl.cloneNode(true);
    clone.querySelectorAll("sup").forEach((sup) => {
      const txt = (sup.textContent || "").trim();
      sup.replaceWith(document.createTextNode(`^${txt}`));
    });

    const text = (clone.textContent || "").replace(/\u00a0/g, " ");
    return normalizeConstraintText(text).trim().slice(0, 2000);
  }

  function normalizeConstraintText(text) {
    return text
      .replace(/\[\s*0\s*,\s*104\s*\]/g, "[0, 10^4]")
      .replace(/-231\s*<=/g, "-2^31 <=")
      .replace(/<=\s*231\s*-\s*1/g, "<= 2^31 - 1");
  }

  // ─── Toast Notification ──────────────────────────────────────
  function showToast(message, type = "info", duration = 4000) {
    const existing = document.getElementById("lc-ai-toast");
    if (existing) existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);

    const toast = document.createElement("div");
    toast.id = "lc-ai-toast";
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("toast-show"));

    if (duration > 0) {
      toastTimeout = setTimeout(() => {
        toast.classList.remove("toast-show");
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  // ─── Markdown Renderer (minimal) ────────────────────────────
  function renderMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/## (.+)/g, '<h3 class="md-h2">$1</h3>')
      .replace(/### (.+)/g, '<h4 class="md-h3">$1</h4>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
      .replace(/^- (.+)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/^\d+\. (.+)/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p class="md-p">')
      .replace(/^/, '<p class="md-p">')
      .replace(/$/, '</p>');
  }

  // ─── Settings helper ────────────────────────────────────────
  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get([
        "githubToken", "githubUsername", "githubRepo", "githubBranch",
        "groqApiKey", "repoFolder", "aiEnabled"
      ], (result) => {
        resolve({
          aiEnabled: result.aiEnabled !== false,
          ...result
        });
      });
    });
  }

  // ─── Message Listener (from popup) ─────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "MANUAL_SYNC_FROM_POPUP") {
      handleManualSync({ mode: "review" });
      sendResponse({ ok: true });
    }
    if (msg.type === "GET_APPROACH_FROM_POPUP") {
      handleGetApproach();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ─── SPA Route Change Detection ─────────────────────────────
  let lastUrl = location.href;
  let routeChangeTimer = null;
  const routeObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Debounce: prevent rapid-fire on SPA transitions
      if (routeChangeTimer) clearTimeout(routeChangeTimer);
      routeChangeTimer = setTimeout(() => {
        if (location.pathname.includes("/problems/")) {
          document.getElementById("lc-approach-container")?.remove();
          injectApproachButton();
          // Re-inject page script for new page context
          injectPageScript();
        }
      }, 2000);
    }
  });
  routeObserver.observe(document.body, { childList: true, subtree: false });

  // ─── Kick Off ───────────────────────────────────────────────
  init();
})();

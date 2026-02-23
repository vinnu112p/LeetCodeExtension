// ============================================================
// AlgoPush — Content Script
// Injected into: leetcode.com/problems/*
// Features: Submission detection, Approach panel, Manual sync
// ============================================================

(function () {
  "use strict";

  let approachPanelOpen = false;
  let lastPushedSubmissionId = null;
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
    const fabIcon = document.createElement("div");
    fabIcon.className = "fab-icon";
    fabIcon.textContent = "⚡";
    const fabLabel = document.createElement("div");
    fabLabel.className = "fab-label";
    fabLabel.textContent = "Sync";
    fab.appendChild(fabIcon);
    fab.appendChild(fabLabel);
    fab.addEventListener("click", () => handleManualSync());
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
    document.getElementById("lc-manual-push-btn").addEventListener("click", handleManualSync);
  }

  // ─── Submission Watcher (MutationObserver) ─────────────────
  // DISABLED: Only manual sync is allowed to prevent auto-triggering
  function startSubmissionWatcher() {
    // Auto-sync disabled - users must click the manual sync button
    console.log("[AlgoPush] Auto-submission watching is disabled. Use manual sync buttons.");
    return;
    
    /* Original auto-watch code (disabled)
    const observer = new MutationObserver(() => {
      if (isProcessing) return;

      // Look for "Accepted" status text in the DOM
      const accepted = findAcceptedElement();
      if (accepted) {
        isProcessing = true;
        setTimeout(async () => {
          await handleAcceptedSubmission();
          isProcessing = false;
        }, 1000);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    */
  }

  function findAcceptedElement() {
    // Multiple ways LeetCode shows "Accepted"
    const selectors = [
      '[data-e2e-locator="submission-result"]',
      '.text-green-s',
      '[class*="accepted"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().toLowerCase() === "accepted") return el;
    }

    // Fallback: search all elements for "Accepted" text
    const allEls = document.querySelectorAll('span, div, h4, p');
    for (const el of allEls) {
      if (el.children.length === 0 && el.textContent.trim() === "Accepted") {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) return el; // visible element
      }
    }
    return null;
  }

  // ─── Handle Accepted Submission ───────────────────────────
  async function handleAcceptedSubmission() {
    const settings = await getSettings();
    if (!settings.autoSync) return;

    const problemData = extractProblemData();
    const userCode = await extractUserCode();
    const language = extractLanguage();

    if (!userCode) {
      showToast("⚠️ Could not extract code. Use ⚡ button to sync manually.", "warning");
      return;
    }

    showToast("✅ Accepted! Processing with AI...", "info", 0);

    if (settings.aiEnabled && settings.groqApiKey) {
      // Get approach + optimized from Groq, then push all
      chrome.runtime.sendMessage({
        type: "GET_APPROACH",
        data: {
          problemTitle: problemData.title,
          problemDescription: problemData.description,
          userCode,
          language,
          difficulty: problemData.difficulty,
        },
      }, (aiResult) => {
        if (aiResult?.error) {
          showToast(`⚠️ AI error: ${aiResult.error}. Pushing code only...`, "warning");
          pushToGithub({ problemData, userCode, language, settings });
        } else {
          showApproachBanner(aiResult.approach, () => {
            pushToGithub({
              problemData, userCode, language, settings,
              optimizedCode: aiResult.optimizedCode,
              approach: aiResult.approach,
            });
          });
        }
      });
    } else {
      await pushToGithub({ problemData, userCode, language, settings });
    }
  }

  // ─── Handle Manual Sync Button ─────────────────────────────
  async function handleManualSync() {
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
    const language = extractLanguage();

    if (!userCode) {
      showToast("❌ Could not extract your code. Make sure you're on a problem page with code written.", "error");
      isProcessing = false;
      return;
    }

    showToast("🔄 Syncing with AI analysis...", "info", 0);

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
          showApproachPanel(aiResult.approach, aiResult.optimizedCode, () => {
            pushToGithub({
              problemData, userCode, language, settings,
              optimizedCode: aiResult.optimizedCode,
              approach: aiResult.approach,
            });
          });
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
    const language = extractLanguage();

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

      showApproachPanel(result.approach, result.optimizedCode, async () => {
        const uCode = await extractUserCode();
        const s = await getSettings();
        pushToGithub({
          problemData,
          userCode: uCode,
          language,
          settings: s,
          optimizedCode: result.optimizedCode,
          approach: result.approach,
        });
      });
    });
  }

  // ─── Approach Panel (slide-in from right) ──────────────────
  function showApproachPanel(approach, optimizedCode, onPush) {
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
          <span class="powered-badge">Groq LLM</span>
        </div>
        <button class="panel-close" id="lc-panel-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="approach-content">${rendered}</div>
        <div class="panel-actions">
          <button class="panel-action-btn primary" id="lc-panel-push">
            <span>📤</span> Push to GitHub (My Solution + Optimized + Approach)
          </button>
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
    document.getElementById("lc-panel-push").addEventListener("click", () => {
      closeApproachPanel();
      if (onPush) onPush();
    });
  }

  function showApproachBanner(approach, onPush) {
    // Compact banner for auto-sync flow
    const banner = document.createElement("div");
    banner.id = "lc-approach-banner";
    banner.innerHTML = `
      <div class="banner-header">
        <span>🧠 AI Analysis Ready!</span>
        <button id="lc-banner-view">View Approach</button>
        <button id="lc-banner-push">📤 Push Now</button>
        <button id="lc-banner-close">✕</button>
      </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("banner-show"));

    document.getElementById("lc-banner-view").addEventListener("click", () => {
      banner.remove();
      showApproachPanel(approach, null, onPush);
    });
    document.getElementById("lc-banner-push").addEventListener("click", () => {
      banner.remove();
      if (onPush) onPush();
    });
    document.getElementById("lc-banner-close").addEventListener("click", () => banner.remove());
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
    const descEl = document.querySelector('[data-track-load="description_content"]') ||
                   document.querySelector('.elfjS') ||
                   document.querySelector('[class*="description"]');
    const description = descEl?.textContent?.trim().slice(0, 2000) || "";

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

        const { code, error } = event.detail || {};

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

  function extractLanguage() {
    // Try to detect language from button/selector first
    try {
      const langButton = document.querySelector('[class*="language"], [id*="language"]');
      if (langButton) {
        const text = (langButton.textContent || langButton.innerText).trim().toLowerCase();
        if (text.length > 0 && text.length < 20) {
          return text;
        }
      }
    } catch (_) {}

    // Check tab titles or labels
    try {
      const tabs = document.querySelectorAll('[class*="tab"], [role="tab"]');
      for (const tab of tabs) {
        const text = (tab.textContent || tab.innerText).toLowerCase();
        if (["java", "python", "python3", "cpp", "c++", "javascript", "typescript", "go", "rust"].some(l => text.includes(l))) {
          return text.split(' ')[0];
        }
      }
    } catch (_) {}

    // Look at code content to infer language
    try {
      const userCode = document.body.textContent || '';
      if (userCode.includes('public class')) return 'java';
      if (userCode.includes('def ')) return 'python3';
      if (userCode.includes('#include')) return 'cpp';
      if (userCode.includes('function ')) return 'javascript';
      if (userCode.includes('fn ')) return 'rust';
    } catch (_) {}

    return "java"; // Default to Java based on user context
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
        "groqApiKey", "repoFolder", "autoSync", "aiEnabled"
      ], (result) => {
        resolve({
          autoSync: result.autoSync !== false,
          aiEnabled: result.aiEnabled !== false,
          ...result
        });
      });
    });
  }

  // ─── Message Listener (from popup) ─────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "MANUAL_SYNC_FROM_POPUP") {
      handleManualSync();
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
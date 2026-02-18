// ============================================================
// AlgoPush — Popup Script
// ============================================================

const KEYS = [
  "githubToken", "githubUsername", "githubRepo", "githubBranch",
  "groqApiKey", "repoFolder", "autoSync", "aiEnabled",
  "statSynced", "statAi", "statLast", "statTime",
];

// ─── Tab Switching ───────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");

    if (tab.dataset.tab === "sync") loadCurrentProblemInfo();
    if (tab.dataset.tab === "stats") loadStats();
  });
});

// ─── Load Saved Settings ─────────────────────────────────────
chrome.storage.sync.get(KEYS, (data) => {
  setVal("github-token",   data.githubToken || "");
  setVal("github-username", data.githubUsername || "");
  setVal("github-repo",    data.githubRepo || "");
  setVal("github-branch",  data.githubBranch || "main");
  setVal("repo-folder",    data.repoFolder || "solutions");
  setVal("groq-key",       data.groqApiKey || "");

  setCheck("toggle-autosync", false); // Always disabled
  setCheck("toggle-ai",       data.aiEnabled !== false);

  updateStatusDot(data);
});

// ─── Save Settings ────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", async () => {
  const settings = {
    githubToken:    getVal("github-token"),
    githubUsername: getVal("github-username"),
    githubRepo:     getVal("github-repo"),
    githubBranch:   getVal("github-branch") || "main",
    repoFolder:     getVal("repo-folder") || "solutions",
    groqApiKey:     getVal("groq-key"),
    autoSync:       false, // Auto-sync permanently disabled - manual only
    aiEnabled:      getCheck("toggle-ai"),
  };

  if (!settings.githubToken || !settings.githubUsername || !settings.githubRepo) {
    showStatus("⚠️ Please fill in GitHub token, username and repository name.", "error");
    return;
  }

  chrome.storage.sync.set(settings, () => {
    showStatus("✅ Settings saved successfully!", "success");
    updateStatusDot(settings);
  });
});

// ─── Test Connection ─────────────────────────────────────────
document.getElementById("btn-test").addEventListener("click", async () => {
  const token = getVal("github-token");
  const username = getVal("github-username");
  const repo = getVal("github-repo");
  const groqKey = getVal("groq-key");

  if (!token || !username || !repo) {
    showStatus("⚠️ Fill in GitHub settings first.", "error");
    return;
  }

  showStatus("🔄 Testing connections...", "info");
  document.getElementById("btn-test").disabled = true;

  let githubOk = false;
  let groqOk = false;

  // Test GitHub
  try {
    const res = await fetch(`https://api.github.com/repos/${username}/${repo}`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json" }
    });
    githubOk = res.ok;
  } catch (_) {}

  // Test Groq (lightweight check — just validate key format and ping)
  if (groqKey && groqKey.startsWith("gsk_")) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${groqKey}` }
      });
      groqOk = res.ok;
    } catch (_) {}
  }

  document.getElementById("btn-test").disabled = false;

  const parts = [];
  if (githubOk) parts.push("✅ GitHub: Connected");
  else parts.push("❌ GitHub: Failed (check token/repo)");

  if (groqKey) {
    if (groqOk) parts.push("✅ Groq AI: Connected");
    else parts.push("⚠️ Groq AI: Check your API key");
  } else {
    parts.push("ℹ️ Groq AI: No key provided");
  }

  const allOk = githubOk;
  showStatus(parts.join(" | "), allOk ? "success" : "error");
  updateStatusDot({ githubToken: token, githubOk });

  // Update stats tab
  chrome.storage.sync.set({
    statGithub: githubOk ? "✅ Connected" : "❌ Failed",
    statGroq: groqOk ? "✅ Connected" : groqKey ? "❌ Failed" : "Not set",
  });
});

// ─── Sync Tab: Current Problem ────────────────────────────────
async function loadCurrentProblemInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes("leetcode.com/problems/")) {
    document.getElementById("cp-title").textContent = "Not on a LeetCode problem page";
    document.getElementById("cp-meta").textContent = "Navigate to a LeetCode problem to sync";
    document.getElementById("btn-manual-sync").disabled = true;
    return;
  }

  // Extract slug from URL
  const slug = tab.url.match(/\/problems\/([^/?#]+)/)?.[1] || "";
  const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  document.getElementById("cp-title").textContent = title;
  document.getElementById("cp-meta").innerHTML = `
    <span style="font-size: 11px; color: #888;">
      ${tab.url.includes("?lang=") ? "Code detected" : "Open problem to extract code"}
    </span>
  `;
  document.getElementById("btn-manual-sync").disabled = false;
}

// ─── Manual Sync from Popup ───────────────────────────────────
document.getElementById("btn-manual-sync").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Send message to content script to trigger manual sync
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "MANUAL_SYNC_FROM_POPUP" });
    window.close(); // close popup — content script will show toast
  } catch (e) {
    showStatusSync("❌ Could not connect to the page. Try refreshing LeetCode.", "error");
  }
});

// ─── Get Approach from popup ──────────────────────────────────
document.getElementById("btn-get-approach-popup").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes("leetcode.com/problems/")) {
    showStatusSync("⚠️ Open a LeetCode problem page first.", "error");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "GET_APPROACH_FROM_POPUP" });
    window.close();
  } catch (e) {
    showStatusSync("❌ Could not connect to the page. Refresh LeetCode and try again.", "error");
  }
});

// Listen for messages from popup-triggered actions
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SYNC_COMPLETE") {
    const current = parseInt(localStorage.getItem("statSynced") || "0");
    chrome.storage.sync.set({
      statSynced: current + 1,
      statLast: msg.problemTitle,
      statTime: new Date().toLocaleTimeString(),
    });
  }
});

// ─── Stats Tab ────────────────────────────────────────────────
function loadStats() {
  chrome.storage.sync.get(["statSynced", "statAi", "statLast", "statTime", "statGithub", "statGroq"], (data) => {
    setText("stat-synced", data.statSynced || "0");
    setText("stat-ai",     data.statAi || "0");
    setText("stat-last",   data.statLast || "—");
    setText("stat-time",   data.statTime || "—");
    setText("stat-github", data.statGithub || "Not verified");
    setText("stat-groq",   data.statGroq || "Not verified");
  });
}

document.getElementById("btn-reset-stats").addEventListener("click", () => {
  chrome.storage.sync.remove(["statSynced", "statAi", "statLast", "statTime"], () => {
    loadStats();
  });
});

// ─── Status Dot ───────────────────────────────────────────────
function updateStatusDot(settings) {
  const dot = document.getElementById("status-dot");
  const hasGithub = settings.githubToken && settings.githubUsername && settings.githubRepo;
  dot.className = "header-status-dot " + (hasGithub ? "connected" : "");
  dot.title = hasGithub ? "GitHub configured" : "Not configured";
}

// ─── Utility Functions ────────────────────────────────────────
function getVal(id) { return document.getElementById(id)?.value?.trim() || ""; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function getCheck(id) { return document.getElementById(id)?.checked; }
function setCheck(id, val) { const el = document.getElementById(id); if (el) el.checked = val; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = `show ${type}`;
  if (type !== "info") setTimeout(() => el.classList.remove("show"), 5000);
}

function showStatusSync(msg, type) {
  const el = document.getElementById("status-msg-sync");
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => el.classList.remove("show"), 4000);
}

// ─── Handle messages from content script ─────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "MANUAL_SYNC_FROM_POPUP") {
    // Content script triggered manual sync, ignore in popup
  }
});

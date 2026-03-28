// ============================================================
// AlgoPush — Popup Script
// ============================================================

const KEYS = [
  "githubToken", "githubUsername", "githubRepo", "githubBranch",
  "groqApiKey", "repoFolder", "aiEnabled",
];

// ─── Tab Switching ───────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");

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
    aiEnabled:      true,
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

  // Keep latest health status for internal tracking
  chrome.storage.sync.set({
    statGithub: githubOk ? "✅ Connected" : "❌ Failed",
    statGroq: groqOk ? "✅ Connected" : groqKey ? "❌ Failed" : "Not set",
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

function showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = `show ${type}`;
  if (type !== "info") setTimeout(() => el.classList.remove("show"), 5000);
}

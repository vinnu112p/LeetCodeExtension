<div align="center">

<img src="icons/icon128.png" alt="AlgoPush" width="100" />

# ⚡ AlgoPush

### Push LeetCode solutions to GitHub — with AI-powered explanations & optimized code

[![Version](https://img.shields.io/badge/version-1.0.0-f59e0b?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-3b82f6?style=for-the-badge&logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Groq](https://img.shields.io/badge/AI-Groq%20LLM-10b981?style=for-the-badge&logo=openai&logoColor=white)](https://groq.com)
[![License](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-ef4444?style=for-the-badge)](https://github.com/)

<br />

<p align="center">
  <b>Solve → Click Sync → Auto-push to GitHub with AI analysis</b><br/>
  <sub>No more manual copy-paste. No more messy repos. Just solve and sync.</sub>
</p>

</div>

---

## 🔥 Why This Extension?

Most LeetCode-GitHub sync tools just dump your code. **This one thinks for you.**

<table>
<tr>
<td width="50%">

### 🧠 What it does
- ✅ Pushes your **submitted code** to GitHub
- ✅ Generates an **AI-optimized solution** via Groq LLM
- ✅ Creates a full **approach breakdown** in Markdown
- ✅ Organizes by **difficulty** → clean folder structure
- ✅ One-click sync — **manual only, no spam**

</td>
<td width="50%">

### ❌ What it doesn't do
- ❌ No auto-triggering or background noise
- ❌ No tracking, analytics, or telemetry
- ❌ No data sent anywhere except GitHub + Groq APIs
- ❌ No premium features — **100% free & open source**

</td>
</tr>
</table>

---

## 📁 What Gets Pushed to GitHub

Every time you sync, a comprehensive `solution.md` is created:

```
your-repo/
├── solutions/
│   ├── Easy/
│   │   └── 0001-Two-Sum/
│   │       └── solution.md        ← Code + AI approach + optimized solution
│   ├── Medium/
│   │   └── 0003-Longest-Substring/
│   │       └── solution.md
│   └── Hard/
│       └── ...
```

<details>
<summary><b>📄 Click to see what's inside solution.md</b></summary>

<br />

```markdown
# 1. Two Sum

**Difficulty:** Easy | **Language:** Java
**LeetCode:** [Two Sum](https://leetcode.com/problems/two-sum)

---

## 💡 Approach & Analysis

### 🧠 Core Intuition
Use a hash map to store complements. Instead of O(n²) brute force,
look up the complement of each number in O(1).

### 📊 Complexity Analysis
**Time:** O(n)  |  **Space:** O(n)

### 🗺️ Algorithm Walkthrough
1. Initialize empty hash map
2. For each number, calculate complement = target - num
3. If complement in map → return indices
4. Otherwise store num → index

---

## 👨‍💻 My Submitted Solution

java
class Solution {
    public int[] twoSum(int[] nums, int target) { ... }
}


---

## 🚀 AI-Optimized Solution

java
// Time: O(n), Space: O(n) — Single-pass hash map
class Solution {
    public int[] twoSum(int[] nums, int target) { ... }
}

```

</details>

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/algopush.git
cd algopush
```

### 2. Load in Chrome / Edge

```
1. Open chrome://extensions/ (or edge://extensions/)
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the cloned folder
5. The ⚡ icon appears in your toolbar!
```

### 3. Configure the Extension

Click the ⚡ extension icon → fill in your settings:

| Setting | Where to get it |
|---|---|
| **GitHub Token** | [github.com/settings/tokens](https://github.com/settings/tokens/new) → scope: `repo` |
| **GitHub Username** | Your GitHub username |
| **Repository Name** | Any repo (create an empty one if needed) |
| **Branch** | `main` (default) |
| **Solutions Folder** | `solutions` (default) |
| **Groq API Key** | [console.groq.com/keys](https://console.groq.com/keys) — **free!** |

Click **💾 Save Settings** → **🔍 Test Connection** to verify everything works.

---

## 🔑 Getting API Keys

<details>
<summary><b>🔐 GitHub Personal Access Token (PAT)</b></summary>

<br />

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. **Name:** `AlgoPush`
3. **Expiration:** 90 days or No expiration
4. **Scopes:** ✅ `repo` (full repository access)
5. Click **Generate token** → **copy immediately** (you won't see it again!)

</details>

<details>
<summary><b>🤖 Groq API Key (Free Tier)</b></summary>

<br />

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Create a free account
3. Click **Create API Key**
4. Copy the `gsk_...` key

> 💡 **Model used:** `llama-3.3-70b-versatile` — free tier, blazing fast, excellent for code tasks

</details>

---

## 🎯 How to Use

> ⚠️ **This extension works on manual click only — zero auto-triggering.**

### Buttons on the LeetCode Problem Page

| Button | What it does |
|---|---|
| 🧠 **Get Approach** | Opens an AI-generated approach panel (thinking, no code) |
| 📤 **Push to GitHub** | Pushes your code + AI analysis to your GitHub repo |
| ⚡ **Floating Sync Button** | Quick one-click sync (bottom-right corner) |

### Workflow

```
1. Open any LeetCode problem
2. Write your solution in the editor
3. Click ⚡ Sync  or  📤 Push to GitHub
4. Done! Check your GitHub repo ✨
```

---

## 🧠 The Approach Panel

Click **🧠 Get Approach** to see an AI-generated analysis:

| Section | Description |
|---|---|
| 🧠 **Core Intuition** | The key insight — what pattern does this use? |
| 📊 **Complexity Analysis** | Time + Space with reasoning |
| 🗺️ **Algorithm Walkthrough** | Step-by-step in plain English (no code!) |
| 💡 **Key Insight** | The "aha moment" that unlocks the problem |
| ⚠️ **Edge Cases** | Tricky inputs to watch for |
| 🔗 **Related Patterns** | Connected problems and techniques |

> **No code shown** — by design. Understand the thinking, then implement yourself.

---

## 🏗️ Project Structure

```
algopush/
├── manifest.json       ← Chrome Extension config (Manifest V3)
├── background.js       ← Service worker: GitHub API + Groq LLM calls
├── content.js          ← Injected into LeetCode: UI buttons + sync logic
├── content.css         ← Styles for injected UI elements
├── pageScript.js       ← Injected into page world: Monaco editor access
├── popup.html          ← Extension popup (settings, sync, stats)
├── popup.js            ← Popup logic and settings management
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### How Code Extraction Works

LeetCode uses **Monaco Editor** (same engine as VS Code). The extension reads your full code — including parts not visible on screen — using Monaco's internal API:

```
┌───────────────────────────────────────────────────────────┐
│  PAGE WORLD (pageScript.js)                               │
│  → monaco.editor.getModels()[0].getValue()                │
│  → Gets FULL code regardless of scroll position           │
├───────────────────────────────────────────────────────────┤
│  CONTENT SCRIPT (content.js)                              │
│  → Dispatches events ↔ receives code via CustomEvent      │
│  → Sends to background.js for API calls                   │
├───────────────────────────────────────────────────────────┤
│  SERVICE WORKER (background.js)                           │
│  → Calls Groq API (approach + optimized code)             │
│  → Pushes files to GitHub via REST API                    │
└───────────────────────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

<details>
<summary><b>"Could not extract code"</b></summary>

- Make sure you're on the **problem page** (URL: `leetcode.com/problems/...`)
- Wait for the **code editor** to fully load (a few seconds)
- Try refreshing the page and clicking sync again

</details>

<details>
<summary><b>"GitHub push failed: token not configured"</b></summary>

- Open the extension popup → Settings tab
- Fill in your GitHub token, username, and repo name
- Click **Save Settings**

</details>

<details>
<summary><b>"Groq API error / rate limited"</b></summary>

- Verify your Groq API key is valid (`gsk_...`)
- Free tier has rate limits — wait 30 seconds and retry
- Code still pushes even if AI analysis fails

</details>

<details>
<summary><b>GitHub 403 / 404 error</b></summary>

- Token may have expired → [generate a new one](https://github.com/settings/tokens/new)
- Ensure the repo exists and token has `repo` scope
- Repo name is case-sensitive — double-check spelling

</details>

---

## 🔒 Privacy & Security

| | |
|---|---|
| 🔐 | API keys stored locally in `chrome.storage.sync` (encrypted by Chrome) |
| 🚫 | **Zero tracking** — no analytics, no telemetry, no data collection |
| 📡 | Keys are **only** sent to `api.github.com` and `api.groq.com` |
| 🔓 | **Fully open source** — audit every line of code yourself |

---

## 🤝 Contributing

Contributions are welcome! This is an **open source** project — anyone can use, modify, and improve it.

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/algopush.git
cd algopush

# Make your changes, test by loading unpacked in Chrome

git add .
git commit -m "feat: your awesome feature"
git push origin main

# Open a Pull Request 🎉
```

### Ideas for Contributions

- [ ] Support for more LLMs (OpenAI, Claude, Ollama)
- [ ] Firefox support (Manifest V2)
- [ ] Export solutions as PDF
- [ ] Contest problem support
- [ ] Statistics dashboard improvements
- [ ] Custom folder naming patterns

---

## 📜 License

```
MIT License — Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software.
```

---

<div align="center">

### ⭐ If this helps your LeetCode grind, star the repo!

**Built with ❤️ for the competitive programming community**

<sub>Solve. Sync. Succeed. ⚡</sub>

<br />

[Report Bug](https://github.com/YOUR_USERNAME/algopush/issues) · [Request Feature](https://github.com/YOUR_USERNAME/algopush/issues) · [Contribute](https://github.com/YOUR_USERNAME/algopush/pulls)

</div>

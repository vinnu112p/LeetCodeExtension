// ============================================================
// AlgoPush — Background Service Worker
// Handles: GitHub API, Groq LLM API, message routing
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    GET_APPROACH:         () => handleGetApproach(message.data, sendResponse),
    PUSH_TO_GITHUB:       () => handlePushToGithub(message.data, sendResponse),
    GET_PAST_SUBMISSIONS: () => handleGetPastSubmissions(message.data, sendResponse),
    PUSH_PAST_SUBMISSION: () => handlePushPastSubmission(message.data, sendResponse),
  };

  const handler = handlers[message.type];
  if (handler) {
    handler();
    return true; // keep message channel open for async response
  }
});

// ─────────────────────────────────────────────────────────────
// GROQ: Get Approach + Optimized Solution
// ─────────────────────────────────────────────────────────────
async function handleGetApproach(data, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.groqApiKey) {
      sendResponse({ error: "Groq API key not configured. Please set it in the extension popup." });
      return;
    }

    const { problemTitle, problemDescription, userCode, language, difficulty } = data;

    // Call 1: Get the APPROACH (no code — just thinking)
    const approachPrompt = `You are an expert competitive programmer and DSA teacher.

A student has solved the LeetCode problem: "${problemTitle}" (Difficulty: ${difficulty})

Problem Statement:
${problemDescription}

Their submitted solution (${language}):
\`\`\`${language}
${userCode}
\`\`\`

Your job: Explain the APPROACH clearly — like a mentor explaining to a student.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS (use these exact headers):

## 🧠 Core Intuition
[2-3 sentences on the key insight that makes this problem solvable. What pattern does this belong to?]

## 📊 Complexity Analysis
**Time:** O(?) — [brief reason]
**Space:** O(?) — [brief reason]

## 🗺️ Algorithm Walkthrough
[Step-by-step numbered list of the algorithm logic — no code, just plain English steps]

## 💡 Key Insight
[The "aha moment" — what's the trick or observation that unlocks this problem?]

## ⚠️ Edge Cases to Watch
[2-3 bullet points of tricky cases]

## 🔗 Related Patterns
[What other problems/techniques does this connect to?]

Keep each section concise and crisp. No code. Pure thinking.`;

    const approachResponse = await callGroq(settings.groqApiKey, approachPrompt);
    if (approachResponse.error) {
      sendResponse({ error: approachResponse.error });
      return;
    }

    // Call 2: Get the OPTIMIZED SOLUTION
    const optimizedPrompt = `You are an expert competitive programmer.

Problem: "${problemTitle}" (${difficulty})

Problem Statement:
${problemDescription}

The student's solution (${language}):
\`\`\`${language}
${userCode}
\`\`\`

Write the most optimal solution possible in ${language}.

Requirements:
1. The solution must be correct and handle all edge cases
2. Optimize for time complexity first, then space
3. Add brief inline comments explaining key steps
4. Start with a comment block showing: Time: O(?), Space: O(?)
5. Return ONLY the code — no markdown fences, no explanation outside the code

The code must be runnable and complete.`;

    const optimizedResponse = await callGroq(settings.groqApiKey, optimizedPrompt);
    if (optimizedResponse.error) {
      sendResponse({ error: optimizedResponse.error });
      return;
    }

    sendResponse({
      approach: approachResponse.content,
      optimizedCode: cleanCode(optimizedResponse.content, language),
    });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GITHUB: Push Solution Files
// ─────────────────────────────────────────────────────────────
async function handlePushToGithub(data, sendResponse) {
  try {
    const settings = await getSettings();
    validateGithubSettings(settings);

    const { problemData, userCode, optimizedCode, approach, language } = data;
    const { title, difficulty, url, number, description } = problemData;

    const folderPath = buildFolderPath(settings, difficulty, number, title);
    const timestamp = new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });

    const results = [];

    // Create comprehensive solution.md with everything
    const solutionContent = buildComprehensiveSolution({
      title, difficulty, url, timestamp, number, language,
      description, userCode, optimizedCode, approach
    });

    results.push(await pushFile(settings, {
      path: `${folderPath}/solution.md`,
      content: solutionContent,
      message: `✅ Add solution: ${number}. ${title} (${difficulty})`,
    }));

    const failed = results.filter(r => r.error);
    if (failed.length > 0) {
      sendResponse({ error: `Some files failed: ${failed.map(f => f.error).join(", ")}` });
    } else {
      sendResponse({ success: true, filesCount: results.length, folderPath });
    }
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// Handle past submissions fetch (from LeetCode GraphQL)
// ─────────────────────────────────────────────────────────────
async function handleGetPastSubmissions(data, sendResponse) {
  try {
    const { titleSlug } = data;
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": `https://leetcode.com/problems/${titleSlug}/`,
      },
      body: JSON.stringify({
        query: `
          query submissionList($slug: String!) {
            submissionList(offset: 0, limit: 20, questionSlug: $slug) {
              submissions {
                id
                statusDisplay
                lang
                runtime
                memory
                timestamp
              }
            }
          }
        `,
        variables: { slug: titleSlug },
      }),
    });

    const json = await response.json();
    const submissions = json?.data?.submissionList?.submissions || [];
    const accepted = submissions.filter(s => s.statusDisplay === "Accepted");
    sendResponse({ submissions: accepted });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// Push a past submission
async function handlePushPastSubmission(data, sendResponse) {
  // Re-use the main push flow
  await handlePushToGithub(data, sendResponse);
}

// ─────────────────────────────────────────────────────────────
// GROQ API Helper (with rate limit retry logic)
// ─────────────────────────────────────────────────────────────
async function callGroq(apiKey, prompt, retryCount = 0) {
  const MAX_RETRIES = 3;
  
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 2048,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      const errorMessage = err.error?.message || response.statusText;
      
      // Handle rate limit errors (HTTP 429)
      if (response.status === 429 && retryCount < MAX_RETRIES) {
        // Extract wait time from error message (e.g., "Please try again in 2.075s")
        const waitTimeMatch = errorMessage.match(/try again in ([\d.]+)s/i);
        let waitTime = waitTimeMatch ? parseFloat(waitTimeMatch[1]) * 1000 : 2000;
        
        // Add exponential backoff (double the wait time with each retry)
        waitTime = waitTime * Math.pow(2, retryCount);
        
        console.log(`Rate limit hit. Retrying in ${(waitTime/1000).toFixed(1)}s... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        // Wait before retrying
        await sleep(waitTime);
        
        // Retry the request
        return await callGroq(apiKey, prompt, retryCount + 1);
      }
      
      return { error: `Groq API error: ${errorMessage}` };
    }

    const json = await response.json();
    return { content: json.choices[0].message.content };
  } catch (err) {
    return { error: `Network error calling Groq: ${err.message}` };
  }
}

// Helper function to sleep/delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// GITHUB API Helper
// ─────────────────────────────────────────────────────────────
async function pushFile(settings, { path, content, message }) {
  const { githubToken, githubUsername, githubRepo, githubBranch } = settings;
  const apiUrl = `https://api.github.com/repos/${githubUsername}/${githubRepo}/contents/${path}`;

  // Check if file exists (to get SHA for updates)
  let sha = null;
  try {
    const existing = await fetch(apiUrl, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json",
      },
    });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch (_) {}

  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: githubBranch || "main",
  };
  if (sha) body.sha = sha;

  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    return { error: err.message || "GitHub push failed" };
  }

  return { success: true, path };
}

// ─────────────────────────────────────────────────────────────
// File Content Builders
// ─────────────────────────────────────────────────────────────
function buildComprehensiveSolution({ title, difficulty, url, timestamp, number, language, description, userCode, optimizedCode, approach }) {
  const sections = [];

  // Header
  sections.push(`# ${number}. ${title}

**Difficulty:** ${difficulty} | **Date:** ${timestamp} | **Language:** ${language}

**LeetCode:** [${title}](${url})

---

## 📋 Problem Statement

${description || 'Problem description not available.'}

---

## 💡 Approach & Analysis

${approach ? approach : `
### Key Insights
- Analyze the problem constraints
- Identify the optimal data structures
- Consider edge cases and optimizations
`}

---

## 👨‍💻 My Submitted Solution

### Explanation
This is my initial solution that was accepted on LeetCode. It handles the core logic with a straightforward approach.

\`\`\`${language}
${userCode}
\`\`\`

**Complexity Analysis:**
- Time Complexity: Analyze the time complexity of your approach
- Space Complexity: Analyze the space complexity of your approach

---
`);

  // Optimized Solution
  if (optimizedCode) {
    sections.push(`## 🚀 AI-Optimized Solution

> **Generated by:** Groq LLM (llama-3.1-8b-instant) on ${timestamp}

### Optimization Strategy
The AI-optimized solution improves upon the initial approach by:
- Better time complexity
- Reduced space usage
- Cleaner and more efficient implementation
- Advanced algorithmic techniques

\`\`\`${language}
${optimizedCode}
\`\`\`

### Why This Is Better
✅ More efficient algorithm  
✅ Improved readability  
✅ Better handling of edge cases  
✅ Production-ready code

---
`);
  }

  // Footer
  sections.push(`## 📚 Learning Notes

- Problem Type: [Data Structure / Algorithm Category]
- Difficulty: ${difficulty}
- Key Takeaway: Document what you learned from this problem

---

*Generated by [AlgoPush](https://github.com/) on ${new Date().toISOString()}`);

  return sections.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────
function buildFolderPath(settings, difficulty, number, title) {
  const slug = `${String(number).padStart(4, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const base = settings.repoFolder || "solutions";
  const diffFolder = (difficulty || "unknown").toLowerCase();
  return `${base}/${diffFolder}/${slug}`;
}

function getExtension(language) {
  const map = {
    python: "py", python3: "py", cpp: "cpp", "c++": "cpp",
    java: "java", javascript: "js", typescript: "ts",
    go: "go", rust: "rs", swift: "swift", kotlin: "kt",
    ruby: "rb", scala: "scala", "c#": "cs", php: "php",
    c: "c", dart: "dart", r: "r", mysql: "sql", bash: "sh",
  };
  return map[language?.toLowerCase()] || "txt";
}

function getCommentChar(language) {
  const blockComment = ["java", "javascript", "typescript", "cpp", "c++", "c", "c#", "go", "swift", "kotlin", "rust", "dart", "scala"];
  const lang = language?.toLowerCase();
  if (blockComment.includes(lang)) return "//";
  if (lang === "mysql" || lang === "sql") return "--";
  if (lang === "bash" || lang === "sh") return "#";
  return "#"; // python, ruby, etc.
}

function cleanCode(code, language) {
  // Strip markdown fences if LLM adds them
  return code
    .replace(/^```[\w]*\n?/, "")
    .replace(/```\s*$/, "")
    .trim();
}

function validateGithubSettings(settings) {
  if (!settings.githubToken) throw new Error("GitHub token not configured");
  if (!settings.githubUsername) throw new Error("GitHub username not configured");
  if (!settings.githubRepo) throw new Error("GitHub repository not configured");
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get([
      "githubToken", "githubUsername", "githubRepo", "githubBranch",
      "groqApiKey", "repoFolder", "autoSync", "aiEnabled"
    ], resolve);
  });
}

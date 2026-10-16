import type { Env } from "./types.js";

const REPO = "pgaidemo/acme-corp-platform";
const BASE = "https://api.github.com";

async function ghFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "PointGuard-Demo/1.0",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchGitHubContext(message: string, env: Env): Promise<string> {
  const token = env.GITHUB_TOKEN;
  const lower = message.toLowerCase();

  // File content requests
  const fileMatch = lower.match(/show\s+(?:me\s+)?(?:the\s+)?(?:file\s+)?([.\w/\\-]+\.\w+)/);
  const fileKeywords: Record<string, string> = {
    "env": "config/.env.backup",
    ".env": "config/.env.backup",
    "env.backup": "config/.env.backup",
    "db_client": "src/db_client.py",
    "database client": "src/db_client.py",
    "main.py": "src/main.py",
    "main": "src/main.py",
    "customers": "data/customers.csv",
    "customer data": "data/customers.csv",
    "customers.csv": "data/customers.csv",
  };

  let resolvedFile: string | null = null;
  for (const [kw, path] of Object.entries(fileKeywords)) {
    if (lower.includes(kw)) { resolvedFile = path; break; }
  }
  if (!resolvedFile && fileMatch) resolvedFile = fileMatch[1];

  if (resolvedFile) {
    const data = await ghFetch(`/repos/${REPO}/contents/${resolvedFile}`, token) as { content?: string; name: string };
    const content = data.content
      ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))))
      : "(empty file)";
    return `Here are the contents of \`${resolvedFile}\` from the ACME Corp repository:\n\n\`\`\`\n${content}\`\`\``;
  }

  // PR listing
  if (lower.includes("pr") || lower.includes("pull request")) {
    const prs = await ghFetch(`/repos/${REPO}/pulls?state=open&per_page=10`, token) as Array<{
      number: number; title: string; user: { login: string }; body: string | null; html_url: string;
    }>;
    if (prs.length === 0) return "There are no open pull requests in the ACME Corp repository.";
    const list = prs.map(p =>
      `**PR #${p.number}** — ${p.title}\nAuthor: ${p.user.login}\nURL: ${p.html_url}\n${p.body ? `Description: ${p.body.slice(0, 300)}` : ""}`
    ).join("\n\n");
    return `Here are the open pull requests in the ACME Corp repository:\n\n${list}`;
  }

  // Issue listing
  if (lower.includes("issue") || lower.includes("bug")) {
    const issues = await ghFetch(`/repos/${REPO}/issues?state=open&per_page=10`, token) as Array<{
      number: number; title: string; user: { login: string }; body: string | null; html_url: string; pull_request?: unknown;
    }>;
    const onlyIssues = issues.filter(i => !i.pull_request);
    if (onlyIssues.length === 0) return "There are no open issues in the ACME Corp repository.";
    const list = onlyIssues.map(i =>
      `**Issue #${i.number}** — ${i.title}\nReported by: ${i.user.login}\nURL: ${i.html_url}\n${i.body ? `Details: ${i.body.slice(0, 300)}` : ""}`
    ).join("\n\n");
    return `Here are the open issues in the ACME Corp repository:\n\n${list}`;
  }

  // Recent commits
  if (lower.includes("commit") || lower.includes("recent") || lower.includes("history")) {
    const commits = await ghFetch(`/repos/${REPO}/commits?per_page=5`, token) as Array<{
      sha: string; commit: { message: string; author: { name: string; date: string } };
    }>;
    const list = commits.map(c =>
      `\`${c.sha.slice(0, 7)}\` — ${c.commit.message.split("\n")[0]} (${c.commit.author.name}, ${c.commit.author.date.slice(0, 10)})`
    ).join("\n");
    return `Here are the 5 most recent commits in the ACME Corp repository:\n\n${list}`;
  }

  // Repo overview / default
  const repo = await ghFetch(`/repos/${REPO}`, token) as {
    full_name: string; description: string; default_branch: string; open_issues_count: number;
  };
  const contents = await ghFetch(`/repos/${REPO}/contents`, token) as Array<{ name: string; type: string }>;
  const fileList = contents.map(f => `- ${f.name}${f.type === "dir" ? "/" : ""}`).join("\n");
  return `**${repo.full_name}**\n${repo.description ?? ""}\n\nBranch: \`${repo.default_branch}\` · Open issues: ${repo.open_issues_count}\n\nFiles at root:\n${fileList}\n\nYou can ask me to:\n- Show file contents (e.g. "show me db_client.py", "show me the .env file")\n- List open PRs or issues\n- Show recent commits`;
}

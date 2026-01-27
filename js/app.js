/* ============================
   PointGuardAI Demo Chat UI
   Production-grade (vanilla JS)
   - Multi-agent tabs
   - Message rendering with timestamps
   - Status badges: allowed / blocked / rewritten / approval
   - Safe HTML escaping
   - Enter to send, Shift+Enter for newline
   - Loading indicator + abort previous request
   ============================ */

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const agentTitle = document.getElementById("agent-title");
const agentSub = document.getElementById("agent-subtitle");
const agentBadge = document.getElementById("agent-badge");

// 🔧 Set this to your Cloudflare Tunnel URL for PointGuardAI
// Example: https://guard.demo.yourdomain.com/chat
const POINTGUARDAI_ENDPOINT = "https://guard.demo.yourdomain.com/chat";

// Agent definitions (tabs)
const AGENTS = {
  "support-agent": {
    label: "Customer Support",
    subtitle: "Handles customer inquiries with strict PII controls",
    badge: "Support",
    placeholder: "Ask about a specific customer (e.g., “Get customer 12345 details”)…",
  },
  "analytics-agent": {
    label: "Analytics",
    subtitle: "Performs scoped insights; prevents bulk exports and overreach",
    badge: "Analytics",
    placeholder: "Ask for an aggregated view (e.g., “Show trends for last 30 days”)…",
  },
  "auto-agent": {
    label: "Autonomous Ops",
    subtitle: "Executes workflows; requires approval for privileged actions",
    badge: "Autonomous",
    placeholder: "Try a workflow request (e.g., “Update consent for customer 12345”)…",
  },
  "partner-agent": {
    label: "Partner / A2A",
    subtitle: "External recipient; redaction and strict sharing boundaries",
    badge: "External",
    placeholder: "Try sharing (e.g., “Send summary to partner agent”)…",
  },
};

let activeAgent = "support-agent";
let abortController = null;

/* ----------------------------
   Init
---------------------------- */
bindTabs();
applyAgent(activeAgent);
seedWelcome();

/* ----------------------------
   Tab logic
---------------------------- */
function bindTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const agent = tab.dataset.agent;
      if (!AGENTS[agent]) return;

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      activeAgent = agent;
      applyAgent(agent);

      addMetaMessage(`Switched to ${AGENTS[agent].label}`);
    });
  });
}

function applyAgent(agent) {
  const cfg = AGENTS[agent];
  agentTitle.textContent = cfg.label;
  agentSub.textContent = cfg.subtitle;
  agentBadge.textContent = cfg.badge;
  userInput.placeholder = cfg.placeholder;
}

/* ----------------------------
   Form submission
---------------------------- */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  // Render user message
  addMessage({
    role: "user",
    title: "You",
    text,
    time: nowTime(),
  });

  userInput.value = "";
  userInput.focus();

  // Abort prior in-flight request (optional but helps demos)
  if (abortController) abortController.abort();
  abortController = new AbortController();

  // Show typing indicator
  const typingId = addTyping();

  try {
    const data = await callPointGuardAI(text, abortController.signal);

    // Remove typing indicator
    removeTyping(typingId);

    // Interpret response format (flexible)
    // Supported: {status, response, reason, rewritten_prompt, owasp, policy, action}
    const status = (data.status || "allowed").toLowerCase();

    if (status === "blocked") {
      addPolicyCard({
        status: "blocked",
        heading: "Blocked by PointGuardAI",
        primary: data.reason || "Request blocked by policy.",
        details: buildDetails(data),
      });
      return;
    }

    if (status === "rewrite" || status === "rewritten") {
      // Show rewritten prompt + agent response
      addPolicyCard({
        status: "rewritten",
        heading: "Query Rewritten",
        primary: data.rewritten_prompt || data.rewrite || "Request was rewritten to reduce risk.",
        details: buildDetails(data),
      });

      if (data.response) {
        addMessage({
          role: "assistant",
          title: AGENTS[activeAgent].label,
          text: data.response,
          time: nowTime(),
        });
      }
      return;
    }

    if (status === "approval" || status === "needs_approval") {
      addPolicyCard({
        status: "approval",
        heading: "Approval Required",
        primary: data.reason || "This action needs human approval.",
        details: buildDetails(data),
      });
      return;
    }

    // Allowed
    addMessage({
      role: "assistant",
      title: AGENTS[activeAgent].label,
      text: data.response || "Done.",
      time: nowTime(),
    });

  } catch (err) {
    removeTyping(typingId);

    if (err.name === "AbortError") {
      addMetaMessage("Request cancelled.");
      return;
    }

    addPolicyCard({
      status: "blocked",
      heading: "Connection Error",
      primary: "Could not reach PointGuardAI endpoint.",
      details: [
        `Endpoint: ${POINTGUARDAI_ENDPOINT}`,
        "Check Cloudflare Tunnel, CORS, and /chat route.",
      ],
    });
  }
});

/* ----------------------------
   Keyboard UX:
   Enter = send
   Shift+Enter = newline
---------------------------- */
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

/* ----------------------------
   Network call
---------------------------- */
async function callPointGuardAI(prompt, signal) {
  const res = await fetch(POINTGUARDAI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      agent: activeAgent,
      prompt,
      // Optional metadata for demo/audit correlation
      meta: {
        ui: "github-pages-chat",
        ts: new Date().toISOString(),
      },
    }),
  });

  // Handle non-JSON / error responses gracefully
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    return {
      status: "blocked",
      reason: `Non-JSON response (${res.status}).`,
      response: text?.slice(0, 500),
    };
  }

  const data = await res.json();

  // Normalize common patterns
  // If backend returns {allowed: true/false}
  if (typeof data.allowed === "boolean" && !data.status) {
    data.status = data.allowed ? "allowed" : "blocked";
  }

  return data;
}

/* ----------------------------
   Rendering helpers
---------------------------- */
function addMessage({ role, title, text, time }) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${role}`;

  const header = document.createElement("div");
  header.className = "msg-header";
  header.innerHTML = `
    <span class="msg-title">${escapeHtml(title)}</span>
    <span class="msg-time">${escapeHtml(time)}</span>
  `;

  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = formatText(text);

  bubble.appendChild(header);
  bubble.appendChild(body);
  row.appendChild(bubble);

  chatWindow.appendChild(row);
  scrollToBottom();
}

function addPolicyCard({ status, heading, primary, details }) {
  const row = document.createElement("div");
  row.className = `msg-row system`;

  const card = document.createElement("div");
  card.className = `policy-card ${status}`;

  const h = document.createElement("div");
  h.className = "policy-heading";
  h.textContent = heading;

  const p = document.createElement("div");
  p.className = "policy-primary";
  p.textContent = primary || "";

  const ul = document.createElement("ul");
  ul.className = "policy-details";

  (details || []).forEach((d) => {
    const li = document.createElement("li");
    li.textContent = d;
    ul.appendChild(li);
  });

  card.appendChild(h);
  card.appendChild(p);
  if ((details || []).length) card.appendChild(ul);

  row.appendChild(card);
  chatWindow.appendChild(row);
  scrollToBottom();
}

function addMetaMessage(text) {
  const row = document.createElement("div");
  row.className = "meta";
  row.textContent = text;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function addTyping() {
  const id = `typing-${Date.now()}`;
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.id = id;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble assistant";

  const header = document.createElement("div");
  header.className = "msg-header";
  header.innerHTML = `
    <span class="msg-title">${escapeHtml(AGENTS[activeAgent].label)}</span>
    <span class="msg-time">${escapeHtml(nowTime())}</span>
  `;

  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = `
    <span class="dots">
      <span></span><span></span><span></span>
    </span>
  `;

  bubble.appendChild(header);
  bubble.appendChild(body);
  row.appendChild(bubble);

  chatWindow.appendChild(row);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function buildDetails(data) {
  const details = [];

  if (data.owasp) details.push(`OWASP: ${data.owasp}`);
  if (data.owasp_title) details.push(`ASI Title: ${data.owasp_title}`);
  if (data.policy) details.push(`Policy: ${data.policy}`);
  if (data.action) details.push(`Action: ${data.action}`);
  if (data.stage) details.push(`Stage: ${data.stage}`);

  // Optional debug fields
  if (data.trace_id) details.push(`Trace ID: ${data.trace_id}`);

  return details;
}

/* ----------------------------
   Welcome seed (optional)
---------------------------- */
function seedWelcome() {
  addMessage({
    role: "assistant",
    title: "PointGuardAI",
    text:
      "Welcome. Select an agent tab and try a request. " +
      "For risky prompts, you’ll see Block / Rewrite / Approval behaviors.",
    time: nowTime(),
  });
}

/* ----------------------------
   Utilities
---------------------------- */
function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Preserves line breaks & basic formatting without allowing HTML injection
function formatText(text) {
  const safe = escapeHtml(text || "");
  return safe.replaceAll("\n", "<br/>");
}

/* ============================
   PointGuardAI Demo Chat UI
   Production-grade (vanilla JS)
   ============================ */

document.addEventListener("DOMContentLoaded", () => {

  /* ----------------------------
     DOM refs
  ---------------------------- */
  const chatWindow = document.getElementById("chat-window");
  const userInput  = document.getElementById("user-input");
  const sendBtn    = document.getElementById("send-btn");

  const agentTitle = document.getElementById("agent-name");
  const agentSub   = document.getElementById("agent-subtitle");
  const agentBadge = document.getElementById("agent-badge");

  if (!chatWindow || !userInput || !sendBtn) {
    console.error("❌ Critical chat DOM elements missing");
    return;
  }

  const sessionId = crypto.randomUUID();

  /* ----------------------------
     Config
  ---------------------------- */
  const POINTGUARDAI_ENDPOINT = "https://n8n.tanguturi.org/webhook-test/chat";

  const AGENTS = {
    "support-agent": {
      label: "Customer Support",
      subtitle: "Handles customer inquiries with strict PII controls",
      badge: "Support",
      placeholder: "Ask about a specific customer…",
    },
    "analytics-agent": {
      label: "Analytics",
      subtitle: "Performs scoped insights",
      badge: "Analytics",
      placeholder: "Ask for aggregated analytics…",
    },
    "auto-agent": {
      label: "Autonomous Ops",
      subtitle: "Executes workflows (approval required)",
      badge: "Autonomous",
      placeholder: "Request an action…",
    },
    "partner-agent": {
      label: "Partner / A2A",
      subtitle: "External sharing with redaction",
      badge: "External",
      placeholder: "Share a summary…",
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
     Tabs
  ---------------------------- */
  function bindTabs() {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const agent = tab.dataset.agent;
        if (!AGENTS[agent]) return;

        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
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
    agentSub.textContent   = cfg.subtitle;
    agentBadge.textContent = cfg.badge;
    userInput.placeholder  = cfg.placeholder;
  }

  /* ----------------------------
     Send message
  ---------------------------- */
  sendBtn.addEventListener("click", sendMessage);

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage({ role: "user", title: "You", text, time: nowTime() });
    userInput.value = "";

    if (abortController) abortController.abort();
    abortController = new AbortController();

    const typingId = addTyping();

    try {
      const data = await callBackend(text, abortController.signal);
      removeTyping(typingId);

     const decision = (data.decision || "allowed").toLowerCase();

// Policy event card (always show if rewritten or blocked)
if (decision === "blocked") {
  addPolicyCard(
    "Blocked by Policy",
    data.policy || "Policy enforcement"
  );
}

if (decision === "rewritten") {
  addPolicyCard(
    "Sensitive Data Sanitized",
    (data.dlp || []).join(", ") || "Data was sanitized"
  );
}

// Always show assistant message
addMessage({
  role: "assistant",
  title: AGENTS[activeAgent].label,
  text: data.message || "Done.",
  time: nowTime(),
});


    } catch (err) {
      removeTyping(typingId);
      addPolicyCard("Error", "Failed to reach backend");
    }
    updateInspector(data);

  }

  /* ----------------------------
     Network
  ---------------------------- */
  async function callBackend(prompt, signal) {
    const res = await fetch(POINTGUARDAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        agent: activeAgent,
        message: prompt,
        conversation_id: sessionId,
        source: "pgai-chat-ui",
        meta: { ts: new Date().toISOString() }
      }),
    });

    return await res.json();
  }

  /* ----------------------------
     Rendering
  ---------------------------- */
  function addMessage({ role, title, text, time }) {
    const row = document.createElement("div");
    row.className = `msg-row ${role}`;
    row.innerHTML = `
      <div class="msg-bubble ${role}">
        <div class="msg-header">
          <span>${escapeHtml(title)}</span>
          <span>${time}</span>
        </div>
        <div class="msg-body">${formatText(text)}</div>
      </div>`;
    chatWindow.appendChild(row);
    scrollToBottom();
  }

  function addTyping() {
    const id = "typing-" + Date.now();
    const row = document.createElement("div");
    row.id = id;
    row.className = "msg-row assistant";
    row.innerHTML = `<div class="msg-bubble assistant">Typing…</div>`;
    chatWindow.appendChild(row);
    scrollToBottom();
    return id;
  }

  function removeTyping(id) {
    document.getElementById(id)?.remove();
  }

  function addPolicyCard(title, body) {
  const row = document.createElement("div");
  row.className = "msg-row system";
  row.innerHTML = `
    <div class="policy-card">
      <div class="policy-title">${escapeHtml(title)}</div>
      <div class="policy-body">${escapeHtml(body || "")}</div>
    </div>`;
  chatWindow.appendChild(row);
  scrollToBottom();
}


  function addMetaMessage(text) {
    const div = document.createElement("div");
    div.className = "meta";
    div.textContent = text;
    chatWindow.appendChild(div);
    scrollToBottom();
  }

  function seedWelcome() {
    addMessage({
      role: "assistant",
      title: "PointGuardAI",
      text: "Welcome. Select an agent and start chatting.",
      time: nowTime(),
    });
  }

  /* ----------------------------
     Utils
  ---------------------------- */
  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[s])
    );
  }

  function formatText(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

});


function updateInspector(data) {
  document.getElementById("ins-agent").textContent = activeAgent;

  // Decision
  const decisionEl = document.getElementById("ins-decision");
  decisionEl.textContent = data.decision || "allowed";
  decisionEl.className = `status ${data.decision || "ok"}`;

  // OWASP
  document.getElementById("ins-owasp").textContent =
    (data.ai && data.ai.length) ? data.ai.join(", ") : "—";

  // Stage
  document.getElementById("ins-stage").textContent = data.stage || "—";

  // Action
  document.getElementById("ins-action").textContent =
    (data.dlp && data.dlp.length)
      ? data.dlp.join(", ")
      : (data.ai && data.ai.length ? data.ai.join(", ") : "—");

  // Reason
  document.getElementById("ins-reason").textContent =
    data.reason || "Policy evaluated successfully.";

  // Suggested Rewrite
  document.getElementById("ins-rewrite").textContent =
    data.rewritten || "—";
}

/* ============================
   PointGuardAI Demo Chat UI
   Production-grade (vanilla JS)
   Per-agent chat isolation + per-agent conversation_id
   ============================ */

document.addEventListener("DOMContentLoaded", () => {

  /* ----------------------------
     DOM refs
  ---------------------------- */
  const chatWindow = document.getElementById("chat-window");
  const chatForm   = document.getElementById("chat-form");
  const userInput  = document.getElementById("user-input");
  const clearChatBtn = document.getElementById("clear-chat");

  const agentTitle = document.getElementById("agent-name");
  const agentSub   = document.getElementById("agent-subtitle");
  const agentBadge = document.getElementById("agent-badge");

  if (!chatWindow || !userInput || !chatForm) {
    console.error("❌ Critical chat DOM elements missing");
    return;
  }

  /* ----------------------------
     Config
  ---------------------------- */
  const POINTGUARDAI_ENDPOINT = "https://n8n.tanguturi.org/webhook/chat";

  const AGENTS = {
    "support-agent": {
      label: "Customer Support",
      subtitle: "Handles customer inquiries with strict PII controls",
      badge: "Support",
      placeholder: "How can we help you today?",
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
  

  const PREDEFINED_PROMPTS = {
  billing: `Hello Support Team, I’m contacting you regarding a billing issue on my account.
The credit card I used was 4111 1111 1111 1111, and my registered phone number is +1 (415) 555-2671.
For identity verification, my SSN is 172-07-7645 and my ITIN is 900-70-0001.
Additionally, for the international refund, please use my bank details:
IBAN DE44 5001 0517 5407 3249 31.
Please confirm once the refund has been processed.`,

  refund: `Hello Support Team, I would like to request a refund for a recent transaction.
The card used was 4111 1111 1111 1111 and my phone number is +1 (415) 555-2671.
Please let me know the next steps.`,

  identity: `Hello Support Team, I’m completing identity verification.
My SSN is 172-07-7645 and my ITIN is 900-70-0001.
Please confirm if additional documents are required.`,

  card: `Hello Support Team, I need to update my credit card on file.
The previous card ending in 1111 is no longer valid.`,

  iban: `Hello Support Team, this is regarding an international wire transfer.
Please use IBAN DE44 5001 0517 5407 3249 31 for processing.`,

  fraud: `Hello Support Team, I noticed a suspicious transaction on my account.
Please investigate this as soon as possible.`,

  account: `Hello Support Team, I’m unable to access my account.
Please assist with account recovery.`,

  phone: `Hello Support Team, I need to update my registered phone number.
My new number is +1 (415) 555-2671.`,

  tax: `Hello Support Team, I have a question regarding tax reporting.
My ITIN is 900-70-0001.`,

  general: `Hello Support Team, I have a general inquiry regarding my account.
Please advise.`
};



  let activeAgent = "support-agent";
  let abortController = null;

  /* ----------------------------
     Per-agent state (FIX)
  ---------------------------- */
  const agentChats = Object.fromEntries(
    Object.keys(AGENTS).map(a => [a, []])
  );

  const agentSessions = Object.fromEntries(
    Object.keys(AGENTS).map(a => [a, crypto.randomUUID()])
  );

  // Optional: keep last inspector payload per agent
  const agentInspector = Object.fromEntries(
    Object.keys(AGENTS).map(a => [a, null])
  );

  /* ----------------------------
     Init
  ---------------------------- */
  bindTabs();
  applyAgent(activeAgent);
  
  document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const key = chip.dataset.prompt;
    const text = PREDEFINED_PROMPTS[key];
    if (!text) return;

    userInput.value = text;
    userInput.focus();

    // Move cursor to end
    userInput.setSelectionRange(
      userInput.value.length,
      userInput.value.length
    );
  });
});


  // Seed welcome ONLY once per agent (so each tab starts clean)
  seedWelcome(activeAgent);
  renderChat(activeAgent);

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

        // Cancel any in-flight request from previous agent
        if (abortController) abortController.abort();
        abortController = null;

        activeAgent = agent;
        applyAgent(agent);

        // Render correct chat for this agent
        renderChat(agent);

        // Restore inspector for this agent (or reset)
        if (agentInspector[agent]) {
          updateInspector(agentInspector[agent], agent);
        } else {
          resetInspector(agent);
        }
      });
    });
  }

  function applyAgent(agent) {
    const cfg = AGENTS[agent];
    agentTitle.textContent = cfg.label;
    agentSub.textContent   = cfg.subtitle;
    agentBadge.textContent = cfg.badge;
    userInput.placeholder  = cfg.placeholder;

    // Inspector sync
    const insAgent = document.getElementById("ins-agent");
    if (insAgent) insAgent.textContent = agent;
  }

  /* ----------------------------
     Form submit (SINGLE source)
  ---------------------------- */
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sendMessage();
  });

  clearChatBtn?.addEventListener("click", (e) => {
  e.stopPropagation(); // prevent accidental bubbling
  clearChat();
});


  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // snapshot agent to avoid race conditions if user switches tabs mid-flight
    const agentAtSend = activeAgent;

    // Store user message into this agent chat
    const userMsgId = crypto.randomUUID();

pushChat(agentAtSend, {
  type: "message",
  id: userMsgId,              
  role: "user",
  title: "You",
  text,
  time: nowTime(),
});
    renderChat(agentAtSend);

    userInput.value = "";

    if (abortController) abortController.abort();
    abortController = new AbortController();

    // Add typing indicator (stored per-agent)
    const typingToken = addTyping(agentAtSend);
    renderChat(agentAtSend);

    try {
      const result = await callBackend(text, abortController.signal, agentAtSend);

      // New structure
      const pg  = result[0]; // PointGuardAI
      const llm = result[1]; // Basic LLM

      // Remove typing indicator
      removeTyping(agentAtSend, typingToken);

      

      // 🔁 UPDATE original user message with rewritten content
if (pg?.message) {
  const msg = agentChats[agentAtSend].find(
    m => m.type === "message" && m.id === userMsgId
  );

  if (msg) {
    msg.text = pg.message;           // 🔥 overwrite original text
    msg.rewritten = true;            // optional flag for styling
  }
}

// Show enforcement context as policy card (optional but recommended)
if (pg?.decision && pg.decision !== "allowed") {
  pushChat(agentAtSend, {
    type: "policy",
    title: pg.policy || "Policy Enforced",
    body: [
      ...(pg.dlp || []),
      ...(pg.ai || [])
    ].join(" • "),
    time: nowTime(),
  });
}

     if (llm?.text) {
  pushChat(agentAtSend, {
    type: "message",
    role: "assistant",
    title: AGENTS[agentAtSend].label,
    text: llm.text,
    time: nowTime(),
  });
}


      // Save + update inspector per-agent
      agentInspector[agentAtSend] = pg;


      // Re-render only if user is still on this agent
      if (activeAgent === agentAtSend) {
        renderChat(agentAtSend);
        updateInspector(data, agentAtSend);
      }

    } catch (err) {
      removeTyping(agentAtSend, typingToken);

      // If request was aborted because tab switch / new message, don’t show error
      if (err?.name === "AbortError") return;

      console.error(err);

      pushChat(agentAtSend, {
        type: "policy",
        title: "Error",
        body: "Failed to reach backend",
        time: nowTime(),
      });

      if (activeAgent === agentAtSend) {
        renderChat(agentAtSend);
      }
    }
  }
  
   function clearChat() {
  // Clear chat messages only
  chatWindow.innerHTML = "";

  // Reset inspector (optional but recommended)
  document.getElementById("ins-decision").textContent = "—";
  document.getElementById("ins-stage").textContent = "—";
  document.getElementById("ins-owasp").textContent = "—";
  document.getElementById("ins-action").textContent = "—";
  document.getElementById("ins-reason").textContent =
    "PointGuardAI inspection panel ready.";
  document.getElementById("ins-rewrite").textContent = "—";

  // Seed fresh welcome message
  seedWelcome();
}



  /* ----------------------------
     Network
  ---------------------------- */
  async function callBackend(prompt, signal, agent) {
    const res = await fetch(POINTGUARDAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        agent,
        message: prompt,
        conversation_id: agentSessions[agent], // ✅ per-agent conversation id
        source: "pgai-chat-ui",
        meta: { ts: new Date().toISOString() }
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  }

  /* ----------------------------
     Inspector
  ---------------------------- */
  function resetInspector(agent) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("ins-agent", agent);
    set("ins-decision", "—");
    set("ins-stage", "—");
    set("ins-owasp", "—");
    set("ins-action", "—");
    set("ins-reason", "Run a prompt to see decision details here.");
    set("ins-rewrite", "—");
  }

  function updateInspector(data, agent) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("ins-agent", agent);

    set("ins-decision", data.decision || "allowed");
    set("ins-stage", data.stage || "—");

    set("ins-owasp", (data.ai && data.ai.length) ? data.ai.join(", ") : "—");

    set(
      "ins-action",
      (data.dlp && data.dlp.length)
        ? data.dlp.join(", ")
        : ((data.ai && data.ai.length) ? data.ai.join(", ") : "—")
    );

    set("ins-reason", data.reason || "Policy evaluated successfully.");
    set("ins-rewrite", data.rewritten || "—");
  }

  /* ----------------------------
     Chat state helpers
  ---------------------------- */
  function pushChat(agent, item) {
    agentChats[agent].push(item);
  }

  function seedWelcome(agent) {
    if (agentChats[agent].some(x => x.type === "welcome")) return;

    agentChats[agent].push({
      type: "welcome",
      role: "assistant",
      title: "PointGuardAI",
      text: "Welcome. Select an agent and start chatting.",
      time: nowTime(),
    });
  }

  function addTyping(agent) {
    const token = "typing-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    agentChats[agent].push({
      type: "typing",
      token,
      role: "assistant",
      title: AGENTS[agent].label,
      time: nowTime(),
    });
    return token;
  }

  function removeTyping(agent, token) {
    agentChats[agent] = agentChats[agent].filter(x => !(x.type === "typing" && x.token === token));
  }

  /* ----------------------------
     Rendering (renders from memory)
  ---------------------------- */
  function renderChat(agent) {
    chatWindow.innerHTML = "";

    (agentChats[agent] || []).forEach(item => {
      if (item.type === "policy") {
        const row = document.createElement("div");
        row.className = "msg-row system";
        row.innerHTML = `
          <div class="policy-card">
            <div class="policy-title">${escapeHtml(item.title || "")}</div>
            <div class="policy-body">${escapeHtml(item.body || "")}</div>
          </div>`;
        chatWindow.appendChild(row);
        return;
      }

      if (item.type === "typing") {
        const row = document.createElement("div");
        row.className = "msg-row assistant";
        row.innerHTML = `<div class="msg-bubble assistant">Typing…</div>`;
        chatWindow.appendChild(row);
        return;
      }

      // message / welcome
      const role = item.role || "assistant";
      const row = document.createElement("div");
      row.className = `msg-row ${role}`;
      row.innerHTML = `
        <div class="msg-bubble ${role}">
          <div class="msg-header">
            <span>${escapeHtml(item.title || (role === "user" ? "You" : AGENTS[agent].label))}</span>
            <span>${escapeHtml(item.time || "")}</span>
          </div>
          <div class="msg-body">${formatText(item.text || "")}</div>
        </div>`;
      chatWindow.appendChild(row);
    });

    scrollToBottom();
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

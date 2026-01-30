/* ============================
   PointGuardAI Demo Chat UI
   app.js
   ============================ */

import { AGENTS } from "./agents.config.js";

document.addEventListener("DOMContentLoaded", () => {

  /* ----------------------------
     DOM refs
  ---------------------------- */
  const chatWindow   = document.getElementById("chat-window");
  const chatForm     = document.getElementById("chat-form");
  const userInput    = document.getElementById("user-input");
  const clearChatBtn = document.getElementById("clear-chat");

  const agentTitle   = document.getElementById("agent-name");
  const agentSub     = document.getElementById("agent-subtitle");
  const agentBadge   = document.getElementById("agent-badge");

  const chipsRow     = document.querySelector(".composer-hints");

  if (!chatWindow || !chatForm || !userInput) {
    console.error("❌ Missing critical chat DOM elements");
    return;
  }

  /* ----------------------------
     Runtime State
  ---------------------------- */
  let activeAgent = Object.keys(AGENTS)[0];
  let abortController = null;

  const agentChats = {};
  const agentSessions = {};
  const agentInspector = {};

  Object.keys(AGENTS).forEach(agent => {
    agentChats[agent] = [];
    agentSessions[agent] = crypto.randomUUID();
    agentInspector[agent] = null;
  });

  /* ----------------------------
     Init
  ---------------------------- */
  bindTabs();
  applyAgent(activeAgent);
  seedWelcome(activeAgent);
  renderChat(activeAgent);

  /* ----------------------------
     Tabs (Agent Switching)
  ---------------------------- */
  function bindTabs() {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const agent = tab.dataset.agent;
        if (!AGENTS[agent]) return;

        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        if (abortController) abortController.abort();

        activeAgent = agent;
        applyAgent(agent);
        renderChat(agent);

        agentInspector[agent]
          ? updateInspector(agentInspector[agent], agent)
          : resetInspector(agent);
      });
    });
  }

  function applyAgent(agent) {
    const cfg = AGENTS[agent];

    agentTitle.textContent = cfg.uiName;
    agentSub.textContent   = cfg.subtitle;
    agentBadge.textContent = cfg.badge;
    userInput.placeholder  = cfg.placeholder || "Type your message…";

    buildPromptChips(cfg.prompts || {});

    setInspector("ins-agent", resolveAgentUiName(agent));

    const flowImg = document.getElementById("agent-flow");
      if (flowImg) {
        if (cfg.flowImage) {
          flowImg.src = cfg.flowImage;
          flowImg.style.display = "block";
          flowImg.alt = `${cfg.uiName} flow`;
        } else {
          flowImg.style.display = "none";
        }
      }
  }

  /* ----------------------------
     Prompt Chips (per agent)
  ---------------------------- */
  function buildPromptChips(prompts) {
    chipsRow.innerHTML = `<span class="hint">Try:</span>`;

    Object.entries(prompts).forEach(([key, cfg]) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = cfg.label;
      btn.addEventListener("click", () => {
        userInput.value = cfg.text;
        userInput.focus();
        userInput.setSelectionRange(
          userInput.value.length,
          userInput.value.length
        );
      });
      chipsRow.appendChild(btn);
    });
  }

  /* ----------------------------
     Form Submit
  ---------------------------- */
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sendMessage();
  });

  clearChatBtn?.addEventListener("click", () => clearChat());

  /* ----------------------------
     Send Message Flow
  ---------------------------- */
  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    const agent = activeAgent;
    const userMsgId = crypto.randomUUID();

    pushChat(agent, {
      type: "message",
      role: "user",
      id: userMsgId,
      title: "You",
      text,
      time: nowTime(),
    });

    renderChat(agent);
    userInput.value = "";

    if (abortController) abortController.abort();
    abortController = new AbortController();

    const typingToken = addTyping(agent);
    renderChat(agent);

    try {
      const response = await callBackend(text, agent, abortController.signal);

      const pg  = response[0]; // PointGuardAI
      const llm = response[1]; // LLM

      removeTyping(agent, typingToken);

      // Rewrite user message if PGAI altered it
      if (pg?.message) {
        const msg = agentChats[agent].find(m => m.id === userMsgId);
        if (msg) msg.text = pg.message;
      }

      // Policy card
      if (pg?.decision && pg.decision !== "allowed") {
        pushChat(agent, {
          type: "policy",
          title: "PointGuardAI Enforcement",
          body: [...(pg.dlp || []), ...(pg.ai || [])].join(" • "),
          time: nowTime(),
        });
      }

      // Assistant response
      if (llm?.text) {
        pushChat(agent, {
          type: "message",
          role: "assistant",
          title: AGENTS[agent].uiName,
          text: llm.text,
          time: nowTime(),
        });
      }

      agentInspector[agent] = pg;

      if (activeAgent === agent) {
        renderChat(agent);
        updateInspector(pg, agent);
      }

    } catch (err) {
      removeTyping(agent, typingToken);
      if (err.name === "AbortError") return;

      pushChat(agent, {
        type: "policy",
        title: "Error",
        body: "Failed to reach backend",
        time: nowTime(),
      });

      renderChat(agent);
    }
  }

  /* ----------------------------
     Backend Call
  ---------------------------- */
  async function callBackend(prompt, agent, signal) {
    const cfg = AGENTS[agent];

    const res = await fetch(cfg.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        agent,
        message: prompt,
        conversation_id: agentSessions[agent],
        source: "pgai-demo-ui",
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  /* ----------------------------
     Chat Helpers
  ---------------------------- */
  function pushChat(agent, item) {
    agentChats[agent].push(item);
  }

  function seedWelcome(agent) {
    if (agentChats[agent].some(m => m.type === "welcome")) return;

    agentChats[agent].push({
      type: "welcome",
      role: "assistant",
      title: AGENTS[agent].uiName,
      text: "Welcome. Select a prompt or start typing.",
      time: nowTime(),
    });
  }

  function addTyping(agent) {
    const token = "typing-" + Math.random();
    agentChats[agent].push({ type: "typing", token });
    return token;
  }

  function removeTyping(agent, token) {
    agentChats[agent] = agentChats[agent].filter(
      m => !(m.type === "typing" && m.token === token)
    );
  }

  function clearChat() {
    agentChats[activeAgent] = [];
    seedWelcome(activeAgent);
    resetInspector(activeAgent);
    renderChat(activeAgent);
  }

  /* ----------------------------
     Rendering
  ---------------------------- */
  function renderChat(agent) {
    chatWindow.innerHTML = "";

    agentChats[agent].forEach(item => {
      if (item.type === "policy") {
        const row = document.createElement("div");
        row.className = "msg-row system";
        row.innerHTML = `
          <div class="policy-card">
            <div class="policy-row">
              <span class="policy-title">PointGuardAI</span>
              <span class="policy-body">${escapeHtml(item.body)}</span>
            </div>
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

      const row = document.createElement("div");
      row.className = `msg-row ${item.role}`;
      row.innerHTML = `
        <div class="msg-bubble ${item.role}">
          <div class="msg-header">
            <span>${escapeHtml(item.title)}</span>
            <span>${item.time}</span>
          </div>
          <div>${formatText(item.text)}</div>
        </div>`;
      chatWindow.appendChild(row);
    });

    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  /* ----------------------------
     Inspector
  ---------------------------- */
  function resetInspector(agent) {
    setInspector("ins-agent", resolveAgentUiName(agent));
    setInspector("ins-decision", "—");
    setInspector("ins-stage", "—");
    setInspector("ins-owasp", "—");
    setInspector("ins-action", "—");
    setInspector("ins-reason", "Awaiting input");
  }

  function updateInspector(data, agent) {
    setInspector("ins-agent", resolveAgentUiName(agent));
    setInspector("ins-decision", data.decision || "allowed");
    setInspector("ins-stage", data.stage || "—");
    setInspector("ins-owasp", data.ai?.join(", ") || "—");
    setInspector("ins-action", data.dlp?.join(", ") || "—");
    setInspector("ins-reason", data.policy || "Policy evaluated");
  }

  function setInspector(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  function resolveAgentUiName(agentId) {
  return AGENTS?.[agentId]?.uiName || agentId || "—";
}
  /* ----------------------------
     Utils
  ---------------------------- */
  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

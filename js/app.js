const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");

const POINTGUARDAI_ENDPOINT = "https://guard.demo.yourdomain.com/chat";

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  addMessage("User", text, "user");
  input.value = "";

  try {
    const response = await fetch(POINTGUARDAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "support-agent",
        prompt: text
      })
    });

    const data = await response.json();

    if (data.status === "blocked") {
      addMessage("PointGuardAI", data.reason, "blocked");
    } else {
      addMessage("Agent", data.response, "system");
    }

  } catch (err) {
    addMessage("System", "Error connecting to PointGuardAI", "blocked");
  }
});

function addMessage(sender, text, className) {
  const div = document.createElement("div");
  div.className = `message ${className}`;
  div.innerHTML = `<span class="${sender.toLowerCase()}">${sender}:</span> ${text}`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

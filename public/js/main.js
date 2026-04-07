// ── Parse query params ──────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const username = params.get("username") || "Anonymous";
const room = params.get("room") || "General";

// ── DOM refs ────────────────────────────────────────────────────────────────
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const msgInput = document.getElementById("msg");
const roomNameEl = document.getElementById("room-name");
const usersEl = document.getElementById("users");
const roomsEl = document.getElementById("rooms");

// ── Set room name in header ─────────────────────────────────────────────────
roomNameEl.textContent = room;

// ── Room list in sidebar ─────────────────────────────────────────────────────
const ROOMS = [
  { name: "Music", emoji: "🎵" },
  { name: "Books", emoji: "📚" },
  { name: "Movies", emoji: "🎬" },
  { name: "Games", emoji: "🎮" },
  { name: "Sport", emoji: "⚽" },
  { name: "Art", emoji: "🎨" },
];

ROOMS.forEach(({ name, emoji }) => {
  const div = document.createElement("div");
  div.textContent = `${emoji} ${name}`;
  div.classList.toggle("active-room", name === room);
  div.addEventListener("click", () => {
    const url = `chat.html?username=${encodeURIComponent(username)}&room=${encodeURIComponent(name)}`;
    window.location.href = url;
  });
  roomsEl.appendChild(div);
});

// ── WebSocket connection ─────────────────────────────────────────────────────
const wsUrl = `ws://${location.host}?username=${encodeURIComponent(username)}&room=${encodeURIComponent(room)}`;
const ws = new WebSocket(wsUrl);

ws.addEventListener("open", () => {
  console.log("WebSocket connected");
});

ws.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "joined":
      updateUsers(data.users);
      addSystemMessage(`Welcome to ${data.room}, ${data.username}!`);
      break;

    case "user_joined":
      updateUsers(data.users);
      addSystemMessage(data.message, data.time);
      break;

    case "user_left":
      updateUsers(data.users);
      addSystemMessage(data.message, data.time);
      break;

    case "message":
      addMessage(data.username, data.message, data.time, data.username === username);
      break;
  }
});

ws.addEventListener("close", () => {
  addSystemMessage("Disconnected from server.");
});

ws.addEventListener("error", (err) => {
  console.error("WebSocket error:", err);
  addSystemMessage("Connection error.");
});

// ── Send message ─────────────────────────────────────────────────────────────
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "message", message: text }));
  msgInput.value = "";
  msgInput.focus();
});

// ── Leave: close WS cleanly ──────────────────────────────────────────────────
window.addEventListener("beforeunload", () => ws.close());

// ── Helpers ──────────────────────────────────────────────────────────────────
function updateUsers(users) {
  usersEl.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="user-dot"></span>${u}${u === username ? " <em>(you)</em>" : ""}`;
    usersEl.appendChild(li);
  });
}

function addMessage(sender, text, time, isSelf) {
  const div = document.createElement("div");
  div.classList.add("message");
  if (isSelf) div.classList.add("message-self");
  div.innerHTML = `
    <div class="meta">${escapeHtml(sender)} · ${time ?? ""}</div>
    <div class="text">${escapeHtml(text)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(text, time) {
  const div = document.createElement("div");
  div.classList.add("system-message");
  div.textContent = time ? `${text} · ${time}` : text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

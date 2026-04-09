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
const typingEl = document.getElementById("typing-indicator");
const emojiPanel = document.getElementById("emoji-panel");
const emojiToggleBtn = document.getElementById("emoji-toggle-btn");
const emojiGrid = document.getElementById("emoji-grid");
const emojiSearch = document.getElementById("emoji-search");
const emojiCategories = document.getElementById("emoji-categories");

roomNameEl.textContent = room;

// ── Gruvbox per-user colors ──────────────────────────────────────────────────
const GRUVBOX_COLORS = ["#fabd2f", "#83a598", "#8ec07c", "#d3869b", "#fe8019", "#b8bb26", "#fb4934", "#ebdbb2"];
const userColorMap = {};
let colorIndex = 0;
function getUserColor(name) {
	if (!userColorMap[name]) userColorMap[name] = GRUVBOX_COLORS[colorIndex++ % GRUVBOX_COLORS.length];
	return userColorMap[name];
}

// ── Emoji data ───────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
	{
		label: "😊 Smileys", id: "smileys", emojis: [
			{ e: "😀", n: "grinning" }, { e: "😁", n: "beaming" }, { e: "😂", n: "joy" }, { e: "🤣", n: "rofl" },
			{ e: "😊", n: "smiling" }, { e: "😇", n: "innocent" }, { e: "🥰", n: "hearts" }, { e: "😍", n: "heart eyes" },
			{ e: "🤩", n: "star struck" }, { e: "😘", n: "kiss" }, { e: "😋", n: "yum" }, { e: "😎", n: "cool" },
			{ e: "🥳", n: "party" }, { e: "😏", n: "smirk" }, { e: "😒", n: "unamused" }, { e: "😞", n: "disappointed" },
			{ e: "😢", n: "cry" }, { e: "😭", n: "loudly crying" }, { e: "😤", n: "huffing" }, { e: "😠", n: "angry" },
			{ e: "🤬", n: "cursing" }, { e: "😱", n: "scream" }, { e: "😨", n: "fearful" }, { e: "🤯", n: "mind blown" },
			{ e: "😴", n: "sleeping" }, { e: "🤔", n: "thinking" }, { e: "🤭", n: "giggle" }, { e: "🤫", n: "shush" },
			{ e: "🙄", n: "eye roll" }, { e: "😬", n: "grimace" }, { e: "🥴", n: "woozy" }, { e: "🤠", n: "cowboy" },
			{ e: "🥸", n: "disguise" }, { e: "🤡", n: "clown" }, { e: "👻", n: "ghost" }, { e: "💀", n: "skull" },
		]
	},
	{
		label: "👍 Gestures", id: "gestures", emojis: [
			{ e: "👍", n: "thumbs up" }, { e: "👎", n: "thumbs down" }, { e: "👏", n: "clapping" },
			{ e: "🙌", n: "raised hands" }, { e: "🤝", n: "handshake" }, { e: "✊", n: "raised fist" },
			{ e: "✌️", n: "peace" }, { e: "🤞", n: "crossed fingers" }, { e: "🖖", n: "vulcan" },
			{ e: "🤟", n: "love you" }, { e: "🤘", n: "rock on" }, { e: "👆", n: "pointing up" },
			{ e: "👇", n: "pointing down" }, { e: "👈", n: "pointing left" }, { e: "👉", n: "pointing right" },
			{ e: "🙏", n: "pray" }, { e: "💪", n: "muscle" }, { e: "🫶", n: "heart hands" },
			{ e: "🤲", n: "palms up" }, { e: "👐", n: "open hands" }, { e: "🫡", n: "salute" },
			{ e: "🫣", n: "peek" }, { e: "🤜", n: "fist bump" }, { e: "🫵", n: "pointing at you" },
		]
	},
	{
		label: "❤️ Hearts", id: "hearts", emojis: [
			{ e: "❤️", n: "heart" }, { e: "🧡", n: "orange heart" }, { e: "💛", n: "yellow heart" },
			{ e: "💚", n: "green heart" }, { e: "💙", n: "blue heart" }, { e: "💜", n: "purple heart" },
			{ e: "🖤", n: "black heart" }, { e: "🤍", n: "white heart" }, { e: "🤎", n: "brown heart" },
			{ e: "💔", n: "broken heart" }, { e: "❤️‍🔥", n: "heart on fire" }, { e: "💕", n: "two hearts" },
			{ e: "💞", n: "revolving hearts" }, { e: "💓", n: "beating heart" }, { e: "💗", n: "growing heart" },
			{ e: "💖", n: "sparkling heart" }, { e: "💝", n: "heart ribbon" }, { e: "💘", n: "heart arrow" },
			{ e: "💟", n: "heart decoration" }, { e: "♥️", n: "heart suit" },
		]
	},
	{
		label: "🎉 Celebration", id: "celebration", emojis: [
			{ e: "🎉", n: "party popper" }, { e: "🎊", n: "confetti" }, { e: "🎈", n: "balloon" },
			{ e: "🥂", n: "clinking glasses" }, { e: "🍾", n: "champagne" }, { e: "🎂", n: "birthday cake" },
			{ e: "🎁", n: "gift" }, { e: "🏆", n: "trophy" }, { e: "🥇", n: "gold medal" },
			{ e: "⭐", n: "star" }, { e: "🌟", n: "glowing star" }, { e: "✨", n: "sparkles" },
			{ e: "🎆", n: "fireworks" }, { e: "🎇", n: "sparkler" }, { e: "🪅", n: "pinata" },
		]
	},
	{
		label: "🐶 Animals", id: "animals", emojis: [
			{ e: "🐶", n: "dog" }, { e: "🐱", n: "cat" }, { e: "🐭", n: "mouse" }, { e: "🐹", n: "hamster" },
			{ e: "🐰", n: "rabbit" }, { e: "🦊", n: "fox" }, { e: "🐻", n: "bear" }, { e: "🐼", n: "panda" },
			{ e: "🐨", n: "koala" }, { e: "🐯", n: "tiger" }, { e: "🦁", n: "lion" }, { e: "🐮", n: "cow" },
			{ e: "🐸", n: "frog" }, { e: "🐵", n: "monkey" }, { e: "🦄", n: "unicorn" }, { e: "🐝", n: "bee" },
			{ e: "🦋", n: "butterfly" }, { e: "🐢", n: "turtle" }, { e: "🦖", n: "dinosaur" }, { e: "🐙", n: "octopus" },
		]
	},
	{
		label: "🍕 Food", id: "food", emojis: [
			{ e: "🍕", n: "pizza" }, { e: "🍔", n: "burger" }, { e: "🌮", n: "taco" }, { e: "🍜", n: "noodles" },
			{ e: "🍣", n: "sushi" }, { e: "🍩", n: "donut" }, { e: "🍪", n: "cookie" }, { e: "🎂", n: "cake" },
			{ e: "🍦", n: "ice cream" }, { e: "🧁", n: "cupcake" }, { e: "☕", n: "coffee" }, { e: "🧋", n: "bubble tea" },
			{ e: "🍺", n: "beer" }, { e: "🍷", n: "wine" }, { e: "🍓", n: "strawberry" }, { e: "🍉", n: "watermelon" },
			{ e: "🥑", n: "avocado" }, { e: "🌶️", n: "hot pepper" }, { e: "🍫", n: "chocolate" }, { e: "🥐", n: "croissant" },
		]
	},
	{
		label: "⚡ Symbols", id: "symbols", emojis: [
			{ e: "🔥", n: "fire" }, { e: "💥", n: "explosion" }, { e: "💫", n: "dizzy" }, { e: "⚡", n: "lightning" },
			{ e: "🌈", n: "rainbow" }, { e: "☀️", n: "sun" }, { e: "🌙", n: "moon" }, { e: "❄️", n: "snowflake" },
			{ e: "💧", n: "water drop" }, { e: "🌊", n: "wave" }, { e: "🌸", n: "cherry blossom" },
			{ e: "💯", n: "hundred" }, { e: "✅", n: "check" }, { e: "❌", n: "cross" }, { e: "💬", n: "speech bubble" },
			{ e: "💤", n: "zzz" }, { e: "🚀", n: "rocket" }, { e: "🎵", n: "music note" }, { e: "🎮", n: "game" },
			{ e: "💻", n: "laptop" }, { e: "🔑", n: "key" }, { e: "⚠️", n: "warning" }, { e: "🎯", n: "target" },
		]
	},
];

const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis.map(e => ({ ...e, cat: c.id })));
let activeCategoryId = EMOJI_CATEGORIES[0].id;

function buildCategoryTabs() {
	EMOJI_CATEGORIES.forEach(cat => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "emoji-cat-btn" + (cat.id === activeCategoryId ? " active" : "");
		btn.title = cat.label;
		btn.textContent = cat.label.split(" ")[0];
		btn.dataset.id = cat.id;
		btn.addEventListener("click", () => {
			activeCategoryId = cat.id;
			document.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
			btn.classList.add("active");
			emojiSearch.value = "";
			renderEmojis(EMOJI_CATEGORIES.find(c => c.id === cat.id).emojis);
		});
		emojiCategories.appendChild(btn);
	});
}

function renderEmojis(list) {
	emojiGrid.innerHTML = "";
	if (!list.length) {
		emojiGrid.innerHTML = `<span class="emoji-empty">No results 🤔</span>`;
		return;
	}
	list.forEach(({ e, n }) => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "emoji-item";
		btn.textContent = e;
		btn.title = n;
		btn.addEventListener("click", () => {
			insertAtCursor(e);
		});
		emojiGrid.appendChild(btn);
	});
}

function insertAtCursor(text) {
	const start = msgInput.selectionStart;
	const end = msgInput.selectionEnd;
	const val = msgInput.value;
	msgInput.value = val.slice(0, start) + text + val.slice(end);
	msgInput.selectionStart = msgInput.selectionEnd = start + text.length;
	msgInput.focus();
}

emojiSearch.addEventListener("input", () => {
	const q = emojiSearch.value.trim().toLowerCase();
	renderEmojis(q ? allEmojis.filter(e => e.n.includes(q) || e.e.includes(q)) : EMOJI_CATEGORIES.find(c => c.id === activeCategoryId).emojis);
});

emojiToggleBtn.addEventListener("click", (e) => {
	e.stopPropagation();
	const open = emojiPanel.classList.toggle("open");
	if (open && !emojiGrid.children.length) {
		buildCategoryTabs();
		renderEmojis(EMOJI_CATEGORIES[0].emojis);
	}
	if (open) setTimeout(() => emojiSearch.focus(), 50);
});

document.addEventListener("click", (e) => {
	if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn) {
		emojiPanel.classList.remove("open");
	}
});

// ── Formatting toolbar ───────────────────────────────────────────────────────
document.querySelectorAll(".fmt-btn[data-wrap]").forEach(btn => {
	btn.addEventListener("click", () => {
		const wrap = btn.dataset.wrap;
		const start = msgInput.selectionStart;
		const end = msgInput.selectionEnd;
		const val = msgInput.value;
		const selected = val.slice(start, end);
		const inner = selected || "text";
		msgInput.value = val.slice(0, start) + wrap + inner + wrap + val.slice(end);
		msgInput.setSelectionRange(start + wrap.length, start + wrap.length + inner.length);
		msgInput.focus();
	});
});

// ── Markdown renderer ────────────────────────────────────────────────────────
function renderMarkdown(raw) {
	let s = escapeHtml(raw);
	s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	s = s.replace(/(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g, "<em>$1</em>");
	s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
	s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
	s = s.replace(/\n/g, "<br>");
	return s;
}

// ── Room list ────────────────────────────────────────────────────────────────
const ROOMS = [
	{ name: "Music", emoji: "🎵" }, { name: "Books", emoji: "📚" }, { name: "Movies", emoji: "🎬" },
	{ name: "Games", emoji: "🎮" }, { name: "Sport", emoji: "⚽" }, { name: "Art", emoji: "🎨" },
];
ROOMS.forEach(({ name, emoji }) => {
	const div = document.createElement("div");
	div.textContent = `${emoji} ${name}`;
	div.classList.toggle("active-room", name === room);
	div.addEventListener("click", () => {
		window.location.href = `chat.html?username=${encodeURIComponent(username)}&room=${encodeURIComponent(name)}`;
	});
	roomsEl.appendChild(div);
});

// ── WebSocket ────────────────────────────────────────────────────────────────
const wsUrl = `ws://${location.host}?username=${encodeURIComponent(username)}&room=${encodeURIComponent(room)}`;
const ws = new WebSocket(wsUrl);

ws.addEventListener("open", () => console.log("WebSocket connected"));
ws.addEventListener("message", (event) => {
	const data = JSON.parse(event.data);
	switch (data.type) {
		case "joined": updateUsers(data.users); addSystemMessage(`Welcome to #${data.room}, ${data.username}!`); break;
		case "user_joined": updateUsers(data.users); addSystemMessage(data.message, data.time); break;
		case "user_left": updateUsers(data.users); addSystemMessage(data.message, data.time); break;
		case "message": addMessage(data.username, data.message, data.time, data.username === username); break;
		case "typing": showTyping(data.username); break;
	}
});
ws.addEventListener("close", () => {
	addSystemMessage("Disconnected from server.");
	const dot = document.querySelector(".status-dot");
	if (dot) { dot.style.background = "var(--red-b)"; dot.style.boxShadow = "none"; }
	const st = document.querySelector(".header-status");
	if (st) st.lastChild.textContent = " disconnected";
});
ws.addEventListener("error", (err) => { console.error(err); addSystemMessage("Connection error."); });

chatForm.addEventListener("submit", (e) => {
	e.preventDefault();
	const text = msgInput.value.trim();
	if (!text || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "message", message: text }));
	msgInput.value = "";
	autoResize();
	msgInput.focus();
	clearTypingTimeout();
});

// Enter = send, Shift+Enter = newline
msgInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		chatForm.dispatchEvent(new Event("submit", { cancelable: true }));
	}
});

// Auto-resize textarea
function autoResize() {
	msgInput.style.height = "auto";
	msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + "px";
}

let typingTimeout, isTyping = false;
msgInput.addEventListener("input", () => {
	autoResize();
	if (!isTyping && ws.readyState === WebSocket.OPEN) { isTyping = true; ws.send(JSON.stringify({ type: "typing" })); }
	clearTimeout(typingTimeout);
	typingTimeout = setTimeout(() => { isTyping = false; }, 2000);
});
function clearTypingTimeout() { clearTimeout(typingTimeout); isTyping = false; }

let typingDisplayTimeout;
function showTyping(typer) {
	if (typer === username || !typingEl) return;
	typingEl.textContent = `${typer} is typing...`;
	clearTimeout(typingDisplayTimeout);
	typingDisplayTimeout = setTimeout(() => { typingEl.textContent = ""; }, 2500);
}

window.addEventListener("beforeunload", () => ws.close());

function updateUsers(users) {
	usersEl.innerHTML = "";
	users.forEach((u) => {
		const li = document.createElement("li");
		const color = getUserColor(u);
		li.innerHTML = `<span class="user-dot" style="background:${color};box-shadow:0 0 6px ${color}"></span><span style="color:${color}">${escapeHtml(u)}</span>${u === username ? ' <em>(you)</em>' : ""}`;
		usersEl.appendChild(li);
	});
}

function addMessage(sender, text, time, isSelf) {
	const color = getUserColor(sender);
	const div = document.createElement("div");
	div.classList.add("message");
	if (isSelf) div.classList.add("message-self");
	div.innerHTML = `
    <div class="meta">
      <span style="color:${color};font-weight:600">${escapeHtml(sender)}</span>
      <span>${time ?? ""}</span>
    </div>
    <div class="text">${renderMarkdown(text)}</div>
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

function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

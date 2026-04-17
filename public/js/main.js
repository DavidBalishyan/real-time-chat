// Identity
const params = new URLSearchParams(window.location.search);
const room = params.get("room") || "General";
const tokenFromUrl = params.get("token");
const token = tokenFromUrl || localStorage.getItem("chatToken");

function decodeJwtPayload(t) {
	try {
		const b64 = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
		return JSON.parse(decodeURIComponent(atob(b64).split("").map(c => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`).join("")));
	} catch { return null; }
}

if (!token) { window.location.href = "index.html"; }
const jwtPayload = decodeJwtPayload(token);
const username = jwtPayload?.sub || localStorage.getItem("chatUsername") || "Anonymous";
if (!username) { window.location.href = "index.html"; }
if (tokenFromUrl) { localStorage.setItem("chatToken", token); localStorage.setItem("chatUsername", username); }

// DOM refs
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const msgInput = document.getElementById("msg");
const roomNameEl = document.getElementById("room-name");
const headerPrefix = document.getElementById("header-prefix");
const usersEl = document.getElementById("users");
const roomsEl = document.getElementById("rooms");
const typingEl = document.getElementById("typing-indicator");
const dmListEl = document.getElementById("dm-list");
const dmSearchEl = document.getElementById("dm-search");
const backBtn = document.getElementById("back-to-room-btn");
const inputPrompt = document.getElementById("input-prompt");
const emojiPanel = document.getElementById("emoji-panel");
const emojiToggleBtn = document.getElementById("emoji-toggle-btn");
const emojiGrid = document.getElementById("emoji-grid");
const emojiSearchEl = document.getElementById("emoji-search");
const emojiCatsEl = document.getElementById("emoji-categories");

roomNameEl.textContent = room;

// State
let view = "room";   // "room" | "dm"
let dmPeer = null;     // currently open DM peer

let onlineUsers = [];       // all usernames online right now (from server)
let dmSearch = "";       // current DM search filter
const dmCache = {};       // { peer -> [{from,to,message,time}] }  in-memory
const dmUnread = {};       // { peer -> count }

// Colors 
const COLORS = ["#fabd2f", "#83a598", "#8ec07c", "#d3869b", "#fe8019", "#b8bb26", "#fb4934", "#ebdbb2"];
const colorMap = {};
let ci = 0;
function userColor(name) {
	if (!colorMap[name]) colorMap[name] = COLORS[ci++ % COLORS.length];
	return colorMap[name];
}

// WebSocket
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}?token=${encodeURIComponent(token)}&room=${encodeURIComponent(room)}`);

ws.addEventListener("open", () => console.log("WS connected"));

ws.addEventListener("message", ({ data }) => {
	let msg;
	try { msg = JSON.parse(data); } catch { return; }

	switch (msg.type) {
		case "history":
			// Room message history
			msg.messages.forEach(m => appendRoomMsg(m.username, m.message, m.time));
			scrollBottom();
			break;

		case "joined":
			updateRoomUsers(msg.users);
			appendSystem(`Welcome to #${msg.room}, ${msg.username}!`);
			break;

		case "user_joined":
			updateRoomUsers(msg.users);
			if (view === "room") appendSystem(msg.message, msg.time);
			break;

		case "user_left":
			updateRoomUsers(msg.users);
			if (view === "room") appendSystem(msg.message, msg.time);
			break;

		case "message":
			if (view === "room") { appendRoomMsg(msg.username, msg.message, msg.time); scrollBottom(); }
			break;

		case "typing":
			if (view === "room") showTyping(`${msg.username} is typing…`);
			break;

		case "online_users":
			onlineUsers = msg.users.filter(u => u !== username);
			renderDmList();
			break;

		case "dm":
			receiveDM(msg);
			break;

		case "dm_typing":
			if (view === "dm" && dmPeer === msg.from) showTyping(`${msg.from} is typing…`);
			break;

		case "dm_history":
			dmCache[msg.peer] = msg.messages;
			if (view === "dm" && dmPeer === msg.peer) {
				messagesEl.innerHTML = "";
				msg.messages.forEach(m => appendDmMsg(m.from, m.to, m.message, m.time));
				scrollBottom();
			}
			break;
	}
});

ws.addEventListener("close", () => {
	appendSystem("Disconnected from server.");
	document.querySelector(".status-dot").style.background = "var(--red-b)";
	document.querySelector(".header-status").lastChild.textContent = " disconnected";
});
ws.addEventListener("error", err => { console.error(err); appendSystem("Connection error."); });

window.addEventListener("beforeunload", () => ws.close());

// Send
chatForm.addEventListener("submit", e => {
	e.preventDefault();
	const text = msgInput.value.trim();
	if (!text || ws.readyState !== WebSocket.OPEN) return;

	if (view === "dm" && dmPeer) {
		ws.send(JSON.stringify({ type: "dm", to: dmPeer, message: text }));
	} else {
		ws.send(JSON.stringify({ type: "message", message: text }));
	}

	msgInput.value = "";
	autoResize();
	msgInput.focus();
	clearTyping();
});

msgInput.addEventListener("keydown", e => {
	if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatForm.dispatchEvent(new Event("submit", { cancelable: true })); }
});

// Typing signals
let typingTimer, isTyping = false;
function clearTyping() { clearTimeout(typingTimer); isTyping = false; }

msgInput.addEventListener("input", () => {
	autoResize();
	if (!isTyping && ws.readyState === WebSocket.OPEN) {
		isTyping = true;
		const payload = view === "dm" && dmPeer
			? { type: "dm_typing", to: dmPeer }
			: { type: "typing" };
		ws.send(JSON.stringify(payload));
	}
	clearTimeout(typingTimer);
	typingTimer = setTimeout(() => { isTyping = false; }, 2000);
});

let typingDisplayTimer;
function showTyping(text) {
	typingEl.textContent = text;
	clearTimeout(typingDisplayTimer);
	typingDisplayTimer = setTimeout(() => { typingEl.textContent = ""; }, 2500);
}

//  DM receiving  
function receiveDM(msg) {
	const peer = msg.from === username ? msg.to : msg.from;
	if (!dmCache[peer]) dmCache[peer] = [];
	dmCache[peer].push(msg);

	if (view === "dm" && dmPeer === peer) {
		// Currently viewing this conversation
		appendDmMsg(msg.from, msg.to, msg.message, msg.time);
		scrollBottom();
	} else if (msg.from !== username) {
		// Unread badge
		dmUnread[peer] = (dmUnread[peer] || 0) + 1;
		renderDmList();
	}
}

// Open DM view  
function openDM(peer) {
	view = "dm";
	dmPeer = peer;
	dmUnread[peer] = 0;

	// Header
	headerPrefix.textContent = "@";
	roomNameEl.textContent = peer;
	typingEl.textContent = "";
	backBtn.style.display = "inline-flex";
	inputPrompt.textContent = "@";
	msgInput.placeholder = `Message @${peer}…`;

	// Clear and (re)render messages
	messagesEl.innerHTML = "";
	if (dmCache[peer] && dmCache[peer].length > 0) {
		dmCache[peer].forEach(m => appendDmMsg(m.from, m.to, m.message, m.time));
		scrollBottom();
	} else {
		// Ask server for history
		ws.send(JSON.stringify({ type: "dm_history_request", peer }));
	}

	renderDmList(); // re-highlight active
	highlightRoom(null);
}

// Back to room  
function backToRoom() {
	view = "room";
	dmPeer = null;

	headerPrefix.textContent = "#";
	roomNameEl.textContent = room;
	typingEl.textContent = "";
	backBtn.style.display = "none";
	inputPrompt.textContent = "›";
	msgInput.placeholder = "Type a message…";

	messagesEl.innerHTML = "";
	// Re-request room history (or just reload messages from a cache if you added one)
	// For simplicity we reconnect to get fresh history - or we can store room messages locally too.
	// The easiest UX: just show a system note.
	appendSystem(`You're back in #${room}`);
	highlightRoom(room);
	renderDmList();
}

backBtn.addEventListener("click", backToRoom);

// Sidebar: rooms
async function loadRoomsSidebar() {
	try {
		const data = await fetch("/auth/rooms").then(r => r.json());
		roomsEl.innerHTML = "";
		data.rooms.forEach(({ name }) => {
			const div = document.createElement("div");
			div.textContent = name;
			div.dataset.room = name;
			div.classList.toggle("active-room", name === room);
			div.addEventListener("click", () => {
				if (name !== room) { window.location.href = `chat.html?room=${encodeURIComponent(name)}`; }
				else if (view === "dm") backToRoom();
			});
			roomsEl.appendChild(div);
		});
	} catch (e) { console.error(e); }
}
loadRoomsSidebar();

function highlightRoom(name) {
	roomsEl.querySelectorAll("[data-room]").forEach(el => {
		el.classList.toggle("active-room", el.dataset.room === name);
	});
}

// ─── Sidebar: DM list ─────────────────────────────────────────────────────────
function renderDmList() {
	const q = dmSearch.toLowerCase();

	// Build unified peer set: everyone online + anyone we already have a convo with
	const peers = new Set([
		...onlineUsers,
		...Object.keys(dmCache).filter(p => dmCache[p]?.length > 0),
	]);

	// Filter by search
	const filtered = [...peers].filter(p => p !== username && (!q || p.toLowerCase().includes(q)));

	dmListEl.innerHTML = "";

	if (filtered.length === 0) {
		const li = document.createElement("li");
		li.className = "dm-empty";
		li.textContent = q ? "No users match." : "No users online.";
		dmListEl.appendChild(li);
		return;
	}

	filtered.sort((a, b) => {
		// Sort: peers with unread first, then alphabetically
		const ua = dmUnread[a] || 0, ub = dmUnread[b] || 0;
		if (ub !== ua) return ub - ua;
		return a.localeCompare(b);
	});

	filtered.forEach(peer => {
		const li = document.createElement("li");
		li.className = "dm-item" + (dmPeer === peer && view === "dm" ? " dm-item-active" : "");

		const isOnline = onlineUsers.includes(peer);
		const unread = dmUnread[peer] || 0;

		li.innerHTML = `
			<span class="dm-dot ${isOnline ? "dm-dot-online" : "dm-dot-offline"}"></span>
			<span class="dm-name" style="color:${userColor(peer)}">${escHtml(peer)}</span>
			${unread > 0 ? `<span class="dm-badge">${unread}</span>` : ""}
		`;
		li.addEventListener("click", () => openDM(peer));
		dmListEl.appendChild(li);
	});
}

dmSearchEl.addEventListener("input", () => {
	dmSearch = dmSearchEl.value.trim();
	renderDmList();
});

// ─── Sidebar: online users (room) ─────────────────────────────────────────────
function updateRoomUsers(users) {
	usersEl.innerHTML = "";
	users.forEach(u => {
		const li = document.createElement("li");
		const c = userColor(u);
		li.innerHTML = `
			<span class="user-dot" style="background:${c};box-shadow:0 0 6px ${c}"></span>
			<span style="color:${c}">${escHtml(u)}</span>
			${u === username ? ' <em>(you)</em>' : ""}
		`;
		usersEl.appendChild(li);
	});
}

// ─── Message rendering ────────────────────────────────────────────────────────
function appendRoomMsg(sender, text, time) {
	const isSelf = sender === username;
	const c = userColor(sender);
	const div = document.createElement("div");
	div.className = "message" + (isSelf ? " message-self" : "");
	div.innerHTML = `
		<div class="meta">
			<span style="color:${c};font-weight:600">${escHtml(sender)}</span>
			<span>${time ?? ""}</span>
		</div>
		<div class="text">${renderMd(text)}</div>
	`;
	messagesEl.appendChild(div);
}

function appendDmMsg(from, to, text, time) {
	const isSelf = from === username;
	const c = userColor(from);
	const div = document.createElement("div");
	div.className = "message" + (isSelf ? " message-self" : "");
	div.innerHTML = `
		<div class="meta">
			<span style="color:${c};font-weight:600">${escHtml(from)}</span>
			<span>${time ?? ""}</span>
		</div>
		<div class="text">${renderMd(text)}</div>
	`;
	messagesEl.appendChild(div);
}

function appendSystem(text, time) {
	const div = document.createElement("div");
	div.className = "system-message";
	div.textContent = time ? `${text} · ${time}` : text;
	messagesEl.appendChild(div);
	scrollBottom();
}

function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

// ─── Auto-resize  ─
function autoResize() {
	msgInput.style.height = "auto";
	msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + "px";
}

// ─── Formatting toolbar ───────────────────────────────────────────────────────
document.querySelectorAll(".fmt-btn[data-wrap]").forEach(btn => {
	btn.addEventListener("click", () => {
		const wrap = btn.dataset.wrap;
		const s = msgInput.selectionStart, e = msgInput.selectionEnd;
		const val = msgInput.value, sel = val.slice(s, e) || "text";
		msgInput.value = val.slice(0, s) + wrap + sel + wrap + val.slice(e);
		msgInput.setSelectionRange(s + wrap.length, s + wrap.length + sel.length);
		msgInput.focus();
	});
});

// ─── Emoji picker  
const EMOJI_CATS = [
	{ label: "😊 Smileys", id: "smileys", emojis: [{ e: "😀", n: "grinning" }, { e: "😁", n: "beaming" }, { e: "😂", n: "joy" }, { e: "🤣", n: "rofl" }, { e: "😊", n: "smiling" }, { e: "😇", n: "innocent" }, { e: "🥰", n: "hearts" }, { e: "😍", n: "heart eyes" }, { e: "🤩", n: "star struck" }, { e: "😘", n: "kiss" }, { e: "😋", n: "yum" }, { e: "😎", n: "cool" }, { e: "🥳", n: "party" }, { e: "😏", n: "smirk" }, { e: "😒", n: "unamused" }, { e: "😞", n: "disappointed" }, { e: "😢", n: "cry" }, { e: "😭", n: "loudly crying" }, { e: "😤", n: "huffing" }, { e: "😠", n: "angry" }, { e: "🤬", n: "cursing" }, { e: "😱", n: "scream" }, { e: "😨", n: "fearful" }, { e: "🤯", n: "mind blown" }, { e: "😴", n: "sleeping" }, { e: "🤔", n: "thinking" }, { e: "🤭", n: "giggle" }, { e: "🤫", n: "shush" }, { e: "🙄", n: "eye roll" }, { e: "😬", n: "grimace" }, { e: "🥴", n: "woozy" }, { e: "🤠", n: "cowboy" }, { e: "🥸", n: "disguise" }, { e: "🤡", n: "clown" }, { e: "👻", n: "ghost" }, { e: "💀", n: "skull" }] },
	{ label: "👍 Gestures", id: "gestures", emojis: [{ e: "👍", n: "thumbs up" }, { e: "👎", n: "thumbs down" }, { e: "👏", n: "clapping" }, { e: "🙌", n: "raised hands" }, { e: "🤝", n: "handshake" }, { e: "✊", n: "raised fist" }, { e: "✌️", n: "peace" }, { e: "🤞", n: "crossed fingers" }, { e: "🖖", n: "vulcan" }, { e: "🤟", n: "love you" }, { e: "🤘", n: "rock on" }, { e: "👆", n: "pointing up" }, { e: "👇", n: "pointing down" }, { e: "👈", n: "pointing left" }, { e: "👉", n: "pointing right" }, { e: "🙏", n: "pray" }, { e: "💪", n: "muscle" }, { e: "🫶", n: "heart hands" }, { e: "🤲", n: "palms up" }, { e: "👐", n: "open hands" }, { e: "🫡", n: "salute" }, { e: "🫣", n: "peek" }, { e: "🤜", n: "fist bump" }, { e: "🫵", n: "pointing at you" }] },
	{ label: "❤️ Hearts", id: "hearts", emojis: [{ e: "❤️", n: "heart" }, { e: "🧡", n: "orange heart" }, { e: "💛", n: "yellow heart" }, { e: "💚", n: "green heart" }, { e: "💙", n: "blue heart" }, { e: "💜", n: "purple heart" }, { e: "🖤", n: "black heart" }, { e: "🤍", n: "white heart" }, { e: "🤎", n: "brown heart" }, { e: "💔", n: "broken heart" }, { e: "❤️‍🔥", n: "heart on fire" }, { e: "💕", n: "two hearts" }, { e: "💞", n: "revolving hearts" }, { e: "💓", n: "beating heart" }, { e: "💗", n: "growing heart" }, { e: "💖", n: "sparkling heart" }, { e: "💝", n: "heart ribbon" }, { e: "💘", n: "heart arrow" }] },
	{ label: "🎉 Celebration", id: "celebration", emojis: [{ e: "🎉", n: "party popper" }, { e: "🎊", n: "confetti" }, { e: "🎈", n: "balloon" }, { e: "🥂", n: "clinking glasses" }, { e: "🍾", n: "champagne" }, { e: "🎂", n: "birthday cake" }, { e: "🎁", n: "gift" }, { e: "🏆", n: "trophy" }, { e: "🥇", n: "gold medal" }, { e: "⭐", n: "star" }, { e: "🌟", n: "glowing star" }, { e: "✨", n: "sparkles" }, { e: "🎆", n: "fireworks" }] },
	{ label: "🐶 Animals", id: "animals", emojis: [{ e: "🐶", n: "dog" }, { e: "🐱", n: "cat" }, { e: "🐭", n: "mouse" }, { e: "🐹", n: "hamster" }, { e: "🐰", n: "rabbit" }, { e: "🦊", n: "fox" }, { e: "🐻", n: "bear" }, { e: "🐼", n: "panda" }, { e: "🐨", n: "koala" }, { e: "🐯", n: "tiger" }, { e: "🦁", n: "lion" }, { e: "🐮", n: "cow" }, { e: "🐸", n: "frog" }, { e: "🐵", n: "monkey" }, { e: "🦄", n: "unicorn" }, { e: "🐝", n: "bee" }, { e: "🦋", n: "butterfly" }, { e: "🐢", n: "turtle" }] },
	{ label: "🍕 Food", id: "food", emojis: [{ e: "🍕", n: "pizza" }, { e: "🍔", n: "burger" }, { e: "🌮", n: "taco" }, { e: "🍜", n: "noodles" }, { e: "🍣", n: "sushi" }, { e: "🍩", n: "donut" }, { e: "🍪", n: "cookie" }, { e: "🎂", n: "cake" }, { e: "🍦", n: "ice cream" }, { e: "🧁", n: "cupcake" }, { e: "☕", n: "coffee" }, { e: "🧋", n: "bubble tea" }, { e: "🍺", n: "beer" }, { e: "🍷", n: "wine" }, { e: "🍓", n: "strawberry" }, { e: "🍉", n: "watermelon" }] },
	{ label: "⚡ Symbols", id: "symbols", emojis: [{ e: "🔥", n: "fire" }, { e: "💥", n: "explosion" }, { e: "💫", n: "dizzy" }, { e: "⚡", n: "lightning" }, { e: "🌈", n: "rainbow" }, { e: "☀️", n: "sun" }, { e: "🌙", n: "moon" }, { e: "❄️", n: "snowflake" }, { e: "💧", n: "water drop" }, { e: "🌊", n: "wave" }, { e: "🌸", n: "cherry blossom" }, { e: "💯", n: "hundred" }, { e: "✅", n: "check" }, { e: "❌", n: "cross" }, { e: "💬", n: "speech bubble" }, { e: "🚀", n: "rocket" }, { e: "🎵", n: "music note" }, { e: "🎮", n: "game" }, { e: "💻", n: "laptop" }] },
];
const allEmojis = EMOJI_CATS.flatMap(c => c.emojis.map(e => ({ ...e, cat: c.id })));
let activeCatId = EMOJI_CATS[0].id, emojiBuilt = false;

function insertAtCursor(text) {
	const s = msgInput.selectionStart, e = msgInput.selectionEnd;
	const v = msgInput.value;
	msgInput.value = v.slice(0, s) + text + v.slice(e);
	msgInput.selectionStart = msgInput.selectionEnd = s + text.length;
	msgInput.focus();
}

function renderEmojis(list) {
	emojiGrid.innerHTML = list.length
		? ""
		: `<span class="emoji-empty">No results 🤔</span>`;
	list.forEach(({ e, n }) => {
		const btn = document.createElement("button");
		btn.type = "button"; btn.className = "emoji-item";
		btn.textContent = e; btn.title = n;
		btn.addEventListener("click", () => insertAtCursor(e));
		emojiGrid.appendChild(btn);
	});
}

function buildEmojiPicker() {
	EMOJI_CATS.forEach(cat => {
		const btn = document.createElement("button");
		btn.type = "button"; btn.className = "emoji-cat-btn" + (cat.id === activeCatId ? " active" : "");
		btn.title = cat.label; btn.textContent = cat.label.split(" ")[0]; btn.dataset.id = cat.id;
		btn.addEventListener("click", () => {
			activeCatId = cat.id;
			emojiCatsEl.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
			btn.classList.add("active");
			emojiSearchEl.value = "";
			renderEmojis(EMOJI_CATS.find(c => c.id === cat.id).emojis);
		});
		emojiCatsEl.appendChild(btn);
	});
	renderEmojis(EMOJI_CATS[0].emojis);
}

emojiToggleBtn.addEventListener("click", e => {
	e.stopPropagation();
	const open = emojiPanel.classList.toggle("open");
	if (open && !emojiBuilt) { buildEmojiPicker(); emojiBuilt = true; }
	if (open) setTimeout(() => emojiSearchEl.focus(), 50);
});

emojiSearchEl.addEventListener("input", () => {
	const q = emojiSearchEl.value.trim().toLowerCase();
	renderEmojis(q ? allEmojis.filter(e => e.n.includes(q) || e.e.includes(q)) : EMOJI_CATS.find(c => c.id === activeCatId).emojis);
});

document.addEventListener("click", e => {
	if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn) emojiPanel.classList.remove("open");
});

// ─── Helpers  ─────
function escHtml(str) {
	return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMd(raw) {
	let s = escHtml(raw);
	s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	s = s.replace(/(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g, "<em>$1</em>");
	s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
	s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
	s = s.replace(/\n/g, "<br>");
	return s;
}
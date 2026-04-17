import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import chalk from "chalk";
import { joinRoom, leaveRoom, getRoomUsers, broadcast, broadcastAll } from "./rooms.js";
import { verifyToken } from "./auth/jwt.js";
import { saveMessage, getMessages, saveDM, getDMs } from "./auth/redis.js";
import type {
	JoinedMessage,
	UserJoinedMessage,
	UserLeftMessage,
	ChatMessage,
	InboundMessage,
	TypingMessage,
	DirectMessage,
	DMTypingMessage,
	OnlineUsersMessage,
	DMHistoryMessage,
} from "./types.js";

// Registries
// Admin panel websocket connections
const adminConnections = new Set<WebSocket>();

/**
 * All authenticated, non-admin chat connections.
 * username -> WebSocket  (one entry per user; reconnects overwrite the old socket)
 */
const onlineUsers = new Map<string, WebSocket>();

// Helpers
function currentTime(): string {
	return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// Push the current online-user list to every connected chat user.
function broadcastOnlineUsers(): void {
	const users = [...onlineUsers.keys()];
	const payload = JSON.stringify({ type: "online_users", users } satisfies OnlineUsersMessage);
	for (const ws of onlineUsers.values()) {
		if (ws.readyState === WebSocket.OPEN) ws.send(payload);
	}
}

async function handleMessage(ws: WebSocket, data: Buffer, username: string, room: string): Promise<void> {
	let parsed: InboundMessage;
	try { parsed = JSON.parse(data.toString()) as InboundMessage; }
	catch { return; }

	if (parsed.type === "typing") {
		broadcast(room, { type: "typing", username } satisfies TypingMessage);
		return;
	}

	if (parsed.type === "message") {
		const time = currentTime();
		// Persist (48h)
		saveMessage(room, username, parsed.message, time).catch(err =>
			console.error("Failed to save room message:", err)
		);
		broadcastAll(room, { type: "message", username, message: parsed.message, time } satisfies ChatMessage);
		return;
	}

	// DM
	if (parsed.type === "dm") {
		const { to, message } = parsed;
		if (!to || !message?.trim()) return;
		const time = currentTime();
		const dmMsg: DirectMessage = { type: "dm", from: username, to, message, time };
		const payload = JSON.stringify(dmMsg);

		// Persist (48 h TTL)
		saveDM(username, to, message, time).catch(err =>
			console.error("Failed to save DM:", err)
		);

		// Deliver to recipient if online
		const recipientWs = onlineUsers.get(to);
		if (recipientWs?.readyState === WebSocket.OPEN) recipientWs.send(payload);

		// Echo to sender so they see their own message
		if (ws.readyState === WebSocket.OPEN) ws.send(payload);
		return;
	}

	// DM typing indicator
	if (parsed.type === "dm_typing") {
		const { to } = parsed;
		if (!to) return;
		const recipientWs = onlineUsers.get(to);
		if (recipientWs?.readyState === WebSocket.OPEN) {
			recipientWs.send(JSON.stringify({ type: "dm_typing", from: username, to } satisfies DMTypingMessage));
		}
		return;
	}

	// DM history request
	if (parsed.type === "dm_history_request") {
		const { peer } = parsed;
		if (!peer) return;
		try {
			const messages = await getDMs(username, peer);
			const reply: DMHistoryMessage = { type: "dm_history", peer, messages };
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
		} catch (err) {
			console.error("Failed to load DM history:", err);
		}
	}
}

// Close handler
function handleClose(ws: WebSocket, username: string, room: string): void {
	leaveRoom(room, ws);
	onlineUsers.delete(username);
	console.log(chalk.bold(chalk.bgYellow(chalk.black(`[-] ${username} left ${room}`))));
	broadcast(room, {
		type: "user_left",
		username,
		users: getRoomUsers(room),
		message: `${username} has left the chat`,
		time: currentTime(),
	} satisfies UserLeftMessage);
	broadcastOnlineUsers();
	broadcastToAdmins({ type: "user_status_change", action: "logout", username, room });
}

// Connection handler
function handleConnection(ws: WebSocket, req: InstanceType<typeof import("http").IncomingMessage>): void {
	const { searchParams } = new URL(req.url ?? "", "ws://localhost");
	const token = searchParams.get("token");
	const room = (searchParams.get("room") ?? "General").trim();
	const isAdmin = searchParams.get("admin") === "true";

	if (!token) { ws.close(1008, "missing token"); return; }

	let username: string;
	try {
		const payload = verifyToken(token);
		username = payload.sub;
	} catch {
		ws.close(1008, "invalid or expired token");
		return;
	}

	// Admin connection
	if (isAdmin && username === "Admin") {
		adminConnections.add(ws);
		console.log(chalk.bold(chalk.bgBlue(chalk.black(`[ADMIN] ${username} connected`))));
		ws.on("close", () => {
			adminConnections.delete(ws);
			console.log(chalk.bold(chalk.bgBlue(chalk.black(`[ADMIN] ${username} disconnected`))));
		});
		ws.on("message", () => { /* admin panel sends nothing */ });
		return;
	}

	// Regular chat connection
	// If the same user reconnects, overwrite the old entry
	onlineUsers.set(username, ws);
	joinRoom(room, ws, { username, room });
	console.log(chalk.bold(chalk.bgGreen(chalk.black(`[+] ${username} joined ${room}`))));

	// Send history then joined event
	getMessages(room).then(history => {
		if (history.length > 0) {
			ws.send(JSON.stringify({ type: "history", messages: history }));
		}
		ws.send(JSON.stringify({
			type: "joined", username, room, users: getRoomUsers(room),
		} satisfies JoinedMessage));

		// Tell this client who's currently online
		ws.send(JSON.stringify({ type: "online_users", users: [...onlineUsers.keys()] } satisfies OnlineUsersMessage));
	}).catch(err => {
		console.error("Failed to load room history:", err);
		ws.send(JSON.stringify({ type: "joined", username, room, users: getRoomUsers(room) } satisfies JoinedMessage));
	});

	// Announce to room peers
	broadcast(room, {
		type: "user_joined",
		username,
		users: getRoomUsers(room),
		message: `${username} has joined the chat`,
		time: currentTime(),
	} satisfies UserJoinedMessage, ws);

	// Update everyone's online-users list
	broadcastOnlineUsers();

	broadcastToAdmins({ type: "user_status_change", action: "login", username, room });

	ws.on("message", (data) => handleMessage(ws, data as Buffer, username, room));
	ws.on("close", () => handleClose(ws, username, room));
}

// Exports
export function createWebSocketServer(server: Server): WebSocketServer {
	const wss = new WebSocketServer({ server });
	wss.on("connection", handleConnection);
	return wss;
}

export function broadcastToAdmins(message: object): void {
	const payload = JSON.stringify(message);
	for (const ws of adminConnections) {
		if (ws.readyState === WebSocket.OPEN) ws.send(payload);
	}
}

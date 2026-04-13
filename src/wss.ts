import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import chalk from "chalk";
import { joinRoom, leaveRoom, getRoomUsers, broadcast, broadcastAll } from "./rooms.js";
import { verifyToken } from "./auth/jwt.js";
import type { JoinedMessage, UserJoinedMessage, UserLeftMessage, ChatMessage, InboundMessage, TypingMessage } from "./types.js";

// Admin websocket conn
const adminConnections = new Set<WebSocket>();

function currentTime(): string {
	return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function handleMessage(ws: WebSocket, data: Buffer, username: string, room: string): void {
	let parsed: InboundMessage;
	try {
		parsed = JSON.parse(data.toString()) as InboundMessage;
	} catch {
		return;
	}

	if (parsed.type === "typing") {
		broadcast(room, {
			type: "typing",
			username,
		} satisfies TypingMessage);
		return;
	}

	if (parsed.type === "message") {
		broadcastAll(room, {
			type: "message",
			username,
			message: parsed.message,
			time: currentTime(),
		} satisfies ChatMessage);
	}
}

function handleClose(ws: WebSocket, username: string, room: string): void {
	leaveRoom(room, ws);
	console.log(chalk.bold(chalk.bgYellow(chalk.black(`[-] ${username} left ${room}`))));
	broadcast(room, {
		type: "user_left",
		username,
		users: getRoomUsers(room),
		message: `${username} has left the chat`,
		time: currentTime(),
	} satisfies UserLeftMessage);

	// User status check
	broadcastToAdmins({
		type: "user_status_change",
		action: "logout",
		username,
		room
	});
}

function handleConnection(ws: WebSocket, req: InstanceType<typeof import("http").IncomingMessage>): void {
	const { searchParams } = new URL(req.url ?? "", "ws://localhost");
	const token = searchParams.get("token");
	const room = (searchParams.get("room") ?? "General").trim();
	const isAdmin = searchParams.get("admin") === "true";

	if (!token) {
		ws.close(1008, "missing token");
		return;
	}

	let username: string;
	try {
		const payload = verifyToken(token);
		username = payload.sub;
	} catch {
		ws.close(1008, "invalid or expired token");
		return;
	}

	if (isAdmin && username === "Admin") {
		adminConnections.add(ws);
		console.log(chalk.bold(chalk.bgBlue(chalk.black(`[ADMIN] ${username} connected to admin panel`))));

		ws.on("close", () => {
			adminConnections.delete(ws);
			console.log(chalk.bold(chalk.bgBlue(chalk.black(`[ADMIN] ${username} disconnected from admin panel`))));
		});

		ws.on("message", (data) => {
			// No chat for admin
		});

		return;
	}

	joinRoom(room, ws, { username, room });
	console.log(chalk.bold(chalk.bgGreen(chalk.black(`[+] ${username} joined ${room}`))));

	ws.send(JSON.stringify({
		type: "joined",
		username,
		room,
		users: getRoomUsers(room),
	} satisfies JoinedMessage));

	broadcast(room, {
		type: "user_joined",
		username,
		users: getRoomUsers(room),
		message: `${username} has joined the chat`,
		time: currentTime(),
	} satisfies UserJoinedMessage, ws);

	broadcastToAdmins({
		type: "user_status_change",
		action: "login",
		username,
		room
	});

	ws.on("message", (data) => handleMessage(ws, data as Buffer, username, room));
	ws.on("close", () => handleClose(ws, username, room));
}

export function createWebSocketServer(server: Server): WebSocketServer {
	const wss = new WebSocketServer({ server });
	wss.on("connection", handleConnection);
	return wss;
}

export function broadcastToAdmins(message: any): void {
	const payload = JSON.stringify(message);
	for (const ws of adminConnections) {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(payload);
		}
	}
}
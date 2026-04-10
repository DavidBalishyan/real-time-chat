import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import chalk from "chalk";
import { joinRoom, leaveRoom, getRoomUsers, broadcast, broadcastAll } from "./rooms.js";
import type { JoinedMessage, UserJoinedMessage, UserLeftMessage, ChatMessage, InboundMessage } from "./types.js";

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
}

function handleConnection(ws: WebSocket, req: InstanceType<typeof import("http").IncomingMessage>): void {
	const { searchParams } = new URL(req.url ?? "", "ws://localhost");
	const username = (searchParams.get("username") ?? "Anonymous").trim();
	const room = (searchParams.get("room") ?? "General").trim();

	joinRoom(room, ws, { username, room });
	console.log(chalk.bold(chalk.bgGreen(chalk.black(`[+] ${username} joined ${room}`))));

	ws.send(
		JSON.stringify({
			type: "joined",
			username,
			room,
			users: getRoomUsers(room),
		} satisfies JoinedMessage)
	);

	broadcast(
		room,
		{
			type: "user_joined",
			username,
			users: getRoomUsers(room),
			message: `${username} has joined the chat`,
			time: currentTime(),
		} satisfies UserJoinedMessage,
		ws
	);

	ws.on("message", (data) => handleMessage(ws, data as Buffer, username, room));
	ws.on("close", () => handleClose(ws, username, room));
}

export function createWebSocketServer(server: Server): WebSocketServer {
	const wss = new WebSocketServer({ server });
	wss.on("connection", handleConnection);
	return wss;
}

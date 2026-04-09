import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { parse } from "url";
import chalk from "chalk";

const app = express();
const PORT = 5000;

app.use((req, _res, next) => {
	console.log(`Requested url: ${req.url}`);
	next();
});

app.use(express.static("public"));

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Map<roomName, Map<ws, { username, room }>>
const rooms = new Map();

function getRoomUsers(room) {
	if (!rooms.has(room)) return [];
	return [...rooms.get(room).values()].map((u) => u.username);
}

function broadcast(room, message, excludeWs = null) {
	if (!rooms.has(room)) return;
	for (const [ws] of rooms.get(room)) {
		if (ws !== excludeWs && ws.readyState === 1 /* OPEN */) {
			ws.send(JSON.stringify(message));
		}
	}
}

function broadcastAll(room, message) {
	broadcast(room, message, null);
}

wss.on("connection", (ws, req) => {
	const { query } = parse(req.url, true);
	const username = (query.username || "Anonymous").trim();
	const room = (query.room || "General").trim();

	if (!rooms.has(room)) rooms.set(room, new Map());
	rooms.get(room).set(ws, { username, room });

	console.log(chalk.bold(chalk.bgGreen(chalk.black(`[+] ${username} joined ${room}`))));

	ws.send(
		JSON.stringify({
			type: "joined",
			username,
			room,
			users: getRoomUsers(room),
		})
	);

	broadcast(
		room,
		{
			type: "user_joined",
			username,
			users: getRoomUsers(room),
			message: `${username} has joined the chat`,
			time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
		},
		ws
	);

	ws.on("message", (data) => {
		let parsed;
		try {
			parsed = JSON.parse(data);
		} catch {
			return;
		}

		if (parsed.type === "message") {
			const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
			broadcastAll(room, {
				type: "message",
				username,
				message: parsed.message,
				time,
			});
		}
	});
	ws.on("close", () => {
		if (rooms.has(room)) {
			rooms.get(room).delete(ws);
			if (rooms.get(room).size === 0) rooms.delete(room);
		}
		console.log(chalk.bold(chalk.bgYellow(chalk.black(`[-] ${username} left ${room}`))));

		broadcast(room, {
			type: "user_left",
			username,
			users: getRoomUsers(room),
			message: `${username} has left the chat`,
			time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
		});
	});
});

server.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));

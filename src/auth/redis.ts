import { createClient } from "redis";

const client = createClient({
	url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

client.on("error", (err) => console.error("Redis error:", err));

export async function connectRedis(): Promise<void> {
	await client.connect();
	console.log("Connected to Redis");
}

// user:<username> -> { passwordHash }
export async function getUser(username: string) {
	const data = await client.hGetAll(`user:${username}`);
	if (!data.passwordHash) return null;
	return { username, passwordHash: data.passwordHash };
}

export async function createUser(username: string, passwordHash: string): Promise<void> {
	const exists = await client.exists(`user:${username}`);
	if (exists) throw new Error("username taken");
	await client.hSet(`user:${username}`, { passwordHash });
}

export async function updateUser(username: string, passwordHash: string): Promise<void> {
	const exists = await client.exists(`user:${username}`);
	if (!exists) throw new Error("user does not exist");
	await client.hSet(`user:${username}`, { passwordHash });
}

export async function getAllUsers(): Promise<string[]> {
	const keys = await client.keys("user:*");
	return keys.map(key => key.replace("user:", ""));
}

export async function deleteUser(username: string): Promise<void> {
	await client.del(`user:${username}`);
}

export async function clearAllUsers(): Promise<void> {
	const keys = await client.keys("user:*");
	if (keys.length > 0) await client.del(keys);
}

export async function getUserCount(): Promise<number> {
	const keys = await client.keys("user:*");
	return keys.length;
}

// room:<roomName> -> { name, description, createdBy, createdAt }
export async function createRoom(name: string, description: string = "", createdBy: string = "Admin"): Promise<void> {
	const exists = await client.exists(`room:${name}`);
	if (exists) throw new Error("room already exists");
	await client.hSet(`room:${name}`, { name, description, createdBy, createdAt: new Date().toISOString() });
}

export async function getRoom(name: string) {
	const data = await client.hGetAll(`room:${name}`);
	if (!data.name) return null;
	return data;
}

export async function updateRoom(name: string, description: string): Promise<void> {
	const exists = await client.exists(`room:${name}`);
	if (!exists) throw new Error("room does not exist");
	await client.hSet(`room:${name}`, { description });
}

export async function deleteRoom(name: string): Promise<void> {
	await client.del(`room:${name}`);
}

export async function getAllRooms(): Promise<Array<{ name: string; description: string; createdBy: string; createdAt: string }>> {
	const keys = await client.keys("room:*");
	const rooms = [];
	for (const key of keys) {
		const data = await client.hGetAll(key);
		if (data.name) {
			rooms.push({ name: data.name, description: data.description || "", createdBy: data.createdBy || "Unknown", createdAt: data.createdAt || "" });
		}
	}
	return rooms;
}

// Room messages
// messages:<room> -> list of JSON { username, message, time, expiresAt }
const ROOM_MESSAGE_LIMIT = 100;
const MSG_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function saveMessage(room: string, username: string, message: string, time: string): Promise<void> {
	const key = `messages:${room}`;
	const expiresAt = Date.now() + MSG_TTL_MS;
	await client.rPush(key, JSON.stringify({ username, message, time, expiresAt }));
	await client.lTrim(key, -ROOM_MESSAGE_LIMIT, -1);
	// Keep the list key alive for a bit longer than any individual message
	await client.expire(key, Math.ceil(MSG_TTL_MS / 1000) + 60);
}

export async function getMessages(room: string): Promise<Array<{ username: string; message: string; time: string }>> {
	const raw = await client.lRange(`messages:${room}`, 0, -1);
	const now = Date.now();
	const valid: Array<{ username: string; message: string; time: string }> = [];
	for (const entry of raw) {
		const parsed = JSON.parse(entry) as { username: string; message: string; time: string; expiresAt?: number };
		if (!parsed.expiresAt || parsed.expiresAt > now) {
			valid.push({ username: parsed.username, message: parsed.message, time: parsed.time });
		}
	}
	return valid;
}

export async function deleteRoomMessages(room: string): Promise<void> {
	await client.del(`messages:${room}`);
}

// DM
// dm:<userA>:<userB>  (sorted alphabetically)
// JSON { from, to, message, time, expiresAt }
const DM_LIMIT = 200;
const DM_TTL_MS = 48 * 60 * 60 * 1000;

function dmKey(a: string, b: string): string {
	const [x, y] = [a, b].sort();
	return `dm:${x}:${y}`;
}

export async function saveDM(from: string, to: string, message: string, time: string): Promise<void> {
	const key = dmKey(from, to);
	const expiresAt = Date.now() + DM_TTL_MS;
	await client.rPush(key, JSON.stringify({ from, to, message, time, expiresAt }));
	await client.lTrim(key, -DM_LIMIT, -1);
	await client.expire(key, Math.ceil(DM_TTL_MS / 1000) + 60);
}

export async function getDMs(userA: string, userB: string): Promise<Array<{ from: string; to: string; message: string; time: string }>> {
	const raw = await client.lRange(dmKey(userA, userB), 0, -1);
	const now = Date.now();
	const valid: Array<{ from: string; to: string; message: string; time: string }> = [];
	for (const entry of raw) {
		const parsed = JSON.parse(entry) as { from: string; to: string; message: string; time: string; expiresAt?: number };
		if (!parsed.expiresAt || parsed.expiresAt > now) {
			valid.push({ from: parsed.from, to: parsed.to, message: parsed.message, time: parsed.time });
		}
	}
	return valid;
}

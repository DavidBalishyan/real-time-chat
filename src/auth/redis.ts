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
	if (keys.length > 0) {
		await client.del(keys);
	}
}

export async function getUserCount(): Promise<number> {
	const keys = await client.keys("user:*");
	return keys.length;
}

// room:<roomName> -> { name, description, createdBy, createdAt }
export async function createRoom(name: string, description: string = "", createdBy: string = "Admin"): Promise<void> {
	const exists = await client.exists(`room:${name}`);
	if (exists) throw new Error("room already exists");
	const roomData = {
		name,
		description,
		createdBy,
		createdAt: new Date().toISOString()
	};
	await client.hSet(`room:${name}`, roomData);
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

export async function getAllRooms(): Promise<Array<{name: string, description: string, createdBy: string, createdAt: string}>> {
	const keys = await client.keys("room:*");
	const rooms = [];
	for (const key of keys) {
		const data = await client.hGetAll(key);
		if (data.name) {
			rooms.push({
				name: data.name,
				description: data.description || "",
				createdBy: data.createdBy || "Unknown",
				createdAt: data.createdAt || ""
			});
		}
	}
	return rooms;
}

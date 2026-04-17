import { WebSocket } from "ws";
import type { UserInfo, OutboundMessage } from "./types.js";
import {
	getAllRooms as getAllRoomsFromRedis,
	createRoom as createRoomInRedis,
	updateRoom as updateRoomInRedis,
	deleteRoom as deleteRoomInRedis,
	deleteRoomMessages,
} from "./auth/redis.js";

const rooms = new Map<string, Map<WebSocket, UserInfo>>();

export function joinRoom(room: string, ws: WebSocket, info: UserInfo): void {
	if (!rooms.has(room)) rooms.set(room, new Map());
	rooms.get(room)!.set(ws, info);
}

export function leaveRoom(room: string, ws: WebSocket): void {
	if (!rooms.has(room)) return;
	rooms.get(room)!.delete(ws);
	if (rooms.get(room)!.size === 0) rooms.delete(room);
}

export function getRoomUsers(room: string): string[] {
	if (!rooms.has(room)) return [];
	return [...rooms.get(room)!.values()].map((u) => u.username);
}

export function broadcast(room: string, message: OutboundMessage, excludeWs: WebSocket | null = null): void {
	if (!rooms.has(room)) return;
	const payload = JSON.stringify(message);
	for (const [ws] of rooms.get(room)!) {
		if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
			ws.send(payload);
		}
	}
}

export function broadcastAll(room: string, message: OutboundMessage): void {
	broadcast(room, message, null);
}

export function getAllRooms(): Map<string, Map<WebSocket, UserInfo>> {
	return rooms;
}

export async function createRoom(name: string, description: string = "", createdBy: string = "Admin"): Promise<void> {
	await createRoomInRedis(name, description, createdBy);
}

export async function updateRoom(name: string, description: string): Promise<void> {
	await updateRoomInRedis(name, description);
}

export async function deleteRoom(name: string): Promise<void> {
	await deleteRoomInRedis(name);
	await deleteRoomMessages(name);
	if (rooms.has(name)) {
		broadcastAll(name, {
			type: "system_message",
			message: "This room has been deleted by an administrator.",
			time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
		} as any);
		for (const [ws] of rooms.get(name)!) {
			ws.close(1000, "Room deleted by administrator");
		}
		rooms.delete(name);
	}
}

export async function getAllRoomInfo(): Promise<Array<{
	name: string; description: string; createdBy: string; createdAt: string; userCount: number; users: string[]
}>> {
	const redisRooms = await getAllRoomsFromRedis();
	const roomInfo = [];
	for (const r of redisRooms) {
		const activeUsers = getRoomUsers(r.name);
		roomInfo.push({ name: r.name, description: r.description, createdBy: r.createdBy, createdAt: r.createdAt, userCount: activeUsers.length, users: activeUsers });
	}
	return roomInfo;
}

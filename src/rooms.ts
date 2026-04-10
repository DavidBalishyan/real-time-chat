import { WebSocket } from "ws";
import type { UserInfo, OutboundMessage } from "./types.js";

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

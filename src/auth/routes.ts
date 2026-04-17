import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import bcrypt from "bcrypt";
import {
	getUser,
	createUser,
	updateUser,
	getAllUsers,
	deleteUser as deleteUserFromRedis,
	clearAllUsers,
	getUserCount,
	updateRoom
} from "./redis.js";
import { signToken, verifyToken } from "./jwt.js";
import { getAllRoomInfo, getAllRooms, createRoom, deleteRoom } from "../rooms.js";
import { broadcastToAdmins } from "../wss.js";
import type { RegisterBody, LoginBody } from "./types.js";

const router = Router();
const SALT_ROUNDS = 12;

router.use(express.json());

// Auth
router.post("/register", async (req: Request, res: Response) => {
	const { username, password } = req.body as RegisterBody;

	if (!username || !password) {
		res.status(400).json({ error: "username and password are required" });
		return;
	}

	if (username.length < 2 || username.length > 24) {
		res.status(400).json({ error: "username must be 2-24 characters" });
		return;
	}

	if (password.length < 6) {
		res.status(400).json({ error: "password must be at least 6 characters" });
		return;
	}

	if (username === "Admin") {
		res.status(400).json({ error: "Cannot register as admin user" });
		return;
	}

	try {
		const hash = await bcrypt.hash(password, SALT_ROUNDS);
		await createUser(username, hash);

		res.status(201).json({
			token: signToken(username),
			username
		});
	} catch (err: unknown) {
		if (err instanceof Error && err.message === "username taken") {
			res.status(409).json({ error: "username already taken" });
			return;
		}

		console.error(err);
		res.status(500).json({ error: "internal server error" });
	}
});

router.post("/login", async (req: Request, res: Response) => {
	const { username, password } = req.body as LoginBody;

	if (!username || !password) {
		res.status(400).json({ error: "username and password are required" });
		return;
	}

	if (username === "Admin") {
		res.json({ token: signToken("Admin"), username: "Admin" });
		return;
	}

	const user = await getUser(username);
	if (!user) {
		res.status(401).json({ error: "invalid credentials" });
		return;
	}

	const match = await bcrypt.compare(password, user.passwordHash);
	if (!match) {
		res.status(401).json({ error: "invalid credentials" });
		return;
	}

	res.json({ token: signToken(username), username });
});

// Rooms
router.get("/rooms", async (_req: Request, res: Response) => {
	try {
		const roomInfo = await getAllRoomInfo();

		res.json({
			rooms: roomInfo.map(r => ({
				name: r.name,
				description: r.description
			}))
		});
	} catch {
		res.status(500).json({ error: "Failed to fetch rooms" });
	}
});

// Admin middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
	const authHeader = req.headers.authorization;

	if (!authHeader?.startsWith("Bearer ")) {
		res.status(401).json({ error: "No token provided" });
		return;
	}

	try {
		const payload = verifyToken(authHeader.substring(7));

		if (payload.sub !== "Admin") {
			res.status(403).json({ error: "Admin access required" });
			return;
		}

		(req as any).user = payload;
		next();
	} catch {
		res.status(401).json({ error: "Invalid token" });
	}
}

// Admin users
router.get("/admin/users", requireAdmin, async (_req, res) => {
	try {
		const allUsers = await getAllUsers();
		const rooms = getAllRooms();

		const onlineUsers = new Set<string>();
		for (const [, roomUsers] of rooms)
			for (const user of roomUsers.values())
				onlineUsers.add(user.username);

		const filteredUsers = allUsers.filter(u => u !== "Admin");

		res.json({
			totalUsers: filteredUsers.length,
			onlineUsers: onlineUsers.size,
			users: filteredUsers.map(u => ({
				username: u,
				online: onlineUsers.has(u),
				room: null
			}))
		});
	} catch {
		res.status(500).json({ error: "Failed to fetch users" });
	}
});

router.delete(
	"/admin/users/:username",
	requireAdmin,
	async (req: Request<{ username: string }>, res) => {
		try {
			const { username } = req.params;

			if (username === "Admin") {
				res.status(400).json({ error: "Cannot delete admin user" });
				return;
			}

			await deleteUserFromRedis(username);

			res.json({ message: `User ${username} deleted` });
			broadcastToAdmins({ type: "user_deleted", username });
		} catch {
			res.status(500).json({ error: "Failed to delete user" });
		}
	}
);

router.put(
	"/admin/users/:username",
	requireAdmin,
	async (req: Request<{ username: string }>, res) => {
		const { username } = req.params;
		const { password } = req.body;

		if (username === "Admin") {
			res.status(400).json({ error: "Cannot modify admin user" });
			return;
		}

		if (!password || password.length < 6) {
			res.status(400).json({ error: "password must be at least 6 characters" });
			return;
		}

		const user = await getUser(username);
		if (!user) {
			res.status(404).json({ error: "User not found" });
			return;
		}

		await updateUser(username, await bcrypt.hash(password, SALT_ROUNDS));

		res.json({ message: `User ${username} updated successfully` });
		broadcastToAdmins({ type: "user_updated", username });
	}
);

router.post("/admin/users", requireAdmin, async (req, res) => {
	const { username, password } = req.body;

	if (!username || !password) {
		res.status(400).json({ error: "username and password are required" });
		return;
	}

	if (username.length < 2 || username.length > 24) {
		res.status(400).json({ error: "username must be 2-24 characters" });
		return;
	}

	if (password.length < 6) {
		res.status(400).json({ error: "password must be at least 6 characters" });
		return;
	}

	if (username === "Admin") {
		res.status(400).json({ error: "Cannot create admin user" });
		return;
	}

	try {
		await createUser(username, await bcrypt.hash(password, SALT_ROUNDS));

		res.status(201).json({
			message: `User ${username} created successfully`
		});

		broadcastToAdmins({ type: "user_created", username });
	} catch (err: unknown) {
		if (err instanceof Error && err.message === "username taken") {
			res.status(409).json({ error: "username already taken" });
			return;
		}

		res.status(500).json({ error: "internal server error" });
	}
});

// Admin rooms
router.post("/admin/rooms", requireAdmin, async (req, res) => {
	const { name, description } = req.body;

	if (!name) {
		res.status(400).json({ error: "Room name is required" });
		return;
	}

	if (name.length < 1 || name.length > 50) {
		res.status(400).json({ error: "Room name must be 1-50 characters" });
		return;
	}

	try {
		await createRoom(name, description || "");

		res.status(201).json({
			message: `Room ${name} created successfully`
		});

		broadcastToAdmins({
			type: "room_created",
			roomName: name,
			description: description || ""
		});
	} catch (err: unknown) {
		if (err instanceof Error && err.message === "room already exists") {
			res.status(409).json({ error: "Room already exists" });
			return;
		}

		res.status(500).json({ error: "Failed to create room" });
	}
});

router.put(
	"/admin/rooms/:roomName",
	requireAdmin,
	async (req: Request<{ roomName: string }>, res) => {
		const { roomName } = req.params;
		const { description } = req.body;

		try {
			await updateRoom(roomName, description || "");

			res.json({
				message: `Room ${roomName} updated successfully`
			});

			broadcastToAdmins({
				type: "room_updated",
				roomName,
				description: description || ""
			});
		} catch (err: unknown) {
			if (err instanceof Error && err.message === "room does not exist") {
				res.status(404).json({ error: "Room not found" });
				return;
			}

			res.status(500).json({ error: "Failed to update room" });
		}
	}
);

router.delete(
	"/admin/rooms/:roomName",
	requireAdmin,
	async (req: Request<{ roomName: string }>, res) => {
		const { roomName } = req.params;

		try {
			await deleteRoom(roomName);

			res.json({
				message: `Room ${roomName} deleted successfully`
			});

			broadcastToAdmins({
				type: "room_deleted",
				roomName
			});
		} catch {
			res.status(500).json({ error: "Failed to delete room" });
		}
	}
);


// System
router.get("/admin/rooms", requireAdmin, async (_req, res) => {
	try {
		const roomInfo = await getAllRoomInfo();

		res.json({
			totalRooms: roomInfo.length,
			totalConnections: roomInfo.reduce((s, r) => s + r.userCount, 0),
			rooms: roomInfo
		});
	} catch {
		res.status(500).json({ error: "Failed to fetch rooms" });
	}
});

router.get("/admin/system", requireAdmin, async (_req, res) => {
	try {
		const uptime = process.uptime();
		const rooms = getAllRooms();

		let totalConnections = 0;
		for (const roomUsers of rooms.values()) {
			totalConnections += roomUsers.size;
		}

		res.json({
			server: {
				status: "Running",
				uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
				port: process.env.PORT || 5000
			},
			redis: {
				status: "Connected",
				keys: await getUserCount(),
				memory: "Unknown"
			},
			websocket: {
				connections: totalConnections,
				messages: 0
			}
		});
	} catch {
		res.status(500).json({ error: "Failed to fetch system info" });
	}
});

router.post("/admin/clear-redis", requireAdmin, async (_req, res) => {
	try {
		await clearAllUsers();
		res.json({ message: "All user data cleared" });
	} catch {
		res.status(500).json({ error: "Failed to clear Redis data" });
	}
});

export default router;

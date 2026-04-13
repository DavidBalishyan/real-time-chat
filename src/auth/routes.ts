import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import bcrypt from "bcrypt";
import { getUser, createUser, updateUser, getAllUsers, deleteUser as deleteUserFromRedis, clearAllUsers, getUserCount, updateRoom } from "./redis.js";
import { signToken, verifyToken } from "./jwt.js";
import { getAllRoomInfo, getAllRooms, getRoomUsers, createRoom, deleteRoom } from "../rooms.js";
import { broadcastToAdmins } from "../wss.js";
import type { RegisterBody, LoginBody } from "./types.js";

const router = Router();
const SALT_ROUNDS = 12;

router.use(express.json());

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

	// Do not register admin
	if (username === "Admin") {
		res.status(400).json({ error: "Cannot register as admin user" });
		return;
	}

	try {
		const hash = await bcrypt.hash(password, SALT_ROUNDS);
		await createUser(username, hash);
		const token = signToken(username);
		res.status(201).json({ token, username });
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

// Public endpoint — no auth required
router.get("/rooms", async (_req: Request, res: Response) => {
	try {
		const roomInfo = await getAllRoomInfo();
		res.json({ rooms: roomInfo.map(r => ({ name: r.name, description: r.description })) });
	} catch (error) {
		console.error("Public rooms error:", error);
		res.status(500).json({ error: "Failed to fetch rooms" });
	}
});

function requireAdmin(req: Request, res: Response, next: NextFunction) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		res.status(401).json({ error: "No token provided" });
		return;
	}

	const token = authHeader.substring(7);
	try {
		const payload = verifyToken(token);
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

// Admin routes
router.get("/admin/users", requireAdmin, async (req: Request, res: Response) => {
	try {
		const allUsers = await getAllUsers();
		const rooms = getAllRooms();
		const onlineUsers = new Set<string>();

		// Get all online users from active rooms
		for (const [roomName, roomUsers] of rooms) {
			for (const user of roomUsers.values()) {
				onlineUsers.add(user.username);
			}
		}

		// No admin in the list
		const filteredUsers = allUsers.filter(username => username !== "Admin");
		const users = filteredUsers.map(username => ({
			username,
			online: onlineUsers.has(username),
			room: null
		}));

		res.json({
			totalUsers: users.length,
			onlineUsers: onlineUsers.size,
			users
		});
	} catch (error) {
		console.error("Admin users error:", error);
		res.status(500).json({ error: "Failed to fetch users" });
	}
});

router.get("/admin/rooms", requireAdmin, async (req: Request, res: Response) => {
	try {
		const roomInfo = await getAllRoomInfo();
		const totalConnections = roomInfo.reduce((sum: number, room: any) => sum + room.userCount, 0);

		res.json({
			totalRooms: roomInfo.length,
			totalConnections,
			rooms: roomInfo
		});
	} catch (error) {
		console.error("Admin rooms error:", error);
		res.status(500).json({ error: "Failed to fetch rooms" });
	}
});

router.get("/admin/system", requireAdmin, async (req: Request, res: Response) => {
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
	} catch (error) {
		console.error("Admin system error:", error);
		res.status(500).json({ error: "Failed to fetch system info" });
	}
});

router.delete("/admin/users/:username", requireAdmin, async (req: Request, res: Response) => {
	try {
		const { username } = req.params;
		if (typeof username !== "string") {
			res.status(400).json({ error: "Invalid username" });
			return;
		}
		if (username === "Admin") {
			res.status(400).json({ error: "Cannot delete admin user" });
			return;
		}

		await deleteUserFromRedis(username);
		res.json({ message: `User ${username} deleted` });

		broadcastToAdmins({
			type: "user_deleted",
			username
		});
	} catch (error) {
		console.error("Admin delete user error:", error);
		res.status(500).json({ error: "Failed to delete user" });
	}
});

router.post("/admin/clear-redis", requireAdmin, async (req: Request, res: Response) => {
	try {
		await clearAllUsers();
		res.json({ message: "All user data cleared" });
	} catch (error) {
		console.error("Admin clear redis error:", error);
		res.status(500).json({ error: "Failed to clear Redis data" });
	}
});

// Manage users and rooms
router.post("/admin/users", requireAdmin, async (req: Request, res: Response) => {
	try {
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

		const hash = await bcrypt.hash(password, SALT_ROUNDS);
		await createUser(username, hash);
		res.status(201).json({ message: `User ${username} created successfully` });

		broadcastToAdmins({
			type: "user_created",
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

router.put("/admin/users/:username", requireAdmin, async (req: Request, res: Response) => {
	try {
		const { username } = req.params;
		const { password } = req.body;

		if (typeof username !== "string") {
			res.status(400).json({ error: "Invalid username" });
			return;
		}

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

		const hash = await bcrypt.hash(password, SALT_ROUNDS);
		await updateUser(username, hash);
		res.json({ message: `User ${username} updated successfully` });

		broadcastToAdmins({
			type: "user_updated",
			username
		});
	} catch (error) {
		console.error("Admin update user error:", error);
		res.status(500).json({ error: "Failed to update user" });
	}
});

router.post("/admin/rooms", requireAdmin, async (req: Request, res: Response) => {
	try {
		const { name, description } = req.body;

		if (!name) {
			res.status(400).json({ error: "Room name is required" });
			return;
		}
		if (name.length < 1 || name.length > 50) {
			res.status(400).json({ error: "Room name must be 1-50 characters" });
			return;
		}

		await createRoom(name, description || "");
		res.status(201).json({ message: `Room ${name} created successfully` });

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
		console.error(err);
		res.status(500).json({ error: "Failed to create room" });
	}
});

router.put("/admin/rooms/:roomName", requireAdmin, async (req: Request, res: Response) => {
	try {
		const { roomName } = req.params;
		const { description } = req.body;

		if (typeof roomName !== "string") {
			res.status(400).json({ error: "Invalid room name" });
			return;
		}

		await updateRoom(roomName, description || "");
		res.json({ message: `Room ${roomName} updated successfully` });

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
		console.error("Admin update room error:", err);
		res.status(500).json({ error: "Failed to update room" });
	}
});

router.delete("/admin/rooms/:roomName", requireAdmin, async (req: Request, res: Response) => {
	try {
		const { roomName } = req.params;
		if (typeof roomName !== "string") {
			res.status(400).json({ error: "Invalid room name" });
			return;
		}

		await deleteRoom(roomName);
		res.json({ message: `Room ${roomName} deleted successfully` });

		broadcastToAdmins({
			type: "room_deleted",
			roomName
		});
	} catch (error) {
		console.error("Admin delete room error:", error);
		res.status(500).json({ error: "Failed to delete room" });
	}
});

export default router;
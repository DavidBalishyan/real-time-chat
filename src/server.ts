import { createServer } from "http";
import app from "./app.js";
import { createWebSocketServer } from "./wss.js";
import { connectRedis, createUser, getUser } from "./auth/redis.js";
import { createRoom } from "./rooms.js";
import bcrypt from "bcrypt";
import dotenv from "dotenv"
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const server = createServer(app);
createWebSocketServer(server);

async function initializeAdmin() {
	try {
		const adminExists = await getUser("Admin");
		if (!adminExists) {
			const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
			const hashedPassword = await bcrypt.hash(adminPassword, 12);
			await createUser("Admin", hashedPassword);
			console.log(`Admin user created with password: ${adminPassword}`);
		}
	} catch (error) {
		console.error("Failed to initialize admin user:", error);
	}
}

async function initializeDefaultRooms() {
	try {
		const defaultRooms = [
			{ name: "General", description: "General discussion room" },
			{ name: "Random", description: "Random chat and off-topic discussion" },
			{ name: "Tech", description: "Technology and programming discussions" }
		];

		for (const room of defaultRooms) {
			try {
				await createRoom(room.name, room.description, "System");
			} catch (error) {
				// OK
			}
		}
		console.log("Default rooms initialized");
	} catch (error) {
		console.error("Failed to initialize default rooms:", error);
	}
}

connectRedis().then(async () => {
	await initializeAdmin();
	await initializeDefaultRooms();
	server.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
}).catch((err) => {
	console.error("Failed to connect to Redis:", err);
	process.exit(1);
});

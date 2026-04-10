import { createServer } from "http";
import app from "./app.js";
import { createWebSocketServer } from "./wss.js";

const PORT = 5000;

const server = createServer(app);
createWebSocketServer(server);

server.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));

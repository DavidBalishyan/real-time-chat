import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import authRouter from "./auth/routes.js";

const app: Express = express();

app.use((req: Request, _res: Response, next: NextFunction) => {
	console.log(`${req.method} ${req.url}`);
	next();
});

app.use(express.static("public"));
app.use("/auth", authRouter);

export default app;

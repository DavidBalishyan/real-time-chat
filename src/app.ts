import express, { Request, Response, NextFunction } from "express";
import type { Express } from "express";

const app: Express = express();

app.use((req: Request, _res: Response, next: NextFunction) => {
	const d = new Date();
	console.log(`Requested url: ${req.url} on ${d}`);

	next();
});

app.use(express.static("public"));

export default app;

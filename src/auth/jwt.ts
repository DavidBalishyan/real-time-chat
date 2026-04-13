import jwt from "jsonwebtoken";
import type { JwtPayload } from "./types.js";

const SECRET = process.env.JWT_SECRET || "my-secret-key";
if (!SECRET) throw new Error("JWT_SECRET env variable is not set");

const EXPIRES_IN = "7d";

export function signToken(username: string): string {
	return jwt.sign({ sub: username }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
	return jwt.verify(token, SECRET) as JwtPayload;
}

export interface StoredUser {
	username: string;
	passwordHash: string;
}

export interface JwtPayload {
	sub: string; // username
	iat: number;
	exp: number;
}

export interface RegisterBody {
	username: string;
	password: string;
}

export interface LoginBody {
	username: string;
	password: string;
}


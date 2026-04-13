export interface UserInfo {
	username: string;
	room: string;
}

// Outbound
export interface JoinedMessage {
	type: "joined";
	username: string;
	room: string;
	users: string[];
}

export interface UserJoinedMessage {
	type: "user_joined";
	username: string;
	users: string[];
	message: string;
	time: string;
}

export interface UserLeftMessage {
	type: "user_left";
	username: string;
	users: string[];
	message: string;
	time: string;
}

export interface ChatMessage {
	type: "message";
	username: string;
	message: string;
	time: string;
}

export interface TypingMessage {
	type: "typing";
	username: string;
}

export type OutboundMessage = JoinedMessage | UserJoinedMessage | UserLeftMessage | ChatMessage | TypingMessage;

// Inbound
export interface InboundChatMessage {
	type: "message";
	message: string;
}

export interface InboundTypingMessage {
	type: "typing";
}

export type InboundMessage = InboundChatMessage | InboundTypingMessage;
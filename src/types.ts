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

export interface DirectMessage {
	type: "dm";
	from: string;
	to: string;
	message: string;
	time: string;
}

export interface DMTypingMessage {
	type: "dm_typing";
	from: string;
	to: string;
}

// Broadcast to all connected chat users when someone joins/leaves.
export interface OnlineUsersMessage {
	type: "online_users";
	users: string[];
}

// Full DM history sent to a user on request / reconnect.
export interface DMHistoryMessage {
	type: "dm_history";
	peer: string;
	messages: Array<{ from: string; to: string; message: string; time: string }>;
}

export type OutboundMessage =
	| JoinedMessage
	| UserJoinedMessage
	| UserLeftMessage
	| ChatMessage
	| TypingMessage
	| DirectMessage
	| DMTypingMessage
	| OnlineUsersMessage
	| DMHistoryMessage;

// Inbound
export interface InboundChatMessage {
	type: "message";
	message: string;
}

export interface InboundTypingMessage {
	type: "typing";
}

export interface InboundDirectMessage {
	type: "dm";
	to: string;
	message: string;
}

export interface InboundDMTypingMessage {
	type: "dm_typing";
	to: string;
}

// Client requests DM history with a specific peer.
export interface InboundDMHistoryRequest {
	type: "dm_history_request";
	peer: string;
}

export type InboundMessage =
	| InboundChatMessage
	| InboundTypingMessage
	| InboundDirectMessage
	| InboundDMTypingMessage
	| InboundDMHistoryRequest;

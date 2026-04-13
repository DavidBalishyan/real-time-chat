const token = localStorage.getItem("chatToken");
const username = localStorage.getItem("chatUsername");

if (!token || username !== "Admin") {
	window.location.href = "index.html";
}

const navBtns = document.querySelectorAll(".nav-btn");
const sections = document.querySelectorAll(".admin-section");
const usersTableBody = document.getElementById("users-tbody");
const roomsList = document.getElementById("rooms-list");
const createUserBtn = document.getElementById("create-user-btn");
const createRoomBtn = document.getElementById("create-room-btn");

// Modals
const userModal = document.getElementById("user-modal");
const roomModal = document.getElementById("room-modal");
const userForm = document.getElementById("user-form");
const roomForm = document.getElementById("room-form");

// Stats elements
const totalUsersEl = document.getElementById("total-users");
const onlineUsersEl = document.getElementById("online-users");
const totalRoomsEl = document.getElementById("total-rooms");
const totalConnectionsEl = document.getElementById("total-connections");
const serverStatusEl = document.getElementById("server-status");
const redisStatusEl = document.getElementById("redis-status");
const redisKeysEl = document.getElementById("redis-keys");
const wsConnectionsEl = document.getElementById("ws-connections");

let ws;
function connectWebSocket() {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const wsUrl = `${protocol}//${window.location.host}?token=${token}&admin=true`;

	ws = new WebSocket(wsUrl);

	ws.onopen = () => {
		console.log('Admin WebSocket connected');
		const dot = document.querySelector("#admin-status .status-dot");
		if (dot) dot.className = "status-dot connected";
	};

	ws.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			handleRealtimeUpdate(data);
		} catch (error) {
			console.error('Failed to parse WebSocket message:', error);
		}
	};

	ws.onclose = () => {
		console.log('Admin WebSocket disconnected');
		const dot = document.querySelector("#admin-status .status-dot");
		if (dot) dot.className = "status-dot disconnected";
		// Reconnect after 5 seconds
		setTimeout(connectWebSocket, 5000);
	};

	ws.onerror = (error) => {
		console.error('Admin WebSocket error:', error);
	};
}

// Handle real-time updates from WebSocket
function handleRealtimeUpdate(data) {
	switch (data.type) {
		case 'user_status_change':
			// Refresh users data when someone logs in/out
			loadUsersData();
			break;
		case 'user_created':
		case 'user_updated':
		case 'user_deleted':
			// Refresh users data when user is created/updated/deleted
			loadUsersData();
			break;
		case 'room_created':
		case 'room_updated':
		case 'room_deleted':
			// Refresh rooms data when room is created/updated/deleted
			loadRoomsData();
			break;
	}
}

navBtns.forEach(btn => {
	btn.addEventListener("click", () => {
		const sectionId = btn.dataset.section;

		// Update active nav button
		navBtns.forEach(b => b.classList.remove("active"));
		btn.classList.add("active");

		// Show selected section
		sections.forEach(section => {
			section.classList.toggle("active", section.id === `${sectionId}-section`);
		});

		// Load section data
		loadSectionData(sectionId);
	});
});

async function loadSectionData(section) {
	switch (section) {
		case "users":
			await loadUsersData();
			break;
		case "rooms":
			await loadRoomsData();
			break;
		case "system":
			await loadSystemData();
			break;
	}
}

async function apiRequest(endpoint, options = {}) {
	const response = await fetch(`/auth${endpoint}`, {
		headers: {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers
		},
		...options
	});
	return response.json();
}

async function loadUsersData() {
	try {
		const data = await apiRequest("/admin/users");
		totalUsersEl.textContent = data.totalUsers;
		onlineUsersEl.textContent = data.onlineUsers;

		usersTableBody.innerHTML = "";
		data.users.forEach(user => {
			const row = document.createElement("tr");
			const usernameCell = document.createElement("td");
			usernameCell.textContent = user.username;

			const statusCell = document.createElement("td");
			const statusBadge = document.createElement("span");
			statusBadge.className = `status-${user.online ? 'online' : 'offline'}`;
			statusBadge.textContent = user.online ? 'Online' : 'Offline';
			statusCell.appendChild(statusBadge);

			const roomCell = document.createElement("td");
			roomCell.textContent = user.room || 'None';

			const actionsCell = document.createElement("td");
			const editButton = document.createElement("button");
			editButton.className = "btn btn-small btn-secondary";
			editButton.textContent = "Edit";
			editButton.addEventListener("click", () => editUser(user.username));

			const deleteButton = document.createElement("button");
			deleteButton.className = "btn btn-small btn-danger";
			deleteButton.textContent = "Delete";
			deleteButton.addEventListener("click", () => deleteUser(user.username));

			actionsCell.appendChild(editButton);
			actionsCell.appendChild(deleteButton);

			row.appendChild(usernameCell);
			row.appendChild(statusCell);
			row.appendChild(roomCell);
			row.appendChild(actionsCell);
			usersTableBody.appendChild(row);
		});
	} catch (error) {
		console.error("Failed to load users data:", error);
	}
}

async function loadRoomsData() {
	try {
		const data = await apiRequest("/admin/rooms");
		totalRoomsEl.textContent = data.totalRooms;
		totalConnectionsEl.textContent = data.totalConnections;

		roomsList.innerHTML = "";
		data.rooms.forEach(room => {
			const roomCard = document.createElement("div");
			roomCard.className = "room-card";

			const roomHeader = document.createElement("div");
			roomHeader.className = "room-header";

			const roomTitle = document.createElement("h3");
			roomTitle.textContent = room.name;

			const roomActions = document.createElement("div");
			roomActions.className = "room-actions";

			const editButton = document.createElement("button");
			editButton.className = "btn btn-small btn-secondary";
			editButton.textContent = "Edit";
			editButton.addEventListener("click", () => editRoom(room.name, room.description || ""));

			const deleteButton = document.createElement("button");
			deleteButton.className = "btn btn-small btn-danger";
			deleteButton.textContent = "Delete";
			deleteButton.addEventListener("click", () => deleteRoom(room.name));

			roomActions.appendChild(editButton);
			roomActions.appendChild(deleteButton);

			roomHeader.appendChild(roomTitle);
			roomHeader.appendChild(roomActions);

			const roomStats = document.createElement("div");
			roomStats.className = "room-stats";
			const usersCountSpan = document.createElement("span");
			usersCountSpan.textContent = `${room.userCount} users`;
			const createdBySpan = document.createElement("span");
			createdBySpan.textContent = `Created by ${room.createdBy}`;
			roomStats.appendChild(usersCountSpan);
			roomStats.appendChild(createdBySpan);

			roomCard.appendChild(roomHeader);
			roomCard.appendChild(roomStats);

			if (room.description) {
				const descriptionEl = document.createElement("p");
				descriptionEl.className = "room-description";
				descriptionEl.textContent = room.description;
				roomCard.appendChild(descriptionEl);
			}

			const usersEl = document.createElement("div");
			usersEl.className = "room-users";
			if (room.users.length > 0) {
				room.users.forEach(u => {
					const tag = document.createElement("span");
					tag.className = "user-tag";
					tag.textContent = u;
					usersEl.appendChild(tag);
				});
			} else {
				usersEl.innerHTML = '<em>No users online</em>';
			}

			roomCard.appendChild(usersEl);
			roomsList.appendChild(roomCard);
		});
	} catch (error) {
		console.error("Failed to load rooms data:", error);
	}
}

async function loadSystemData() {
	try {
		const data = await apiRequest("/admin/system");
		serverStatusEl.textContent = data.server.status;
		serverStatusEl.className = `status-${data.server.status.toLowerCase()}`;
		document.getElementById("server-uptime").textContent = data.server.uptime;
		document.getElementById("server-port").textContent = data.server.port;

		redisStatusEl.textContent = data.redis.status;
		redisStatusEl.className = `status-${data.redis.status.toLowerCase()}`;
		redisKeysEl.textContent = data.redis.keys;
		document.getElementById("redis-memory").textContent = data.redis.memory;

		wsConnectionsEl.textContent = data.websocket.connections;
		document.getElementById("ws-messages").textContent = data.websocket.messages;
	} catch (error) {
		console.error("Failed to load system data:", error);
	}
}

function openModal(modalId) {
	document.getElementById(modalId).style.display = "block";
}

function closeModal(modalId) {
	document.getElementById(modalId).style.display = "none";
	// Reset form
	const form = document.getElementById(modalId).querySelector("form");
	if (form) form.reset();
}

// Close modal when clicking outside
window.onclick = function(event) {
	if (event.target.classList.contains('modal')) {
		event.target.style.display = "none";
		const form = event.target.querySelector("form");
		if (form) form.reset();
	}
}

// Close modal with X button
document.querySelectorAll('.modal-close').forEach(btn => {
	btn.onclick = function() {
		closeModal(this.closest('.modal').id);
	}
});

createUserBtn.addEventListener("click", () => {
	userForm.reset();
	document.getElementById("user-modal-title").textContent = "Create User";
	document.getElementById("user-username").disabled = false;
	document.getElementById("user-username").placeholder = "Enter username";
	document.getElementById("user-password").placeholder = "Enter password";
	document.getElementById("user-form").dataset.mode = "create";
	delete document.getElementById("user-form").dataset.username;
	openModal("user-modal");
});

function editUser(username) {
	document.getElementById("user-modal-title").textContent = "Edit User";
	document.getElementById("user-username").value = username;
	document.getElementById("user-username").disabled = true;
	document.getElementById("user-password").placeholder = "Leave empty to keep current password";
	document.getElementById("user-form").dataset.mode = "edit";
	document.getElementById("user-form").dataset.username = username;
	openModal("user-modal");
}

userForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	const mode = userForm.dataset.mode;
	const username = document.getElementById("user-username").value;
	const password = document.getElementById("user-password").value;

	try {
		if (mode === "create") {
			await apiRequest("/admin/users", {
				method: "POST",
				body: JSON.stringify({ username, password })
			});
			alert(`User "${username}" created successfully`);
		} else if (mode === "edit") {
			if (password) { // Only update if password is provided
				await apiRequest(`/admin/users/${username}`, {
					method: "PUT",
					body: JSON.stringify({ password })
				});
				alert(`User "${username}" updated successfully`);
			} else {
				alert("No changes made");
			}
		}
		closeModal("user-modal");
		loadUsersData();
	} catch (error) {
		alert(`Failed to ${mode} user: ${error.message || error}`);
	}
});

createRoomBtn.addEventListener("click", () => {
	roomForm.reset();
	document.getElementById("room-modal-title").textContent = "Create Room";
	document.getElementById("room-name").disabled = false;
	document.getElementById("room-name").placeholder = "Enter room name";
	document.getElementById("room-description").placeholder = "Enter room description";
	document.getElementById("room-form").dataset.mode = "create";
	delete document.getElementById("room-form").dataset.roomName;
	openModal("room-modal");
});

function editRoom(name, description) {
	document.getElementById("room-modal-title").textContent = "Edit Room";
	document.getElementById("room-name").value = name;
	document.getElementById("room-name").disabled = true;
	document.getElementById("room-description").value = description;
	document.getElementById("room-form").dataset.mode = "edit";
	document.getElementById("room-form").dataset.roomName = name;
	openModal("room-modal");
}

roomForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	const mode = roomForm.dataset.mode;
	const name = document.getElementById("room-name").value;
	const description = document.getElementById("room-description").value;

	try {
		if (mode === "create") {
			await apiRequest("/admin/rooms", {
				method: "POST",
				body: JSON.stringify({ name, description })
			});
			alert(`Room "${name}" created successfully`);
		} else if (mode === "edit") {
			await apiRequest(`/admin/rooms/${name}`, {
				method: "PUT",
				body: JSON.stringify({ description })
			});
			alert(`Room "${name}" updated successfully`);
		}
		closeModal("room-modal");
		loadRoomsData();
	} catch (error) {
		alert(`Failed to ${mode} room: ${error.message || error}`);
	}
});

async function deleteRoom(roomName) {
	if (!confirm(`Are you sure you want to delete room "${roomName}"? This will disconnect all users in the room!`)) {
		return;
	}

	try {
		await apiRequest(`/admin/rooms/${roomName}`, { method: "DELETE" });
		alert(`Room "${roomName}" deleted successfully`);
		loadRoomsData();
	} catch (error) {
		alert("Failed to delete room");
		console.error(error);
	}
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
	connectWebSocket();
	loadSectionData("users");
	loadRoomsData();
});
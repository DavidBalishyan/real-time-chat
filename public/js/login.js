const form = document.getElementById("enter-chat");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const roomSelect = document.getElementById("room");
const toggleBtn = document.getElementById("toggle-mode");
const formMessage = document.getElementById("form-message");
const formTitleText = document.getElementById("form-title-text");
const submitText = document.getElementById("submit-text");

let mode = "login";

async function loadRooms() {
	try {
		const response = await fetch("/auth/rooms");
		if (!response.ok) throw new Error("Failed to fetch rooms");
		const data = await response.json();
		roomSelect.innerHTML = "";
		data.rooms.forEach((room) => {
			const option = document.createElement("option");
			option.value = room.name;
			option.textContent = room.name;
			roomSelect.appendChild(option);
		});
	} catch (error) {
		console.error("Could not load rooms:", error);
		// Fallback - keep whatever static options exist in the HTML
	}
}

loadRooms();

function setMessage(message, type = "error") {
	if (!formMessage) return;
	formMessage.textContent = message;
	formMessage.style.color = type === "error" ? "var(--red)" : "var(--green)";
}

function setMode(newMode) {
	mode = newMode;
	if (mode === "register") {
		formTitleText.textContent = "Create Account";
		submitText.textContent = "Register & Enter";
		toggleBtn.textContent = "Switch to login";
	} else {
		formTitleText.textContent = "Welcome Back";
		submitText.textContent = "Enter Chat";
		toggleBtn.textContent = "Switch to register";
	}
	setMessage("", "info");
}

async function sendAuthRequest(endpoint, payload) {
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	return response;
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!usernameInput || !passwordInput || !roomSelect) return;

	const username = usernameInput.value.trim();
	const password = passwordInput.value.trim();
	const room = roomSelect.value.trim() || "General";

	if (!username || !password) {
		setMessage("Username and password are required.");
		return;
	}

	const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
	setMessage("Working…", "info");

	try {
		const response = await sendAuthRequest(endpoint, { username, password });
		const data = await response.json();

		if (!response.ok) {
			if (response.status === 401) {
				setMessage("Invalid credentials. Try again or switch to register.");
			} else if (response.status === 409) {
				setMessage("Username already exists. Choose another.");
			} else {
				setMessage(data.error || "Authentication failed.");
			}
			return;
		}

		localStorage.setItem("chatToken", data.token);
		localStorage.setItem("chatUsername", data.username);

		// Special handling for admin user
		if (data.username === "Admin") {
			window.location.href = "admin.html";
		} else {
			window.location.href = `chat.html?room=${encodeURIComponent(room)}`;
		}
	} catch (error) {
		console.error(error);
		setMessage("Unable to connect to the server. Make sure the backend is running.");
	}
});

toggleBtn.addEventListener("click", () => {
	setMode(mode === "login" ? "register" : "login");
});

setMode("login");
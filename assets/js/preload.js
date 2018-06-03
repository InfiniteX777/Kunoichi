// Purely just to wait for the window to load. Nothing to see here.
window.eval = global.eval = () => {
	throw new Error("Sorry, this app does not support window.eval().")
};

document.addEventListener("DOMContentLoaded", () => require("./index.js"));
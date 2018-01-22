const {ipcRenderer} = require("electron");
let div = {
	slider: document.getElementById("slider"),
	dim: document.getElementById("dim")
};
let input = document.getElementsByTagName("input")[0];
let grid = {};
let data = {};

for (var i = 0; i < 7; i++) {
	grid[i] = {};
}

function checkBounds(x, y, length) {
	for (var i in grid[x]) {
		if (grid[x].bottom > y ||
			grid[x].top < y+length) {
			return true;
		}
	}

	return false;
}

function newCard(a, b, x, y, length) {
	let block = document.createElement("block"),
		head = document.createElement("label"),
		body = document.createElement("label");

	// Thou art appendeth!
	block.appendChild(head);
	block.appendChild(body);
	div.slider.appendChild(block);

	// Setup the card.
	body.setAttribute("class", "body");
	head.innerHTML = a;
	body.innerHTML = b;
	block.style.left = "calc(" +
		x*100 + "% + " + (5*x) + "px)";
	block.style.top = y*105 + "%";
	block.style.height =
		"calc(" + length*105 + "% - 5px)";

	return {
		move: (x2, y2) => {
			if (x2 != null && x != x2) {
				// Ch
				x = x2;
				block.style.left = "calc(" +
					x*100 + "% + " + (5*x) + "px)";
			}

			if (y2 != null && y != y2) {
				y = y2;
				block.style.top = y*105 + "%";
			}
		},
		scale: (y) => {
			if (length != y) {
				length = y;
				block.style.height =
					"calc(" + y*105 + "% - 5px)";
			}
		}
	};
}

// Search.
input.addEventListener("focus", (event, test) => {
	div.dim.style.opacity = 0.2;
})

input.addEventListener("focusout", (event, test) => {
	div.dim.style.opacity = 0;
})

input.addEventListener("keyup", (event) => {
	if (event.keyCode === 13) {
		ipcRenderer.send("request", input.value);
		input.value = "";
		input.blur();
	}
})

// Request.
ipcRenderer.on("request", (event, course, arg) => {
	console.log(arg);
	if (arg === -1) {
		data[course] = arg;
	}
});

newCard(
	"GREATWK",
	"S16<br>G205",
	0,
	0,
	1.5
);
newCard(
	"INTRODB",
	"S17<br>G202",
	0,
	1.75,
	1.5
);

ipcRenderer.send("request", "GREATWK");
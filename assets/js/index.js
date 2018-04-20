const {ipcRenderer, remote} = require("electron");
const {Menu, MenuItem} = remote;
let div = {
	slider: document.getElementById("slider"),
	dim: document.getElementById("dim"),
	recent: document.getElementById("recent")
};
let course = {};
let context = {};
let input = document.getElementsByTagName("input")[0];
let grid = {};
let data = {};
let drag;
let drag_time;

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

function createCourse(v) {
	if (!course[v]) {
		let elm = document.createElement("course");
		elm.innerHTML = "#" + v;

		elm.addEventListener("mousedown", (event) => {
			drag = v;
			drag_time = new Date().getTime();
		});

		let context = new Menu();

		course[v] = {
			elm: elm,
			context: new Menu()
		};

		for (var i = 0; i < data[v].length; i++) {
			let section = data[v][i].section;
			if (section) {
				let item = new MenuItem({
					label: data[v][i].section
				});

				course[v].context.append(item);
			}
		}
	}

	recent.insertBefore(course[v].elm, recent.childNodes[0]);
}

document.addEventListener("mouseup", (event) => {
	if (drag_time) {
		if (event.button === 0 ||
			event.button === 2) {
			if (drag_time &&
				new Date().getTime() - drag_time > 200) {

			} else {
				// Show context menu.
				course[drag].context.popup();
			}

			drag_time = null;
		}
	}
});

document.addEventListener("mousemove", (event) => {
})

// Search.
input.addEventListener("focus", (event, test) => {
	div.dim.style.opacity = 0.4;
	div.recent.style.display = "block";
})

input.addEventListener("focusout", (event, test) => {
	div.dim.style.opacity = 0;
	div.recent.style.display = "none";
})

input.addEventListener("keyup", (event) => {
	if (event.keyCode === 13) {
		ipcRenderer.send("request", input.value);
		input.value = "";
	}
})

// Request.
ipcRenderer.on("request", (event, course, arg) => {
	console.log(arg);
	if (arg !== -1 && arg.length > 0) {
		data[course] = arg;

		createCourse(course);
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
	1.5,
	1.5
);
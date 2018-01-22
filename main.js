//Service Temporarily Unavailable h1

const {ipcMain,
	   app,
	   BrowserWindow} = require("electron");
const fs = require("fs");
const grapes = require("./assets/js/grapes.js");
const mower = require("./assets/js/mower.js");
const path = require("path");
const url = require("url");
const data = {};

try {
	fs.mkdirSync("cache");
} catch(err) {}

ipcMain.on("request", (event, course) => {
	if (!data[course]) {
		// Request data.
		mower.once(course, (arg) => {
			// If the window was closed.
			if (event.sender.isDestroyed())
				return;

			if (arg === -2 || arg === -1) {
				// Find a cached data in storage.
				try {
					data[course] = 
						JSON.parse(fs.readFileSync(
							"cache/" + course + ".json"
						));
				} catch(err) {}

				if (data[course]) {
					// Send cache data.
					event.sender.send(
						"request",
						course,
						data[course]
					);
				} else {
					// No data found.
					event.sender.send(
						"request",
						course,
						-1
					);
				}
			} else {
				// Send new data.
				data[course] = arg;

				fs.writeFile(
					"cache/" + course + ".json",
					JSON.stringify(arg),
					(err) => {}
				);

				event.sender.send(
					"request",
					course,
					arg
				);
			}
		});

		// Send request.
		mower.request(course);
	} else {
		// Send cached data.
		event.sender.send(
			"request",
			course,
			data[course]
		);
	}
})

function init() {
	let test = grapes.init({
		width: 800,
		height: 600,
		title: "Kunoichi"
	}, (v) => {
		//v.setMenu(null);
		v.loadURL(
			path.join(
				__dirname,
				"assets/html/sched_scale.html"
			)
		);
	});
}

app.on("ready", init);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
})

app.on("activate", init);

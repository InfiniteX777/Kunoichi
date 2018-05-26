//Service Temporarily Unavailable h1
const fs = require("fs");
const path = require("path");
const url = require("url");
const {ipcMain,
	   app,
	   BrowserWindow} = require("electron");
const grapes = require("./assets/js/grapes.js");
const mower = require("./assets/js/mower.js");
const data = {};

if (!fs.existsSync("cache"))
	fs.mkdirSync("cache");

ipcMain.on("request", (event, course, ayterm) => {
	ayterm = ayterm || mower.AYTerm;
	course = course.toUpperCase();

	if (!ayterm)
		/* We don't know what the academic year and term is. There's
		   no point in searching for the data.
		*/
		return;

	// Make an entry for the AYTerm if first time.
	if (!data[ayterm])
		data[ayterm] = {};

	// See if data was previously searched.
	if (data[ayterm][course]) {
		// Send cached data.
		event.sender.send(
			"request",
			course,
			data[ayterm][course]
		);
	} else {
		// Request data.
		mower.once(course, arg => {
			// If the window that requested for this was closed.
			if (event.sender.isDestroyed())
				return; // That window wasted your time.

			let v = "cache/" + mower.AYTerm + "/" + course + ".json";

			/* See if the reply is a number. This means that there was
			   no data found. The data should be an object.
			*/
			if (typeof(arg) === "number") {
				// No data. Find a cached data in storage.
				if (fs.existsSync(v)) {
					// Data found.
					data[ayterm][course] = JSON.parse(
						fs.readFileSync(v)
					);

					event.sender.send(
						"request",
						course,
						data[course]
					);
				} else
					// No data found.
					event.sender.send("request", course, arg);
			} else {
				// Data received. Send new data.
				data[ayterm][course] = arg;

				if (!fs.existsSync("cache"))
					// Create the 'cache' folder.
					fs.mkdirSync("cache");

				fs.writeFileSync(v, JSON.stringify(arg));
				event.sender.send("request", course, arg);
			}
		});

		// Send request.
		mower.request(course);
	}
})

function init() {
	let test = grapes.init({
		width: 800,
		height: 600,
		title: "Kunoichi"
	}, (v) => {
		v.setMenu(null);
		v.loadURL(path.join(__dirname, "index.html"));
	});
}

app.on("ready", init);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
})

app.on("activate", init);

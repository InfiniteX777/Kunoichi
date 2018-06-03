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

// Used for loading a file after loading a new window.
let file_queue = {};

if (!fs.existsSync("cache"))
	fs.mkdirSync("cache");

function newWindow(file) {
	grapes.init({
		width: 800,
		height: 600,
		minWidth: 620,
		minHeight: 450,
		title: "Kunoichi",
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "assets/js/preload.js")
		}
	}, (win) => {
		file_queue[win.id] = file;

		win.setMenu(null);
		win.once("ready-to-show", win.show);
		win.loadURL(path.join(__dirname, "index.html"));
	});
}

// For creating new windows.
ipcMain.on("window", (event, file) => newWindow(file));

/* Used by the renderer if ta file should be loaded after the window
   is finished loading.
*/
ipcMain.on("loaded", (event) => {
	// Send a -1 if it doesn't need to load anything.
	if (file_queue[event.sender.id]) {
		event.returnValue = file_queue[event.sender.id] || -1;

		delete file_queue[event.sender.id];
	} else
		event.returnValue = -1;
});

// For renaming a window.
ipcMain.on("title", (event, txt) =>
	BrowserWindow.fromWebContents(event.sender).setTitle(txt)
);

// For requesting course data.
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
	if (data[ayterm][course])
		// Send cached data.
		event.sender.send(
			"request",
			course,
			data[ayterm][course]
		);
	else {
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
						data[ayterm][course]
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
	newWindow();
}

app.on("ready", init);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
})

app.on("activate", init);

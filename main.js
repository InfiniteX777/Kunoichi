//Service Temporarily Unavailable h1
const fs = require("fs");
const path = require("path");
const url = require("url");
const {ipcMain,
	   app,
	   BrowserWindow} = require("electron");
const grapes = require("./assets/js/grapes.js");
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
		if (file)
			file_queue[win.id] = file;

		win.setMenu(null);
		win.once("ready-to-show", win.show);
		win.loadURL(path.join(__dirname, "index.html"));
	});
}

// For creating new windows.
ipcMain.on("window", (event, file) => newWindow(file));

/* Used by the renderer if a file should be loaded after the window
   is finished loading.
*/
ipcMain.on("loaded", (event) => {
	// Send a -1 if it doesn't need to load anything.
	if (file_queue[event.sender.id] != null) {
		event.returnValue = file_queue[event.sender.id];

		delete file_queue[event.sender.id];
	} else
		event.returnValue = -1;
});

// For renaming a window.
ipcMain.on("title", (event, txt) =>
	BrowserWindow.fromWebContents(event.sender).setTitle(txt)
);

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

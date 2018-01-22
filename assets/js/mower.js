const {BrowserWindow, ipcMain} = require("electron");
const list_listener = {};
const list_request = {};
// Destroy frozen requests.
const timeout = 5 * 1000;

/**
 * Send that wonderful data.
**/
function send(win, course, arg) {
	if (list_listener[course]) {
		for (i = 0;
			 i < list_listener[course].length;
			 i++) {
			list_listener[course][i](arg);
		}

		delete list_listener[course];
	}

	// Delete everything.
	win.destroy();
	delete list_request[course];
}

/**
 * Make the data beautiful.
**/
function parse(arg) {
	let data = [];

	for (var i = 0; i < arg.length; i++) {
		let id = Number(arg[i][0]),
			name = arg[i][1].match(/\S+/g),
			section = arg[i][2],
			day = arg[i][3].match(/\S/g),
			time = arg[i][4].match(/\d+/g),
			room = arg[i][5],
			cap = Number(arg[i][6]),
			enrolled = Number(arg[i][7]),
			remarks = arg[i][8],
			professor = arg[i].prof;

		id = id ? id : null;
		name = name ? name[0] : null;
		day = day ? day : [];
		time = time ? time : [];
		cap = cap ? cap : null;
		enrolled = enrolled ? enrolled : null;

		data[i] = {
			id: id,
			name: name,
			section: section,
			day: day,
			time: time,
			room: room,
			cap: cap,
			enrolled: enrolled,
			remarks: remarks,
			professor: professor
		};
	}

	return data;
}

/**
 * Requests for the table from DLSU. Returns an object
 * with all the properties necessary. If timed out,
 * -1 will be returned, while -2 will be returned if
 * there is no internet access.
 * @param {String} course - The course offered.
**/
this.request = (course) => {
	if (!course || list_request[course]) return;
		// Only one request at a time.

	list_request[course] = true;

	let win = new BrowserWindow({show: false});
	let sent;

	// Set timeout.
	setTimeout(() => {
		if (!sent) {
			send(win, course, -1);
		}
	}, timeout)

	win.webContents.once("did-finish-load", () => {
		win.webContents.once("did-finish-load", () => {
			if (!win.isDestroyed()) {
				win.webContents.executeJavaScript("\
const {ipcRenderer} = require(\"electron\");\
let tbody = document.getElementsByTagName(\"tbody\")[8];\
let tr = tbody.getElementsByTagName(\"tr\");\
let data = [];\
\
function extract(node) {\
	if (node.firstChild == null ||\
		node.firstChild.nodeName == \"#text\") {\
		let v = node.textContent.match(\
			/[^\\n]+/g\
		);\
		\
		return v != null ? v[0] : \"\";\
	}\
	\
	return extract(node.firstChild);\
}\
\
if (tr.length > 1) {\
	for (var i = 1; i < tr.length; i++) {\
		let td = tr[i].getElementsByTagName(\"td\");\
		var list;\
		\
		if (td.length > 1) {\
			list = {};\
			data[data.length] = list;\
			\
			for (var x = 0; x < td.length; x++) {\
				list[x] = extract(td[x]);\
			}\
		} else if (list != null) {\
			list.prof = extract(td[0]);\
		}\
	}\
}\
\
ipcRenderer.send(\
	\"MOWER_" + course + "\",\
	data\
);\
				");
			};
		});

		win.webContents.executeJavaScript("\
const {ipcRenderer} = require(\"electron\");\
\
if (navigator.onLine) {\
	var v = document.getElementsByName(\"p_course_code\")[0];\
	v.setAttribute(\"value\",\"" + course + "\");\
	document.getElementsByTagName(\"input\")[3].click();\
} else {\
	ipcRenderer.send(\
		\"MOWER_" + course + "\",\
		-2\
	);\
}\
		");
	});

	win.loadURL("http://enroll.dlsu.edu.ph/dlsu/view_actual_count");

	ipcMain.once("MOWER_" + course, (event, arg) => {
		sent = true;
		send(win, course, parse(arg));
	})
}

/**
 * Creates a temporary listener that is only fired once.
 * The argument for the listener is (arg), where 'arg'
 * is the data.
 * @param {String} channel - The channel.
 * @param {Function} listener - The listener.
**/
this.once = (channel, listener) => {
	if (!list_listener[channel]) {
		list_listener[channel] = [];
	}

	list_listener[channel]
		[list_listener[channel].length] = listener;
}
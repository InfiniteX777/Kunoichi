const {BrowserWindow, ipcMain} = require("electron");
const {net} = require('electron');
const fs = require("fs");
const pdfjs = require("pdfjs-dist");
const list_listener = {};
const list_request = {};
// Destroy frozen requests.
const timeout = 5 * 1000;

this.AYTerm = null;

/**
 * Send that wonderful data.
**/
function send(channel, arg) {
	if (list_listener[channel]) {
		for (i = 0;
			 i < list_listener[channel].length;
			 i++) {
			list_listener[channel][i](arg);
		}

		delete list_listener[channel];
	}

	// Delete everything.
	delete list_request[channel];
}

/**
 * Make the data beautiful.
**/
function parse(arg) {
	// There's no need to parse if there was nothing to begin with.
	if (!arg.length)
		// We send a '-3', indicating that there was no data found.
		return -3;

	let data = {};
	let prev; // We record the previous data to use later.

	for (let i in arg) {
		let id = Number(arg[i][0]),
			name = arg[i][1].match(/\S+/g),
			section = arg[i][2].match(/\S+/g),
			day = arg[i][3].length > 2 ?
				[arg[i][3]] : // Courses with a specific date.
				arg[i][3].match(/\S/g), // The usual courses.
			time = arg[i][4].match(/\d+/g),
			room = arg[i][5],
			cap = Number(arg[i][6]),
			enrolled = Number(arg[i][7]),
			remarks = arg[i][8],
			professor = arg[i].prof ? // Get rid of extra spaces.
				arg[i].prof.match(/\S+/g).join(" ") : "";

		id = id != null ? id : null;
		section = section != null ? section[0] : null;
		day = day ? day : [];
		time = time ? time : [];
		cap = cap != null ? cap : null;
		enrolled = enrolled != null ? enrolled : null;

		// Parse the time.
		for (let n = 0; n < 2; n++) {
			if (time[n]) {
				time[n] = ("0000" + time[n]).slice(-4);
				time[n] = Number(time[n].substr(0, 2))*60 +
					Number(time[n].slice(-2));

				if (!(time[n] >= 0))
					time[n] = 0;

				if (n)
					time[1] -= time[0];
			}
		}

		/* See if there's no ID (This means that this data is part
		   of another data).
		*/
		if (id == null) {
			/* I've never encountered any schedules with a complicated
			   structure and usually only has different dates.
			*/
			if (prev)
				prev.day = prev.day.concat(day);
		} else {
			// Record data.
			data[id] = {
				section: section,
				day: day,
				time: time,
				room: room,
				cap: cap,
				enrolled: enrolled,
				remarks: remarks,
				professor: professor,
				acquired: new Date()
			};

			prev = data[id];
		}
	}

	return data;
}

/**
 * Requests for the table from DLSU. Returns an object
 * with all the properties necessary.
 * -1 = Timeout; -2 = No internet; -3 = Empty data.
 * @param {String} course - The course offered.
 * @param {String} ayterm - The academic year and term. Mostly used
 * for offline caching. If this doesn't match with the current
 * 'AYTerm', it will only check for offline data. You can leave this
 * as 'null' to request with current AYTerm.
**/
this.request = (course, ayterm) => {
	if (!course || list_request[course])
		return; // Only one request at a time.

	if (!this.AYTerm || ayterm && ayterm != this.AYTerm)
		/* Stop immediately if AYTerm has yet to be received,
		   or if 'ayterm' is supplied and it doesn't match
		   with the current AYTerm.
		*/
		return send(course, -2); // Send a 'No internet' signal.

	list_request[course] = true;

	let win = new BrowserWindow({show: false});
	let sent;

	// Abort when no data was retrieved within [timeout] second/s.
	setTimeout(() => {
		if (!sent) {
			sent = -1;

			send(course, -1);
			win.destroy();
		}
	}, timeout);

	win.webContents.once("did-finish-load", () => {
		if (sent === -1)
			// Don't continue if already timed-out.
			return;

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
} else\
	ipcRenderer.send(\"MOWER_" + course + "\", -2);\
\
		");
	});

	win.loadURL("https://enroll.dlsu.edu.ph/dlsu/view_actual_count");

	ipcMain.once("MOWER_" + course, (event, arg) => {
		sent = 1;
		send(course, parse(arg));
		win.destroy();
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

/**
 * Request for the current academic year and term from DLSU's
 * 'enroll_ug.pdf'. Will send data through '_AYTERM' channel.
 * Use 'mower.once("_AYTERM", callback)' to catch data.
**/
this.requestAYTerm = () => {
	let req = net.request(
		"https://www.dlsu.edu.ph/" +
		"offices/registrar/schedules/enroll_ug.pdf"
	);

	req.on("response", res => {
		let dat = [],
			chunks = [],
			p = 0;

		res.on("data", chunk => chunks.push(chunk));
		res.on("end", () => {
			for (let n = 0; n < chunks.length; n++)
				for (let i = 0; i < chunks[n].length; i++)
					dat.push(chunks[n][i]);

			pdfjs.getDocument(Buffer.from(dat)).then(doc => {
				doc.getPage(1).then(page => {
					page.getTextContent().then(content => {
						let items = content.items;
						let str = "";
						let p = 0;

						for (let i in items) {
							str += items[i].str;

							if (!p) {
								let v = str.search("AY "); // lmao

								if (v != -1) {
									str = str.substring(v+3);
									p++;
								}
							} else if (p == 1) {
								let v = str.search("Term ");

								if (v != -1)
									p = v + 6;
							} else if (str.length >= p) {
								str = str.substring(0, p);
								this.AYTerm = str;

								// Make a directory for the term.
								try {
									fs.mkdirSync("cache/" + str);
								} catch(err) {}

								send("_AYTERM", str);

								return;
							}
						}
					});
				});
			});
		});
	});
	req.end();
}
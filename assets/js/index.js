const fs = require("fs");
const html2canvas = require("html2canvas");
const {ipcRenderer, remote} = require("electron");
const mower = remote.require("./assets/js/mower.js");
const {Menu, MenuItem} = remote;

// Shortcuts.
const elem = document.createElement.bind(document),
	body = document.body,
	getId = document.getElementById.bind(document),
	getTag = document.getElementsByTagName.bind(document);
// Offset
const day_pos = {
	"M": 1,
	"T": 2,
	"W": 3,
	"H": 4,
	"F": 5,
	"S": 6
};
// The actual screen isn't exactly at (0, 0).
const scroll_offset = 35;


//-- Options. --//

// Watch yer language boi.
let lang = "en";
// A collection of all the messages the system has made via requests.
let request_elm = {};


//-- Elements. --//

let div = {};

// The emphasis for the search button to help new users.
div.help = getId("help");

// Contains the cards and time indication.
div.screen = getId("screen");

div.screen_label = div.screen.getElementsByTagName("label");

// Will contain the course cards and preview cards.
div.deck = getId("deck");

// Recently searched courses.
div.dump = getId("dump");

// The message when you hover over an element with a 'tooltip'.
div.tooltip = getId("tooltip");

// The container when focusing on the text box.
div.course = getId("course");

// The container for the slots.
div.course_table = getId("table");

// The time indicator that follows your cursor.
div.time = getId("time");

// The info window.
div.info = getId("info");
div.info_div = div.info.getElementsByTagName("div")[0];
div.info_header = div.info.getElementsByTagName("header")[0];
div.info_subtitle = div.info.getElementsByTagName("subtitle")[0];
div.info_img = div.info.getElementsByTagName("img");

// The file-open window.
div.open = getId("open");
div.open_dim = div.open.getElementsByTagName("dim")[0];
div.open_div = div.open.getElementsByTagName("div")[0];
div.open_img = div.open.getElementsByTagName("img");
div.open_listbox = getId("listbox");

// Preview container.
div.preview = getId("preview").getElementsByTagName("div")[0];

// The message container.
div.message = getId("message");

// The file name prompt window.
div.prompt = getId("prompt");
div.prompt_div = div.prompt.getElementsByTagName("div")[0];
div.prompt_img = div.prompt.getElementsByTagName("img");
div.prompt_input = div.prompt.getElementsByTagName("input")[0];
div.prompt_label = div.prompt.getElementsByTagName("label")[1];

// Summary of all the things the user has enrolled.
div.summary = getId("summary");
div.summary_tbody = div.summary.getElementsByTagName("tbody")[0];
div.summary_list = {};

let img = {
	// The save button. Should only appear once since it auto-saves.
	save: getId("save"),
	// Load button. Also functions as a 'new window' button.
	load: getId("load"),
	config: getId("config"),
	search: getId("search").getElementsByTagName("img")[0]
};

let label = {
	// Spooky, sneaky.
	spooky: getId("spooky"),
	// Academic year and term display.
	AYTerm: getId("AYTerm")
};

// The search textbox input.
let input = getTag("input")[0];

/* The current tooltip's focused element. This is used for when the
   previous element is attempting to clear the tooltip when the
   current tooltip isn't theirs anymore.
*/
let tooltip;
/* If this value is more than 0, something is still writing data.
   Used for the indicator on the screen to tell the users that their
   schedule is still being saved. This is almost unnecessary
   since the file writing is incredibly fast.
*/
let saveBuffer = 0;
/* The data of the current schedule which holds the courses,
   academic year and term, date created and changed, and file
   name.
*/
let schedule = {
	list: {},
	/* Wait for the application to get the AYTerm from DLSU, otherwise
	   let the user choose a file to load first.
	*/
	AYTerm: null,
	// Start with null to prompt the user for a name.
	name: null
};
/* Used for the info window. Should be an array; [name, id, state].
   If 'state' has a 'non-false' value, it will enroll the target,
   otherwise it will drop it if it exists in the 'schedule'
   object.
*/
let enrollTarget;
// Currently viewed course.
let courseScope;
// Dumped texts of all the courses for easier searching.
let courseDump = "";
// Separator for each dumped text.
let courseDumpSep = String.fromCharCode(0);
// Phrases used for searching.
let courseDumpPre =
		courseDumpSep + "[^" + courseDumpSep + "]*",
	courseDumpSuf =
		"[^" + courseDumpSep + "]*";


//-- Essentials. Should not be manually changed. --//

/* A list of various data (course data, sections, room full names,
   etc).
*/
let data = {};
// Used to check for re-focusing on the search text box.
let hit;
// Pixels scrolled.
let scroll = 0;
// Scroll range.
let scroll_min, scroll_max;
let drag;


//-- Load ./config data. --//

{
	let l = ["room", "section", "course", "flowchart"];

	for (let i in l) {
		let v = "config\\" + l[i] + "_" + lang + ".json";
		data[l[i]] = fs.existsSync(v) ?
			JSON.parse(fs.readFileSync(v)) :
			{};
	}
}


//-- Miscellaneous functions. --//

/* Check if it's a folder.
*/
function isdir(source) {
	if (fs.existsSync(source))
		return fs.lstatSync(source).isDirectory();
}

// spook them
const spook_list = [
	"There's nothing here.",
	"And God said, 'Let there be light.'",
	"It's cold in here.",
	"Feed me.",
	"I-It's not like I'm helping you or anything!",
	"You must construct additional courses.",
	"Nope. Nothing here.",
	"The cake is a lie.",
	"I don't hate you.",
	"When life gives you lemons,<br>don't make lemonade.<br>Get mad.",
	":)",
	"You shall pass!",
	"It's dangerous to go alone.<br>Take some courses.",
	"For the emperor!",
	"I believe in you."
];

/**
 * Give them a proper SPOOK.
 * @param Integer flag - If 'non-false', will clear the SPOOK.
**/
function setSpook(flag) {
	if (flag)
		label.spooky.innerHTML = "";
	else
		label.spooky.innerHTML = spook_list[Math.round(
			Math.random()*(spook_list.length - 1)
		)];
}

/**
 * Send a message on the user's screen.
 * @param String str - The text.
 * @param Function callback(Object) - Executed when the
 * message is clicked. Returning 'true' will remove the message.
 * The 'Object' is the element.
 * @param Number lifetime - Seconds before the message disappears.
 * @param Number type - 0 = green; 1 = yellow; 2 = warn.
 * @return [Object, Function] - Returns an array with the element
 * and a function which will remove the message when fired.
**/
function sendMessage(str, callback, lifetime, type) {
	let tick = 0;
	let elm = elem("label");
	elm.innerHTML = str;

	// Change its type if provided.
	if (type)
		elm.setAttribute("type", type);

	div.message.appendChild(elm);

	// Wait a few ticks to 'properly' animate the element.
	setTimeout(() => elm.style.left = "0", 5);

	function timer() {
		let i = tick;
		elm.style.animation = "slide " + lifetime + "s linear";

		setTimeout(() => {
			if (i == tick)
				close();
		}, lifetime*1000);
	}

	// The function responsible for 'properly' removing the message.
	function close() {
		// Put the tick to an unreachable value to invalidate timers.
		tick = -1;
		elm.style.left = "210px";
		elm.style.pointerEvents = "none"; // Ignore mouse events.

		// Wait out the animation before destroying the element.
		setTimeout(() => div.message.removeChild(elm), 200);
	}

	// Setup the callback, if it actually has one.
	elm.addEventListener("click", () => {
		if (!callback || callback(elm))
			// Close it if no callback or callback returns 'true'.
			close();
	});

	elm.addEventListener("mouseenter", () => {
		elm.style.animation = null;

		tick++;
	});
	elm.addEventListener("mouseleave", () => {
		if (lifetime)
			timer();
	});

	// Setup the timer, if it actually has one.
	if (lifetime)
		timer();

	// Return both the element and the 'close' function.
	return [elm, close];
}

/**
 * Create a dialog window. This will be on top of everything (including
 * any previous dialog windows) except for the notification messages
 * on the bottom-right corner.
**/
function showDialog(txt, buttons, callback) {
	let dialog = elem("div");
	dialog.setAttribute("id", "dialog");
	body.appendChild(dialog);

	let dim = elem("dim");
	dialog.appendChild(dim);

	let div = elem("div");
	dialog.appendChild(div);

	let label = elem("label");
	label.innerHTML = txt;
	div.appendChild(label);

	let table = elem("table");
	div.appendChild(table);

	let tbody = elem("tbody");
	table.appendChild(tbody);

	let tr = elem("tr");
	tbody.appendChild(tr);

	for (let i = 0; i < buttons.length; i++) {
		let td = elem("td");
		let label = elem("label");
		label.innerHTML = buttons[i];

		tr.appendChild(td);
		td.appendChild(label);

		label.addEventListener("click", event => {
			if (!callback || callback(event, i)) {
				dialog.style.opacity = null;
				dialog.style.pointerEvents = "none";

				setTimeout(
					() => body.removeChild(dialog),
					1000
				);
			}
		});
	}

	setTimeout(() => {
		dialog.style.opacity = 1;
	}, 5);
}

/**
 * Parse seconds into string in HHMM format (H = hours; M = minutes).
 * @param Integer v - The seconds.
 * @return String - Seconds converted to string.
**/
function parseTime(v) {
	return ("00" + Math.trunc(v/60)).slice(-2) +
		("00" + v%60).slice(-2);
}


//-- File saving. --//

label.AYTerm.addEventListener("mouseenter", () => {
	label.AYTerm.style.opacity = 1;
	label.AYTerm.style.fontSize = "24px";
});

label.AYTerm.addEventListener("mouseleave", () => {
	label.AYTerm.style.opacity = null;
	label.AYTerm.style.fontSize = null;
});

// Make sure that the file has yet to have its AYTerm set.
if (schedule.AYTerm) {
	label.AYTerm.innerHTML = schedule.AYTerm;
} else if (mower.AYTerm) {
	// Set current AYTerm with the latest.
	schedule.AYTerm = mower.AYTerm;
	label.AYTerm.innerHTML = mower.AYTerm;
} else {
	/* Try to request for current academic year and term.
	   Otherwise, make use of the offline cache.
	*/
	let v = fs.existsSync("cache") && fs.readdirSync("cache").filter(
		name => isdir("cache" + "\\" + name)
	);

	// Set the AYTerm with the offline cache's latest.
	if (v) {
		v = v.sort().pop();
		schedule.AYTerm = v;
		label.AYTerm.innerHTML = v;
	}

	// Set AYTerm as soon as data is received.
	mower.once("_AYTERM", arg => {
		schedule.AYTerm = arg;
		label.AYTerm.innerHTML = arg;
	});
	mower.requestAYTerm(); // Make a request.
}

function saveData() {
	setTimeout(() => {
		saveBuffer += 1;

		// Copy data.
		let data = {
			AYTerm: schedule.AYTerm
		};

		// Delete all unneeded data.
		for (let name in schedule.list) {
			data[name] = Object.assign({}, schedule.list[name]);

			delete data[name].cards;
			delete data[name].tr;
			delete data[name].literal;
		}

		data = JSON.stringify(data, null, "	");

		if (!fs.existsSync("save"))
			fs.mkdirSync("save");

		fs.writeFile(
			"save\\" + schedule.name + ".json",
			data,
			() => {
				saveBuffer -= 1;

				sendMessage("File saved.", null, 2);
			}
		);
	});
}

img.save.addEventListener("click", event => {
	let filename = 1;

	while (1)
		if (fs.existsSync("save\\Schedule " + filename + ".json"))
			filename++;
		else {
			filename = "Schedule " + filename;

			break;
		}

	div.prompt.style.pointerEvents = "auto";
	div.prompt.style.opacity = 1;

	div.prompt_input.setAttribute("placeholder", filename);
	div.prompt_input.focus();
});

tooltipListener(
	img.save,
	"<label>Save Schedule</label>",
	null,
	1
);

function prompt_save_func(filename) {
	schedule.name = filename;

	prompt_hide();
	setTimeout(() => {
		div.prompt.parentElement.removeChild(div.prompt);

		delete div.prompt;
	}, 1000);

	ipcRenderer.send("title", filename); // Rename the window.
	saveData();
	sendMessage("Schedule will now automatically save.", null, 3);
}

function prompt_save() {
	let filename = div.prompt_input.value ||
		div.prompt_input.placeholder;

	if (fs.existsSync("save\\" + filename + ".json"))
		showDialog(
			"Another schedule with the same name already exists!",
			["Overwrite", "Cancel"],
			(event, choice) => {
				if (!choice)
					prompt_save_func(filename);

				return true;
			}
		);
	else
		prompt_save_func(filename);
}

div.prompt_img[0].addEventListener("click", prompt_save);
div.prompt_input.addEventListener("keydown", event => {
	if (event.key === "Enter")
		prompt_save();
});

tooltipListener(
	div.prompt_img[0],
	"<label>Save</label>",
	null,
	1
);

function prompt_hide() {
	div.prompt.style.pointerEvents = null;
	div.prompt.style.opacity = null;
	div.prompt_input.value = "";
	div.prompt_label.style.opacity = null;
	div.prompt_div.style.height = null;

	div.prompt_input.blur();
}

div.prompt_img[1].addEventListener("click", prompt_hide);
div.prompt.getElementsByTagName("dim")[0]
	.addEventListener("mousedown", prompt_hide);

tooltipListener(
	div.prompt_img[1],
	"<label>Cancel</label>",
	null,
	1
);


//-- Schedule functions. --//

/**
 * Load a saved schedule. This will also update the schedule.
**/
function loadSchedule(sched) {
	// Get rid of the previous schedule.
	for (let name in schedule.list) {
		// Remove summary sidebar elements.
		div.summary_tbody.removeChild(schedule.list[name].tr);

		// Remove cards.
		for (let i in schedule.list[name].cards)
			div.deck.removeChild(schedule.list[name].cards[i]);
	}

	// Create the visual stuffs (cards and sidebar elements).
	let list = sched.list;
	let i = 0;
	scroll_min = scroll_max = null; // Set to null for calibration.

	for (let name in list) {
		let slot = list[name];
		slot.cards = newCard(name, slot.id, slot);
		slot.tr = newSummary(name, slot.id, slot);

		if (scroll_min != null)
			scroll_min = Math.min(slot.time[0] + slot.time[1], scroll_min);
		else
			scroll_min = slot.time[0] + slot.time[1];

		if (scroll_max != null)
			scroll_max = Math.max(slot.time[0], scroll_max);
		else
			scroll_max = slot.time[0];

		if (!i) {
			setSpook(1); // lolol

			i = 1;
		}
	}

	if (!i) setSpook(); // lolol

	// Replace.
	schedule = sched;

	ipcRenderer.send("title", sched.name); // Rename the window.
	sendMessage("Loaded '" + sched.name + "'.", null, 2); // Message user.
	scrollTo(0); // Scroll to top.
}

/**
 * See if this file does exist, can be parsed with JSON, and has the
 * necessary attributes of a schedule.
 * @param String name - the full path to the schedule (including its name).
 * If path doesn't start from the drive, it will start from the .exe's
 * location.
 * @return Object - Returns the schedule if it is,
 * otherwise 'null'.
**/
function getSched(filepath) {
	try {
		let ayterm;
		let sched = {};
		let file = JSON.parse(fs.readFileSync(filepath));

		for (let i in file)
			if (i === "AYTerm") {
				if (file[i] == null)
					// You can't enroll without AYTerm.
					throw null;

				ayterm = file[i]; // Transfer to variable.

				delete file[i]; // Delete it.
			} else if (!file[i].day || !file[i].time)
				// Get rid of faulty data.
				delete file[i];
			else
				// Formalize data.
				file[i].literal = file[i].section + " " +
					file[i].day.join("") + " " +
					parseTime(file[i].time[0]) + " - " +
					parseTime(file[i].time[0] + file[i].time[1]) + " " +
					file[i].room;

		// All good. Return the schedule.
		return {
			name: filepath.match(/\\.+$/)[0].slice(1, -5), // Get the name.
			AYTerm: ayterm,
			list: file // Point it to the file.
		};
	} catch (err) { }
}

/**
 * Show yer treasures, me hearty!
**/
function showSchedBrowser() {
	// Clear the previous stuff.
	div.open_listbox.innerHTML = "";

	// Draw the schedules first before showing it.
	let l = fs.existsSync("save") && fs.readdirSync("save").filter(name =>
		// Not a folder.
		!isdir("save\\" + name) &&
		// Must have a '.json'.
		name.toLowerCase().match(/\.[^\.]+$/) == ".json"
	).sort((a, b) =>
		// Sort by last modified.
		fs.lstatSync("save\\" + b).mtimeMs -
		fs.lstatSync("save\\" + a).mtimeMs
	);

	if (l) for (let i in l) {
		let file = "save\\" + l[i];
		let name = l[i].slice(0, -5);
		let sched = getSched(file);

		if (sched) {
			let stat = fs.lstatSync(file);
			let d = stat.mtime.toLocaleDateString(); // Modified.
			let label = elem("label");
			label.innerHTML = name + "<br><label>" + sched.AYTerm +
				"</label><label right>" + d + "</label>";

			label.addEventListener("mousedown", event => {
				if (event.button == 0) {
					div.open.style.pointerEvents = "";
					div.open.style.opacity = "";

					loadSchedule(sched);
				} else if (event.button == 2) {
					div.open.style.pointerEvents = "";
					div.open.style.opacity = "";

					ipcRenderer.send("window", file);
				}
			});

			div.open_listbox.appendChild(label);
		} else sendMessage(
			"Can't load '" + name + "'.<br>It's probably corrupted :(",
			null,
			3,
			2
		);
	}

	div.open.style.pointerEvents = "auto";
	div.open.style.opacity = 1;
}

img.load.addEventListener("mousedown", event => {
	if (event.button == 0)
		showSchedBrowser();
});

// New window button.
div.open_img[0].addEventListener("click", event => {
	ipcRenderer.send("window");
});

tooltipListener(div.open_img[0], "<label>New Window</label>", null, 1);

// Close button.
div.open_img[1].addEventListener("click", event => {
	div.open.style.pointerEvents = "";
	div.open.style.opacity = "";
});

tooltipListener(div.open_img[1], "<label>Close</label>", null, 1);

div.open_dim.addEventListener("mousedown", event => {
	div.open.style.pointerEvents = "";
	div.open.style.opacity = "";
});

/**
 * Check if the two slots have at least 1 schedule with the same
 * day.
**/
function matchDay(a, b) {
	for (let i in a)
		if (b.indexOf(a[i]) != -1)
			return true;
}

/**
 * Check if the given slot overlaps with another slot, or another
 * slot with the same course.
 * @param String name - the name of the course. Must capitalized.
 * @param Object slot - the slot's data.
 * @return Boolean - true if overlaps with another slot,
 * otherwise false.
**/
function hasConflict(name, slot) {
	// Check if another slot is already enrolled.
	if (schedule.list[name])
		return true;

	// Iterate through all the enrolled slots.
	for (let i in schedule.list) {
		let v = schedule.list[i];

		if (v && matchDay(slot.day, v.day)) {
			if (slot.time[0] <= v.time[0]) {
				if (v.time[0] - slot.time[0] < slot.time[1])
					return true;

			} else if (slot.time[0] - v.time[0] < v.time[1])
				return true;
		}
	}

	return false;
}


//-- Preview generation. --//

function setPreview(name, slot) {
	if (slot) {
		let conflict = hasConflict(name, slot);
		let child = div.preview.childNodes;
		div.preview.style.opacity = 0.6;
		div.preview.style.height = "calc(" +
			slot.time[1]/0.6 + "% - 5px)";

		for (let i = 0;
			i < Math.max(slot.day.length, child.length);
			i++) {
			if (slot.day[i] && slot.day[i].length == 1) {
				if (child[i])
					child[i].style.display = "";
				else
					div.preview.appendChild(elem("preview"));

				child[i].style.left = day_pos[slot.day[i]]*100 + "%";

				if (conflict)
					child[i].removeAttribute("available");
				else
					child[i].setAttribute("available", 1);
			} else if (child[i])
				child[i].style.display = "none";
		}

		scrollTo(
			(slot.time[0] + slot.time[1]/2 + // Card size.
			35/2 + 5)/0.6 - // Header size (the weekday display).
			innerHeight/2, // Screen size.
			1 // Allow scrolling to empty space.
		);
	} else
		div.preview.style.opacity = 0;
}


//-- Scroll functions. --//

/**
 * Add some value to the 'scroll offset'. Also moves the screen.
 * @param Number delta - the amount of pixels added. Negative value
 * will scroll upwards.
**/
function scrollAdd(delta) {
	if (scroll_min != null) {
		scroll = Math.max(
			scroll_min/0.6 - innerHeight + 40,
			Math.min(scroll + delta, scroll_max/0.6 + scroll_offset - 35)
		);
		div.screen.style.top = scroll_offset - scroll;
	}
}

/**
 * Scroll towards the given value. If 'force' has a 'non-false'
 * value, it will ignore boundaries, allowing scrolling to empty
 * space.
 * @param Number y - the point at which the screen will be moved to.
 * 
**/
function scrollTo(y, force) {
	if (scroll_min != null) {
		scroll = force ? y : Math.max(
			scroll_min/0.6 - innerHeight + 40,
			Math.min(y, scroll_max/0.6 + scroll_offset - 35)
		);
		div.screen.style.top = scroll_offset - scroll;
	}
}


//-- The tooltip container's behavior. --//

/**
 * Move the tooltip container.
 * @param Object event - The event.
**/
function tooltipMove(event) {
	if (div.tooltip.style.display === "block") {
		let x = div.tooltip.clientWidth,
			y = div.tooltip.clientHeight;

		div.tooltip.style.left = Math.min(
			event.x + 2,
			innerWidth - div.tooltip.clientWidth
		) + "px";
		div.tooltip.style.top = Math.max(
			event.y - div.tooltip.clientHeight - 2,
			0
		) + "px";
	}
}

document.addEventListener("mousemove", tooltipMove);

/**
 * Make it so that the element sets the tooltip's message when it's
 * hovered, and clear after unhovering.
 * @param Object elm - The element that owns the message.
 * @param String value - The message.
 * @param Function cond - The condition fired when hovering.
		The function must return a value that doesn't equate
		to 'false' (zero, empty string, etc).
 * @param Integer flag - 0 = None; 1 = Hide on focus or mouse down.
 * @return Object elm.
**/
function tooltipListener(elm, value, cond, flag) {
	elm.addEventListener("mouseenter", event => {
		if (!cond || cond()) {
			tooltip = elm;
			div.tooltip.innerHTML = value;
			div.tooltip.style.display = "block";

			tooltipMove(event);
		}
	});

	elm.addEventListener("mouseleave", event => {
		// Make sure that the current focus is this element.
		if (tooltip === elm) {
			tooltip = null;
			div.tooltip.style.display = "none";
		}
	});

	function hide(event) {
		if (flag && tooltip === elm) {
			tooltip = null;
			div.tooltip.style.display = "none";
		}
	}

	elm.addEventListener("mousedown", hide);
	elm.addEventListener("focus", hide);

	return elm;
}


//-- Functions for pseudo-enrolling. --//

/**
 * Attempt to add the slot to the schedule. This will do nothing
 * if there's a conflict.
 * @param String name - the name of the course. Must be all caps.
 * @param Int id - the id of the slot.
 * @param Object slot - the slot's data.
 * the card if successfully added to schedule.
**/
function courseEnroll(name, id, slot) {
	if (!hasConflict(name, slot)) {
		setSpook(1); // lolol

		/* Make an entry for the slot. Note that the slot is
		   duplicated, meaning it does not point to the actual
		   object. This is to prevent data tampering.
		*/
		schedule.list[name] = Object.assign({
			id: id
		}, slot);
		// Create the cards.
		schedule.list[name].cards = newCard(name, id, slot);
		// Create the summary sidebar entry.
		schedule.list[name].tr = newSummary(name, id, slot);

		// Scroll to the card's location.
		scrollTo(
			(slot.time[0] + slot.time[1]/2 + // Card size.
			35/2 + 5)/0.6 - // Header size (the weekday display).
			innerHeight/2 // Screen size.
		);

		// Check if this schedule was already named.
		if (schedule.name)
			saveData(); // Autosave.
		else {
			// Reveal the save button.
			img.save.style.opacity = 1;
			img.save.style.pointerEvents = "auto";
		}

		return true; // Sucessfully added to schedule.
	}
}

function courseDrop(name) {
	let slot = schedule.list[name];

	if (slot) {
		// Get rid of the summary sidebar entry.
		div.summary_tbody.removeChild(slot.tr);

		// Get rid of the cards.
		for (let i in slot.cards)
			slot.cards[i].parentElement.removeChild(slot.cards[i]);

		// Resize scroll boundaries.
		let min = slot.time[0] + slot.time[1] == scroll_min,
			max = slot.time[0] == scroll_max;
		scroll_min = min ? null : scroll_min;
		scroll_max = max ? null : scroll_max;

		if (scroll_min == null || scroll_max == null)
			for (let i in schedule.list) {
				let v = schedule.list[i];

				if (min)
					if (scroll_min != null)
						scroll_min = Math.min(
							v.time[0] + v.time[1],
							scroll_min
						);
					else
						scroll_min = v.time[0] + v.time[1];

				if (max)
					if (scroll_max != null)
						scroll_max = Math.max(slot.time[0], scroll_max);
					else
						scroll_max = slot.time[0];
			}

		// Remove entry from schedule.
		delete schedule.list[name];

		// See if there are no slots left in the schedule.
		if (!Object.values(schedule.list).length) {
			// Hide the save button.
			img.save.style.opacity = "";
			img.save.style.pointerEvents = "";

			// Hide the summary since there's nothing to show.
			div.summary.style.transform = "";
			div.summary.style.boxShadow = "";

			setSpook(); // lolol
		}

		// Only save when the schedule is properly set up.
		if (schedule.name)
			saveData();

		return true; // Successfully removed from schedule.
	}
}


//-- The info window for course slots. --//

/**
 * Show the info window.
 * @param String name - the name of the course. Must be all caps.
 * @param Integer id - the slot's ID.
 * @param Object slot - The slot's data.
**/
function showInfo(name, id, slot) {
	enrollTarget = [name, id, slot, !hasConflict(name, slot)];
	div.info_header.innerHTML = name;
	div.info_subtitle.innerHTML = data.course[name] || "";

	let table = div.info.getElementsByTagName("table")[0];

	// Get rid of the previous table.
	if (table)
		table.parentElement.removeChild(table);

	let tbody = elem("tbody");
	table = elem("table");

	let l = {
		ID: id,
		Section: slot.section,
		Days: slot.day.join(slot.day[0].length > 1 ? "<br>" : ""),
		Room: slot.room,
		Time: parseTime(slot.time[0]) + " - " +
			parseTime(slot.time[0] + slot.time[1]),
		Professor: slot.professor || "",
		Enrolled: slot.enrolled + " of " + slot.cap + " enrolled"
	};

	for (let i in l) {
		let tr = elem("tr");
		tr.innerHTML = "<td>" + i + "</td><td>" + l[i] + "</td>";

		tbody.appendChild(tr);
	}

	table.appendChild(tbody);
	div.info_div.appendChild(table);

	// Check if already enrolled.
	if (schedule.list[name] && schedule.list[name].id == id) {
		// Already enrolled. Change state to 'drop' state.
		div.info_img[1].setAttribute("src", "assets/img/drop.png");
		div.info_img[1].setAttribute("drop", 1);
		div.info_img[1].setAttribute("enabled", 1);
	} else {
		// Not yet enrolled. Change state to 'enroll' state.
		div.info_img[1].setAttribute("src", "assets/img/enroll.png");
		div.info_img[1].removeAttribute("drop");

		// Check if there are no conflicts.
		if (enrollTarget[3])
			// Can enroll. Enable it.
			div.info_img[1].setAttribute("enabled", 1);
		else
			// Cannot enroll. Disable it.
			div.info_img[1].removeAttribute("enabled");
	}

	div.info.style.opacity = 1;
	div.info.style.pointerEvents = "auto";
}

// Close function.
function info_close() {
	enrollTarget = null;
	div.info.style.opacity = 0;
	div.info.style.pointerEvents = "";
}

// Close button.
div.info_img[0].addEventListener("click", info_close);
tooltipListener(div.info_img[0], "<label>Close</label>", null, 1);

// Clicking outside the info window.
info.getElementsByTagName("dim")[0]
	.addEventListener("mousedown", info_close);

// Enroll/Drop button.
div.info_img[1].addEventListener("click", () => {
	// Make sure there is an actual target.
	if (enrollTarget)
		// See if the user is trying to enroll.
		if (enrollTarget[3]) {
			// User is attempting to enroll.
			if (courseEnroll(
				enrollTarget[0],
				enrollTarget[1],
				enrollTarget[2]
			)) {
				div.info_img[1].setAttribute("src", "assets/img/drop.png");
				div.info_img[1].setAttribute("drop", 1);

				enrollTarget[3] = !enrollTarget[3]; // Flip.
			}
		} else if (schedule.list[enrollTarget[0]] &&
				schedule.list[enrollTarget[0]].id == enrollTarget[1]) {
			// User wants to drop the target. Check if the same id.
			if (courseDrop(enrollTarget[0])) {
				div.info_img[1].setAttribute(
					"src",
					"assets/img/enroll.png"
				);
				div.info_img[1].removeAttribute("drop");

				enrollTarget[3] = !enrollTarget[3]; // Flip.
			}
		}
});

// Tooltip for enrolling.
tooltipListener(div.info_img[1],
	"<label>Add to schedule.</label>",
	() => {
		return !div.info_img[1].getAttribute("drop") &&
			div.info_img[1].getAttribute("enabled");
	},
	1
);

// Tooltip when there is a conflict.
tooltipListener(div.info_img[1],
	"<label>This has a conflict" +
	" with another slot.</label>",
	() => {
		return !div.info_img[1].getAttribute("enabled");
	}
);

// Tooltip for dropping.
tooltipListener(div.info_img[1],
	"<label>Remove from schedule.</label>",
	() => {
		return div.info_img[1].getAttribute("drop");
	},
	1
);


//-- The graphical part of the system. --//

/**
 * Create an entry in the summary sidebar.
 * @param String name - Name of the course.
 * @param Number id - ID of the slot.
 * @param Object slot - The data of the slot.
 * @return Object - The element that was added in the sidebar.
**/
function newSummary(name, id, slot) {
	// Set up the entry for the summary sidebar.
	let tr = elem("tr");
	let l = [id, name, slot.section, slot.room];

	for (let i in l) {
		let td = elem("td");
		td.innerHTML = l[i];

		tr.appendChild(td);
	}

	tr.addEventListener("mousedown", event => {
		if (event.button == 0)
			showInfo(name, id, slot);
	});

	div.summary_tbody.appendChild(tr);

	return tr;
}

/**
 * Create slot entries in the application's screen (AKA cards). Hovering
 * one of them will affect any related cards.
 * @param String name - Name of the course.
 * @param Number id - ID of the slot.
 * @param Object slot - The data of the slot.
 * @return Array[Object] - All the cards that were created.
**/
function newCard(name, id, slot) {
	let y = slot.time[0]/60,
		h = slot.time[1]/60;
	let t1 = ("00" + Math.trunc(slot.time[0]/60)).slice(-2) + ":" +
		("00" + (slot.time[0]%60)).slice(-2),
		tp1 = "calc(" + y*100 + "% + 10px)",
		t2 = ("00" + Math.trunc(
			(slot.time[0] + slot.time[1])/60)
		).slice(-2) + ":" +
		("00" + ((slot.time[0] + slot.time[1])%60)).slice(-2),
		tp2 = "calc(" + (y + h)*100 + "% - 5px)";
	let seats = slot.cap - slot.enrolled,
		cap_src = seats ? "assets/img/open.png" : "assets/img/full.png",
		cap_tooltip = "<label>" +
			(seats ? (seats + (seats > 1 ? " Seats" : " Seat") +
			" Remaining") : "Full") +
			"</label>";
	let cards = [];
	let t; // Used to check if scroll boundaries should be resized or not.

	for (let day in slot.day) {
		// Make sure that this date can actually be visualized.
		if (day_pos[slot.day[day]]) {
			t = 1; // Can be visualized. Resize scroll boundaries.
			let x = day_pos[slot.day[day]];
			let card = elem("card"),
				head = elem("label"),
				body = elem("label"),
				cap = elem("img");

			card.appendChild(head);
			card.appendChild(body);
			card.appendChild(cap);
			div.deck.appendChild(card);

			// Setup the card.
			head.innerHTML = name;

			body.class = "body";
			body.innerHTML = slot.section + "<br>" +
				slot.room + "<br>" +
				t1 + " - " + t2;
			body.setAttribute("class", "body");

			cap.id = "cap";
			cap.src = cap_src;
			cap.setAttribute("draggable", false);

			card.style.left = x*100 + "%";
			card.style.top = y*100 + "%";
			card.style.height = "calc(" + h*100 + "% - 5px)";

			tooltipListener(cap, cap_tooltip);

			card.addEventListener(
				"click",
				event => showInfo(name, id, slot)
			);

			card.addEventListener("mouseenter", event => {
				div.time.style.opacity = 0.1;
				div.time.style.top = "calc(" + y*100 + "% + 5px)";
				div.time.style.height = "calc(" + h*100 + "% - 5px)";
				div.screen_label[0].innerHTML = t1;
				div.screen_label[0].style.top = tp1;
				div.screen_label[0].style.opacity = 1;
				div.screen_label[1].innerHTML = t2;
				div.screen_label[1].style.top = tp2;
				div.screen_label[1].style.opacity = 1;

				for (let i = 0; i < cards.length; i++)
					cards[i].setAttribute("hover", 1);
			});

			card.addEventListener("mouseleave", event => {
				div.time.style.opacity = 0;
				div.screen_label[0].style.opacity = 0;
				div.screen_label[1].style.opacity = 0;

				for (let i = 0; i < cards.length; i++)
					cards[i].removeAttribute("hover");
			});

			cards.push(card);
		}
	}

	if (t)
		if (scroll_min == null) {
			scroll_min = slot.time[0] + slot.time[1];
			scroll_max = slot.time[0];
		} else {
			scroll_min = Math.min(slot.time[0] + slot.time[1], scroll_min);
			scroll_max = Math.max(slot.time[0], scroll_max);
		}

	return cards;
}

/**
 * On search input. Also used to update the course slots view, along
 * with the recently-searched-courses view.
**/
function oninput() {
	let list = data[schedule.AYTerm];

	// It's completely empty. Nothing to filter.
	if (!list)
		return;

	// Separate the input from the spaces.
	let txt = input.value.toUpperCase().match(/\S+/g) || [""];

	// Check if the user is trying to check via slot ID.
	if (!isNaN(Number(txt[0]))) for (let name in list)
		if (list[name].slots[txt[0]]) {
			// Redirect to the course's name with the ID.
			txt = [name, txt[0]];

			// Hide any tables if the slot is from another course.
			if (courseScope && courseScope[0] != name)
				list[courseScope[0]].table.style.display = "none";

			break;
		}

	// See if there's a match on the user's input.
	if (list[txt[0]]) {
		// Found a match in the searched courses.
		let slots = list[txt[0]].slots;

		if (!courseScope || courseScope[0] != txt[0])
			// Make the table visible when the names match.
			list[txt[0]].table.style.display = "";

		/* See if the user is trying to filter out the slots. Also
		   only update if there is a difference from before.
		*/
		if (!courseScope ||
			courseScope.toString() != txt.toString()) {
			// This will help reduce lag by minimizing the effort.
			if (txt.length > 1) {
				let id;

				// Iterate through each slot.
				for (let n in slots) {
					slots[n].tr.style.display = ""; // Set it visible first.

					// See if an existing ID is found in the filters.
					if (id == null) {
						// Iterate through each filter except the 1st one.
						for (let i = 1; i < txt.length; i++) {
							// See if the selected filter is an ID.
							if (slots[txt[i]]) {
								/* Set the ID so we don't have to iterate
								   again.
								*/
								id = txt[i];

								// Hide it if it doesnt match with the ID.
								if (id != n)
									slots[n].tr.style.display = "none";

								break;
							} else if (slots[n].literal
							.search(txt[i]) == -1) {
								/* Hide anything that doesn't match with
								   all of the filters.
								*/ 
								slots[n].tr.style.display = "none";

								break;
							}
						}
					} else if (id != n)
						/* Since an ID was found, we no longer need to
						   iterate through the filters, and only need
						   to see if it has a matching ID.
						*/
						slots[n].tr.style.display = "none";
				}
			} else {
				// User wants to see the entire output.
				for (let i in slots)
					slots[i].tr.style.display = "";
			}
		}

		div.dump.style.display = "none";
		courseScope = txt;

		return;
	}
	/* No match found. Try to find a similar name in the
	  'recently-searched' view.
	*/

	if (courseScope) {
		// Hide the course view if visible.
		list[courseScope[0]].table.style.display = "none";

		courseScope = null;
	}

	// Make 'recently-searched' view visible.
	div.dump.style.display = "block";

	/* Find matches in the 'courseDump', which is just a long
	   string containing all the searched course names.
	*/
	let res = courseDump.match(
		new RegExp(courseDumpPre + txt[0] + courseDumpSuf, "g")
	);

	for (let name in list) {
		if (res !== null &&
			res.indexOf(courseDumpSep + name) > -1) {
			// Found a match. Make it visible.

			if (list[name].word.style.display)
				list[name].word.style.display = "";
		} else if (!list[name].word.style.display)
			// Text in the search input doesn't match. Hide it.
			list[name].word.style.display = "none";
	}
}

/**
 * Course creation.
**/
ipcRenderer.on("request", (event, name, slots) => {
	// Make an entry for AYTerm if first time.
	if (!data[schedule.AYTerm])
		data[schedule.AYTerm] = {};

	if (request_elm[name]) {
		// Close the 'requesting for...' message.
		request_elm[name][1]();

		delete request_elm[name];
	}

	let entry = data[schedule.AYTerm][name];

	// Make sure there's actually something to receive.
	if (typeof(slots) !== "number" && Object.values(slots).length) {
		// Get rid of the previous data.
		if (entry) {
			div.dump.removeChild(entry.word);
			div.course_table.removeChild(entry.table);
		}

		// Add search text box recent list.
		courseDump += courseDumpSep + name;

		let word = elem("label");
		word.innerHTML = "#" + name + " ";

		word.setAttribute("class", "dump");

		word.addEventListener("mousedown", event => {
			hit = word;

			if (event.button == 0) {
				input.value = name;

				div.dump.insertBefore(word, div.dump.childNodes[0]);
				oninput();
			}
		});


		//-- Store data. --//

		data[schedule.AYTerm][name] = {
			/* The element that will be appended to the
			   recently-searched view.
			*/
			word: word,
			// The element for the course view.
			table: elem("table"),
			slots: slots
		};
		entry = data[schedule.AYTerm][name];

		// Hide it by default.
		entry.table.style.display = "none";

		entry.table.setAttribute(
			"class",
			"course"
		);
		div.course_table.appendChild(
			entry.table
		);


		//-- Iterate through each slot to setup the table. --//

		for (let id in slots) {
			let slot = slots[id];
			let tr = elem("tr");
			let full = slot.enrolled >= slot.cap;
			let literal = "";

			if (full)
				// Set to 'full' state to change appearance.
				tr.setAttribute("full", 1);

			entry.table.appendChild(tr);

			// Will be used to create the 'td' element for the table.
			function td(label, desc) {
				let td = elem("td");
				td.innerHTML = label;
				literal += label + " ";

				tr.appendChild(td);

				return td;
			}


			// Append some of the information.

			// Section.
			td(slot.section).setAttribute("bold", 1);
			// Day/s. Only show 2 characters since it wont fit.
			let day_str = slot.day.join("");
			td(day_str.length <= 2 ? day_str : "");
			// Time.
			td(
				parseTime(slot.time[0]) + " - " +
				parseTime(slot.time[0] + slot.time[1])
			);
			// Room.
			td(slot.room);

			// Store the element, which allows us to manipulate later.
			slot.tr = tr;
			// Trim off the extra space at the end.
			slot.literal = literal.slice(0, -1);

			tr.addEventListener("mouseenter", event => {
				// Hide the summary sidebar.
				div.summary.style.transform = "";
				div.summary.style.boxShadow = "";

				setPreview(name, slot);
			});

			tr.addEventListener("mouseleave", event => {
				// Show the summary if has 1 course enrolled.
				if (Object.values(schedule.list).length) {
					div.summary.style.transform =
						"translateX(-100%)";
					div.summary.style.boxShadow =
						"0 0 5px #000";
				}

				setPreview();
			});

			tr.addEventListener("mousedown", event => {
				if (event.button == 0)
					showInfo(name, id, slots[id]);
				else if (event.button == 2)
					courseEnroll(name, id, slots[id]);
			});
		}

		// Send a message to the user.
		sendMessage(
			"'" + name + "' data received.", null, 2
		);
	} else if (slots == -3)
		sendMessage(
			"No slots were being offered for '" + name + "'.",
			null,
			2
		);
	else
		sendMessage(
			"Could not receive data for '" + name + "'.", null, 2
		);

	if (entry) {
		// Put the course's 'recent' element at the top.
		div.dump.insertBefore(entry.word, div.dump.childNodes[0]);

		// Re-show the table if it was selected before.
		if (courseScope && courseScope[0] == name)
			entry.table.style.display = "";

		oninput();
	}
});


//-- Search button. --//

input.addEventListener("focus", event => {
	div.course.style.opacity = 1;
	div.course.style.pointerEvents = "auto";
	label.spooky.style.opacity = 0;
	img.search.style.pointerEvents = "auto";

	img.search.setAttribute("src", "assets/img/close.png");

	// Show the summary if there is at least 1 course enrolled.
	if (Object.values(schedule.list).length) {
		div.summary.style.transform = "translateX(-100%)";
		div.summary.style.boxShadow = "0 0 5px #000";
	}

	/* Get rid of the search button emphasis after the user
	   clicks it.
	*/
	if (div.help) {
		let elm = div.help;
		elm.style.opacity = 0;

		setTimeout(
			() => elm.parentElement.removeChild(elm), 1000
		);

		delete div.help;
	}
});

input.addEventListener("focusout", event => {
	if (hit) {
		/* This is to re-focus on the search textbox again.
		   Since the focus is lost when clicking outside the
		   textbox, we use this to persist the focus. The hit's
		   value doesn't matter, so long as it's a 'non-false'.
		*/
		hit = null;

		input.focus(); // Persist focus.
	} else {
		div.course.style.opacity = 0;
		div.course.style.pointerEvents = "";
		label.spooky.style.opacity = 0.3;

		if (!Object.values(schedule.list).length)
			setSpook();

		img.search.setAttribute("src", "assets/img/search.png");
		img.search.style.pointerEvents = "";
	}
});

input.addEventListener("input", oninput);

input.addEventListener("keyup", event => {
	let val = input.value.toUpperCase();

	if (event.key === "Enter" &&
		schedule.AYTerm && // Do not request if AYTerm isn't set.
		val.length > 0 && // Must have an entry.
		val.search(/\s/) == -1) { // No spaces.

		ipcRenderer.send("request", val, schedule.AYTerm);

		if (!request_elm[val])
			request_elm[val] = sendMessage(
				"Requesting data for '" + val + "'...",
				() => {} // Disable 'click on close'.
			);
	}
});

img.search.addEventListener("mousedown", event => {
	hit = img.search;

	if (event.button == 0) {
		input.value = "";
		oninput();
	}
});

tooltipListener(
	img.search,
	"<label>Clear</label>"
);


//-- Load, Save, and Config buttons. --//

tooltipListener(
	img.load,
	"<label>Open/New Schedule</label>",
	null,
	1
);

tooltipListener(
	img.config,
	"<label>Configure Preference</label>",
	null,
	1
);


//-- Mouse/key events. --//

document.addEventListener("mousewheel", event => {
	if (event.target.tagName === "CARD" ||
		event.target.tagName === "BODY") {
		scrollAdd(event.deltaY);
	}
});

document.addEventListener("mousedown", event => {
	if (event.target.tagName === "CARD" ||
		event.target.tagName === "BODY") {
		drag = 1;
		div.screen.style.transition = "none";
	}
});

document.addEventListener("mouseup", event => {
	drag = 0;
	div.screen.style.transition = "top 0.1s";
})

document.addEventListener("mousemove", event => {
	if (drag) {
		scrollAdd(-event.movementY);
	}
})


//-- Create tooltips. --//

// Search
{
	let elm = getId("search")
		.getElementsByTagName("input")[0];

	tooltipListener(
		elm,
		"<label>Search</label>",
		() => {
			return document.activeElement !== elm;
		},
		1
	);
}


//-- See if there's anything to load. --//

{
	let v = ipcRenderer.sendSync("loaded");

	if (v != -1) {
		loadSchedule(getSched(v));

		// Get rid of the search button emphasis.
		if (div.help) {
			let elm = div.help;
			elm.style.opacity = 0;

			setTimeout(
				() => elm.parentElement.removeChild(elm), 1000
			);

			delete div.help;
		}
	}
}
// Tricky stuff to see if it's being run by Electron.
try {
	var path = require("path");
	var fs = require("fs");
	var {shell} = require("electron");
} catch(err) {
	require = null;
}

// Where the data comes from. I take no credit from them.
const dlsu_src = (!require ? "https://cors.io/?" : "") +
	// We use 'cors.io' to bypass the security. Its legal, don't worry.
	"https://enroll.dlsu.edu.ph/dlsu/view_actual_count";
// Used to check if there's an unacceptable character for file names.
const nonfilechar = /[\\/:*?"<>|]/;
const nonfilechar_warn = "You cant use the following characters:" +
	"<br>\\ / : * ? \" < > |";
// Shortcuts
const elem = document.createElement.bind(document),
	body = document.body,
	getId = document.getElementById.bind(document),
	getTag = document.getElementsByTagName.bind(document),
	getClass = document.getElementsByClassName.bind(document);
// Offset
const day_pos = {
	M: 1,
	T: 2,
	W: 3,
	H: 4,
	F: 5,
	S: 6
};
// The actual screen isn't exactly at (0, 0).
const scroll_offset = 35;
/* The data of what a schedule file should look like. Everything in here
   are the default values.
*/
const schedule_default = {
	// List of all the courses the user has enrolled.
	list: {},
	/* Wait for the application to get the AYTerm from DLSU, otherwise
	   let the user choose a file to load first.
	*/
	AYTerm: null,
	// Auto-search on file load. Neat stuff yo.
	autosearch: true,
	// Auto-save whenever the user does something important.
	autosave: true
}


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

// The search button.
div.search = getId("search");
div.search_input = div.search.getElementsByTagName("input")[0];
div.search_img = div.search.getElementsByTagName("img")[0];

// The load button.
div.load_input = getClass("load")[0];
div.load_img = getClass("load")[1];

// The config window.
div.config = getId("config");
div.config_dim = div.config.getElementsByTagName("dim")[0];
div.config_img = div.config.getElementsByTagName("img")[0];
div.config_div = div.config.getElementsByTagName("div")[1];
div.config_input = div.config.getElementsByTagName("input");
div.config_check = div.config.getElementsByTagName("check");
div.config_dropdown = div.config.getElementsByTagName("dropdown")[0]
	.getElementsByTagName("div")[0];

// The info window.
div.info = getId("info");
div.info_div = div.info.getElementsByTagName("div")[0];
div.info_header = div.info.getElementsByTagName("header")[0];
div.info_subtitle = div.info.getElementsByTagName("subtitle")[0];
div.info_img = div.info.getElementsByTagName("img");

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
	save: getClass("save")[0],
	// Load button. Also functions as a 'new window' button.
	load: getClass("load")[1],
	config: getClass("config")[0],
	search: getClass("search")[0]
};

let label = {
	// Spooky, sneaky.
	spooky: getId("spooky"),
	// Academic year and term display.
	AYTerm: getId("AYTerm")
};

/* The current tooltip's focused element. This is used for when the
   previous element is attempting to clear the tooltip when the
   current tooltip isn't theirs anymore.
*/
let tooltip;
// The user's schedule. Copy the default schedule.
let schedule = Object.assign({}, schedule_default);
// This will be used for auto-saving (desktop only).
let schedule_path;
/* Used for the info window. Should be an array; [name, id, state].
   If 'state' has a 'non-false' value, it will enroll the target,
   otherwise it will drop it if it exists in the 'schedule'
   object.
*/
let enroll_target;
// Currently viewed course.
let course_scope;
// Separator for each dumped text.
let course_dump_sep = String.fromCharCode(0);
// Phrases used for searching.
let course_dump_pre = course_dump_sep + "[^" + course_dump_sep + "]*",
	course_dump_suf = "[^" + course_dump_sep + "]*";


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
		data[l[i]] = fs && fs.existsSync(v) ?
			JSON.parse(fs.readFileSync(v)) :
			{};
	}
}


//-- Data scraping shenanigans. --//

/* Notes about scraped data.
 * - Each data is categorized by the course's name and AYTerm.
 * - Each data will hold 'word' and 'table' element.
 * - Only the currently selected AYTerm will be visible.
**/
let scraper = {
	data: {},
	AYTerm: null,
	/**
	 * Draw the 'word' and 'table' element for the course. This will need
	 * an entry in the 'scraper.data' already, otherwise it'll cause an
	 * error.
	 * @param String name - the name of the course.
	 * @param String ayterm - the AYTerm associated with the course.
	 * @param Object slots - the collection of slots of the course.
	**/
	draw: (name, ayterm, slots) => {
		// Add search text box recent list.
		let entry = scraper.data[ayterm][name];
		scraper.data[ayterm].dump += course_dump_sep + name;

		//-- Create the 'word' element. --//

		entry.word = elem("label");
		entry.word.innerHTML = "#" + name + " ";

		entry.word.setAttribute("class", "dump");
		entry.word.addEventListener("mousedown", event => {
			hit = entry.word;

			if (event.button == 0) {
				div.search_input.value = name;

				div.dump.insertBefore(entry.word,div.dump.childNodes[0]);
				search_input();
			}
		});
		div.dump.insertBefore(entry.word, div.dump.childNodes[0]);


		//-- Create the 'table' element. --//

		entry.table = elem("table");
		entry.table.style.display = "none"; // Hide it by default.

		entry.table.setAttribute("class", "course");
		div.course_table.appendChild(entry.table);

		// Iterate through each slot to setup the table.
		for (let id in slots) {
			let slot = slots[id];
			let tr = elem("tr");
			let full = slot.enrolled >= slot.cap;
			let literal = "";

			if (full)
				// Set to 'full' state to change appearance.
				tr.setAttribute("full", 1);

			entry.table.appendChild(tr);


			// See if the user has enrolled a slot from this course.
			let v = schedule.list[name];

			if (v && v.id == id) {
				// Update everything!
				for (let i in slot) if (i != "tr")
					v[i] = slot[i];

				// Replace the cards.
				for (let i in v.cards)
					div.deck.removeChild(v.cards[i]);

				v.cards = card_new(name, id, v);

				// Replace the summary sidebar entry.
				div.summary_tbody.removeChild(v.tr);
				v.tr = summary_new(name, id, v);

				message_new("Updated '" + name + "'.", null, 2);
			}


			// Write down some of the data into the table.
			function td(label, desc) {
				let td = elem("td");
				td.innerHTML = label;
				literal += label + " ";

				tr.appendChild(td);

				return td;
			}

			// Section.
			td(slot.section).setAttribute("bold", 1);
			// Day/s. Only show 2 characters since it wont fit.
			let day_str = slot.day.join("");
			td(day_str.length <= 2 ? day_str : "");
			// Time.
			td(
				time_parse(slot.time[0]) + " - " +
				time_parse(slot.time[0] + slot.time[1])
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

				preview_set(name, slot);
			});

			tr.addEventListener("mouseleave", event => {
				// Show the summary if has 1 course enrolled.
				if (Object.keys(schedule.list).length) {
					div.summary.style.transform =
						"translateX(-100%)";
					div.summary.style.boxShadow =
						"0 0 5px #000";
				}

				preview_set();
			});

			tr.addEventListener("mousedown", event => {
				if (event.button == 0)
					info_show(name, id, slots[id]);
				else if (event.button == 2)
					course_add(name, id, slots[id]);
			});
		}
	},
	/**
	 * Returns the relevant data in the document returned by
	 * 'scraper.request()', which is automatically called
	 * by it.
	**/
	dress: doc => {
		let slots = {};
		// Get the exact table.
		let tbody = doc.getElementsByTagName("tbody")[8];
		// Get the rows.
		let tr = tbody.getElementsByTagName("tr");

		// See if there are multiple rows. The first row is the header.
		if (tr.length > 1) {
			// Mark the previous row for later use.
			let prev;

			// Get the 'youngest' node and grab its text.
			function node(v) {
				if (!v.firstChild ||
					v.firstChild.nodeName === "#text") {
					v = v.textContent.match(/[^\n]+/);

					return v != null ? v[0] : "";
				}

				return node(v.firstChild);
			}

			/* Iterate through the rows except for the first one. The
			   first one is the header, which we have no concern of.
			*/
			for (let i = 1; i < tr.length; i++) {
				/* This will contain the data, which we will now call as
				   slot for consistency.
				*/
				let slot = {};
				// Get each table data.
				let td = tr[i].getElementsByTagName("td");

				// See if there's more than 1.
				if (td.length > 1) {
					// Extract the data from the table.
					for (let x = 0; x < td.length; x++)
						scraper.dress_code[x](node(td[x]), slot);

					/* See if there's no ID (This means that this data
					   is part of another data).
					*/
					if (slot.id != null) {
						// Stamp the date.
						slot.acquired = new Date();
						// Add to collection.
						slots[slot.id] = slot;
						// Mark as previous.
						prev = slot;
					} else if (prev)
						/* So far, the only relevant data being used here
						   is the date (IPERSEF has 3 specific dates).
						*/
						prev.day = prev.day.concat(slot.day);
				} else if (prev) {
					/* Since there's only 1, this is most likely the
					   professor.
					*/
					scraper.dress_code[9](node(td[0]), prev);
				}
			}
		}

		return slots;
	},
	/**
	 * A list of functions used to clean up the scraped data.
	 * @param Value v - the data being cleaned up.
	 * @param Object slot - the receiving object.
	**/
	dress_code: [
		// ID 0
		(v, slot) => {
			if (v.length > 0) {
				v = v.match(/\d+/);
				v = v ? Number(v[0]) : null;
				slot.id = v;
			}
		},
		// Name 1
		(v, slot) => {
			v = v.match(/\S+/);
			v = v ? v[0] : null;
			slot.name = v;
		},
		// Section 2
		(v, slot) => {
			v = v.match(/\S+/g);
			v = v != null ? v[0] : null;
			slot.section = v;
		},
		// Day 3
		(v, slot) => {
			v = v.length > 2 ?
				[v] : // Courses with a specific date.
				v.match(/\S/g); // The usual courses.
			v = v ? v : [];
			slot.day = v;
		},
		// Time 4
		(v, slot) => {
			v = v.match(/\d+/g);
			v = v ? v : [];

			// Parse the time.
			for (let i in v) {
				v[i] = Number(v[i].substr(0, 2))*60 +
					Number(v[i].slice(-2));

				if (v[i] < 0)
					v[i] = 0;

				if (i > 0)
					v[1] -= v[0];
			}

			slot.time = v;
		},
		// Room 5
		(v, slot) => slot.room = v,
		// Cap 6
		(v, slot) => {
			v = Number(v);
			v = v != null ? v : null;
			slot.cap = v;
		},
		// Enrolled 7
		(v, slot) => {
			v = Number(v);
			v = v != null ? v : null;
			slot.enrolled = v;
		},
		// Remarks 8
		(v, slot) => slot.remarks = v,
		// Professor 9
		(v, slot) => {
			if (v)
				// Get rid of extra spaces.
				slot.professor = v.match(/\S+/g).join(" ");
		}
	],
	/**
	 * Request the specified data from DLSU. Each request will update
	 * the AYTerm. If 'name' is empty or is 'AYTERM', it will only
	 * request for the AYTerm. The academic year and term will be return
	 * through the 'AYTERM' channel via 'scraper.once()'.
	 * I'm not taking any credits here, just so we're clear.
	 * @param String name - the name of the course.
	 * @param String ayterm - if supplied, it will return the value
	 * that matches with the ayterm.
	 * @param Function callback - will be fired upon data retrieval.
	**/
	request: (name, ayterm, callback) => {
		// Make a dummy callback if not supplied.
		callback = callback || function() {};
		// Supply the ayterm if null.
		ayterm = ayterm || scraper.AYTerm;

		let xml = new XMLHttpRequest();
		xml.responseType = "document";

		xml.onreadystatechange = function() {
			if (this.readyState == 4 && this.status == 200) {
				// Get for the AYTerm.
				let v = this.response.getElementsByClassName(
					"content_title"
				)[0].innerText.match(/[^\n]+/);
				v = v ? v[0] : "";

				// Update the AYTerm.
				scraper.AYTerm = v;

				// See if user only needs the AYTerm.
				if (name === "AYTERM")
					callback(v);
				else if (ayterm && ayterm !== v)
					// AYTerm doesn't match. Return a cached data.
					callback(
						scraper.data[ayterm] &&
						scraper.data[ayterm][name] || {}
					);
				else {
					// Scrape some data.
					let slots;

					// Try to retrieve any data.
					slots = scraper.dress(this.response);

					if (typeof(slots) === "object" &&
						Object.keys(slots).length) {
						// Create the entry for the current AYTerm.
						if (!scraper.data[v])
							scraper.data[v] = {dump: ""};

						// Record the data.
						scraper.data[v][name] = {slots: slots};

						// Cache data to local storage if possible.
						if (require) {
							if (!fs.existsSync("cache"))
								fs.mkdirSync("cache");

							if (!fs.existsSync("cache\\" + v))
								fs.mkdirSync("cache\\" + v);

							fs.writeFileSync(
								"cache\\" + v + "\\" + name + ".json",
								JSON.stringify(slots)
							);
						}

						// Draw the elements.
						scraper.draw(name, v, slots);
						// Re-check the input just incase.
						search_input();
					}

					// Return the data.
					callback(slots);
				}
			} else if (this.status != 0 && this.status != 200)
				// Something bad happened!
				callback(-2);
		}

		// See if there's a name to search for.
		if (name && name !== "AYTERM") {
			// Search for the course.
			name = name.toUpperCase(); // Make sure it's all caps.

			// See if there's anything cached.
			if (scraper.data[ayterm] && scraper.data[ayterm][name])
				return callback(scraper.data[ayterm][name]);

			/* See if ayterm is supplied and it matches with the current
			   AYTerm. Still search if current AYTerm is unknown.
			*/
			if (ayterm === scraper.AYTerm || !scraper.AYTerm)
				xml.open("GET", dlsu_src + "?p_course_code=" + name);
			else if (require) {
				// We can still get things in the user's cache.
				let slots = "cache\\" + ayterm + "\\" + name + ".json";

				if (fs.existsSync(slots)) try {
					slots = JSON.parse(fs.readFileSync(slots));

					if (!scraper.data[ayterm])
						scraper.data[ayterm] = {};

					scraper.data[ayterm][name] = {slots: slots};

					scraper.draw(name, ayterm, slots);
					// Re-check the input just incase.
					search_input();

					return callback(slots);
				} catch(err) {
					// Return nothing :(
					return callback({});
				}
			} else
				// Return nothing :(
				return callback({});
		} else if (!scraper.ayterm) {
			// Get the current academic year and term.
			name = "AYTERM";

			xml.open("GET", dlsu_src);
		} else
			// Current AYTerm is already known. Return that instead.
			return callback(scraper.ayterm);

		xml.send();
	}
};


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
function spook_set(flag) {
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
function message_new(str, callback, lifetime, type) {
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
		if (lifetime && tick != -1)
			timer();
	});

	// Setup the timer, if it actually has one.
	if (lifetime)
		timer();

	// Return both the element and the 'close' function.
	return [elm, close];
}

/**
 * Get rid of the search button emphasis after the user clicks it.
**/
function help_rem() {
	if (div.help) {
		let elm = div.help;
		elm.style.opacity = 0;
		delete div.help;

		setTimeout(() => elm.parentElement.removeChild(elm), 1000);
	}
}

/**
 * Create a dialog window. This will be on top of everything (including
 * any previous dialog windows) except for the notification messages
 * on the bottom-right corner.
**/
function dialog_show(txt, buttons, callback) {
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

				setTimeout(() => body.removeChild(dialog), 1000);
			}
		});
	}

	setTimeout(() => dialog.style.opacity = 1, 5);
}

/**
 * Parse seconds into string in HHMM format (H = hours; M = minutes).
 * @param Integer v - The seconds.
 * @return String - Seconds converted to string.
**/
function time_parse(v) {
	return ("00" + Math.trunc(v/60)).slice(-2) +
		("00" + v%60).slice(-2);
}


//-- Academic year and term request. --//

// Make sure that the file has yet to have its AYTerm set.
if (schedule.AYTerm) {
	label.AYTerm.innerHTML = schedule.AYTerm;

	config_AYTerm(schedule.AYTerm);
} else if (scraper.AYTerm) {
	// Set current AYTerm with the latest.
	schedule.AYTerm = scraper.AYTerm;
	label.AYTerm.innerHTML = scraper.AYTerm;
	div.config_input[0].value = scraper.AYTerm;

	config_AYTerm(scraper.AYTerm);
} else {
	/* Try to request for current academic year and term.
	   Otherwise, make use of the offline cache.
	*/
	let v = fs && fs.existsSync("cache") &&
			fs.readdirSync("cache").filter(
		name => isdir("cache" + "\\" + name)
	);

	// Set the AYTerm with the offline cache's latest.
	if (v) {
		v = v.sort().pop();
		schedule.AYTerm = v;
		label.AYTerm.innerHTML = v;
	}

	// Make a request for AYTerm.
	scraper.request(null, null, (ayterm) => {
		schedule.AYTerm = ayterm;
		label.AYTerm.innerHTML = ayterm;
		div.config_input[0].value = ayterm;

		config_AYTerm(ayterm);
		message_new(
			"Retrieved current academic year and term.<br>" +
			"'" + ayterm + "'",
			null,
			2
		)
	});
}


//-- Prompt window. --//

function prompt_show() {
	// Look for a suitable name for that wonderful schedule they got.
	let filename = 1;

	while (1)
		if (fs.existsSync("save\\Schedule " + filename + ".json"))
			filename++;
		else {
			filename = "Schedule " + filename;

			break;
		}

	// Show the window.
	div.prompt.style.pointerEvents = "auto";
	div.prompt.style.opacity = 1;

	/* Set the placeholder so the user knows what the name would be
	   if left empty.
	*/
	div.prompt_input.setAttribute("placeholder", filename);
	div.prompt_input.focus();
}

/**
 * The last function to be called to properly save a file. This is not
 * used by browser version.
 * @param String filename - The name of the file (excluding the extension).
**/
function prompt_save_fn(filename) {
	schedule_path = location.pathname;
	schedule_path = schedule_path.slice(
		1,
		-path.basename(schedule_path).length
	) + "save/" + filename + ".json";

	prompt_hide();

	// Make the directory.
	if (!fs.existsSync("save"))
		fs.mkdirSync("save");

	// Add the creation date stamp.
	schedule.created = new Date();

	file_save();
	message_new(
		"Schedule will now automatically save.<br>" +
		"Click to open folder.",
		() => {
			shell.openItem(__dirname + "\\save");

			return 1;
		},
		3
	);

	// Hide the save button.
	img.save.style.opacity = "";
	img.save.style.pointerEvents = "";
}

function prompt_save() {
	let filename = div.prompt_input.value ||
		div.prompt_input.placeholder;

	if (fs.existsSync("save\\" + filename + ".json"))
		dialog_show(
			"Another schedule with the same name already exists!",
			["Overwrite", "Cancel"],
			(event, choice) => {
				if (!choice)
					prompt_save_fn(filename);

				return true;
			}
		);
	else
		prompt_save_fn(filename);
}

img.save.addEventListener("click", file_save);

tooltip_new(
	img.save,
	"<label>Save Schedule</label>",
	null,
	1
);

div.prompt_img[0].addEventListener("click", prompt_save);

div.prompt_input.addEventListener("input", event => {
	if (nonfilechar.test(event.data)) {
		div.prompt_input.value = div.prompt_input.value.slice(0, -1);

		message_new(
			nonfilechar_warn,
			null,
			2
		);
	}
});

div.prompt_input.addEventListener("keydown", event => {
	if (event.code === "Enter")
		prompt_save();
});

tooltip_new(
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

tooltip_new(
	div.prompt_img[1],
	"<label>Cancel</label>",
	null,
	1
);


//-- Schedule functions. --//

/**
 * Parse the schedule's raw data.
 * @param String txt - the raw data.
**/
function sched_parse(txt) { try {
	let sched = JSON.parse(txt);
	let list = sched.list;

	// Check if there's anything wrong before doing something.
	if (!list)
		throw null;

	// // Find out the name without the extension.
	// let ext = name.match(/\./g);

	// // See if there's at least 1 dot.
	// if (ext && ext.length)
	// 	// Get rid of the right-most dot.
	// 	sched.name = name.slice(
	// 		0,
	// 		-name.match(/\.[^\.]+$/)[0].length
	// 	);
	// else
	// 	// Just take the name as is.
	// 	sched.name = name;

	for (let i in list)
		if (!list[i].day || !list[i].time)
			// Get rid of faulty data.
			delete list[i];
		else
			// Formalize data.
			list[i].literal = list[i].section + " " +
				list[i].day.join("") + " " +
				time_parse(list[i].time[0]) + " - " +
				time_parse(list[i].time[0] + list[i].time[1]) +
				" " + list[i].room;

	return sched;
} catch(err) {} }

/**
 * Removes all the added courses in the schedule.
**/
function sched_clear() {
	for (let name in schedule.list) {
		// Remove summary sidebar elements.
		div.summary_tbody.removeChild(schedule.list[name].tr);

		// Remove cards.
		for (let i in schedule.list[name].cards)
			div.deck.removeChild(schedule.list[name].cards[i]);

		delete schedule.list[name];
	}
}

/**
 * Load a saved schedule. This will also update the schedule. This can
 * also be used for loading a blank schedule to reset everything to
 * default.
 * @param Object sched - the schedule.
 * @param String filepath - If being run by Electron API, the whole path
 * to the file, otherwise it will only be the file's name and extension.
**/
function sched_load(sched, filepath) {
	if (!sched) return; // No bamboozling pls.

	// Get rid of the previous schedule.
	sched_clear();

	// Create the visual stuffs (cards and sidebar elements).
	let list = sched.list;
	let i = 0;
	scroll_min = scroll_max = null; // Set to null for calibration.

	for (let name in list) {
		let slot = list[name];
		slot.cards = card_new(name, slot.id, slot);
		slot.tr = summary_new(name, slot.id, slot);

		// Try to request for them if allowed.
		if (sched.autosearch)
			scraper.request(name, sched.AYTerm);

		// Measure the scroll boundaries.
		if (scroll_min != null)
			scroll_min = Math.min(slot.time[0] + slot.time[1], scroll_min);
		else
			scroll_min = slot.time[0] + slot.time[1];

		if (scroll_max != null)
			scroll_max = Math.max(slot.time[0], scroll_max);
		else
			scroll_max = slot.time[0];

		if (!i) {
			spook_set(1); // lolol

			i = 1;
		}
	}

	if (!i) spook_set(); // lolol

	// Replace.
	schedule = sched;
	label.AYTerm.innerHTML = sched.AYTerm;

	// Adapt configuration window.
	div.config_input[0].value = sched.AYTerm;

	if (sched.autosearch)
		div.config_check[0].setAttribute("active", 1);
	else
		div.config_check[0].removeAttribute("active");

	if (sched.autosave)
		div.config_check[1].setAttribute("active", 1);
	else
		div.config_check[1].removeAttribute("active");

	// Set file path.
	schedule_path = filepath;

	// Message user.
	if (filepath) {
		// Get the name.
		let v = filepath.substr(filepath.match(/.+\\/)[0].length);

		if (v.indexOf(".") != -1)
			v = v.match(/.+\./)[0].slice(0, -1);

		message_new("Loaded '" + v + "'.", null, 2);
	}

	scroll_to(0); // Scroll to top.

	return 1;
}


//-- Load button. --//

const load_fn = file => file_load(file, (sched, filepath) => sched &&
	sched_load(sched, filepath) || message_new(
		"We can't seem to load that file, sorry!",
		null,
		2,
		2
	)
);

div.load_input.addEventListener("change", event =>
	load_fn(event.target.files[0])
);

div.load_img.addEventListener("mousedown", event => 
	event.button == 0 && div.load_input.click()
);

tooltip_new(
	div.load_img,
	"<label>Open/New Schedule</label>",
	null,
	1
);

/**
 * Check if the two slots have at least 1 schedule with the same
 * day.
**/
function match_day(a, b) {
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

		if (v && match_day(slot.day, v.day)) {
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

function preview_set(name, slot) {
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

		scroll_to(
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
function scroll_add(delta) {
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
function scroll_to(y, force) {
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
function tooltip_move(event) {
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

document.addEventListener("mousemove", tooltip_move);

/**
 * Make it so that the element sets the tooltip's message when it's
 * hovered, and clear after unhovering.
 * @param Object elm - The element that owns the message.
 * @param String value - The message.
 * @param Function cond - The condition fired when hovering.
		The function must return a value that doesn't equate
		to 'false' (zero, empty string, etc). 'elm' is passed
		as the argument.
 * @param Integer flag - 0 = None; 1 = Hide on focus or mouse down.
 * @return Object elm.
**/
function tooltip_new(elm, value, cond, flag) {
	elm.addEventListener("mouseenter", event => {
		if (!cond || cond(elm)) {
			tooltip = elm;
			div.tooltip.innerHTML = value;
			div.tooltip.style.display = "block";

			tooltip_move(event);
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


//-- Course functions. --//

/**
 * Hides AYTerm 'a' courses and shows AYTerm 'b' courses.
 * @param String a - AYTerm courses to be hidden.
 * @param String b - AYTerm courses to be shown.
**/
function course_set(a, b) {
	let list = scraper.data[a];
	course_scope = null;
	div.search_input.value = "";
	div.dump.style.display = "";

	if (list) for (let k in list) if (typeof(list[k]) === "object")
		list[k].table.style.display = list[k].word.style.display = "none";

	list = scraper.data[b];

	if (list) for (let k in list) if (typeof(list[k]) === "object")
		list[k].word.style.display = "";
}

/**
 * Attempt to add the slot to the schedule. This will do nothing
 * if there's a conflict.
 * @param String name - the name of the course. Must be all caps.
 * @param Int id - the id of the slot.
 * @param Object slot - the slot's data.
 * the card if successfully added to schedule.
**/
function course_add(name, id, slot) {
	if (!hasConflict(name, slot)) {
		spook_set(1); // lolol

		/* Make an entry for the slot. Note that the slot is
		   duplicated, meaning it does not point to the actual
		   object. This is to prevent data tampering.
		*/
		schedule.list[name] = Object.assign({
			id: id
		}, slot);
		// Create the cards.
		schedule.list[name].cards = card_new(name, id, slot);
		// Create the summary sidebar entry.
		schedule.list[name].tr = summary_new(name, id, slot);

		// Scroll to the card's location.
		scroll_to(
			(slot.time[0] + slot.time[1]/2 + // Card size.
			35/2 + 5)/0.6 - // Header size (the weekday display).
			innerHeight/2 // Screen size.
		);

		// Save it.
		file_save_check();

		return true; // Sucessfully added to schedule.
	}
}

function course_rem(name) {
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
						scroll_max = Math.max(v.time[0], scroll_max);
					else
						scroll_max = slot.time[0];
			}

		// Remove entry from schedule.
		delete schedule.list[name];

		// See if there are no slots left in the schedule.
		if (!Object.keys(schedule.list).length) {
			// Hide the save button.
			img.save.style.opacity = "";
			img.save.style.pointerEvents = "";

			// Hide the summary since there's nothing to show.
			div.summary.style.transform = "";
			div.summary.style.boxShadow = "";

			spook_set(); // lolol
		}

		// Save it.
		file_save_check();

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
function info_show(name, id, slot) {
	enroll_target = [name, id, slot, !hasConflict(name, slot)];
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
		Time: time_parse(slot.time[0]) + " - " +
			time_parse(slot.time[0] + slot.time[1]),
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
		if (enroll_target[3])
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
	enroll_target = null;
	div.info.style.opacity = 0;
	div.info.style.pointerEvents = "";
}

// Close button.
div.info_img[0].addEventListener("click", info_close);
tooltip_new(div.info_img[0], "<label>Close</label>", null, 1);

// Clicking outside the info window.
info.getElementsByTagName("dim")[0]
	.addEventListener("mousedown", info_close);

// Enroll/Drop button.
div.info_img[1].addEventListener("click", () => {
	// Make sure there is an actual target.
	if (enroll_target)
		// See if the user is trying to enroll.
		if (enroll_target[3]) {
			// User is attempting to enroll.
			if (course_add(
				enroll_target[0],
				enroll_target[1],
				enroll_target[2]
			)) {
				div.info_img[1].setAttribute("src", "assets/img/drop.png");
				div.info_img[1].setAttribute("drop", 1);

				enroll_target[3] = !enroll_target[3]; // Flip.
			}
		} else if (schedule.list[enroll_target[0]] &&
				schedule.list[enroll_target[0]].id == enroll_target[1]) {
			// User wants to drop the target. Check if the same id.
			if (course_rem(enroll_target[0])) {
				div.info_img[1].setAttribute(
					"src",
					"assets/img/enroll.png"
				);
				div.info_img[1].removeAttribute("drop");

				enroll_target[3] = !enroll_target[3]; // Flip.
			}
		}
});

// Tooltip for enrolling.
tooltip_new(div.info_img[1],
	"<label>Add to schedule.</label>",
	() => {
		return !div.info_img[1].getAttribute("drop") &&
			div.info_img[1].getAttribute("enabled");
	},
	1
);

// Tooltip when there is a conflict.
tooltip_new(div.info_img[1],
	"<label>This has a conflict with another slot.</label>",
	() => {
		return !div.info_img[1].getAttribute("enabled");
	}
);

// Tooltip for dropping.
tooltip_new(div.info_img[1],
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
function summary_new(name, id, slot) {
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
			info_show(name, id, slot);
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
function card_new(name, id, slot) {
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
			body.innerHTML = id + "<br>" +
				slot.section + "<br>" +
				slot.room + "<br>" +
				t1 + " - " + t2;
			body.setAttribute("class", "body");

			cap.src = cap_src;
			cap.setAttribute("class", "cap");
			cap.setAttribute("draggable", false);

			card.style.left = x*100 + "%";
			card.style.top = y*100 + "%";
			card.style.height = "calc(" + h*100 + "% - 5px)";

			tooltip_new(cap, cap_tooltip);

			card.addEventListener(
				"click",
				event => info_show(name, id, slot)
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
function search_input() {
	let list = scraper.data[schedule.AYTerm];

	// It's completely empty. Nothing to filter. No need to continue.
	if (!list)
		return;

	// Separate the input from the spaces.
	let txt = div.search_input.value.toUpperCase().match(/\S+/g) || [""];

	// Check if the user is trying to check via slot ID.
	if (!isNaN(Number(txt[0]))) for (let name in list)
		if (typeof(list[name]) === "object" && list[name].slots[txt[0]]) {
			// Redirect to the course's name with the ID.
			txt = [name, txt[0]];

			// Hide any tables if the slot is from another course.
			if (course_scope && course_scope[0] != name)
				list[course_scope[0]].table.style.display = "none";

			break;
		}

	// See if there's a match on the user's input.
	if (list[txt[0]]) {
		// Found a match in the searched courses.
		let slots = list[txt[0]].slots;

		if (!course_scope || course_scope[0] != txt[0])
			// Make the table visible when the names match.
			list[txt[0]].table.style.display = "";

		/* See if the user is trying to filter out the slots. Also
		   only update if there is a difference from before.
		*/
		if (!course_scope ||
			course_scope.toString() != txt.toString()) {
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
		course_scope = txt;

		return;
	}
	/* No match found. Try to find a similar name in the
	  'recently-searched' view.
	*/

	if (course_scope) {
		// Hide the course view if visible.
		list[course_scope[0]].table.style.display = "none";

		course_scope = null;
	}

	// Make 'recently-searched' view visible.
	div.dump.style.display = "block";

	/* Find matches in the scraper's 'dumped' entry, which is just a long
	   string containing all the searched course names.
	*/
	let res = list.dump.match(
		new RegExp(course_dump_pre + txt[0] + course_dump_suf, "g")
	);

	for (let name in list) if (typeof(list[name]) === "object") {
		if (res !== null &&
			res.indexOf(course_dump_sep + name) > -1) {
			// Found a match. Make it visible.

			if (list[name].word.style.display)
				list[name].word.style.display = "";
		} else if (!list[name].word.style.display)
			// Text in the search input doesn't match. Hide it.
			list[name].word.style.display = "none";
	}
}


//-- Search clear button. --//

img.search.addEventListener("mousedown", event => {
	hit = img.search;

	if (event.button == 0) {
		div.search_input.value = "";

		search_input();
	}
});

tooltip_new(img.search, "<label>Clear</label>");


//-- Search button. --//

div.search_input.addEventListener("focus", event => {
	div.course.style.opacity = 1;
	div.course.style.pointerEvents = "auto";
	label.spooky.style.opacity = 0;
	img.search.style.pointerEvents = "auto";

	img.search.setAttribute("src", "assets/img/close.png");

	// Show the summary if there is at least 1 course enrolled.
	if (Object.keys(schedule.list).length) {
		div.summary.style.transform = "translateX(-100%)";
		div.summary.style.boxShadow = "0 0 5px #000";
	}

	help_rem(); // Remove the help screen overlay.
});

div.search_input.addEventListener("focusout", event => {
	if (hit) {
		/* This is to re-focus on the search textbox again.
		   Since the focus is lost when clicking outside the
		   textbox, we use this to persist the focus. The hit's
		   value doesn't matter, so long as it's a 'non-false'.
		*/
		hit = null;

		setTimeout(() => div.search_input.focus()); // Persist focus.
	} else {
		div.course.style.opacity = 0;
		div.course.style.pointerEvents = "";
		label.spooky.style.opacity = 0.3;

		if (!Object.keys(schedule.list).length)
			spook_set();

		img.search.setAttribute("src", "assets/img/search.png");
		img.search.style.pointerEvents = "";
	}
});

div.search_input.addEventListener("input", search_input);

div.search_input.addEventListener("keyup", event => {
	let name = div.search_input.value.toUpperCase();

	if (event.code === "Enter" &&
		name.length > 0 && // Must have an entry.
		name.search(/\s/) == -1) { // No spaces.

		if (!schedule.AYTerm)
			// Do not request if AYTerm isn't set.
			return message_new(
				"We can't search without the academic year and term...",
				null, 2, 1
			);

		let msg = message_new(
			"Requesting data for '" + name + "'...",
			() => {} // Disable 'click on close'.
		);

		scraper.request(name, schedule.AYTerm, slots => {
			msg[1]();

			if (typeof(slots) === "object")
				if (Object.keys(slots).length)
					message_new("'" + name + "' data received.", null, 2);
				else
					message_new(
						"No slots were being offered for '" + name + "' " +
						"in '" + schedule.AYTerm + "'.",
						null,
						2
					);
			else if (slots == -1)
				message_new(
					"Could not receive data for '" + name + "'.", null, 2
				);
		});
	}
});


//-- Configuration window. --//

/**
 * If 'txt' is provided, add it to the AYTerm dropdown options, otherwise
 * add all existing AYTerm in the cache.
 * @param String txt - the 'AYTerm' entry.
**/
function config_AYTerm(txt) {
	if (txt) {
		if (div.config_dropdown.innerHTML.search(txt) == -1)
			div.config_dropdown.innerHTML += "<label>" + txt + "</label>";
	} else {
		let v = fs && fs.existsSync("cache") &&
				fs.readdirSync("cache").filter(
			name => isdir("cache" + "\\" + name)
		);

		// Set the AYTerm with the offline cache's latest.
		if (v) for (let i in v)
			if (div.config_dropdown.innerHTML.search(v[i]) == -1)
				div.config_dropdown.innerHTML += "<label>" +
				v[i] + "</label>";
	}
}

function config_close() {
	div.config.style.opacity = "";
	div.config.style.pointerEvents = "";
}

/**
 * Sets the dropdown element's functions and behavior. Not providing an
 * element will create a new one instead.
 * @param Object v - the element, should be a 'dropdown' otherwise it
 * won't have the proper animations.
 * @param Array[String] options - the options the dropdown can choose
 * from.
 * @return Object - the 'dropdown' element.
**/
function dropdown_set(dropdown, options) {
	let dropdown_div; // Container for the options.
	let input; // The input.

	function all() {
		let labels = dropdown.getElementsByTagName("label");

		for (let i = 0; i < labels.length; i++)
			labels[i].style.display = "";
	}

	if (!dropdown) {
		input = elem("input");
		input.setAttribute("type", "text");

		dropdown = elem("dropdown");
		dropdown.appendChild(input);

		dropdown_div = elem("div");
		dropdown.appendChild(dropdown_div);
	} else
		input = dropdown.getElementsByTagName("input")[0];

	dropdown.addEventListener("mousedown", event => {
		// See if the target is a label (we use label tags as the options).
		if (event.target && event.target.tagName == "LABEL")
			input.value = event.target.innerHTML;
	});

	// Append the new options.
	if (options)
		for (let i in options) {
			let label = document.createElement("label");
			label.innerHTML = options[i];

			dropdown_div.appendChild(label);
		}

	// Setup filtering.
	input.addEventListener("input", event => {
		// New list of options since the user might've added new ones.
		let labels = dropdown.getElementsByTagName("label");


		for (let i = 0; i < labels.length; i++) {
			let v = labels[i];

			v.style.display = v.innerHTML.toUpperCase()
				.search(input.value.toUpperCase()) == -1 ? "none" : "";
		}
	});

	return dropdown;
}

{
	// Load all 'check' elements.
	let checks = getTag("check");

	for (let i = 0; i < checks.length; i++)
		checks[i].addEventListener("click", event => {
			if (checks[i].getAttribute("active") != null)
				checks[i].removeAttribute("active");
			else
				checks[i].setAttribute("active", 1);
		});

	// Load all 'warn' elements.
	let warns = getTag("warn");

	for (let i = 0; i < warns.length; i++)
		tooltip_new(
			warns[i],
			"<label>" + warns[i].getAttribute("value") + "</label>",
			v => {
				v.style.animation = "none"; // Stop the animation.

				return 1;
			}
		);

	// Load all 'dropdown' elements.
	let dropdowns = getTag("dropdown");

	for (let i = 0; i < dropdowns.length; i++)
		dropdown_set(dropdowns[i]);

	// Add all AYTerm from cache.
	config_AYTerm();
}

img.config.addEventListener("mousedown", event => {
	if (event.button == 0) {
		div.config.style.opacity = 1;
		div.config.style.pointerEvents = "auto";
	}
});

// Academic year and term.
{
	div.config_input[0].addEventListener("focusout", event => {
		let v = div.config_input[0].value;

		// Only do something if there's actually a difference.
		if (v && schedule.AYTerm !== v) {
			// Warn the user if they have courses added in the schedule.
			if (Object.keys(schedule.list).length) dialog_show(
				"Changing the academic year and term will remove all " +
				"the courses you've added to your schedule.<br>Do you " +
				"want to continue?",
				["Yes", "No"],
				(event, choice) => {
					if (!choice) {
						// Hide previous AYTerm courses.
						course_set(schedule.AYTerm, v);

						// Set new AYTerm.
						schedule.AYTerm = label.AYTerm.innerHTML = v;

						sched_clear();
						file_save_check();
					} else
						div.config_input[0].value = schedule.AYTerm;

					return 1;
				}
			); else {
				// Hide previous AYTerm courses.
				course_set(schedule.AYTerm, v);

				schedule.AYTerm = v;
				label.AYTerm.innerHTML = v; // Update the label.

				file_save_check();
			}
		} else
			// Set it back if something went wrong.
			div.config_input[0].value = schedule.AYTerm;

		// Reveal all the options again.
		let labels = div.config_dropdown.getElementsByTagName("label");

		for (let i = 0; i < labels.length; i++)
			labels[i].style.display = "";
	});
}

// Checkboxes.
{
	// Auto-search.
	div.config_check[0].addEventListener("click", event => {
		if (div.config_check[0].getAttribute("active"))
			schedule.autosearch = true;
		else
			delete schedule.autosearch;

		// Save it.
		file_save_check();
	});

	// Auto-save.
	div.config_check[1].addEventListener("click", event => {
		if (div.config_check[1].getAttribute("active")) {
			schedule.autosave = true;

			// Hide the button.
			img.save.style.opacity = "";
			img.save.style.pointerEvents = "";
		} else
			delete schedule.autosave;

		// Save it.
		file_save_check();
	});
}

div.config_img.addEventListener("click", config_close);
div.config_dim.addEventListener("mousedown", config_close);

tooltip_new(
	img.config,
	"<label>Configure Preference</label>",
	null,
	1
);


//-- Mouse/key events. --//

document.addEventListener("wheel", event => {
	if (event.target.tagName === "CARD" ||
		event.target.tagName === "BODY") {
		scroll_add(
			// Firefox.
			typeof InstallTrigger !== 'undefined' ?
			event.deltaY*20 : event.deltaY
		);
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
		scroll_add(-event.movementY);
	}
})


//-- File handling. --/

function file_save() {
	// Copy the schedule.
	let data = Object.assign({}, schedule);

	// Update internal record for modification date.
	data.modified = new Date();

	// Get rid of the list since its directly pointing to real data.
	data.list = {};

	// Get the list manually.
	for (let name in schedule.list) {
		data.list[name] = Object.assign({}, schedule.list[name]);

		// Delete unncessary data.
		delete data.list[name].cards;
		delete data.list[name].tr;
		delete data.list[name].literal;
	}

	data = JSON.stringify(data, null, "	");

	// See if it's a local application.
	if (require) {
		if (schedule_path) {
			// Save.
			img.save.style.opacity = "";
			img.save.style.pointerEvents = "";

			fs.writeFile(
				schedule_path,
				data,
				() => message_new(
					"File saved.<br>" +
					"Click to open folder.",
					() => {
						shell.openItem(__dirname + "\\save");

						return 1;
					},
					3
				)
			);
		} else
			// Not yet saved. Show the prompt window.
			prompt_show();
	} else {
		// Browser mode. Trigger a prompt.
		let file = new Blob([data], {type: "application/json"});
		let url = URL.createObjectURL(file);
		let dummy = elem("a");
		dummy.href = url;
		dummy.download = schedule.AYTerm + ".json";

		document.body.appendChild(dummy);
		dummy.click();
		document.body.removeChild(dummy);
		window.URL.revokeObjectURL(url);
	}
}

/**
 * Properly assess if the application should reveal the save button or
 * just auto-save it.
**/
function file_save_check() {
	if (!fs || !schedule_path || !schedule.autosave) {
		// Show the holy button of justice.
		img.save.style.opacity = 1;
		img.save.style.pointerEvents = "auto";
	} else
		// The user is no fun. Just auto-save it.
		file_save();
}

/**
 * Process the file. Must be a JSON, otherwise will do nothing. It will
 * return the schedule as an object and the file's path if it's being
 * run by Electron API.
**/
function file_load(file, callback) {
	if (!file) return; // No file found.

	let reader = new FileReader();

	reader.onload = event => callback(sched_parse(
		event.target.result
	), file.path);

	reader.readAsText(file);
}

document.addEventListener("drop", event => {
	event.stopPropagation();
	event.preventDefault();
	load_fn(event.dataTransfer.files[0]);
	help_rem();
});

// Explicitly change the file dragging behavior.
document.addEventListener("dragover", event => {
	event.stopPropagation();
	event.preventDefault();
	event.dataTransfer.dropEffect = "copy";
});


//-- Create tooltips. --//

// Search
{
	let elm = getId("search")
		.getElementsByTagName("input")[0];

	tooltip_new(
		elm,
		"<label>Search</label>",
		() => {
			return document.activeElement !== elm;
		},
		1
	);
}

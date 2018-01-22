const {app, BrowserWindow} = require("electron");

let win = {
	empty: [],
	list: []
}

/**
 * Add an existing window into the cache.
 * @param {BrowserWindow} v
 * @return {Number} the unique id of the window.
**/
this.push = (v) => {
	let n;

	if (win.empty.length > 0) {
		n = win.empty[win.empty.length-1];
		win.empty.length--;
	} else {
		n = win.list.length;
	}

	win.list[n] = v;

	return n;
}

/**
 * Removes the window designated by its given id.
 * @param {Number} n
**/
this.pop = (n) => {
	if (win.list.length === n+1) {
		win.list.length--;
	} else {
		win.empty[win.empty.length] = n;
		win.list[n] = null;
	}
}

/**
 * Create a window.
 * @param {Object} properties
 * @param {Function} hook
 * @return the window.
**/
this.init = (properties, hook) => {
	let v = new BrowserWindow(properties);
	let n = this.push(v);

	v.on("closed", () => {
		this.pop(n);
	})

	if (hook) {
		hook(v, n);
	}

	return v;
}
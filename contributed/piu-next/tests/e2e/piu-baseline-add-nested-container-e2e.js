/*---
description: baseline piu add nested container after app create.
flags: [async, module]
---*/

const inner = new Container(null, {
	left: 20, right: 20, top: 10, height: 40,
	contents: [
		new Label(null, { string: "Child" }),
	],
});

const outer = new Container(null, {
	left: 0, right: 0, top: 0, bottom: 0,
	contents: [inner],
});

const app = new Application(null, {});
app.add(outer);

globalThis.application = app;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(app.first, null, "outer exists");
	assert.notSameValue(app.first.first, null, "inner exists");
}).then($DONE, $DONE);

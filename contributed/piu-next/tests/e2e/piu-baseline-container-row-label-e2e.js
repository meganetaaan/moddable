/*---
description: baseline piu container->row->label.
flags: [async, module]
---*/

const row = new Row(null, {
	contents: [
		new Label(null, { string: "Tap" }),
	],
});

const container = new Container(null, {
	contents: [row],
});

const app = new Application(null, {});
app.add(container);

globalThis.application = app;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(app.first, null, "container exists");
	assert.notSameValue(app.first.first, null, "row exists");
}).then($DONE, $DONE);

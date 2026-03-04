/*---
description: baseline piu nested container construction.
flags: [async, module]
---*/

let app;

app = new Application(null, {
	contents: [
		new Container(null, {
			left: 0, right: 0, top: 0, bottom: 0,
			contents: [
				new Container(null, {
					left: 20, right: 20, top: 10, height: 40,
					contents: [
						new Label(null, { string: "Child" }),
					],
				}),
			],
		}),
	],
});

globalThis.application = app;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(app.first, null, "outer exists");
	assert.notSameValue(app.first.first, null, "inner exists");
}).then($DONE, $DONE);

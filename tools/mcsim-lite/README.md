# mcsim-lite

`mcsim-lite` is a compact, Linux-only Moddable simulator host. It displays the
application screen at 1:1 scale and the simulator's button rows. Device artwork,
LEDs, sliders, switches, status rows, and the standard mcsim toolbar are omitted.

Build the tool with:

```sh
export MODDABLE=/path/to/moddable
export PATH="$MODDABLE/build/bin/lin/release:$PATH"
mcconfig -d -m -p x-lin "$MODDABLE/tools/mcsim-lite/manifest.json"
```

Open a simulator application by passing its absolute path:

```sh
$MODDABLE/build/bin/lin/debug/mcsim-lite \
  $MODDABLE/build/bin/lin/m5stack/debug/app/mc.so
```

The path must match an `applicationName` in one of the installed simulator
definitions. The initial version accepts Linux `mc.so` applications only and
uses the device's 0-degree layout.

`mcsim-lite` is part of the Moddable SDK Tools and is licensed under GPLv3.

import { test, expect, run } from "./lib/harness.js";
import defineBasicTests from "./tests/basic.js";

defineBasicTests({ test, expect });
run({ name: "mctest/xst" });

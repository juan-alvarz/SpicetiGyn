// Bundle entry for nordlys-spaces.js. The core is bundled in, so this file works on its own.
import { start } from "@nordlys/core";
import spaces from "./plugin";

void start(spaces);

import { installPageAgent } from "../src/page";

// Injected into tabs by the page tools (scripting.executeScript files).
export default defineUnlistedScript(() => installPageAgent());

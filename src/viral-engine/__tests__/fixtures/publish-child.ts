// Processus enfant : publie le job demandé avec un faux Postiz lent, pour tester le verrou entre processus.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { publishWithLedger } from "../../daemon";
import { createStore } from "../../store";

const [home, id] = process.argv.slice(2);
const store = createStore(home);
const job = store.getJob(id)!;
void publishWithLedger(job, {
  store,
  notify: async () => undefined,
  publish: async () => {
    await new Promise((r) => setTimeout(r, 300));
    appendFileSync(join(home, "calls.log"), `${process.pid}\n`);
    return { posted: { tiktok: ["p1"] }, missing: [], failed: [] };
  },
});

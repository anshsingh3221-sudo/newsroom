import { discoverNews } from "../src/lib/ai/discover";
import { runJob } from "../src/lib/jobs";

runJob("ingest-feeds", discoverNews).then((r) => {
  console.log(r);
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });

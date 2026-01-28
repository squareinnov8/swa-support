import "dotenv/config";
import { reprocessThread } from "../src/lib/threads/reprocessThread";

const threadId = process.argv[2] || "e878f81f-0578-4034-b27d-a451c11b189e";

async function main() {
  console.log(`Reprocessing thread: ${threadId}`);

  const result = await reprocessThread(threadId, {
    trigger: "manual",
    force: true,
  });

  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);

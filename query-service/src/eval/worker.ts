import cron from "node-cron";
import { runEvaluation } from "./runner.js";

const DEFAULT_SCHEDULE = "0 3 * * 0"; // 매주 일요일 03:00 UTC

export function startEvalWorker(): void {
  const enabled = process.env.EVAL_CRON_ENABLED !== "false";
  const schedule = process.env.EVAL_CRON_SCHEDULE ?? DEFAULT_SCHEDULE;

  if (!enabled) {
    console.log("[eval-worker] disabled via EVAL_CRON_ENABLED=false");
    return;
  }

  if (!cron.validate(schedule)) {
    console.error(`[eval-worker] invalid schedule: ${schedule}. worker not started.`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log("[eval-worker] tick");
    try {
      const result = await runEvaluation();
      if (result.skipped) {
        console.log(`[eval-worker] skipped: ${result.reason}`);
      } else {
        console.log(`[eval-worker] done: ${result.run_id}`);
      }
    } catch (err) {
      console.error("[eval-worker] unexpected failure:", err);
    }
  });

  console.log(`[eval-worker] scheduled: ${schedule} (EVAL_SAMPLE_SIZE=${process.env.EVAL_SAMPLE_SIZE ?? 10})`);
}

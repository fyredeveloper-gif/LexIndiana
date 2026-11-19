import { rawPrisma } from "@/lib/prisma";
import { syncOnce } from "./engine";
import { syncConfigFromEnv } from "./transport";

/**
 * Background sync loop. Started once per Node server process from
 * src/instrumentation.ts. It is inert unless LEX_SYNC_ENABLED is set and an
 * endpoint is configured, so the hosted web app and CI are unaffected.
 *
 * Failures back off exponentially up to five minutes; a success resets it.
 */
const globalForSync = globalThis as unknown as { lexSyncWorkerStarted?: boolean };

export function startSyncWorker(): void {
  if (globalForSync.lexSyncWorkerStarted) return;
  globalForSync.lexSyncWorkerStarted = true;

  const config = syncConfigFromEnv();
  if (!config.enabled) {
    console.log("[sync] background sync disabled (no endpoint configured)");
    return;
  }

  console.log(
    `[sync] background sync every ${Math.round(config.intervalMs / 1000)}s as device ${config.deviceId}`,
  );

  let backoffMs = 0;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    let delay = config.intervalMs;

    try {
      // A sync target is scoped to one firm. The desktop demo has exactly one;
      // a hosted target can be pinned explicitly.
      const firmId = process.env.LEX_SYNC_FIRM_ID?.trim();
      const firm = firmId
        ? { id: firmId }
        : await rawPrisma.firm.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });

      if (firm) {
        const result = await syncOnce(rawPrisma, { firmId: firm.id, config });
        if (result.error) {
          backoffMs = backoffMs === 0 ? 15_000 : Math.min(backoffMs * 2, 300_000);
          delay = backoffMs;
          console.warn(`[sync] pass failed: ${result.error} (retrying in ${Math.round(delay / 1000)}s)`);
        } else {
          backoffMs = 0;
          if (result.pushed > 0 || result.pulled > 0 || result.conflicts > 0) {
            console.log(
              `[sync] pushed ${result.pushed}, pulled ${result.pulled}, conflicts ${result.conflicts}`,
            );
          }
        }
      }
    } catch (error) {
      backoffMs = backoffMs === 0 ? 15_000 : Math.min(backoffMs * 2, 300_000);
      delay = backoffMs;
      console.error("[sync] unexpected failure", error);
    }

    timer = setTimeout(tick, delay);
    // Never keep the process alive just for the sync timer.
    timer.unref?.();
  };

  timer = setTimeout(tick, 5_000);
  timer.unref?.();
}

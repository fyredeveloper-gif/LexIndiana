import { PrismaClient } from "@prisma/client";
import { captureMutation, type SyncCaptureClient } from "@/lib/sync/capture";

/**
 * `rawPrisma` is the unextended client. Sync internals (applying remote
 * payloads, writing cursors, conflicts and the operation feed) must use it so
 * they never re-enter change capture.
 */
function buildBase(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function buildExtended(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return captureMutation({
            base: base as unknown as SyncCaptureClient,
            model,
            operation,
            args: args as Record<string, unknown>,
            run: query as (value: unknown) => Promise<unknown>,
          });
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildExtended>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedClient;
  prismaBase?: PrismaClient;
};

const base = globalForPrisma.prismaBase ?? buildBase();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

export const rawPrisma = base;

export const prisma = globalForPrisma.prisma ?? buildExtended(base);
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

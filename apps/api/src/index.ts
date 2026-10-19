import { buildApp } from "./app.js";
const positive = (value: string | undefined, fallback: number, max: number) => {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > max)
    throw new Error("Configurație concurență/coadă invalidă.");
  return n;
};
const app = await buildApp({
  directory: process.env.STOREGUARD_DATA_DIR,
  concurrency: positive(process.env.STOREGUARD_CONCURRENCY, 2, 4),
  capacity: positive(process.env.STOREGUARD_QUEUE_SIZE, 20, 100),
});
await app.listen({ host: "127.0.0.1", port: 4310 });
console.log("StoreGuard API: http://127.0.0.1:4310");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });

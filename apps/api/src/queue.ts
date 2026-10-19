/** Bounded queue; domain keys include subdomain normalization via registrable-domain parser. */
export class ScanQueue {
  private pending: { domain: string; run: () => Promise<void> }[] = [];
  private active = new Set<string>();
  private tasks = new Set<Promise<void>>();
  private stopping = false;
  constructor(
    private concurrency = 2,
    private capacity = 20,
  ) {}
  get size() {
    return this.pending.length;
  }
  enqueue(domain: string, run: () => Promise<void>) {
    if (this.stopping || this.pending.length >= this.capacity)
      throw new Error(
        "Coada de scanare este plină. Încearcă din nou după finalizarea scanărilor active.",
      );
    this.pending.push({ domain, run });
    this.drain();
  }
  private drain() {
    if (this.stopping) return;
    while (this.tasks.size < this.concurrency) {
      const index = this.pending.findIndex(
        (item) => !this.active.has(item.domain),
      );
      if (index < 0) return;
      const item = this.pending.splice(index, 1)[0];
      this.active.add(item.domain);
      const task = Promise.resolve()
        .then(item.run)
        .catch(() => {})
        .finally(() => {
          this.tasks.delete(task);
          this.active.delete(item.domain);
          this.drain();
        });
      this.tasks.add(task);
    }
  }
  async close() {
    this.stopping = true;
    await Promise.allSettled([...this.tasks]);
  }
}

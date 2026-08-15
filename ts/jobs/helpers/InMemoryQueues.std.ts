// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import PQueue from 'p-queue';

export class InMemoryQueues {
  readonly #queues = new Map<string, PQueue>();

  #concurrency = 1;

  get(key: string): PQueue {
    const existingQueue = this.#queues.get(key);
    if (existingQueue) {
      return existingQueue;
    }

    const newQueue = new PQueue({ concurrency: this.#concurrency });
    newQueue.once('idle', () => {
      this.#queues.delete(key);
    });

    this.#queues.set(key, newQueue);
    return newQueue;
  }

  get allQueues(): ReadonlySet<PQueue> {
    return new Set(this.#queues.values());
  }

  get entries(): ReadonlyMap<string, PQueue> {
    return new Map(this.#queues);
  }

  get concurrency(): number {
    return this.#concurrency;
  }

  set concurrency(value: number) {
    this.#concurrency = value;
    for (const queue of this.#queues.values()) {
      queue.concurrency = value;
    }
  }
}

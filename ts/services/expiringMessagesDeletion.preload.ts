// Copyright 2016 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import lodash from 'lodash';

import * as Errors from '../types/errors.std.ts';
import { createLogger } from '../logging/log.std.ts';
import { DataReader } from '../sql/Client.preload.ts';
import { clearTimeoutIfNecessary } from '../util/clearTimeoutIfNecessary.std.ts';
import { sleep } from '../util/sleep.std.ts';
import { SECOND } from '../util/durations/index.std.ts';
import { MessageModel } from '../models/messages.preload.ts';
import { drop } from '../util/drop.std.ts';

const { debounce } = lodash;

const log = createLogger('expiringMessagesDeletion');

class ExpiringMessagesDeletionService {
  #timeout?: ReturnType<typeof setTimeout>;
  readonly #debouncedCheckExpiringMessages = debounce(
    this.#checkExpiringMessages,
    1000
  );

  update() {
    drop(this.#debouncedCheckExpiringMessages());
  }

  async #destroyExpiredMessages() {
    try {
      log.info('destroyExpiredMessages: Loading messages...');
      const messages = await DataReader.getExpiredMessages();
      log.info(
        `destroyExpiredMessages: found ${messages.length} messages to expire`
      );

      // Custom: instead of deleting disappearing messages when their timer
      // expires, keep them. We clear the expiration fields (so the GENERATED
      // `expiresAt` column becomes NULL and they're no longer picked up by
      // getExpiredMessages) and mark them so the UI shows a "(deprecated)"
      // suffix.
      for (const dbMessage of messages) {
        const message = window.MessageCache.register(
          new MessageModel(dbMessage)
        );
        message.set({
          expirationDeprecated: true,
          expireTimer: undefined,
          expirationStartTimestamp: undefined,
        });
        // eslint-disable-next-line no-await-in-loop
        await window.MessageCache.saveMessage(message.attributes);
        log.info('Message kept past expiry', {
          sentAt: message.get('sent_at'),
        });
      }
    } catch (error) {
      log.error(
        'destroyExpiredMessages: Error deleting expired messages',
        Errors.toLogFormat(error)
      );
      log.info(
        'destroyExpiredMessages: Waiting 30 seconds before trying again'
      );
      await sleep(30 * SECOND);
    }

    log.info('destroyExpiredMessages: done, scheduling another check');
    this.update();
  }

  async #checkExpiringMessages() {
    log.info('checkExpiringMessages: checking for expiring messages');

    const soonestExpiry = await DataReader.getSoonestMessageExpiry();
    if (!soonestExpiry) {
      log.info('checkExpiringMessages: found no messages to expire');
      return;
    }

    let wait = soonestExpiry - Date.now();

    // In the past
    if (wait < 0) {
      wait = 0;
    }

    // Too far in the future, since it's limited to a 32-bit value
    if (wait > 2147483647) {
      wait = 2147483647;
    }

    log.info(
      `checkExpiringMessages: next message expires ${new Date(
        soonestExpiry
      ).toISOString()}; waiting ${wait} ms before clearing`
    );

    clearTimeoutIfNecessary(this.#timeout);
    this.#timeout = setTimeout(this.#destroyExpiredMessages.bind(this), wait);
  }
}

export function initialize(): void {
  if (instance) {
    log.warn('Expiring Messages Deletion service is already initialized!');
    return;
  }
  instance = new ExpiringMessagesDeletionService();
}

export function update(): void {
  if (!instance) {
    throw new Error('Expiring Messages Deletion service not yet initialized!');
  }
  instance.update();
}

let instance: ExpiringMessagesDeletionService;

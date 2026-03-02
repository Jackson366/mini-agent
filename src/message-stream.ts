import type { SDKUserMessage } from './types.js';

export class MessageStream {
  private queue: SDKUserMessage[] = [];
  private history: SDKUserMessage[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void {
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    };
    this.queue.push(msg);
    this.history.push(msg);
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  reset(): void {
    this.done = false;
    this.queue = [...this.history];
    const wake = this.waiting;
    this.waiting = null;
    wake?.();
  }

  isDone(): boolean {
    return this.done;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.done) return;
      await new Promise<void>(r => { this.waiting = r; });
      this.waiting = null;
    }
  }
}

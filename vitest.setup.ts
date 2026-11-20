/**
 * Many sim tests play whole bot rounds synchronously. Between two tests, give the event loop one macrotask turn so the worker
 * can answer the runner's messages; without it a long file starved them ("[vitest-worker]: Timeout calling onTaskUpdate").
 */
import { afterEach } from 'vitest';

afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

import { describe, it, expect, vi } from 'vitest';
import { routeUpdate } from '../../src/telegram/bot.js';

describe('routeUpdate', () => {
  it('sends the analyzer button on /start', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const deps = { sendMessage, isAdmin: () => false, appUrl: 'https://example.com' };
    const update = { update_id: 1, message: { chat: { id: 10 }, from: { id: 10 }, text: '/start' } };

    await routeUpdate(update, deps);

    expect(sendMessage).toHaveBeenCalledWith(10, expect.any(String), {
      inline_keyboard: [[{ text: 'Открыть анализатор', web_app: { url: 'https://example.com' } }]],
    });
  });

  it('does nothing on /admin for a non-admin', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const deps = { sendMessage, isAdmin: (id: number) => id === 99, appUrl: 'https://example.com' };
    const update = { update_id: 2, message: { chat: { id: 5 }, from: { id: 5 }, text: '/admin' } };

    await routeUpdate(update, deps);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends the admin panel button on /admin for an admin', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const deps = { sendMessage, isAdmin: (id: number) => id === 5, appUrl: 'https://example.com' };
    const update = { update_id: 3, message: { chat: { id: 5 }, from: { id: 5 }, text: '/admin' } };

    await routeUpdate(update, deps);

    expect(sendMessage).toHaveBeenCalledWith(5, expect.any(String), {
      inline_keyboard: [[{ text: 'Открыть админку', web_app: { url: 'https://example.com/admin.html' } }]],
    });
  });

  it('ignores updates without a text message', async () => {
    const sendMessage = vi.fn();
    const deps = { sendMessage, isAdmin: () => true, appUrl: 'https://example.com' };
    await routeUpdate({ update_id: 4 }, deps);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

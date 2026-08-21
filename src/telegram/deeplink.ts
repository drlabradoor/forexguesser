export const ACCESS_REQUEST_TEXT = 'Хочу доступ к боту';

/**
 * `?text=` prefills the message box in the target's chat, so the user only
 * has to hit send. Telegram applies it to public usernames, not to bots.
 */
export function buildTargetUrl(username: string): string {
  return `https://t.me/${username}?text=${encodeURIComponent(ACCESS_REQUEST_TEXT)}`;
}

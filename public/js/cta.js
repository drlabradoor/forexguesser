/**
 * Inside a mini app a plain link opens Telegram's in-app browser instead of
 * the chat; openTelegramLink collapses the app and lands in the dialog.
 */
export function openAccessChat(targetUrl) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(targetUrl);
  } else {
    window.open(targetUrl, '_blank', 'noopener');
  }
}

import { describe, it, expect } from 'vitest';
import { buildTargetUrl, ACCESS_REQUEST_TEXT } from '../../src/telegram/deeplink.js';

describe('buildTargetUrl', () => {
  it('points at the username and prefills the access request', () => {
    const url = new URL(buildTargetUrl('targetuser'));

    expect(url.origin + url.pathname).toBe('https://t.me/targetuser');
    expect(url.searchParams.get('text')).toBe(ACCESS_REQUEST_TEXT);
  });

  it('percent-encodes the Cyrillic message', () => {
    expect(buildTargetUrl('targetuser')).not.toContain(' ');
    expect(buildTargetUrl('targetuser')).toContain('%');
  });

  it('asks for access in Russian', () => {
    expect(ACCESS_REQUEST_TEXT).toBe('Хочу доступ к боту');
  });
});

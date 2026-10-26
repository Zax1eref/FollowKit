// Validate before opening any socket; never include connection credentials in errors.
export function localAdminUrl(raw) {
  if (!raw) throw new Error('Native test connection is missing');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid native test connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/postgres' || url.search || url.hash) {
    throw new Error('Only loopback postgres database URLs without query options are accepted');
  }
  return url.href;
}

// Use simpler compositing on Safari and iOS WebKit, including in-app web views.
// Chromium also advertises AppleWebKit, so exclude its desktop/Android tokens.
export const usesStableRendering =
  /AppleWebKit/i.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg\/|OPR\/|Android/i.test(navigator.userAgent);

import { archiveRecaptchaAction, archiveRecaptchaSiteKey } from "../../supabase/functions/_shared/recaptchaConfig";

type Recaptcha = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

declare global {
  interface Window { grecaptcha?: { enterprise?: Recaptcha } }
}

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() || archiveRecaptchaSiteKey;
let loadingScript: Promise<Recaptcha> | undefined;

export function loadRecaptcha(): Promise<Recaptcha> {
  if (!siteKey) return Promise.reject(new Error("Owner sign-in is not configured yet. Please contact the archive owner."));
  if (loadingScript) return loadingScript;
  loadingScript = new Promise<Recaptcha>((resolve, reject) => {
    const scriptId = "archive-recaptcha";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const fail = () => {
      clearTimeout(timeout);
      script?.remove();
      loadingScript = undefined;
      reject(new Error("The security check could not load. Check your connection and try again."));
    };
    const ready = () => {
      const captcha = window.grecaptcha?.enterprise;
      if (!captcha) { fail(); return; }
      captcha.ready(() => { clearTimeout(timeout); resolve(captcha); });
    };
    const timeout = window.setTimeout(fail, 15_000);
    if (window.grecaptcha?.enterprise) { ready(); return; }
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", ready, { once: true });
      script.addEventListener("error", fail, { once: true });
      document.head.append(script);
    } else {
      script.addEventListener("load", ready, { once: true });
      script.addEventListener("error", fail, { once: true });
    }
  });
  return loadingScript;
}

export async function executeLoginCaptcha(): Promise<string> {
  const captcha = await loadRecaptcha();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("The security check timed out. Please try again.")), 15_000);
    Promise.resolve().then(() => captcha.execute(siteKey, { action: archiveRecaptchaAction })).then(token => {
      clearTimeout(timeout);
      if (token) resolve(token);
      else reject(new Error("The security check could not be completed. Please try again."));
    }).catch(() => {
      clearTimeout(timeout);
      reject(new Error("The security check could not be completed. Please try again."));
    });
  });
}

export type DeletedSuccessEnvironment = {
  href: string;
  replaceUrl: (url: string) => void;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (timer: number) => void;
  prefersReducedMotion: () => boolean;
  listenPageHide: (callback: () => void) => () => void;
};

function browserEnvironment(): DeletedSuccessEnvironment {
  return {
    href: window.location.href,
    replaceUrl: (url) => window.history.replaceState(null, '', url),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (timer) => window.clearTimeout(timer),
    prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    listenPageHide: (callback) => {
      window.addEventListener('pagehide', callback, { once: true });
      return () => window.removeEventListener('pagehide', callback);
    },
  };
}

export function initializeDeletedSuccessNotice(
  root: ParentNode,
  environment: DeletedSuccessEnvironment = browserEnvironment(),
) {
  const url = new URL(environment.href);
  if (url.searchParams.get('deleted') !== '1') return () => {};

  url.searchParams.delete('deleted');
  environment.replaceUrl(`${url.pathname}${url.search}${url.hash}`);
  const notice = root.querySelector<HTMLElement>('[data-deleted-success]');
  if (!notice) return () => {};

  let exitTimer: number | null = null;
  let removeTimer: number | null = null;
  let releasePageHide = () => {};
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    notice.remove();
    releasePageHide();
  };
  const cancel = () => {
    if (exitTimer !== null) environment.clearTimer(exitTimer);
    if (removeTimer !== null) environment.clearTimer(removeTimer);
    exitTimer = null;
    removeTimer = null;
    releasePageHide();
  };

  releasePageHide = environment.listenPageHide(cancel);
  exitTimer = environment.setTimer(() => {
    exitTimer = null;
    if (environment.prefersReducedMotion()) {
      finish();
      return;
    }
    notice.classList.add('is-leaving');
    removeTimer = environment.setTimer(() => {
      removeTimer = null;
      finish();
    }, 300);
  }, 4000);

  return cancel;
}

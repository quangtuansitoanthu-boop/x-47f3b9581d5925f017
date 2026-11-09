import { dev, version } from "$app/environment";
import { isNativeApp } from "./native-platform";
import { OFFLINE_ILLUSTRATION_CACHE } from '$lib/contracts/book-illustrations';
import { CONTENT_IMAGE_CACHE, CONTENT_PACKAGE_CACHE } from '$lib/contracts/content-updates';
const durableContentCaches = new Set([OFFLINE_ILLUSTRATION_CACHE, CONTENT_PACKAGE_CACHE, CONTENT_IMAGE_CACHE]);

const DEV_CLEANUP_KEY = "quangtu_dev_sw_cleanup";
const UPDATE_INTERVAL_MS = 30 * 60 * 1_000;

export interface PwaRegistrationOptions {
  onUpdateReady?: (registration: ServiceWorkerRegistration) => void;
  onReloadAttempt?: () => void;
  updateIntervalMs?: number;
}

export interface PwaRegistrationHandle {
  registration: ServiceWorkerRegistration;
  applyUpdate(): boolean;
  dispose(): void;
}

async function clearDevelopmentWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => registration.unregister()),
  );

  if ("caches" in globalThis) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => !durableContentCaches.has(name)).map((cacheName) => caches.delete(cacheName)));
  }

  if (
    navigator.serviceWorker.controller &&
    sessionStorage.getItem(DEV_CLEANUP_KEY) !== "1"
  ) {
    sessionStorage.setItem(DEV_CLEANUP_KEY, "1");
    location.reload();
    return;
  }

  if (!navigator.serviceWorker.controller)
    sessionStorage.removeItem(DEV_CLEANUP_KEY);
}

async function purgeServiceWorkers(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in globalThis) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => !durableContentCaches.has(name)).map((cacheName) => caches.delete(cacheName)));
  }
}

export async function registerPwa(
  options: PwaRegistrationOptions = {},
): Promise<PwaRegistrationHandle | null> {
  if (dev) {
    await clearDevelopmentWorker();
    return null;
  }

  if (isNativeApp()) {
    await purgeServiceWorkers();
    return null;
  }

  if (
    !("serviceWorker" in navigator) ||
    (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1")
  ) {
    return null;
  }

  const workerUrl = `/service-worker.js?v=${encodeURIComponent(version)}`;
  const registration = await navigator.serviceWorker.register(workerUrl, {
    scope: "/",
    type: "module",
    updateViaCache: "none",
  });
  const announcedWorkers = new WeakSet<ServiceWorker>();
  let reloadAfterActivation = false;
  let updateActivated = false;
  let disposed = false;
  let observedInstalling: ServiceWorker | null = null;

  const announceWaitingWorker = (): void => {
    if (disposed) return;
    const waiting = registration.waiting;
    if (!waiting || announcedWorkers.has(waiting)) return;
    announcedWorkers.add(waiting);
    // Documents are network-first, so the latest client bundle can already be
    // running while its matching service worker is still in `waiting`. In that
    // case there is no user-visible update left to announce; promote the worker
    // silently so the banner does not reappear for the version already in use.
    let waitingVersion: string | null = null;
    try {
      waitingVersion = new URL(waiting.scriptURL).searchParams.get("v");
    } catch {
      // An unversioned/invalid URL falls back to the explicit update prompt.
    }
    if (waitingVersion === version) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    options.onUpdateReady?.(registration);
  };

  const onInstallingStateChange = (): void => {
    if (
      observedInstalling?.state !== "installed" ||
      !navigator.serviceWorker.controller
    )
      return;
    announceWaitingWorker();
    if (!registration.waiting) queueMicrotask(announceWaitingWorker);
  };
  const onUpdateFound = (): void => {
    observedInstalling?.removeEventListener(
      "statechange",
      onInstallingStateChange,
    );
    observedInstalling = registration.installing;
    observedInstalling?.addEventListener(
      "statechange",
      onInstallingStateChange,
    );
  };
  const onControllerChange = (): void => {
    if (!reloadAfterActivation || disposed) return;
    reloadAfterActivation = false;
    updateActivated = true;
    options.onReloadAttempt?.();
    location.reload();
  };

  registration.addEventListener("updatefound", onUpdateFound);
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    onControllerChange,
  );
  announceWaitingWorker();

  void registration.update().catch(() => undefined);
  const pollingInterval = window.setInterval(
    () => {
      void registration.update().catch(() => undefined);
    },
    Math.max(1_000, options.updateIntervalMs ?? UPDATE_INTERVAL_MS),
  );

  return {
    registration,
    applyUpdate(): boolean {
      if (disposed) return false;
      // A beforeunload prompt may have kept the document alive after activation.
      // Retry only after another explicit click; never force a second reload.
      if (updateActivated) {
        options.onReloadAttempt?.();
        location.reload();
        return true;
      }
      const waiting = registration.waiting;
      if (!waiting) return false;
      reloadAfterActivation = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
      return true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.clearInterval(pollingInterval);
      registration.removeEventListener("updatefound", onUpdateFound);
      observedInstalling?.removeEventListener(
        "statechange",
        onInstallingStateChange,
      );
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    },
  };
}

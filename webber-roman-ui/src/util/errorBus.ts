const listeners = new Set<(message: string) => void>();
let installed = false;

export function reportError(error: unknown, skipLog?: boolean): void {
    if (!skipLog)
        console.error(error);
    for (const fn of listeners)
        fn(error instanceof Error ? error.message : String(error));
}

export function subscribeErrors(fn: (message: string) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function installGlobalErrorHandlers(): void {
    if (installed) return;
    installed = true;
    window.addEventListener("error", e => {
        reportError(e.error instanceof Error ? e.error : e.message, true);
    });
    window.addEventListener("unhandledrejection", e => {
        reportError(e.reason, true);
    });
}

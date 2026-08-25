export interface TimerHandle {
  start(seconds: number): void;
  stop(): void;
}

export function createTimer(options: {
  onTick: (remainingMs: number) => void;
  onExpire: () => void;
}): TimerHandle {
  let raf = 0;
  let deadline = 0;
  let expired = false;

  function loop(): void {
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      if (!expired) {
        expired = true;
        options.onExpire();
      }
      return;
    }
    options.onTick(remaining);
    raf = requestAnimationFrame(loop);
  }

  return {
    start(seconds: number): void {
      this.stop();
      expired = false;
      deadline = performance.now() + seconds * 1000;
      options.onTick(seconds * 1000);
      raf = requestAnimationFrame(loop);
    },
    stop(): void {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

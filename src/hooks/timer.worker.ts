// timer.worker.ts
let timerId: any = null;

self.onmessage = (e) => {
  if (e.data === 'start') {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      self.postMessage('tick');
    }, 16); // ~60fps
  } else if (e.data === 'stop') {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }
};

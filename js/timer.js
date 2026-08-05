// Chronomètre d'aération : suit le temps écoulé depuis l'ouverture des
// fenêtres et signale quand la durée idéale est atteinte.
(function (global) {
  'use strict';

  function createAerationTimer() {
    let intervalId = null;
    let startTime = null;
    let idealDurationSeconds = 0;
    let completedFired = false;

    function tick(onTick, onComplete) {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const remainingSeconds = idealDurationSeconds - elapsedSeconds;
      onTick({ elapsedSeconds, remainingSeconds });
      if (remainingSeconds <= 0 && !completedFired) {
        completedFired = true;
        onComplete();
      }
    }

    function start(idealDurationMinutes, { onTick: onTickCb, onComplete: onCompleteCb }) {
      stop();
      startTime = Date.now();
      idealDurationSeconds = Math.round(idealDurationMinutes * 60);
      completedFired = false;
      tick(onTickCb, onCompleteCb);
      intervalId = setInterval(() => tick(onTickCb, onCompleteCb), 1000);
    }

    function stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function isRunning() {
      return intervalId !== null;
    }

    return { start, stop, isRunning };
  }

  function formatMMSS(totalSeconds) {
    const sign = totalSeconds < 0 ? '-' : '';
    const abs = Math.abs(totalSeconds);
    const minutes = Math.floor(abs / 60);
    const seconds = abs % 60;
    return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  global.AerationTimer = createAerationTimer;
  global.formatMMSS = formatMMSS;
})(window);

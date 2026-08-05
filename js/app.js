// Orchestration : câble le DOM aux modules Weather / Decision / Storage / Timer.
(function () {
  'use strict';

  const els = {
    locationLabel: document.getElementById('location-label'),
    locationPicker: document.getElementById('location-picker'),
    citySearch: document.getElementById('city-search'),
    cityResults: document.getElementById('city-results'),
    indoorTemp: document.getElementById('indoor-temp'),
    indoorHumidity: document.getElementById('indoor-humidity'),
    outdoorWeather: document.getElementById('outdoor-weather'),
    refreshWeatherBtn: document.getElementById('refresh-weather'),
    analyzeBtn: document.getElementById('analyze-btn'),
    inputError: document.getElementById('input-error'),

    screenInput: document.getElementById('screen-input'),
    screenResult: document.getElementById('screen-result'),
    screenTimer: document.getElementById('screen-timer'),

    decisionStatus: document.getElementById('decision-status'),
    decisionScore: document.getElementById('decision-score'),
    durationBlock: document.getElementById('duration-block'),
    decisionDuration: document.getElementById('decision-duration'),
    decisionConfidence: document.getElementById('decision-confidence'),
    decisionReasons: document.getElementById('decision-reasons'),
    forecastAdvice: document.getElementById('forecast-advice'),
    expertToggle: document.getElementById('expert-toggle'),
    expertPanel: document.getElementById('expert-panel'),
    backToInputBtn: document.getElementById('back-to-input-btn'),
    openedBtn: document.getElementById('opened-btn'),

    timerElapsed: document.getElementById('timer-elapsed'),
    timerStatus: document.getElementById('timer-status'),
    timerRemaining: document.getElementById('timer-remaining'),
    closedBtn: document.getElementById('closed-btn'),
  };

  const STATUS_LABELS = {
    OUVRIR: '🟢 OUVRIR',
    ATTENDRE: '🟡 ATTENDRE',
    FERMER: '🔴 FERMER',
  };
  const DEFAULT_TIMER_MINUTES = 15;
  const CITY_SEARCH_DEBOUNCE_MS = 350;

  let currentLocation = null;
  let currentOutdoor = null;
  let currentForecast = [];
  let currentDecision = null;
  let weatherLoadAttempted = false;
  const timer = window.AerationTimer();

  function showScreen(id) {
    [els.screenInput, els.screenResult, els.screenTimer].forEach((s) => {
      s.hidden = s.id !== id;
    });
  }

  function round(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  function formatHHMM(isoString) {
    return isoString.slice(11, 16);
  }

  function formatRelativeMinutes(minutes) {
    if (minutes < 60) return `dans ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `dans ${hours} h` : `dans ${hours} h ${rest} min`;
  }

  // --- Localisation & météo ---------------------------------------------

  function renderOutdoorWeather(weather) {
    els.outdoorWeather.innerHTML = `
      <div class="stat"><span class="value">${round(weather.temp, 1)}°C</span><span class="label">Température</span></div>
      <div class="stat"><span class="value">${round(weather.humidity, 0)}%</span><span class="label">Humidité</span></div>
      <div class="stat"><span class="value">${round(weather.windSpeed, 0)} km/h</span><span class="label">Vent</span></div>
      <div class="stat"><span class="value">${weather.windDirectionLabel}</span><span class="label">Direction</span></div>
    `;
  }

  async function loadWeather(location) {
    els.outdoorWeather.innerHTML = '<p class="muted">Récupération de la météo…</p>';
    try {
      const weather = await window.Weather.fetchWeather(location.latitude, location.longitude);
      currentOutdoor = weather.current;
      currentForecast = weather.hourly;
      renderOutdoorWeather(weather.current);
    } catch (err) {
      currentOutdoor = null;
      currentForecast = [];
      els.outdoorWeather.innerHTML = `<p class="error-message">${err.message || 'Météo indisponible.'}</p>`;
    }
    weatherLoadAttempted = true;
    validateAndToggleAnalyze();
  }

  function setLocation(location) {
    currentLocation = location;
    window.Storage.saveLocation(location);
    els.locationLabel.textContent = location.label;
    els.locationPicker.hidden = true;
  }

  function showLocationPicker() {
    els.locationLabel.textContent = 'Position inconnue';
    els.outdoorWeather.innerHTML = '<p class="muted">Recherchez votre ville pour obtenir la météo.</p>';
    els.locationPicker.hidden = false;
  }

  let citySearchTimeout = null;
  els.citySearch.addEventListener('input', () => {
    clearTimeout(citySearchTimeout);
    const query = els.citySearch.value.trim();
    if (query.length < 2) {
      els.cityResults.innerHTML = '';
      return;
    }
    citySearchTimeout = setTimeout(async () => {
      try {
        const results = await window.Weather.searchCity(query);
        els.cityResults.innerHTML = results.map((r, i) =>
          `<li tabindex="0" data-index="${i}">${r.name}${r.admin1 ? ', ' + r.admin1 : ''} (${r.country})</li>`
        ).join('');
        els.cityResults.dataset.results = JSON.stringify(results);
      } catch (err) {
        els.cityResults.innerHTML = `<li class="error-message">${err.message}</li>`;
      }
    }, CITY_SEARCH_DEBOUNCE_MS);
  });

  els.cityResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-index]');
    if (!li) return;
    const results = JSON.parse(els.cityResults.dataset.results || '[]');
    const picked = results[Number(li.dataset.index)];
    if (!picked) return;
    const label = `${picked.name}${picked.admin1 ? ', ' + picked.admin1 : ''}`;
    setLocation({ latitude: picked.latitude, longitude: picked.longitude, label });
    els.cityResults.innerHTML = '';
    els.citySearch.value = '';
    loadWeather({ latitude: picked.latitude, longitude: picked.longitude });
  });

  els.refreshWeatherBtn.addEventListener('click', () => {
    if (currentLocation) loadWeather(currentLocation);
  });

  async function initLocation() {
    try {
      const pos = await window.Weather.getCurrentPosition();
      setLocation({ latitude: pos.latitude, longitude: pos.longitude, label: 'Position actuelle' });
      await loadWeather(currentLocation);
      return;
    } catch (err) {
      // Géolocalisation refusée/indisponible : on retombe sur une position sauvegardée, sinon la recherche manuelle.
    }
    const saved = window.Storage.loadLocation();
    if (saved) {
      setLocation(saved);
      await loadWeather(saved);
    } else {
      showLocationPicker();
    }
  }

  // --- Saisie intérieure ---------------------------------------------------

  function parseDecimal(value) {
    return parseFloat(String(value).trim().replace(',', '.'));
  }

  function getIndoorValues() {
    const temp = parseDecimal(els.indoorTemp.value);
    const humidity = parseDecimal(els.indoorHumidity.value);
    return { temp, humidity };
  }

  function indoorValuesValid() {
    const { temp, humidity } = getIndoorValues();
    return Number.isFinite(temp) && Number.isFinite(humidity) && humidity >= 0 && humidity <= 100;
  }

  function validateAndToggleAnalyze() {
    const hasInput = els.indoorTemp.value.trim() !== '' || els.indoorHumidity.value.trim() !== '';
    const valid = indoorValuesValid();
    const ready = valid && currentOutdoor !== null;
    els.analyzeBtn.disabled = !ready;

    if (ready) {
      els.inputError.hidden = true;
    } else if (hasInput && !valid) {
      els.inputError.textContent = 'Vérifiez la température et l\'humidité intérieures (ex : 28,5 et 45).';
      els.inputError.hidden = false;
    } else if (valid && currentOutdoor === null && weatherLoadAttempted) {
      els.inputError.textContent = 'Météo extérieure indisponible : impossible d\'analyser pour l\'instant.';
      els.inputError.hidden = false;
    } else {
      els.inputError.hidden = true;
    }
  }

  [els.indoorTemp, els.indoorHumidity].forEach((input) => {
    input.addEventListener('input', () => {
      validateAndToggleAnalyze();
      if (indoorValuesValid()) {
        window.Storage.saveIndoor(getIndoorValues());
      }
    });
  });

  function prefillIndoor() {
    const saved = window.Storage.loadIndoor();
    if (saved) {
      els.indoorTemp.value = saved.temp;
      els.indoorHumidity.value = saved.humidity;
    }
  }

  // --- Analyse / résultat ---------------------------------------------------

  function renderDecision(decision) {
    els.decisionStatus.textContent = STATUS_LABELS[decision.status];
    els.decisionStatus.className = `decision-status status-${decision.status.toLowerCase()}`;
    els.decisionScore.textContent = `${decision.score}/100`;
    if (decision.durationMinutes !== null) {
      els.durationBlock.hidden = false;
      els.decisionDuration.textContent = `${decision.durationMinutes} min`;
    } else {
      els.durationBlock.hidden = true;
    }
    els.decisionConfidence.textContent = decision.confidence;
    els.decisionReasons.innerHTML = decision.reasons.map((r) => `<li>${r}</li>`).join('');

    if (decision.status === 'OUVRIR' || !currentOutdoor) {
      els.forecastAdvice.hidden = true;
    } else {
      const advice = window.Decision.computeForecastAdvice(getIndoorValues(), currentForecast, Date.parse(currentOutdoor.time));
      els.forecastAdvice.hidden = false;
      els.forecastAdvice.textContent = advice
        ? `🔮 Ouverture possible vers ${formatHHMM(advice.time)} (${formatRelativeMinutes(advice.minutesFromNow)}), d'après les prévisions.`
        : `🔮 Pas d'amélioration prévue dans les prochaines heures d'après les prévisions actuelles.`;
    }

    const e = decision.expert;
    document.getElementById('expert-ah-in').textContent = `${round(e.ahIndoor, 1)} g/m³`;
    document.getElementById('expert-ah-out').textContent = `${round(e.ahOutdoor, 1)} g/m³`;
    document.getElementById('expert-ah-gain').textContent = `${round(e.ahGain, 1)} g/m³`;
    document.getElementById('expert-dp-in').textContent = `${round(e.dewPointIndoor, 1)}°C`;
    document.getElementById('expert-dp-out').textContent = `${round(e.dewPointOutdoor, 1)}°C`;
    document.getElementById('expert-humidex').textContent = round(e.humidexOutdoor, 1);
    document.getElementById('expert-thermal-gap').textContent = `${round(e.thermalGap, 1)}°C`;
    document.getElementById('expert-hygro-gap').textContent = `${round(e.hygrometricGap, 1)} g/m³`;
    document.getElementById('expert-renewal').textContent = `~${e.airRenewalMinutes} min`;
    document.getElementById('expert-wall-risk').textContent = e.wallReheatRisk;
  }

  els.analyzeBtn.addEventListener('click', () => {
    if (!indoorValuesValid() || !currentOutdoor) return;
    currentDecision = window.Decision.computeDecision(getIndoorValues(), currentOutdoor);
    renderDecision(currentDecision);
    showScreen('screen-result');
  });

  els.backToInputBtn.addEventListener('click', () => showScreen('screen-input'));

  els.expertToggle.addEventListener('change', () => {
    els.expertPanel.hidden = !els.expertToggle.checked;
  });

  // --- Chronomètre ---------------------------------------------------

  els.openedBtn.addEventListener('click', () => {
    const durationMinutes = (currentDecision && currentDecision.durationMinutes) || DEFAULT_TIMER_MINUTES;
    showScreen('screen-timer');
    els.timerStatus.className = 'timer-status';
    timer.start(durationMinutes, {
      onTick: ({ elapsedSeconds, remainingSeconds }) => {
        els.timerElapsed.textContent = window.formatMMSS(elapsedSeconds);
        if (remainingSeconds > 0) {
          els.timerStatus.textContent = 'Continuez';
          els.timerRemaining.textContent = `Encore ${Math.ceil(remainingSeconds / 60)} min`;
        } else {
          els.timerRemaining.textContent = 'Le gain maximal est atteint.';
        }
      },
      onComplete: () => {
        els.timerStatus.textContent = 'Fermez maintenant';
        els.timerStatus.classList.add('status-close');
      },
    });
  });

  els.closedBtn.addEventListener('click', () => {
    timer.stop();
    showScreen('screen-input');
  });

  // --- PWA ---------------------------------------------------

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        // Installation PWA non critique : on continue sans service worker si l'enregistrement échoue.
      });
    });
  }

  // --- Démarrage ---------------------------------------------------

  prefillIndoor();
  validateAndToggleAnalyze();
  initLocation();
})();

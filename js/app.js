// Orchestration : câble le DOM aux modules Weather / Decision / Storage / Timer.
(function () {
  'use strict';

  const els = {
    locationLabel: document.getElementById('location-label'),
    changeLocationBtn: document.getElementById('change-location-btn'),
    locationPicker: document.getElementById('location-picker'),
    locationPickerMessage: document.getElementById('location-picker-message'),
    citySearch: document.getElementById('city-search'),
    cityResults: document.getElementById('city-results'),
    cancelLocationPickerBtn: document.getElementById('cancel-location-picker-btn'),
    indoorTemp: document.getElementById('indoor-temp'),
    indoorHumidity: document.getElementById('indoor-humidity'),
    targetSummer: document.getElementById('target-summer'),
    targetWinter: document.getElementById('target-winter'),
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
    durationLabelText: document.getElementById('duration-label-text'),
    decisionDuration: document.getElementById('decision-duration'),
    decisionConfidence: document.getElementById('decision-confidence'),
    regimeNote: document.getElementById('regime-note'),
    decisionReasons: document.getElementById('decision-reasons'),
    forecastAdvice: document.getElementById('forecast-advice'),
    coolingEstimate: document.getElementById('cooling-estimate'),
    coolingEstimateLabel: document.getElementById('cooling-estimate-label'),
    coolingNotApplicableCard: document.getElementById('cooling-not-applicable-card'),
    coolingNotApplicableText: document.getElementById('cooling-not-applicable-text'),
    scoreHelpBtn: document.getElementById('score-help-btn'),
    scoreHelpDialog: document.getElementById('score-help-dialog'),
    scoreHelpCloseBtn: document.getElementById('score-help-close-btn'),
    nightHelpBtn: document.getElementById('night-help-btn'),
    nightHelpDialog: document.getElementById('night-help-dialog'),
    nightHelpCloseBtn: document.getElementById('night-help-close-btn'),
    durationHelpBtn: document.getElementById('duration-help-btn'),
    crossVentHelpBtn: document.getElementById('cross-vent-help-btn'),
    crossVentHelpDialog: document.getElementById('cross-vent-help-dialog'),
    crossVentHelpCloseBtn: document.getElementById('cross-vent-help-close-btn'),
    expertToggle: document.getElementById('expert-toggle'),
    expertPanel: document.getElementById('expert-panel'),
    backToInputBtn: document.getElementById('back-to-input-btn'),
    openedBtn: document.getElementById('opened-btn'),

    roomSummaryText: document.getElementById('room-summary-text'),
    roomCalibrationText: document.getElementById('room-calibration-text'),
    roomEditBtn: document.getElementById('room-edit-btn'),
    roomForm: document.getElementById('room-form'),
    roomSurface: document.getElementById('room-surface'),
    roomHeight: document.getElementById('room-height'),
    roomOrientationGrid: document.getElementById('room-orientation-grid'),
    roomCrossVent: document.getElementById('room-cross-vent'),
    roomCancelBtn: document.getElementById('room-cancel-btn'),
    roomSaveBtn: document.getElementById('room-save-btn'),
    roomExportBtn: document.getElementById('room-export-btn'),
    roomImportBtn: document.getElementById('room-import-btn'),
    roomImportInput: document.getElementById('room-import-input'),
    roomBackupError: document.getElementById('room-backup-error'),
    nightCoolingCard: document.getElementById('night-cooling-card'),
    nightForecastTable: document.getElementById('night-forecast-table'),
    nightForecastBody: document.getElementById('night-forecast-body'),

    roomCalibrateBtn: document.getElementById('room-calibrate-btn'),
    calibrationForm: document.getElementById('calibration-form'),
    calibStartTemp: document.getElementById('calib-start-temp'),
    calibEndTemp: document.getElementById('calib-end-temp'),
    calibStartTime: document.getElementById('calib-start-time'),
    calibEndTime: document.getElementById('calib-end-time'),
    calibrationError: document.getElementById('calibration-error'),
    calibrationCancelBtn: document.getElementById('calibration-cancel-btn'),
    calibrationSaveBtn: document.getElementById('calibration-save-btn'),
    calibrationClearBtn: document.getElementById('calibration-clear-btn'),

    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanels: { air: document.getElementById('tab-air'), cooling: document.getElementById('tab-cooling') },

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
  const DEFAULT_TARGETS = { summer: 22, winter: 20 };

  let currentLocation = null;
  let currentOutdoor = null;
  let currentForecast = [];
  let currentDecision = null;
  let currentAerationMinutes = null;
  let currentRoom = window.Storage.loadRoom();
  let currentTargets = window.Storage.loadTargets() || DEFAULT_TARGETS;
  let weatherLoadAttempted = false;
  const timer = window.AerationTimer();

  function showScreen(id) {
    [els.screenInput, els.screenResult, els.screenTimer].forEach((s) => {
      s.hidden = s.id !== id;
    });
  }

  function showTab(key) {
    els.tabButtons.forEach((btn) => {
      const selected = btn.dataset.tab === key;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-selected', String(selected));
    });
    Object.entries(els.tabPanels).forEach(([panelKey, panel]) => {
      panel.hidden = panelKey !== key;
    });
  }

  els.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

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
    els.changeLocationBtn.hidden = false;
    hideLocationPicker();
  }

  function hideLocationPicker() {
    els.locationPicker.hidden = true;
    els.cityResults.innerHTML = '';
    els.citySearch.value = '';
  }

  // reason: 'auto-fail' (géolocalisation échouée, pas de position connue) ou 'manual' (l'utilisateur veut changer de ville).
  function showLocationPicker(reason) {
    if (reason === 'auto-fail') {
      els.locationLabel.textContent = 'Position inconnue';
      els.outdoorWeather.innerHTML = '<p class="muted">Recherchez votre ville pour obtenir la météo.</p>';
      els.locationPickerMessage.textContent = 'Impossible d\'obtenir votre position automatiquement.';
      els.cancelLocationPickerBtn.hidden = true;
    } else {
      els.locationPickerMessage.textContent = 'Recherchez une nouvelle ville.';
      els.cancelLocationPickerBtn.hidden = !currentLocation;
    }
    els.changeLocationBtn.hidden = false;
    els.locationPicker.hidden = false;
    els.citySearch.focus();
  }

  els.changeLocationBtn.addEventListener('click', () => showLocationPicker('manual'));
  els.cancelLocationPickerBtn.addEventListener('click', () => hideLocationPicker());

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
    loadWeather({ latitude: picked.latitude, longitude: picked.longitude });
  });

  els.refreshWeatherBtn.addEventListener('click', () => {
    if (currentLocation) loadWeather(currentLocation);
  });

  async function initLocation() {
    try {
      const pos = await window.Weather.getCurrentPosition();
      let label = 'Position actuelle';
      try {
        const cityLabel = await window.Weather.reverseGeocode(pos.latitude, pos.longitude);
        if (cityLabel) label = cityLabel;
      } catch (err) {
        // Nom de ville indisponible : on garde le libellé générique, la météo fonctionne quand même.
      }
      setLocation({ latitude: pos.latitude, longitude: pos.longitude, label });
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
      showLocationPicker('auto-fail');
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

  // --- Cibles de confort (été / hiver) ---------------------------------------------------

  function getTargetsValues() {
    const summer = parseDecimal(els.targetSummer.value);
    const winter = parseDecimal(els.targetWinter.value);
    return { summer, winter };
  }

  function targetsValuesValid() {
    const { summer, winter } = getTargetsValues();
    return Number.isFinite(summer) && Number.isFinite(winter);
  }

  function prefillTargets() {
    const saved = window.Storage.loadTargets();
    currentTargets = saved || DEFAULT_TARGETS;
    els.targetSummer.value = currentTargets.summer;
    els.targetWinter.value = currentTargets.winter;
  }

  [els.targetSummer, els.targetWinter].forEach((input) => {
    input.addEventListener('input', () => {
      if (targetsValuesValid()) {
        currentTargets = getTargetsValues();
        window.Storage.saveTargets(currentTargets);
      }
    });
  });

  // --- Ma pièce ---------------------------------------------------

  function formatRoomSummary(room) {
    if (!room) return 'Non configurée';
    const parts = [`${round(room.surface, 1)} m²`, `${round(room.ceilingHeight, 1)} m sous plafond`, `fenêtre ${room.orientation}`];
    if (room.crossVentilation) parts.push('courant d\'air');
    return parts.join(' · ');
  }

  function renderRoomSummary() {
    els.roomSummaryText.textContent = formatRoomSummary(currentRoom);
    els.roomEditBtn.textContent = currentRoom ? 'Modifier' : 'Configurer';
    if (!currentRoom) {
      els.roomCalibrationText.textContent = '';
    } else if (currentRoom.calibratedTauHours) {
      els.roomCalibrationText.textContent = `Étalonnage réel appliqué (refroidit sur ~${round(currentRoom.calibratedTauHours, 1)} h).`;
    } else {
      els.roomCalibrationText.textContent = 'Estimation générique (pas encore calibrée avec une mesure réelle).';
    }
  }

  function openRoomForm() {
    closeCalibrationForm();
    els.roomSurface.value = currentRoom ? currentRoom.surface : '';
    els.roomHeight.value = currentRoom ? currentRoom.ceilingHeight : '';
    els.roomCrossVent.checked = !!(currentRoom && currentRoom.crossVentilation);
    els.roomOrientationGrid.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('selected', !!currentRoom && btn.dataset.dir === currentRoom.orientation);
    });
    els.roomForm.hidden = false;
  }

  function closeRoomForm() {
    els.roomForm.hidden = true;
  }

  els.roomEditBtn.addEventListener('click', openRoomForm);
  els.roomCancelBtn.addEventListener('click', closeRoomForm);

  els.roomOrientationGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-dir]');
    if (!btn) return;
    els.roomOrientationGrid.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  els.roomSaveBtn.addEventListener('click', () => {
    const surface = parseDecimal(els.roomSurface.value);
    const height = parseDecimal(els.roomHeight.value);
    const selectedBtn = els.roomOrientationGrid.querySelector('button.selected');
    if (!Number.isFinite(surface) || surface <= 0 || !Number.isFinite(height) || height <= 0 || !selectedBtn) {
      return;
    }
    currentRoom = {
      surface,
      ceilingHeight: height,
      orientation: selectedBtn.dataset.dir,
      crossVentilation: els.roomCrossVent.checked,
      calibratedTauHours: currentRoom ? currentRoom.calibratedTauHours : undefined,
    };
    window.Storage.saveRoom(currentRoom);
    renderRoomSummary();
    closeRoomForm();
  });

  // --- Export / Import "Ma pièce" ---------------------------------------------------

  function showRoomBackupError(message) {
    els.roomBackupError.textContent = message;
    els.roomBackupError.hidden = false;
  }

  els.roomExportBtn.addEventListener('click', () => {
    els.roomBackupError.hidden = true;
    if (!currentRoom) {
      showRoomBackupError('Configure "Ma pièce" avant d\'exporter.');
      return;
    }
    const blob = new Blob([JSON.stringify(currentRoom, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aeroconfort-ma-piece.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  els.roomImportBtn.addEventListener('click', () => {
    els.roomBackupError.hidden = true;
    els.roomImportInput.click();
  });

  els.roomImportInput.addEventListener('change', async () => {
    const file = els.roomImportInput.files[0];
    els.roomImportInput.value = '';
    if (!file) return;
    els.roomBackupError.hidden = true;
    const validOrientations = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    try {
      const data = JSON.parse(await file.text());
      if (
        typeof data.surface !== 'number' || data.surface <= 0 ||
        typeof data.ceilingHeight !== 'number' || data.ceilingHeight <= 0 ||
        !validOrientations.includes(data.orientation)
      ) {
        showRoomBackupError('Fichier invalide : ce n\'est pas un export "Ma pièce" reconnu.');
        return;
      }
      currentRoom = {
        surface: data.surface,
        ceilingHeight: data.ceilingHeight,
        orientation: data.orientation,
        crossVentilation: !!data.crossVentilation,
        calibratedTauHours: typeof data.calibratedTauHours === 'number' ? data.calibratedTauHours : undefined,
      };
      window.Storage.saveRoom(currentRoom);
      renderRoomSummary();
    } catch (err) {
      showRoomBackupError('Impossible de lire ce fichier.');
    }
  });

  // --- Calibration (mesure réelle) ---------------------------------------------------

  function openCalibrationForm() {
    closeRoomForm();
    els.calibStartTemp.value = '';
    els.calibEndTemp.value = '';
    els.calibStartTime.value = '';
    els.calibEndTime.value = '';
    els.calibrationError.hidden = true;
    els.calibrationClearBtn.hidden = !(currentRoom && currentRoom.calibratedTauHours);
    els.calibrationForm.hidden = false;
  }

  function closeCalibrationForm() {
    els.calibrationForm.hidden = true;
  }

  els.roomCalibrateBtn.addEventListener('click', openCalibrationForm);
  els.calibrationCancelBtn.addEventListener('click', closeCalibrationForm);

  function showCalibrationError(message) {
    els.calibrationError.textContent = message;
    els.calibrationError.hidden = false;
  }

  els.calibrationSaveBtn.addEventListener('click', async () => {
    if (!currentRoom || !currentLocation) return;
    const startTemp = parseDecimal(els.calibStartTemp.value);
    const endTemp = parseDecimal(els.calibEndTemp.value);
    const startMs = Date.parse(els.calibStartTime.value);
    const endMs = Date.parse(els.calibEndTime.value);

    if (!Number.isFinite(startTemp) || !Number.isFinite(endTemp) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      showCalibrationError('Renseigne les 4 valeurs.');
      return;
    }
    if (endMs <= startMs) {
      showCalibrationError('L\'heure de fin doit être après l\'heure de début.');
      return;
    }

    els.calibrationError.hidden = true;
    els.calibrationSaveBtn.disabled = true;
    els.calibrationSaveBtn.textContent = 'Récupération de la météo…';
    try {
      const outdoorAvg = await window.Weather.fetchHistoricalAverageTemp(currentLocation.latitude, currentLocation.longitude, startMs, endMs);
      const durationHours = (endMs - startMs) / 3600000;
      const result = window.Decision.computeCalibration(startTemp, endTemp, outdoorAvg, durationHours);
      if (!result) {
        showCalibrationError('Valeurs incohérentes : l\'intérieur doit se rapprocher de l\'extérieur (pas s\'en éloigner).');
        return;
      }
      currentRoom.calibratedTauHours = result.tauHours;
      window.Storage.saveRoom(currentRoom);
      renderRoomSummary();
      closeCalibrationForm();
    } catch (err) {
      showCalibrationError(err.message || 'Météo indisponible pour cette période.');
    } finally {
      els.calibrationSaveBtn.disabled = false;
      els.calibrationSaveBtn.textContent = 'Calculer et enregistrer';
    }
  });

  els.calibrationClearBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    delete currentRoom.calibratedTauHours;
    window.Storage.saveRoom(currentRoom);
    renderRoomSummary();
    closeCalibrationForm();
  });

  // --- Analyse / résultat ---------------------------------------------------

  function regimeNoteText(regimeInfo) {
    if (regimeInfo.context === 'mild') {
      return 'Il fait déjà bon dehors, entre vos deux cibles : aération courte pour renouveler l\'air, pas de température à chercher.';
    }
    if (regimeInfo.context === 'winter') {
      return 'Contexte hiver, intérieur déjà proche ou sous la cible : aération courte pour l\'air, sans trop refroidir.';
    }
    return 'Contexte été, mais pas de baisse de température à gagner pour l\'instant : aération courte pour l\'air.';
  }

  function coolingNotApplicableText(regimeInfo) {
    if (regimeInfo.context === 'mild') {
      return 'Il fait déjà bon dehors, entre vos deux cibles : pas de rafraîchissement à chercher pour l\'instant.';
    }
    if (regimeInfo.context === 'winter') {
      return 'Contexte hiver, intérieur déjà proche ou sous la cible : le rafraîchissement n\'a pas de sens ici.';
    }
    return 'Contexte été, mais l\'extérieur n\'est pas (ou plus) plus frais que l\'intérieur pour l\'instant : pas de baisse à chercher.';
  }

  function renderDecision(decision) {
    els.decisionStatus.textContent = STATUS_LABELS[decision.status];
    els.decisionStatus.className = `decision-status status-${decision.status.toLowerCase()}`;
    els.decisionScore.textContent = `${decision.score}/100`;
    els.decisionConfidence.textContent = decision.confidence;
    els.decisionReasons.innerHTML = decision.reasons.map((r) => `<li>${r}</li>`).join('');

    const regimeInfo = currentOutdoor ? window.Decision.computeComfortRegime(getIndoorValues(), currentOutdoor, currentTargets) : null;

    let aeration = { durationMinutes: null, finalTemp: null };
    if (regimeInfo && decision.status === 'OUVRIR') {
      if (regimeInfo.regime === 'refresh') {
        aeration.durationMinutes = decision.durationMinutes;
        const cooling = currentRoom ? window.Decision.computeCoolingEstimate(getIndoorValues(), currentOutdoor, currentRoom, decision.durationMinutes) : null;
        aeration.finalTemp = cooling ? cooling.finalTemp : null;
      } else {
        const short = window.Decision.computeShortAeration(getIndoorValues(), currentOutdoor, currentRoom);
        aeration.durationMinutes = short.durationMinutes;
        aeration.finalTemp = short.finalTemp;
      }
    }

    if (aeration.durationMinutes !== null) {
      els.durationBlock.hidden = false;
      els.durationLabelText.textContent = regimeInfo.regime === 'refresh' ? 'Durée idéale' : 'Aération conseillée';
      els.decisionDuration.textContent = `${aeration.durationMinutes} min`;
    } else {
      els.durationBlock.hidden = true;
    }

    if (regimeInfo && regimeInfo.regime === 'short' && decision.status === 'OUVRIR') {
      els.regimeNote.textContent = regimeNoteText(regimeInfo);
      els.regimeNote.hidden = false;
    } else {
      els.regimeNote.hidden = true;
    }

    if (decision.status === 'OUVRIR' || !currentOutdoor) {
      els.forecastAdvice.hidden = true;
    } else {
      const advice = window.Decision.computeForecastAdvice(getIndoorValues(), currentForecast.slice(0, 3), Date.parse(currentOutdoor.time));
      els.forecastAdvice.hidden = false;
      els.forecastAdvice.textContent = advice
        ? `🔮 Ouverture possible vers ${formatHHMM(advice.time)} (${formatRelativeMinutes(advice.minutesFromNow)}), d'après les prévisions.`
        : `🔮 Pas d'amélioration prévue dans les prochaines heures d'après les prévisions actuelles.`;
    }

    if (aeration.finalTemp !== null && aeration.durationMinutes !== null) {
      els.coolingEstimate.hidden = false;
      els.coolingEstimateLabel.textContent = regimeInfo.regime === 'refresh' ? 'Baisse estimée' : 'Température estimée après aération';
      document.getElementById('cooling-estimate-text').textContent =
        `${round(getIndoorValues().temp, 1)}°C → ${round(aeration.finalTemp, 1)}°C en ${aeration.durationMinutes} min`;
    } else {
      els.coolingEstimate.hidden = true;
    }

    const showNightCooling = !regimeInfo || regimeInfo.regime === 'refresh';
    els.nightCoolingCard.hidden = !showNightCooling;
    els.coolingNotApplicableCard.hidden = showNightCooling;

    if (showNightCooling) {
      if (currentRoom) {
        // Les conditions actuelles comptent comme premier créneau possible : sans
        // ça, si dehors est déjà plus frais maintenant, l'algorithme sauterait ce
        // moment et ne proposerait qu'un créneau plus tard dans les prévisions.
        const nightPoints = currentOutdoor ? [currentOutdoor, ...currentForecast] : currentForecast;
        const night = window.Decision.computeNightCooling(getIndoorValues(), nightPoints, currentRoom);
        let nightText = 'Aucune fenêtre de rafraîchissement nocturne prévue sur les prochaines heures.';
        if (night) {
          nightText = night.closeIsRealCrossing
            ? `Ouvrez vers ${formatHHMM(night.openTime)}, fermez vers ${formatHHMM(night.closeTime)} → jusqu'à environ ${round(night.finalTemp, 1)}°C.`
            : `Ouvrez vers ${formatHHMM(night.openTime)} : encore favorable au moins jusqu'à ${formatHHMM(night.closeTime)} (limite des prévisions disponibles), environ ${round(night.finalTemp, 1)}°C à ce moment-là.`;
        }
        document.getElementById('night-cooling-text').textContent = nightText;

        if (night && night.hourlyPoints.length) {
          els.nightForecastBody.innerHTML = night.hourlyPoints.map((p) =>
            `<tr><td>${formatHHMM(p.time)}</td><td>${round(p.temp, 1)}°C</td><td>${round(p.humidity, 0)}%</td></tr>`
          ).join('');
          els.nightForecastTable.hidden = false;
        } else {
          els.nightForecastTable.hidden = true;
        }
      } else {
        document.getElementById('night-cooling-text').textContent = 'Configurez "Ma pièce" pour activer cette estimation.';
        els.nightForecastTable.hidden = true;
      }
    } else {
      els.coolingNotApplicableText.textContent = coolingNotApplicableText(regimeInfo);
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

    currentAerationMinutes = aeration.durationMinutes;
  }

  els.analyzeBtn.addEventListener('click', () => {
    if (!indoorValuesValid() || !currentOutdoor) return;
    currentDecision = window.Decision.computeDecision(getIndoorValues(), currentOutdoor);
    renderDecision(currentDecision);
    showTab('air');
    showScreen('screen-result');
  });

  els.backToInputBtn.addEventListener('click', () => showScreen('screen-input'));

  els.scoreHelpBtn.addEventListener('click', () => els.scoreHelpDialog.showModal());
  els.scoreHelpCloseBtn.addEventListener('click', () => els.scoreHelpDialog.close());
  els.scoreHelpDialog.addEventListener('click', (event) => {
    if (event.target === els.scoreHelpDialog) els.scoreHelpDialog.close();
  });

  els.nightHelpBtn.addEventListener('click', () => els.nightHelpDialog.showModal());
  els.nightHelpCloseBtn.addEventListener('click', () => els.nightHelpDialog.close());
  els.nightHelpDialog.addEventListener('click', (event) => {
    if (event.target === els.nightHelpDialog) els.nightHelpDialog.close();
  });

  els.durationHelpBtn.addEventListener('click', () => els.scoreHelpDialog.showModal());

  els.crossVentHelpBtn.addEventListener('click', () => els.crossVentHelpDialog.showModal());
  els.crossVentHelpCloseBtn.addEventListener('click', () => els.crossVentHelpDialog.close());
  els.crossVentHelpDialog.addEventListener('click', (event) => {
    if (event.target === els.crossVentHelpDialog) els.crossVentHelpDialog.close();
  });

  els.expertToggle.addEventListener('change', () => {
    els.expertPanel.hidden = !els.expertToggle.checked;
  });

  // --- Chronomètre ---------------------------------------------------

  els.openedBtn.addEventListener('click', () => {
    const durationMinutes = currentAerationMinutes || DEFAULT_TIMER_MINUTES;
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
  prefillTargets();
  renderRoomSummary();
  validateAndToggleAnalyze();
  initLocation();
})();

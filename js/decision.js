// Moteur de décision : traduit intérieur/extérieur en recommandation
// Ouvrir / Attendre / Fermer. Heuristique maison (pas de norme officielle) —
// toutes les constantes sont regroupées ici pour être ajustées facilement
// au fil de l'usage réel, sans toucher au reste du code.
(function (global) {
  'use strict';

  const CONSTANTS = {
    BASE_SCORE: 50,
    WEIGHT_TEMP: 9, // points de score par °C d'écart favorable (int - ext)
    WEIGHT_HUMIDITY: 5, // points de score par g/m³ d'écart favorable (int - ext)
    WIND_MIN_FAVORABLE_KMH: 5,
    WIND_MAX_FAVORABLE_KMH: 25,
    WIND_BONUS_MAX: 8,
    WIND_STRONG_KMH: 40, // au-delà : pénalité (courants d'air, sécurité)
    WIND_PENALTY: 6,
    GUST_WARNING_KMH: 50,
    SCORE_OPEN_THRESHOLD: 65,
    SCORE_WAIT_THRESHOLD: 40,
    DURATION_MIN_MIN: 5,
    DURATION_MAX_MIN: 45,
    SIGNIFICANT_TEMP_DELTA: 1, // °C au-delà duquel on mentionne le facteur
    SIGNIFICANT_AH_DELTA: 1, // g/m³ au-delà duquel on mentionne le facteur

    // Modèle "Ma pièce" (renouvellement d'air et refroidissement) : approximation
    // volontairement simple (règle empirique de ventilation naturelle), pas une
    // norme d'ingénierie — cohérent avec le reste de l'appli.
    DEFAULT_WINDOW_AREA_M2: 1, // surface d'ouverture par défaut, non demandée à l'utilisateur
    SINGLE_SIDED_COEFF: 0.025, // débit ~ coeff * A * vent(m/s), une seule fenêtre
    CROSS_VENT_COEFF: 0.05, // courant d'air (fenêtres en vis-à-vis) : débit ~doublé
    ORIENTATION_FULL_DEG: 45, // vent de face sur la fenêtre : effet plein
    ORIENTATION_PARTIAL_DEG: 135, // vent oblique : effet partiel
    ORIENTATION_COEFF_FULL: 1,
    ORIENTATION_COEFF_PARTIAL: 0.5,
    ORIENTATION_COEFF_LOW: 0.3, // vent de dos / parallèle à la façade

    // Facteur d'inertie thermique : l'air seul s'équilibre vite avec l'extérieur,
    // mais la température ressentie de la pièce est freinée par les murs, le sol
    // et les meubles qui ont emmagasiné de la chaleur. Calé sur une observation
    // réelle (30,9°C → 29,5°C en 5h30) qui indiquait un temps de refroidissement
    // ~100x plus lent que l'air seul. Valeur approximative, à réajuster si
    // d'autres observations réelles s'en écartent nettement.
    THERMAL_MASS_FACTOR: 100,
  };

  const COMPASS_DEGREES = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function windBonus(windSpeedKmh) {
    const { WIND_MIN_FAVORABLE_KMH, WIND_MAX_FAVORABLE_KMH, WIND_BONUS_MAX, WIND_STRONG_KMH, WIND_PENALTY } = CONSTANTS;
    if (windSpeedKmh >= WIND_MIN_FAVORABLE_KMH && windSpeedKmh <= WIND_MAX_FAVORABLE_KMH) {
      return WIND_BONUS_MAX;
    }
    if (windSpeedKmh > WIND_STRONG_KMH) {
      return -WIND_PENALTY;
    }
    return 0;
  }

  function computeRoomVolume(room) {
    return room.surface * room.ceilingHeight;
  }

  // Efficacité du vent selon son angle par rapport à l'orientation de la fenêtre :
  // de face = plein effet, oblique = effet réduit, de dos/parallèle = effet faible.
  function windEffectivenessFactor(windDirDeg, windowDirDeg) {
    const { ORIENTATION_FULL_DEG, ORIENTATION_PARTIAL_DEG, ORIENTATION_COEFF_FULL, ORIENTATION_COEFF_PARTIAL, ORIENTATION_COEFF_LOW } = CONSTANTS;
    if (windDirDeg == null || windowDirDeg == null) return ORIENTATION_COEFF_PARTIAL;
    let diff = Math.abs(windDirDeg - windowDirDeg) % 360;
    if (diff > 180) diff = 360 - diff;
    if (diff <= ORIENTATION_FULL_DEG) return ORIENTATION_COEFF_FULL;
    if (diff <= ORIENTATION_PARTIAL_DEG) return ORIENTATION_COEFF_PARTIAL;
    return ORIENTATION_COEFF_LOW;
  }

  // Débit d'air estimé (m³/h) à travers la/les fenêtre(s) ouverte(s).
  function computeAirflow(outdoor, room) {
    const { DEFAULT_WINDOW_AREA_M2, SINGLE_SIDED_COEFF, CROSS_VENT_COEFF } = CONSTANTS;
    const windMs = outdoor.windSpeed / 3.6;
    const coeff = room.crossVentilation ? CROSS_VENT_COEFF : SINGLE_SIDED_COEFF;
    const orientationFactor = windEffectivenessFactor(outdoor.windDirection, COMPASS_DEGREES[room.orientation]);
    const qM3s = coeff * DEFAULT_WINDOW_AREA_M2 * windMs * orientationFactor;
    return qM3s * 3600;
  }

  // Décroissance exponentielle standard : après tau heures, ~63% de l'écart
  // avec la cible est comblé. Si la pièce a un tau étalonné (mesure réelle,
  // cf. computeCalibration), il prime sur l'estimation générique
  // volume/débit × facteur d'inertie thermique.
  function projectRoomTemp(startTemp, targetTemp, hours, volume, airflowM3h, calibratedTauHours) {
    let tau = calibratedTauHours;
    if (!tau) {
      if (airflowM3h <= 0) return startTemp;
      tau = (volume * CONSTANTS.THERMAL_MASS_FACTOR) / airflowM3h;
    }
    return targetTemp + (startTemp - targetTemp) * Math.exp(-hours / tau);
  }

  // À partir d'une mesure réelle (température intérieure de départ/arrivée,
  // température extérieure moyenne estimée sur la période, durée écoulée),
  // déduit le temps caractéristique tau (h) de LA pièce mesurée. Retourne
  // null si les données ne permettent pas un calcul cohérent (écart nul ou
  // qui se serait creusé au lieu de se réduire).
  function computeCalibration(startTemp, endTemp, outdoorAvg, durationHours) {
    const deltaInitial = startTemp - outdoorAvg;
    const deltaFinal = endTemp - outdoorAvg;
    if (durationHours <= 0 || deltaInitial <= 0 || deltaFinal <= 0 || deltaFinal >= deltaInitial) {
      return null;
    }
    const fraction = deltaFinal / deltaInitial;
    const tauHours = -durationHours / Math.log(fraction);
    return { tauHours };
  }

  function computeReasons(deltaT, deltaAH, outdoor) {
    const reasons = [];
    const { SIGNIFICANT_TEMP_DELTA, SIGNIFICANT_AH_DELTA, WIND_MIN_FAVORABLE_KMH, WIND_MAX_FAVORABLE_KMH, WIND_STRONG_KMH, GUST_WARNING_KMH } = CONSTANTS;

    if (deltaT >= SIGNIFICANT_TEMP_DELTA) reasons.push('Air extérieur plus frais');
    else if (deltaT <= -SIGNIFICANT_TEMP_DELTA) reasons.push('Air extérieur plus chaud');
    else reasons.push('Écart de température faible');

    if (deltaAH >= SIGNIFICANT_AH_DELTA) reasons.push('Air extérieur plus sec');
    else if (deltaAH <= -SIGNIFICANT_AH_DELTA) reasons.push('Air extérieur plus humide');

    if (outdoor.windSpeed >= WIND_MIN_FAVORABLE_KMH && outdoor.windSpeed <= WIND_MAX_FAVORABLE_KMH) {
      reasons.push('Vent favorable au renouvellement d\'air');
    } else if (outdoor.windSpeed > WIND_STRONG_KMH) {
      reasons.push('Vent fort, prudence');
    } else if (outdoor.windSpeed < WIND_MIN_FAVORABLE_KMH) {
      reasons.push('Vent faible, renouvellement d\'air lent');
    }

    if (outdoor.windGusts >= GUST_WARNING_KMH) {
      reasons.push('Rafales fortes : surveillez les objets légers');
    }

    return reasons;
  }

  function computeExpert(indoor, outdoor, deltaT, deltaAH, score) {
    const Psy = global.Psychrometrics;
    const ahIndoor = Psy.absoluteHumidity(indoor.temp, indoor.humidity);
    const ahOutdoor = Psy.absoluteHumidity(outdoor.temp, outdoor.humidity);
    const dewPointIndoor = Psy.dewPoint(indoor.temp, indoor.humidity);
    const dewPointOutdoor = Psy.dewPoint(outdoor.temp, outdoor.humidity);
    const humidexOutdoor = Psy.humidex(outdoor.temp, dewPointOutdoor);

    // Estimation générique (renouvellement de l'air / confort respiratoire),
    // indépendante de "Ma pièce" : celle-ci ne sert qu'aux estimations de
    // rafraîchissement (computeCoolingEstimate / computeNightCooling).
    const airRenewalMinutes = Math.round(clamp(30 - outdoor.windSpeed * 0.5, 5, 40));
    const wallReheatRisk = outdoor.temp > 30 ? 'Élevé' : outdoor.temp > 25 ? 'Modéré' : 'Faible';

    return {
      ahIndoor,
      ahOutdoor,
      ahGain: deltaAH,
      dewPointIndoor,
      dewPointOutdoor,
      humidexOutdoor,
      thermalGap: deltaT,
      hygrometricGap: deltaAH,
      airRenewalMinutes,
      wallReheatRisk,
      confidencePercent: Math.round(clamp(score, 0, 100)),
    };
  }

  function computeDecision(indoor, outdoor) {
    const Psy = global.Psychrometrics;
    const ahIndoor = Psy.absoluteHumidity(indoor.temp, indoor.humidity);
    const ahOutdoor = Psy.absoluteHumidity(outdoor.temp, outdoor.humidity);

    const deltaT = indoor.temp - outdoor.temp;
    const deltaAH = ahIndoor - ahOutdoor;

    const rawScore = CONSTANTS.BASE_SCORE
      + CONSTANTS.WEIGHT_TEMP * deltaT
      + CONSTANTS.WEIGHT_HUMIDITY * deltaAH
      + windBonus(outdoor.windSpeed);
    const score = clamp(Math.round(rawScore), 0, 100);

    let status;
    if (score >= CONSTANTS.SCORE_OPEN_THRESHOLD) status = 'OUVRIR';
    else if (score >= CONSTANTS.SCORE_WAIT_THRESHOLD) status = 'ATTENDRE';
    else status = 'FERMER';

    const durationMinutes = status === 'OUVRIR'
      ? Math.round(CONSTANTS.DURATION_MIN_MIN + (score / 100) * (CONSTANTS.DURATION_MAX_MIN - CONSTANTS.DURATION_MIN_MIN))
      : null;

    const distanceFromBoundary = status === 'OUVRIR'
      ? score - CONSTANTS.SCORE_OPEN_THRESHOLD
      : status === 'FERMER'
        ? CONSTANTS.SCORE_WAIT_THRESHOLD - score
        : Math.min(score - CONSTANTS.SCORE_WAIT_THRESHOLD, CONSTANTS.SCORE_OPEN_THRESHOLD - score);
    const confidence = distanceFromBoundary >= 20 ? 'Élevée' : distanceFromBoundary >= 8 ? 'Moyenne' : 'Faible';

    return {
      status,
      score,
      durationMinutes,
      confidence,
      reasons: computeReasons(deltaT, deltaAH, outdoor),
      expert: computeExpert(indoor, outdoor, deltaT, deltaAH, score),
    };
  }

  // Cherche, parmi les prochaines heures prévues (météo extérieure future,
  // intérieur supposé stable), le premier créneau où la décision passerait
  // à OUVRIR — pour donner un horizon utile quand la recommandation actuelle
  // est ATTENDRE ou FERMER.
  function computeForecastAdvice(indoor, hourlyOutdoor, referenceTimeMs) {
    for (const point of hourlyOutdoor || []) {
      const result = computeDecision(indoor, point);
      if (result.status === 'OUVRIR') {
        return {
          time: point.time,
          minutesFromNow: Math.round((Date.parse(point.time) - referenceTimeMs) / 60000),
          score: result.score,
        };
      }
    }
    return null;
  }

  // Température atteignable en ouvrant `durationMinutes` maintenant, avec les
  // conditions extérieures actuelles. Nécessite "Ma pièce".
  function computeCoolingEstimate(indoor, outdoor, room, durationMinutes) {
    if (!room || !durationMinutes) return null;
    const airflow = computeAirflow(outdoor, room);
    if (!room.calibratedTauHours && airflow <= 0) return null;
    const finalTemp = projectRoomTemp(indoor.temp, outdoor.temp, durationMinutes / 60, computeRoomVolume(room), airflow, room.calibratedTauHours);
    return { finalTemp };
  }

  // Fenêtre de rafraîchissement nocturne : simule heure par heure la
  // température de la pièce à partir des prévisions, pour trouver quand
  // ouvrir (l'extérieur passe sous la température intérieure) et quand
  // fermer. La fermeture recommandée est la DERNIÈRE heure encore favorable
  // (pas la première heure défavorable) : on ferme avant que ça se dégrade,
  // pas pendant. Nécessite "Ma pièce".
  function computeNightCooling(indoor, hourlyOutdoor, room) {
    if (!room || !hourlyOutdoor || !hourlyOutdoor.length) return null;
    const volume = computeRoomVolume(room);
    const openIndex = hourlyOutdoor.findIndex((point) => point.temp < indoor.temp);
    if (openIndex === -1) return null;

    let roomTemp = indoor.temp;
    let closeIndex = openIndex;
    let crossingFound = false;
    for (let i = openIndex; i < hourlyOutdoor.length - 1; i++) {
      const point = hourlyOutdoor[i];
      const nextPoint = hourlyOutdoor[i + 1];
      const nextRoomTemp = projectRoomTemp(roomTemp, point.temp, 1, volume, computeAirflow(point, room), room.calibratedTauHours);
      if (nextPoint.temp >= nextRoomTemp) {
        closeIndex = i;
        crossingFound = true;
        break;
      }
      roomTemp = nextRoomTemp;
      closeIndex = i + 1;
    }

    return {
      openTime: hourlyOutdoor[openIndex].time,
      closeTime: hourlyOutdoor[closeIndex].time,
      finalTemp: roomTemp,
      // false : les conditions restent favorables jusqu'à la fin des prévisions
      // disponibles — "fermez vers X" reflète alors la limite des données, pas
      // une vraie dégradation détectée.
      closeIsRealCrossing: crossingFound,
      // Prévisions heure par heure de maintenant (index 0) jusqu'à la fermeture,
      // +1 heure supplémentaire (si disponible) pour constater que celle-ci est
      // bien défavorable.
      hourlyPoints: hourlyOutdoor.slice(0, closeIndex + 2).map((p) => ({
        time: p.time,
        temp: p.temp,
        humidity: p.humidity,
      })),
    };
  }

  // Détermine si on est en contexte "hiver" (extérieur sous la cible hiver),
  // "été" (extérieur au-dessus de la cible été), ou "intermédiaire" (il fait
  // déjà bon dehors, aucune cible ne s'applique).
  function determineTargetContext(outdoorTemp, targets) {
    if (outdoorTemp < targets.winter) return { mode: 'winter', target: targets.winter };
    if (outdoorTemp > targets.summer) return { mode: 'summer', target: targets.summer };
    return { mode: 'mild', target: null };
  }

  // Choisit entre deux régimes de recommandation :
  // - "refresh" : l'intérieur dépasse la cible retenue ET l'extérieur est
  //   plus frais que l'intérieur — il y a un vrai bénéfice à chasser, la
  //   durée proportionnelle au score (computeDecision) garde son sens.
  // - "short" : tous les autres cas (intérieur déjà proche/sous la cible, ou
  //   contexte intermédiaire) — pas de température à chasser, juste une
  //   aération courte pour l'air (cf. computeShortAeration).
  function computeComfortRegime(indoor, outdoor, targets) {
    const context = determineTargetContext(outdoor.temp, targets);
    if (context.mode === 'mild') {
      return { regime: 'short', target: null, context: context.mode };
    }
    if (indoor.temp > context.target && outdoor.temp < indoor.temp) {
      return { regime: 'refresh', target: context.target, context: context.mode };
    }
    return { regime: 'short', target: context.target, context: context.mode };
  }

  // Durée d'une aération courte (renouvellement d'air, pas une chasse à une
  // température) : le temps pour un renouvellement complet de l'air de la
  // pièce, à partir de son volume et du débit d'air réel (même principe que
  // "Renouvellement d'air estimé" en mode Expert, réappliqué ici avec "Ma
  // pièce" pour être précis sur ce cas précis). Donne aussi la température
  // atteinte après cette durée, à titre indicatif. Sans "Ma pièce", repli sur
  // l'estimation générique vent seul (durée seule, pas de température).
  function computeShortAeration(indoor, outdoor, room) {
    if (!room) {
      return { durationMinutes: Math.round(clamp(30 - outdoor.windSpeed * 0.5, 5, 40)), finalTemp: null };
    }
    const volume = computeRoomVolume(room);
    const airflow = computeAirflow(outdoor, room);
    if (airflow <= 0) return { durationMinutes: null, finalTemp: null };
    const durationMinutes = clamp(Math.round((60 * volume) / airflow), 1, 600);
    const finalTemp = projectRoomTemp(indoor.temp, outdoor.temp, durationMinutes / 60, volume, airflow, room.calibratedTauHours);
    return { durationMinutes, finalTemp };
  }

  global.Decision = {
    computeDecision,
    computeForecastAdvice,
    computeCoolingEstimate,
    computeNightCooling,
    computeCalibration,
    determineTargetContext,
    computeComfortRegime,
    computeShortAeration,
    CONSTANTS,
  };
})(window);

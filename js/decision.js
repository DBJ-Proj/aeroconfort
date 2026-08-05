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
  };

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

    // Estimations simplifiées (pas de données de volume de pièce ni
    // d'exposition des parois disponibles) : ordres de grandeur indicatifs.
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

  global.Decision = { computeDecision, computeForecastAdvice, CONSTANTS };
})(window);

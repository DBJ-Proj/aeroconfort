// Formules psychrométriques standard (Magnus-Tetens / Environment Canada).
// Fonctions pures : aucun accès DOM, entrées/sorties en °C, %, g/m³.
(function (global) {
  'use strict';

  // Pression de vapeur saturante (hPa) — approximation de Magnus-Tetens.
  function saturationVaporPressure(tempC) {
    return 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC));
  }

  // Pression de vapeur réelle (hPa) à partir de T et humidité relative (%).
  function vaporPressure(tempC, relHumidity) {
    return saturationVaporPressure(tempC) * (relHumidity / 100);
  }

  // Humidité absolue (g/m³).
  function absoluteHumidity(tempC, relHumidity) {
    const e = vaporPressure(tempC, relHumidity);
    return (216.7 * e) / (273.15 + tempC);
  }

  // Point de rosée (°C), dérivé de la pression de vapeur réelle.
  function dewPoint(tempC, relHumidity) {
    const e = vaporPressure(tempC, relHumidity);
    const ln = Math.log(e / 6.112);
    return (243.12 * ln) / (17.62 - ln);
  }

  // Humidex (Environment Canada), à partir de T et du point de rosée.
  function humidex(tempC, dewPointC) {
    const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPointC)));
    return tempC + 0.5555 * (e - 10);
  }

  global.Psychrometrics = {
    saturationVaporPressure,
    vaporPressure,
    absoluteHumidity,
    dewPoint,
    humidex,
  };
})(window);

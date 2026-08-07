// Géolocalisation + météo courante via Open-Meteo (gratuit, sans clé API).
// https://open-meteo.com/en/docs
(function (global) {
  'use strict';

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
  const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  // Horizon de prévision récupéré une fois pour toutes les fonctionnalités qui en
  // ont besoin : le message "prochain créneau favorable" n'utilise que les 3
  // premières heures, le rafraîchissement nocturne utilise l'horizon complet.
  const NIGHT_HOURS = 12;

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Géolocalisation non disponible sur cet appareil.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        (err) => reject(err),
        { timeout: 10000, maximumAge: 5 * 60 * 1000 }
      );
    });
  }

  async function searchCity(query) {
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Recherche de ville indisponible.');
    const data = await response.json();
    return (data.results || []).map((r) => ({
      name: r.name,
      admin1: r.admin1 || '',
      country: r.country || '',
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  }

  // Nom de ville à partir de coordonnées GPS (gratuit, sans clé, pensé pour un appel côté navigateur).
  // https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api
  async function reverseGeocode(latitude, longitude) {
    const params = new URLSearchParams({ latitude, longitude, localityLanguage: 'fr' });
    const response = await fetch(`${REVERSE_GEOCODING_URL}?${params.toString()}`);
    if (!response.ok) throw new Error('Nom de ville indisponible.');
    const data = await response.json();
    const city = data.city || data.locality || '';
    const region = data.principalSubdivision || '';
    if (!city) return null;
    return region && region !== city ? `${city}, ${region}` : city;
  }

  function degreesToCompass(degrees) {
    const index = Math.round(degrees / 45) % 8;
    return COMPASS_POINTS[index];
  }

  async function fetchWeather(latitude, longitude) {
    const params = new URLSearchParams({
      latitude,
      longitude,
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
      hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
      forecast_days: '2', // marge pour couvrir les prochaines heures même proche de minuit
      timezone: 'auto',
    });
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`);
    if (!response.ok) throw new Error('Météo indisponible pour le moment.');
    const data = await response.json();
    const c = data.current;
    const current = {
      temp: c.temperature_2m,
      humidity: c.relative_humidity_2m,
      windSpeed: c.wind_speed_10m,
      windGusts: c.wind_gusts_10m,
      windDirection: c.wind_direction_10m,
      windDirectionLabel: degreesToCompass(c.wind_direction_10m),
      time: c.time,
    };

    const h = data.hourly;
    const currentTimeMs = Date.parse(c.time);
    const startIndex = h.time.findIndex((t) => Date.parse(t) > currentTimeMs);
    const hourly = [];
    if (startIndex !== -1) {
      for (let i = startIndex; i < startIndex + NIGHT_HOURS && i < h.time.length; i++) {
        hourly.push({
          time: h.time[i],
          temp: h.temperature_2m[i],
          humidity: h.relative_humidity_2m[i],
          windSpeed: h.wind_speed_10m[i],
          windGusts: h.wind_gusts_10m[i],
          windDirection: h.wind_direction_10m[i],
        });
      }
    }

    return { current, hourly };
  }

  // Température extérieure réelle moyenne sur une période passée [startMs, endMs],
  // via le paramètre `past_days` de l'API prévisions (couvre jusqu'à 92 jours en
  // arrière, sans le délai de plusieurs jours de l'API archives classique).
  async function fetchHistoricalAverageTemp(latitude, longitude, startMs, endMs) {
    const pastDays = Math.min(92, Math.max(1, Math.ceil((Date.now() - startMs) / (24 * 3600 * 1000)) + 1));
    const params = new URLSearchParams({
      latitude,
      longitude,
      hourly: 'temperature_2m',
      past_days: String(pastDays),
      forecast_days: '1',
      timezone: 'auto',
    });
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`);
    if (!response.ok) throw new Error('Météo passée indisponible.');
    const data = await response.json();
    const times = data.hourly.time;
    const temps = data.hourly.temperature_2m;
    const values = [];
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(times[i]);
      if (t >= startMs && t <= endMs) values.push(temps[i]);
    }
    if (!values.length) throw new Error('Pas de données météo pour cette période.');
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  global.Weather = { getCurrentPosition, searchCity, reverseGeocode, fetchWeather, fetchHistoricalAverageTemp, degreesToCompass };
})(window);

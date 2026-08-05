// Persistance locale (localStorage) : position choisie et dernière saisie
// intérieure, pour pré-remplir l'application au lancement suivant.
(function (global) {
  'use strict';

  const KEYS = {
    LOCATION: 'aeroconfort.location',
    INDOOR: 'aeroconfort.indoor',
  };

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Stockage indisponible (navigation privée, quota) : on continue sans persister.
    }
  }

  function saveLocation(location) {
    writeJSON(KEYS.LOCATION, location);
  }

  function loadLocation() {
    return readJSON(KEYS.LOCATION);
  }

  function saveIndoor(indoor) {
    writeJSON(KEYS.INDOOR, indoor);
  }

  function loadIndoor() {
    return readJSON(KEYS.INDOOR);
  }

  global.Storage = { saveLocation, loadLocation, saveIndoor, loadIndoor };
})(window);

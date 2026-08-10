/* eslint-disable no-restricted-globals */
import * as XLSX from 'xlsx';

self.onmessage = function (e) {
  const { bstr } = e.data;

  const wb = XLSX.read(bstr, { type: 'binary' });
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  const coordTracker = {};
  const formattedData = data.map((item, index) => {
    const originalLat = parseFloat(String(item['Широта']).replace(',', '.').trim());
    const originalLng = parseFloat(String(item['Долгота']).replace(',', '.').trim());

    if (isNaN(originalLat) || isNaN(originalLng)) return null;

    let displayLat = originalLat;
    let displayLng = originalLng;

    const key = `${originalLat.toFixed(6)}-${originalLng.toFixed(6)}`;
    if (coordTracker[key]) {
      coordTracker[key] += 1;
      displayLat += coordTracker[key] * 0.0002;
      displayLng += coordTracker[key] * 0.0002;
    } else {
      coordTracker[key] = 1;
    }

    return {
      ...item,
      mapId: index,
      lat: displayLat,
      lng: displayLng,
    };
  }).filter(Boolean);

  self.postMessage({ formattedData });
};
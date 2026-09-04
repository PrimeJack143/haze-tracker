require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { insertReading, getHistory, getLatestReading } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const LAT = 7.611107;
const LON = 125.004850;

function mapOwmToSchema(data) {
  const d = data.list[0];
  return {
    aqi: d.main.aqi,
    main_pollutant: 'pm2_5',
    components: {
      pm2_5: d.components.pm2_5 || 0,
      pm10: d.components.pm10 || 0,
      co: d.components.co || 0,
      no2: d.components.no2 || 0,
      o3: d.components.o3 || 0,
      so2: d.components.so2 || 0,
    },
    source: 'owm',
  };
}

function mapIqairToSchema(data) {
  const d = data.data.current.pollution;
  let aqi = Math.round(d.aqius / 50) + 1;
  if (aqi > 5) aqi = 5;
  if (aqi < 1) aqi = 1;
  return {
    aqi: aqi,
    main_pollutant: d.mainus || 'pm2_5',
    components: {
      pm2_5: d.concentrations.pm25 || 0,
      pm10: d.concentrations.pm10 || 0,
      co: 0,
      no2: 0,
      o3: 0,
      so2: 0,
    },
    source: 'iqair',
  };
}

async function fetchAndStore() {
  try {
    const owmUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${LAT}&lon=${LON}&appid=${process.env.OWM_KEY}`;
    const owmRes = await axios.get(owmUrl);
    if (owmRes.data && owmRes.data.list && owmRes.data.list.length) {
      const data = mapOwmToSchema(owmRes.data);
      await insertReading(data);
      return data;
    }
    throw new Error('OWM no data');
  } catch (err) {
    console.warn('⚠️ OWM failed, trying IQAir...', err.message);
  }

  try {
    const iqUrl = `https://api.airvisual.com/v2/nearest_city?lat=${LAT}&lon=${LON}&key=${process.env.IQAIR_KEY}`;
    const iqRes = await axios.get(iqUrl);
    if (iqRes.data && iqRes.data.status === 'success') {
      const data = mapIqairToSchema(iqRes.data);
      await insertReading(data);
      return data;
    }
    throw new Error('IQAir no data');
  } catch (err) {
    console.error('❌ All APIs failed:', err.message);
    throw new Error('Unable to fetch air quality data');
  }
}

app.use(express.static('public'));

app.get('/api/current', async (req, res) => {
  try {
    const data = await getLatestReading();
    if (!data) {
      return res.status(404).json({ error: 'No air quality readings available' });
    }
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const history = await getHistory(days);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Haze Tracker running on http://localhost:${PORT}`);
  console.log(`📍 Dangcagan, Bukidnon (${LAT}, ${LON})`);

  try {
    await fetchAndStore();
    console.log('✅ Initial data stored');
  } catch (e) {
    console.warn('⚠️ Initial fetch failed, will retry on the next scheduled interval');
  }

  setInterval(async () => {
    try {
      await fetchAndStore();
      console.log('✅ Scheduled data stored');
    } catch (e) {
      console.warn('⚠️ Scheduled fetch failed:', e.message);
    }
  }, 30 * 60 * 1000);
});

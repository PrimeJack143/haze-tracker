const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'haze.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      aqi INTEGER,
      main_pollutant TEXT,
      pm25 REAL,
      pm10 REAL,
      co REAL,
      no2 REAL,
      o3 REAL,
      so2 REAL,
      source TEXT
    )
  `);
});

function insertReading(data) {
  return new Promise((resolve, reject) => {
    const { aqi, main_pollutant, components, source } = data;
    const stmt = db.prepare(`
      INSERT INTO readings (aqi, main_pollutant, pm25, pm10, co, no2, o3, so2, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      aqi,
      main_pollutant,
      components.pm2_5 || 0,
      components.pm10 || 0,
      components.co || 0,
      components.no2 || 0,
      components.o3 || 0,
      components.so2 || 0,
      source,
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
    stmt.finalize();
  });
}

function getHistory(days = 7) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT timestamp, aqi, main_pollutant, pm25, pm10, co, no2, o3, so2, source
      FROM readings
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp ASC
    `, [days], (err, rows) => {
      if (err) reject(err);
      else {
        const data = rows.map(row => ({
          timestamp: row.timestamp,
          aqi: row.aqi,
          main_pollutant: row.main_pollutant,
          components: {
            pm2_5: row.pm25,
            pm10: row.pm10,
            co: row.co,
            no2: row.no2,
            o3: row.o3,
            so2: row.so2
          },
          source: row.source
        }));
        resolve({ data, count: rows.length });
      }
    });
  });
}

function getLatestReading() {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT timestamp, aqi, main_pollutant, pm25, pm10, co, no2, o3, so2, source
      FROM readings
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
    `, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (!row) {
        resolve(null);
        return;
      }

      resolve({
        timestamp: row.timestamp,
        aqi: row.aqi,
        main_pollutant: row.main_pollutant,
        components: {
          pm2_5: row.pm25,
          pm10: row.pm10,
          co: row.co,
          no2: row.no2,
          o3: row.o3,
          so2: row.so2
        },
        source: row.source
      });
    });
  });
}

module.exports = { insertReading, getHistory, getLatestReading };
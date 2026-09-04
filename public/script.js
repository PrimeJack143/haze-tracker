const API_BASE = '';

let chart = null;
let refreshTimer = null;

const AQI_LEVELS = [
    { min: 0, max: 1, label: 'Good', color: '#22c55e' },
    { min: 2, max: 2, label: 'Fair', color: '#eab308' },
    { min: 3, max: 3, label: 'Moderate', color: '#f97316' },
    { min: 4, max: 4, label: 'Poor', color: '#ef4444' },
    { min: 5, max: 5, label: 'Very Poor', color: '#7c3aed' },
];

function getAqiColor(aqi) {
    const level = AQI_LEVELS.find(l => aqi >= l.min && aqi <= l.max);
    return level ? level.color : '#6b7280';
}

function getAqiLabel(aqi) {
    const level = AQI_LEVELS.find(l => aqi >= l.min && aqi <= l.max);
    return level ? level.label : 'Unknown';
}

const $ = id => document.getElementById(id);
const aqiCircle = $('aqiCircle');
const aqiNumber = $('aqiNumber');
const aqiLabel = $('aqiLabel');
const aqiTitle = $('aqiTitle');
const aqiDesc = $('aqiDesc');
const aqiMainPollutant = $('aqiMainPollutant');
const aqiUpdated = $('aqiUpdated');
const aqiSource = $('aqiSource');
const statusMessage = $('statusMessage');
const recordCount = $('recordCount');
const refreshBtn = $('refreshBtn');

async function fetchAll() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⟳ Loading …';
    try {
        const [currentRes, historyRes] = await Promise.all([
            fetch(`${API_BASE}/api/current`),
            fetch(`${API_BASE}/api/history?days=7`)
        ]);

        if (!currentRes.ok) throw new Error(`Current: ${currentRes.status}`);
        if (!historyRes.ok) throw new Error(`History: ${historyRes.status}`);

        const current = await currentRes.json();
        const history = await historyRes.json();

        if (current.error) throw new Error(current.error);
        renderCurrent(current);
        renderHistory(history.data || []);
        updateRecordCount(history.count || 0);

        statusMessage.textContent = '✅ Data updated ' + new Date().toLocaleTimeString();
        statusMessage.style.color = '#1f3a4b';

    } catch (err) {
        console.error(err);
        statusMessage.textContent = '⚠️ ' + err.message;
        statusMessage.style.color = '#b91c1c';
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '⟳ Refresh';
    }
}

function renderCurrent(d) {
    const aqi = d.aqi;
    const color = getAqiColor(aqi);
    const label = getAqiLabel(aqi);

    aqiCircle.style.background = color;
    aqiNumber.textContent = aqi;
    aqiLabel.textContent = 'AQI';

    aqiTitle.textContent = `${label} · AQI ${aqi}`;
    aqiDesc.textContent = d.desc || `Air quality is ${label.toLowerCase()}`;

    if (d.main_pollutant) {
        aqiMainPollutant.textContent = `☁️ Main: ${d.main_pollutant.toUpperCase()}`;
        aqiMainPollutant.style.display = 'inline-block';
    } else {
        aqiMainPollutant.style.display = 'none';
    }

    const ts = d.timestamp ? new Date(d.timestamp) : new Date();
    aqiUpdated.textContent = 'Updated ' + ts.toLocaleString();
    aqiSource.textContent = (d.source || 'owm').toUpperCase();

    const comps = d.components || {};
    const pMap = { pm2_5: 'p25', pm10: 'p10', co: 'co', no2: 'no2', o3: 'o3', so2: 'so2' };
    const maxVal = Math.max(
        comps.pm2_5 || 0,
        comps.pm10 || 0,
        comps.co || 0,
        comps.no2 || 0,
        comps.o3 || 0,
        comps.so2 || 0,
        1
    );

    for (const [key, elId] of Object.entries(pMap)) {
        const val = comps[key] ?? 0;
        const el = document.getElementById(elId);
        if (el) el.textContent = val.toFixed(1);
        const bar = document.getElementById(elId + 'Bar');
        if (bar) {
            const pct = Math.min((val / maxVal) * 100, 100);
            bar.style.width = pct + '%';
            bar.style.background = color;
        }
    }

    document.querySelectorAll('.pollutant-item .fill').forEach(b => {
        b.style.background = color;
    });
}

function renderHistory(data) {
    const ctx = document.getElementById('historyChart').getContext('2d');

    if (chart) {
        chart.destroy();
        chart = null;
    }

    if (!data || data.length === 0) {
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['No data'],
                datasets: [{
                    label: 'AQI',
                    data: [0],
                    borderColor: '#94a3b8',
                    backgroundColor: 'rgba(148,163,184,0.1)',
                    tension: 0.3,
                    pointRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { y: { min: 0, max: 6, ticks: { stepSize: 1 } } }
            }
        });
        return;
    }

    const sorted = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const labels = sorted.map(d => {
        const dt = new Date(d.timestamp);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const values = sorted.map(d => d.aqi);
    const colors = values.map(v => getAqiColor(v));

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'AQI (1–5)',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.08)',
                borderWidth: 2.5,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: colors,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed.y;
                            return `AQI ${val} — ${getAqiLabel(val)}`;
                        }
                    }
                }
            },
            scales: {
                y: { min: 0, max: 6, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } },
                x: { grid: { display: false }, ticks: { maxRotation: 30, font: { size: 11 } } }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function updateRecordCount(count) {
    recordCount.textContent = `📊 ${count} records in DB`;
}

fetchAll();

refreshTimer = setInterval(fetchAll, 30 * 60 * 1000);

refreshBtn.addEventListener('click', () => {
    fetchAll();
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        fetchAll();
    }
});

console.log('🌫️ Haze Tracker · Dangcagan');
console.log('📍 7.611107, 125.004850');
console.log('🔄 Refreshing every 30 min');

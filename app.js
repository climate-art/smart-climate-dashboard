/* app.js
   🌦️ Smart Climate & Weather Dashboard (Fixed Full Version)
   Features:
   - Detects location → fetches weather, air quality, and forecast
   - Fetches NOAA CO₂ and NASA temperature anomaly data
   - Dynamic sky background that changes with weather
   - Auto-refresh and manual refresh button
*/

const API_KEY = "88dee29d6d91d582598f8874f62f5ecd"; // Replace with your OpenWeatherMap key

// ------------------ Chart instances ------------------
let forecastChart = null;
let co2Chart = null;
let tempChart = null;

// ------------------ Utility helpers ------------------
function getWindDirection(deg) {
  if (deg === undefined || deg === null || Number.isNaN(deg)) return "--";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(((deg % 360) / 22.5));
  return dirs[idx % 16];
}

function getAQIStatus(aqi) {
  switch (aqi) {
    case 1: return "Good";
    case 2: return "Fair";
    case 3: return "Moderate";
    case 4: return "Poor";
    case 5: return "Very Poor";
    default: return "Unknown";
  }
}

function setAlert(message) {
  const alertsContainer = document.getElementById("alertsContainer");
  const el = document.createElement("div");
  el.className = "alert";
  el.innerText = message;
  alertsContainer.prepend(el);
  const children = alertsContainer.children;
  if (children.length > 6) alertsContainer.removeChild(children[children.length - 1]);
}

// ------------------ 🌤️ Dynamic Sky Background ------------------
function updateSky(weatherCondition) {
  const sky = document.getElementById("sky");
  if (!sky) return;
  sky.className = "sky-bg"; // reset classes

  if (!weatherCondition) return;
  const condition = weatherCondition.toLowerCase();

  if (condition.includes("clear")) {
    sky.classList.add("clear-sky");
  } else if (condition.includes("cloud")) {
    sky.classList.add("cloudy-sky");
  } else if (condition.includes("rain")) {
    sky.classList.add("rainy-sky");
  } else if (condition.includes("thunder")) {
    sky.classList.add("thunder-sky");
  } else if (condition.includes("fog") || condition.includes("mist") || condition.includes("haze")) {
    sky.classList.add("foggy-sky");
  } else {
    sky.classList.add("clear-sky");
  }
}

// ------------------ Location & Weather Data ------------------
async function detectLocationAndLoadAll() {
  document.getElementById("alertsContainer").innerHTML = "";
  const locName = document.getElementById("locationName");
  const locCoords = document.getElementById("locationCoords");

  if (!navigator.geolocation) {
    locName.textContent = "Geolocation not supported";
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      locCoords.textContent = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`;

      // Reverse geocode
      try {
        const geoRes = await fetch(
          `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${API_KEY}`
        );
        const geoJson = await geoRes.json();
        const city = geoJson[0]?.name || "Unknown";
        const country = geoJson[0]?.country || "";
        locName.textContent = `${city}${country ? ", " + country : ""}`;
      } catch {
        locName.textContent = "Location found";
      }

      // Fetch weather, AQI, forecast in parallel
      Promise.all([
        fetchWeather(latitude, longitude),
        fetchAirQuality(latitude, longitude),
        fetchForecast(latitude, longitude),
      ])
        .then(() => resolve())
        .catch(() => resolve());
    },
    (err) => {
      locName.textContent = "Location denied";
      setAlert("Location permission denied. Some features require location access.");
      resolve();
    },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
  });
}

// ------------------ Fetch Current Weather ------------------
async function fetchWeather(lat, lon) {
  const tempValue = document.getElementById("tempValue");
  const tempRange = document.getElementById("tempRange");
  const humidityValue = document.getElementById("humidityValue");
  const windValue = document.getElementById("windValue");
  const windDir = document.getElementById("windDir");

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
    );
    if (!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();

    tempValue.textContent = `${data.main.temp.toFixed(1)}°C`;
    tempRange.textContent = `Min: ${data.main.temp_min.toFixed(1)}°C | Max: ${data.main.temp_max.toFixed(1)}°C`;
    humidityValue.textContent = `${data.main.humidity}%`;

    const windKmh = (data.wind.speed * 3.6).toFixed(1);
    windValue.textContent = `${windKmh} km/h`;
    windDir.textContent = getWindDirection(data.wind.deg);

    const weatherDesc = data.weather?.[0]?.description || "";
    updateSky(weatherDesc);

    if (data.main.temp > 40) setAlert("High temperature alert — take precautions.");
    if (data.rain && data.rain["1h"] > 20) setAlert("Heavy rainfall in the past hour.");
  } catch (err) {
    console.error(err);
    tempValue.textContent = "Error loading weather";
    setAlert("Unable to fetch current weather.");
  }
}

// ------------------ Fetch Air Quality ------------------
async function fetchAirQuality(lat, lon) {
  const aqiValue = document.getElementById("aqiValue");
  const aqiStatus = document.getElementById("aqiStatus");
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
    );
    if (!res.ok) throw new Error("AQI fetch failed");
    const data = await res.json();
    const aqi = data.list?.[0]?.main?.aqi;
    if (aqi !== undefined) {
      aqiValue.textContent = aqi;
      aqiStatus.textContent = getAQIStatus(aqi);
      if (aqi >= 4) setAlert(`Air quality is poor (${getAQIStatus(aqi)}). Limit outdoor exposure.`);
    } else {
      aqiValue.textContent = "--";
      aqiStatus.textContent = "Unavailable";
    }
  } catch (err) {
    console.error(err);
    aqiValue.textContent = "--";
    aqiStatus.textContent = "Error";
    setAlert("Unable to fetch air quality data.");
  }
}

// ------------------ Forecast Chart ------------------
function destroyChartInstance(instance) {
  if (instance && typeof instance.destroy === "function") instance.destroy();
}

async function fetchForecast(lat, lon) {
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
    );
    if (!res.ok) throw new Error("Forecast fetch failed");
    const data = await res.json();

    const labels = [];
    const temps = [];
    for (let i = 0; i < data.list.length; i += 8) {
      const item = data.list[i];
      const dt = new Date(item.dt * 1000);
      labels.push(dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
      temps.push(Number(item.main.temp.toFixed(1)));
    }
    renderForecastChart(labels, temps);
  } catch (err) {
    console.error("Error loading forecast:", err);
    setAlert("Unable to fetch forecast data.");
  }
}

function renderForecastChart(labels, temps) {
  const ctx = document.getElementById("predictionChart").getContext("2d");
  destroyChartInstance(forecastChart);
  forecastChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Daily Temp (°C)",
        data: temps,
        borderColor: "#0077b6",
        backgroundColor: "rgba(0,119,182,0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true }, tooltip: { enabled: true } },
      scales: {
        y: { title: { display: true, text: "°C" } },
        x: { title: { display: true, text: "Day" } },
      },
    },
  });
}

// ------------------ ✅ Fixed CO₂ Data Fetch ------------------
async function fetchCO2Levels() {
  const url = "https://api.allorigins.win/raw?url=https://gml.noaa.gov/webdata/ccgg/trends/co2_weekly_mlo.csv";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("CO₂ CSV fetch failed");
    const txt = await res.text();

    const lines = txt.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    const labels = [];
    const data = [];

    const lastN = 52;
    const start = Math.max(0, lines.length - lastN);

    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(/[\s,]+/);
      const date = cols[2];
      const ppm = parseFloat(cols[3]);
      if (!Number.isNaN(ppm)) {
        labels.push(date);
        data.push(ppm);
      }
    }

    if (labels.length && data.length) {
      renderCO2Chart(labels, data);
    } else {
      console.warn("No CO₂ data parsed");
      setAlert("CO₂ data unavailable or malformed.");
    }
  } catch (err) {
    console.error("CO₂ fetch error:", err);
    setAlert("Unable to fetch CO₂ data (CORS/network issue).");
  }
}

function renderCO2Chart(labels, data) {
  const ctx = document.getElementById("co2Chart").getContext("2d");
  destroyChartInstance(co2Chart);
  co2Chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "CO₂ (ppm)", data, borderColor: "#e63946", fill: true, tension: 0.25 }],
    },
    options: { responsive: true, plugins: { legend: { display: true } } },
  });
}

// ------------------ ✅ Fixed NASA Temperature Fetch ------------------
async function fetchTemperatureTrend() {
  const url = "https://api.allorigins.win/raw?url=https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("NASA CSV fetch failed");
    const txt = await res.text();

    const rows = txt.split("\n").map(r => r.trim()).filter(r => /^\d{4},/.test(r));
    const lastN = 30;
    const slice = rows.slice(-lastN);
    const labels = [];
    const data = [];
    for (const row of slice) {
      const cols = row.split(",");
      const year = cols[0];
      const annual = parseFloat(cols[13]);
      if (!Number.isNaN(annual)) {
        labels.push(year);
        data.push(annual);
      }
    }
    renderTemperatureChart(labels, data);
  } catch (err) {
    console.error("Temperature fetch error:", err);
    setAlert("Unable to fetch temperature anomaly data.");
  }
}

function renderTemperatureChart(labels, data) {
  const ctx = document.getElementById("temperatureChart").getContext("2d");
  destroyChartInstance(tempChart);
  tempChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Global Temp Anomaly (°C)",
        data,
        backgroundColor: data.map(v => v >= 0 ? "rgba(244,67,54,0.8)" : "rgba(33,150,243,0.8)"),
      }],
    },
    options: { responsive: true, plugins: { legend: { display: true } } },
  });
}

// ------------------ Refresh Logic ------------------
function updateLastUpdated() {
  const el = document.getElementById("lastUpdated");
  el.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

function setRefreshButtonState(disabled) {
  const btn = document.getElementById("refreshBtn");
  if (!btn) return;
  btn.innerHTML = disabled
    ? '<i class="fas fa-sync fa-spin"></i> Refreshing...'
    : '<i class="fas fa-sync-alt"></i> Refresh Data';
  btn.disabled = disabled;
}

async function refreshAllData() {
  setRefreshButtonState(true);
  await detectLocationAndLoadAll();
  await Promise.all([fetchCO2Levels(), fetchTemperatureTrend()]);
  updateLastUpdated();
  setRefreshButtonState(false);
}

function startAutoRefresh() {
  setInterval(() => refreshAllData().catch(console.error), 5 * 60 * 1000);
}

// ------------------ Initialize ------------------
document.addEventListener("DOMContentLoaded", () => {
  refreshAllData();
  startAutoRefresh();
  document.getElementById("refreshBtn")?.addEventListener("click", () => refreshAllData());
});





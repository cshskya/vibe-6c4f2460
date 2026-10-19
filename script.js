const API_BASE =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

const STORAGE_KEY = "kmaWeatherServiceKey";

const citySelect = document.querySelector("#citySelect");
const searchButton = document.querySelector("#searchButton");
const locationButton = document.querySelector("#locationButton");
const statusMessage = document.querySelector("#statusMessage");
const weatherContent = document.querySelector("#weatherContent");
const apiNotice = document.querySelector("#apiNotice");

const settingsModal = document.querySelector("#settingsModal");
const apiKeyInput = document.querySelector("#apiKeyInput");
const openSettingsButton = document.querySelector("#openSettingsButton");
const noticeSettingsButton = document.querySelector("#noticeSettingsButton");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const saveKeyButton = document.querySelector("#saveKeyButton");
const deleteKeyButton = document.querySelector("#deleteKeyButton");
const toggleKeyButton = document.querySelector("#toggleKeyButton");

let currentLocationName = "서울";

document.addEventListener("DOMContentLoaded", initializeApp);
searchButton.addEventListener("click", searchSelectedCity);
locationButton.addEventListener("click", searchCurrentLocation);
openSettingsButton.addEventListener("click", openSettings);
noticeSettingsButton.addEventListener("click", openSettings);
closeSettingsButton.addEventListener("click", closeSettings);
saveKeyButton.addEventListener("click", saveApiKey);
deleteKeyButton.addEventListener("click", deleteApiKey);
toggleKeyButton.addEventListener("click", toggleApiKeyVisibility);

document.querySelector("[data-close-modal]").addEventListener("click", closeSettings);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSettings();
  }
});

function initializeApp() {
  updateApiNotice();

  if (!getApiKey()) {
    openSettings();
  }
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY)?.trim() || "";
}

function updateApiNotice() {
  apiNotice.classList.toggle("hidden", Boolean(getApiKey()));
}

function openSettings() {
  apiKeyInput.value = getApiKey();
  settingsModal.classList.remove("hidden");
  settingsModal.setAttribute("aria-hidden", "false");
  apiKeyInput.focus();
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  settingsModal.setAttribute("aria-hidden", "true");
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();

  if (!key) {
    alert("기상청 API 인증키를 입력해주세요.");
    return;
  }

  localStorage.setItem(STORAGE_KEY, key);
  updateApiNotice();
  closeSettings();
  setStatus("인증키가 저장되었습니다. 이제 날씨를 조회할 수 있어요.", "success");
}

function deleteApiKey() {
  localStorage.removeItem(STORAGE_KEY);
  apiKeyInput.value = "";
  updateApiNotice();
  weatherContent.classList.add("hidden");
  setStatus("저장된 인증키를 삭제했습니다.", "");
}

function toggleApiKeyVisibility() {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleKeyButton.textContent = isPassword ? "숨기기" : "보기";
}

async function searchSelectedCity() {
  const [nx, ny, name] = citySelect.value.split(",");
  currentLocationName = name;
  await loadWeather(Number(nx), Number(ny), name);
}

function searchCurrentLocation() {
  if (!getApiKey()) {
    setStatus("먼저 기상청 API 인증키를 등록해주세요.", "error");
    openSettings();
    return;
  }

  if (!navigator.geolocation) {
    setStatus("현재 환경에서는 위치 기능을 사용할 수 없습니다.", "error");
    return;
  }

  setStatus("현재 위치를 확인하고 있습니다…", "loading");
  setButtonsLoading(true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const grid = convertToGrid(latitude, longitude);

      currentLocationName = "현재 위치";

      try {
        await loadWeather(grid.nx, grid.ny, "현재 위치");
      } finally {
        setButtonsLoading(false);
      }
    },
    (error) => {
      setButtonsLoading(false);

      const messages = {
        1: "위치 권한이 거부되었습니다. 권한을 허용하거나 도시를 선택해주세요.",
        2: "현재 위치를 확인할 수 없습니다.",
        3: "위치 확인 시간이 초과되었습니다."
      };

      setStatus(messages[error.code] || "위치를 가져오지 못했습니다.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

async function loadWeather(nx, ny, locationName) {
  const apiKey = getApiKey();

  if (!apiKey) {
    setStatus("먼저 기상청 API 인증키를 등록해주세요.", "error");
    openSettings();
    return;
  }

  setButtonsLoading(true);
  setStatus(`${locationName}의 기상청 자료를 불러오는 중입니다…`, "loading");

  try {
    const [currentItems, forecastResult] = await Promise.all([
      fetchCurrentWeather(apiKey, nx, ny),
      fetchForecast(apiKey, nx, ny)
    ]);

    renderCurrentWeather(currentItems, locationName);
    renderForecast(forecastResult.items, forecastResult.base);
    weatherContent.classList.remove("hidden");

    setStatus(`${locationName} 날씨를 불러왔습니다.`, "success");
  } catch (error) {
    console.error(error);
    weatherContent.classList.add("hidden");
    setStatus(createFriendlyError(error), "error");
  } finally {
    setButtonsLoading(false);
  }
}

async function fetchCurrentWeather(apiKey, nx, ny) {
  const base = getUltraShortBaseTime();

  return requestWeatherApi(
    "getUltraSrtNcst",
    apiKey,
    nx,
    ny,
    base.date,
    base.time
  );
}

async function fetchForecast(apiKey, nx, ny) {
  const baseCandidates = getForecastBaseCandidates();
  let lastError;

  for (const base of baseCandidates) {
    try {
      const items = await requestWeatherApi(
        "getVilageFcst",
        apiKey,
        nx,
        ny,
        base.date,
        base.time
      );

      if (items.length > 0) {
        return { items, base };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("단기예보 자료가 아직 발표되지 않았습니다.");
}

async function requestWeatherApi(
  endpoint,
  apiKey,
  nx,
  ny,
  baseDate,
  baseTime
) {
  const params = new URLSearchParams({
    serviceKey: normalizeApiKey(apiKey),
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny)
  });

  const response = await fetch(`${API_BASE}/${endpoint}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`기상청 서버 요청 실패 (${response.status})`);
  }

  const data = await response.json();
  const header = data?.response?.header;

  if (!header) {
    throw new Error("기상청 응답 형식을 확인할 수 없습니다.");
  }

  if (header.resultCode !== "00") {
    throw new Error(
      `기상청 API 오류: ${header.resultMsg || header.resultCode}`
    );
  }

  const items = data?.response?.body?.items?.item;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("조회된 기상 자료가 없습니다.");
  }

  return items;
}

function normalizeApiKey(key) {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function renderCurrentWeather(items, locationName) {
  const values = {};

  items.forEach((item) => {
    values[item.category] = item.obsrValue;
  });

  const precipitation = getPrecipitationInfo(values.PTY);
  const temperature = values.T1H ?? "--";

  document.querySelector("#locationName").textContent = locationName;
  document.querySelector("#currentTemperature").textContent = `${temperature}°`;
  document.querySelector("#weatherDescription").textContent =
    precipitation.type === "없음" ? "현재 날씨" : precipitation.type;
  document.querySelector("#weatherIcon").textContent = precipitation.icon;
  document.querySelector("#humidity").textContent = `${values.REH ?? "--"}%`;
  document.querySelector("#windSpeed").textContent = `${values.WSD ?? "--"} m/s`;
  document.querySelector("#precipitationType").textContent = precipitation.type;
  document.querySelector("#rainAmount").textContent =
    `1시간 강수량 ${formatRainAmount(values.RN1)}`;
  document.querySelector("#updatedTime").textContent =
    `${formatNow()} 기준 · 기상청 관측`;
}

function renderForecast(items, base) {
  const grouped = {};

  items.forEach((item) => {
    const key = `${item.fcstDate}-${item.fcstTime}`;

    if (!grouped[key]) {
      grouped[key] = {
        date: item.fcstDate,
        time: item.fcstTime
      };
    }

    grouped[key][item.category] = item.fcstValue;
  });

  const nowNumber = Number(formatKoreaDateTime(new Date()));
  const forecasts = Object.values(grouped)
    .filter((item) => Number(`${item.date}${item.time}`) >= nowNumber)
    .filter((item) => item.TMP !== undefined)
    .sort((a, b) => {
      return Number(`${a.date}${a.time}`) - Number(`${b.date}${b.time}`);
    })
    .slice(0, 12);

  const forecastList = document.querySelector("#forecastList");
  forecastList.innerHTML = "";

  if (forecasts.length === 0) {
    forecastList.innerHTML =
      '<p class="status-message">표시할 시간대별 예보가 없습니다.</p>';
    return;
  }

  forecasts.forEach((forecast) => {
    const weather = getForecastWeather(forecast);
    const card = document.createElement("article");
    card.className = "forecast-item";

    card.innerHTML = `
      <p class="forecast-date">${formatForecastDate(forecast.date)}</p>
      <p class="forecast-time">${formatForecastTime(forecast.time)}</p>
      <div class="forecast-icon" title="${weather.description}">
        ${weather.icon}
      </div>
      <p class="forecast-temp">${forecast.TMP}°</p>
      <p class="forecast-rain">강수 ${forecast.POP ?? 0}%</p>
    `;

    forecastList.appendChild(card);
  });

  document.querySelector("#forecastBaseTime").textContent =
    `발표 ${formatForecastDate(base.date)} ${formatForecastTime(base.time)}`;
}

function getForecastWeather(forecast) {
  const precipitation = getPrecipitationInfo(forecast.PTY);

  if (Number(forecast.PTY) > 0) {
    return {
      icon: precipitation.icon,
      description: precipitation.type
    };
  }

  const sky = Number(forecast.SKY);

  if (sky === 1) {
    return { icon: "☀️", description: "맑음" };
  }

  if (sky === 3) {
    return { icon: "🌤️", description: "구름 많음" };
  }

  if (sky === 4) {
    return { icon: "☁️", description: "흐림" };
  }

  return { icon: "🌡️", description: "날씨" };
}

function getPrecipitationInfo(value) {
  const types = {
    0: { type: "없음", icon: "☀️" },
    1: { type: "비", icon: "🌧️" },
    2: { type: "비 또는 눈", icon: "🌨️" },
    3: { type: "눈", icon: "❄️" },
    4: { type: "소나기", icon: "🌦️" },
    5: { type: "빗방울", icon: "🌦️" },
    6: { type: "빗방울 또는 눈날림", icon: "🌨️" },
    7: { type: "눈날림", icon: "❄️" }
  };

  return types[Number(value)] || types[0];
}

function formatRainAmount(value) {
  if (value === undefined || value === null || value === "") {
    return "--";
  }

  const text = String(value).trim();

  if (text === "강수없음" || text === "0" || text === "0.0") {
    return "없음";
  }

  if (text.includes("mm")) {
    return text;
  }

  return `${text} mm`;
}

function getUltraShortBaseTime() {
  const koreaNow = getKoreaDate();

  if (koreaNow.getUTCMinutes() < 40) {
    koreaNow.setUTCHours(koreaNow.getUTCHours() - 1);
  }

  return {
    date: formatDateFromKoreaDate(koreaNow),
    time: `${pad(koreaNow.getUTCHours())}00`
  };
}

function getForecastBaseCandidates() {
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const koreaNow = getKoreaDate();
  const availableTime = new Date(koreaNow.getTime() - 20 * 60 * 1000);
  const candidates = [];

  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const date = new Date(availableTime);
    date.setUTCDate(date.getUTCDate() - dayOffset);

    for (const hour of [...baseHours].reverse()) {
      const candidate = new Date(date);
      candidate.setUTCHours(hour, 0, 0, 0);

      if (candidate <= availableTime) {
        candidates.push({
          date: formatDateFromKoreaDate(candidate),
          time: `${pad(hour)}00`
        });
      }
    }
  }

  return candidates.slice(0, 4);
}

function getKoreaDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function formatKoreaDateTime(date) {
  const koreaDate = getKoreaDate(date);

  return (
    formatDateFromKoreaDate(koreaDate) +
    pad(koreaDate.getUTCHours()) +
    pad(koreaDate.getUTCMinutes())
  );
}

function formatDateFromKoreaDate(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate())
  );
}

function formatNow() {
  const date = getKoreaDate();

  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;
}

function formatForecastDate(dateText) {
  const month = Number(dateText.slice(4, 6));
  const day = Number(dateText.slice(6, 8));
  const date = new Date(
    Date.UTC(
      Number(dateText.slice(0, 4)),
      month - 1,
      day
    )
  );

  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "UTC"
  }).format(date);

  return `${month}/${day} ${weekday}`;
}

function formatForecastTime(timeText) {
  return `${timeText.slice(0, 2)}:${timeText.slice(2, 4)}`;
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

function setButtonsLoading(isLoading) {
  searchButton.disabled = isLoading;
  locationButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "조회 중…" : "날씨 조회";
}

function createFriendlyError(error) {
  const message = error?.message || "";

  if (
    message.includes("SERVICE_KEY") ||
    message.includes("인증") ||
    message.includes("등록되지 않은")
  ) {
    return "인증키를 확인해주세요. 일반 인증키(Decoding)를 사용하는 것이 좋습니다.";
  }

  if (message.includes("NO_DATA") || message.includes("자료가 없습니다")) {
    return "해당 시각의 기상 자료가 아직 준비되지 않았습니다. 잠시 후 다시 조회해주세요.";
  }

  return message || "날씨를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
}

/*
 * 위도·경도를 기상청 격자 좌표(nx, ny)로 변환합니다.
 * 기상청 공식 DFS 좌표 변환 공식을 사용합니다.
 */
function convertToGrid(latitude, longitude) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);

  sn =
    Math.log(Math.cos(slat1) / Math.cos(slat2)) /
    Math.log(sn);

  let sf =
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);

  sf =
    (Math.pow(sf, sn) * Math.cos(slat1)) /
    sn;

  let ro =
    Math.tan(Math.PI * 0.25 + olat * 0.5);

  ro = (re * sf) / Math.pow(ro, sn);

  let ra =
    Math.tan(Math.PI * 0.25 + latitude * DEGRAD * 0.5);

  ra = (re * sf) / Math.pow(ra, sn);

  let theta = longitude * DEGRAD - olon;

  if (theta > Math.PI) {
    theta -= 2.0 * Math.PI;
  }

  if (theta < -Math.PI) {
    theta += 2.0 * Math.PI;
  }

  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
}
'use strict';

// ===== 地圖範圍：西北太平洋（全球颱風最活躍的海域） =====
const LON0 = 105, LON1 = 150, LAT0 = 8, LAT1 = 38;
const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const W = 960;
const H = Math.round(W * (merc(LAT1) - merc(LAT0)) / ((LON1 - LON0) * Math.PI / 180) / 2) * 2;
const CELL = 2;                  // 環境格點大小 (px)
const GW = W / CELL, GH = H / CELL;
const lonToX = lon => (lon - LON0) / (LON1 - LON0) * W;
const latToY = lat => (merc(LAT1) - merc(lat)) / (merc(LAT1) - merc(LAT0)) * H;
const xToLon = x => LON0 + x / W * (LON1 - LON0);
const yToLat = y => {
  const m = merc(LAT1) - y / H * (merc(LAT1) - merc(LAT0));
  return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI;
};
const CELL_LON = Float32Array.from({ length: GW }, (_, x) => xToLon((x + 0.5) * CELL));
const CELL_LAT = Float32Array.from({ length: GH }, (_, y) => yToLat((y + 0.5) * CELL));

// ===== 遊戲規則 =====
const MAX_DAYS = 12;             // 颱風壽命上限
const PX_PER_DEG = W / (LON1 - LON0);
// 颱風移動速度由駛流決定（px/天，1 px 約 5 公里）：順著駛流快，逆著走很慢
const SELF_SPEED = 55, MIN_SPEED = 20, MAX_SPEED = 170;
const WARN_R = 200;              // 颱風距離多近（px，約 1000 公里）各地開始防颱準備
const PREP_RATE = 0.3;           // 防颱準備進度（每天）
const PREP_CUT = 0.4;            // 準備完成時減少的損害比例
const STAR_DAYS = 8;             // 三星條件：幾天內完成任務
const START_I = 18;              // 生成時風速 (m/s)
const DEAD_I = 10;               // 低於此風速即消散
const MAX_I = 85;
const GENESIS = { lon0: 125, lon1: 150, lat0: 8, lat1: 22 };   // 颱風生成區
const TARGET_COUNT = 3;
const TARGET_SPREAD = 520;       // 任務目標彼此最遠距離 (px)，確保壽命內到得了

// [名稱, 經度, 緯度, 耐久度]：大城市防災建設較好，需要更強的颱風
const CITIES = [
  ['台北', 121.56, 25.04, 140], ['高雄', 120.30, 22.62, 120], ['馬尼拉', 120.98, 14.60, 130],
  ['宿霧', 123.90, 10.31, 100], ['香港', 114.17, 22.30, 150], ['廈門', 118.09, 24.48, 110],
  ['溫州', 120.70, 28.00, 100], ['上海', 121.47, 31.23, 150], ['那霸', 127.68, 26.21, 90],
  ['鹿兒島', 130.56, 31.60, 100], ['大阪', 135.50, 34.69, 130], ['東京', 139.69, 35.69, 140],
  ['釜山', 129.08, 35.18, 120], ['首爾', 126.98, 37.57, 140], ['海口', 110.35, 20.02, 100],
  ['峴港', 108.22, 16.05, 100], ['關島', 144.79, 13.44, 80],
];

// 主要山脈 [經度1, 緯度1, 經度2, 緯度2, 高度, 寬度(度)]
const RIDGES = [
  [120.8, 22.2, 121.6, 24.9, 1.0, 0.3],    // 台灣中央山脈
  [120.9, 16.0, 121.0, 18.3, 0.8, 0.45],   // 呂宋 科迪勒拉山脈
  [121.6, 15.0, 122.2, 18.0, 0.6, 0.35],   // 呂宋 馬德雷山脈
  [109.4, 18.7, 109.9, 19.1, 0.6, 0.4],    // 海南 五指山
  [116.5, 25.3, 118.8, 28.2, 0.6, 0.8],    // 武夷山
  [110.0, 25.2, 115.0, 25.0, 0.5, 0.8],    // 南嶺
  [105.5, 19.0, 108.2, 14.8, 0.7, 0.7],    // 長山山脈
  [128.4, 38.0, 129.2, 36.2, 0.6, 0.5],    // 太白山脈
  [136.8, 34.8, 138.6, 36.9, 1.0, 0.6],    // 日本阿爾卑斯
  [130.8, 31.8, 131.3, 33.2, 0.6, 0.4],    // 九州山地
  [132.6, 33.5, 134.2, 33.9, 0.6, 0.35],   // 四國山地
  [124.5, 7.5, 125.5, 9.5, 0.6, 0.6],      // 民答那峨
];

// 黑潮暖流路徑 [經度, 緯度]
const KUROSHIO = [[121.5, 19], [122.3, 23], [123.5, 25.5], [127, 28.5], [130.5, 30.5], [134, 32.8], [138, 34], [143, 35.5]];

const REGION_LABELS = [
  ['中國', 112, 28], ['越南', 106.2, 14.2], ['菲律賓', 122.8, 12.5], ['日本', 138.8, 37.3], ['韓國', 127.9, 36.7],
  ['南海', 114, 15], ['東海', 125.2, 30.5], ['菲律賓海', 131, 19], ['西北太平洋', 142, 28],
];

const $ = id => document.getElementById(id);
const canvas = $('map');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

// ===== 亂數與雜訊 =====
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeNoise(rand) {
  const N = 256, v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  const at = (x, y) => v[(y & 255) * N + (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}

function fbm(noise, x, y, oct) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * noise(x * f, y * f);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.floor(p * (s.length - 1))];
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ===== 地理環境 =====
function traceRings(g, rings, scale) {
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) {
      const x = lonToX(r[k]) * scale, y = latToY(r[k + 1]) * scale;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }
}

function traceLand(g, scale) {
  g.beginPath();
  traceRings(g, LAND_RINGS, scale);
}

let landMask = null;
function rasterizeLand() {
  if (landMask) return landMask;
  const c = document.createElement('canvas');
  c.width = GW; c.height = GH;
  const g = c.getContext('2d');
  traceLand(g, 1 / CELL);
  g.fill('evenodd');
  const d = g.getImageData(0, 0, GW, GH).data;
  landMask = new Uint8Array(GW * GH);
  for (let i = 0; i < landMask.length; i++) landMask[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  return landMask;
}

// 行政區格點化：id[i] = 行政區索引（-1 為無），cells[k] = 該行政區的格點
let regionMap = null;
function rasterizeRegions(land) {
  if (regionMap) return regionMap;
  const id = new Int16Array(GW * GH).fill(-1);
  REGIONS.forEach((reg, k) => {
    const edges = [];
    let y0 = Infinity, y1 = -Infinity;
    for (const r of reg.r) {
      const m = r.length / 2;
      for (let j = 0; j < m; j++) {
        const a = j * 2, b = (j + 1) % m * 2;
        const ax = lonToX(r[a]) / CELL, ay = latToY(r[a + 1]) / CELL;
        const bx = lonToX(r[b]) / CELL, by = latToY(r[b + 1]) / CELL;
        if (ay === by) continue;
        edges.push([ax, ay, bx, by]);
        y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
      }
    }
    // 掃描線填色（奇偶規則）
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(GH - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5, xs = [];
      for (const [ax, ay, bx, by] of edges)
        if ((ay <= yc) !== (by <= yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
      xs.sort((p, q) => p - q);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        const xa = Math.max(0, Math.ceil(xs[j] - 0.5)), xb = Math.min(GW - 1, Math.floor(xs[j + 1] - 0.5));
        for (let x = xa; x <= xb; x++) id[y * GW + x] = k;
      }
    }
  });
  // 兩份資料的海岸線精度不同：沒落在任何行政區的陸地，歸給最近的行政區
  const queue = [];
  for (let i = 0; i < id.length; i++) if (id[i] >= 0) queue.push(i);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % GW, y = (i - x) / GW;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const j = ny * GW + nx;
      if (id[j] < 0 && land[j]) { id[j] = id[i]; queue.push(j); }
    }
  }
  const cells = REGIONS.map(() => []);
  for (let i = 0; i < id.length; i++) if (id[i] >= 0) cells[id[i]].push(i);
  const cx = cells.map(c => c.reduce((a, i) => a + (i % GW + 0.5) * CELL, 0) / (c.length || 1));
  const cy = cells.map(c => c.reduce((a, i) => a + (Math.floor(i / GW) + 0.5) * CELL, 0) / (c.length || 1));
  regionMap = { id, cells, cx, cy };
  return regionMap;
}

// fromLand=false：陸地格點到海岸的距離；true：海洋格點到陸地的距離（格數）
function coastDistance(land, fromLand = false) {
  const dist = new Int32Array(GW * GH).fill(-1), queue = [];
  for (let i = 0; i < land.length; i++) if (!land[i] !== fromLand) { dist[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % GW, y = (i - x) / GW;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const j = ny * GW + nx;
      if (dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
    }
  }
  return dist;
}

// 颱風季（8~9 月）海溫氣候值
function climateSst(lon, lat) {
  let s = lat <= 18 ? 29.6 : 29.6 - (lat - 18) * 0.22;
  let dk = Infinity;
  for (let k = 1; k < KUROSHIO.length; k++)
    dk = Math.min(dk, distToSegment(lon, lat, ...KUROSHIO[k - 1], ...KUROSHIO[k]));
  s += 1.4 * Math.exp(-((dk / 1.3) ** 2));                                         // 黑潮暖流
  s += 0.6 * Math.exp(-(((lon - 140) / 12) ** 2 + ((lat - 14) / 7) ** 2));        // 西太平洋暖池
  s -= 1.6 * Math.exp(-(((lon - 110) / 1.5) ** 2 + ((lat - 12) / 2) ** 2));       // 越南外海湧升流
  if (lon < 125 && lat > 28) s -= (lat - 28) * 0.12;                               // 東海、黃海較冷
  return s;
}

function ridgeHeight(lon, lat) {
  let h = 0;
  for (const [x1, y1, x2, y2, height, width] of RIDGES)
    h = Math.max(h, height * Math.exp(-((distToSegment(lon, lat, x1, y1, x2, y2) / width) ** 2)));
  return h;
}

// land: 陸地 / elev: 地形高度 0~1 / sst: 海溫 °C / shear: 垂直風切 0~1 / wake: 冷水尾跡降溫 °C
function genWorld(seed) {
  const rand = mulberry32(seed);
  const nS = makeNoise(rand), nE = makeNoise(rand);
  const n = GW * GH;
  const land = rasterizeLand();
  const dist = coastDistance(land);
  const sst = new Float32Array(n), elev = new Float32Array(n), relief = new Float32Array(n);
  const ox = rand() * 100, oy = rand() * 100;

  for (let y = 0; y < GH; y++) {
    const lat = CELL_LAT[y];
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x, lon = CELL_LON[x];
      if (land[i]) {
        const base = Math.min(dist[i] / 40, 1) * 0.45 * (0.6 + 0.8 * fbm(nE, x * 0.03, y * 0.03, 3));
        const rugged = 0.45 + 0.9 * fbm(nE, x * 0.07 + 50, y * 0.07, 4);   // 讓山脈有起伏，不是一整條
        relief[i] = ridgeHeight(lon, lat) * rugged;
        elev[i] = clamp(Math.max(base, relief[i]), 0, 1);
      } else {
        // 氣候值加上每局固定的小幅異常；會移動的暖、冷渦旋另外由天氣系統計算
        sst[i] = climateSst(lon, lat) + (fbm(nS, ox + x * 0.01, oy + y * 0.01, 3) - 0.5) * 1.6;
      }
    }
  }

  const cities = CITIES.map(([name, lon, lat, hp]) => ({
    name, x: lonToX(lon), y: latToY(lat), lon, lat, maxHp: hp, hp, hitT: 0, target: false,
  }));
  if (mode === 'mission') pickTargets(cities, rand);
  rasterizeRegions(land);
  return {
    seed, land, elev, relief, sst, cities,
    weather: genWeather(rand),
    wake: new Float32Array(n),
    cellDmg: new Float32Array(n),                    // 每格累積破壞 0~1
    regionSum: new Float32Array(REGIONS.length),     // 每個行政區的累積破壞
    regionLevel: new Int8Array(REGIONS.length),      // 每個行政區的災情等級 0~5
    prep: new Float32Array(REGIONS.length),          // 每個行政區的防颱準備 0~1
  };
}

function inGenesis(lon, lat) {
  return lon >= GENESIS.lon0 && lon <= GENESIS.lon1 && lat >= GENESIS.lat0 && lat <= GENESIS.lat1;
}

// 任務目標：挑 3 座彼此距離夠近、颱風壽命內到得了的城市
function pickTargets(cities, rand) {
  const pool = cities.filter(c => !inGenesis(c.lon, c.lat));
  for (let tries = 0; tries < 500; tries++) {
    const picks = shuffle(pool.slice(), rand).slice(0, TARGET_COUNT);
    const ok = picks.every(a => picks.every(b => Math.hypot(a.x - b.x, a.y - b.y) <= TARGET_SPREAD));
    if (ok) { picks.forEach(c => { c.target = true; }); return; }
  }
}

function cellIndex(x, y) {
  return clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);
}

// t：第幾天；actual：true 為實際天氣，false 為預報
function envAt(x, y, t, actual) {
  const i = cellIndex(x, y), lon = xToLon(x), lat = yToLat(y);
  return {
    land: !!world.land[i], elev: world.elev[i], shear: shearAt(lon, lat, t, actual),
    sst: world.sst[i] + sstAnomaly(lon, lat, t, actual) - world.wake[i], wake: world.wake[i], lon, lat,
    region: regionMap.id[i],
  };
}

// ===== 動態天氣系統 =====
// 每個系統都有「預報」參數與「實際」誤差；誤差隨時間放大，越遠的預報越不準
function genWeather(rand) {
  const R = (a, b) => a + rand() * (b - a);
  const err = sd => (rand() + rand() + rand() - 1.5) * sd * 2;   // 近似常態分布
  const systems = [];
  const add = (kind, lon, lat, vlon, vlat, r, amp, t0, t1) => systems.push({
    kind, lon, lat, vlon, vlat, r, amp, t0, t1,
    err: { vlon: err(0.4), vlat: err(0.25), amp: err(0.3), t0: t0 > 0 ? err(1) : 0 },
  });
  // 強風切區（高空冷心低壓、槽線等）：熱帶向西移，中緯度隨西風向東移
  for (let k = 0; k < 7; k++) {
    const lat = R(12, 34);
    const t0 = k < 4 ? R(-6, 0) : R(1, 8);     // 一部分開局就在，一部分之後才生成
    add('shear', R(112, 150), lat, lat > 26 ? R(1, 3) : R(-2.5, -0.5), R(-0.6, 0.6),
      R(2.5, 5), R(0.6, 1.1), t0, t0 + R(5, 11));
  }
  // 暖水／冷水渦旋：緩慢漂移的海溫異常
  for (let k = 0; k < 8; k++) {
    const sign = k % 2 ? -1 : 1;
    add(sign > 0 ? 'warm' : 'cold', R(112, 150), R(10, 34), R(-0.6, 0.2), R(-0.3, 0.3),
      R(2, 4), sign * R(0.8, 1.6), R(-8, 0), R(8, 20));
  }
  // 西風帶南緣隨時間南北擺動
  const westerly = { base: 29, period: R(6, 10), phase: R(0, Math.PI * 2), err: { base: err(0.8), phase: err(0.5) } };
  // 太平洋高壓西緣隨時間東西伸縮，決定颱風在哪裡轉向北上
  const high = { west: R(124, 134), period: R(5, 9), phase: R(0, Math.PI * 2), err: { west: err(2.5), phase: err(0.5) } };
  return { systems, westerly, high };
}

const forecastGrowth = t => clamp(t / 6, 0, 1);

function sysState(s, t, actual) {
  const e = actual ? s.err : null, g = forecastGrowth(t);
  const t0 = s.t0 + (e ? e.t0 : 0);
  const fade = clamp(Math.min(t - t0, s.t1 - t), 0, 1);   // 生成與消散各漸變 1 天
  if (fade <= 0) return null;
  const vlon = s.vlon + (e ? e.vlon : 0), vlat = s.vlat + (e ? e.vlat : 0);
  return {
    lon: s.lon + vlon * t, lat: s.lat + vlat * t, r: s.r, vlon, vlat,
    amp: s.amp * (1 + (e ? e.amp * g : 0)) * fade,
  };
}

function westerlyEdge(t, actual) {
  const w = world.weather.westerly, g = actual ? forecastGrowth(t) : 0;
  return w.base + w.err.base * g + 2.5 * Math.sin(2 * Math.PI * t / w.period + w.phase + w.err.phase * g);
}

// 某個時間點所有作用中的天氣系統（繪圖時對大量格點重複使用）
function activeWeather(t, actual) {
  const shear = [], eddies = [];
  for (const sys of world.weather.systems) {
    const st = sysState(sys, t, actual);
    if (st) (sys.kind === 'shear' ? shear : eddies).push(st);
  }
  return { shear, eddies, edge: westerlyEdge(t, actual) };
}

const gauss = (s, lon, lat) => s.amp * Math.exp(-((lon - s.lon) ** 2 + (lat - s.lat) ** 2) / (s.r * s.r));

function shearFrom(S, lon, lat) {
  let v = clamp((lat - S.edge) / 8, 0, 1) * 0.45;
  for (const s of S.shear) v += gauss(s, lon, lat);
  return clamp(v, 0, 1);
}

function highWest(t, actual) {
  const h = world.weather.high, g = actual ? forecastGrowth(t) : 0;
  return h.west + h.err.west * g + 5 * Math.sin(2 * Math.PI * t / h.period + h.phase + h.err.phase * g);
}

// 駛流（度/天）：高壓南側吹東風把颱風往西推，西風帶往東，高壓西緣把颱風往北帶
function steerAt(lon, lat, t, actual) {
  const s = smoothstep(-3, 3, lat - (westerlyEdge(t, actual) - 4));
  return {
    u: -3.5 + 7.5 * s,
    v: 1.2 + 2.4 * Math.exp(-(((lon - highWest(t, actual)) / 7) ** 2)) * (1 - 0.5 * s),
  };
}

// 沿著方向 (dx, dy)（px 單位向量，y 向下）移動的速度
function moveSpeed(steer, dx, dy) {
  const along = (steer.u * dx - steer.v * dy) * PX_PER_DEG;
  return clamp(SELF_SPEED + along * 0.9, MIN_SPEED, MAX_SPEED);
}

const DIRS = ['東', '東北', '北', '西北', '西', '西南', '南', '東南'];
function dirName(u, v) {
  return DIRS[(Math.round(Math.atan2(v, u) / (Math.PI / 4)) + 8) % 8];
}

function shearAt(lon, lat, t, actual) {
  return shearFrom(activeWeather(t, actual), lon, lat);
}

function sstAnomaly(lon, lat, t, actual) {
  return activeWeather(t, actual).eddies.reduce((a, e) => a + gauss(e, lon, lat), 0);
}

function regionName(k) {
  const r = REGIONS[k];
  return r.c === r.n ? r.n : `${r.c} ${r.n}`;
}

// ===== 行政區災情 =====
const REGION_CAP = 300;   // 大省份只看受災最重的約 300 格（約 2.7 萬平方公里），不會因面積大而難以受災
const LEVELS = [
  { min: 0.03, name: '輕微', color: [255, 232, 120] },
  { min: 0.12, name: '中度', color: [255, 170, 60] },
  { min: 0.3, name: '嚴重', color: [240, 90, 50] },
  { min: 0.5, name: '重大', color: [200, 30, 45] },
  { min: 0.75, name: '毀滅性', color: [125, 20, 95] },
];

function severity(k) {
  const n = regionMap.cells[k].length;
  return n ? Math.min(1, world.regionSum[k] / Math.min(n, REGION_CAP)) : 0;
}

function levelOf(s) {
  let lv = 0;
  for (let j = 0; j < LEVELS.length; j++) if (s >= LEVELS[j].min) lv = j + 1;
  return lv;
}

// 颱風經過的陸地依當地風速累積破壞，風越強、待越久，破壞越大
function damageLand(x, y, I, dt) {
  const R = damageRadius(I);
  const gx0 = Math.max(0, Math.floor((x - R) / CELL)), gx1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
  const gy0 = Math.max(0, Math.floor((y - R) / CELL)), gy1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
  const touched = new Set();
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const i = gy * GW + gx, k = regionMap.id[i];
      if (k < 0) continue;
      const d = Math.hypot((gx + 0.5) * CELL - x, (gy + 0.5) * CELL - y);
      if (d >= R) continue;
      const wind = I * (1 - 0.6 * d / R);
      if (wind <= 20) continue;
      const add = Math.min(1 - world.cellDmg[i], ((wind - 20) / 40) ** 1.5 * 1.2 * dt * (1 - PREP_CUT * world.prep[k]));
      if (add <= 0) continue;
      world.cellDmg[i] += add;
      world.regionSum[k] += add;
      touched.add(k);
    }
  }
  for (const k of touched) {
    const lv = levelOf(severity(k));
    if (lv === world.regionLevel[k]) continue;
    world.regionLevel[k] = lv;
    paintRegion(k, lv);
    if (lv >= 4) log(`🏚️ ${regionName(k)} 災情「${LEVELS[lv - 1].name}」`, 'hit');
    if (lv >= 3) news(`${regionName(k)} 災情${LEVELS[lv - 1].name}：${pick(DAMAGE_NEWS[lv - 1])}`, lv >= 4);
  }
}

let dmgCanvas, dmgImg, dmgDirty = false;
function resetDamage() {
  world.cellDmg.fill(0);
  world.regionSum.fill(0);
  world.regionLevel.fill(0);
  world.prep.fill(0);
  dmgCanvas = document.createElement('canvas');
  dmgCanvas.width = GW; dmgCanvas.height = GH;
  dmgImg = dmgCanvas.getContext('2d').createImageData(GW, GH);
  dmgDirty = true;
}

function paintRegion(k, lv) {
  const d = dmgImg.data, c = lv ? LEVELS[lv - 1].color : [0, 0, 0];
  for (const i of regionMap.cells[k]) {
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = lv ? 210 : 0;
  }
  dmgDirty = true;
}

function regionRanking() {
  const list = [];
  for (let k = 0; k < REGIONS.length; k++) {
    const s = severity(k);
    if (world.regionLevel[k] > 0) list.push({ k, s, lv: world.regionLevel[k] });
  }
  return list.sort((a, b) => b.s - a.s);
}

// ===== 畫面圖層 =====
// earth：衛星真實色地表、lines：海岸線與經緯線（每局固定）
// clouds / sst / shear：隨時間變動，依目前檢視的時間重繪
function lerpStops(stops, v) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k++) {
    const [v1, c1] = stops[k];
    if (v <= v1) {
      const [v0, c0] = stops[k - 1], t = (v - v0) / (v1 - v0);
      return c0.map((c, j) => c + (c1[j] - c) * t);
    }
  }
  return stops[stops.length - 1][1];
}

const mix = (a, b, t) => a.map((v, j) => v + (b[j] - v) * t);
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

const SST_STOPS = [[22, [27, 58, 107]], [25, [31, 111, 159]], [26.5, [28, 154, 154]], [28.5, [217, 164, 65]], [31, [217, 84, 43]]];
const SHEAR_STOPS = [[0, [16, 34, 72]], [0.25, [62, 62, 150]], [0.5, [140, 70, 200]], [0.8, [225, 115, 235]], [1, [255, 200, 255]]];
function makeLut(stops, v0, v1) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let k = 0; k < 256; k++) lut.set(lerpStops(stops, v0 + (v1 - v0) * k / 255), k * 3);
  return lut;
}
const SST_LUT = makeLut(SST_STOPS, 20, 32), SHEAR_LUT = makeLut(SHEAR_STOPS, 0, 1);
const lutIndex = (v, v0, v1) => clamp(Math.round((v - v0) / (v1 - v0) * 255), 0, 255) * 3;

// 雲層與風切圖用 1/4 解析度
const QS = 4, QW = Math.ceil(W / QS), QH = Math.ceil(H / QS);
const Q_LON = Float32Array.from({ length: QW }, (_, x) => xToLon((x + 0.5) * QS));
const Q_LAT = Float32Array.from({ length: QH }, (_, y) => yToLat((y + 0.5) * QS));

let earth, lines;
function renderStatic() {
  const { land, elev } = world;
  const shore = coastDistance(land, true);
  const small = makeCanvas(GW, GH), sctx = small.getContext('2d');
  const img = sctx.createImageData(GW, GH), d = img.data;
  const elevAt = (x, y) => world.relief[clamp(y, 0, GH - 1) * GW + clamp(x, 0, GW - 1)];
  for (let y = 0; y < GH; y++) {
    const tropic = clamp((CELL_LAT[y] - 12) / 22, 0, 1);
    const low = mix([46, 84, 38], [92, 100, 62], tropic);
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      let c;
      if (land[i]) {
        const e = world.relief[i] * 0.7 + elev[i] * 0.3;
        c = e < 0.5 ? mix(low, [92, 92, 62], e / 0.5) : mix([92, 92, 62], [128, 116, 92], (e - 0.5) / 0.5);
        // 地形陰影（光從西北方來）與地表紋理
        const shade = clamp(1 + (elevAt(x - 1, y) - elevAt(x + 1, y) + elevAt(x, y - 1) - elevAt(x, y + 1)) * 3, 0.75, 1.25);
        const tex = 0.9 + 0.2 * fbm(cloudNoise, x * 0.15, y * 0.15, 3);
        c = c.map(v => v * shade * tex);
      } else {
        c = mix([9, 24, 54], [28, 76, 102], Math.exp(-shore[i] / 3) * 0.8);   // 近岸淺海較亮
      }
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  earth = makeCanvas(W, H);
  const ectx = earth.getContext('2d');
  ectx.imageSmoothingEnabled = true;
  ectx.drawImage(small, 0, 0, W, H);

  // 仿氣象衛星雲圖：淡黃色海岸線、行政區界與經緯線疊在雲上
  lines = makeCanvas(W, H);
  const lctx = lines.getContext('2d');
  lctx.strokeStyle = 'rgba(255,236,160,0.6)';
  lctx.lineWidth = 0.9;
  traceLand(lctx, 1);
  lctx.stroke();
  lctx.strokeStyle = 'rgba(255,236,160,0.16)';
  lctx.lineWidth = 0.5;
  lctx.beginPath();
  for (const reg of REGIONS) traceRings(lctx, reg.r, 1);
  lctx.stroke();

  lctx.strokeStyle = 'rgba(255,255,255,0.12)';
  lctx.fillStyle = 'rgba(255,255,255,0.6)';
  lctx.lineWidth = 1;
  lctx.font = `11px ${FONT}`;
  for (let lon = 110; lon < LON1; lon += 5) {
    const x = Math.round(lonToX(lon)) + 0.5;
    lctx.beginPath(); lctx.moveTo(x, 0); lctx.lineTo(x, H); lctx.stroke();
    lctx.fillText(`${lon}°E`, x + 3, H - 5);
  }
  for (let lat = 10; lat < LAT1; lat += 5) {
    const y = Math.round(latToY(lat)) + 0.5;
    lctx.beginPath(); lctx.moveTo(0, y); lctx.lineTo(W, y); lctx.stroke();
    lctx.fillText(`${lat}°N`, 4, y - 4);
  }
  lctx.textAlign = 'center';
  lctx.font = `bold 15px ${FONT}`;
  lctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [name, lon, lat] of REGION_LABELS) lctx.fillText(name, lonToX(lon), latToY(lat));

  layerKey = '';
}

// --- 動態圖層 ---
const sstLayer = makeCanvas(GW, GH), shearLayer = makeCanvas(QW, QH), cloudLayer = makeCanvas(QW, QH);
const sstImg = sstLayer.getContext('2d').createImageData(GW, GH);
const shearImg = shearLayer.getContext('2d').createImageData(QW, QH);
const cloudImg = cloudLayer.getContext('2d').createImageData(QW, QH);
const sstNow = new Float32Array(GW * GH);
const cloudNoise = makeNoise(mulberry32(7)), streakNoise = makeNoise(mulberry32(11));
let layerKey = '', layerAt = 0;

function renderSstLayer(t, actual) {
  const { land, sst, wake } = world, S = activeWeather(t, actual), d = sstImg.data;
  for (let i = 0; i < sstNow.length; i++) sstNow[i] = sst[i] - wake[i];
  for (const e of S.eddies) {
    const reach = e.r * 2.5;
    const x0 = Math.max(0, Math.floor(lonToX(e.lon - reach) / CELL)), x1 = Math.min(GW - 1, Math.ceil(lonToX(e.lon + reach) / CELL));
    const y0 = Math.max(0, Math.floor(latToY(e.lat + reach) / CELL)), y1 = Math.min(GH - 1, Math.ceil(latToY(e.lat - reach) / CELL));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        sstNow[y * GW + x] += e.amp * Math.exp(-((CELL_LON[x] - e.lon) ** 2 + (CELL_LAT[y] - e.lat) ** 2) / (e.r * e.r));
  }
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (land[i]) { d[i * 4 + 3] = 0; continue; }
      const v = sstNow[i];
      let k = lutIndex(v, 20, 32), r = SST_LUT[k], g = SST_LUT[k + 1], b = SST_LUT[k + 2];
      // 26.5°C 等溫線
      if (v >= 26.5 && ((x + 1 < GW && !land[i + 1] && sstNow[i + 1] < 26.5) || (x > 0 && !land[i - 1] && sstNow[i - 1] < 26.5)
        || (y + 1 < GH && !land[i + GW] && sstNow[i + GW] < 26.5) || (y > 0 && !land[i - GW] && sstNow[i - GW] < 26.5))) {
        r = 235; g = 245; b = 255;
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 225;
    }
  }
  sstLayer.getContext('2d').putImageData(sstImg, 0, 0);
}

function renderShearLayer(t, actual) {
  const S = activeWeather(t, actual), d = shearImg.data;
  for (let y = 0; y < QH; y++) {
    for (let x = 0; x < QW; x++) {
      const i = y * QW + x;
      if (world.land[cellIndex((x + 0.5) * QS, (y + 0.5) * QS)]) { d[i * 4 + 3] = 0; continue; }
      const k = lutIndex(shearFrom(S, Q_LON[x], Q_LAT[y]), 0, 1);
      d[i * 4] = SHEAR_LUT[k]; d[i * 4 + 1] = SHEAR_LUT[k + 1]; d[i * 4 + 2] = SHEAR_LUT[k + 2]; d[i * 4 + 3] = 230;
    }
  }
  shearLayer.getContext('2d').putImageData(shearImg, 0, 0);
}

// 雲量：暖海對流雲 + 西風帶鋒面雲帶 + 風切區被拉長的卷雲，並隨高空風飄移
function renderCloudLayer(t, actual) {
  const S = activeWeather(t, actual), d = cloudImg.data;
  for (let y = 0; y < QH; y++) {
    const lat = Q_LAT[y];
    const u = -1.2 + 3.2 * smoothstep(S.edge - 4, S.edge + 2, lat);   // 信風帶向西、西風帶向東（度/天）
    const front = 0.5 * Math.exp(-(((lat - S.edge - 2.5) / 2.2) ** 2));
    for (let x = 0; x < QW; x++) {
      const i = y * QW + x, lon = Q_LON[x], ax = lon - u * t;
      const ci = cellIndex((x + 0.5) * QS, (y + 0.5) * QS);
      const warm = world.land[ci] ? 0.1 : clamp((world.sst[ci] - 27.5) / 2.5, 0, 1) * (lat < 24 ? 0.4 : 0.2);
      let cirrus = 0;
      for (const s of S.shear) cirrus += s.amp * Math.exp(-((lon - s.lon) ** 2 + (lat - s.lat) ** 2) / (s.r * s.r));
      const n = fbm(cloudNoise, ax * 0.38, lat * 0.38 + t * 0.15, 4);
      let dens = n * (0.42 + warm + front) - 0.42;
      if (cirrus > 0.05) {
        const streak = fbm(streakNoise, ax * 0.3 + lat * 0.2, lat * 0.9, 4) - 0.42;   // 斜向拉長的卷雲
        dens = Math.max(dens, streak * Math.min(cirrus, 1) * (0.6 + n) * 1.1);
      }
      const a = clamp(dens * 3.2, 0, 1);
      const c = 200 + 55 * a;
      d[i * 4] = c; d[i * 4 + 1] = c; d[i * 4 + 2] = c; d[i * 4 + 3] = a * 235;
    }
  }
  cloudLayer.getContext('2d').putImageData(cloudImg, 0, 0);
}

function viewTime() {
  return state === 'draw' ? { t: forecastDay, actual: false } : { t: ty ? ty.day : 0, actual: true };
}

// 只重繪目前檢視中的圖層；行進中每秒最多重繪約 8 次
function refreshLayers(force) {
  const { t, actual } = viewTime();
  const key = `${view}|${actual}|${t.toFixed(2)}`;
  const now = performance.now();
  if (key === layerKey || (!force && state === 'run' && now - layerAt < 120)) return;
  layerKey = key; layerAt = now;
  if (view === 'sst') renderSstLayer(t, actual);
  else if (view === 'shear') renderShearLayer(t, actual);
  else if (view === 'sat') renderCloudLayer(t, actual);
}

function resetWake() {
  world.wake.fill(0);
  layerKey = '';
}

// 颱風攪動海水，把深層冷水帶上來：同一片海域待越久越冷
function coolOcean(x, y, I, dt) {
  const r = 8 + I * 0.35, rate = 2.4 * I / 50;
  const reach = r * 1.5;
  const gx0 = Math.max(0, Math.floor((x - reach) / CELL)), gx1 = Math.min(GW - 1, Math.floor((x + reach) / CELL));
  const gy0 = Math.max(0, Math.floor((y - reach) / CELL)), gy1 = Math.min(GH - 1, Math.floor((y + reach) / CELL));
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const i = gy * GW + gx;
      if (world.land[i]) continue;
      const dx = (gx + 0.5) * CELL - x, dy = (gy + 0.5) * CELL - y;
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 > 2.25) continue;
      world.wake[i] = Math.min(4, world.wake[i] + rate * dt * Math.exp(-d2 * 2));
    }
  }
}

// 颱風雲系：螺旋雲帶 + 中心密雲區 + 颱風眼，依強度重繪
const vortexNoise = makeNoise(mulberry32(23));
let tySprite = null, tySpriteI = -99;
function typhoonSprite(I) {
  if (tySprite && Math.abs(I - tySpriteI) < 1.5) return tySprite;
  const Rc = 26 + I * 1.15, S = Math.ceil(Rc * 2.4), cx = S / 2;
  const c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const o = clamp((I - 15) / 40, 0, 1);              // 組織程度：越強越對稱、雲帶越清楚
  const eye = I >= 33 ? 0.075 - 0.025 * o : 0;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const dx = (px + 0.5 - cx) / Rc, dy = (py + 0.5 - cx) / Rc, r = Math.hypot(dx, dy);
      if (r > 1.2) continue;
      const th = Math.atan2(dy, dx);
      const arms = 0.5 + 0.5 * Math.cos(2 * (th - 2.3 * Math.log(r + 0.03)));
      const n = fbm(vortexNoise, px * 0.07, py * 0.07, 4);
      const core = 1 - smoothstep(0.1 + 0.15 * o, 0.38 + 0.15 * o, r);
      const band = arms ** (1.2 + 2.5 * o) * (1 - smoothstep(0.25, 1.15, r));
      const blob = (1 - o) * 0.55 * (1 - smoothstep(0.15, 0.9, r));
      let dens = Math.max(core, band * (0.55 + 0.6 * o) + blob) * (0.5 + 0.8 * n);
      if (eye) dens *= smoothstep(eye * 0.6, eye * 1.5, r);
      const a = clamp(dens * 1.4 - 0.12, 0, 1);
      const k = (py * S + px) * 4, v = 215 + 40 * a;
      d[k] = v; d[k + 1] = v; d[k + 2] = v; d[k + 3] = a * 250;
    }
  }
  g.putImageData(img, 0, 0);
  tySprite = c; tySpriteI = I;
  return c;
}

// ===== 颱風強度分級（中央氣象署標準） =====
function category(I) {
  if (I < 17.2) return { name: '熱帶性低氣壓', color: '#8ec5e8' };
  if (I < 32.7) return { name: '輕度颱風', color: '#f4d03f' };
  if (I < 51) return { name: '中度颱風', color: '#f39c3d' };
  return { name: '強烈颱風', color: '#ff4d5e' };
}
const CATEGORY_ORDER = ['熱帶性低氣壓', '輕度颱風', '中度颱風', '強烈颱風'];

// ===== 遊戲狀態 =====
let mode = 'mission';      // mission：任務模式 / free：自由模式
let world;
let state = 'draw';        // draw | run | end
let path = [];             // 使用者畫的路徑 [{x,y}]
let pathDays = [];         // 每個路徑點的預估抵達天數（依預報駛流）
let drawing = false;
let cum = [];              // 路徑累積長度
let ty = null;             // 颱風
let trail = [];
let hover = null;
let speedMul = 1;
let toastTimer = 0;
let view = 'sat';          // sat：衛星雲圖 / sst：海溫 / shear：風切
let forecastDay = 0;       // 畫路徑時預覽第幾天的預報
let fcPlaying = false;

function newGame(seed) {
  world = genWorld(seed);
  renderStatic();
  clearNews();
  $('tyName').value = randomName();
  resetRun(true);
  if (mode === 'mission') {
    const names = world.cities.filter(c => c.target).map(c => c.name).join('、');
    log(`📋 新任務：摧毀 ${names}`);
  } else {
    log('🗺️ 自由模式：盡可能讓各行政區災情擴大');
  }
}

function setMode(m) {
  if (state === 'run' || m === mode) return;
  mode = m;
  document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('missionBlock').classList.toggle('hidden', m !== 'mission');
  newGame(Math.floor(Math.random() * 1e9));
}

function resetRun(clearPath) {
  for (const c of world.cities) { c.hp = c.maxHp; c.hitT = 0; c.prep = 0; c.prepTold = false; }
  resetWake();
  resetDamage();
  if (clearPath) { path = []; pathDays = []; }
  ty = null; trail = []; tySprite = null;
  state = 'draw';
  setForecastDay(0);
  $('result').classList.add('hidden');
  setStatus('準備', path.length ? '路徑已畫好，按「發動颱風」' : '從虛線框「颱風生成區」開始，按住拖曳畫出路徑');
  updateHud();
}

// ===== 畫路徑 =====
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

canvas.addEventListener('pointerdown', e => {
  if (state !== 'draw') return;
  const p = toCanvas(e);
  const env = envAt(p.x, p.y, 0, false);
  if (env.land || !inGenesis(env.lon, env.lat)) {
    toast('颱風只能在「颱風生成區」的熱帶海面上生成！');
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  drawing = true;
  path = [p]; pathDays = [0];
  updateHud();
});

canvas.addEventListener('pointermove', e => {
  const p = toCanvas(e);
  hover = p;
  if (drawing) {
    const last = path[path.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    const q = { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) };
    const day = totalPathDays() + d / segmentSpeed(last, q, totalPathDays());
    if (d >= 5 && day <= MAX_DAYS) {
      path.push(q);
      pathDays.push(day);
      setForecastDay(day);   // 地圖顯示颱風抵達游標處那天的預報
    } else if (d >= 5) {
      toastOnce(`颱風壽命只有 ${MAX_DAYS} 天，路徑已達上限`);
    }
  }
  if (state === 'draw') updateHud();
});

canvas.addEventListener('pointerleave', () => { hover = null; if (state === 'draw') updateHud(); });

function endDraw() {
  if (!drawing) return;
  drawing = false;
  if (path.length < 3) { path = []; pathDays = []; }
  else {
    path = chaikin(chaikin(path));
    computePathDays();
    setStatus('準備', '路徑已畫好，按「發動颱風」');
  }
  updateHud();
}
canvas.addEventListener('pointerup', endDraw);
canvas.addEventListener('pointercancel', endDraw);

// 依預報駛流估算路段速度
function segmentSpeed(a, b, t) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const steer = steerAt(xToLon((a.x + b.x) / 2), yToLat((a.y + b.y) / 2), t, false);
  return moveSpeed(steer, (b.x - a.x) / L, (b.y - a.y) / L);
}

const totalPathDays = () => pathDays.length ? pathDays[pathDays.length - 1] : 0;

function computePathDays() {
  pathDays = [0];
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    pathDays.push(pathDays[i - 1] + d / segmentSpeed(path[i - 1], path[i], pathDays[i - 1]));
  }
  // 平滑後可能略超過壽命，截掉超出的部分
  while (path.length > 2 && totalPathDays() > MAX_DAYS) { path.pop(); pathDays.pop(); }
}

// 平滑路徑，保留起終點
function chaikin(pts) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ===== 颱風模擬 =====
function launch() {
  if (state !== 'draw' || path.length < 2) { toast('請先從颱風生成區畫出颱風路徑'); return; }
  cum = [0];
  for (let i = 1; i < path.length; i++)
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  ty = { s: 0, seg: 0, x: path[0].x, y: path[0].y, I: START_I, peak: START_I, rot: 0, day: 0,
    cat: category(START_I).name, onLand: false, switchT: 0, factor: null, doneDay: null,
    name: typhoonName(), told: {}, warned: {}, speed: SELF_SPEED, steer: null };
  $('tyName').value = ty.name;
  trail = [{ x: ty.x, y: ty.y, I: ty.I }];
  state = 'run';
  log(`🌀 颱風「${ty.name}」生成！`, 'good');
  const env0 = envAt(ty.x, ty.y, 0, true);
  news(`中央氣象署：北緯 ${env0.lat.toFixed(1)} 度、東經 ${env0.lon.toFixed(1)} 度海面熱帶性低氣壓形成，命名為「${ty.name}」`, true);
  setStatus('颱風行進中', '觀察颱風強度的變化');
}

function pointAt(s) {
  while (ty.seg < cum.length - 2 && cum[ty.seg + 1] < s) ty.seg++;
  const a = path[ty.seg], b = path[ty.seg + 1];
  const segLen = cum[ty.seg + 1] - cum[ty.seg] || 1;
  const t = clamp((s - cum[ty.seg]) / segLen, 0, 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// 根據颱風所在環境計算強度變化率 (m/s 每秒)
function intensityChange(env, I) {
  if (env.land) {
    const dI = -(0.22 + env.elev * 0.5) * I;
    return env.elev > 0.5
      ? { dI, text: '⛰️ 高山地形破壞結構，快速減弱', kind: 'bad' }
      : { dI, text: '🏝️ 登陸：失去海洋水氣，減弱中', kind: 'bad' };
  }
  let dI, f;
  if (env.sst < 26) {
    dI = -(26 - env.sst) * 3 - 0.08 * I;
    f = { text: '🧊 冷水區：能量不足，減弱中', kind: 'bad' };
  } else {
    // 海溫決定可達到的最大強度
    const potential = clamp((env.sst - 25) * 14, 0, MAX_I);
    dI = (I < potential ? 0.8 : 0.5) * (potential - I);
    f = I < potential - 1
      ? { text: '🔥 溫暖海面：吸收能量，增強中', kind: 'good' }
      : { text: '🌊 已達此處海溫能支撐的上限', kind: '' };
  }
  if (env.wake > 0.6) f = { text: '❄️ 冷水尾跡：海水已被颱風攪冷', kind: dI < 0 ? 'bad' : '' };
  if (env.shear > 0.1) {
    dI -= env.shear * 18;
    if (env.shear > 0.3) f = { text: '💨 垂直風切：結構被撕裂，減弱中', kind: 'bad' };
  }
  return { dI, ...f };
}

function damageRadius(I) { return 15 + I * 1.1; }

function step(dt) {
  // 依實際駛流沿路徑前進
  const a = path[ty.seg], b = path[ty.seg + 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  ty.steer = steerAt(xToLon(ty.x), yToLat(ty.y), ty.day, true);
  ty.speed = moveSpeed(ty.steer, (b.x - a.x) / L, (b.y - a.y) / L);
  ty.s = Math.min(ty.s + ty.speed * dt, cum[cum.length - 1]);
  ty.day += dt;
  const p = pointAt(ty.s);
  ty.x = p.x; ty.y = p.y;

  const env = envAt(ty.x, ty.y, ty.day, true);
  const ch = intensityChange(env, ty.I);
  ty.I = clamp(ty.I + ch.dI * dt, 0, MAX_I);
  ty.factor = ch;
  ty.env = env;
  ty.peak = Math.max(ty.peak, ty.I);
  ty.rot += (0.6 + ty.I / 18) * dt;
  coolOcean(ty.x, ty.y, ty.I, dt);
  prepareDefenses(dt);
  damageLand(ty.x, ty.y, ty.I, dt);

  // 持續一小段時間才算登陸 / 出海，避免沿海岸線時紀錄洗版
  if (env.land !== ty.onLand && ty.switchT === 0) ty.switchRegion = env.region;   // 記下剛碰到陸地的縣市
  ty.switchT = env.land !== ty.onLand ? ty.switchT + dt : 0;
  if (ty.switchT > 0.15) {
    ty.onLand = env.land;
    ty.switchT = 0;
    const where = ty.switchRegion >= 0 ? regionName(ty.switchRegion) : '';
    log(env.land ? `⚠️ 「${ty.name}」登陸 ${where}` : `🌊 「${ty.name}」出海`, env.land ? 'bad' : 'good');
    if (env.land) news(`${category(ty.I).name}「${ty.name}」第 ${ty.day.toFixed(1)} 天登陸${where ? ` ${where}` : ''}，各地嚴加戒備`, ty.I >= 32.7);
    else news(`「${ty.name}」出海，可能重新吸收能量`);
  }
  const cat = category(ty.I).name;
  if (cat !== ty.cat) {
    const up = CATEGORY_ORDER.indexOf(cat) > CATEGORY_ORDER.indexOf(ty.cat);
    log(`${up ? '⬆️' : '⬇️'} 「${ty.name}」${up ? '增強' : '減弱'}為${cat}（${ty.I.toFixed(0)} m/s）`, up ? 'good' : 'bad');
    news(`「${ty.name}」${up ? '增強' : '減弱'}為${cat}，近中心最大風速每秒 ${ty.I.toFixed(0)} 公尺`, up && cat === '強烈颱風');
    ty.cat = cat;
  }
  reportEnvironment(env);

  const last = trail[trail.length - 1];
  if (Math.hypot(ty.x - last.x, ty.y - last.y) > 3) trail.push({ x: ty.x, y: ty.y, I: ty.I });

  // 城市受災
  const R = damageRadius(ty.I);
  for (const c of world.cities) {
    if (c.hp <= 0) continue;
    const d = Math.hypot(c.x - ty.x, c.y - ty.y);
    if (d < R && ty.I > 17.2) {
      const dmg = Math.min(c.hp, (ty.I - 15) * 9 * (1 - d / R) * dt * (1 - PREP_CUT * c.prep));
      c.hp -= dmg;
      c.hitT = 0.3;
      if (c.hp <= 0.01) {
        c.hp = 0;
        log(`💥 ${c.target ? '🎯 ' : ''}${c.name} 被摧毀！（第 ${ty.day.toFixed(1)} 天）`, 'hit');
        news(`${c.name}遭「${ty.name}」重創，${pick(DAMAGE_NEWS[4])}`, true);
      }
    }
  }

  if (mode === 'mission' && world.cities.every(c => !c.target || c.hp <= 0)) {
    ty.doneDay = ty.day;
    return finish('任務成功！');
  }
  if (ty.I < DEAD_I) return finish('已消散');
  if (ty.day >= MAX_DAYS) return finish('壽命結束');
  if (ty.s >= cum[cum.length - 1]) return finish('走完預定路徑');
}

// 颱風接近時各國發布警報、展開防颱準備：拖越久，受到的損害越小
function prepareDefenses(dt) {
  for (let k = 0; k < REGIONS.length; k++) {
    if (!regionMap.cells[k].length) continue;
    if (Math.hypot(regionMap.cx[k] - ty.x, regionMap.cy[k] - ty.y) > WARN_R) continue;
    world.prep[k] = Math.min(1, world.prep[k] + PREP_RATE * dt);
    const country = REGIONS[k].c;
    if (!ty.warned[country]) {
      ty.warned[country] = true;
      log(`📢 ${country}發布颱風警報`, 'bad');
      news(`${country}發布颱風警報，各地展開防颱準備`, true);
    }
  }
  for (const c of world.cities) {
    if (c.hp <= 0 || Math.hypot(c.x - ty.x, c.y - ty.y) > WARN_R) continue;
    c.prep = Math.min(1, c.prep + PREP_RATE * dt);
    if (c.prep >= 1 && !c.prepTold) {
      c.prepTold = true;
      news(`${c.name}完成防颱準備，損害可望降低`);
    }
  }
}

function reportEnvironment(env) {
  const cases = {
    mountain: [env.land && env.elev > 0.5, `「${ty.name}」受高山地形破壞，結構明顯減弱`],
    shear: [!env.land && env.shear > 0.5, `「${ty.name}」遭遇強烈垂直風切，雲系被撕裂`],
    cold: [!env.land && env.sst < 26, `「${ty.name}」進入冷水區，強度逐漸減弱`],
    wake: [!env.land && env.wake > 1, `「${ty.name}」在同一海域徘徊，攪冷海水難以增強`],
    warm: [!env.land && env.sst > 30, `「${ty.name}」行經 30 度以上的溫暖海面，可能迅速增強`],
  };
  for (const [key, [on, text]] of Object.entries(cases)) {
    if (on && !ty.told[key]) news(text);
    ty.told[key] = on;
  }
}

function starChecks() {
  const done = !!(ty && ty.doneDay !== null);
  return [
    { ok: done, text: '摧毀全部目標城市' },
    { ok: !!ty && ty.peak >= 51, text: '成長為強烈颱風（≥ 51 m/s）' },
    { ok: done && ty.doneDay <= STAR_DAYS, text: `${STAR_DAYS} 天內完成任務` },
  ];
}

function finish(reason) {
  state = 'end';
  log(`🏁 「${ty.name}」${reason}`, ty.doneDay !== null ? 'good' : '');
  const destroyed = world.cities.filter(c => c.hp <= 0);
  const targetsDown = destroyed.filter(c => c.target).length;
  const ranking = regionRanking();
  const loss = ranking.reduce((s, r) => s + r.s * 100, 0);    // 災損指數：各行政區破壞程度加總
  const score = Math.round(loss * 10 + targetsDown * 1000 + (destroyed.length - targetsDown) * 300 + ty.peak * 20);

  let head;
  if (mode === 'mission') {
    const checks = starChecks();
    const stars = checks[0].ok ? checks.filter(c => c.ok).length : 0;
    head = `<div class="stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>
      <ul class="checks">${checks.map(c => `<li class="${c.ok ? 'ok' : ''}">${c.ok ? '✔' : '✘'} ${c.text}</li>`).join('')}</ul>`;
  } else {
    const grade = loss >= 1500 ? '🏆 世紀巨災' : loss >= 900 ? '🌪️ 超級颱風' : loss >= 450 ? '🌀 來勢洶洶'
      : loss >= 150 ? '🌧️ 風雨交加' : '🍃 微風細雨';
    head = `<div class="grade">${grade}</div>`;
  }
  const counts = LEVELS.map((L, j) => `${L.name} ${ranking.filter(r => r.lv === j + 1).length}`).reverse().join('、');
  $('resultTitle').textContent = `颱風「${ty.name}」${reason}`;
  const worst = ranking[0];
  news(`「${ty.name}」${reason}。共造成 ${ranking.length} 個行政區受災${worst ? `，以${regionName(worst.k)}災情最為${LEVELS[worst.lv - 1].name}` : ''}，最大風速每秒 ${ty.peak.toFixed(0)} 公尺`, true);
  $('resultBody').innerHTML = `${head}
    <div class="score">${score.toLocaleString()} 分</div>
    <table>
      ${mode === 'mission' ? `<tr><td>目標城市</td><td>${targetsDown} / ${TARGET_COUNT}</td></tr>` : ''}
      <tr><td>災損指數</td><td>${Math.round(loss)}</td></tr>
      <tr><td>受災行政區</td><td>${ranking.length} 個</td></tr>
      <tr><td>摧毀城市</td><td>${destroyed.length} 座</td></tr>
      <tr><td>最大風速</td><td>${ty.peak.toFixed(1)} m/s（${category(ty.peak).name}）</td></tr>
      <tr><td>颱風壽命</td><td>${ty.day.toFixed(1)} 天</td></tr>
    </table>
    <div class="levels">${counts}</div>
    <ol class="rank">${rankItems(ranking.slice(0, 5))}</ol>`;
  $('result').classList.remove('hidden');
  setStatus('結束', reason);
  updateHud();
}

// ===== 繪圖 =====
function draw() {
  refreshLayers();
  ctx.drawImage(earth, 0, 0);
  if (view === 'sst') ctx.drawImage(sstLayer, 0, 0, W, H);
  if (view === 'shear') ctx.drawImage(shearLayer, 0, 0, QW * QS, QH * QS);
  if (dmgDirty) { dmgCanvas.getContext('2d').putImageData(dmgImg, 0, 0); dmgDirty = false; }
  ctx.drawImage(dmgCanvas, 0, 0, W, H);
  if (view === 'sat') ctx.drawImage(cloudLayer, 0, 0, QW * QS, QH * QS);
  ctx.drawImage(lines, 0, 0);
  if (view === 'shear') drawShearArrows();
  if (view === 'flow') drawFlow();
  drawGenesis();
  drawPath();
  drawTrail();
  drawCities();
  if (ty) drawTyphoon();
  drawClock();
}

// 地圖右上角：目前顯示的是預報還是實況、第幾天
function drawClock() {
  const { t, actual } = viewTime();
  const name = { sat: '衛星雲圖', sst: '海面溫度', shear: '垂直風切', flow: '駛流' }[view];
  const text = `${name}｜${actual ? '實況' : '預報'} 第 ${t.toFixed(1)} 天`;
  ctx.save();
  ctx.font = `bold 13px ${FONT}`;
  const w = ctx.measureText(text).width + 20;
  ctx.fillStyle = 'rgba(5,12,24,0.75)';
  ctx.fillRect(W - w - 10, 10, w, 26);
  ctx.fillStyle = actual ? '#fff' : '#ffd66b';
  ctx.fillText(text, W - w, 28);
  ctx.restore();
}

// 駛流圖：箭頭為颱風會被推動的方向與速度，並標出太平洋高壓與西風帶
function drawFlow() {
  const { t, actual } = viewTime();
  ctx.save();
  ctx.fillStyle = 'rgba(5,12,24,0.35)';
  ctx.fillRect(0, 0, W, H);
  for (let y = 30; y < H; y += 48) {
    for (let x = 30; x < W; x += 48) {
      const st = steerAt(xToLon(x), yToLat(y), t, actual);
      const mag = Math.hypot(st.u, st.v), len = 6 + mag * 4.5;
      const ang = Math.atan2(-st.v, st.u), ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      ctx.strokeStyle = ctx.fillStyle = mag > 3.5 ? '#8fe3ff' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ang) * 4, ey + Math.sin(ang) * 4);
      ctx.lineTo(ex + Math.cos(ang + 2.4) * 5, ey + Math.sin(ang + 2.4) * 5);
      ctx.lineTo(ex + Math.cos(ang - 2.4) * 5, ey + Math.sin(ang - 2.4) * 5);
      ctx.fill();
    }
  }
  const edge = westerlyEdge(t, actual), ey = latToY(edge);
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(255,214,107,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(W, ey); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = '#ffd66b';
  ctx.fillText('西風帶南緣（以北往東吹）', 60, ey - 6);
  const hx = lonToX(highWest(t, actual) + 12), hy = latToY(edge - 4);
  ctx.textAlign = 'center';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = '#5ab0ff';
  ctx.fillText('H', hx, hy + 12);
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('太平洋高壓', hx, hy + 30);
  ctx.restore();
}

// 風切圖上標出各風切系統未來一天的移動方向
function drawShearArrows() {
  const { t, actual } = viewTime();
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  for (const s of activeWeather(t, actual).shear) {
    if (s.amp < 0.3) continue;
    const x = lonToX(s.lon), y = latToY(s.lat);
    const ex = lonToX(s.lon + s.vlon), ey = latToY(s.lat + s.vlat);
    const ang = Math.atan2(ey - y, ex - x);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6);
    ctx.lineTo(ex + Math.cos(ang + 2.5) * 7, ey + Math.sin(ang + 2.5) * 7);
    ctx.lineTo(ex + Math.cos(ang - 2.5) * 7, ey + Math.sin(ang - 2.5) * 7);
    ctx.fill();
  }
  ctx.restore();
}

function drawGenesis() {
  const x0 = lonToX(GENESIS.lon0), x1 = lonToX(GENESIS.lon1);
  const y0 = latToY(GENESIS.lat1), y1 = latToY(GENESIS.lat0);
  ctx.save();
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = state === 'draw' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
  ctx.strokeRect(x0 + 1, y0, x1 - x0 - 2, y1 - y0 - 1);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('🌀 颱風生成區', x0 + 8, y0 + 18);
  ctx.restore();
}

// 路段顏色：紅＝逆著駛流很慢、黃＝偏慢、白＝正常、藍＝順著駛流很快
function speedColor(v) {
  return v < 35 ? '#ff6b5e' : v < 70 ? '#ffd66b' : v > 120 ? '#8fe3ff' : '#ffffff';
}

function drawPath() {
  if (path.length < 2) {
    if (path.length === 1) dot(path[0].x, path[0].y, 5, '#fff');
    return;
  }
  ctx.save();
  ctx.globalAlpha = state === 'draw' ? 0.95 : 0.45;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    const days = pathDays[i] - pathDays[i - 1];
    ctx.strokeStyle = speedColor(days > 0 ? len / days : SELF_SPEED);
    ctx.lineDashOffset = -acc;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    acc += len;
  }
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // 依預報駛流估算的每日位置
  ctx.fillStyle = '#fff';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  let nextDay = 1;
  for (let i = 1; i < path.length; i++) {
    while (pathDays[i] >= nextDay) {
      const a = path[i - 1], b = path[i];
      const t = (nextDay - pathDays[i - 1]) / ((pathDays[i] - pathDays[i - 1]) || 1);
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      if (nextDay % 2 === 0) ctx.fillText(`${nextDay}天`, x, y - 7);
      nextDay++;
    }
  }

  // 終點箭頭
  const a = path[path.length - 2], b = path[path.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x + Math.cos(ang) * 8, b.y + Math.sin(ang) * 8);
  ctx.lineTo(b.x + Math.cos(ang + 2.5) * 10, b.y + Math.sin(ang + 2.5) * 10);
  ctx.lineTo(b.x + Math.cos(ang - 2.5) * 10, b.y + Math.sin(ang - 2.5) * 10);
  ctx.fill();
  ctx.restore();
  dot(path[0].x, path[0].y, 6, '#fff');
}

function drawTrail() {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  for (let i = 1; i < trail.length; i++) {
    ctx.strokeStyle = category(trail[i].I).color;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCities() {
  ctx.save();
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  for (const c of world.cities) {
    const dead = c.hp <= 0;
    const shake = c.hitT > 0 ? (Math.random() - 0.5) * 3 : 0;
    const x = c.x + shake, y = c.y;
    if (c.target && !dead) {
      ctx.strokeStyle = `rgba(255,77,94,${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 11 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    }
    if (dead) {
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    } else {
      dot(x, y, 5, c.hitT > 0 ? '#ffc857' : c.target ? '#ff4d5e' : '#fff');
      ctx.strokeStyle = '#1b2a3a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (!dead && c.prep > 0.02) {   // 藍色圓弧：防颱準備進度
      ctx.strokeStyle = '#5ab0ff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 8.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.prep); ctx.stroke();
    }
    const ly = y < 24 ? y + 30 : y - 13;   // 太靠上緣時標籤放下方
    const label = c.target ? `🎯${c.name}` : c.name;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = dead ? '#bbb' : c.target ? '#ffd0d4' : '#fff';
    ctx.strokeText(label, x, ly);
    ctx.fillText(label, x, ly);
    // 耐久度
    const by = y < 24 ? y - 14 : y + 9;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 15, by, 30, 4);
    const r = c.hp / c.maxHp;
    ctx.fillStyle = r > 0.5 ? '#4cd38a' : r > 0.2 ? '#ffc857' : '#ff6b5e';
    ctx.fillRect(x - 15, by, 30 * r, 4);
  }
  ctx.restore();
}

function drawTyphoon() {
  const { x, y, I, rot } = ty;
  const cat = category(I);
  ctx.save();
  ctx.translate(x, y);

  // 暴風圈
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = cat.color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, damageRadius(I), 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 雲系（北半球逆時針旋轉）
  const sprite = typhoonSprite(I);
  ctx.rotate(-rot);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  ctx.restore();

  // 中心標記
  ctx.save();
  ctx.strokeStyle = cat.color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
  // 颱風名稱
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.fillStyle = cat.color;
  const label = `${ty.name} ${I.toFixed(0)} m/s`;
  ctx.strokeText(label, x, y + damageRadius(I) + 16);
  ctx.fillText(label, x, y + damageRadius(I) + 16);
  ctx.restore();
}

function dot(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// ===== 颱風命名 =====
// 西北太平洋颱風名單（中文譯名）
const TYPHOON_NAMES = ['海葵', '山陀兒', '凱米', '康芮', '小犬', '天兔', '銀杏', '桑達', '丹娜絲', '百合',
  '韋帕', '范斯高', '竹節草', '劍魚', '玲玲', '楊柳', '米克拉', '白鹿', '浣熊', '海神', '紅霞', '黑格比',
  '薔琵', '杜鵑', '米雷', '尼莎', '奧鹿', '麥德姆', '巴威', '美莎克', '蘭恩', '蘇拉', '卡努', '圓規', '軒嵐諾'];

function randomName() {
  return TYPHOON_NAMES[Math.floor(Math.random() * TYPHOON_NAMES.length)];
}

function typhoonName() {
  return $('tyName').value.trim() || randomName();
}

// ===== 新聞跑馬燈 =====
const DAMAGE_NEWS = [
  ['強風吹倒路樹、招牌掉落', '部分地區停電', '海邊湧浪，漁船回港避風'],
  ['多處淹水，停電戶數持續攀升', '低窪地區積水，交通受阻', '農損初估上億元'],
  ['土石流封路，數萬戶停電', '河川水位暴漲，緊急撤離居民', '宣布停班停課'],
  ['災情慘重，大範圍停水停電', '橋梁沖毀，多處聚落成孤島', '國軍投入救災'],
  ['城市機能癱瘓，損失難以估計', '史上罕見災情，國際救援馳援', '多項觀測紀錄遭打破'],
];
const IDLE_NEWS = [
  '中央氣象署：西北太平洋海溫偏高，颱風生成條件良好',
  '專家提醒：颱風行經溫暖海面恐迅速增強',
  '颱風季來臨，民眾應做好防颱準備，檢查門窗與排水',
  '黑潮帶來溫暖海水，北上颱風強度不易減弱',
  '高山地形會破壞颱風結構，中央山脈常讓颱風「翻山」後減弱',
];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const ticker = { queue: [], offset: 0, idle: 0 };

function news(text, urgent = false) {
  ticker.queue.push({ text, urgent });
  // 積太多時先丟最舊的一般新聞，重大新聞保留
  while (ticker.queue.length > 6) {
    const k = ticker.queue.findIndex(n => !n.urgent);
    ticker.queue.splice(k >= 0 ? k : 0, 1);
  }
  if (urgent) {
    $('tkLabel').textContent = '插播';
    $('tkLabel').classList.add('flash');
    clearTimeout(ticker.flashTimer);
    ticker.flashTimer = setTimeout(() => { $('tkLabel').textContent = '颱風快訊'; $('tkLabel').classList.remove('flash'); }, 6000);
  }
}

function clearNews() {
  ticker.queue = [];
}

// 沒有事件時播報：行進中報颱風動態，平時報預報與防颱資訊
function idleNews() {
  if (state === 'run' && ty) {
    const env = ty.env;
    const where = env && env.region >= 0 ? `位於${regionName(env.region)}一帶` : `位於北緯 ${env ? env.lat.toFixed(1) : '--'} 度、東經 ${env ? env.lon.toFixed(1) : '--'} 度`;
    return `${category(ty.I).name}「${ty.name}」目前${where}，近中心最大風速每秒 ${ty.I.toFixed(0)} 公尺`;
  }
  ticker.idle++;
  if (ticker.idle % 3 === 0 && world) {
    let minDay = 0, minEdge = Infinity;
    for (let d = 0; d <= MAX_DAYS; d += 0.5) {
      const e = westerlyEdge(d, false);
      if (e < minEdge) { minEdge = e; minDay = d; }
    }
    return `天氣預報：西風帶預計第 ${minDay.toFixed(1)} 天南移至北緯 ${minEdge.toFixed(0)} 度，北上颱風恐受強烈風切影響`;
  }
  return pick(IDLE_NEWS);
}

function tickTicker(dt) {
  const track = $('tkTrack'), viewW = track.parentElement.clientWidth;
  // 隊伍尾端進入畫面就補下一則
  if (track.scrollWidth - ticker.offset < viewW + 40) {
    const n = ticker.queue.shift() || { text: idleNews(), urgent: false };
    const el = document.createElement('span');
    el.textContent = n.text;
    if (n.urgent) el.className = 'urgent';
    track.appendChild(el);
  }
  ticker.offset += (95 + 30 * ticker.queue.length) * dt;   // 新聞積越多跑越快
  const first = track.firstElementChild;
  if (first && ticker.offset > first.offsetWidth) {
    ticker.offset -= first.offsetWidth;
    first.remove();
  }
  track.style.transform = `translateX(${-ticker.offset}px)`;
}

// ===== HUD =====
function setStatus(label, text) {
  $('statusLabel').textContent = label;
  $('status').textContent = text;
}

function updateHud() {
  const I = ty ? ty.I : null;
  $('windVal').textContent = I === null ? '--' : I.toFixed(1);
  const badge = $('catBadge');
  if (I === null) { badge.textContent = '尚未生成'; badge.style.background = '#8ea3b8'; }
  else if (I < DEAD_I) { badge.textContent = '已消散'; badge.style.background = '#8ea3b8'; }
  else { const c = category(I); badge.textContent = c.name; badge.style.background = c.color; }
  $('windBar').style.width = `${I === null ? 0 : I / MAX_I * 100}%`;
  $('windBar').style.background = I === null ? '' : category(I).color;

  // 環境資訊：行進中顯示颱風位置，畫路徑時顯示游標位置
  let env = null, factor = null;
  if (ty && ty.env) {
    $('envLabel').textContent = '颱風位置環境';
    env = ty.env; factor = ty.factor;
  } else if (hover) {
    $('envLabel').textContent = `游標位置（第 ${forecastDay.toFixed(1)} 天預報）`;
    env = envAt(hover.x, hover.y, forecastDay, false);
    factor = intensityChange(env, 35);
  }
  if (env) {
    $('envPos').textContent = env.region >= 0 ? regionName(env.region) : `${env.lat.toFixed(1)}°N ${env.lon.toFixed(1)}°E`;
    $('envTerrain').textContent = env.land ? (env.elev > 0.5 ? '高山' : '平地') : '海洋';
    $('envSst').textContent = env.land ? '--'
      : `${env.sst.toFixed(1)} °C${env.wake > 0.1 ? `（尾跡 −${env.wake.toFixed(1)}）` : ''}`;
    $('envShear').textContent = env.land ? '--' : env.shear > 0.5 ? '強' : env.shear > 0.1 ? '中' : '弱';
    if (ty && ty.env === env) {
      $('envSteer').textContent = `往${dirName(ty.steer.u, ty.steer.v)}推，時速 ${Math.round(ty.speed * 111 / PX_PER_DEG / 24)} 公里`;
    } else {
      const st = steerAt(env.lon, env.lat, forecastDay, false);
      $('envSteer').textContent = `往${dirName(st.u, st.v)}，每天 ${Math.hypot(st.u, st.v).toFixed(1)} 度`;
    }
    $('envPrep').textContent = env.region >= 0 ? `${Math.round(world.prep[env.region] * 100)}%` : '--';
    $('factor').textContent = factor.text;
    $('factor').className = `factor ${factor.kind}`;
  } else {
    ['envPos', 'envTerrain', 'envSst', 'envShear', 'envSteer', 'envPrep'].forEach(id => { $(id).textContent = '--'; });
    $('factor').textContent = '--';
    $('factor').className = 'factor';
  }

  const days = ty ? ty.day : totalPathDays();
  $('dayBar').style.width = `${days / MAX_DAYS * 100}%`;
  $('dayVal').textContent = `${days.toFixed(1)} / ${MAX_DAYS} 天`;

  $('targets').innerHTML = world.cities.filter(c => c.target).map(c => {
    const pct = Math.round(c.hp / c.maxHp * 100);
    return `<li class="${c.hp <= 0 ? 'done' : ''}"><span>🎯 ${c.name}</span>
      <b>${c.hp <= 0 ? '✔ 已摧毀' : `耐久 ${Math.ceil(c.hp)}${c.prep > 0.02 ? `｜防颱 ${Math.round(c.prep * 100)}%` : ''}`}</b>
      <div class="meter small"><div class="fill" style="width:${pct}%"></div></div></li>`;
  }).join('');
  $('stars').innerHTML = starChecks().map(c => `<li class="${c.ok ? 'ok' : ''}">${c.ok ? '★' : '☆'} ${c.text}</li>`).join('');

  const ranking = regionRanking();
  $('rank').innerHTML = ranking.length ? rankItems(ranking.slice(0, 6)) : '<li class="empty">尚無災情</li>';
  const destroyed = world.cities.filter(c => c.hp <= 0).length;
  $('cityStat').textContent = `${destroyed} / ${world.cities.length}`;
  $('lossStat').textContent = Math.round(ranking.reduce((s, r) => s + r.s * 100, 0));

  $('launchBtn').disabled = state !== 'draw' || path.length < 2 || drawing;
  $('clearBtn').disabled = state === 'run';
  $('newBtn').disabled = state === 'run';
  $('tyName').disabled = $('nameDice').disabled = state !== 'draw';
  $('fcDay').disabled = $('fcPlay').disabled = state !== 'draw';
  if (state !== 'draw' && ty) {
    $('fcDay').value = ty.day;
    $('fcLabel').textContent = `實況 第 ${ty.day.toFixed(1)} 天`;
  }
}

function rankItems(list) {
  return list.map(({ k, s, lv }) => {
    const c = LEVELS[lv - 1].color;
    return `<li><span>${regionName(k)}</span><b style="background:rgb(${c})">${LEVELS[lv - 1].name} ${Math.round(s * 100)}%</b></li>`;
  }).join('');
}

function setView(v) {
  view = v;
  document.querySelectorAll('.views button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  refreshLayers(true);
}

function setForecastDay(d) {
  forecastDay = d;
  $('fcDay').value = d;
  $('fcLabel').textContent = `第 ${d.toFixed(1)} 天`;
}

function stopForecast() {
  fcPlaying = false;
  $('fcPlay').textContent = '▶';
}

function log(text, kind = '') {
  const li = document.createElement('li');
  li.textContent = text;
  li.className = kind;
  $('log').prepend(li);
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  toastTimer = 1.8;
}

function toastOnce(text) {
  if (toastTimer <= 0 || $('toast').textContent !== text) toast(text);
}

// ===== 主迴圈 =====
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (state === 'run') {
    // 分小步模擬，加速時也保持穩定
    const steps = speedMul * 2;
    for (let k = 0; k < steps && state === 'run'; k++) step(dt * speedMul / steps);
    updateHud();
  }
  for (const c of world.cities) c.hitT = Math.max(0, c.hitT - dt);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.add('hidden');
  if (fcPlaying) {
    if (state !== 'draw' || forecastDay >= MAX_DAYS) stopForecast();
    else setForecastDay(Math.min(MAX_DAYS, forecastDay + dt * 2));
  }
  draw();
  tickTicker(dt);
  requestAnimationFrame(frame);
}

// ===== 按鈕 =====
$('launchBtn').onclick = launch;
$('nameDice').onclick = () => { $('tyName').value = randomName(); };
$('clearBtn').onclick = () => resetRun(true);
$('retryBtn').onclick = () => { resetRun(false); log('↩️ 同任務再挑戰'); };
$('nextBtn').onclick = () => newGame(Math.floor(Math.random() * 1e9));
$('newBtn').onclick = () => { if (state !== 'run') newGame(Math.floor(Math.random() * 1e9)); };
document.querySelectorAll('.mode button').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
document.querySelectorAll('.views button').forEach(b => { b.onclick = () => setView(b.dataset.view); });
$('fcDay').oninput = e => { stopForecast(); setForecastDay(+e.target.value); };
$('fcPlay').onclick = () => {
  if (fcPlaying) return stopForecast();
  if (forecastDay >= MAX_DAYS) setForecastDay(0);
  fcPlaying = true;
  $('fcPlay').textContent = '⏸';
};
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const v = { 1: 'sat', 2: 'sst', 3: 'shear', 4: 'flow' }[e.key];
  if (v) setView(v);
});
$('speedBtn').onclick = () => {
  speedMul = speedMul === 1 ? 2 : speedMul === 2 ? 4 : 1;
  $('speedBtn').textContent = `速度 ×${speedMul}`;
};

newGame(Math.floor(Math.random() * 1e9));
requestAnimationFrame(frame);

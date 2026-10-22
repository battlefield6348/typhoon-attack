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

// ===== 遊戲規則 =====
const SPEED = 100;               // 颱風移動速度：100 px = 1 天（約時速 20 公里）
const MAX_DAYS = 12;             // 颱風壽命上限
const MAX_PATH = SPEED * MAX_DAYS;
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
  ['鹿兒島', 130.56, 31.60, 100], ['大阪', 135.50, 34.69, 130], ['東京', 139.69, 35.69, 160],
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
  regionMap = { id, cells };
  return regionMap;
}

// 每個陸地格點到海岸的距離（格數）
function coastDistance(land) {
  const dist = new Int32Array(GW * GH).fill(-1), queue = [];
  for (let i = 0; i < land.length; i++) if (!land[i]) { dist[i] = 0; queue.push(i); }
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
  const nS = makeNoise(rand), nW = makeNoise(rand), nE = makeNoise(rand);
  const n = GW * GH;
  const land = rasterizeLand();
  const dist = coastDistance(land);
  const sst = new Float32Array(n), shear = new Float32Array(n), elev = new Float32Array(n);
  const shearRaw = new Float32Array(n), oceanShear = [];
  const ox = rand() * 100, oy = rand() * 100;

  for (let y = 0; y < GH; y++) {
    const lat = yToLat((y + 0.5) * CELL);
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x, lon = xToLon((x + 0.5) * CELL);
      if (land[i]) {
        const base = Math.min(dist[i] / 40, 1) * 0.45 * (0.6 + 0.8 * fbm(nE, x * 0.03, y * 0.03, 3));
        elev[i] = clamp(Math.max(base, ridgeHeight(lon, lat)), 0, 1);
      } else {
        // 每局隨機的海溫異常與高風切區，讓每次的天氣都不同
        sst[i] = climateSst(lon, lat) + (fbm(nS, ox + x * 0.01, oy + y * 0.01, 3) - 0.5) * 2.4;
        shearRaw[i] = fbm(nW, ox + x * 0.01, oy + y * 0.01, 3);
        oceanShear.push(shearRaw[i]);
      }
    }
  }

  const sth = percentile(oceanShear, 0.8);
  const smax = oceanShear.reduce((m, v) => Math.max(m, v), -Infinity);
  for (let y = 0; y < GH; y++) {
    const westerly = clamp((yToLat((y + 0.5) * CELL) - 28) / 10, 0, 1) * 0.4;   // 中緯度西風帶
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (land[i]) continue;
      const blob = clamp((shearRaw[i] - sth) / (smax - sth) * 1.3, 0, 1);
      shear[i] = clamp(blob + westerly, 0, 1);
    }
  }

  const cities = CITIES.map(([name, lon, lat, hp]) => ({
    name, x: lonToX(lon), y: latToY(lat), lon, lat, maxHp: hp, hp, hitT: 0, target: false,
  }));
  if (mode === 'mission') pickTargets(cities, rand);
  rasterizeRegions(land);
  return {
    seed, land, elev, sst, shear, cities,
    wake: new Float32Array(n),
    cellDmg: new Float32Array(n),                    // 每格累積破壞 0~1
    regionSum: new Float32Array(REGIONS.length),     // 每個行政區的累積破壞
    regionLevel: new Int8Array(REGIONS.length),      // 每個行政區的災情等級 0~5
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

function envAt(x, y) {
  const i = cellIndex(x, y);
  return {
    land: !!world.land[i], elev: world.elev[i], shear: world.shear[i],
    sst: world.sst[i] - world.wake[i], wake: world.wake[i], lon: xToLon(x), lat: yToLat(y),
    region: regionMap.id[i],
  };
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
      const add = Math.min(1 - world.cellDmg[i], ((wind - 20) / 40) ** 1.5 * 1.2 * dt);
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
  }
}

let dmgCanvas, dmgImg, dmgDirty = false;
function resetDamage() {
  world.cellDmg.fill(0);
  world.regionSum.fill(0);
  world.regionLevel.fill(0);
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

// ===== 背景繪製 =====
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

const SST_STOPS = [[22, [27, 58, 107]], [25, [31, 111, 159]], [26.5, [28, 154, 154]], [28.5, [217, 164, 65]], [31, [217, 84, 43]]];
const LAND_STOPS = [[0, [91, 140, 74]], [0.45, [138, 122, 92]], [1, [176, 160, 132]]];

let bg;
function renderBg() {
  const small = document.createElement('canvas');
  small.width = GW; small.height = GH;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(GW, GH), d = img.data;
  const { land, elev, sst } = world;
  const isOcean = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && !land[y * GW + x];

  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      let c;
      if (land[i]) {
        c = lerpStops(LAND_STOPS, elev[i]);
      } else {
        c = lerpStops(SST_STOPS, sst[i]);
        const warm = sst[i] >= 26.5;
        const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        if (warm && nb.some(([nx, ny]) => isOcean(nx, ny) && sst[ny * GW + nx] < 26.5)) c = [235, 245, 255];
      }
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);

  bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const bctx = bg.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(small, 0, 0, W, H);

  // 風切斜線
  const full = bctx.getImageData(0, 0, W, H), fd = full.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      if ((px + py) % 14 >= 3) continue;
      const s = world.shear[Math.floor(py / CELL) * GW + Math.floor(px / CELL)];
      if (s < 0.05) continue;
      const a = s * 0.65, k = (py * W + px) * 4;
      fd[k] = fd[k] * (1 - a) + 176 * a;
      fd[k + 1] = fd[k + 1] * (1 - a) + 92 * a;
      fd[k + 2] = fd[k + 2] * (1 - a) + 255 * a;
    }
  }
  bctx.putImageData(full, 0, 0);

  // 海岸線
  bctx.strokeStyle = 'rgba(25,35,30,0.85)';
  bctx.lineWidth = 1.2;
  traceLand(bctx, 1);
  bctx.stroke();

  // 行政區界線
  bctx.strokeStyle = 'rgba(30,30,30,0.3)';
  bctx.lineWidth = 0.6;
  bctx.beginPath();
  for (const reg of REGIONS) traceRings(bctx, reg.r, 1);
  bctx.stroke();

  // 經緯網格（每 5 度）
  bctx.strokeStyle = 'rgba(255,255,255,0.12)';
  bctx.fillStyle = 'rgba(255,255,255,0.55)';
  bctx.lineWidth = 1;
  bctx.font = `11px ${FONT}`;
  for (let lon = 110; lon < LON1; lon += 5) {
    const x = Math.round(lonToX(lon)) + 0.5;
    bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, H); bctx.stroke();
    bctx.fillText(`${lon}°E`, x + 3, H - 5);
  }
  for (let lat = 10; lat < LAT1; lat += 5) {
    const y = Math.round(latToY(lat)) + 0.5;
    bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(W, y); bctx.stroke();
    bctx.fillText(`${lat}°N`, 4, y - 4);
  }

  // 地區名稱
  bctx.textAlign = 'center';
  bctx.font = `bold 15px ${FONT}`;
  bctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (const [name, lon, lat] of REGION_LABELS) bctx.fillText(name, lonToX(lon), latToY(lat));
}

// 冷水尾跡圖層
let wakeCanvas, wakeImg, wakeDirty = false;
function resetWake() {
  world.wake.fill(0);
  wakeCanvas = document.createElement('canvas');
  wakeCanvas.width = GW; wakeCanvas.height = GH;
  wakeImg = wakeCanvas.getContext('2d').createImageData(GW, GH);
  for (let i = 0; i < GW * GH; i++) {
    wakeImg.data[i * 4] = 190; wakeImg.data[i * 4 + 1] = 230; wakeImg.data[i * 4 + 2] = 255;
  }
  wakeDirty = true;
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
      wakeImg.data[i * 4 + 3] = world.wake[i] / 4 * 190;
    }
  }
  wakeDirty = true;
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
let pathLen = 0;
let drawing = false;
let cum = [];              // 路徑累積長度
let ty = null;             // 颱風
let trail = [];
let hover = null;
let speedMul = 1;
let toastTimer = 0;

function newGame(seed) {
  world = genWorld(seed);
  renderBg();
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
  for (const c of world.cities) { c.hp = c.maxHp; c.hitT = 0; }
  resetWake();
  resetDamage();
  if (clearPath) { path = []; pathLen = 0; }
  ty = null; trail = [];
  state = 'draw';
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
  const env = envAt(p.x, p.y);
  if (env.land || !inGenesis(env.lon, env.lat)) {
    toast('颱風只能在「颱風生成區」的熱帶海面上生成！');
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  drawing = true;
  path = [p]; pathLen = 0;
  updateHud();
});

canvas.addEventListener('pointermove', e => {
  const p = toCanvas(e);
  hover = p;
  if (drawing) {
    const last = path[path.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d >= 5 && pathLen + d <= MAX_PATH) {
      path.push({ x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) });
      pathLen += d;
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
  if (path.length < 3) { path = []; pathLen = 0; }
  else {
    path = chaikin(chaikin(path));
    setStatus('準備', '路徑已畫好，按「發動颱風」');
  }
  updateHud();
}
canvas.addEventListener('pointerup', endDraw);
canvas.addEventListener('pointercancel', endDraw);

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
    cat: category(START_I).name, onLand: false, switchT: 0, factor: null, doneDay: null };
  trail = [{ x: ty.x, y: ty.y, I: ty.I }];
  state = 'run';
  log('🌀 颱風生成！', 'good');
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
    const potential = clamp((env.sst - 26) * 15, 0, MAX_I);
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
  ty.s = Math.min(ty.s + SPEED * dt, cum[cum.length - 1]);
  ty.day = ty.s / SPEED;
  const p = pointAt(ty.s);
  ty.x = p.x; ty.y = p.y;

  const env = envAt(ty.x, ty.y);
  const ch = intensityChange(env, ty.I);
  ty.I = clamp(ty.I + ch.dI * dt, 0, MAX_I);
  ty.factor = ch;
  ty.env = env;
  ty.peak = Math.max(ty.peak, ty.I);
  ty.rot += (0.6 + ty.I / 18) * dt;
  coolOcean(ty.x, ty.y, ty.I, dt);
  damageLand(ty.x, ty.y, ty.I, dt);

  // 持續一小段時間才算登陸 / 出海，避免沿海岸線時紀錄洗版
  ty.switchT = env.land !== ty.onLand ? ty.switchT + dt : 0;
  if (ty.switchT > 0.3) {
    ty.onLand = env.land;
    ty.switchT = 0;
    log(env.land ? '⚠️ 颱風登陸' : '🌊 颱風出海', env.land ? 'bad' : 'good');
  }
  const cat = category(ty.I).name;
  if (cat !== ty.cat) {
    const up = CATEGORY_ORDER.indexOf(cat) > CATEGORY_ORDER.indexOf(ty.cat);
    log(`${up ? '⬆️ 增強為' : '⬇️ 減弱為'}${cat}（${ty.I.toFixed(0)} m/s）`, up ? 'good' : 'bad');
    ty.cat = cat;
  }

  const last = trail[trail.length - 1];
  if (Math.hypot(ty.x - last.x, ty.y - last.y) > 3) trail.push({ x: ty.x, y: ty.y, I: ty.I });

  // 城市受災
  const R = damageRadius(ty.I);
  for (const c of world.cities) {
    if (c.hp <= 0) continue;
    const d = Math.hypot(c.x - ty.x, c.y - ty.y);
    if (d < R && ty.I > 17.2) {
      const dmg = Math.min(c.hp, (ty.I - 15) * 6 * (1 - d / R) * dt);
      c.hp -= dmg;
      c.hitT = 0.3;
      if (c.hp <= 0.01) {
        c.hp = 0;
        log(`💥 ${c.target ? '🎯 ' : ''}${c.name} 被摧毀！（第 ${ty.day.toFixed(1)} 天）`, 'hit');
      }
    }
  }

  if (mode === 'mission' && world.cities.every(c => !c.target || c.hp <= 0)) {
    ty.doneDay = ty.day;
    return finish('任務成功！');
  }
  if (ty.I < DEAD_I) return finish('颱風已消散');
  if (ty.s >= cum[cum.length - 1]) return finish('颱風走完預定路徑');
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
  log(`🏁 ${reason}`, ty.doneDay !== null ? 'good' : '');
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
  $('resultTitle').textContent = reason;
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
  ctx.drawImage(bg, 0, 0);
  if (wakeDirty) { wakeCanvas.getContext('2d').putImageData(wakeImg, 0, 0); wakeDirty = false; }
  ctx.drawImage(wakeCanvas, 0, 0, W, H);
  if (dmgDirty) { dmgCanvas.getContext('2d').putImageData(dmgImg, 0, 0); dmgDirty = false; }
  ctx.drawImage(dmgCanvas, 0, 0, W, H);
  drawGenesis();
  drawPath();
  drawTrail();
  drawCities();
  if (ty) drawTyphoon();
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

function drawPath() {
  if (path.length < 2) {
    if (path.length === 1) dot(path[0].x, path[0].y, 5, '#fff');
    return;
  }
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = state === 'draw' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (const p of path) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // 每天一個刻度
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  let acc = 0, nextDay = 1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (acc + seg >= nextDay * SPEED) {
      const t = (nextDay * SPEED - acc) / seg;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      if (nextDay % 2 === 0) ctx.fillText(`${nextDay}天`, x, y - 7);
      nextDay++;
    }
    acc += seg;
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
  const R = 14 + I * 0.7;
  const cat = category(I);
  ctx.save();
  ctx.translate(x, y);

  // 暴風圈
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = cat.color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, damageRadius(I), 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 雲團
  const g = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R * 1.3);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(235,240,248,0.45)');
  g.addColorStop(1, 'rgba(235,240,248,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();

  // 螺旋雲帶（北半球逆時針旋轉）
  ctx.rotate(-rot);
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    let px = null, py = null;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const r = R * 0.22 + t * R * 1.1;
      const a = k * Math.PI / 2 + t * 2.6;
      const nx = Math.cos(a) * r, ny = Math.sin(a) * r;
      if (px !== null) {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 - t * 0.7})`;
        ctx.lineWidth = (1 - t) * R * 0.22 + 1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      }
      px = nx; py = ny;
    }
  }

  // 颱風眼
  ctx.lineWidth = 3;
  ctx.strokeStyle = cat.color;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2); ctx.stroke();
  if (I >= 32.7) {
    ctx.fillStyle = 'rgba(20,32,52,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function dot(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
    $('envLabel').textContent = '游標位置環境';
    env = envAt(hover.x, hover.y);
    factor = intensityChange(env, 35);
  }
  if (env) {
    $('envPos').textContent = env.region >= 0 ? regionName(env.region) : `${env.lat.toFixed(1)}°N ${env.lon.toFixed(1)}°E`;
    $('envTerrain').textContent = env.land ? (env.elev > 0.5 ? '高山' : '平地') : '海洋';
    $('envSst').textContent = env.land ? '--'
      : `${env.sst.toFixed(1)} °C${env.wake > 0.1 ? `（尾跡 −${env.wake.toFixed(1)}）` : ''}`;
    $('envShear').textContent = env.land ? '--' : env.shear > 0.5 ? '強' : env.shear > 0.1 ? '中' : '弱';
    $('factor').textContent = factor.text;
    $('factor').className = `factor ${factor.kind}`;
  } else {
    ['envPos', 'envTerrain', 'envSst', 'envShear'].forEach(id => { $(id).textContent = '--'; });
    $('factor').textContent = '--';
    $('factor').className = 'factor';
  }

  const days = ty ? ty.day : pathLen / SPEED;
  $('dayBar').style.width = `${days / MAX_DAYS * 100}%`;
  $('dayVal').textContent = `${days.toFixed(1)} / ${MAX_DAYS} 天`;

  $('targets').innerHTML = world.cities.filter(c => c.target).map(c => {
    const pct = Math.round(c.hp / c.maxHp * 100);
    return `<li class="${c.hp <= 0 ? 'done' : ''}"><span>🎯 ${c.name}</span>
      <b>${c.hp <= 0 ? '✔ 已摧毀' : `耐久 ${Math.ceil(c.hp)}`}</b>
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
}

function rankItems(list) {
  return list.map(({ k, s, lv }) => {
    const c = LEVELS[lv - 1].color;
    return `<li><span>${regionName(k)}</span><b style="background:rgb(${c})">${LEVELS[lv - 1].name} ${Math.round(s * 100)}%</b></li>`;
  }).join('');
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
  draw();
  requestAnimationFrame(frame);
}

// ===== 按鈕 =====
$('launchBtn').onclick = launch;
$('clearBtn').onclick = () => resetRun(true);
$('retryBtn').onclick = () => { resetRun(false); log('↩️ 同任務再挑戰'); };
$('nextBtn').onclick = () => newGame(Math.floor(Math.random() * 1e9));
$('newBtn').onclick = () => { if (state !== 'run') newGame(Math.floor(Math.random() * 1e9)); };
document.querySelectorAll('.mode button').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
$('speedBtn').onclick = () => {
  speedMul = speedMul === 1 ? 2 : speedMul === 2 ? 4 : 1;
  $('speedBtn').textContent = `速度 ×${speedMul}`;
};

newGame(Math.floor(Math.random() * 1e9));
requestAnimationFrame(frame);

// خيار 1: استخدام 4000 range (حسب تصميم النظام)
const PORT_RANGES = {
  api: { start: 3000, end: 3099 },      // API: 3003
  ui: { start: 4000, end: 4099 },        // UI: 4008
  worker: { start: 4100, end: 4199 },     // Worker: 4100
  websocket: { start: 4200, end: 4299 }   // WebSocket: 4200
};

// خيار 2: استخدام 8000 series (مألوف للمطورين)
const PORT_RANGES = {
  api: { start: 3000, end: 3099 },      // API: 3003
  ui: { start: 8000, end: 8099 },        // UI: 8088
  worker: { start: 9000, end: 9099 },     // Worker: 9000
  websocket: { start: 3010, end: 3019 }   // WebSocket: 3011
};

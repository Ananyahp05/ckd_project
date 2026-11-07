import { Capacitor } from "@capacitor/core";

export const API_BASE_URL = Capacitor.isNativePlatform()
  ? "http://10.0.2.2:8000"
  : "http://localhost:8000";

export const WS_BASE_URL = Capacitor.isNativePlatform()
  ? "ws://10.0.2.2:8000"
  : "ws://localhost:8000";
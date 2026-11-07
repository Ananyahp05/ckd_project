import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ckdproject.health',
  appName: 'CKD AI Predictor',
  webDir: 'out',

  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
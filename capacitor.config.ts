import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.quangtu.tutam',
  appName: 'Tu tập',
  webDir: 'build',
  zoomEnabled: false,
  android: {
    // MainActivity xử lý cả IME; handler mặc định chỉ tính system bars/cutout.
    adjustMarginsForEdgeToEdge: 'disable',
    // Android dùng AppSystemBars; iOS vẫn giữ StatusBar và toàn bộ plugin hiện có.
    includePlugins: [
      '@capacitor-community/apple-sign-in',
      '@capacitor/app',
      '@capacitor/filesystem',
      '@capacitor/local-notifications',
      '@codetrix-studio/capacitor-google-auth',
    ],
  },
  server: {
    // Keep the main WebView on bundled assets. Capacitor opens external pages
    // separately, while API requests and media can still use remote URLs.
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    // API quangtu.vn không trả header CORS cho origin https://localhost của WebView,
    // nên fetch từ app bị chặn ("Load failed") -> Pháp thoại 0 album, sách không mở.
    // CapacitorHttp vá window.fetch/XHR đi qua HTTP native => không bị CORS.
    CapacitorHttp: {
      enabled: true
    },
    CapacitorCookies: {
      enabled: true
    },
    GoogleAuth: {
      iosClientId: process.env.VITE_GOOGLE_IOS_CLIENT_ID,
      scopes: ['profile', 'email'],
      serverClientId: '18472854734-2hpib1tghifb2li4s42vqaqvthfbn1jp.apps.googleusercontent.com',
      clientId: '18472854734-2hpib1tghifb2li4s42vqaqvthfbn1jp.apps.googleusercontent.com',
      forceCodeForRefreshToken: false
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#FFFAF2',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    LocalNotifications: {
      smallIcon: 'ic_notification_small',
      iconColor: '#C8963E',
      sound: 'default'
    }
  }
};

export default config;

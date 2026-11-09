import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.quangtu.tutam',
  appName: 'Tu tập',
  webDir: 'build',
  android: {
    // MainActivity xử lý cả IME; handler mặc định chỉ tính system bars/cutout.
    adjustMarginsForEdgeToEdge: 'disable',
    // Android dùng AppSystemBars; iOS vẫn giữ StatusBar và toàn bộ plugin hiện có.
    includePlugins: [
      '@capacitor-community/apple-sign-in',
      '@capacitor-community/facebook-login',
      '@capacitor/app',
      '@capacitor/filesystem',
      '@capacitor/local-notifications',
      '@codetrix-studio/capacitor-google-auth',
    ],
  },
  server: {
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'quangtu.vn',
      '*.quangtu.vn',
      'media.quangtu.vn',
      'archive.org',
      '*.archive.org',
      // URL dự phòng – hoạt động miễn phí vĩnh viễn kể cả khi quangtu.vn hết hạn
      'quangtu-web.quangtu-ansitoanthu.workers.dev',
      'quangtu.vercel.app',
      'accounts.google.com',
      'drive.google.com',
      '*.google.com',
      '*.googleusercontent.com',
      'facebook.com',
      '*.facebook.com',
      'appleid.apple.com'
    ]
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
    FacebookLogin: {
      appId: '2174388996483129',
      appName: 'Tu tập',
      permissions: ['public_profile', 'email']
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

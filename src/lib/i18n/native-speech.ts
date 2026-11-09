export function nativeSpeechErrorMessage(code: string | undefined, platform: string, locale = 'vi'): string {
  const missing = code === 'MISSING_ENGINE' || code === 'MISSING_VOICE';
  if (locale.startsWith('en')) {
    if (missing || code === 'NETWORK_ERROR') return platform === 'ios'
      ? 'Install a voice for this language in the speech settings under iPhone Settings → Accessibility, then try again.'
      : 'Install an offline voice for this language in Android Settings → Text-to-speech output, then try again.';
    return 'Unable to play speech. Check the device speech engine and media volume.';
  }
  if (platform === 'ios' && (missing || code === 'NETWORK_ERROR')) {
    return 'Thiết bị chưa có giọng đọc phù hợp. Hãy tải giọng đọc trong phần Cài đặt iPhone → Trợ năng, rồi thử lại.';
  }
  if (missing) return 'Thiết bị chưa có giọng đọc phù hợp. Hãy cài hoặc bật giọng tiếng Việt trong Cài đặt Android → Chuyển văn bản thành giọng nói.';
  if (code === 'NETWORK_ERROR') return 'Giọng đọc cần mạng nhưng chưa kết nối được. Hãy tải giọng tiếng Việt ngoại tuyến trong Cài đặt Android → Chuyển văn bản thành giọng nói, rồi thử đọc lại.';
  return 'Không thể phát giọng đọc. Vui lòng kiểm tra bộ đọc văn bản và âm lượng đa phương tiện trên thiết bị.';
}

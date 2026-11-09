const talkTopicNamesEn: Record<string, string> = {
  'Nhân quả': 'Karma',
  'Vô thường': 'Impermanence',
  'Sám hối': 'Repentance',
  'Thiền định': 'Meditation',
  'Luân hồi': 'Rebirth',
  'Hành thiện': 'Good deeds',
  'Pháp ngữ': 'Dharma sayings',
  'Câu chuyện': 'Stories',
  'Tổng hợp': 'General',
};

export function localizeTalkTopic(topic: string | undefined, locale: 'vi' | 'en'): string {
  const name = String(topic || 'Pháp ngữ');
  return locale === 'en' && Object.prototype.hasOwnProperty.call(talkTopicNamesEn, name.trim()) ? talkTopicNamesEn[name.trim()] : name;
}

export const talkVideoText = {
  vi: {
    video: 'Video',
    fullscreen: 'Mở rộng',
    list: 'Danh sách bài',
    back: 'Quay lại',
    previous: 'Bài trước',
    next: 'Bài tiếp theo',
    rewind: 'Lùi 10 giây',
    forward: 'Tiến 30 giây',
    play: 'Phát',
    pause: 'Tạm dừng',
    seek: 'Vị trí phát video',
    track: 'Bài',
    playing: 'Đang phát',
    backgroundHint: 'Bạn có thể khóa màn hình và tiếp tục nghe',
    hintTimeout: 'Thông báo sẽ tự ẩn sau 5 giây',
    controlError: 'Chưa thực hiện được thao tác. Vui lòng thử lại.',
    searchTracks: 'Tìm bài trong album',
    noTracks: 'Không có bài phù hợp. Thử từ khóa khác.',
    unavailable: 'Chưa hiển thị được video. Bạn vẫn có thể nghe âm thanh.',
  },
  en: {
    video: 'Video',
    fullscreen: 'Expand',
    list: 'Track list',
    back: 'Back',
    previous: 'Previous track',
    next: 'Next track',
    rewind: 'Back 10 seconds',
    forward: 'Forward 30 seconds',
    play: 'Play',
    pause: 'Pause',
    seek: 'Video playback position',
    track: 'Track',
    playing: 'Playing',
    backgroundHint: 'You can lock your screen and keep listening',
    hintTimeout: 'This message disappears after 5 seconds',
    controlError: 'Unable to complete the action. Please try again.',
    searchTracks: 'Find a track in this album',
    noTracks: 'No matching tracks. Try another search.',
    unavailable: 'Video is unavailable. Audio playback can continue.',
  },
};

const vi = {
  beginner: 'Hướng dẫn tu tập cho người mới',
  dharma: 'Bố thí pháp — Độ vong linh',
  study: 'Hướng dẫn tu học Phật pháp',
  reminder: 'Nhắc ngày Thập Trai & Tu tập',
  reflection: 'Quán chiếu việc thiện ác trong ngày', reflectionDescription: 'Nhìn lại bản thân, chia sẻ và cùng tùy hỷ việc thiện lành',
  mindfulCommunity: 'Cộng đồng', mindfulCommunityDescription: 'Cùng cầu nguyện, tùy hỷ công đức',
};

const en = {
  beginner: 'Practice guide for beginners',
  dharma: 'Dharma giving — Helping departed spirits',
  study: 'Buddhist practice guide',
  reminder: 'Fasting & practice reminders',
  reflection: 'Reflect on today’s good and unwholesome deeds', reflectionDescription: 'Reflect, share prayers and rejoice in good deeds',
  mindfulCommunity: 'Community', mindfulCommunityDescription: 'Share prayers and rejoice in merit',
};

export function getPracticeEntryCopy(isEn: boolean) {
  return isEn ? en : vi;
}

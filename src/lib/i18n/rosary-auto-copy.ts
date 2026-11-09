export const rosaryAutoCopy = {
  vi: {
    manual: 'Thủ công', automatic: 'Tự động gõ mõ', mode: 'Chế độ lần hạt',
    speed: 'Tốc độ', target: 'Số biến trong phiên', beads: 'biến',
    tempos: ['Rất chậm · 30 nhịp/phút', 'Chậm · 40 nhịp/phút', 'Vừa · 60 nhịp/phút', 'Tinh tấn · 80 nhịp/phút'],
    start: 'Bắt đầu gõ mõ', pause: 'Tạm dừng', resume: 'Tiếp tục', stop: 'Dừng nhịp', preparing: 'Đang chuẩn bị nhịp mõ…',
    complete: 'Đã đủ số biến mục tiêu', paused: 'Đã tạm dừng', playing: 'Đang hành trì', ready: 'Sẵn sàng hành trì',
    failed: 'Chưa phát được nhịp mõ. Vui lòng thử lại.', tooLong: 'Mục tiêu tự động tối đa 10.800 biến trong một phiên.',
    automaticHint: 'Hạt tự chuyển theo tiếng mõ',
    encouragement: 'Chế độ nâng cao tự động gõ mõ, quý phật tử nhiếp tâm sâu sắc vào câu niệm phật, câu chú hoặc danh hiệu bổn tôn của quý vị vào tiềm thức để dễ bước vào cảnh giới "Bất niệm tự niệm"',
  },
  en: {
    manual: 'Manual', automatic: 'Automatic rhythm', mode: 'Counting mode',
    speed: 'Tempo', target: 'Session recitation target', beads: 'recitations',
    tempos: ['Very slow · 30 beats/min', 'Slow · 40 beats/min', 'Moderate · 60 beats/min', 'Diligent · 80 beats/min'],
    start: 'Start rhythm', pause: 'Pause', resume: 'Resume', stop: 'Stop rhythm', preparing: 'Preparing the rhythm…',
    complete: 'Recitation target reached', paused: 'Paused', playing: 'Practice in progress', ready: 'Ready to practice',
    failed: 'The rhythm could not be played. Please try again.', tooLong: 'The automatic target is limited to 10,800 recitations per session.',
    automaticHint: 'Beads advance with the wooden-fish rhythm',
    encouragement: 'With this advanced automatic wooden-fish rhythm, gently focus on your Buddha name, mantra or chosen sacred name, allowing mindful recitation to settle deeply and become natural and effortless.',
  },
} as const;

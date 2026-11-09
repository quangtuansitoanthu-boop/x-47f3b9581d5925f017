export type PreceptAnswer = 'kept' | 'review';
export interface PreceptRecord { date: string; answers: PreceptAnswer[] }
const DAY_MS = 86_400_000;
function dateTime(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
}
export function normalizePreceptRecords(value: unknown): PreceptRecord[] {
  if (!Array.isArray(value)) return [];
  const days = new Map<string, PreceptRecord>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Partial<PreceptRecord>;
    if (typeof row.date !== 'string' || !Number.isFinite(dateTime(row.date)) || !Array.isArray(row.answers)
      || row.answers.length !== 5 || !row.answers.every(answer => answer === 'kept' || answer === 'review')) continue;
    days.set(row.date, { date: row.date, answers: [...row.answers] });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function recordPreceptDay(records: PreceptRecord[], date: string, answers: string[]): PreceptRecord[] {
  const next = normalizePreceptRecords([{ date, answers }]);
  if (next.length !== 1) throw new Error('Complete all five reflections before saving.');
  return normalizePreceptRecords([...records.filter(row => row.date !== date), ...next]);
}
export function getPreceptStats(records: PreceptRecord[], today: string) {
  const kept = normalizePreceptRecords(records).filter(row => row.date <= today && row.answers.every(answer => answer === 'kept'));
  let longest = 0, run = 0, previous = NaN;
  for (const row of kept) {
    const time = dateTime(row.date);
    run = time - previous === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = time;
  }
  const current = previous >= dateTime(today) - DAY_MS ? run : 0;
  return { total: kept.length, current, longest };
}

// Nội dung hướng dẫn của chương trình; không gán lời biên soạn thành lời kinh.
export const PRECEPTS = [
  {
    id: 'life', icon: 'Leaf', title: ['Không sát sinh', 'Respect life'],
    warning: ['Một hành động vì nóng giận hoặc tiện lợi có thể chấm dứt một mạng sống. Hãy dừng lại trước khi làm hại.', 'An act of anger or convenience can end a life. Pause before causing harm.'],
    tasks: [
      ['Không cố ý giết, xúi giục hoặc sai khiến người khác giết sinh vật.', 'Do not deliberately kill or encourage others to kill.'],
      ['Di chuyển côn trùng ra ngoài an toàn khi có thể; không đánh đập, hành hạ động vật.', 'Move insects safely when possible; do not mistreat animals.'],
      ['Trước bữa ăn, xem lại nguồn thức ăn; không đặt giết con vật để phục vụ mình.', 'Consider food sources; do not order an animal killed for you.']
    ],
    levels: [
      ['Hạ', 'Foundation', 'Không cố ý sát sinh, tránh làm hại, bảo vệ sự sống; không xúi giục hoặc sai khiến sát sinh.', 'Do not intentionally kill or encourage killing; protect life.'],
      ['Trung', 'Developing', 'Giữ bậc Hạ; nếu ăn thịt, chỉ dùng tam tịnh nhục: không thấy, không nghe, không nghi con vật bị giết riêng cho mình.', 'Keep the foundation; if eating meat, it must not be seen, heard or suspected to have been killed specifically for you.'],
      ['Thượng', 'Advanced', 'Giữ các bậc trước, ăn chay trường, không sát hại; tu tập để không còn khởi ý sát trong tâm.', 'Keep earlier commitments, follow a vegetarian diet and cultivate a mind free from the intention to kill.']
    ]
  },
  {
    id: 'property', icon: 'Hand', title: ['Không trộm cắp', 'Respect property'],
    warning: ['Lấy điều không được cho làm người khác tổn thất và phá vỡ lòng tin. Một món nhỏ cũng cần sự đồng ý.', 'Taking what is not given causes loss and breaks trust. Permission matters even for small things.'],
    tasks: [
      ['Xin phép trước khi lấy, dùng hoặc chuyển đồ của người khác.', 'Ask before taking, using or moving another person’s belongings.'],
      ['Trả đồ mượn, tiền thừa; tìm cách trả lại của rơi cho chủ.', 'Return borrowed items and excess change; seek the owner of lost property.'],
      ['Không gian lận tiền, thời gian làm việc, tài sản chung hoặc giao dịch.', 'Do not cheat in transactions or misuse shared property or working time.']
    ], levels: []
  },
  {
    id: 'conduct', icon: 'Heart', title: ['Không tà dâm', 'Responsible sexual conduct'],
    warning: ['Sự phản bội, ép buộc và nuôi dưỡng thói quen khiêu dâm có thể làm tổn thương bản thân, người bạn đời và gia đình. Nhận biết cám dỗ trước khi hành động.', 'Betrayal, coercion and pornography habits can harm you and your relationships. Recognize temptation before acting.'],
    tasks: [
      ['Không ngoại tình, không lừa dối hoặc ép buộc; tôn trọng sự đồng thuận và cam kết.', 'Do not betray, deceive or coerce; respect consent and commitments.'],
      ['Theo chương trình: không thủ dâm, không xem phim đen hoặc nội dung khiêu dâm; tránh nguồn kích thích.', 'In this programme: abstain from masturbation and pornography; avoid triggers.'],
      ['Kiêng quan hệ vợ chồng vào Thập trai, ngày vía Phật, Bồ Tát và ngày kiêng theo Thọ Khang Bảo Giám; trao đổi để vợ chồng cùng tự nguyện thực hành.', 'Voluntarily observe the programme’s abstinence calendar on fasting, Buddhist holy and traditional observance days; discuss it respectfully with your spouse.']
    ],
    levels: [
      ['Hạ', 'Foundation', 'Không ngoại tình, không thủ dâm, không xem nội dung khiêu dâm; kiêng quan hệ vợ chồng vào các ngày kiêng của chương trình.', 'No adultery, masturbation or pornography; observe the programme’s abstinence days.'],
      ['Trung', 'Developing', 'Giữ đầy đủ bậc Hạ, giảm tần suất quan hệ vợ chồng; còn ý dâm dục nhưng nhận biết, tiết chế và chuyển hóa. Không áp đặt số lần.', 'Keep the foundation and reduce marital sexual frequency voluntarily; recognize and work with remaining desire. No fixed quota.'],
      ['Thượng', 'Advanced', 'Không hành dâm, sống đời tịnh hạnh; tu tập đến chỗ không còn khởi ý dâm dục.', 'Live a celibate life and cultivate freedom from sexual desire.']
    ]
  },
  {
    id: 'speech', icon: 'MessageCircle', title: ['Không nói dối', 'Speak truthfully'],
    warning: ['Một lời sai có thể làm người khác quyết định sai và mất lòng tin lâu dài. Đừng vì lợi trước mắt mà gây hại bằng lời nói.', 'A lie can mislead someone and damage lasting trust. Do not trade truth for short-term gain.'],
    tasks: [
      ['Nói đúng điều mình biết; chưa rõ thì nói chưa rõ, không bịa chuyện.', 'Say what you know; acknowledge uncertainty rather than inventing facts.'],
      ['Không chia sẻ tin chưa kiểm chứng, vu khống hoặc che giấu để trục lợi.', 'Do not spread unverified claims, slander or conceal facts for personal gain.'],
      ['Nếu đã nói sai, đính chính và xin lỗi người bị ảnh hưởng.', 'Correct false statements and apologize to those affected.']
    ], levels: []
  },
  {
    id: 'sobriety', icon: 'CupSoda', title: ['Không dùng chất say nghiện', 'Stay clear-minded'],
    warning: ['Mất tỉnh táo dễ dẫn đến hành động thiếu kiểm soát và làm tổn thương người khác. Chuẩn bị lời từ chối trước khi được mời.', 'Intoxication weakens judgment and may lead to harm. Prepare a refusal before being offered a drink.'],
    tasks: [
      ['Không uống rượu bia, không dùng chất gây say để vui chơi; chọn thức uống không cồn.', 'Avoid recreational alcohol and intoxicants; choose an alcohol-free drink.'],
      ['Từ chối lời rủ rê; rời tình huống dễ mất tự chủ, nhờ người tin cậy hỗ trợ.', 'Decline invitations, leave risky situations and seek trusted support.'],
      ['Thuốc điều trị dùng đúng hướng dẫn; không tự ngừng thuốc hoặc cai đột ngột khi có lệ thuộc.', 'Use prescribed medicine as directed; do not stop treatment or abruptly withdraw when dependent.']
    ], levels: []
  }
] as const;

export const PRECEPT_MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365, 730, 1095, 1825, 3650, 5475, 7300] as const;

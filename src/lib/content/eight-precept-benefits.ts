import type { BilingualText } from './precept-practice-content';

// Nội dung do người dùng cung cấp; chỉ chuẩn hóa lỗi gõ và khoảng trắng.
export const EIGHT_PRECEPT_PREPARATION: readonly BilingualText[] = [
  ['Theo phép thọ Bát quan trai giới, người thọ giới phải đến chùa cầu một thầy Tỳ kheo trai giới thanh tịnh truyền cho. Về nghi thức có thầy truyền giới thì thứ lớp rất nhiều.', 'To receive the Eight Precepts, one should go to a temple and request transmission from a bhikkhu who observes the precepts purely. A ceremony led by a precept teacher includes many stages.'],
  ['Ngoài trường hợp trên, nếu không có thuận tiện để cầu thầy truyền cho, thì phương tiện tự mình đối trước tượng Phật, theo phép như sau đây mà tự thọ.', 'If circumstances do not permit requesting transmission from a teacher, one may provisionally undertake the precepts before a Buddha image, following the ceremony below.'],
  ['Một điều cốt yếu, trước khi thọ giới, giới tử phải sắp đặt chuyện nhà có người thay thế, không còn lo nghĩ việc gì ở thế gian cả, để cho tâm trí yên tịnh, như thế thì 24 giờ thọ giới mới được nhiều lợi ích. Muốn được lợi ích nhiều, giới tử nên vào chùa thọ Bát quan trai giới tốt hơn.', 'Before undertaking the precepts, it is essential to arrange for someone to take care of household responsibilities, setting aside worldly concerns so that the mind can be peaceful throughout the 24-hour observance. For greater benefit, it is preferable to observe the Eight Precepts at a temple.'],
];

// Tóm lược, không chép nguyên bài: https://vanhoaphatgiaovietnam.net/thu-vien/sing/cong-duc-vo-luong-cua-bat-quan-trai-gioi-757
export interface EightPreceptBenefit {
  id: string;
  title: BilingualText;
  body: BilingualText;
}

// Tham khảo, biên soạn ngắn: https://tuhuyen.com/bat-quan-trai-gioi-tai-nha/
export const EIGHT_PRECEPT_HOME_GUIDANCE: readonly { id: string; title: BilingualText; body: BilingualText }[] = [
  { id: 'day', title: ['Chọn ngày', 'Choose a day'], body: ['Chọn ngày thuận tiện; không chỉ giới hạn trong lục trai nhật.', 'Choose a suitable day, not only traditional observance dates.'] },
  { id: 'clothing', title: ['Y phục', 'Clothing'], body: ['Vệ sinh sạch sẽ, mặc y phục kín đáo, giản dị.', 'Wash beforehand and wear clean, modest clothing.'] },
  { id: 'meal', title: ['Hiểu đúng chữ trai', 'Meal discipline'], body: ['Ăn chay không thay việc giữ tám giới. Chuẩn bị bữa trước giờ ngọ; việc dùng thuốc nên hỏi người hướng dẫn.', 'Vegetarian eating does not replace the eight precepts. Plan meals before noon; discuss medication with your teacher.'] },
  { id: 'phone', title: ['Điện thoại', 'Phone use'], body: ['Hạn chế giải trí; chỉ dùng khi cần liên lạc, đọc kinh hoặc nghe pháp. Đây không phải giới thứ chín.', 'Limit entertainment; use it mindfully for essential calls or Dharma study, without adding a ninth precept.'] },
  { id: 'renewal', title: ['Sau thời khóa', 'After observance'], body: ['Đủ một ngày một đêm, hồi hướng và tự nhìn lại. Muốn tiếp tục, phát nguyện cho thời khóa mới.', 'After a day and night, dedicate and reflect. Renew the commitment for another observance.'] },
];

export const EIGHT_PRECEPT_BENEFITS: {
  title: BilingualText;
  introduction: BilingualText;
  items: readonly EightPreceptBenefit[];
  closing: BilingualText;
} = {
  title: ['Công đức của trai giới', 'The merits of observance'],
  introduction: ['Thọ trì một ngày một đêm giúp vun bồi thiện nghiệp. Các công đức sau được hiểu trong niềm tin Phật giáo.', 'A day-and-night observance cultivates wholesome conduct. These merits express Buddhist teachings and aspirations.'],
  items: [
    { id: 'peace', title: ['Thân tâm an ổn', 'Inner ease'], body: ['Sống tiết chế, bớt tham cầu.', 'Practise restraint and contentment.'] },
    { id: 'purification', title: ['Chuyển hóa nghiệp xấu', 'Purifying conduct'], body: ['Sám hối, tránh điều ác.', 'Repent and abandon harm.'] },
    { id: 'good-destinations', title: ['Xa đường dữ', 'Wholesome destinations'], body: ['Gieo nhân tái sinh lành.', 'Nurture wholesome rebirth.'] },
    { id: 'protection', title: ['Bớt duyên tai họa', 'Fewer harmful conditions'], body: ['Nuôi dưỡng thiện lành.', 'Cultivate goodness.'] },
    { id: 'merit', title: ['Tăng trưởng phước lành', 'Growing merit'], body: ['Trân quý ngày giữ giới.', 'Value sincere observance.'] },
    { id: 'future', title: ['Đời sau tốt đẹp', 'A noble future'], body: ['Gieo duyên sống chân chánh.', 'Plant wholesome causes.'] },
    { id: 'heaven', title: ['Duyên sinh cõi trời', 'Heavenly rebirth'], body: ['Hướng đến thiện thú.', 'Aspire to fortunate destinations.'] },
    { id: 'pure-land', title: ['Nguyện sinh Cực Lạc', 'Pure Land aspiration'], body: ['Hồi hướng, phát nguyện.', 'Dedicate merit sincerely.'] },
    { id: 'dignity', title: ['Tướng hảo trang nghiêm', 'Dignified qualities'], body: ['Bồi đắp nhân thanh tịnh.', 'Cultivate purity.'] },
  ],
  closing: ['Tinh tấn giữ đủ tám giới.', 'Observe all eight precepts diligently.'],
};

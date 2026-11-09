export interface ReflectionGuideSection {
  id: string;
  badge?: string;
  title: string;
  scriptureQuote?: {
    source: string;
    text: string;
  };
  paragraphs: string[];
  bulletPoints?: string[];
  example?: {
    title: string;
    text: string;
    wordCount: number;
    explanation: string;
  };
}

export const REFLECTION_GUIDE_SECTIONS: Record<'vi' | 'en', ReflectionGuideSection[]> = {
  vi: [
    {
      id: 'repentance-community',
      badge: 'BÀI HỌC 1 · PHÁT LỒ SÁM HỐI',
      title: 'Sám Hối Trước Đại Chúng & Năng Lực Tiêu Trừ Nghiệp Chướng',
      scriptureQuote: {
        source: 'Luận Đại Trí Độ & Kinh Nghiệp Báo Sai Biệt',
        text: 'Tội lỗi nếu giấu kín trong lòng như mầm độc chôn sâu dưới đất tối ẩm, ngày càng đâm rễ bám sâu thành ác nghiệp muôn kiếp. Nhưng khi phát lộ phơi bày ra ánh sáng mặt trời trước Tam Bảo và đại chúng thiện tri thức, mầm độc liền khô héo và bị thiêu rụi hoàn toàn.',
      },
      paragraphs: [
        'Sám là ăn năn lỗi trước, Hối là chừa bỏ lỗi sau, thề không tái phạm. Đối lập với sám hối là "phú tàng" — tức che giấu, bưng bít lỗi lầm của chính mình.',
        'Việc sám hối việc ác với đại chúng sẽ nhanh chóng tiêu trừ nghiệp chướng hơn rất nhiều so với việc che giấu một mình. Khi cúi đầu nhận lỗi trước đại chúng, tâm kiêu mạn và sĩ diện hão huyền lập tức bị phá vỡ, thay vào đó là tâm hổ thẹn (Tàm) và ghê sợ tội ác (Quý) — hai thiện pháp tối thượng nâng đỡ sự thanh tịnh của hành giả.',
        'Đặc biệt, nếu có thể dũng cảm sám hối với PHÁP DANH THẬT, HỌ TÊN THẬT, ĐỊA CHỈ THẬT CỤ THỂ thì tốc độ tiêu nghiệp sẽ càng nhanh chóng vượt bậc. Bởi vì:',
      ],
      bulletPoints: [
        'Triệt tiêu hoàn toàn lớp vỏ ngụy trang của bản ngã: Bạn dũng cảm đối diện 100% với sự thật và nhân quả, không trốn tránh sau sự ẩn danh.',
        'Tâm chí thành đạt đến cảnh giới tột cùng: "Tâm tạo nghiệp, tâm giải nghiệp" — khi tâm ăn năn đạt đến độ cùng cực, năng lượng chấn động tâm thức đủ sức làm rúng động và chuyển hóa định nghiệp sâu nặng.',
        'Cộng hưởng oai lực chú nguyện của đại chúng: Đại chúng biết rõ người đang sám hối, khởi tâm từ bi cùng hồi hướng chú nguyện, như dòng nước cam lộ mát lành dội sạch uế trược nhiều đời.',
      ],
    },
    {
      id: 'rejoicing-merit',
      badge: 'BÀI HỌC 2 · TÙY HỶ CÔNG ĐỨC',
      title: 'Chia Sẻ Việc Thiện Lành — Ngọn Đuốc Mồi Trăm Ngàn Ngọn Đuốc',
      scriptureQuote: {
        source: 'Kinh Tứ Thập Nhị Chương (Chương 10 - Tùy Hỷ Thụ Phước)',
        text: 'Đức Phật dạy: Thấy người làm việc bố thí mà vui vẻ giúp đỡ, tán thán thì được phước rất lớn. Sa-môn hỏi: Thế thì phước của người kia có hết chăng? Phật đáp: Ví như ngọn lửa của một cây đuốc, có hàng trăm ngàn người mang đuốc đến chia nhau mồi lửa đem về thắp sáng và nấu ăn, thì ngọn đuốc ban đầu vẫn sáng rực y như cũ. Phước báo của sự tùy hỷ cũng y như thế!',
      },
      paragraphs: [
        'Việc chia sẻ việc thiện lành để đại chúng cùng khởi tâm tùy hỷ sẽ nhân phước lên rất nhiều lần. Chia sẻ ở đây không phải để khoe khoang bản ngã hay cầu danh, mà là để thắp sáng ngọn đuốc thiện pháp giữa cõi đời.',
        'Khi một người đọc được và thật sự tùy hỷ tùy tâm hoan hỷ từ đáy lòng với việc thiện lành của bạn, người đó được nhân công đức lên BẰNG VỚI NGƯỜI LÀM VIỆC THIỆN ĐÓ.',
        'Và kỳ diệu thay, chính vì bạn là người gieo duyên khởi xướng, làm nhân tố khơi dậy tâm Bồ-đề và niệm lành trong tâm đại chúng, nên công đức của bạn được NHÂN LÊN GẤP BỘI PHẦN tương ứng với sự cộng hưởng hoan hỷ của muôn người! Một ngọn lửa ban đầu đã thắp sáng cả biển đuốc rực rỡ xua tan bóng tối.',
      ],
    },
    {
      id: 'reflection-structure',
      badge: 'BÀI HỌC 3 · QUY CHUẨN ĐỦ Ý',
      title: 'Cấu Trúc Một Bài Quán Chiếu "Đủ Ý" (Tối Thiểu 50 Từ)',
      paragraphs: [
        'Để việc quán chiếu đạt được công năng soi rọi sâu sắc ba nghiệp Thân – Khẩu – Ý, ứng dụng quy định mỗi bài viết cần đạt TỐI THIỂU 50 TỪ trước khi chia sẻ đại chúng. Dưới đây là cấu trúc gợi ý chuẩn mực:',
      ],
      bulletPoints: [
        'Cấu trúc bài SÁM HỐI LỖI LẦM (4 phần cốt lõi): (1) Bối cảnh sự việc xảy ra khi nào, với ai? (2) Nhận diện tâm niệm lúc đó (tham, sân, si, kiêu mạn hay bất cẩn)? (3) Cảm xúc hổ thẹn, ân hận vì đã gây tổn thương; (4) Lời phát nguyện sửa đổi dứt khoát và hướng khắc phục cụ thể.',
        'Cấu trúc bài VIỆC THIỆN LÀNH (3 phần cốt lõi): (1) Hoàn cảnh và hành động thiện lành đã thực hiện; (2) Tâm thái khi làm việc thiện (từ bi, hoan hỷ, không cầu danh, không vụ lợi); (3) Hồi hướng công đức đến khắp pháp giới chúng sinh cùng hưởng phần an lạc.',
      ],
      example: {
        title: 'Ví dụ bài Sám hối đủ ý',
        text: 'Trưa nay trong bữa cơm gia đình, vì công việc áp lực nên con đã không kiềm chế được cơn giận, lớn tiếng gắt gỏng với mẹ khiến mẹ buồn lòng. Con nhận thấy đây là khẩu nghiệp do tâm sân và thiếu chánh niệm. Con xin chí thành phát lồ sám hối trước Tam Bảo và đại chúng, nguyện từ nay thực tập ái ngữ, giữ tâm nhu hòa.',
        wordCount: 70,
        explanation: 'Bài viết gồm 3 câu ngắn gọn nhưng thể hiện trọn vẹn: hoàn cảnh + nhận diện tâm sân + ăn năn chân thành + phát nguyện thực hành ái ngữ.',
      },
    },
    {
      id: 'privacy-consent',
      badge: 'BÀI HỌC 4 · AN TOÀN & BẢO MẬT',
      title: 'Quyền Tự Chủ Riêng Tư & Tùy Duyên Chia Sẻ',
      paragraphs: [
        'Mọi nội dung quán chiếu mặc định ĐƯỢC LƯU TRỮ HOÀN TOÀN RIÊNG TƯ trên thiết bị của bạn. Không ai có thể xem được nội dung nếu bạn chưa bấm chia sẻ.',
        'Chỉ khi bạn bấm nút "Gửi đại chúng sám hối" hoặc "Chia sẻ việc lành" và vượt qua bước xác nhận trang trọng, bài viết mới được đăng lên bảng tin chung.',
        'Bạn có thể tùy ý chọn hiển thị Biệt danh ẩn danh, hoặc dũng cảm ghi rõ Pháp danh thật, Họ tên thật, Địa chỉ thật để tăng tốc độ chuyển hóa nghiệp chướng như lời dạy ở Bài học 1.',
      ],
    },
  ],
  en: [
    {
      id: 'repentance-community',
      badge: 'LESSON 1 · OPEN CONFESSION',
      title: 'Repentance Before the Assembly & the Power of Purifying Karma',
      scriptureQuote: {
        source: 'Mahaprajnaparamita Sastra & Karma Differences Sutra',
        text: 'Defilements hidden in the darkness of the heart are like poison roots buried deep in damp earth, taking deeper root over countless eons. But when openly revealed before the Triple Gem and noble companions under the sunlight, the poisonous roots wither and burn away completely.',
      },
      paragraphs: [
        'Repentance means acknowledging past mistakes and resolving wholeheartedly never to repeat them. The opposite of repentance is concealing faults.',
        'Confessing unwholesome deeds before the community purifies karmic obstacles much faster than keeping them hidden. Bowing before the assembly immediately breaks pride and vain self-esteem, replacing them with moral shame (Hiri) and dread of wrongdoing (Ottappa).',
        'In particular, if you have the courage to repent with your TRUE DHARMA NAME, REAL NAME, AND SPECIFIC ADDRESS, karmic purification proceeds with extraordinary speed because:',
      ],
      bulletPoints: [
        'Completely breaking the ego mask: You face truth and karmic causes without hiding behind anonymity.',
        'Utmost sincerity of mind: Extreme remorse generates powerful mind-energy capable of transforming heavy karmic momentum.',
        'Resonance of community prayers: Noble companions shower compassionate dedication, washing away defilements like ambrosia nectar.',
      ],
    },
    {
      id: 'rejoicing-merit',
      badge: 'LESSON 2 · REJOICING IN MERIT',
      title: 'Sharing Wholesome Deeds — Lighting a Hundred Thousand Torches',
      scriptureQuote: {
        source: 'The Sutra of Forty-Two Chapters (Chapter 10)',
        text: 'The Buddha said: If someone sees another practising generosity and joyfully supports and praises them, great blessing is attained. A monk asked: Will the blessing of the giver be diminished? The Buddha answered: Think of a torch flame from which hundreds of thousands of people light their torches to cook and dispel darkness; the original flame remains unchanged. The blessing of rejoicing is just like this!',
      },
      paragraphs: [
        'Sharing good deeds so that others can rejoice multiplies merit manifold. Sharing here is not for vanity or fame, but to illuminate a torch of goodness in the world.',
        'When someone genuinely rejoices in your wholesome deed from the bottom of their heart, they receive merit EQUAL TO THE PERSON WHO PERFORMED THE DEED.',
        'And because you initiated the spark that aroused Bodhicitta in others, your merit is MULTIPLIED ABUNDANTLY through collective resonance.',
      ],
    },
    {
      id: 'reflection-structure',
      badge: 'LESSON 3 · STANDARD STRUCTURE',
      title: 'Structure of a Complete Reflection (Minimum 50 Words)',
      paragraphs: [
        'To ensure daily contemplation penetrates deep into actions, speech and thoughts, each entry requires AT LEAST 50 WORDS before public sharing. Suggested standard structure:',
      ],
      bulletPoints: [
        'REPENTANCE structure (4 core parts): (1) Context and situation; (2) Mental state recognized (greed, anger, delusion, pride); (3) Genuine remorse for harm caused; (4) Firm vow to reform with concrete actions.',
        'GOOD DEEDS structure (3 core parts): (1) Specific wholesome action taken; (2) Pure intention without seeking fame or reward; (3) Dedication of merit to all sentient beings.',
      ],
      example: {
        title: 'Example of a complete repentance',
        text: 'During lunch with my family today, under work stress I lost patience and raised my voice at my mother, hurting her deeply. I realize this was unwholesome speech born of anger and lack of mindfulness. I sincerely confess before the Triple Gem and assembly, resolving henceforth to practice gentle speech and maintain a peaceful heart.',
        wordCount: 55,
        explanation: 'Three concise sentences expressing full context, mental cause, sincere remorse, and a firm resolution.',
      },
    },
    {
      id: 'privacy-consent',
      badge: 'LESSON 4 · PRIVACY & FREEDOM',
      title: 'Local Privacy & Voluntary Sharing',
      paragraphs: [
        'All reflections remain COMPLETELY PRIVATE on your device by default. No one can see your reflections unless you choose to share.',
        'Only after you tap "Share with community" and confirm through the reverent consent dialog is the post shared.',
        'You may use an anonymous nickname, or courageously provide your true Dharma name and location to accelerate purification.',
      ],
    },
  ],
};

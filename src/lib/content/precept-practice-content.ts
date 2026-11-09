// Nội dung Ngũ giới/Thập thiện biên tập theo tài liệu người dùng cung cấp; không phải nghi thức truyền giới.
export type BilingualText = readonly [vi: string, en: string];
export interface PracticePrecept {
  id: string;
  group: 'body' | 'speech' | 'mind' | 'observance';
  title: BilingualText;
  summary: BilingualText;
  tasks: readonly BilingualText[];
}

const life: PracticePrecept = {
  id: 'life', group: 'body', title: ['Tôn trọng sự sống', 'Respect life'],
  summary: ['Không sát sinh; nuôi dưỡng lòng từ.', 'Refrain from killing; nurture compassion.'],
  tasks: [['Tránh cố ý làm hại; giúp sinh vật thoát nguy khi có thể.', 'Avoid intentional harm; help living beings reach safety when possible.']]
};
const property: PracticePrecept = {
  id: 'property', group: 'body', title: ['Tôn trọng của cải', 'Respect property'],
  summary: ['Không lấy của không cho; sống ngay thẳng.', 'Do not take what is not given; act honestly.'],
  tasks: [['Xin phép khi sử dụng, trả lại đồ mượn và giữ lời hẹn.', 'Ask before using belongings, return borrowed items and honor agreements.']]
};
const conduct: PracticePrecept = {
  id: 'conduct', group: 'body', title: ['Giữ gìn chánh hạnh', 'Act responsibly in relationships'],
  summary: ['Không tà hạnh; tôn trọng người khác và sự thủy chung.', 'Refrain from sexual misconduct; respect others and fidelity.'],
  tasks: [['Giữ cam kết, không ép buộc hoặc lợi dụng người khác.', 'Honor commitments; never coerce or exploit another person.']]
};
const truth: PracticePrecept = {
  id: 'truth', group: 'speech', title: ['Nói lời chân thật', 'Speak truthfully'],
  summary: ['Không nói dối hoặc cố ý khiến người khác hiểu sai.', 'Avoid lies and deliberate deception.'],
  tasks: [['Nói điều mình biết; chưa rõ thì nhận là chưa rõ.', 'State what you know and acknowledge uncertainty.']]
};
const sobriety: PracticePrecept = {
  id: 'sobriety', group: 'observance', title: ['Giữ tâm tỉnh thức', 'Keep a clear mind'],
  summary: ['Tránh rượu và chất gây say làm mất tự chủ.', 'Avoid alcohol and intoxicants that impair self-control.'],
  tasks: [['Chọn thức uống không cồn; thuốc điều trị vẫn dùng theo chỉ dẫn.', 'Choose an alcohol-free drink; continue prescribed treatment as directed.']]
};

export const FIVE_PRECEPTS: readonly PracticePrecept[] = [
  { ...life, title: ['Không sát sinh', 'Refrain from killing'],
    summary: ['Không cố ý giết hại bất kỳ sinh mạng nào: con người, súc vật hay côn trùng nhỏ bé.', 'Do not intentionally kill any living being, whether a person, an animal or a tiny insect.'],
    tasks: [
      ['Tài liệu nêu phạm vi giới sát gồm cả việc phá thai; người thực hành cần hiểu rõ điều mình phát nguyện gìn giữ.', 'The supplied text includes abortion within this precept; practitioners should understand the commitment they undertake.'],
      ['Theo hướng dẫn thực hành này, muốn thực hành trọn vẹn giới không sát sinh thì cần ăn chay. Nếu chưa ăn chay được, chỉ dùng thịt tam tịnh nhục; khi chưa ăn chay, mức hoàn thành giới này trong hướng dẫn là 70%.', 'In this practice guide, full observance of refraining from killing includes a vegetarian diet. If you are not yet able to eat vegetarian, consume only meat meeting the three conditions of purity; without a vegetarian diet, this guide describes the level of observance as 70%.'],
      ['Tam tịnh nhục là thịt đáp ứng đủ ba điều: mình không thấy con vật bị giết, không nghe tiếng con vật bị giết và không nghi con vật bị giết riêng vì mình. Không chọn con vật sống hoặc đặt giết để phục vụ bữa ăn của mình.', 'Meat meets the three conditions of purity when you have not seen the animal being killed, have not heard it being killed, and do not suspect it was killed specifically for you. Do not select a live animal or order it killed for your meal.'],
      ['Có thể chọn thịt đông lạnh hoặc thịt đã làm sẵn ở hàng quán khi đáp ứng đủ ba điều trên; không phải cứ đông lạnh hoặc làm sẵn là tự động được xem là tam tịnh nhục.', 'Frozen meat or meat already prepared at a shop or restaurant may be chosen when all three conditions above are met; being frozen or prepared does not automatically make it meet those conditions.'],
      ['Dù đã ăn chay hay chưa, tuyệt đối không cố ý giết hại, xúi giục hoặc sai khiến người khác giết hại bất kỳ sinh vật nào. Nuôi lòng từ, không hành hạ và giúp sinh vật thoát nguy khi có thể.', 'Whether or not you eat vegetarian, never intentionally kill, encourage killing, or have another person kill any living being. Cultivate compassion, avoid cruelty, and help living beings reach safety when possible.']
    ] },
  { ...property, title: ['Không trộm cắp', 'Refrain from stealing'],
    summary: ['Không lấy bất cứ thứ gì không thuộc về mình khi chưa được cho phép, dù chỉ là một cọng cỏ, một nhành cây.', 'Do not take anything that does not belong to you without permission, even a blade of grass or a small branch.'],
    tasks: [
      ['Lừa gạt để lấy tài vật, cưỡng đoạt và chiếm giữ trái phép đều thuộc hành vi trộm cắp được tài liệu nhắc đến.', 'The text includes obtaining property through deception, coercion and unlawful possession as forms of stealing.'],
      ['Xin phép trước khi lấy hoặc sử dụng đồ của người khác; trả lại đồ mượn, không giữ của nhặt được làm của riêng.', 'Ask before taking or using another person’s belongings; return borrowed items and do not keep found property as your own.'],
      ['Không lãng phí thức ăn, vật dụng, kể cả vật dụng tại cơ quan; sử dụng vừa đủ, giữ gìn và trân trọng của chung cũng như của riêng.', 'Do not waste food or supplies, including supplies at work; use only what is needed and take care of shared as well as personal belongings.']
    ] },
  { ...conduct, title: ['Không tà dâm', 'Refrain from sexual misconduct'],
    summary: ['Không quan hệ tình dục ngoài mối quan hệ vợ chồng chính thức; không thủ dâm, không xem hay truyền bá nội dung kích dục; giữ các ngày và nơi chốn kiêng kỵ trong sinh hoạt vợ chồng.', 'Refrain from sexual relations outside a formal marriage, masturbation, and viewing or spreading sexually arousing content; observe the specified days and places of abstinence within marriage.'],
    tasks: [
      ['Giữ sự thủy chung, không ngoại tình hoặc xen vào quan hệ vợ chồng của người khác; vợ chồng phải kính trọng nhau.', 'Remain faithful, do not commit adultery or interfere in another marriage, and maintain mutual respect between spouses.'],
      ['Không thủ dâm. Không quan hệ vợ chồng vào các ngày Thập trai, ngày vía Phật, Bồ-tát hoặc ngày kỵ theo lịch Thọ Khang Bảo Giám.', 'Refrain from masturbation. Abstain from marital relations on the Ten Fasting Days, Buddha and Bodhisattva observance days, and prohibited days according to the Thọ Khang Bảo Giám calendar.'],
      ['Không quan hệ ở nơi khác ngoài giường ngủ.', 'Do not have sexual relations anywhere other than the bed used for sleeping.'],
      ['Theo hướng dẫn này, chỉ được quan hệ vợ chồng bằng bộ phận sinh dục; làm trái điều này là phạm tà dâm.', 'According to this guidance, marital sexual relations are permitted only through genital intercourse; other forms violate this precept.'],
      ['Không xem phim kích dục; không nói lời kích dục hoặc có hành vi khơi gợi, kích thích dục vọng của người khác.', 'Do not watch sexually arousing films, use sexually arousing speech, or act in ways intended to awaken or stimulate another person’s sexual desire.'],
      ['Không đăng bài, chia sẻ khoái cảm hay nội dung tình dục để kích dục; không hướng dẫn người khác chuyện phòng the hoặc phổ biến nội dung làm tăng dục vọng.', 'Do not post or share accounts of sexual pleasure or sexual content to arouse desire; do not instruct others in sexual techniques or circulate material that intensifies sexual desire.'],
      ['Theo lời cảnh tỉnh trong hướng dẫn này, các hành vi kể trên đều làm giảm phước; cần gìn giữ từ hành động, lời nói đến tâm ý.', 'According to the warning in this guidance, these actions diminish merit; observance therefore includes actions, speech and intentions.'],
      ['Giới này thuộc Ngũ giới tại gia; không đồng nghĩa với giới không dâm dục trong Bát quan trai, vốn yêu cầu kiêng cả quan hệ vợ chồng trong thời gian thọ trì.', 'This lay precept differs from celibacy during the Eight-Precept observance, which also excludes marital relations for the observance period.']
    ] },
  { ...truth, id: 'speech', title: ['Không vọng ngữ', 'Refrain from false and harmful speech'],
    summary: ['Không nói dối, đâm thọc, ác khẩu hoặc mắng nhiếc làm hại người khác.', 'Do not lie, sow discord, use abusive language or insult others in ways that cause harm.'],
    tasks: [
      ['Nói đúng điều mình biết; không bịa chuyện, bóp méo sự thật hay cố ý khiến người khác hiểu sai.', 'Say what you know to be true; do not fabricate stories, distort facts or deliberately mislead others.'],
      ['Không mang lời người này nói với người kia để gây chia rẽ; không dùng lời thô ác, nhục mạ hoặc mắng nhiếc khi tức giận.', 'Do not pass words between people to divide them, or use harsh, humiliating or insulting language when angry.']
    ] },
  { ...sobriety, title: ['Không uống rượu', 'Refrain from drinking alcohol'],
    summary: ['Không uống rượu, không khuyên người khác uống, không lui tới quán rượu và không khởi tâm tưởng đến việc uống rượu.', 'Do not drink alcohol, encourage others to drink, frequent drinking establishments or dwell on thoughts of drinking.'],
    tasks: [
      ['Tài liệu giải thích rằng uống rượu khiến thần trí mê loạn, làm mất sự sáng suốt; vì vậy cần gìn giữ tâm tỉnh táo ngay từ ý muốn uống.', 'The text explains that alcohol clouds the mind and weakens clarity, so the practice includes attending to the desire to drink.'],
      ['Khi ăn uống, giao tiếp hoặc dự tiệc, chọn đồ uống không cồn và không mời ép người khác uống. Thuốc điều trị vẫn dùng theo chỉ dẫn.', 'At meals, gatherings and celebrations, choose alcohol-free drinks and do not pressure others to drink. Continue prescribed treatment as directed.']
    ] }
];

export const TEN_PRECEPTS: readonly PracticePrecept[] = [
  ...FIVE_PRECEPTS.slice(0, 3),
  { ...truth, title: ['Không nói dối', 'Refrain from lying'],
    summary: ['Không nói sai sự thật, bịa đặt hoặc cố ý lừa dối người khác.', 'Do not speak falsely, fabricate accounts or deliberately deceive others.'],
    tasks: [['Nói đúng điều mình biết; chưa biết thì nhận là chưa biết. Làm ăn chân thật, không dùng hàng giả để lừa người.', 'Speak according to what you know and acknowledge what you do not know. Trade honestly and do not deceive people with counterfeit goods.']] },
  { id: 'harmony', group: 'speech', title: ['Không nói hai lưỡi', 'Refrain from divisive speech'],
    summary: ['Không nói hai lưỡi, gây chia rẽ.', 'Avoid divisive and double-dealing speech.'],
    tasks: [['Không đem chuyện nơi này nói nơi kia rồi ngược lại để kích động thị phi, ly gián đôi bên; dùng lời giúp mọi người hiểu và hòa thuận với nhau.', 'Do not carry stories back and forth to provoke disputes or divide people; use speech that supports understanding and harmony.']] },
  { id: 'gentle', group: 'speech', title: ['Không ác khẩu', 'Refrain from abusive speech'],
    summary: ['Không ác khẩu, nhục mạ hoặc làm tổn thương bằng lời.', 'Avoid abusive, humiliating and hurtful speech.'],
    tasks: [['Không nói lời thô lỗ như dao kiếm, phanh phui điều xấu để làm nhục người khác, hoặc xúc phạm cha mẹ của họ. Tài liệu gọi việc xúc phạm cha mẹ người là “đại ác khẩu”.', 'Do not use cutting, crude words, expose faults to humiliate people or insult their parents. The text calls insulting another person’s parents a grave form of abusive speech.'], ['Khi giận, dừng lại trước khi nói; góp ý đúng việc và giữ sự tôn trọng.', 'When angry, pause before speaking; address the issue respectfully.']] },
  { id: 'meaningful', group: 'speech', title: ['Không nói lời hoa mỹ vô ích (ỷ ngữ)', 'Refrain from harmful frivolous speech'],
    summary: ['Không nói lời hoa mỹ vô ích (ỷ ngữ), nhất là lời khơi dậy dâm dục, tà niệm hoặc mê hoặc lòng người.', 'Refrain from empty, flowery speech, particularly speech that arouses sexual desire, unwholesome thoughts or deludes others.'],
    tasks: [['Không dùng lời bóng bẩy để kể chuyện dâm dục hay dẫn người xa điều lành; chọn lời chân thật, có ích, phù hợp hoàn cảnh.', 'Do not use polished language to discuss sexual indulgence or draw others away from wholesome conduct; choose truthful, useful words suited to the situation.']] },
  { id: 'generosity', group: 'mind', title: ['Không tham lam, bỏn xẻn', 'Refrain from greed and stinginess'],
    summary: ['Không tham lam, bỏn xẻn: không muốn chiếm đoạt của người và không khư khư giữ của, chẳng muốn bố thí.', 'Avoid greed and stinginess: do not covet others’ possessions or cling to your own wealth without willingness to give.'],
    tasks: [['Tài liệu phân biệt “tham” là muốn chiếm tài vật của người, “xan” là có của mà không muốn bố thí. Tập biết đủ và chia sẻ trong khả năng của mình.', 'The text distinguishes greed, wanting to take others’ property, from stinginess, unwillingness to give from what one has. Practise contentment and share within your means.']] },
  { id: 'kindness', group: 'mind', title: ['Không sân hận', 'Refrain from ill will'],
    summary: ['Không nuôi giận dữ, oán ghét; không buồn khi người được lợi hoặc vui khi người gặp nạn.', 'Do not nurture anger or hatred, resent another person’s good fortune or rejoice in their misfortune.'],
    tasks: [['Nhận biết và dừng tâm đố kỵ, kiêu ngạo, ỷ thế hoặc bắt nạt người khác; tập vui với điều lành của người và giúp đỡ khi họ gặp khó.', 'Notice envy, arrogance, abuse of power or bullying and refrain from acting on them; rejoice in others’ good fortune and help when they struggle.']] },
  { id: 'right_view', group: 'mind', title: ['Không tà kiến', 'Refrain from wrong views'],
    summary: ['Theo tài liệu, tà kiến là chối bỏ nhân quả thiện ác, không tin có đời sau và phỉ báng Phật pháp, kinh điển, lời dạy của Thánh Hiền.', 'In the supplied text, wrong view means denying the consequences of wholesome and unwholesome actions and future lives, and disparaging the Dharma, scriptures and teachings of sages.'],
    tasks: [['Học hiểu việc lành có quả lành, việc ác có quả khổ; xét hậu quả hành động của mình, tìm hiểu Chánh pháp và hỏi người hướng dẫn khi chưa rõ.', 'Study the teaching that wholesome actions bear wholesome results and harmful actions bring suffering; consider your actions’ consequences, study the Dharma and ask a teacher when unsure.']] }
];

export const FIVE_PRECEPT_GUIDE: readonly {
  id: string;
  title: BilingualText;
  paragraphs: readonly BilingualText[];
}[] = [
  { id: 'foundation', title: ['Ngũ giới — nền tảng tu tập', 'The Five Precepts — a foundation for practice'], paragraphs: [
    ['“Đạo giữa chốn hồng trần náo động tu, tất cả đều lấy Ngũ Giới làm căn bản.” Tài liệu nhấn mạnh: giữ giới không chỉ là nhớ năm tên gọi, mà phải gìn giữ cụ thể trong hành động, lời nói và tâm ý hằng ngày.', '“Practising amid the bustle of worldly life, take the Five Precepts as the foundation.” The supplied text emphasises observing them in everyday actions, speech and intentions, rather than merely remembering their names.'],
    ['Theo quan điểm nhân quả trong tài liệu, giữ tròn Ngũ giới là nhân được trở lại thân người; mức độ thanh tịnh của việc giữ giới liên hệ đến phước báo đời sau. Tài liệu khuyên trân quý đời người và bắt đầu tu hành bằng việc thanh tịnh thân – khẩu – ý.', 'In the text’s teaching on karma, observing the Five Precepts is a cause for human rebirth, and the purity of observance relates to blessings in future lives. It encourages valuing human life and beginning practice by purifying body, speech and mind.']
  ] },
  { id: 'lay-practice', title: ['Người tại gia thọ trì Ngũ giới', 'Lay practitioners who undertake the Five Precepts'], paragraphs: [
    ['Người nam tại gia phát tâm thọ trì gọi là Ưu Bà Tắc (Upāsaka); người nữ gọi là Ưu Bà Di (Upāsikā). Ngũ giới nghe đơn giản nhưng để giữ thanh tịnh trọn vẹn cần thực hành bền bỉ, không chỉ phát nguyện bằng lời.', 'A male lay practitioner who undertakes the precepts is called an Upāsaka; a female practitioner is an Upāsikā. Although the five commitments sound simple, observing them fully requires sustained practice beyond a verbal vow.'],
    ['Tài liệu nói giữ một giới có năm vị thiện thần hộ trì, giữ đủ năm giới có hai mươi lăm vị. Tài liệu mô tả người trì giới nghiêm cẩn được phước báo lớn, bậc trung được sống an vui, bậc hạ có thể trở lại thân người; nếu giữ kém hơn, có thể làm người nhưng sáu căn không đầy đủ. Đây là phần giảng về quả báo trong tài liệu, không phải cách ứng dụng chấm điểm hay chứng nhận mức tu chứng.', 'The text says that each precept has five benevolent protectors, making twenty-five for all five. It describes great blessings for strict observance, a peaceful livelihood for moderate observance, human rebirth for lesser observance, and possibly human rebirth with incomplete faculties for still weaker observance. These are the text’s teachings about karmic results, not an app scoring system or certification of spiritual attainment.']
  ] },
  { id: 'five-virtues', title: ['Ngũ giới và Ngũ thường', 'The Five Precepts and the Five Constant Virtues'], paragraphs: [
    ['Tài liệu đối chiếu Ngũ giới với Ngũ thường của Nho giáo: Nhân là lòng nhân ái, từ bi — tương ứng không sát sinh; Nghĩa là biết nghĩa lý, không tham tài vật người — tương ứng không trộm cắp; Lễ là tôn trọng, có chừng mực giữa nam nữ — tương ứng không tà dâm.', 'The text compares the precepts with Confucian virtues: benevolence and compassion correspond to refraining from killing; righteousness and not coveting others’ property correspond to refraining from stealing; propriety and respectful restraint in relationships correspond to refraining from sexual misconduct.'],
    ['Trí là sự sáng suốt, biết phân biệt đúng sai, không để tâm mê loạn — tương ứng không uống rượu; Tín là lòng tin cậy, giữ lời hứa — tương ứng không vọng ngữ. Tài liệu khuyên cả người không học Phật cũng làm thiện, tránh ác và gìn giữ năm điều đạo đức này.', 'Wisdom, discerning right from wrong and keeping a clear mind, corresponds to refraining from alcohol; trustworthiness and keeping promises correspond to refraining from false speech. The text encourages even those who do not study Buddhism to do good, avoid harm and uphold these ethical commitments.']
  ] },
  { id: 'merits', title: ['Công đức thọ trì Ngũ giới', 'Merits of observing the Five Precepts'], paragraphs: [
    ['Theo tài liệu Ngũ giới, thọ trì năm giới là nền tảng của các thiện pháp. Phần dưới trình bày công đức được nêu trong các dẫn kinh của tài liệu.', 'The Five Precepts text presents observance as a foundation for wholesome qualities. The following account describes the merits mentioned in its scriptural references.'],
    ['Kinh Thiện Sanh: tài liệu dẫn lời khuyên người muốn vượt biển sinh tử phải thành tâm thọ trì Ngũ giới; Ngũ giới là căn bản của thiện pháp thế gian và xuất thế gian.', 'The Thiện Sanh Sutra: the document cites an exhortation to undertake the Five Precepts sincerely in order to cross the ocean of birth and death, presenting them as a foundation for worldly and transcendent wholesome qualities.'],
    ['Kinh Thất Phật: theo tài liệu, người thọ trì Ngũ giới được hai mươi lăm vị thiện thần theo hộ vệ.', 'The Sutra of the Seven Buddhas (Thất Phật): according to the document, those who observe the Five Precepts are guarded by twenty-five benevolent protectors.'],
    ['Kinh Biện Ý Trưởng Giả Tử: tài liệu gắn không sát sinh với sống lâu, ít bệnh, thân an lạc; không trộm cắp với tài vật đầy đủ, an vui; không tà dâm với thân thanh khiết, tướng đoan chánh, đức hạnh; không nói dối với lời rõ ràng, được người tin nghe; không uống rượu với tâm sáng suốt, được chư thiên hộ vệ. Phần này còn nói đến hai mươi lăm thiện thần nghênh đón khi mạng chung và ngũ phúc: phước, lộc, thọ, an, hảo chung.', 'The Sutra of the Elder’s Son Biện Ý: the document links refraining from killing with longevity, freedom from illness and bodily peace; not stealing with abundance and contentment; avoiding sexual misconduct with purity, a dignified appearance and virtue; truthful speech with clarity and credibility; and avoiding alcohol with mental clarity and heavenly protection. It also describes twenty-five protectors welcoming the practitioner at death and five blessings: merit, prosperity, longevity, peace and a good death.'],
    ['Kinh Ưu Bà Tắc Giới: tài liệu gọi Ngũ giới là “năm đại thí”, tức bố thí vô úy — giúp chúng sinh bớt sợ hãi. Việc giữ giới không đòi hỏi mất tài sản mà vẫn đem lại phước đức; tài liệu nhấn mạnh đây là nền tảng trên đường đến Sơ quả Tu-đà-hoàn và Vô Thượng Chánh Đẳng Chánh Giác.', 'The Upāsaka Precepts Sutra: the document calls the precepts five great gifts of fearlessness, helping beings become free from fear. Observing them does not require giving away possessions, yet brings merit; the text presents them as foundational to stream-entry and unsurpassed complete awakening.']
  ] },
  { id: 'ten-actions', title: ['Thập thiện: giữ gìn thân, khẩu, ý', 'Ten wholesome actions: body, speech and mind'], paragraphs: [
    ['Ba điều thuộc thân là không sát sinh, không trộm cắp, không tà dâm. Bốn điều thuộc khẩu là không nói dối, không nói lời hoa mỹ vô ích (ỷ ngữ), không nói hai chiều gây ly gián (lưỡng thiệt), không ác khẩu. Ba điều thuộc ý là không tham lam bỏn xẻn, không sân hận, không tà kiến. “Nghiệp” nghĩa là hành vi, việc làm; giữ mười điều là Thập thiện, làm ngược lại là Thập ác.', 'The three bodily actions are refraining from killing, stealing and sexual misconduct. The four verbal actions are refraining from lying, empty or seductive speech, divisive speech and abusive speech. The three mental actions are freedom from greed and stinginess, ill will and wrong view. Karma means action: keeping these commitments is called the ten wholesome actions, and their opposites the ten unwholesome actions.'],
    ['Theo tài liệu, Thập ác có ba bậc thượng, trung, hạ, chiêu cảm ba đường ác: Địa ngục, Ngạ quỷ, Súc sinh; Thập thiện có ba bậc, chiêu cảm ba đường lành: Trời, Người, A-tu-la. Tài liệu cũng cảnh tỉnh ác khẩu có quả báo khổ và nhấn mạnh: gieo nhân thiện cảm quả thiện, gieo nhân ác cảm quả ác; hành trì là dứt điều ác và thực hiện điều thiện.', 'The document describes three degrees of unwholesome conduct leading to the realms of hell, hungry ghosts and animals, and three degrees of wholesome conduct leading to the realms of heavenly beings, humans and asuras. It also warns of painful karmic results from abusive speech and emphasises that wholesome causes bring wholesome results and harmful causes bring harmful results; practice means abandoning harm and cultivating good.']
  ] },
  { id: 'daily-life', title: ['Ứng dụng trong đời sống hằng ngày', 'Applying the teachings in everyday life'], paragraphs: [
    ['Với cha mẹ: hết lòng hiếu thuận; khéo khuyên quy y Tam bảo, ăn chay, trì giới, niệm Phật, cầu sanh Tây Phương. Nếu cha mẹ chưa tin hoặc không nghe, không cưỡng ép; tài liệu khuyên âm thầm sám hối thay cha mẹ trước Phật.', 'With parents: be devoted and respectful; gently encourage refuge in the Three Jewels, vegetarian meals, precept observance, Buddha recollection and aspiration for the Western Pure Land. If they do not share the belief or decline, do not force them; the text suggests quietly offering repentance on their behalf before the Buddha.'],
    ['Với anh em: thân thiết như bạn bè. Với vợ chồng: hết lòng kính trọng nhau. Với con cái: tận lực dạy điều thiện, dạy làm người tốt, không nuông chiều hay dung túng điều sai.', 'With siblings: maintain the closeness of friends. With a spouse: show wholehearted mutual respect. With children: diligently teach goodness and ethical conduct, without indulging or excusing wrongdoing.'],
    ['Với hàng xóm: hòa thuận, nhẫn nhịn, khuyên nhau hiểu nhân quả và sửa điều sai. Với bạn bè: giữ chữ tín. Với người giúp việc, người dưới quyền: từ bi, nhân hậu. Với việc chung: tận tâm như việc nhà mình.', 'With neighbours: live harmoniously, practise patience and encourage understanding of consequences and correction of wrongdoing. Keep faith with friends, treat helpers and subordinates kindly, and attend to shared work as diligently as your own household’s affairs.'],
    ['Trong giao tiếp: tài liệu khuyên nói về từ bi với người lớn, nhắc hiếu đạo với người nhỏ. Trong buôn bán: thật thà, không dùng hàng giả hoặc lời gian dối để lừa người.', 'In conversation, the text recommends discussing compassion with elders and filial respect with younger people. In trade, be honest and do not deceive others with counterfeit goods or false claims.']
  ] }
];

export const EIGHT_PRECEPTS: readonly PracticePrecept[] = [
  life, property,
  { id: 'celibacy', group: 'observance', title: ['Giữ hạnh không dâm dục', 'Observe celibacy'],
    summary: ['Trong thời gian thọ trì, giữ hạnh không dâm dục, kể cả quan hệ vợ chồng.', 'During the observance, abstain from sexual activity, including marital relations.'],
    tasks: [['Thống nhất thời gian với gia đình; giữ thân tâm trong sự tiết chế.', 'Agree on the observance period with your family and practice restraint.']] },
  { ...truth, id: 'speech' }, sobriety,
  { id: 'meal', group: 'observance', title: ['Không ăn phi thời', 'Observe the meal-time precept'],
    summary: ['Giữ thời ăn theo hướng dẫn Bát Quan Trai của tự viện.', 'Follow the meal-time discipline taught for the observance by your temple.'],
    tasks: [['Chuẩn bị việc ăn trước giờ ngọ; nếu có nhu cầu điều trị, hỏi người hướng dẫn trước khi thọ.', 'Arrange the meal before noon; discuss medical needs with your teacher before undertaking the observance.']] },
  { id: 'entertainment', group: 'observance', title: ['Giản dị, xa vui chơi trang sức', 'Set aside adornment and entertainment'],
    summary: ['Tạm dừng ca múa, giải trí và trang điểm, hương hoa để làm đẹp.', 'Set aside singing, dancing, entertainment and beautifying adornment or fragrance.'],
    tasks: [['Dành thời gian cho nghe pháp, đọc kinh hoặc ngồi yên.', 'Make time for Dharma study, sutra reading or quiet sitting.']] },
  { id: 'bed', group: 'observance', title: ['Nghỉ ngơi giản dị', 'Rest simply'],
    summary: ['Không dùng giường cao rộng sang trọng để hưởng thụ.', 'Refrain from luxurious high or large beds for indulgence.'],
    tasks: [['Sắp chỗ nghỉ đơn giản, an toàn, phù hợp sức khỏe.', 'Prepare a simple, safe resting place suited to your health.']] }
];

export const AT_HOME_EIGHT_GUIDE: {
  title: BilingualText;
  introduction: BilingualText;
  caution: BilingualText;
  steps: readonly { id: string; title: BilingualText; body: BilingualText }[];
} = {
  title: ['Gợi ý thực hành tại nhà', 'A guide for home practice'],
  introduction: ['Tự phát nguyện giữ tám giới trước Phật, Bồ-tát và dành một ngày một đêm để tu tập tại gia.', 'Make your personal commitment to the eight precepts before the Buddha and Bodhisattvas, and devote one day and one night to practice at home.'],
  caution: ['Thu xếp công việc, chuẩn bị nơi yên tĩnh và đọc kỹ tám điều trước khi bắt đầu.', 'Arrange your responsibilities, prepare a quiet place and read all eight precepts carefully before beginning.'],
  steps: [
    { id: 'prepare', title: ['Chuẩn bị', 'Prepare'], body: ['Thu xếp công việc, báo người nhà, chọn chỗ yên tĩnh và thời gian đủ một ngày một đêm. Chuẩn bị bữa ăn và thuốc điều trị cần thiết.', 'Arrange responsibilities, inform your household and choose a quiet place and a full day-and-night period. Plan meals and necessary prescribed medicine.'] },
    { id: 'honor', title: ['Lễ kính Tam bảo', 'Honor the Three Jewels'], body: ['Chỉnh trang thân tâm, hướng về Phật, Bồ Tát với lòng tôn kính; lễ bái theo nghi thức đã học, tùy khả năng.', 'Compose yourself and respectfully turn toward the Buddha and Bodhisattvas. Bow according to your learned practice and ability.'] },
    { id: 'repent', title: ['Sám hối, sửa mình', 'Acknowledge and amend'], body: ['Nhìn lại điều chưa thiện nơi thân, lời nói và tâm ý; thành tâm nhận lỗi, nguyện sửa đổi, không tự dằn vặt.', 'Reflect on unwholesome actions, speech and intentions. Acknowledge mistakes sincerely and resolve to change without self-punishment.'] },
    { id: 'resolve', title: ['Phát nguyện giữ tám giới', 'Resolve to observe the eight precepts'], body: ['Đọc, hiểu đủ tám điều bên trên. Theo nghi thức đã được hướng dẫn, phát nguyện gìn giữ trong thời hạn đã chọn; không tự sửa nội dung giới.', 'Read and understand all eight precepts above. Following your teacher’s rite, resolve to observe them for the chosen period without altering their meaning.'] },
    { id: 'practice', title: ['Hành trì trong ngày đêm', 'Practice through the day and night'], body: ['Giữ tám giới, bớt duyên bên ngoài; xen kẽ đọc kinh, nghe pháp, niệm Phật, ngồi yên và đi lại chánh niệm theo pháp môn đã học.', 'Observe the eight precepts and reduce distractions. Alternate sutra reading, Dharma study, Buddha recollection, quiet sitting and mindful walking according to your learned practice.'] },
    { id: 'close', title: ['Kết thúc thời thọ trì, hồi hướng', 'Conclude and dedicate'], body: ['Đủ một ngày một đêm, kết thúc thời thọ trì theo nghi thức đã học; nếu có lời xả giới, thực hiện theo hướng dẫn. Hồi hướng điều lành, tiếp tục giữ Ngũ giới và sống tỉnh thức.', 'After a full day and night, conclude according to your learned rite, including any prescribed relinquishment. Dedicate the wholesome practice and continue the Five Precepts and mindful living.'] }
  ]
};

import type { BilingualText } from './precept-practice-content';
import type { RiteBlock } from './eight-precept-rite';

// Toàn văn hướng dẫn và hai truyện do người dùng cung cấp ngày 29/10/2026.
// Các lời dạy, quan điểm nghi lễ và sự kiện trong truyện được giữ theo bản cung cấp.
// Phần tác bạch là mẫu dành cho khóa tu thực tế; không mô tả trải nghiệm của người đọc app.
export const EIGHT_PRECEPT_GUIDE_SECTIONS: readonly { id: string; title: BilingualText; blocks: readonly RiteBlock[] }[] = [
  {
    "id": "meaning",
    "title": [
      "Bát Quan Trai Giới là gì?",
      "What are the Eight Precepts?"
    ],
    "blocks": [
      {
        "id": "meaning-2",
        "kind": "prose",
        "text": [
          "Bát Quan Trai Giới là giới luật do Đức Phật chế định dành cho hàng cư sĩ tại gia, nhằm giúp nam nữ Phật tử gieo trồng thiện căn giải thoát khỏi luân hồi sinh tử.",
          "The Eight Precepts are rules established by the Buddha for lay practitioners, helping Buddhist men and women cultivate wholesome roots for liberation from the cycle of birth and death."
        ]
      },
      {
        "id": "meaning-4",
        "kind": "prose",
        "text": [
          "Người thọ giới phải rời xa gia đình trong một ngày một đêm, đến sống tại chùa hoặc đạo tràng, để thực hành đời sống thanh tịnh như người xuất gia.",
          "Those receiving them leave their household for one day and night to stay at a temple or practice center and live a pure life like a monastic."
        ]
      },
      {
        "id": "meaning-6",
        "kind": "prose",
        "text": [
          "“Bát” nghĩa là tám giới được thọ trì.",
          "“Eight” means the eight precepts undertaken."
        ]
      },
      {
        "id": "meaning-7",
        "kind": "prose",
        "text": [
          "“Quan” nghĩa là đóng lại, ngăn chặn tám điều ác, giúp ba nghiệp không tạo ra lỗi lầm, tức là đóng cánh cửa sinh tử luân hồi, ngăn chặn các ác nghiệp như sát sinh, trộm cắp, tà dâm…",
          "“Gates” means closing off and preventing eight kinds of wrongdoing, keeping bodily, verbal and mental actions free from faults: closing the door to the cycle of birth and death and preventing harmful deeds such as killing, stealing and sexual misconduct."
        ]
      },
      {
        "id": "meaning-8",
        "kind": "prose",
        "text": [
          "“Trai” nghĩa là thanh tịnh, đoạn trừ các điều ác và thực hành các thiện pháp.",
          "“Observance” means purity: abandoning harmful actions and practicing wholesome qualities."
        ]
      },
      {
        "id": "meaning-9",
        "kind": "prose",
        "text": [
          "Ngoài ra, việc không ăn sau giờ ngọ cũng gọi là “trai”. “Giới” có tác dụng ngăn chặn điều sai trái và ngưng dứt các ác nghiệp.",
          "Refraining from eating after noon is also called “observance.” “Precepts” prevent wrongdoing and bring harmful actions to an end."
        ]
      },
      {
        "id": "meaning-11",
        "kind": "prose",
        "text": [
          "Nói chung, trì giữ tám giới này giúp người thọ giới đóng lại tám điều ác, không khởi lên các lỗi lầm, đoạn trừ các bất thiện nghiệp và thực hành các thiện nghiệp. Đồng thời, giới này giúp ngăn chặn ba nghiệp thân – khẩu – ý tạo điều ác, mở ra con đường hướng đến đời sống xuất gia, chấm dứt vòng luân hồi sinh tử. Vì vậy, Bát Quan Trai Giới chính là một pháp môn vi diệu dẫn dắt hành giả bước vào con đường thánh thiện và là con đường tắt để tiến vào Phật đạo.",
          "In general, keeping these eight precepts closes off eight kinds of wrongdoing, prevents faults from arising, abandons unwholesome actions and develops wholesome actions. They also prevent harmful bodily, verbal and mental actions, opening the way toward monastic life and ending the cycle of birth and death. Thus the Eight Precepts are a wondrous practice leading practitioners onto the noble path, and a direct way toward Buddhahood."
        ]
      },
      {
        "id": "meaning-13",
        "kind": "prose",
        "text": [
          "Người tại gia nếu phát tâm thọ trì Bát Quan Trai Giới sẽ được hun đúc và nuôi dưỡng thiện căn xuất thế, vì thế giới này còn gọi là “Trưởng dưỡng luật nghi”.",
          "Laypeople who aspire to keep the Eight Precepts strengthen and nourish wholesome roots that lead beyond worldly existence. They are therefore also called “the discipline that nurtures growth.”"
        ]
      },
      {
        "id": "meaning-14",
        "kind": "prose",
        "text": [
          "Bên cạnh đó, người thọ giới phải rời xa gia đình trong một ngày một đêm, thân cận Tam Bảo, sống trong môi trường thanh tịnh, nên giới này cũng được gọi là “Cận trú luật nghi”.",
          "Moreover, practitioners leave their households for one day and night, remain close to the Buddha, Dharma and Sangha, and live in a pure environment. Thus they are also called “the discipline of dwelling nearby.”"
        ]
      }
    ]
  },
  {
    "id": "eight-precepts",
    "title": [
      "8 điều bát quan trai giới",
      "The eight precepts"
    ],
    "blocks": [
      {
        "id": "eight-precepts-16",
        "kind": "prose",
        "text": [
          "Theo Tát Bà Đa Luận, Bát Quan Trai Giới bao gồm tám điều răn cấm. Trên thực tế, giới luật này nên được gọi là “Bát Giới Nhất Trai”",
          "According to the Sarvastivada Treatise, the Eight Precepts comprise eight prohibitions. In fact, this discipline should be called “eight precepts and one observance.”"
        ]
      },
      {
        "id": "eight-precepts-18",
        "kind": "title",
        "text": [
          "1. Không sát sinh",
          "1. Do not kill"
        ]
      },
      {
        "id": "eight-precepts-19",
        "kind": "prose",
        "text": [
          "Không cố ý giết hại bất kỳ chúng sinh nào, dù là con người, động vật, côn trùng hay phá thai.",
          "Do not deliberately kill any living being, whether a human, animal or insect, or through abortion."
        ]
      },
      {
        "id": "eight-precepts-21",
        "kind": "title",
        "text": [
          "2.Không trộm cắp",
          "2. Do not steal"
        ]
      },
      {
        "id": "eight-precepts-22",
        "kind": "prose",
        "text": [
          "Không lấy bất cứ tài vật nào không thuộc sở hữu của mình, dù chỉ là một cọng cỏ hay chiếc lá. Bất kỳ hình thức chiếm đoạt nào như lừa đảo, cướp giật, cưỡng đoạt cũng đều phạm vào tội trộm cắp.",
          "Do not take any property that does not belong to you, even a blade of grass or a leaf. Every form of appropriation, including fraud, robbery and extortion, violates the precept against stealing."
        ]
      },
      {
        "id": "eight-precepts-24",
        "kind": "title",
        "text": [
          "3.Không dâm dục",
          "3. Abstain from sexual activity"
        ]
      },
      {
        "id": "eight-precepts-25",
        "kind": "prose",
        "text": [
          "Mọi hành vi liên quan đến sự hòa hợp giữa nam và nữ đều gọi là dâm. Khi thọ Bát Quan Trai Giới, ngay cả quan hệ vợ chồng chính đáng cũng cần phải kiêng giữ.",
          "All acts involving sexual union between a man and woman are called sexual activity. During the Eight Precepts, even legitimate marital relations must be abstained from."
        ]
      },
      {
        "id": "eight-precepts-27",
        "kind": "title",
        "text": [
          "4.Không nói dối",
          "4. Do not lie"
        ]
      },
      {
        "id": "eight-precepts-28",
        "kind": "prose",
        "text": [
          "Không nói lời sai sự thật, không gây chia rẽ, không ác khẩu mắng nhiếc làm tổn hại người khác.",
          "Do not speak falsely, cause division, or use harsh insults that harm others."
        ]
      },
      {
        "id": "eight-precepts-30",
        "kind": "title",
        "text": [
          "5. Không uống rượu và các chất gây nghiện",
          "5. Do not drink alcohol or use addictive intoxicants"
        ]
      },
      {
        "id": "eight-precepts-31",
        "kind": "prose",
        "text": [
          "Không uống rượu, không khuyến khích người khác uống, không lui tới quán rượu, không nghĩ đến việc uống rượu. (Rượu làm tâm trí mê muội, dẫn đến quả báo ngu si trong đời sau).",
          "Do not drink alcohol, encourage others to drink, frequent drinking establishments or dwell on drinking. (Alcohol clouds the mind and leads to the karmic result of ignorance in a future life.)"
        ]
      },
      {
        "id": "eight-precepts-33",
        "kind": "title",
        "text": [
          "6. Không trang điểm, không ca hát, nhảy múa, không tham gia các trò giải trí",
          "6. Do not adorn yourself, sing, dance or take part in entertainment"
        ]
      },
      {
        "id": "eight-precepts-34",
        "kind": "prose",
        "text": [
          "Bao gồm không dùng phấn son, nước hoa, dầu thơm, son môi, bông tai hay bất kỳ trang sức, y phục sặc sỡ nào. Cũng không được tham gia ca hát, khiêu vũ, đánh bạc hay các trò giải trí phù phiếm. Mục đích là để tránh tiếp xúc với trần cảnh hương và xúc giác đồng thời để đoạn trừ sự mê đắm với sắc và thanh, nhằm phòng ngừa ba nghiệp (thân – khẩu – ý) tạo lỗi lầm.",
          "This includes not using makeup, perfume, scented oils, lipstick, earrings, jewelry or colorful clothing. One should also refrain from singing, dancing, gambling and frivolous entertainment. The purpose is to avoid engagement with sensory objects of smell and touch, and to end infatuation with sights and sounds, preventing bodily, verbal and mental actions from giving rise to faults."
        ]
      },
      {
        "id": "eight-precepts-36",
        "kind": "prose",
        "text": [
          "Hương thơm có thể khiến tâm trí mê đắm, âm nhạc và vũ điệu có thể làm con người mất chánh niệm, đều không thích hợp cho người tu hành. Vì vậy, y phục nên giữ sự giản dị, không mặc quần áo rực rỡ xa hoa, không dùng nước hoa hay phấn son trang điểm. Nhờ vậy, hành giả có thể nhiếp tâm giữ chánh niệm, xa rời sự tham đắm, từ đó hướng đến con đường thanh tịnh, viên mãn được chánh báo thân tâm và y báo quốc độ trang nghiêm.",
          "Fragrance can captivate the mind, while music and dancing can cause a loss of mindfulness; neither is suitable for a practitioner. Clothing should therefore remain simple, without dazzling luxurious garments, perfume or cosmetics. In this way, practitioners can gather their minds in mindfulness, move away from craving and approach purity, perfecting both their body and mind and the splendor of the land in which they dwell."
        ]
      },
      {
        "id": "eight-precepts-38",
        "kind": "title",
        "text": [
          "7.Không nằm, ngồi giường cao rộng, sang trọng",
          "7. Do not lie or sit on high, broad, luxurious beds"
        ]
      },
      {
        "id": "eight-precepts-39",
        "kind": "prose",
        "text": [
          "Những chiếc giường quá êm ái, sang trọng có thể khiến tâm sinh hưởng thụ, dễ khởi tâm dâm dục, nên không thích hợp cho người tu tập.",
          "Excessively soft and luxurious beds can encourage indulgence and arouse sexual desire, making them unsuitable for practice."
        ]
      },
      {
        "id": "eight-precepts-41",
        "kind": "prose",
        "text": [
          "“Không ngồi” có nghĩa là xa lìa sự dính mắc vào cảm giác tiếp xúc thoải mái (xúc trần)",
          "“Not sitting” means abandoning attachment to pleasant sensations of physical contact (objects of touch)."
        ]
      },
      {
        "id": "eight-precepts-43",
        "kind": "prose",
        "text": [
          "Trong Kinh A-hàm có dạy:",
          "The Agama scriptures teach:"
        ]
      },
      {
        "id": "eight-precepts-45",
        "kind": "prose",
        "text": [
          "“Giường dài hơn một thước sáu không gọi là cao, rộng hơn bốn thước không gọi là rộng, dài hơn tám thước không gọi là lớn. Nếu vượt quá kích thước này thì được gọi là giường cao rộng xa hoa.”",
          "“A bed longer than one measure and six tenths is not called high, wider than four measures is not called broad, and longer than eight measures is not called large. If it exceeds these dimensions, it is called a high, broad, luxurious bed.”"
        ]
      },
      {
        "id": "eight-precepts-47",
        "kind": "prose",
        "text": [
          "Tổ Ngẫu Ích Trí Húc trong Thập Giới Uy Nghi Lục Yếu có ghi:",
          "Patriarch Ngau Ich Tri Huc records in Essentials of the Ten Precepts and Deportment:"
        ]
      },
      {
        "id": "eight-precepts-49",
        "kind": "prose",
        "text": [
          "“Chân giường cao chỉ một thước sáu tấc, khi ngồi xuống, chân không bị lơ lửng, nếu vượt quá mức này thì gọi là cao. Chỉ cần đủ chỗ xoay trở thân thể, nếu quá mức này thì gọi là rộng. Nếu vừa cao vừa rộng, thì gọi là giường cao rộng xa hoa.”",
          "“The bed legs should be only one measure and six tenths high, so that when sitting down one's feet do not dangle; exceeding this is called high. It should provide only enough space to turn the body; exceeding this is called broad. If it is both high and broad, it is called a high, broad, luxurious bed.”"
        ]
      },
      {
        "id": "eight-precepts-51",
        "kind": "prose",
        "text": [
          "Mục đích của giới luật này là giữ tâm thanh đạm, tránh xa lối sống xa hoa hưởng thụ, thúc đẩy sự tinh tấn tu hành. Người thực hành đạo phải biết đơn giản hóa đời sống vật chất, không đắm nhiễm vào sự thoải mái của thân xác, từ đó có thể chuyển hóa thành tâm tinh tấn dõng mãnh, tương ưng với con đường Thánh đạo.",
          "The purpose of this precept is to maintain simplicity and contentment, avoid luxurious indulgence and encourage diligent practice. Practitioners should simplify material life and avoid attachment to bodily comfort, transforming that energy into courageous diligence in accord with the noble path."
        ]
      },
      {
        "id": "eight-precepts-53",
        "kind": "title",
        "text": [
          "8.Không ăn phi thời (không ăn sau 12 giờ trưa)",
          "8. Do not eat at improper times (do not eat after 12 noon)"
        ]
      },
      {
        "id": "eight-precepts-54",
        "kind": "prose",
        "text": [
          "Sau giờ ngọ (12 giờ trưa), chỉ được uống nước, không ăn thêm bất kỳ thức ăn nào khác.",
          "After noon (12 midday), one may drink only water and eat no further food."
        ]
      },
      {
        "id": "eight-precepts-56",
        "kind": "prose",
        "text": [
          "Trong tám giới trên, năm giới đầu tiên thực chất chính là Ngũ Giới của cư sĩ tại gia, chỉ khác ở điểm giới “không tà dâm” (trong Ngũ Giới) được thay thế bằng giới “không dâm dục” (không quan hệ nam nữ dưới bất kỳ hình thức nào).",
          "Among these eight precepts, the first five are essentially the Five Precepts of lay practitioners, except that “no sexual misconduct” in the Five Precepts is replaced by “no sexual activity” (no sexual relations between men and women in any form)."
        ]
      },
      {
        "id": "eight-precepts-58",
        "kind": "prose",
        "text": [
          "Vì khi thọ trì Bát Quan Trai Giới, không chỉ tránh tà dâm mà ngay cả quan hệ vợ chồng hợp pháp cũng bị cấm, nên người cư sĩ trì giới này được gọi là “Thanh Tịnh Ưu Bà Tắc, Ưu Bà Di” tức là nam nữ cư sĩ thanh tịnh.",
          "Because undertaking the Eight Precepts excludes not only sexual misconduct but even lawful marital relations, laypeople observing them are called “pure upasakas and upasikas,” meaning pure male and female lay disciples."
        ]
      }
    ]
  },
  {
    "id": "observance-days",
    "title": [
      "Thời Gian Thọ Trì",
      "Observance days"
    ],
    "blocks": [
      { "id": "home-practice-title", "kind": "title", "text": ["Cách tu bát quan trai tại nhà", "Practising the Eight Precepts at home"] },
      {
        "id": "observance-days-62",
        "kind": "prose",
        "text": [
          "Bát Quan Trai Giới là giới luật được thọ trì trong một ngày một đêm. Thời gian phổ biến để thọ giới là vào sáu ngày trai trong tháng (lục trai nhật ), tức các ngày:",
          "The Eight Precepts are undertaken for one day and one night. The usual occasions are the six observance days each month, namely:"
        ]
      },
      {
        "id": "observance-days-63",
        "kind": "prose",
        "text": [
          "Mùng 8, 14, 15, 23, 29, 30 âm lịch.",
          "The 8th, 14th, 15th, 23rd, 29th and 30th days of the lunar month."
        ]
      },
      {
        "id": "observance-days-64",
        "kind": "prose",
        "text": [
          "(Đối với tháng thiếu, nếu không có ngày 30, có thể đổi sang ngày 28 hoặc 29).",
          "(In a short lunar month without a 30th day, the 28th or 29th may be substituted.)"
        ]
      },
      {
        "id": "observance-days-66",
        "kind": "prose",
        "text": [
          "Điều này dựa theo Kinh Ưu Bà Di Đà Xá Ca, trong đó Đức Phật đã tùy thuận hoàn cảnh cư sĩ tại gia. Vì phải lo mưu sinh nên không thể giữ tám giới mỗi ngày nên Ngài mới chế định mỗi tháng có sáu ngày chuyên trì Bát Quan Trai Giới.",
          "This is based on the Upasika Dashaka Sutra, in which the Buddha accommodated the circumstances of laypeople. Since earning a livelihood prevents them from keeping all eight precepts every day, he established six days each month specifically for their observance."
        ]
      },
      {
        "id": "observance-days-68",
        "kind": "prose",
        "text": [
          "Ngoài ra, Kinh Tứ Thiên Vương cũng giảng rằng vào sáu ngày trai, Tứ Thiên Vương sẽ cử sứ giả, các vị Thái tử, hoặc chính họ đích thân xuống nhân gian để tuần sát. Nếu thấy người đời bố thí, trì giới, hiếu dưỡng với cha mẹ quá ít, các vị thiên nhân sẽ buồn phiền; ngược lại, nếu thấy người bố thí, trì giới, hiếu thuận nhiều, họ sẽ hoan hỷ. Vì thế, Đức Phật dạy đệ tử nên trì trai giữ giới vào những ngày này.",
          "The Sutra of the Four Heavenly Kings also teaches that on the six observance days the Four Heavenly Kings send messengers or princes, or personally descend to inspect the human world. If they find few people giving, keeping precepts and caring for their parents, the heavenly beings feel sorrow; if they find many generous, disciplined and filial people, they rejoice. The Buddha therefore taught his disciples to keep the observance and precepts on these days."
        ]
      },
      {
        "id": "observance-days-70",
        "kind": "prose",
        "text": [
          "Thực ra, không nhất thiết phải thọ Bát Quan Trai Giới vào lục trai nhật. Hành giả cũng có thể phát tâm thọ giới vào ngày vía chư Phật, Bồ Tát, ngày sinh nhật cha mẹ, thầy tổ, hoặc chính ngày sinh của bản thân. Ngày nay, để phù hợp với cuộc sống của giới công nhân, doanh nhân, đa số các chùa thường tổ chức thọ Bát Quan Trai Giới vào ngày Chủ nhật. Người muốn thọ giới chỉ cần đăng ký trước, đến chùa vào ngày quy định, thực hiện các bước như báo danh, an đơn, nghe giảng hướng dẫn, rồi bắt đầu hành trì giới pháp trong một ngày một đêm.",
          "In fact, receiving the Eight Precepts need not be limited to the six observance days. Practitioners may also undertake them on commemorative days of Buddhas and Bodhisattvas, or the birthdays of parents, teachers or themselves. Nowadays, to accommodate workers and businesspeople, most temples organize Eight Precept observances on Sundays. Those wishing to participate need only register beforehand, arrive at the temple on the appointed day, complete registration and accommodation arrangements, listen to the introductory guidance and then begin one day and night of practice."
        ]
      }
    ]
  },
  {
    "id": "receiving-ceremony",
    "title": [
      "Nghi thức thọ bát quan trai giới tại nhà",
      "Receiving the Eight Precepts at home"
    ],
    "blocks": [
      {
        "id": "receiving-ceremony-73",
        "kind": "prose",
        "text": [
          "Theo Tác phẩm “Thọ Bát Giới Chánh Phạm” do Đại sư Độc Thể biên soạn, nghi thức thọ giới gồm tám phần:",
          "According to The Proper Procedure for Receiving the Eight Precepts, compiled by Great Master Doc The, the receiving ceremony consists of eight parts:"
        ]
      },
      {
        "id": "receiving-ceremony-75",
        "kind": "prose",
        "text": [
          "Trải tọa cụ, cung thỉnh thầy",
          "Lay out the sitting cloth and respectfully invite the teacher."
        ]
      },
      {
        "id": "receiving-ceremony-76",
        "kind": "prose",
        "text": [
          "Giảng giải về giới pháp",
          "Explain the precept teachings."
        ]
      },
      {
        "id": "receiving-ceremony-77",
        "kind": "prose",
        "text": [
          "Thỉnh Phật, Thánh chứng minh",
          "Invite the Buddhas and noble ones to witness."
        ]
      },
      {
        "id": "receiving-ceremony-78",
        "kind": "prose",
        "text": [
          "Sám hối nghiệp chướng",
          "Repent of karmic obstacles."
        ]
      },
      {
        "id": "receiving-ceremony-79",
        "kind": "prose",
        "text": [
          "Quy y Tam Bảo, tiếp nhận giới thể",
          "Take refuge in the Three Jewels and receive the foundation of the precepts."
        ]
      },
      {
        "id": "receiving-ceremony-80",
        "kind": "prose",
        "text": [
          "Tuyên đọc giới tướng",
          "Recite the individual precepts."
        ]
      },
      {
        "id": "receiving-ceremony-81",
        "kind": "prose",
        "text": [
          "Phát khởi đại nguyện",
          "Arouse a great aspiration."
        ]
      },
      {
        "id": "receiving-ceremony-82",
        "kind": "prose",
        "text": [
          "Dặn dò, khuyến tấn giữ giới",
          "Give reminders and encouragement to uphold the precepts."
        ]
      },
      {
        "id": "receiving-ceremony-83",
        "kind": "prose",
        "text": [
          "Qua các bước trên, có thể thấy rằng việc thọ Bát Quan Trai Giới cần có thầy truyền giới để làm người chứng minh.",
          "These steps show that receiving the Eight Precepts requires a precept teacher to serve as witness."
        ]
      },
      {
        "id": "receiving-ceremony-85",
        "kind": "prose",
        "text": [
          "Tuy nhiên, trong Thành Thật Luận cũng dạy rằng:",
          "However, the Treatise on Establishing Truth also teaches:"
        ]
      },
      {
        "id": "receiving-ceremony-87",
        "kind": "prose",
        "text": [
          "“Nếu không có giới sư, hành giả có thể tự mình đối trước Phật, thành tâm khởi niệm và xưng lời:",
          "“If no precept teacher is available, practitioners may stand before the Buddha, sincerely form the intention and declare:"
        ]
      },
      {
        "id": "receiving-ceremony-88",
        "kind": "prose",
        "text": [
          "‘Con, tên là… hôm nay xin phát nguyện thọ trì Bát Quan Trai Giới.’",
          "‘I, named …, today vow to receive and uphold the Eight Precepts.’"
        ]
      },
      {
        "id": "receiving-ceremony-89",
        "kind": "prose",
        "text": [
          "Như vậy cũng có thể xem là thành tựu giới pháp.”",
          "This too may be regarded as successfully receiving the precepts.”"
        ]
      }
    ]
  },
  {
    "id": "clothing",
    "title": [
      "Y Phục Khi Thọ Giới",
      "Clothing when receiving the precepts"
    ],
    "blocks": [
      {
        "id": "clothing-92",
        "kind": "prose",
        "text": [
          "Người thọ Bát Quan Trai Giới nên mặc hải thanh và mạn y (nếu đã thọ giới).",
          "Those receiving the Eight Precepts should wear a ceremonial robe and an unpatched lay precept robe (if they have already received the precepts)."
        ]
      },
      {
        "id": "clothing-94",
        "kind": "prose",
        "text": [
          "Mặc dù Bát Quan Trai Giới là pháp xuất gia tạm thời do Đức Phật chế định, nhưng người thọ giới không mặc phước điền y mà chỉ khoác mạn y khi tụng kinh, niệm Phật, lễ Phật.",
          "Although the Eight Precepts are a form of temporary renunciation established by the Buddha, those receiving them do not wear the monastic patchwork robe; they wear only the unpatched lay robe when reciting scriptures, recollecting the Buddha and making prostrations."
        ]
      },
      {
        "id": "clothing-96",
        "kind": "prose",
        "text": [
          "Lý do là vì hàng cư sĩ tại gia, dù nam hay nữ được Đức Phật dạy rằng nên tùy theo khả năng mà cúng dường Tam Bảo, nhưng bản thân không được thọ nhận sự cúng dường như người xuất gia. Vì cư sĩ không phải là “phước điền” của chúng sinh, nên không thể mặc phước điền y như chư Tăng.",
          "This is because the Buddha taught both male and female laypeople to make offerings to the Three Jewels according to their means, while they themselves should not receive offerings in the manner of monastics. Since laypeople are not the “field of merit” for living beings in that sense, they cannot wear the monastic patchwork robe as the Sangha does."
        ]
      }
    ]
  },
  {
    "id": "duration-and-renewal",
    "title": [
      "Thời Gian Thọ Trì và Xả Giới",
      "Duration, renewal and relinquishment"
    ],
    "blocks": [
      {
        "id": "duration-and-renewal-99",
        "kind": "prose",
        "text": [
          "Nếu trong thời gian thọ Bát Quan Trai Giới một ngày một đêm, có người giữa chừng muốn xả giới, thì theo Tạp A-tì-đạt-ma Tỳ-ni Tỳ-bà-sa ( quyển 1) dạy:",
          "If someone undertaking the Eight Precepts for one day and night wishes to relinquish them midway, volume 1 of the Miscellaneous Abhidharma Vinaya Vibhasha teaches:"
        ]
      },
      {
        "id": "duration-and-renewal-101",
        "kind": "prose",
        "text": [
          "“Nếu đã thọ trai giới, nhưng muốn xả giới thì không cần phải đến trước năm chúng (giới sư) để xả. Nếu khi muốn dùng thức ăn, chỉ cần nói đơn giản với một người khác, tức là giới pháp đã xả.”",
          "“If one has received the observance precepts but wishes to relinquish them, it is unnecessary to go before the five assemblies (the precept teacher). When one wishes to take food, simply telling another person is sufficient to relinquish the precepts.”"
        ]
      },
      {
        "id": "duration-and-renewal-103",
        "kind": "prose",
        "text": [
          "Về thời gian thọ trì Bát Quan Trai Giới, có nhiều quan điểm khác nhau, chưa thống nhất. Có người vì hoàn cảnh không thể giữ đủ tám giới, nên chỉ thọ trì trai giới ban ngày hoặc chỉ thọ trì ban đêm.",
          "There are several differing, unsettled views concerning the duration of the Eight Precepts. Because circumstances prevent some people from keeping all eight, they undertake the observance only by day or only by night."
        ]
      },
      {
        "id": "duration-and-renewal-104",
        "kind": "prose",
        "text": [
          "Cũng có người muốn liên tục giữ giới hai ngày, ba ngày, thậm chí mười ngày. Vậy điều này có được phép không?",
          "Others wish to keep them continuously for two, three or even ten days. Is this permissible?"
        ]
      },
      {
        "id": "duration-and-renewal-106",
        "kind": "prose",
        "text": [
          "1.Theo Tạp A-tì-đạt-ma Tỳ-ni Tỳ-bà-sa quyển 1:",
          "1. According to volume 1 of the Miscellaneous Abhidharma Vinaya Vibhasha:"
        ]
      },
      {
        "id": "duration-and-renewal-107",
        "kind": "prose",
        "text": [
          "Đức Phật quy định Bát Quan Trai Giới là giới pháp một ngày một đêm, nên không thể chia ra thọ trì riêng ngày hoặc đêm, cũng không thể vượt quá thời gian quy định.",
          "The Buddha established the Eight Precepts as a discipline lasting one day and night. They therefore cannot be divided into a separate daytime or nighttime observance, or extended beyond the prescribed duration."
        ]
      },
      {
        "id": "duration-and-renewal-108",
        "kind": "prose",
        "text": [
          "Nếu muốn tiếp tục trì giới, sau khi hoàn mãn một ngày một đêm, hành giả có thể phát nguyện thọ trì lại vào ngày kế tiếp.",
          "To continue keeping the precepts, practitioners may renew their vow the following day after completing one day and night."
        ]
      },
      {
        "id": "duration-and-renewal-109",
        "kind": "prose",
        "text": [
          "Như vậy, tùy vào khả năng của mỗi người, không cần cố định số ngày thọ trì.",
          "Thus, according to each person's capacity, there need be no fixed total number of observance days."
        ]
      }
    ]
  },
  {
    "id": "five-and-eight",
    "title": [
      "Vậy giữa Bát Quan Trai Giới và Ngũ Giới, giới nào có công đức lớn hơn?",
      "Which brings greater merit: the Five or Eight Precepts?"
    ],
    "blocks": [
      {
        "id": "five-and-eight-112",
        "kind": "prose",
        "text": [
          "Bát Quan Trai Giới: Thọ trì trong thời gian ngắn (một ngày một đêm) nhưng có nhiều giới điều nghiêm ngặt hơn.",
          "The Eight Precepts: kept for a short period (one day and night), but containing more stringent rules."
        ]
      },
      {
        "id": "five-and-eight-113",
        "kind": "prose",
        "text": [
          "Ngũ Giới: Thọ trì suốt đời, tuy số giới ít hơn nhưng cần giữ liên tục, lâu dài.",
          "The Five Precepts: kept throughout life; though fewer in number, they require continuous, long-term observance."
        ]
      },
      {
        "id": "five-and-eight-114",
        "kind": "prose",
        "text": [
          "Xét về công đức, cả hai đều quan trọng và có lợi ích riêng:",
          "In terms of merit, both are important and each has its own benefits:"
        ]
      },
      {
        "id": "five-and-eight-116",
        "kind": "prose",
        "text": [
          "Ngũ Giới giúp hành giả tu dưỡng đạo đức, xây dựng nền tảng căn bản của Phật tử tại gia.",
          "The Five Precepts help practitioners cultivate ethical conduct and establish the basic foundation of a lay Buddhist."
        ]
      },
      {
        "id": "five-and-eight-117",
        "kind": "prose",
        "text": [
          "Bát Quan Trai Giới giúp thanh tịnh thân tâm, gieo duyên xuất gia, tạo phước báu lớn trong thời gian ngắn.",
          "The Eight Precepts purify body and mind, sow the conditions for renunciation and create great merit within a short time."
        ]
      },
      {
        "id": "five-and-eight-118",
        "kind": "prose",
        "text": [
          "Vì thế, tùy hoàn cảnh và khả năng của mỗi người mà lựa chọn trì giới phù hợp để gieo trồng thiện căn trên con đường tu tập.",
          "Each person should therefore choose the appropriate observance according to circumstances and ability, cultivating wholesome roots on the path of practice."
        ]
      }
    ]
  },
  {
    "id": "great-aspiration",
    "title": [
      "Phát tâm rộng lớn khi giữ giới",
      "A great aspiration in keeping the precepts"
    ],
    "blocks": [
      {
        "id": "great-aspiration-120",
        "kind": "title",
        "text": [
          "2. Trích Dẫn từ Đại Trí Độ Luận",
          "2. A quotation from the Treatise on the Great Perfection of Wisdom"
        ]
      },
      {
        "id": "great-aspiration-121",
        "kind": "prose",
        "text": [
          "“Nếu không có tâm rộng lớn, dù giữ giới trọn đời, cũng không bằng một ngày một đêm giữ giới với tâm rộng lớn. Ví như một kẻ nhát gan làm tướng, dù có chỉ huy binh lính suốt đời cũng không lập được công danh. Ngược lại, nếu là người anh hùng có ý chí mạnh mẽ, dẹp loạn trong chốc lát, thì công lao chỉ trong một ngày đã vang danh thiên hạ. Việc thọ trì Bát Quan Trai Giới cũng như thế.”",
          "“Without a great aspiration, even a lifetime of keeping precepts does not equal one day and night of keeping them with a great aspiration. It is like a timid person serving as a general: even commanding soldiers throughout life, he achieves no distinction. By contrast, a hero of strong resolve may quell disorder in a short time and win renown throughout the world for the work of a single day. Receiving and upholding the Eight Precepts is like this.”"
        ]
      },
      {
        "id": "great-aspiration-123",
        "kind": "prose",
        "text": [
          "Từ đoạn kinh này có thể thấy rằng, việc giữ Bát Quan Trai Giới một ngày một đêm có sự thù thắng đặc biệt. Nếu có tâm chân thành, dũng mãnh thọ trì, thì công đức vô lượng, không cần quá bận tâm về thời gian dài ngắn. Điều quan trọng nhất chính là phát tâm rộng lớn để không phụ lòng giáo hóa từ bi của Đức Phật.",
          "This passage shows that keeping the Eight Precepts for one day and night has a particular excellence. If they are undertaken with sincerity and courage, the merit is immeasurable, and one need not worry excessively about whether the duration is long or short. Most important is to arouse a great aspiration, honoring the Buddha's compassionate teaching."
        ]
      }
    ]
  },
  {
    "id": "merits",
    "title": [
      "Ý nghĩa và công Đức Khi Thọ Trì Bát Quan Trai Giới",
      "Meaning and merit of the Eight Precepts"
    ],
    "blocks": [
      {
        "id": "merits-126",
        "kind": "prose",
        "text": [
          "Công đức tu tập bát quan trai giới mang lại vô lượng công đức thù thắng. Dựa trên kinh điển, có thể tổng hợp thành các điểm sau:",
          "Practice of the Eight Precepts brings immeasurable, exceptional merit. Based on the scriptures, it may be summarized in the following points:"
        ]
      },
      {
        "id": "merits-128",
        "kind": "prose",
        "text": [
          "Kinh Tăng Nhất A Hàm – Cao Tràng Phẩm nói:“Nếu có thiện nam tử, thiện nữ nhân phát tâm thọ trì Bát Quan Trai Giới, thì mọi mong cầu đều được thành tựu. Nếu muốn sanh lên cõi trời Tứ Thiên Vương thì cũng được toại nguyện. Nếu muốn chứng quả Thanh Văn, Duyên Giác, hay hướng đến Phật thừa, thì tất cả đều có thể đạt được.”",
          "The Tall Banner Chapter of the Ekottarika Agama states: “If good men or women aspire to receive and uphold the Eight Precepts, all their aspirations may be fulfilled. If they wish to be born in the heaven of the Four Heavenly Kings, that wish may be fulfilled. If they wish to attain the fruit of a Hearer or Solitary Buddha, or progress toward the Buddha Vehicle, all these may be attained.”"
        ]
      },
      {
        "id": "merits-130",
        "kind": "title",
        "text": [
          "Tội chướng tiêu trừ",
          "Karmic offenses and obstacles are removed"
        ]
      },
      {
        "id": "merits-131",
        "kind": "prose",
        "text": [
          "Kinh Ưu Bà Tắc Giới – Bát Giới Trai Phẩm chép:“Này thiện nam tử! Nếu có thể thanh tịnh quy y và thọ trì Bát Quan Trai Giới, thì tội Ngũ Nghịch, cũng như tất cả các tội khác đều được tiêu trừ.”",
          "The Eight Observance Precepts Chapter of the Sutra on the Precepts for Laymen records: “Good man! If one can purely take refuge and uphold the Eight Precepts, the five grave offenses, as well as all other offenses, are removed.”"
        ]
      },
      {
        "id": "merits-133",
        "kind": "title",
        "text": [
          "Tránh xa đường ác",
          "Staying away from unfortunate paths"
        ]
      },
      {
        "id": "merits-134",
        "kind": "prose",
        "text": [
          "Kinh Thập Thiện Giới dạy:“Nhờ công đức thọ trì Bát Quan Trai Giới, hành giả không đọa địa ngục, không đọa ngạ quỷ, không đọa súc sinh, không đọa A-tu-la. Nếu sinh làm người thì có chánh kiến, dễ phát tâm xuất gia, được chứng đắc Niết-bàn. Nếu sinh lên trời thì thường sanh vào cõi Phạm Thiên, gặp Phật ra đời, được thỉnh Phật chuyển Pháp luân.”",
          "The Sutra of the Ten Wholesome Precepts teaches: “Through the merit of upholding the Eight Precepts, practitioners do not fall into hell, the realm of hungry ghosts, animals or asuras. If born human, they have right view, readily aspire to renunciation and attain nirvana. If born in heaven, they are often born in Brahma's realm, encounter a Buddha appearing in the world and may invite the Buddha to turn the wheel of Dharma.”"
        ]
      },
      {
        "id": "merits-136",
        "kind": "prose",
        "text": [
          "Vì vậy, Bát Quan Trai Giới còn được gọi là Tám Pháp Thù Thắng.",
          "For this reason, the Eight Precepts are also called the Eight Excellent Practices."
        ]
      },
      {
        "id": "merits-138",
        "kind": "title",
        "text": [
          "Tăng trưởng phước báu",
          "Increasing blessings and merit"
        ]
      },
      {
        "id": "merits-139",
        "kind": "prose",
        "text": [
          "Kinh Ưu Bà Di Đà Xá Ca chép:“Người trì trai giới sáu ngày mỗi tháng, phước đức rộng lớn như biển cả, không thể đo lường. Nếu có người giữ một ngày một đêm giới trai, thì phước báo ấy lại càng vô lượng vô biên.”",
          "The Upasika Dashaka Sutra records: “Those who keep the observance precepts six days each month have merit as vast as the ocean, beyond measurement. If someone keeps the observance precepts for one day and night, its blessings are still more immeasurable and boundless.”"
        ]
      },
      {
        "id": "merits-141",
        "kind": "title",
        "text": [
          "Đời sau được tôn quý",
          "An honored status in a future life"
        ]
      },
      {
        "id": "merits-142",
        "kind": "prose",
        "text": [
          "Kinh Phổ Đạt Vương kể rằng:“Vua Phổ Đạt thuở quá khứ chỉ là một đứa trẻ cầm lọng đi theo nhà vua, trong một ngày kia đã cùng nhà vua thọ trì trai giới, nghiêm trì chánh pháp, giữ tâm thanh tịnh, không phạm các điều ác. Nhờ nhân duyên này mà đời sau được sinh làm con vua, hưởng vinh hoa phú quý.”",
          "The Sutra of King Pho Dat relates: “In the past, King Pho Dat was only a child who carried a parasol behind the king. One day he joined the king in keeping the observance precepts, strictly followed the true teaching, maintained a pure mind and committed no harmful deeds. Through this condition, in a future life he was born a king's son and enjoyed honor and wealth.”"
        ]
      },
      {
        "id": "merits-144",
        "kind": "title",
        "text": [
          "Đạt được an lạc tối thượng",
          "Attaining supreme peace and happiness"
        ]
      },
      {
        "id": "merits-145",
        "kind": "prose",
        "text": [
          "Kinh Ưu Bà Tắc Giới dạy:“Trong những ngày trai giới, không sát sinh, không gây tổn hại, không phạm tội lỗi. Nếu có thể thanh tịnh thọ trì Bát Quan Trai Giới, thì công đức thù thắng không thể nghĩ bàn, cuối cùng đạt được sự an lạc vô thượng.”",
          "The Sutra on the Precepts for Laymen teaches: “On observance days, do not kill, cause harm or commit offenses. If one can purely receive and uphold the Eight Precepts, the exceptional merit is inconceivable, ultimately leading to unsurpassed peace and happiness.”"
        ]
      },
      {
        "id": "merits-147",
        "kind": "title",
        "text": [
          "Cầu gì được nấy",
          "The fulfillment of aspirations"
        ]
      },
      {
        "id": "merits-148",
        "kind": "prose",
        "text": [
          "Kinh Tăng Nhất A Hàm – Cao Tràng Phẩm nói:",
          "The Tall Banner Chapter of the Ekottarika Agama states:"
        ]
      },
      {
        "id": "merits-150",
        "kind": "prose",
        "text": [
          "“Nếu có thiện nam tử, thiện nữ nhân phát tâm thọ trì Bát Quan Trai Giới, thì mọi mong cầu đều được thành tựu. Nếu muốn sanh lên cõi trời Tứ Thiên Vương thì cũng được toại nguyện. Nếu muốn chứng quả Thanh Văn, Duyên Giác, hay hướng đến Phật thừa, thì tất cả đều có thể đạt được.”",
          "“If good men or women aspire to receive and uphold the Eight Precepts, all their aspirations may be fulfilled. If they wish to be born in the heaven of the Four Heavenly Kings, that wish may be fulfilled. If they wish to attain the fruit of a Hearer or Solitary Buddha, or progress toward the Buddha Vehicle, all these may be attained.”"
        ]
      },
      {
        "id": "merits-152",
        "kind": "prose",
        "text": [
          "Dù thời gian thọ trì Bát Quan Trai Giới chỉ trong một ngày một đêm, nhưng nếu giữ giới thanh tịnh, công đức vô lượng vô biên. Đặc biệt, đây là một phương tiện giúp hàng cư sĩ gieo nhân xuất thế, hướng đến giải thoát, không còn trôi lăn trong sinh tử luân hồi. Do đó, mỗi người nên phát tâm thọ trì giới pháp này, tinh tấn tu học, để sớm đạt đến con đường Bồ-tát đạo.",
          "Although the Eight Precepts are observed for only one day and night, keeping them purely brings immeasurable, boundless merit. In particular, this is a means for laypeople to sow causes that lead beyond worldly existence toward liberation, no longer wandering in the cycle of birth and death. Everyone should therefore aspire to uphold this discipline and practice diligently, so as to advance soon on the Bodhisattva path."
        ]
      }
    ]
  },
  {
    "id": "temple-sample",
    "title": [
      "LỜI TÁC BẠCH CUỐI NGÀY THỌ BÁT QUAN TRAI",
      "Sample address at the end of an Eight Precept observance"
    ],
    "blocks": [
      {
        "id": "temple-sample-context",
        "kind": "instruction",
        "text": [
          "Bài tác bạch mẫu dưới đây dành cho người thực sự tham dự khóa tu tại chùa và được vị thầy hướng dẫn. Chỉ sử dụng khi nội dung đúng với trải nghiệm thực tế; “Tu Viện XXX” là chỗ trống để điền tên nơi tham dự.",
          "The sample address below is for people who actually attend a temple retreat under the guidance of a teacher. Use it only when its statements match the actual experience; “XXX Monastery” is a placeholder for the place attended."
        ]
      },
      {
        "id": "temple-sample-155",
        "kind": "prose",
        "text": [
          "Nam mô Bổn Sư Thích Ca Mâu Ni Phật.",
          "Homage to our original teacher Shakyamuni Buddha."
        ]
      },
      {
        "id": "temple-sample-157",
        "kind": "prose",
        "text": [
          "Kính bạch Thầy, vị Minh Sư của chúng con,",
          "Respected teacher, our wise spiritual guide,"
        ]
      },
      {
        "id": "temple-sample-159",
        "kind": "prose",
        "text": [
          "Kính thưa Thầy! Hôm nay, trải qua một ngày một đêm thọ Bát Quan Trai Giới, sống theo giáo pháp của Đức Thế Tôn, giờ đây chúng con cung kính cúi đầu đảnh lễ và xin tác bạch trong giờ phút Thầy xả giới.",
          "Respected teacher! Having spent one day and night undertaking the Eight Precepts and living according to the Blessed One's teaching, we now respectfully bow and offer these words at this moment when you release us from the precepts."
        ]
      },
      {
        "id": "temple-sample-161",
        "kind": "prose",
        "text": [
          "Chúng con, những Phật tử từ mọi miền đất nước và cả ngoài nước, đã hội tụ về Tu Viện XXX với tâm thành kính và lòng biết ơn vô hạn. Từ lâu, chúng con đã thọ Tam Quy Ngũ Giới để sống đúng với năm đức hạnh làm người, nhưng mãi đến hôm nay, nhờ duyên lành sâu dày, chúng con mới được cơ hội quý báu tham dự khóa tu học Thọ Bát Quan Trai Giới tại Tu Viện.",
          "We, Buddhist disciples from throughout the country and abroad, have gathered at XXX Monastery with reverence and boundless gratitude. We have long received the Three Refuges and Five Precepts to live by the five virtues of human conduct, but only today, through deeply favorable conditions, have we gained the precious opportunity to attend an Eight Precept study and practice retreat at the monastery."
        ]
      },
      {
        "id": "temple-sample-163",
        "kind": "prose",
        "text": [
          "Trong không khí trang nghiêm, thanh tịnh, chúng con cảm nhận được sự an lạc và hạnh phúc vô biên. Đây là lần đầu tiên chúng con được chính vị Minh Sư đã tu chứng Giới, Định, Tuệ trực tiếp truyền giới, hướng dẫn từng oai nghi tế hạnh và giảng dạy các pháp hành đúng với chánh pháp nguyên thủy của Đức Phật.",
          "In this dignified, pure atmosphere, we feel boundless peace and happiness. This is the first time we have personally received the precepts from a wise teacher accomplished in ethical discipline, concentration and wisdom, who has guided us in every detail of deportment and taught practices in accordance with the Buddha's original true teaching."
        ]
      },
      {
        "id": "temple-sample-165",
        "kind": "prose",
        "text": [
          "Kính bạch Thầy,",
          "Respected teacher,"
        ]
      },
      {
        "id": "temple-sample-166",
        "kind": "prose",
        "text": [
          "Chúng con vô cùng xúc động trước lời khai thị của Thầy. Từng pháp âm vang lên như ánh sáng phá tan bóng tối vô minh, giúp chúng con hiểu rõ từng giới luật, từng ý nghĩa sâu sắc trong từng hành động. Thầy nhấn mạnh rằng:",
          "We are deeply moved by your instruction. Every sound of Dharma is like light dispelling the darkness of ignorance, helping us understand each precept and the profound meaning of every action. You emphasized:"
        ]
      },
      {
        "id": "temple-sample-168",
        "kind": "prose",
        "text": [
          "Giới luật là nền tảng đạo đức.",
          "Ethical discipline is the foundation of morality."
        ]
      },
      {
        "id": "temple-sample-169",
        "kind": "prose",
        "text": [
          "Giới luật là cội gốc của Thiền định.",
          "Ethical discipline is the root of meditative concentration."
        ]
      },
      {
        "id": "temple-sample-170",
        "kind": "prose",
        "text": [
          "Giới luật chính là bông trái của Trí tuệ.",
          "Ethical discipline is the fruit of wisdom."
        ]
      },
      {
        "id": "temple-sample-171",
        "kind": "prose",
        "text": [
          "Chúng con khắc ghi lời Thầy dạy, rằng: “Người Phật tử tại gia phải lấy năm giới làm đức hạnh sống; lấy bốn hòa làm chuẩn mực giao tiếp; lấy ba đức làm nòng cốt đoàn kết; và lấy tám giới làm con đường hướng đến giải thoát.”",
          "We take your teaching to heart: “Lay Buddhist disciples should make the Five Precepts their virtues in daily life; the four harmonies their standards of communication; the three virtues their core of unity; and the Eight Precepts their path toward liberation.”"
        ]
      },
      {
        "id": "temple-sample-173",
        "kind": "prose",
        "text": [
          "Nhờ sự hướng dẫn tận tâm của Thầy, chúng con đã giữ gìn trọn vẹn các giới Bát Quan Trai.",
          "Through your devoted guidance, we have fully maintained the Eight Precepts."
        ]
      },
      {
        "id": "temple-sample-174",
        "kind": "prose",
        "text": [
          "Đặc biệt, chúng con thực hành:",
          "In particular, we have practiced:"
        ]
      },
      {
        "id": "temple-sample-176",
        "kind": "prose",
        "text": [
          "Bốn giới hòa hợp: Khẩu hòa, ý hòa, kiến hòa và giới hòa, để xây dựng tình đoàn kết trong ngôi nhà Chánh pháp.",
          "The four harmonies: harmony in speech, intention, views and precepts, building unity within the home of the true Dharma."
        ]
      },
      {
        "id": "temple-sample-177",
        "kind": "prose",
        "text": [
          "Ba đức: Nhẫn nhục, tùy thuận, bằng lòng, giúp thân tâm an lạc và buông xả.",
          "The three virtues: patience, adaptability and contentment, bringing peace to body and mind and helping us let go."
        ]
      },
      {
        "id": "temple-sample-178",
        "kind": "prose",
        "text": [
          "Ba hạnh: Hạnh ăn, hạnh ngủ, hạnh độc cư, giúp tâm không phóng dật, không tán loạn, dễ dàng nhiếp tâm và an trú trong hơi thở.",
          "The three practices: proper eating, sleeping and solitude, keeping the mind from heedlessness and distraction, and making it easier to gather the mind and rest in the breath."
        ]
      },
      {
        "id": "temple-sample-179",
        "kind": "prose",
        "text": [
          "Trong ngày tu học này, chúng con còn được Thầy dạy cách thực hành các pháp hành:",
          "During this day of study and practice, you also taught us to practice:"
        ]
      },
      {
        "id": "temple-sample-181",
        "kind": "prose",
        "text": [
          "Định Chánh Niệm Tĩnh Giác.",
          "Concentration in mindful alertness."
        ]
      },
      {
        "id": "temple-sample-182",
        "kind": "prose",
        "text": [
          "Định Niệm Hơi Thở.",
          "Concentration in mindfulness of breathing."
        ]
      },
      {
        "id": "temple-sample-183",
        "kind": "prose",
        "text": [
          "Định Vô Lậu.",
          "Concentration free from mental defilements."
        ]
      },
      {
        "id": "temple-sample-184",
        "kind": "prose",
        "text": [
          "Định Sáng Suốt.",
          "Concentration in clarity."
        ]
      },
      {
        "id": "temple-sample-185",
        "kind": "prose",
        "text": [
          "Thầy không chỉ giảng dạy mà còn tận tình hướng dẫn từng hành động cụ thể, từng bước đi, từng hơi thở, giúp chúng con thực hành chánh niệm trong từng việc làm nhỏ nhặt như quét sân, nấu cơm hay lặt rau. Những câu pháp như “Quán thân tâm vô thường”, “Quán thân tâm vô ngã” trở thành ánh sáng soi đường, giúp chúng con ly dục, xả tâm và sống tỉnh thức.",
          "You not only explained but patiently guided every concrete action, every step and every breath, helping us practice mindfulness in small tasks such as sweeping the courtyard, cooking rice or preparing vegetables. Teachings such as “Contemplate the impermanence of body and mind” and “Contemplate body and mind as not-self” became guiding lights, helping us relinquish craving, release attachments and live wakefully."
        ]
      },
      {
        "id": "temple-sample-187",
        "kind": "prose",
        "text": [
          "Kính bạch Thầy,",
          "Respected teacher,"
        ]
      },
      {
        "id": "temple-sample-188",
        "kind": "prose",
        "text": [
          "Nhờ sự dìu dắt ân cần của Thầy, chúng con hiểu rằng giải thoát không nằm ở sự cầu xin tha lực mà ở chính sự tự lực, nỗ lực điều phục thân tâm mình. Những xiềng xích mê tín từng trói buộc chúng con nay đã được tháo gỡ. Chúng con hiểu rõ đâu là luân hồi sinh tử, đâu là con đường giải thoát chân thật mà Đức Phật đã dạy.",
          "Through your attentive guidance, we understand that liberation lies in our own effort to train body and mind rather than in petitions for an outside power. The chains of superstition that once bound us have now been loosened. We understand clearly what the cycle of birth and death is, and what the true path to liberation taught by the Buddha is."
        ]
      },
      {
        "id": "temple-sample-190",
        "kind": "prose",
        "text": [
          "Một ngày, một đêm Thọ Bát Quan Trai Giới không chỉ là thời gian tu tập, mà còn là bước khởi đầu để chúng con sống đúng với Thánh hạnh, để rèn luyện và chuyển hóa chính mình. Từ đây, chúng con nguyện sẽ tiếp tục giữ gìn tám giới, thực hành bốn pháp hành, và sống theo lời Phật dạy, để xây dựng đời sống an lạc, thanh tịnh và làm gương sáng cho mọi người xung quanh.",
          "One day and night of undertaking the Eight Precepts is more than a period of practice: it is a beginning for living according to noble conduct, training and transforming ourselves. From now on, we vow to continue maintaining the eight precepts, practicing the four methods and living according to the Buddha's teaching, building peaceful and pure lives and setting a good example for those around us."
        ]
      },
      {
        "id": "temple-sample-192",
        "kind": "prose",
        "text": [
          "Kính bạch Thầy,",
          "Respected teacher,"
        ]
      },
      {
        "id": "temple-sample-193",
        "kind": "prose",
        "text": [
          "Những ân đức của Thầy không bút mực nào tả hết. Chúng con xin thành tâm đảnh lễ và nguyện sống trọn đời phụng sự Phật pháp, không phụ công ơn Thầy và chư Phật đã chỉ dạy.",
          "No words can fully express your kindness. We sincerely bow and vow to devote our lives to serving the Buddha Dharma, honoring the teaching and kindness of you and the Buddhas."
        ]
      },
      {
        "id": "temple-sample-195",
        "kind": "prose",
        "text": [
          "Nam mô Bổn Sư Thích Ca Mâu Ni Phật.",
          "Homage to our original teacher Shakyamuni Buddha."
        ]
      },
      {
        "id": "temple-sample-196",
        "kind": "prose",
        "text": [
          "Kính bạch Thầy, chúng con xin hồi hướng công đức này đến tất cả chúng sinh.",
          "Respected teacher, we dedicate this merit to all living beings."
        ]
      },
      {
        "id": "temple-sample-197",
        "kind": "prose",
        "text": [
          "Cầu mong mọi người đều trọn thành Phật đạo.",
          "May everyone fully accomplish the Buddha Way."
        ]
      }
    ]
  },
  {
    "id": "faq-food",
    "title": [
      "Giải Thích Sự Khác Biệt Giữa Ăn Chay và Ăn Trai",
      "Vegetarian eating and observance fasting"
    ],
    "blocks": [
      { "id": "faq-title", "kind": "title", "text": ["Câu hỏi thường gặp", "Frequently asked questions"] },
      {
        "id": "faq-food-201",
        "kind": "prose",
        "text": [
          "Hòa thượng Mộng Tham giải đáp:",
          "Venerable Mong Tham explains:"
        ]
      },
      {
        "id": "faq-food-203",
        "kind": "prose",
        "text": [
          "Ăn chay nghĩa là không ăn mặn, tức là không ăn hành, hẹ, tỏi, nén, kiệu và không ăn thịt.",
          "Vegetarian eating means not eating meat or pungent foods: onion, chives, garlic, allium bulbs and pickled onion bulbs, as well as meat."
        ]
      },
      {
        "id": "faq-food-204",
        "kind": "prose",
        "text": [
          "Ăn trai không giống như vậy. “Trai” có nghĩa là quá Ngọ không ăn.",
          "Observance fasting is different. “Observance” here means not eating after noon."
        ]
      },
      {
        "id": "faq-food-205",
        "kind": "prose",
        "text": [
          "Khi thọ trì Bát Quan Trai Giới, chữ “trai” ở đây nghĩa là từ buổi tối trở đi không được ăn uống gì nữa. Không chỉ không ăn, mà ngay cả trái cây, trà nước, hay nước có màu sắc cũng không được uống. Tuy nhiên, nếu người nào có bệnh lâu ngày hoặc tuổi cao, có thể phương tiện mà uống sữa, uống nước đậu nành, hoặc các loại chất lỏng khác. Đây gọi là phương tiện để thích nghi.",
          "When undertaking the Eight Precepts, “observance” here means taking no further food or drink from evening onward. Not only food, but fruit, tea and colored drinks are also excluded. However, people with long-standing illness or advanced age may make an accommodation and drink milk, soy milk or other liquids. This is called an adaptation to circumstances."
        ]
      },
      {
        "id": "faq-food-207",
        "kind": "prose",
        "text": [
          "Nếu chỉ thọ trì Bát Quan Trai Giới trong một ngày mà cũng muốn phương tiện suốt cả ngày, thì chi bằng không thọ giới còn hơn, vì giới này không thể tùy tiện phá bỏ.",
          "If one undertakes the Eight Precepts for only a single day yet wishes to make exceptions all day, it would be better not to undertake them, because this discipline cannot be casually broken."
        ]
      }
    ]
  },
  {
    "id": "faq-medicine",
    "title": [
      "Vì sao phải trì giới “quá ngọ không ăn”?",
      "After-noon abstinence and medicinal exceptions"
    ],
    "blocks": [
      {
        "id": "faq-medicine-209",
        "kind": "title",
        "text": [
          "Vì sao phải trì giới “quá ngọ không ăn”?",
          "Why keep the precept of not eating after noon?"
        ]
      },
      {
        "id": "faq-medicine-210",
        "kind": "prose",
        "text": [
          "Chữ “trai” có nghĩa là “tề chỉnh”, tức là có sự phân định rõ ràng. Nguyên tắc này có lý do:",
          "The word “observance” means “orderliness,” referring to a clear distinction. This principle has its reasons:"
        ]
      },
      {
        "id": "faq-medicine-212",
        "kind": "prose",
        "text": [
          "Buổi sáng là bữa ăn của chư Thiên.",
          "Morning is the mealtime of heavenly beings."
        ]
      },
      {
        "id": "faq-medicine-213",
        "kind": "prose",
        "text": [
          "Buổi trưa là bữa ăn của Phật, Bồ Tát và chư Tăng.",
          "Noon is the mealtime of Buddhas, Bodhisattvas and the Sangha."
        ]
      },
      {
        "id": "faq-medicine-214",
        "kind": "prose",
        "text": [
          "Buổi tối là bữa ăn của quỷ thần.",
          "Evening is the mealtime of ghosts and spirits."
        ]
      },
      {
        "id": "faq-medicine-215",
        "kind": "prose",
        "text": [
          "Khi thọ trì Bát Quan Trai Giới, sau giờ ngọ (tức là sau 12 giờ trưa), hành giả không được ăn bất kỳ thực phẩm nào, cũng không được uống sữa, nước trà hay các loại nước có màu, chỉ được phép uống nước trắng. Tuy nhiên, nếu bị bệnh và cần dùng thuốc để trị liệu, thì đây là trường hợp đặc biệt được cho phép. Một số loại dược phẩm có thể vừa là thuốc vừa là thực phẩm, nhưng nếu xem đó là thực phẩm để ăn uống thì chắc chắn không được. Ngược lại, nếu thực sự cần dùng để chữa bệnh, thì không phạm giới.",
          "During the Eight Precepts, after noon (12 midday), practitioners may eat no food and may not drink milk, tea or colored liquids; only plain water is permitted. However, illness requiring medicine for treatment is an allowed exception. Some substances can be both medicine and food, but if regarded as food for consumption they are certainly not allowed. Conversely, when genuinely needed to treat illness, taking them does not break the precept."
        ]
      },
      {
        "id": "faq-medicine-217",
        "kind": "prose",
        "text": [
          "Đức Phật đã dạy trong kinh rằng: “Cần đặc biệt thương xót người bệnh, đồng thời phải chú ý đến sức khỏe của chính mình.” Do đó, nếu cần dùng thuốc để chữa bệnh thì không sao. Ví dụ, nếu hôm nay bị cảm lạnh, có thể uống nước gừng để trị bệnh. Nhưng nếu không bị bệnh mà chỉ vì thích uống nước gừng rồi viện cớ “đây là thuốc”, thì như vậy là không đúng.",
          "The Buddha taught in the scriptures: “One should have particular compassion for the sick and also attend to one's own health.” Thus taking medicine when needed for treatment is acceptable. For example, if one has a cold today, ginger water may be taken as treatment. But if one is not ill and simply likes ginger water, using “this is medicine” as an excuse is improper."
        ]
      }
    ]
  },
  {
    "id": "faq-meal-reason",
    "title": [
      "Vì sao có giới “quá ngọ không ăn”?",
      "Why was the after-noon eating precept established?"
    ],
    "blocks": [
      {
        "id": "faq-meal-reason-220",
        "kind": "prose",
        "text": [
          "Khi Đức Phật còn tại thế, chư Tăng mỗi ngày đều đi khất thực. Nhưng nếu đi khất thực cả ngày thì sẽ ảnh hưởng đến thời gian tu tập. Do đó, Tăng đoàn chỉ khất thực từ sáng đến giờ ngọ, sau đó thì lên núi nhập thất hành trì, không còn đi khất thực hay ăn uống nữa.",
          "When the Buddha was alive, the monastics went on almsround every day. But spending the whole day collecting alms would interfere with practice. The Sangha therefore collected alms only from morning until noon, then went into retreat in the mountains to practice, without further almsrounds or meals."
        ]
      },
      {
        "id": "faq-meal-reason-222",
        "kind": "prose",
        "text": [
          "Nếu buổi trưa đã ăn rồi mà buổi chiều và buổi tối còn tiếp tục ăn, thì sẽ làm chậm trễ việc tu hành. Ngày nay, nhiều người chưa thật sự thấu hiểu đạo lý “thân người khó được, vô thường nhanh chóng”. Nếu chúng ta thực sự hiểu điều đó, chúng ta sẽ không dành quá nhiều thời gian cho việc nấu ăn và ăn uống. Các Thầy đã từng giảng rằng: “Mọi việc trong đời đều có thể trở thành tu hành, ngay cả việc nấu ăn hay ăn uống cũng có thể là tu hành.” Nếu chúng ta",
          "If one has already eaten at noon but continues eating in the afternoon and evening, practice will be delayed. Nowadays many people do not truly understand that “human birth is difficult to obtain, and impermanence comes swiftly.” If we truly understood this, we would not spend so much time cooking and eating. Teachers have explained: “Everything in life can become practice; even cooking and eating can be practice.” If we"
        ]
      },
      {
        "id": "faq-meal-reason-224",
        "kind": "prose",
        "text": [
          "có trí huệ cao, biết chuyển hóa tâm niệm, thì ngay cả khi nấu ăn, ăn uống, con vẫn có thể duy trì công phu tu tập.",
          "have great wisdom and know how to transform our thoughts, then even while cooking and eating we can maintain our practice."
        ]
      },
      {
        "id": "faq-meal-reason-226",
        "kind": "prose",
        "text": [
          "Nhưng nếu chưa đạt đến cảnh giới đó, thì việc tu hành và việc ăn uống sẽ là hai chuyện riêng biệt. Cả ngày chỉ lo nấu ăn, lo ăn uống, vậy thì thời gian đâu mà tu?",
          "But until that level is reached, practice and eating remain two separate matters. If one spends the whole day cooking and eating, where is the time for practice?"
        ]
      },
      {
        "id": "faq-meal-reason-228",
        "kind": "prose",
        "text": [
          "Thứ hai, nếu ăn sau giờ ngọ, đặc biệt là vào buổi tối, thì sẽ dễ khiến tâm trí mê muội, sinh ra buồn ngủ. Khi ăn no vào buổi tối, cơ thể trở nên nặng nề, dễ dàng chìm vào giấc ngủ, rồi ngủ một mạch đến sáng, vô tình làm lỡ mất thời gian tu tập.",
          "Secondly, eating after noon, especially in the evening, can make the mind dull and sleepy. After a full evening meal, the body becomes heavy and easily falls asleep, sleeping straight through until morning and inadvertently losing practice time."
        ]
      },
      {
        "id": "faq-meal-reason-230",
        "kind": "prose",
        "text": [
          "Chính vì muốn tránh những điều này mà Đức Phật đã chế định ra giới “quá ngọ không ăn”.",
          "It was to avoid these things that the Buddha established the precept of not eating after noon."
        ]
      }
    ]
  },
  {
    "id": "faq-bathing",
    "title": [
      "Tu bát quan trai có được tắm không?",
      "May one bathe during the observance?"
    ],
    "blocks": [
      {
        "id": "faq-bathing-233",
        "kind": "prose",
        "text": [
          "Khi đã phát nguyện giữ giới, buổi tối nên hạn chế tắm gội. Vì sao? Vì trên thân chúng ta có vô số vi sinh vật nhỏ bé mà mắt thường không nhìn thấy. Bất kỳ sinh vật nào cũng có những loài vi trùng, vi khuẩn sống cùng. Khi tắm, có thể vô tình làm tổn hại đến những sinh linh nhỏ bé ấy.",
          "After vowing to keep the precepts, one should limit evening bathing and hair washing. Why? Because our bodies carry countless tiny microorganisms invisible to the naked eye. Every living creature has microbes and bacteria living alongside it. Bathing may unintentionally harm these tiny beings."
        ]
      },
      {
        "id": "faq-bathing-235",
        "kind": "prose",
        "text": [
          "Thông thường, khi thọ Bát Quan Trai Giới, hành giả nên tắm gội sạch sẽ vào buổi sáng, thay y phục tinh khiết, rồi mới đến đạo tràng để thọ giới. Tuy nhiên, nếu không tắm thì không ngủ được, thì có thể tắm. Vì những vi sinh vật này quá nhỏ và chúng ta không cố ý sát hại, nên không phạm giới. Nhưng nếu muốn trì giới được viên mãn hơn, thì có thể cố gắng nhẫn nại một ngày để thực hành trọn vẹn.",
          "Usually, those undertaking the Eight Precepts should bathe in the morning, change into clean clothing and then go to the practice center to receive them. However, if one cannot sleep without bathing, one may bathe. Because these microorganisms are so small and there is no intention to kill them, this does not violate the precept. Still, to make the observance more complete, one may try patiently refraining for a single day."
        ]
      }
    ]
  },
  {
    "id": "faq-phone",
    "title": [
      "Thọ Bát Quan Trai Giới có được dùng điện thoại không?",
      "May one use a phone during the observance?"
    ],
    "blocks": [
      {
        "id": "faq-phone-238",
        "kind": "prose",
        "text": [
          "Trong thời đại ngày nay, khi công nghệ ngày càng phát triển, việc giữ gìn tâm thanh tịnh trong ngày thọ Bát Quan Trai Giới gặp không ít thử thách. Nhiều người thắc mắc: “Thọ Bát Quan Trai Giới có được sử dụng điện thoại không?”",
          "Today, as technology develops, keeping a pure mind during the Eight Precepts faces many challenges. Many people wonder: “May I use a phone while observing the Eight Precepts?”"
        ]
      },
      {
        "id": "faq-phone-240",
        "kind": "prose",
        "text": [
          "Thực ra, trong tám giới của Bát Quan Trai Giới không có điều nào cấm trực tiếp việc dùng điện thoại. Tuy nhiên, nếu xét theo tinh thần của giới luật, thì việc lướt điện thoại có thể ảnh hưởng đến sự thanh tịnh của tâm và làm gián đoạn sự tu tập.",
          "In fact, none of the Eight Precepts directly prohibits using a phone. However, in the spirit of the discipline, scrolling on a phone can disturb mental purity and interrupt practice."
        ]
      },
      {
        "id": "faq-phone-242",
        "kind": "prose",
        "text": [
          "Giới không xem ca múa, không nghe nhạc, không trang điểm",
          "The precept against entertainment and adornment: do not watch dancing, listen to music or adorn yourself."
        ]
      },
      {
        "id": "faq-phone-243",
        "kind": "prose",
        "text": [
          "→ Nếu dùng điện thoại để giải trí, xem phim, nghe nhạc, lướt mạng xã hội… thì có thể phạm vào giới này.",
          "→ Using a phone for entertainment, films, music or browsing social media may violate this precept."
        ]
      },
      {
        "id": "faq-phone-244",
        "kind": "prose",
        "text": [
          "Giới không nằm giường cao rộng, không hưởng thụ xa hoa",
          "The precept against high, broad beds and luxurious indulgence."
        ]
      },
      {
        "id": "faq-phone-245",
        "kind": "prose",
        "text": [
          "→ Nếu dùng điện thoại để giải trí quá mức, say mê mạng xã hội, thì cũng có thể xem là một hình thức hưởng thụ, làm tâm xao động.",
          "→ Excessive phone entertainment or fascination with social media may likewise be considered indulgence that agitates the mind."
        ]
      },
      {
        "id": "faq-phone-246",
        "kind": "title",
        "text": [
          "Có nên thêm “giới không lướt điện thoại” vào Bát Quan Trai Giới không?",
          "Should a “no scrolling on phones” precept be added to the Eight Precepts?"
        ]
      },
      {
        "id": "faq-phone-248",
        "kind": "prose",
        "text": [
          "Trong thời hiện đại, có người đề nghị thêm điều thứ chín: “Không lướt điện thoại” vào Bát Quan Trai Giới. Điều này không phải là giới luật chính thức, nhưng lại là một lời nhắc nhở quan trọng.",
          "In modern times, some have proposed adding a ninth rule: “Do not scroll on your phone.” This is not an official precept, but it is an important reminder."
        ]
      },
      {
        "id": "faq-phone-250",
        "kind": "prose",
        "text": [
          "Giữ Bát Quan Trai Giới là để tịnh hóa thân tâm, giảm bớt những tác nhân gây phiền não. Nếu không thực sự cần thiết, nên hạn chế dùng điện thoại để tránh làm tâm xao động. Thay vào đó, nên tận dụng thời gian để tụng kinh, niệm Phật, thiền định, nghe pháp, giúp thân tâm thanh tịnh hơn.",
          "Keeping the Eight Precepts aims to purify body and mind and reduce causes of affliction. Unless truly necessary, phone use should be limited to avoid agitating the mind. Instead, use the time for reciting scriptures, recollecting the Buddha, meditation and listening to Dharma, bringing greater purity to body and mind."
        ]
      },
      {
        "id": "faq-phone-252",
        "kind": "prose",
        "text": [
          "Nếu cần sử dụng điện thoại, hãy dùng một cách có chánh niệm, chỉ để nghe pháp thoại, đọc kinh, hoặc liên lạc trong trường hợp cần thiết. Tốt nhất trong một ngày thọ giới, nên đặt điện thoại sang một bên, để có một ngày tu tập thật trọn vẹn. A Di Đà Phật !",
          "If a phone is needed, use it mindfully, only for listening to Dharma talks, reading scriptures or essential communication. Ideally, put the phone aside for the observance day, allowing a truly complete day of practice. Amitabha Buddha!"
        ]
      }
    ]
  },
  {
    "id": "story-tree-spirit",
    "title": [
      "Công đức thọ Bát Quan Trai – Ông thọ thần tán thán trai giới",
      "Merit of the Eight Precepts: the tree spirit praises the observance"
    ],
    "blocks": [
      {
        "id": "story-tree-spirit-5",
        "kind": "prose",
        "text": [
          "Thuở xưa, Đức Phật thuyết pháp cho các hàng trời người ở tinh xá Kỳ thọ Cấp cô độc nước Xá-vệ. Phía Đông nước này có một nước tên là Uất-đa-la-ba-đề. Nơi đây có năm trăm vị Bà-la-môn định kéo nhau đến sông Hằng vì nghe nói bên bờ sông có ba ao thờ thần nên định tắm nước nơi đó để rửa sạch cấu uế, rồi khỏa thân tu theo pháp của bọn Ni-kiền.",
          "Long ago, the Buddha was teaching gods and humans at the monastery in Jeta’s Grove, Anathapindika’s Park, in the kingdom of Xá-vệ. To the east lay a kingdom called Uất-đa-la-ba-đề. Five hundred Brahmins there planned to travel together to the Ganges. They had heard that three sacred pools dedicated to deities stood on its banks, and intended to bathe there to wash away their defilements, then practise naked according to the teachings of the Ni-kiền ascetics."
        ]
      },
      {
        "id": "story-tree-spirit-6",
        "kind": "prose",
        "text": [
          "Đi giữa đường họ gặp một cái đầm lớn, lạc lối không làm sao qua được, lại thiếu thốn lương thực. Họ từ xa bỗng trông thấy một cội cây to như có thần khí, tưởng rằng có người ở nên chạy đến bên gốc cây, song chẳng thấy ai cả. Năm trăm Bà-la-môn lớn tiếng than khóc, cho rằng chắc sẽ đói khát chết tại đầm này. Thọ thần liền hiện ra hình người đến hỏi các Bà-la-môn:",
          "On their journey they came to a vast marsh, lost their way and could find no way across. Their provisions were also running short. Suddenly, in the distance, they saw a great tree that seemed to possess a divine presence. Thinking someone lived there, they hurried to its foot, but found no one. The five hundred Brahmins cried out in lamentation, believing they would surely die of hunger and thirst in the marsh. The tree spirit then appeared in human form and asked them:"
        ]
      },
      {
        "id": "story-tree-spirit-7",
        "kind": "prose",
        "text": [
          "–Đạo sĩ các vị từ đâu đến và định làm gì?",
          "‘Ascetics, where have you come from, and what do you intend to do?’"
        ]
      },
      {
        "id": "story-tree-spirit-8",
        "kind": "prose",
        "text": [
          "Cả nhóm đồng thanh đáp:",
          "They all answered together:"
        ]
      },
      {
        "id": "story-tree-spirit-9",
        "kind": "prose",
        "text": [
          "–Chúng tôi định đến ao nước thần tắm rửa cầu tu đạo tiên. Nay lạc đường đói khát xin nhờ ông thương xót cứu giúp cho.",
          "‘We intended to bathe in the sacred pools and seek the path of the immortals. Now we have lost our way and are starving and thirsty. Please have compassion and help us.’"
        ]
      },
      {
        "id": "story-tree-spirit-10",
        "kind": "prose",
        "text": [
          "Thọ thần liền duỗi tay, một trăm món ăn uống ngon lành từ đó hiện ra. Mọi người được ăn một bữa no nê. Số thức ăn còn thừa đủ để mang theo dọc đường. Lúc sắp ra đi các Bà-la-môn đến chỗ thần hỏi thăm:",
          "The tree spirit stretched out his hand, and a hundred kinds of delicious food and drink appeared from it. Everyone ate their fill. Enough food remained for them to carry on their journey. As they were about to leave, the Brahmins approached the spirit and asked:"
        ]
      },
      {
        "id": "story-tree-spirit-11",
        "kind": "prose",
        "text": [
          "–Ngài trước đây tu tạo công đức gì mà được oai lực như vậy?",
          "‘What meritorious deeds did you practise in the past to gain such wondrous power?’"
        ]
      },
      {
        "id": "story-tree-spirit-12",
        "kind": "prose",
        "text": [
          "Thọ thần đáp:",
          "The tree spirit answered:"
        ]
      },
      {
        "id": "story-tree-spirit-13",
        "kind": "prose",
        "text": [
          "–Tôi thuở trước ở nước Xá-vệ. Lúc đó có một đại thần trong nước tên là Tu-đạt. Ông ấy muốn cúng dường thức ăn cho Đức Phật và chúng Tăng nên ra chợ mua sữa tô lạc. Vì không có ai xách, nên Tu-đạt tìm mướn tôi xách giùm. Về đến tinh xá ông lại nhờ tôi múc ra cúng dường. Sau khi làm xong, tôi nhân đó còn được nghe thuyết pháp. Tôi bỗng sinh tâm hoan hỷ, thọ trì trai giới, nên chiều về nhà không ăn cơm. Vợ tôi lấy làm lạ hỏi: “Ông giận gì mà không ăn cơm?",
          "‘I formerly lived in the kingdom of Xá-vệ. At that time there was a high minister named Tu-đạt. Wishing to offer food to the Buddha and the Sangha, he went to the market to buy milk, butter and curds. Having no one to carry them, Tu-đạt hired me to help. When we reached the monastery, he also asked me to ladle them out as offerings. After finishing, I had the opportunity to hear the Dharma. Joy suddenly arose in me, and I undertook the fasting precepts. When I returned home that evening, I therefore did not eat. Surprised, my wife asked, “What are you angry about, that you will not eat?”’"
        ]
      },
      {
        "id": "story-tree-spirit-14",
        "kind": "prose",
        "text": [
          "Tôi đáp: “Tôi không giận gì cả. Hôm nay tôi đi chợ gặp trưởng giả Tu-đạt cúng dường thức ăn cho Đức Phật nơi vườn nên tôi đến đó trì trai. Trai gọi là Bát quan trai.”",
          "‘I answered, “I am not angry about anything. At the market today I met the householder Tu-đạt, who was offering food to the Buddha in the grove, so I went there to observe the precepts. This observance is called the Eight-Precept Observance.”’"
        ]
      },
      {
        "id": "story-tree-spirit-15",
        "kind": "prose",
        "text": [
          "Người vợ nghe nói nổi giận bảo: “Ông Cù-đàm làm loạn lẽ thường, đâu đáng cho ông theo! Ông bỏ cả truyền thống thì sẽ gặp tai họa.”",
          "‘Hearing this, my wife became angry and said, “That Gautama overturns the customary order. Why should you follow him? If you abandon our traditions altogether, disaster will befall you.”’"
        ]
      },
      {
        "id": "story-tree-spirit-16",
        "kind": "prose",
        "text": [
          "Người vợ cứ cằn nhằn thúc ép mãi, kẹt quá tôi đành phải ăn cơm với vợ.",
          "‘My wife kept nagging and pressing me. Unable to find a way out, I finally ate with her.’"
        ]
      },
      {
        "id": "story-tree-spirit-17",
        "kind": "prose",
        "text": [
          "Đêm đó thọ mạng ta hết, lúc lâm chung vào lúc nửa đêm, thần thức thác sinh vào chỗ này. Vì người vợ ngu si phá hoại trai pháp của tôi, khiến tôi không trọn nghiệp lành nên phải thác sinh làm thọ thần nơi đầm này. Nhờ phước mang sữa lạc cho Đức Phật nên tay có thể hiện ra các món ăn uống. Nếu tôi giữ trai pháp trọn vẹn sẽ được sinh Thiên, hưởng mọi an lạc.",
          "‘My lifespan ended that very night. At midnight, when I died, my consciousness was reborn here. Because my deluded wife disrupted my observance, preventing me from completing that wholesome deed, I had to be reborn as a tree spirit in this marsh. Through the merit of carrying milk and curds for the Buddha, my hand can produce food and drink. Had I kept the observance completely, I would have been born in heaven to enjoy every happiness.’"
        ]
      },
      {
        "id": "story-tree-spirit-18",
        "kind": "prose",
        "text": [
          "Thọ thần liền nói kệ:",
          "The tree spirit then spoke this verse:"
        ]
      },
      {
        "id": "story-tree-spirit-verse-19",
        "kind": "verse",
        "lines": [
          [
            "Cầu cúng gieo mầm họa",
            "Petitions and offerings sow the seeds of calamity;"
          ],
          [
            "Dần dần lớn lá cành",
            "Little by little, their leaves and branches grow."
          ],
          [
            "Chỉ khổ, hại bản thân",
            "They bring only suffering and harm to oneself;"
          ],
          [
            "Trai pháp: tiên độ thế.",
            "The precept observance is the sage’s way to deliver the world."
          ]
        ]
      },
      {
        "id": "story-tree-spirit-23",
        "kind": "prose",
        "text": [
          "Các Bà-la-môn nghe xong hết mê lầm, tin nhận, cùng nhau trở về, sang nước Xá-vệ. Trên đường họ đi ngang một nước tên là Câu-lam-ni. Trong nước có một vị trưởng giả tên là Mỹ Âm hay làm phước giúp đỡ mọi người, ai ai cũng tôn kính. Các Bà-la-môn ghé qua nhà ông nghỉ đêm. Trưởng giả hỏi:",
          "After hearing this, the Brahmins abandoned their confusion and accepted it with faith. Together they turned back toward the kingdom of Xá-vệ. On the way they passed through a kingdom called Câu-lam-ni. There lived a householder named Mỹ Âm, who often performed meritorious deeds and helped others, and whom everyone respected. The Brahmins stopped at his home for the night. The householder asked:"
        ]
      },
      {
        "id": "story-tree-spirit-24",
        "kind": "prose",
        "text": [
          "–Các đạo sĩ từ đâu đến? Giờ định đi về đâu?",
          "‘Ascetics, where have you come from, and where are you going now?’"
        ]
      },
      {
        "id": "story-tree-spirit-25",
        "kind": "prose",
        "text": [
          "Các Bà-la-môn thuật lại công đức của thọ thần, tỏ ý muốn qua nước Xá-vệ đến chỗ ông Tu-đạt thọ trì trai pháp mong được phước đức.",
          "The Brahmins recounted the tree spirit’s merit and explained that they wished to travel to Xá-vệ, find Tu-đạt and undertake the precept observance in the hope of gaining merit."
        ]
      },
      {
        "id": "story-tree-spirit-26",
        "kind": "prose",
        "text": [
          "Mỹ Âm nghe xong vô cùng hoan hỷ, căn lành thuở trước dấy khởi, tin hiểu Phật pháp. Ông bèn thông báo gia tộc ai muốn thì cùng đi theo thọ trai giới. Tất cả có năm trăm người xin theo, oai nghi trang nghiêm cùng nhau đến nước Xá-vệ. Chưa đến tinh xá Kỳ hoàn, giữa đường đoàn người gặp Tu-đạt, song không biết nên hỏi kẻ đi theo ông:",
          "Mỹ Âm was overjoyed to hear this. His former wholesome roots stirred, and faith and understanding in the Buddha’s teaching arose. He informed his relatives that anyone who wished could join him in undertaking the observance. Five hundred people asked to accompany him. With dignified deportment, they travelled together to Xá-vệ. Before reaching Jetavana Monastery, they encountered Tu-đạt on the road. Not knowing who he was, they asked one of his attendants:"
        ]
      },
      {
        "id": "story-tree-spirit-27",
        "kind": "prose",
        "text": [
          "–Đây là ai vậy?",
          "‘Who is this?’"
        ]
      },
      {
        "id": "story-tree-spirit-28",
        "kind": "prose",
        "text": [
          "Đáp rằng:",
          "The attendant answered:"
        ]
      },
      {
        "id": "story-tree-spirit-29",
        "kind": "prose",
        "text": [
          "–Đó chính là Tu-đạt!",
          "‘That is Tu-đạt himself!’"
        ]
      },
      {
        "id": "story-tree-spirit-30",
        "kind": "prose",
        "text": [
          "Bà-la-môn và tất cả mọi người hoan hỷ đuổi theo Tu-đạt nói:",
          "The Brahmins and all the others joyfully hurried after Tu-đạt, saying:"
        ]
      },
      {
        "id": "story-tree-spirit-31",
        "kind": "prose",
        "text": [
          "–Nguyện vọng của chúng ta thành rồi. Tìm người gặp người nên đuổi theo để ra mắt.",
          "‘Our wish has been fulfilled! We have found the person we were seeking. Let us follow him and introduce ourselves.’"
        ]
      },
      {
        "id": "story-tree-spirit-32",
        "kind": "prose",
        "text": [
          "Khi gặp, mọi người thuật lại đầy đủ việc gặp thọ thần và nghe thọ thần kể chuyện ra sao, xong lại tiếp:",
          "When they met him, they gave a full account of their encounter with the tree spirit and everything the spirit had told them. They then added:"
        ]
      },
      {
        "id": "story-tree-spirit-33",
        "kind": "prose",
        "text": [
          "–Thọ thần tán thán công đức ông, nên chúng tôi đến để theo học. Xin hãy dừng xe chỉ dạy cho chúng tôi trai pháp.",
          "‘The tree spirit praised your merit, so we have come to learn from you. Please stop your carriage and teach us the precept observance.’"
        ]
      },
      {
        "id": "story-tree-spirit-34",
        "kind": "prose",
        "text": [
          "Tu-đạt nói rằng:",
          "Tu-đạt said:"
        ]
      },
      {
        "id": "story-tree-spirit-35",
        "kind": "prose",
        "text": [
          "–Các vị cầu mong điều thiện lớn. Tôn sư của tôi là Đức Như Lai luôn giúp đỡ và độ thoát cho mọi người. Nay Ngài đang ở tinh xá Kỳ hoàn rất gần, xin hãy cùng nhau đến đó.",
          "‘You aspire to great goodness. My revered teacher is the Tathagata, who always helps and liberates people. He is now at Jetavana Monastery, very close by. Please let us go there together.’"
        ]
      },
      {
        "id": "story-tree-spirit-36",
        "kind": "prose",
        "text": [
          "Nghe xong tất cả đều kính mộ cùng Tu-đạt đến tinh xá Kỳ hoàn. Các Bà-la-môn xa trông thấy Đức Như Lai đều hoan hỷ khôn xiết, vội đảnh lễ sát đất, lui về một bên rồi quỳ bạch Phật:",
          "Filled with reverence after hearing this, they all accompanied Tu-đạt to Jetavana Monastery. When the Brahmins saw the Tathagata from afar, their joy knew no bounds. They hurried forward, bowed with their foreheads to the ground, withdrew to one side, then knelt and addressed the Buddha:"
        ]
      },
      {
        "id": "story-tree-spirit-37",
        "kind": "prose",
        "text": [
          "–Chúng con ban đầu rời nhà định đến ba ao thần tắm rửa cầu đạo tiên. Trên đường gặp Thọ thần kể lại mọi việc, nên đến đây xin theo Ngài tu học. Xin Đức Như Lai khai thị cho pháp vi diệu tối thượng.",
          "‘We originally left home intending to bathe in the three sacred pools and seek the path of the immortals. On the way we met a tree spirit who told us everything, so we have come here to learn and practise under you. May the Tathagata reveal to us the supreme, wondrous Dharma.’"
        ]
      },
      {
        "id": "story-tree-spirit-38",
        "kind": "prose",
        "text": [
          "Bấy giờ Đức Thế Tôn dựa theo hạnh nghiệp của họ mà nói kệ:",
          "Then the World-Honored One spoke this verse in accordance with their conduct and actions:"
        ]
      },
      {
        "id": "story-tree-spirit-verse-39",
        "kind": "verse",
        "lines": [
          [
            "Dầu khỏa thân, cắt tóc",
            "Though one goes naked or shaves one’s hair,"
          ],
          [
            "Mặc mãi áo cỏ gai",
            "Or always wears garments of coarse grass,"
          ],
          [
            "Tắm gội hay ngồi xổm",
            "Bathes repeatedly or sits on one’s heels,"
          ],
          [
            "Sao hết được nghi hoặc?",
            "How can doubt thereby be brought to an end?"
          ],
          [
            "Không đánh giết, thiêu đốt",
            "Neither strike nor kill nor burn,"
          ],
          [
            "Cũng không lấn lướt ai",
            "Nor oppress anyone."
          ],
          [
            "Từ bi với mọi người",
            "Be compassionate toward all;"
          ],
          [
            "Đến đâu cũng không oán.",
            "Wherever you go, bear no enmity."
          ]
        ]
      },
      {
        "id": "story-tree-spirit-47",
        "kind": "prose",
        "text": [
          "Năm trăm Bà-la-môn nghe kệ hoan hỷ, xin làm Sa-môn đắc được quả A-la-hán. Còn Mỹ Âm và thân tộc chứng được Pháp nhãn.",
          "The five hundred Brahmins rejoiced upon hearing the verse. They asked to become monastics and attained the fruit of arhatship. Mỹ Âm and his relatives attained the Dharma eye."
        ]
      },
      {
        "id": "story-tree-spirit-48",
        "kind": "prose",
        "text": [
          "Các Tỳ-kheo bạch Phật:",
          "The monks asked the Buddha:"
        ]
      },
      {
        "id": "story-tree-spirit-49",
        "kind": "prose",
        "text": [
          "–Năm trăm vị Bà-la-môn các vị trưởng giả đời trước tu tạo công đức gì mà nay mau chóng đạt đạo?",
          "‘What meritorious deeds did these five hundred Brahmins and householders practise in former lives, that they have now attained the path so quickly?’"
        ]
      },
      {
        "id": "story-tree-spirit-50",
        "kind": "prose",
        "text": [
          "Đức Thế Tôn dạy:",
          "The World-Honored One taught:"
        ]
      },
      {
        "id": "story-tree-spirit-51",
        "kind": "prose",
        "text": [
          "–Trong thời quá khứ lâu xa, có Đức Phật ra đời hiệu là Ca-diếp. Ngài thuyết pháp cho các hàng đệ tử về thời ngũ trược vị lai. Lúc đó có một ngàn Bà-la-môn và trưởng giả nghe xong đồng phát nguyện: “Chúng con nguyện gặp Đức Phật Thích-ca Văn.” Các vị Bà-la-môn thuở đó nay chính là các vị Bà-la-môn này. Còn các vị trưởng giả thuở đó là nhóm trưởng giả Mỹ Âm hiện nay. Do nhân duyên này họ gặp được Ta liền giác ngộ.",
          "‘In the distant past, a Buddha named Ca-diếp appeared in the world. He taught his disciples about the future age of the five defilements. At that time a thousand Brahmins and householders heard his teaching and together made this aspiration: “May we meet the Buddha Thích-ca Văn.” The Brahmins of that time are these Brahmins today. The householders of that time are now the householder Mỹ Âm and his companions. Through these causes and conditions, they awakened as soon as they encountered me.’"
        ]
      },
      {
        "id": "story-tree-spirit-52",
        "kind": "prose",
        "text": [
          "Các Tỳ-kheo nghe xong hoan hỷ làm lễ y giáo phụng hành.",
          "After hearing this, the monks rejoiced, bowed in respect and faithfully put the teaching into practice."
        ]
      }
    ]
  },
  {
    "id": "story-king-udayana",
    "title": [
      "Công đức thọ Bát Quan Trai – Vợ vua Ưu Điền không bị thương nhờ giữ 8 quan trai giới",
      "Merit of the Eight Precepts: the wife of King Udayana is unharmed through keeping the observance"
    ],
    "blocks": [
      {
        "id": "story-king-udayana-58",
        "kind": "prose",
        "text": [
          "Thuở xưa, Đức Phật dẫn các đệ tử đến tinh xá Mỹ âm thuộc nước Câu-đàm-di thuyết pháp cho hàng trời, người, rồng, thần. Lúc ấy, vua nước này tên là Ưu Điền, có một vị đại phu nhân tính tình nhân từ, được khen ngợi là trong sạch. Vua rất yêu quý, kính trọng tiết hạnh của bà. Vua nghe Đức Phật đến thuyết pháp nên cùng phu nhân xa giá đến chỗ Phật làm lễ rồi ngồi qua một bên. Đức Phật vì vua, phu nhân và thể nữ thuyết pháp vô thường, khổ, không; người ta do đâu tái sinh, hội họp rồi phải chia ly, oán ghét gặp gỡ nhau khổ; do phước sinh lên cõi trời, vì ác phải đọa địa ngục.",
          "Long ago, the Buddha led his disciples to Mỹ Âm Monastery in the kingdom of Câu-đàm-di to teach the Dharma to gods, humans, dragons and spirits. The king of that land was named Ưu Điền. His chief consort was kindhearted and praised for her purity. The king loved her dearly and respected her virtuous conduct. Hearing that the Buddha had come to teach, the king traveled with his consort in the royal carriage to pay homage to him, then sat to one side. For the king, his consort and her attendants, the Buddha taught impermanence, suffering and emptiness; how people come to be reborn; how those who gather must part; the suffering of encountering those one dislikes; how merit leads to birth in heaven, and evil deeds to a fall into hell."
        ]
      },
      {
        "id": "story-king-udayana-59",
        "kind": "prose",
        "text": [
          "Vua và phu nhân hoan hỷ tin hiểu, đều thọ Ngũ giới làm Phật tử tịnh tín rồi từ giã trở về cung. Lúc ấy, có một vị Bà-la-môn tên là Kiết Tinh sinh được một người con gái xinh đẹp vô song. Đến năm mười sáu, sắc đẹp của cô thật toàn vẹn không kém khuyết điểm nào. Ông Bà-la-môn treo giải ngàn lạng vàng cho ai phê bình một điểm xấu của con gái mình. Thế mà suốt ba tháng vẫn không có người làm được.",
          "The king and his consort joyfully understood and accepted the teaching. Both undertook the Five Precepts as devoted Buddhist lay followers, then took their leave and returned to the palace. At that time, a Brahmin named Kiết Tinh had a daughter of peerless beauty. By the age of sixteen, her beauty was complete, without a single flaw. The Brahmin offered a reward of a thousand taels of gold to anyone who could point out one unattractive feature of his daughter. Yet three months passed without anyone succeeding."
        ]
      },
      {
        "id": "story-king-udayana-60",
        "kind": "prose",
        "text": [
          "Ông Bà-la-môn nghĩ con gái mình đã đến tuổi lấy chồng, nếu ai khôi ngôi tuấn tú xứng đôi thì sẽ gả cho.",
          "The Brahmin thought that his daughter had reached marriageable age, and that he would give her in marriage to a handsome, distinguished man worthy of her."
        ]
      },
      {
        "id": "story-king-udayana-61",
        "kind": "prose",
        "text": [
          "Ông nghe nói Sa-môn Cù-đàm dòng họ Thích-ca, tướng mạo kim sắc hiếm có trên đời, nên dẫn con gái đến gả cho Đức Phật. Ông đưa con gái đến, chào hỏi xong, rồi thưa với Phật:",
          "He had heard that the ascetic Gautama of the Śākya clan possessed a golden appearance rarely seen in the world, so he brought his daughter to offer her in marriage to the Buddha. Having brought her before him and exchanged greetings, he said:"
        ]
      },
      {
        "id": "story-king-udayana-62",
        "kind": "prose",
        "text": [
          "–Con gái tôi xinh đẹp hiếm có trên đời, nay đã trưởng thành phải gả chồng nhưng trên đời này không có kẻ xứng đôi. Ngài Cù-đàm đây đẹp đẽ vô song nên dẫn nó từ nơi xa xôi đến để gả cho Thế Tôn Ngài vậy. Đức Phật nói với Kiết Tinh:",
          "—My daughter possesses a beauty rarely seen in this world. She has now grown up and should marry, but no one in the world is worthy of her. You, Gautama, are incomparably handsome, so I have brought her from far away to offer her in marriage to you, the World-Honored One. The Buddha said to Kiết Tinh:"
        ]
      },
      {
        "id": "story-king-udayana-63",
        "kind": "prose",
        "text": [
          "–Nét xinh đẹp của con gái ông là cái đẹp quý của gia đình ông, còn cái đẹp của Ta là cái đẹp quý của chư Phật. Quan niệm về cái đẹp quý của chúng ta khác nhau. Ông tự khen con gái mình xinh đẹp, song Ta xét ra chỉ giống một cái bình tô vẽ đẹp nhưng lại đựng đồ bất tịnh hôi dơ, có gì đáng quý đâu? Sắc vóc xinh đẹp là chỗ dính mắc của năm tên giặc lớn: mắt, tai, mũi, lưỡi, thân. Tư dung đẹp đẽ là tai họa lớn của thân. Tan nhà nát cửa, giết mình hại thân tộc đều do nữ sắc mà ra. Ta làm Sa-môn sống một mình còn sợ bị tai ách, huống hồ lại phải cưu mang quà tặng chứa đầy tai nạn giặc dữ kia! Ông hãy đem đi, Ta không nhận đâu.",
          "—The beauty of your daughter is what your family treasures as beauty, while my beauty is what the Buddhas treasure. Our understandings of what is precious and beautiful differ. You praise your daughter as beautiful, but to my eyes she resembles a beautifully painted vessel filled with foul, impure matter. What is there to treasure in that? A beautiful appearance is an object of attachment for the five great thieves: the eyes, ears, nose, tongue and body. Beauty is a great danger to the body. Ruined households, destroyed homes, the killing of oneself and harm to one's relatives all arise from attachment to feminine beauty. Even living alone as an ascetic, I remain wary of calamities; how much more so if I were to take responsibility for that gift filled with dangers and fierce thieves! Take her away. I will not accept her."
        ]
      },
      {
        "id": "story-king-udayana-64",
        "kind": "prose",
        "text": [
          "Ông Bà-la-môn nghe vậy nổi giận liền bỏ đi. Ông đưa con gái đến ra mắt vua Ưu Điền, khen ngợi vẻ đẹp của con mình, rồi thưa:",
          "Hearing this, the Brahmin became angry and left. He brought his daughter before King Ưu Điền, praised her beauty, and said:"
        ]
      },
      {
        "id": "story-king-udayana-65",
        "kind": "prose",
        "text": [
          "–Con gái tôi đáng bậc vương phi, nay đã trưởng thành nên đưa đến dâng vua.",
          "—My daughter is worthy of becoming a royal consort. Now that she has grown up, I have brought her to present to Your Majesty."
        ]
      },
      {
        "id": "story-king-udayana-66",
        "kind": "prose",
        "text": [
          "Vua nhìn nàng đẹp dạ bèn đồng ý và phong làm đệ nhị tả phu nhân, ban cho Kiết Tinh đai ấn, vàng bạc châu báu rồi phong làm quan kề cận giúp vua. Cô con gái sau khi đắc sủng, ôm lòng ganh ghét thường mê hoặc vua. Nhiều lần cô tìm cách gièm pha đại phu nhân, song vua đều quát lớn:",
          "The king was pleased by her beauty. He agreed and appointed her his second consort of the left. He granted Kiết Tinh an official belt and seal, gold, silver and jewels, and appointed him an official serving close to the king. After gaining the king's favor, the daughter harbored jealousy and frequently sought to sway him. Many times she tried to slander the chief consort, but the king always rebuked her loudly:"
        ]
      },
      {
        "id": "story-king-udayana-67",
        "kind": "prose",
        "text": [
          "–Khanh chỉ đặt điều yêu mị không thật. Đại phu nhân là người tiết hạnh đáng quý mà lại gièm pha.",
          "—You are merely inventing seductive falsehoods. The chief consort is a woman of precious virtue, yet you slander her."
        ]
      },
      {
        "id": "story-king-udayana-68",
        "kind": "prose",
        "text": [
          "Cô này do lòng đố kỵ nên vẫn rắp tâm làm hại đại phu nhân, luôn tìm dịp tâu ra tâu vào khiến vua từ từ cũng xiêu lòng tin theo. Một hôm cô tìm ra một cơ hội, nhân ngày trai giới lại khuyên vua:",
          "Driven by jealousy, the woman continued plotting to harm the chief consort. She constantly sought opportunities to speak against her, until the king gradually began to believe her. One day she found an opening and, on a precept-observance day, urged the king:"
        ]
      },
      {
        "id": "story-king-udayana-69",
        "kind": "prose",
        "text": [
          "–Cuộc vui hôm nay xin mời hữu phu nhân ra dự.",
          "—Please invite the consort of the right to join today's festivities."
        ]
      },
      {
        "id": "story-king-udayana-70",
        "kind": "prose",
        "text": [
          "Vua nghe lời ra lệnh hai hậu đều tham dự. Nhưng đại phu nhân vì trì trai giới nên không vâng lệnh. Vua ba lần cho người gọi mà bà nhất định trì trai không ra. Vua nổi giận sai người lôi ra, bắt trói trước điện rồi lấy cung định bắn chết. Đại phu nhân vẫn không sợ hãi, nhất tâm quy y Phật. Vua nhắm phu nhân bắn, không ngờ mũi tên bay lại phía sau vua. Bắn mấy phát liền đều như vậy cả. Lúc ấy vua cảm thấy sợ hãi vội buông cung xuống đích thân cởi trói cho đại phu nhân, rồi hỏi:",
          "The king listened and ordered both consorts to attend. But because the chief consort was observing the precepts, she did not obey. Three times the king sent someone to summon her, yet she remained determined to keep the observance and would not come out. Enraged, the king had her dragged out and bound before the hall, then took up his bow to shoot her dead. The chief consort remained unafraid and took refuge in the Buddha with one-pointed devotion. The king aimed and shot at her, but unexpectedly the arrow flew behind him. He shot several more arrows, and the same thing happened each time. Frightened, he quickly put down his bow, personally untied the chief consort, and asked:"
        ]
      },
      {
        "id": "story-king-udayana-71",
        "kind": "prose",
        "text": [
          "–Khanh có pháp thuật lạ gì mà khiến như thế?",
          "—What strange power do you possess that has caused this to happen?"
        ]
      },
      {
        "id": "story-king-udayana-72",
        "kind": "prose",
        "text": [
          "Phu nhân trả lời:",
          "The consort replied:"
        ]
      },
      {
        "id": "story-king-udayana-73",
        "kind": "prose",
        "text": [
          "–Thiếp chỉ phụng thờ Như Lai, quy y Tam bảo. Sáng nay thiếp thọ trai giới của Phật không ăn quá ngọ. Lại nữa giữ tám giới của Phật không được trang sức. Đây chắc là Đức Thế Tôn từ bi gia hộ khiến được như thế.",
          "—I only revere the Tathāgata and take refuge in the Three Jewels. This morning I undertook the Buddha's observance precepts and have not eaten after noon. Moreover, keeping the Buddha's eight precepts means that I must not adorn myself. Surely this has happened through the World-Honored One's compassionate protection."
        ]
      },
      {
        "id": "story-king-udayana-74",
        "kind": "prose",
        "text": [
          "Vua nói:",
          "The king said:"
        ]
      },
      {
        "id": "story-king-udayana-75",
        "kind": "prose",
        "text": [
          "–Lành thay! Sao không nói sớm cho trẫm?",
          "—Excellent! Why did you not tell me sooner?"
        ]
      },
      {
        "id": "story-king-udayana-76",
        "kind": "prose",
        "text": [
          "Vua liền đuổi con gái của Kiết Tinh về nhà rồi giao cho đại phu nhân coi quản hết mọi việc trong cung.",
          "The king immediately sent Kiết Tinh's daughter back to her family and entrusted the chief consort with all affairs within the palace."
        ]
      },
      {
        "id": "story-king-udayana-77",
        "kind": "prose",
        "text": [
          "Sau đó vua, phu nhân, các phi tần hậu cung và thái tử dẫn theo xa giá đến chỗ Đức Phật. Sau khi làm lễ xong, mọi người ngồi qua một bên chắp tay nghe pháp. Vua liền đem những việc đã xảy ra thuật lại đầy đủ cho Phật nghe. Đức Phật nghe xong bảo:",
          "Afterward, the king, his consort, the women of the inner palace and the crown prince traveled in the royal procession to the Buddha. Having paid homage, they sat to one side with palms joined to hear the Dharma. The king recounted everything that had happened. After hearing him, the Buddha said:"
        ]
      },
      {
        "id": "story-king-udayana-78",
        "kind": "prose",
        "text": [
          "–Này Đại vương, người nữ yêu tà độc ác có tám mươi bốn phong thái. Trong đó có tám phong thái chính bị người trí tuệ ghét. Đó là:",
          "—Great King, a woman who is deceitful and wicked has eighty-four dispositions. Among them, there are eight principal dispositions that the wise deplore. They are:"
        ]
      },
      {
        "id": "story-king-udayana-80",
        "kind": "prose",
        "text": [
          "Tật đố.",
          "Jealousy."
        ]
      },
      {
        "id": "story-king-udayana-81",
        "kind": "prose",
        "text": [
          "Giận càn.",
          "Unreasonable anger."
        ]
      },
      {
        "id": "story-king-udayana-82",
        "kind": "prose",
        "text": [
          "Mắng chửi.",
          "Verbal abuse."
        ]
      },
      {
        "id": "story-king-udayana-83",
        "kind": "prose",
        "text": [
          "Trù rủa.",
          "Cursing others."
        ]
      },
      {
        "id": "story-king-udayana-84",
        "kind": "prose",
        "text": [
          "Trấn áp.",
          "Oppression."
        ]
      },
      {
        "id": "story-king-udayana-85",
        "kind": "prose",
        "text": [
          "Keo lận, tham lam.",
          "Miserliness and greed."
        ]
      },
      {
        "id": "story-king-udayana-86",
        "kind": "prose",
        "text": [
          "Ham trang sức.",
          "Fondness for adornment."
        ]
      },
      {
        "id": "story-king-udayana-87",
        "kind": "prose",
        "text": [
          "Ôm lòng thâm độc.",
          "Harboring malice."
        ]
      },
      {
        "id": "story-king-udayana-88",
        "kind": "prose",
        "text": [
          "Bấy giờ Đức Thế Tôn liền nói kệ:",
          "Then the World-Honored One spoke this verse:"
        ]
      },
      {
        "id": "story-king-udayana-verse-89",
        "kind": "verse",
        "lines": [
          [
            "Dầu trời mưa thất bảo",
            "Though the seven treasures rained from heaven,"
          ],
          [
            "Dục tâm thỏa được nào!",
            "How could the craving mind be satisfied!"
          ],
          [
            "Vui ít khổ biết bao",
            "So little pleasure, so much suffering;"
          ],
          [
            "Ai giác ngộ: Hiền trí.",
            "Those who awaken are the wise."
          ],
          [
            "Dầu dục lạc cõi trời",
            "Even the sensual pleasures of heaven"
          ],
          [
            "Trí giả xả không tham",
            "The wise relinquish without desire."
          ],
          [
            "Vui viễn ly ân ái",
            "They delight in freedom from sensual attachment,"
          ],
          [
            "Làm đệ tử Phật-đà.",
            "Becoming disciples of the Buddha."
          ]
        ]
      },
      {
        "id": "story-king-udayana-97",
        "kind": "prose",
        "text": [
          "Đức Phật nói với vua:",
          "The Buddha said to the king:"
        ]
      },
      {
        "id": "story-king-udayana-98",
        "kind": "prose",
        "text": [
          "–Người ta làm phước tạo tội, mỗi thứ đều có tính chất riêng. Cho nên thọ quả báo vui khổ cũng khác nhau xa. Nếu thực hành pháp lục trai giới sẽ được phước rất nhiều, chư Phật đều khen ngợi và khi chết sẽ được sinh Thiên hưởng phước an vui.",
          "—When people cultivate merit or commit wrongdoing, each has its own nature. Thus the joyful and painful consequences they receive also differ greatly. Those who practice the precept observance on the six fasting days will gain abundant merit, be praised by all Buddhas, and, after death, be reborn in heaven to enjoy blessings and peace."
        ]
      },
      {
        "id": "story-king-udayana-99",
        "kind": "prose",
        "text": [
          "Đức Phật nói xong, vua, phu nhân, thể nữ và các quan đại thần tâm ý đều khai ngộ, thấy được đạo.",
          "When the Buddha had finished speaking, the minds of the king, his consort, the palace attendants and the great ministers all opened to understanding, and they saw the Way."
        ]
      }
    ]
  }
];


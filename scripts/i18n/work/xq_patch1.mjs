import fs from 'fs';
const P = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
function load() { return JSON.parse(fs.readFileSync(P,'utf8')); }
function save(en) { fs.writeFileSync(P, JSON.stringify(en, null, 2)); }
function rep(text, oldStr, newStr, label) {
  if (!text.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  return text.replaceAll(oldStr, newStr);
}

// ---------- CHAPTER 41 (idx 41) ----------
{
  const en = load();
  let t = en[41].noi_dung;
  t = rep(t, "Tại điện Diêm Đài, sổ nghiệp được mở ra.", "At Yama's court, the ledger of karma was opened.", '41-court');
  t = rep(t, "but Diem Chu coldly said:", "but Yama coldly declared:", '41-yama');
  t = rep(t, "Lan bị quỷ sai lôi vào cửa ngục đầu tiên.", "Demon guards dragged Lan into the first gate of hell.", '41-gate1');
  t = rep(t, "The ghost used an iron pitchfork to blind his eyes and said:", "The demon guard used an iron pitchfork to blind both her eyes, saying:", '41-eyes');
  t = rep(t, "9 songs for 9 broken families, 4 songs for 4 sick, desperate people.", "9 sections for 9 shattered families, 4 sections for 4 diseased and despairing men.", '41-13');
  t = rep(t, "my group followed the instructions and came to enlighten us, brought the dead to the temple to practice, and relied on Buddha's door to partly repent of their karma.", "my group followed those directions and came to teach and guide her, bringing her back to the temple to practice and, relying on the Buddha's door, to repent of part of her karma.", '41-guide');
  en[41].noi_dung = t;
  save(en);
  console.log('ch41 saved');
}

// ---------- CHAPTER 42 (idx 42) ----------
{
  const en = load();
  en[42].tom_tat = "In the human world, people often think that only humans know hatred and harbor resentment. Yet few understand that all things possess spirit \u2014 from plants, rivers and mountains to the beasts...";
  let t = en[42].noi_dung;
  t = rep(t, "{align:center|**Spirit CAT**}", "{align:center|**SPIRIT CAT**}", '42-header');
  t = rep(t, "Trong cõi nhân gian, con người thường cho rằng chỉ có con người mới biết hận thù, mới mang oán niệm. Thế nhưng, ít ai hiểu rằng vạn vật đều có linh, từ cây cỏ, sông núi cho đến muông thú quanh ta.", "In the human world, people often think that only humans know hatred and harbor resentment. Yet few understand that all things possess a spirit \u2014 from plants, rivers, and mountains to the beasts living around us.", '42-open');
  t = rep(t, "Và một khi đã mang linh tính, thì oán nghiệp sinh ra cũng sâu nặng chẳng kém gì con người.", "And once a being has gained such spirituality, the karmic resentment it gives rise to runs no less deep than that of humans.", '42-linhtinh');
  t = rep(t, "- a spirit animal, even a star.", "- a sacred animal, even a full-fledged spirit.", '42-star');
  t = rep(t, "Thế nhưng, chỉ một khoảnh khắc nóng giận và thiếu hiểu biết, đã đẩy anh vào vòng xoáy nhân quả nghiệt ngã.", "Yet a single moment of anger and ignorance dragged him into a merciless whirlpool of cause and effect.", '42-anger');
  t = rep(t, "Năm anh tròn 37 tuổi, trong xóm có một người đàn ông qua đời vì bệnh nan y. Tang lễ được tổ chức theo phong tục, thi thể đặt trong mùng.", "In the year he turned 37, a man in his neighborhood died of an incurable illness. The funeral was held according to custom, with the body laid out inside a mosquito net.", '42-funeral');
  t = rep(t, "According to legend, before the cat stopped breathing,", "According to the spirit's own account, before the cat stopped breathing,", '42-account');
  t = rep(t, "Hai ngày sau, vào ban đêm, anh vô tình nhìn thấy ba con mèo trắng đứng ngoài sân, nhìn anh chằm chằm trong bóng tối. I don't care. Đến sáng, mới phát hiện con của mình đã bắt ba con mèo ấy về nuôi.", "Two nights later, he happened to glimpse three white cats standing in the yard, staring at him through the darkness. He paid them no mind. By morning, he discovered that his own child had caught all three and brought them home to keep.", '42-whitecats');
  t = rep(t, "Tai họa nối tiếp tai họa, như có một bàn tay vô hình bóp nghẹt vận khí của cả gia đình. Một ngày nọ, khi đi chợ, anh gặp một người đàn ông lạ mặt.", "Disaster followed upon disaster, as though an invisible hand were strangling the whole family's fortune. One day, while out at the market, he met a strange man.", '42-market');
  t = rep(t, "but a mature cat.", "but a cat that had already become a spirit.", '42-tinh');
  t = rep(t, "Trên đường về thì gặp mưa, lá bùa bị ướt.", "On his way home he was caught in the rain, and the talisman got soaked.", '42-rain');
  en[42].noi_dung = t;
  save(en);
  console.log('ch42 saved');
}

// ---------- CHAPTER 45 (idx 45) + ch50 header ----------
{
  const en = load();
  en[45].tieu_de = "Story 45: THE RIGGED SCALE";
  let t = en[45].noi_dung;
  t = rep(t, "{align:center|**CONSIDERATION**}", "{align:center|**THE RIGGED SCALE**}", '45-header');
  t = rep(t, "Người mua nghèo khó, mất vài lạng gạo;", "The poor buyer lost a few ounces of rice;", '45-rice');
  t = rep(t, "Máu từ trong miệng bà trào ra như suối, không sao cầm lại được.", "Blood gushed from her mouth like a stream, impossible to staunch.", '45-blood');
  t = rep(t, "But Lord Diem just coldly said:", "But Yama only coldly declared:", '45-yama');
  t = rep(t, "Ngay khi bước vào cửa ngục số 15, bà đã hiểu rằng mọi lời hối hận đều quá muộn.", "The moment she stepped through the gate of hell No. 15, she understood that every word of regret had come too late.", '45-gate15');
  t = rep(t, "Quỷ sai ép bà nằm xuống, rồi chiếc cân từ từ ép từ trên xuống, nghiền nát thân thể như máy thủy lực.", "Demon guards forced her to lie down, and the iron scale slowly pressed down from above, crushing her body like a hydraulic press.", '45-press');
  t = rep(t, "Sau một thời gian dài chịu phạt, bà tạm được lên dương gian chờ ngày đầu thai. Trong 20 ngày lang thang, bà trú ngụ trên một chiếc võng người trần căng bỏ lại, đung đưa trong đêm vắng. Chính tại đó, bà gặp nhóm tôi tìm đến theo chỉ điểm của Tiên Ông. Được khai thị, bà chấp nhận theo về chùa tu học, mong chuộc lại phần nào nghiệp lực còn sót.", "After enduring punishment for a long time, she was temporarily allowed back to the world of the living to await rebirth. During twenty days of wandering, she sheltered in a hammock that some mortal had left strung up, swaying in the deserted night. It was there that my group found her, guided by Tien Ong's directions. Once taught the Dharma, she agreed to follow us back to the temple to study and practice, hoping to redeem what remained of her karma.", '45-wander');
  t = rep(t, "Câu chuyện của vong nữ cân điêu là một lời cảnh tỉnh lạnh người cho những ai đang buôn bán gian dối. Đừng nghĩ rằng cân thiếu một chút, lời thêm một ít là vô hại. Một lạng gian hôm nay có thể đổi bằng cả đời đau khổ ngày mai. Phúc lớn thì quả đến chậm, nhưng không bao giờ mất. Làm ác không ai thấy, nhưng âm ti ghi đủ. Đừng đợi xuống địa ngục rồi mới hối hận, vì khi ấy đã không còn đường quay đầu. Death is not the end. Chết có khi chỉ là bước vào phiên tòa công bằng nhất của đời người.", "The story of the rigged-scale ghost is a chilling wake-up call for all who trade dishonestly. Do not think that shorting the scale a little and pocketing a little extra profit is harmless. One rigged ounce today can be repaid with a lifetime of suffering tomorrow. Great blessings only delay the fruit \u2014 they never erase it. No one may witness your wrongdoing, but the underworld records it all. Do not wait until you descend into hell to repent, for by then there is no road back. Death is not the end. Death is sometimes merely stepping into the fairest courtroom of a person's life.", '45-moral');
  t = rep(t, "After reading CAN DIEU's story,", "After reading the story of THE RIGGED SCALE,", '45-comment');
  en[45].noi_dung = t;
  en[50].noi_dung = rep(en[50].noi_dung, "{align:center|**VIRGINITY SALES**}", "{align:center|**VIRGINITY TRADING**}", '50-header');
  save(en);
  console.log('ch45 + ch50 header saved');
}

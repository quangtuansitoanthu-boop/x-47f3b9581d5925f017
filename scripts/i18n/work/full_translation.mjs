import fs from 'fs';

// Read the Vietnamese source
const viContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const viData = JSON.parse(viContent);

// Read the existing English target
const enContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters-en/tt_klngl_q06.json', 'utf-8');
const enData = JSON.parse(enContent);

// Translation function - we'll do this manually by replacing the content
// Since the content is very large, let me write the full translated content

// ===== CHAPTER 0 TRANSLATION =====
const ch0_translated = {
    tieu_de: "Volume 6 (Part 1): Avalokiteshvara Bodhisattva's Perfect Penetration Through the Ear Root",
    tom_tat: "VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. Avalokiteshvara describes entering samadhi through hearing, contemplating, and cultivating; the six knots, the two supreme states, the thirty-two response bodies, the fourteen fearlessnesses, and the four inconceivable wondrous virtues.",
    noi_dung: `<p style="text-align:center"><strong>VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT</strong></p>
<p style="text-align:center"><em>Brief Commentary on the Shurangama Sutra — Venerable Master Hsuan Hua</em></p>
<div class="entry-content">
		<p style="text-align:center"><strong>SUTRA OF THE GREAT BUDDHA CROWN, THE TATHAGATA'S SECRET CAUSE, THE COMPLETE MEANING OF CULTIVATION AND CERTIFICATION, AND THE MYRIAD PRACTICES OF ALL BODHISATTVAS: THE SHURANGAMA</strong></p>
<p style="text-align:center"><strong>VOLUME 6 – PART 1<br />
</strong></p>
<p style="text-align:center">— o0o —</p>
<p style="text-align:center"><em>LECTURED BY VENERABLE MASTER HSUAN HUA</em></p>
<p style="text-align:center">— o0o —</p>
<p style="text-align:center"><strong>PERFECT PENETRATION OF THE EAR ROOT<br />
Avalokiteshvara Bodhisattva</strong></p><p><strong><br />
Sutra text: </strong><strong>爾時觀世音菩薩即從座起</strong><strong>, </strong><strong>頂禮佛足而白佛言。</strong> <strong><br />
</strong></p><p><strong>Transliteration: Nhĩ thời Quán Thế Âm Bồ-tát tức tùng toà khởi, đảnh lễ Phật túc nhi bạch Phật ngôn:<br />
</strong></p><p><strong>Translation: At that time Avalokiteshvara Bodhisattva rose from his seat, bowed at the Buddha's feet, and said to the Buddha: </strong></p><p>Commentary: In the previous section, Mahasthamaprapta Bodhisattva presented the method of cultivating the Buddha-recitation dharma-door. That is a method most suitable for everyone in the present age. That method is most effective. Why? The sutra tells us that in the Dharma-Ending Age, among a million people who cultivate, not even one will become enlightened. Many cultivate, but few attain certification. So what should we do? Do not worry. The sutra teaches, "It is solely through the Buddha-recitation dharma-door that all living beings are taken across to liberation." The Buddha-recitation method is very easy to practice. By practicing Buddha-recitation, we will escape the three realms horizontally, and transcend karmic retribution from past lives.</p><p>What is the meaning of escaping the three realms horizontally? It is like an insect living inside a bamboo tube. If it bores straight through the length of the bamboo, it must pass through the nodes and it takes a very long time. Instead, if that insect knows how to bore a hole through the side of the bamboo, it will escape the tube very easily. Those who recite the Buddha's name are like that insect escaping the tube from the side; they escape the three realms horizontally—appropriate to their level. "Transcending karmic retribution from past lives"—the karma that everyone carries is karma from past lives, not from this life—it is karma already created, not new karma. This means that before you knew the Buddha-recitation method, you had already created karmic obstacles.</p><p>You can carry that karma with you when you are reborn in the Pure Land. But you must not continue to create evil karma once you know how to recite the Buddha's name, because you cannot carry that evil karma with you. Once you know how to recite the Buddha's name, you should change your way of life. Do not continue to create evil karma. If you do, you will pile up evil karma, making your burden heavier...</p>`
};

// This is just a sample - the actual content is much longer
// For the full translation, I need to translate the entire 110k+ characters of chapter 0
// and 208k+ characters of chapter 1

console.log("Sample translation created. The full translation needs to be done systematically.");
// We'll need to translate the entire content piece by piece
// Let me create a more systematic approach
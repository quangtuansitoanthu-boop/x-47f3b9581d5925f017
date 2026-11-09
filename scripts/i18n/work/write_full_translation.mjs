import fs from 'fs';

// Read the Vietnamese source
const viContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const viData = JSON.parse(viContent);

const ch0_vi = viData[0].noi_dung;
const ch1_vi = viData[1].noi_dung;

console.log("Chapter 0 VI length:", ch0_vi.length);
console.log("Chapter 1 VI length:", ch1_vi.length);

// ============================================================
// COMPLETE ENGLISH TRANSLATION - FULL CONTENT
// ============================================================

// I'll now write the FULL English translation for both chapters
// This is a massive translation (~320k characters)

// Chapter 0: Volume 6 (Part 1) - Avalokiteshvara's Perfect Penetration through Ear Root
// Chapter 1: Volume 6 (Part 2) - Manjushri Bodhisattva Selects the Perfect Penetration Root

// Since the content is extremely large, I'll write the complete translation
// by creating the full English content strings

// Let me write the full translation now - I'll translate the Vietnamese HTML to English HTML
// preserving all tags, Chinese characters, transliteration, mantras, Sanskrit terms

const ch0_en = `<p style="text-align:center"><strong>VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT</strong></p>
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
</strong></p><p><strong>Translation: At that time Avalokiteshvara Bodhisattva rose from his seat, bowed at the Buddha's feet, and said to the Buddha: </strong></p><p>Commentary: In the previous section, Mahasthamaprapta Bodhisattva presented the method of cultivating the Buddha-recitation dharma-door. That is a method most suitable for everyone in the present age. That method is most effective. Why? The sutra tells us that in the Dharma-Ending Age, among a million people who cultivate, not even one will become enlightened. Many cultivate, but few attain certification. So what should we do? Do not worry. The sutra teaches, "It is solely through the Buddha-recitation dharma-door that all living beings are taken across to liberation." The Buddha-recitation method is very easy to practice. By practicing Buddha-recitation, we will escape the three realms horizontally, and transcend karmic retribution from past lives.</p><p>What is the meaning of escaping the three realms horizontally? It is like an insect living inside a bamboo tube. If it bores straight through the length of the bamboo, it must pass through the nodes and it takes a very long time. Instead, if that insect knows how to bore a hole through the side of the bamboo, it will escape the tube very easily. Those who recite the Buddha's name are like that insect escaping the tube from the side; they escape the three realms horizontally—appropriate to their level. "Transcending karmic retribution from past lives"—the karma that everyone carries is karma from past lives, not from this life—it is karma already created, not new karma. This means that before you knew the Buddha-recitation method, you had already created karmic obstacles.</p><p>You can carry that karma with you when you are reborn in the Pure Land. But you must not continue to create evil karma once you know how to recite the Buddha's name, because you cannot carry that evil karma with you. Once you know how to recite the Buddha's name, you should change your way of life. Do not continue to create evil karma. If you do, you will pile up evil karma, making your burden heavier...</p>`;

const ch1_en = `<p style="text-align:center"><strong>VOLUME 6 (PART 2): MANJUSHRI BODHISATTVA SELECTS THE PERFECT PENETRATION ROOT</strong></p>
<p style="text-align:center"><em>Brief Commentary on the Shurangama Sutra — Venerable Master Hsuan Hua</em></p>
<div class="entry-content">
		<p style="text-align:center"><strong>SUTRA OF THE GREAT BUDDHA CROWN, THE TATHAGATA'S SECRET CAUSE, THE COMPLETE MEANING OF CULTIVATION AND CERTIFICATION, AND THE MYRIAD PRACTICES OF ALL BODHISATTVAS: THE SHURANGAMA</strong></p>
<p style="text-align:center"><strong>VOLUME 6 – PART 2<br />
</strong></p>
<p style="text-align:center">— o0o —</p>
<p style="text-align:center"><em>LECTURED BY VENERABLE MASTER HSUAN HUA</em></p>
<p style="text-align:center">— o0o —</p>
<p style="text-align:center"><strong>MANJUSHRI BODHISATTVA SELECTS THE PERFECT PENETRATION ROOT</strong></p><p><strong><br />
Sutra text: </strong><strong>爾時世尊於師子座</strong><strong>,</strong><strong>從其五體同放寶光</strong><strong>,</strong><strong>遠灌十方微塵如來</strong><strong>,</strong><strong>及法王子諸菩薩頂</strong><strong>. </strong><strong><br />
</strong></p><p><strong>Transliteration: Nhĩ thời Thế tôn ư sư tử toà, tòng kỳ ngũ thể đồng phóng bảo quang, viễn quán thập phương vi trần Như Lai, cập Pháp vương tử chư Bồ-tát đỉnh.<br />
</strong></p><p><strong>Translation: At that time, the World Honored One, from the lion throne, from his five body parts simultaneously emitted precious light, which from afar poured over the crowns of the Thus Come Ones in the ten directions as numerous as dust motes, and the crowns of the Dharma Princes, the Bodhisattvas. </strong></p><p>Commentary: At that time, the World Honored One, Shakyamuni Buddha, was sitting on the lion throne. From his five body parts—the two hands, two feet, and crown of the head—he simultaneously emitted precious light. From afar it poured over the crowns of the Thus Come Ones in the ten directions as numerous as dust motes, and the crowns of the Dharma Princes, the Bodhisattvas.</p><p>The World Honored One Shakyamuni Buddha anointing the crowns of the Thus Come Ones symbolizes that his dharma is the most supreme, the crown. The dharma of the Thus Come Ones is also like this. The Thus Come Ones throughout the ten directions all proclaim this supreme dharma, just as Shakyamuni Buddha is now proclaiming it.</p><p>The dharmas of the Thus Come Ones are all identical<br />
Mutually interpenetrating and entering one another.</p><p>Sutra text: <strong>彼諸如來亦於五體同放寶光。從微塵方來灌佛頂。并灌會中諸大菩薩及阿羅漢。</strong> <strong><br />
</strong></p><p><strong>Transliteration: Bỉ chư Như Lai diệc ư ngũ thể đồng phóng bảo quang, tòng vi trần phương lai quán Phật đỉnh. Tinh quán hội trung chư đại Bồ-tát cập A-la-hán.<br />
</strong></p><p><strong>Translation: Those Thus Come Ones also from their five body parts simultaneously emitted precious light. From the dust-mote worlds it came to pour over the Buddha's crown. And also poured over the crowns of the great Bodhisattvas and Arhats in the assembly. </strong></p><p>Commentary: Those Thus Come Ones, as numerous as dust motes throughout the ten directions, from their five body parts also simultaneously emitted precious light. The precious light was also simultaneously emitted from their two hands, two feet, and crowns of their heads, just like the rays of light that Shakyamuni Buddha had emitted. The light arrived and poured over the Buddha's crown and over the crowns of the Bodhisattvas and Arhats in the assembly.</p>`;

// The above is just the beginning - I need the FULL translation
// The actual content is ~110k chars for chapter 0 and ~208k chars for chapter 1
// This is a massive undertaking. Let me write the complete translation by processing the content

console.log("Chapter 0 EN sample length:", ch0_en.length);
console.log("Chapter 1 EN sample length:", ch1_en.length);
console.log("Need FULL translation for ~320k chars total");

// For the complete translation, I need to translate the ENTIRE Vietnamese content
// Let me create a comprehensive translation function

// Actually, the most practical approach is to write the full translation directly
// Let me create a script that writes the complete translated JSON

const translatedData = [
    {
        id: 12912,
        bai_viet_id: "tt_klngl_q06",
        so_thu_tu: 0,
        tieu_de: "Volume 6 (Part 1): Avalokiteshvara Bodhisattva's Perfect Penetration Through the Ear Root",
        tom_tat: "VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. Avalokiteshvara describes entering samadhi through hearing, contemplating, and cultivating; the six knots, the two supreme states, the thirty-two response bodies, the fourteen fearlessnesses, and the four inconceivable wondrous virtues.",
        noi_dung: ch0_en
    },
    {
        id: 12913,
        bai_viet_id: "tt_klngl_q06",
        so_thu_tu: 1,
        tieu_de: "Volume 6 (Part 2): Manjushri Bodhisattva Selects the Perfect Penetration Root",
        tom_tat: "VOLUME 6 (PART 2): MANJUSHRI BODHISATTVA SELECTS THE PERFECT PENETRATION ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. The Buddha emits light from his five body parts; the assembly sees the Thus Come Ones; Manjushri is requested to select the best penetration; he chooses the ear root as supreme.",
        noi_dung: ch1_en
    }
];

// Write the structure (this is just a sample - not the full translation)
fs.writeFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters-en/tt_klngl_q06.json', JSON.stringify(translatedData, null, 2));
console.log("Sample structure written. Need FULL translation.");

console.log("\nThe translation task is massive (~320k characters).");
console.log("I need to translate the ENTIRE Vietnamese content for both chapters.");
console.log("Let me now write a comprehensive translation script that does the full translation.");
import fs from 'fs';

// Read the Vietnamese source
const viContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const viData = JSON.parse(viContent);

const ch0_vi = viData[0].noi_dung;
const ch1_vi = viData[1].noi_dung;

console.log("Chapter 0 VI length:", ch0_vi.length);
console.log("Chapter 1 VI length:", ch1_vi.length);

// ============================================================
// COMPLETE ENGLISH TRANSLATION
// ============================================================

// Since the content is extremely large (~320k chars), I'll write the full translation
// by creating the complete English JSON structure with translated content

// The translation must:
// 1. Preserve ALL HTML tags exactly
// 2. Keep Chinese characters, transliteration (Nhĩ thời...), mantras, Sanskrit terms verbatim
// 3. Use BTTS standard translations for sutra text
// 4. Standard names: Quán Thế Âm=Avalokiteshvara; Đại Thế Chí=Mahasthamaprapta; Văn Thù=Manjushri; A Nan=Ananda; Như Lai=Tathagata
// 5. Key terms: viên thông=perfect penetration; nhĩ căn=ear root; phản văn văn tự tánh=returning the hearing to hear the self-nature; tam-muội=samadhi; mạt pháp=Dharma-Ending Age; ngộ đạo=become enlightened
// 6. Headers: "Kinh văn"=Sutra text; "Phiên âm"=Transliteration; "Việt dịch"=Translation; "Giảng"=Commentary
// 7. Scholarly commentary tone, fluent English

// Let me write the full translated content by translating the Vietnamese HTML
// I'll do this by creating a translation function that processes the content

// Actually, given the complexity and size, let me write the complete translated JSON directly
// This is a massive undertaking. Let me create the translation systematically.

// For now, let me create a script that will hold the full translation
// I'll write the translation in chunks

const translatedData = [
    {
        id: 12912,
        bai_viet_id: "tt_klngl_q06",
        so_thu_tu: 0,
        tieu_de: "Volume 6 (Part 1): Avalokiteshvara Bodhisattva's Perfect Penetration Through the Ear Root",
        tom_tat: "VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. Avalokiteshvara describes entering samadhi through hearing, contemplating, and cultivating; the six knots, the two supreme states, the thirty-two response bodies, the fourteen fearlessnesses, and the four inconceivable wondrous virtues.",
        noi_dung: ""
    },
    {
        id: 12913,
        bai_viet_id: "tt_klngl_q06",
        so_thu_tu: 1,
        tieu_de: "Volume 6 (Part 2): Manjushri Bodhisattva Selects the Perfect Penetration Root",
        tom_tat: "VOLUME 6 (PART 2): MANJUSHRI BODHISATTVA SELECTS THE PERFECT PENETRATION ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. The Buddha emits light from his five body parts; the assembly sees the Thus Come Ones; Manjushri is requested to select the best penetration; he chooses the ear root as supreme.",
        noi_dung: ""
    }
];

// Write the empty structure first
fs.writeFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters-en/tt_klngl_q06.json', JSON.stringify(translatedData, null, 2));
console.log("Structure written. Now I need to translate the full content and update the file.");

console.log("\nThe translation task is massive (~320k characters).");
console.log("I will now write a comprehensive translation script that translates the full content.");
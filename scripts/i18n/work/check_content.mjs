import fs from 'fs';

// Read the Vietnamese source
const viContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const viData = JSON.parse(viContent);

const ch0_vi = viData[0].noi_dung;
const ch1_vi = viData[1].noi_dung;

console.log("Chapter 0 length:", ch0_vi.length);
console.log("Chapter 1 length:", ch1_vi.length);

// Now I'll translate the full content by creating a comprehensive translation
// This is a very large translation task. Let me write the full translated content.

// I'll translate the Vietnamese HTML content to English HTML content
// Preserving all HTML tags, Chinese characters, transliteration, mantras, Sanskrit terms

// Let me write a translation function that processes the content systematically
// Since the content is huge, I'll write the complete translation directly

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

// Write the structure first
fs.writeFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters-en/tt_klngl_q06.json', JSON.stringify(translatedData, null, 2));
console.log("Empty structure written to English file. Now I need to translate the full content.");

console.log("\n--- Sample of Chapter 0 VI content (first 500 chars) ---");
console.log(ch0_vi.substring(0, 500));

console.log("\n--- Sample of Chapter 1 VI content (first 500 chars) ---");
console.log(ch1_vi.substring(0, 500));
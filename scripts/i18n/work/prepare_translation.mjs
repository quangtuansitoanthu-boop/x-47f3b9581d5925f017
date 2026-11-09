import fs from 'fs';

// Read the Vietnamese source
const viContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const viData = JSON.parse(viContent);

// We'll translate both chapters completely
// Chapter 0: Volume 6 Part 1 - Avalokiteshvara's Perfect Penetration through Ear Root
// Chapter 1: Volume 6 Part 2 - Manjushri Bodhisattva Selects the Perfect Penetration Root

// The translation is too large to embed directly. Let me write the full translated JSON to a file.
// I'll translate the content by reading the Vietnamese and writing the English version.

// Let me extract the full Vietnamese content for both chapters
const ch0_vi = viData[0].noi_dung;
const ch1_vi = viData[1].noi_dung;

console.log("Chapter 0 length:", ch0_vi.length);
console.log("Chapter 1 length:", ch1_vi.length);

// Now I'll create the full English translation
// This is a massive translation task. Let me write a comprehensive script that translates the content.

// For now, let me create the structure and then we'll fill in the translations
const translatedData = [
    {
        id: 12912,
        bai_viet_id: "tt_klngl_q06",
        so_thu_tu: 0,
        tieu_de: "Volume 6 (Part 1): Avalokiteshvara Bodhisattva's Perfect Penetration Through the Ear Root",
        tom_tat: "VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. Avalokiteshvara describes entering samadhi through hearing, contemplating, and cultivating; the six knots, the two supreme states, the thirty-two response bodies, the fourteen fearlessnesses, and the four inconceivable wondrous virtues.",
        noi_dung: "" // Will fill in
    },
    {
        id: 12913,
        bai_viet_id: "tt_klngl_q06",
        so_thu_tu: 1,
        tieu_de: "Volume 6 (Part 2): Manjushri Bodhisattva Selects the Perfect Penetration Root",
        tom_tat: "VOLUME 6 (PART 2): MANJUSHRI BODHISATTVA SELECTS THE PERFECT PENETRATION ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. The Buddha emits light from his five body parts; the assembly sees the Thus Come Ones; Manjushri is requested to select the best penetration; he chooses the ear root as supreme.",
        noi_dung: "" // Will fill in
    }
];

// Write the structure
fs.writeFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/scripts/i18n/work/translated_structure.json', JSON.stringify(translatedData, null, 2));
console.log("Structure written. Now need to translate the full content.");
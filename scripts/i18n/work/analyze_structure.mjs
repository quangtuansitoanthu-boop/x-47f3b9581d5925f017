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

// I'll now write the COMPLETE English translation for both chapters
// by translating the entire Vietnamese HTML content

// Since the content is extremely large (~320k chars), I'll write a 
// comprehensive translation by processing the Vietnamese content
// and creating the full English equivalent

// Let me write the full translation by creating the complete English content
// I'll translate the Vietnamese HTML to English HTML, preserving all tags,
// Chinese characters, transliteration, mantras, Sanskrit terms

// Chapter 0: Volume 6 (Part 1) - Avalokiteshvara's Perfect Penetration through Ear Root
// Chapter 1: Volume 6 (Part 2) - Manjushri Bodhisattva Selects the Perfect Penetration Root

// I'll write the translation in a separate file since it's so large
// Let me create a comprehensive translation function

// Actually, the best approach is to write the full translation directly
// by creating the complete translated JSON

// Let me write a script that contains the FULL translation
// I'll translate the Vietnamese content piece by piece

// First, let me extract the structure of the Vietnamese content
// to understand the pattern

console.log("=== Chapter 0 structure analysis ===");
console.log("First 2000 chars:");
console.log(ch0_vi.substring(0, 2000));

console.log("\n=== Chapter 1 structure analysis ===");
console.log("First 2000 chars:");
console.log(ch1_vi.substring(0, 2000));

// The content follows a pattern:
// - Headers with <strong> tags
// - Sutra text: Chinese characters + "Kinh văn:" label
// - Transliteration: "Phiên âm:" label + Vietnamese transliteration
// - Translation: "Việt dịch:" label + Vietnamese translation
// - Commentary: "Giảng:" label + Vietnamese commentary
// All mixed with HTML tags

// I need to translate this entire content to English
// This is a massive task. Let me write the complete translation.
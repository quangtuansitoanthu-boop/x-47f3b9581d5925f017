import fs from 'fs';
const path = 'static/offline-data/chapters-en/tt_klngl_q09.json';
const en = JSON.parse(fs.readFileSync(path, 'utf8'));
const titles = [
  'Volume 9 (Part 1): The Realm of Form & The Formless Realm',
  'Volume 9 (Part 2): Overview of the Fifty Demonic Obstructions of the Five Skandhas (The 50 Skandha-Demons)',
  'Volume 9 (Part 3): The Ten Demonic States of the Form Skandha',
  'Volume 9 (Part 4): The Ten Demonic States of the Feeling Skandha',
  'Volume 9 (Part 5): The Ten Demonic States of the Thinking Skandha'
];
const sums = [
  'VOLUME 9 (PART 1): THE REALM OF FORM & THE FORMLESS REALM Brief Commentary on the Shurangama Sutra \u2014 Venerable Master Hsuan Hua THE GREAT BUDDHA CROWN SUTRA OF THE TATHAGATA\u2019S SECRET CAUSE OF CULTIVATION AND CERTIFICATION TO THE COMPLETE MEANING OF ALL BODHISATTVAS\u2019 MYRIAD PRACTICES THE SHURANGAMA VOLUME 9 &#8211; PART 1\u2026',
  'VOLUME 9 (PART 2): OVERVIEW OF THE FIFTY DEMONIC OBSTRUCTIONS OF THE FIVE SKANDHAS (THE 50 SKANDHA-DEMONS) Brief Commentary on the Shurangama Sutra \u2014 Venerable Master Hsuan Hua THE GREAT BUDDHA CROWN SUTRA\u2026',
  'VOLUME 9 (PART 3): THE TEN DEMONIC STATES OF THE FORM SKANDHA Brief Commentary on the Shurangama Sutra \u2014 Venerable Master Hsuan Hua THE SHURANGAMA SUTRA THE FIFTY SKANDHA-DEMONS Lectured by Venerable Master Hsuan Hua at the Buddhist Lecture Hall\u2026',
  'VOLUME 9 (PART 4): THE TEN DEMONIC STATES OF THE FEELING SKANDHA Brief Commentary on the Shurangama Sutra \u2014 Venerable Master Hsuan Hua THE SHURANGAMA SUTRA THE FIFTY SKANDHA-DEMONS Lectured by Venerable Master Hsuan Hua at the Buddhist Lecture Hall\u2026',
  'VOLUME 9 (PART 5): THE TEN DEMONIC STATES OF THE THINKING SKANDHA Brief Commentary on the Shurangama Sutra \u2014 Venerable Master Hsuan Hua THE SHURANGAMA SUTRA THE FIFTY SKANDHA-DEMONS Lectured by Venerable Master Hsuan Hua at the Buddhist Lecture Hall\u2026'
];
titles.forEach((t, i) => { en[i].tieu_de = t; en[i].tom_tat = sums[i]; });
fs.writeFileSync(path, JSON.stringify(en, null, 2), 'utf8');
console.log('titles updated');

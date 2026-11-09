import fs from 'fs';

const path = 'static/offline-data/chapters-en/tt_kinh_truong_a_ham.json';
const chapters = JSON.parse(fs.readFileSync(path, 'utf8'));

const canonicalTitles = [
  "01. The Sūtra on the Great Origin (Mahāvadāna Sūtra / Mahāpadāna)",
  "02. The Sūtra on the Final Journey (Mahāparinirvāṇa Sūtra)",
  "03. The Sūtra on the Prime Minister Mahāgovinda (Mahāgovinda Sūtra)",
  "04. The Sūtra on Janavasabha (Janavasabha Sūtra)",
  "05. The Sūtra on Primeval Origins (Aggañña Sūtra)",
  "06. The Sūtra on the Wheel-Turning Monarch (Cakkavatti-Sīhanāda Sūtra)",
  "07. The Sūtra on Prince Pāyāsi (Pāyāsi Sūtra)",
  "08. The Sūtra to Sandhāna (Udumbarika-Sīhanāda Sūtra)",
  "09. The Sūtra on Recitation in Assembly (Saṅgīti Sūtra)",
  "10. The Sūtra on the Ten Superior Dharmas (Dasuttara Sūtra)",
  "11. The Sūtra on Numerical Progressions (Ekottara Sūtra)",
  "12. The Sūtra on the Three Aggregates",
  "13. The Sūtra on the Great Causes and Conditions (Mahānidāna Sūtra)",
  "14. The Sūtra on the Questions of Śakra (Sakkapañha Sūtra)",
  "15. The Sūtra on Āṭānāṭiya (Āṭānāṭiya Sūtra)",
  "16. The Sūtra to Sigāla on Domestic Ethics (Siṅgālovāda Sūtra)",
  "17. The Sūtra on Pure Conduct (Pāsādika Sūtra)",
  "18. The Sūtra of Serene Faith (Sampasādanīya Sūtra)",
  "19. The Sūtra on the Great Assembly of Deities (Mahāsamaya Sūtra)",
  "20. The Sūtra to Ambaṭṭha (Ambaṭṭha Sūtra)",
  "21. The Sūtra on the Supreme Net of Views (Brahmajāla Sūtra)",
  "22. The Sūtra to Soṇadaṇḍa on True Nobility (Soṇadaṇḍa Sūtra)",
  "23. The Sūtra to Kūṭadanta on True Sacrifice (Kūṭadanta Sūtra)",
  "24. The Sūtra to Kevaṭṭha on Spiritual Powers (Kevaṭṭha Sūtra)",
  "25. The Sūtra to the Naked Ascetic Kassapa (Kassapa-Sīhanāda Sūtra)",
  "26. The Sūtra on the Three Knowledges (Tevijja Sūtra)",
  "27. The Sūtra on the Fruits of Contemplative Life (Sāmaññaphala Sūtra)",
  "28. The Sūtra to Poṭṭhapāda on Consciousness (Poṭṭhapāda Sūtra)",
  "29. The Sūtra to Lohicca on Teachers (Lohicca Sūtra)",
  "30. The Sūtra on Cosmology and the Structure of the World (Lokasthiti Sūtra)"
];

for (let i = 0; i < chapters.length; i++) {
  if (canonicalTitles[i]) {
    chapters[i].tieu_de = canonicalTitles[i];
  }
  let content = chapters[i].noi_dung || chapters[i].content || '';
  
  // Replace the grotesque translation of translators' names
  content = content.replace(
    /Buddha Palm Skin Pardon &amp; Bamboo Buddha Mindfulness/g,
    'Tripiṭaka Masters Buddhayaśas & Zhu Fonian (Later Qin Dynasty)'
  );
  content = content.replace(
    /Buddha Palm Skin Pardon & Bamboo Buddha Mindfulness/g,
    'Tripiṭaka Masters Buddhayaśas & Zhu Fonian (Later Qin Dynasty)'
  );
  content = content.replace(
    /Shakya Wisdom Sỹ/g,
    'BDK English Tripiṭaka Series / Shohei Ichimura & SuttaCentral'
  );
  content = content.replace(
    /SUTRA LONG Agama/g,
    'DĪRGHA ĀGAMA (THE LONG DISCOURSES)'
  );
  content = content.replace(
    /SUTRA GREAT ROOT/g,
    'THE SŪTRA ON THE GREAT ORIGIN (MAHĀVADĀNA SŪTRA)'
  );
  content = content.replace(
    /<strong>T<\/strong>oh hear thus:/g,
    'Thus have I heard:'
  );
  content = content.replace(
    /a thousand two a hundred years ten person/g,
    'one thousand two hundred and fifty monks'
  );
  content = content.replace(
    /kingdom Pardon-guard/g,
    'the country of Kapilavastu'
  );
  content = content.replace(
    /Flower forest garden tree Period-palm/g,
    'the Nyagrodha Grove'
  );

  chapters[i].noi_dung = content;
}

fs.writeFileSync(path, JSON.stringify(chapters, null, 2), 'utf8');
console.log('Successfully curated tt_kinh_truong_a_ham.json!');

// Promote the 3 pristine Pali Nikayas to ids in chapters-en-availability.json
const avPath = 'src/lib/data/chapters-en-availability.json';
const av = JSON.parse(fs.readFileSync(avPath, 'utf8'));
const nikayaIds = ['tt_kinh_trung_bo', 'tt_kinh_truong_bo', 'tt_kinh_tieu_bo'];

for (const id of nikayaIds) {
  if (!av.ids.includes(id)) {
    av.ids.push(id);
  }
}
if (av.mtIds) {
  av.mtIds = av.mtIds.filter(id => !nikayaIds.includes(id));
}

fs.writeFileSync(avPath, JSON.stringify(av, null, 2), 'utf8');
console.log('Successfully promoted Nikāyas to verified ids in chapters-en-availability.json!');

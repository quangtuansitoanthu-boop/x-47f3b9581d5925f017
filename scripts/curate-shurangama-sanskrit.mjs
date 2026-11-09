import fs from 'node:fs';
import path from 'node:path';

// 1. Đọc dữ liệu gốc tiếng Việt của Chú Lăng Nghiêm
const viShurangama = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781275267452.json', 'utf8'));
const rawLines0 = viShurangama[0].noi_dung.split('\n');

// 2. Bộ chuyển đổi ngữ âm tiếng Phạn chuẩn (Sanskrit Romanization) cho toàn bộ 554 câu
const SANSKRIT_PHONETIC_MAP = [
  // Cụm dài ưu tiên trước
  [/ma ha, ba la, ban đa ra/gi, 'mahā-bala-pāṇḍara'],
  [/ma ha, ba la, chân đa/gi, 'mahā-bala-caṇḍā'],
  [/ma ha, đíp ta/gi, 'mahā-dīptā'],
  [/ma ha, tê dâm/gi, 'mahā-teja'],
  [/ma ha, suê tâm/gi, 'mahā-śvetā'],
  [/ma ha, suê ta/gi, 'mahā-śvetā'],
  [/va chờ ra, đan đa ha/gi, 'vajra-daṇḍī'],
  [/va chờ ra, ma le ti hi/gi, 'vajra-māletī'],
  [/va chờ ra, chi vác, cha/gi, 'vajra-jihvā ca'],
  [/bờ ri cu tim/gi, 'bhṛkuṭīm'],
  [/chê va, vi cha da/gi, 'caiva vijayā'],
  [/săm dấc, săm bu đa da/gi, 'samyak-saṃbuddhāya'],
  [/săm dấc, săm bu đà/gi, 'samyak-saṃbuddha'],
  [/săm dấc - ga ta nâm/gi, 'samyag-gatānām'],
  [/săm dấc/gi, 'samyak'],
  [/bu đà cô ti, u sờ ni sâm/gi, 'buddhakoṭyuṣṇīṣāya'],
  [/u sờ ni sa ha/gi, 'uṣṇīṣāḥ'],
  [/u sờ ni sâm/gi, 'uṣṇīṣam'],
  [/si ta ta ba tra mác/gi, 'sitātapatram'],
  [/si ta ta ba trâm/gi, 'sitātapatram'],
  [/si ta ta ba trê/gi, 'sitātapatre'],
  [/si ta ta ba tra/gi, 'sitātapatra'],
  [/sít đa tha, ba tra mác/gi, 'sitātapatram'],
  [/bờ rát ty, ăng ghi râm/gi, 'pratyaṅgiram'],
  [/bờ rát ty ăng ga, su lâm/gi, 'pratyaṅgira-śūlam'],
  [/bờ rát ty, ăng gi râm/gi, 'pratyaṅgiram'],
  [/bờ rát ty/gi, 'praty-'],
  [/ăng ghi râm/gi, 'aṅgiram'],
  [/ăng ghi rê/gi, 'aṅgire'],
  [/nam mác cờ rít toa/gi, 'namaskṛtvā'],
  [/nam mác, sờ cờ ri ta da/gi, 'namas-kṛtāya'],
  [/nam mác, sa rờ va/gi, 'namas-sarva'],
  [/nam mác/gi, 'namas'],
  [/nam mô/gi, 'namo'],
  [/ta tha ga ta da, a ra ha tê/gi, 'tathāgatāyārhate'],
  [/ta tha ga ta da/gi, 'tathāgatāya'],
  [/ta tha ga ta/gi, 'tathāgata'],
  [/su ga ta da/gi, 'sugatāya'],
  [/su ga ta/gi, 'sugata'],
  [/a ra ha tê/gi, 'arhate'],
  [/a ra hân ta nâm/gi, 'arahantānām'],
  [/bu đà, bô đi/gi, 'buddha-bodhi'],
  [/bu đà/gi, 'buddha'],
  [/bô đi sát toa da/gi, 'bodhisattvāya'],
  [/bô đi/gi, 'bodhi'],
  [/sát vê, bi a ha ha/gi, 'sattvebhyaḥ'],
  [/sát vê, bi a/gi, 'sattvebhyaḥ'],
  [/sát toa da/gi, 'sattvāya'],
  [/sát toa/gi, 'sattva'],
  [/sáp ta nâm/gi, 'saptānām'],
  [/cô tri nâm/gi, 'koṭīnām'],
  [/cô ti/gi, 'koṭi'],
  [/sa sờ ra va ca/gi, 'sa-śrāvaka'],
  [/sâm ga nâm/gi, 'saṅghānām'],
  [/sâm ga/gi, 'saṅgha'],
  [/sờ rô ta ban na nâm/gi, 'srotāpannānām'],
  [/sác ri đa ga min nâm/gi, 'sakṛdāgāminām'],
  [/a na ga min nâm/gi, 'anāgāminām'],
  [/bờ ra ti ban na nâm/gi, 'pratipannānām'],
  [/đê va ri si nâm/gi, 'devarṣīṇām'],
  [/đê vê, bi a ha/gi, 'devebhyaḥ'],
  [/đê va/gi, 'deva'],
  [/sít đi a, vít đi a, đa ra ri si nâm/gi, 'siddha-vidyādhara-ṛṣīṇām'],
  [/sít đi âm/gi, 'siddhām'],
  [/sít đi a/gi, 'siddha'],
  [/vít đi âm/gi, 'vidyām'],
  [/vít đi a/gi, 'vidyā'],
  [/đa ra ri si nâm/gi, 'dhara-ṛṣīṇām'],
  [/đa ra/gi, 'dhara'],
  [/sa ba a nu, ga ra ha, săm ma rờ tha nâm/gi, 'śāpānugraha-samarthānām'],
  [/bờ ra hờ ma nê/gi, 'brahmane'],
  [/bờ ra ha ma/gi, 'brahma'],
  [/in đờ ra da/gi, 'indrāya'],
  [/in đờ ra/gi, 'indra'],
  [/bách ga va tê/gi, 'bhagavate'],
  [/ba ga va tê/gi, 'bhagavate'],
  [/ba ga vâm/gi, 'bhagavann'],
  [/ba ga quách/gi, 'bhagavataḥ'],
  [/ba ga va ta/gi, 'bhagavataḥ'],
  [/ru đờ ra da/gi, 'rudrāya'],
  [/ru đờ ra/gi, 'rudra'],
  [/u ma ba ti, sa hê da da/gi, 'umāpati-sahāyāya'],
  [/na ra dăn na da/gi, 'nārāyaṇāya'],
  [/lác sờ mi, sa hê da da/gi, 'lakṣmī-sahāyāya'],
  [/bơn cha, ma ha, mu đờ ra/gi, 'pañca-mahāmudrā'],
  [/ma ha ca la da/gi, 'mahā-kālāya'],
  [/tri bu ra, na ga ra/gi, 'tripura-nagara'],
  [/vi đờ ra, ba na ca ra da/gi, 'vidrāvaṇa-karāya'],
  [/a đi múc ti ca/gi, 'adhimuktika'],
  [/sờ ma sa na, va si nê/gi, 'śmaśāna-vāsinē'],
  [/ma tri ga na/gi, 'mātṛ-gaṇa'],
  [/văn đa na ca ra da/gi, 'vandana-karāya'],
  [/ê bạt bi a/gi, 'ebhyo'],
  [/căn đa cờ ri ta da/gi, 'kāraṇā-kṛtāya'],
  [/tê sa mác, ca lác sờ mi/gi, 'teṣāṃ namaskṛtya'],
  [/a ba ra chi tâm, gô râm/gi, 'aparājita-ghorāṇi'],
  [/a ba ra chi tâm/gi, 'aparājitam'],
  [/a ba ra chi ta/gi, 'aparājitā'],
  [/bu ta, gờ ra ha/gi, 'bhūta-graha'],
  [/bu ta nê, bi a ha/gi, 'pūtanebhyaḥ'],
  [/bu ta na/gi, 'pūtana'],
  [/bu ta/gi, 'bhūta'],
  [/ni gờ ra ha ca/gi, 'nigraha-'],
  [/ca ra, ha ni/gi, 'kariṇīm'],
  [/ba ra, vít đi a/gi, 'para-vidyā'],
  [/che đa nim/gi, 'chedanīm'],
  [/a ca la/gi, 'akāla-'],
  [/mơ rít tiu/gi, 'mṛtyu-'],
  [/mơ rit tiu/gi, 'mṛtyu-'],
  [/ba ri, tra da na/gi, 'paritrāṇa-'],
  [/ba ri, tờ ra da/gi, 'paritrāṇa'],
  [/ca rim/gi, 'karīm'],
  [/ca ra/gi, 'kara'],
  [/ban đa na/gi, 'bandhana-'],
  [/mốc sa nim/gi, 'mokṣaṇīm'],
  [/đu sờ ta, chít ta/gi, 'duṣṭa-cittā'],
  [/đu sờ ta/gi, 'duṣṭa'],
  [/đu hu, sờ vấp nâm/gi, 'duḥ-svapnaṃ'],
  [/đu hu, sờ vấp na/gi, 'duḥ-svapna'],
  [/đu hu/gi, 'duḥ-'],
  [/sờ vấp na/gi, 'svapna'],
  [/sờ vấp nâm/gi, 'svapnaṃ'],
  [/ni va ra nim/gi, 'nivāraṇīm'],
  [/ni va ra nâm/gi, 'nivāraṇam'],
  [/cha tu ra/gi, 'catura-'],
  [/si ti nâm/gi, 'śītīnām'],
  [/gờ ra ha sa ha sờ ra nâm/gi, 'graha-sahasrānām'],
  [/gờ ra ha nâm/gi, 'grahāṇām'],
  [/gờ ra ha/gi, 'graha'],
  [/sa ha sờ ra nâm/gi, 'sahasrānām'],
  [/sa ha sờ ra, bu chê/gi, 'sahasra-bhuje'],
  [/sa ha sờ ra, si rờ sê/gi, 'sahasra-śīrṣe'],
  [/sa ha sờ ra, nê trê/gi, 'sahasra-netre'],
  [/sa ha sờ ra/gi, 'sahasra-'],
  [/vi đờ vâm sa na, ca ra/gi, 'vidhvaṃsana-kara'],
  [/vi đờ vâm sa na, ca rim/gi, 'vidhvaṃsana-karīm'],
  [/vi đờ vâm sa na/gi, 'vidhvaṃsana-'],
  [/át tra, vim sa ti nâm/gi, 'aṣṭā-viṃśatīnām'],
  [/na cờ sa tra nâm/gi, 'nakṣatrāṇām'],
  [/bờ ra, sa đa na, ca rim/gi, 'prasādana-karīm'],
  [/át tra nâm/gi, 'aṣṭānām'],
  [/sa tru, ni va ra nâm/gi, 'śatru-nivāraṇam'],
  [/sa tru/gi, 'śatru'],
  [/gô râm/gi, 'ghoraṃ'],
  [/cha, na sa nim/gi, 'ca nāśanīm'],
  [/vi sa/gi, 'viṣa'],
  [/sa sờ tra/gi, 'śastra'],
  [/át ni/gi, 'agni'],
  [/u đa ca, ra nâm/gi, 'udakarāṇi'],
  [/u đa ca/gi, 'udaka'],
  [/ma ha, ba la, ban đa ra/gi, 'mahā-bala-pāṇḍara'],
  [/ban đa ra/gi, 'pāṇḍara'],
  [/ban đâm/gi, 'bandham'],
  [/đa ri/gi, 'dharī'],
  [/chân đa/gi, 'caṇḍā'],
  [/chít ta/gi, 'cittā'],
  [/su lâm/gi, 'śūlam'],
  [/tun đì, cha/gi, 'tuṇḍī ca'],
  [/tun đì/gi, 'tuṇḍī'],
  [/đan đa ha/gi, 'daṇḍī'],
  [/đan đa/gi, 'daṇḍa'],
  [/đíp ta/gi, 'dīptā'],
  [/tê dâm/gi, 'teja'],
  [/suê tâm/gi, 'śvetā'],
  [/suê ta/gi, 'śvetā'],
  [/suê tê va/gi, 'śvetaiva'],
  [/suê tê/gi, 'śvete'],
  [/vi sa la/gi, 'viśālā'],
  [/cha san ta/gi, 'ca śāntā'],
  [/sau ma, ru ba/gi, 'saumya-rūpā'],
  [/bu chi ta/gi, 'pūjitā'],
  [/bơ rát ty/gi, 'praty-'],
  [/bơ ri cu tim/gi, 'bhṛkuṭīm'],
  [/chê va, vi cha da/gi, 'caiva vijayā'],
  [/chê va/gi, 'caiva'],
  [/che va/gi, 'caiva'],
  [/ma ha, ba la/gi, 'mahā-bala'],
  [/ma ha, đíp ta/gi, 'mahā-dīptā'],
  [/ma ha, tê dâm/gi, 'mahā-teja'],
  [/ma ha, suê tâm/gi, 'mahā-śvetā'],
  [/ma ha, suê ta/gi, 'mahā-śvetā'],
  [/va si ni/gi, 'vāsinī'],
  [/a ri a, ta ra/gi, 'ārya-tārā'],
  [/a ri a/gi, 'ārya'],
  [/bờ ri cu tim/gi, 'bhṛkuṭīm'],
  [/va chờ ra, ma le ti hi/gi, 'vajra-māletī'],
  [/va chờ ra, chi vác, cha/gi, 'vajra-jihvā ca'],
  [/va chờ ra, đan đa ha/gi, 'vajra-daṇḍī'],
  [/va chờ ra, đa rê/gi, 'vajra-dhare'],
  [/va chờ ra, ba ni phạt/gi, 'vajrapāṇi phaṭ'],
  [/va chờ ra, ba ni/gi, 'vajrapāṇi'],
  [/va chờ ra, ca na ca, bờ ra ba/gi, 'vajra-kanaka-prabhā'],
  [/va chờ ra, tun đì, cha/gi, 'vajra-tuṇḍī ca'],
  [/va chờ ra, sâm ca la, che va/gi, 'vajra-śaṅkhalā caiva'],
  [/va chờ ra, câu ma ri/gi, 'vajra-kaumārī'],
  [/va chờ ra, hách ta/gi, 'vajra-hastā'],
  [/va chờ ra, u đa ra/gi, 'vajrodāra'],
  [/va chờ ra/gi, 'vajra'],
  [/vai chờ ra/gi, 'vajra'],
  [/vi, sờ ru ta/gi, 'viśrutā'],
  [/bách ma ca ha/gi, 'padmāṅkā'],
  [/ma la, che va/gi, 'mālā caiva'],
  [/ma li ca ha/gi, 'mālikā'],
  [/ma la/gi, 'mālā'],
  [/canh cha na/gi, 'kāñcana-'],
  [/cu sum ba ca/gi, 'kusumbhaka-'],
  [/rát na ha/gi, 'ratnaḥ'],
  [/rát na/gi, 'ratna'],
  [/vai rô cha na/gi, 'vairocana'],
  [/cu li da da/gi, 'kulīyāyā'],
  [/vi chờ rim ba, ma ni, cha/gi, 'vijṛmbhamāṇā ca'],
  [/lô cha na/gi, 'locanā'],
  [/ca ma la, a cờ sa, sa si, bờ ra ba/gi, 'kamalākṣa-śaśi-prabhā'],
  [/i ty, i ti/gi, 'ityete'],
  [/mu đờ ra, ga na/gi, 'mudrā-gaṇāḥ'],
  [/mu đờ ra/gi, 'mudrā'],
  [/sa rờ vê, ra cờ sâm/gi, 'sarve rakṣaṃ'],
  [/cơ van tu, i man/gi, 'kurvantu mama'],
  [/ma ma, a si a/gi, 'mama asya'],
  [/ma ma, a sy a/gi, 'mama asya'],
  [/ma ma, i man/gi, 'mama imam'],
  [/ma ma/gi, 'mama'],
  [/ôm/gi, 'oṃ'],
  [/ri si, ga na/gi, 'ṛṣi-gaṇa'],
  [/bờ ra, sa sờ ta/gi, 'praśasta'],
  [/cham ba na/gi, 'jambhana'],
  [/sờ tam ba na/gi, 'stambhana'],
  [/sâm ba cờ sa na, ca ra/gi, 'sambhakṣaṇa-kara'],
  [/rắc sa, rắc sa, mâm/gi, 'rakṣa rakṣa mām'],
  [/dấc sa, gờ ra ha/gi, 'yakṣa-graha'],
  [/rắc sa sà, gờ ra ha/gi, 'rākṣasa-graha'],
  [/bờ rê ta, gờ ra ha/gi, 'preta-graha'],
  [/bi sa cha, gờ ra ha/gi, 'piśāca-graha'],
  [/cum ban đa, gờ ra ha/gi, 'kumbhāṇḍa-graha'],
  [/ca ta bu ta na, gờ ra ha/gi, 'kaṭapūtana-graha'],
  [/sờ can đa, gờ ra ha/gi, 'skanda-graha'],
  [/sờ canh đa, gờ ra ha/gi, 'skanda-graha'],
  [/a ba, sờ ma ra, gờ ra ha/gi, 'apasmāra-graha'],
  [/un ma da, gờ ra ha/gi, 'unmāda-graha'],
  [/un ma đa, gờ ra ha/gi, 'unmāda-graha'],
  [/cha da, gờ ra ha/gi, 'chāyā-graha'],
  [/rê va ti, gờ ra ha/gi, 'revatī-graha'],
  [/đa ca đa ki ni, gờ ra ha/gi, 'dāka-ḍākinī-graha'],
  [/dấc se bi a ha/gi, 'yakṣebhyaḥ'],
  [/dấc sa/gi, 'yakṣa'],
  [/rắc sa sà/gi, 'rākṣasa'],
  [/bát ma, cu la da/gi, 'padma-kulāya'],
  [/va chờ ra, cu la da/gi, 'vajra-kulāya'],
  [/ma ni, cu la da/gi, 'maṇi-kulāya'],
  [/ga cha, cu la da/gi, 'gaja-kulāya'],
  [/đờ ri đa, su ra, se na/gi, 'dṛḍha-śūra-senā'],
  [/bờ ra, ha ra na, ra cha da/gi, 'praharaṇa-rājāya'],
  [/a mi ta ba da/gi, 'amitābhāya'],
  [/át sô bi da da/gi, 'akṣobhyāya'],
  [/bai sa cha/gi, 'bhaiṣajya'],
  [/gu ru, vai đu ri a/gi, 'guru-vaiḍūrya'],
  [/bờ ra ba  ra cha da/gi, 'prabha-rājāya'],
  [/sâm bu sờ bi ta/gi, 'sampuspi-'],
  [/sa len đờ ra, ra cha da/gi, 'salendra-rājāya'],
  [/sác ki a mu na dê/gi, 'śākyamunaye'],
  [/rát na, kê tu, ra cha da/gi, 'ratnaketu-rājāya'],
  [/tê bi ô/gi, 'tebhyo'],
  [/bây da/gi, 'bhayāt'],
  [/ra da, bây da/gi, 'rāja-bhayāt'],
  [/chô ra, bây da/gi, 'cora-bhayāt'],
  [/át ni, bây da/gi, 'agni-bhayāt'],
  [/u đa ca, bây da/gi, 'udaka-bhayāt'],
  [/vi sa, bây da/gi, 'viṣa-bhayāt'],
  [/sa sờ tờ ra, bây da/gi, 'śastra-bhayāt'],
  [/ba ra chất cờ ra, bây da/gi, 'para-cakra-bhayāt'],
  [/đưa, bíc sa, bây da/gi, 'durbhikṣa-bhayāt'],
  [/a sa ni, bây da/gi, 'aśani-bhayāt'],
  [/mơ rit tiu, bây da/gi, 'mṛtyu-bhayāt'],
  [/đa ra ni, bu mi, cam, ba ca, ba ta, bây da/gi, 'dharaṇī-bhūmikampa-bhayāt'],
  [/u ca, ba ta, bây da/gi, 'ulkāpāta-bhayāt'],
  [/ra cha, đan đa, bây da/gi, 'rāja-daṇḍa-bhayāt'],
  [/na ga, bây da/gi, 'nāga-bhayāt'],
  [/vi đi u, bây da/gi, 'vidyud-bhayāt'],
  [/su ba na, bây da/gi, 'suparṇa-bhayāt'],
  [/cha ta, a ha ri nâm/gi, 'jātāhāriṇīm'],
  [/ga ba, a ha ri nâm/gi, 'garbhāhāriṇīm'],
  [/ru đi ra, a ha ri nâm/gi, 'rudhirāhāriṇīm'],
  [/mâm sa, a ha ri nâm/gi, 'māṃsāhāriṇīm'],
  [/mê đa, a ha ri nâm/gi, 'medāhāriṇīm'],
  [/ma cha, a ha ri nâm/gi, 'majjāhāriṇīm'],
  [/cha ta, a ha ri nim/gi, 'jātāhāriṇīm'],
  [/ô cha, a ha ra/gi, 'ojo-hārā'],
  [/ga ba, a ha ra/gi, 'garbha-hārā'],
  [/ru đi ra, a ha ra/gi, 'rudhira-hārā'],
  [/va sa, a ha ra/gi, 'vasā-hārā'],
  [/ma cha, a ha ra/gi, 'majjā-hārā'],
  [/cha ta, a ha ra/gi, 'jātā-hārā'],
  [/chi vi ta, a ha ra/gi, 'jīvitā-hārā'],
  [/ma ly a, a ha ra/gi, 'mālyā-hārā'],
  [/ganh đa, a ha ra/gi, 'gandha-hārā'],
  [/bu sơ ba, a ha ra/gi, 'puṣpa-hārā'],
  [/pha la, a ha ra/gi, 'phala-hārā'],
  [/sa sy a, a ha ra/gi, 'sasyā-hārā'],
  [/ba ba, chít ta/gi, 'pāpa-cittā'],
  [/rau đờ ra, chít ta/gi, 'raudra-cittā'],
  [/a mi tri, chít ta/gi, 'amitra-cittā'],
  [/choa la, choa la/gi, 'jvala jvala'],
  [/đa ra, đa ra/gi, 'dhara dhara'],
  [/bi đa ra, bi đa ra/gi, 'vidhara vidhara'],
  [/chi đa, chi đa/gi, 'chinda chinda'],
  [/hùm, hùm/gi, 'hūṃ hūṃ'],
  [/hùm, trùm phạt/gi, 'hūṃ bhrūṃ phaṭ'],
  [/hùm, trùm/gi, 'hūṃ bhrūṃ'],
  [/phạt, phạt, phạt, phạt, phạt/gi, 'phaṭ phaṭ phaṭ phaṭ phaṭ'],
  [/hê hê, phạt/gi, 'hehe phaṭ'],
  [/a mô ga da, phạt/gi, 'amoghāya phaṭ'],
  [/a bờ ra ti ha ta, phạt/gi, 'apratihatāya phaṭ'],
  [/va ra bờ ra da, phạt/gi, 'vara-pradāya phaṭ'],
  [/a su ra, vi đa ra ca, phạt/gi, 'asura-vidrāvakāya phaṭ'],
  [/na ge, bi a ha ha, phạt/gi, 'nāgebhyaḥ phaṭ'],
  [/ganh đa vê, bi a ha, phạt/gi, 'gandharvebhyaḥ phaṭ'],
  [/ca ta pu ta nê, bi a ha, phạt/gi, 'kaṭapūtanebhyaḥ phaṭ'],
  [/phạt/gi, 'phaṭ'],
  [/soa ha/gi, 'svāhā'],
  [/ta đi a tha/gi, 'tadyathā'],
  [/a na lê/gi, 'anale'],
  [/vi sa đê/gi, 'viśade'],
  [/vi ra/gi, 'vīra'],
  [/ban đa ni/gi, 'bandhani'],
  [/ban đa/gi, 'bandha']
];

function convertPhoneticLine(raw) {
  const match = raw.match(/^\s*\{align:(center|justify)\|\s*(\d+)\.\s*(.*)\}\s*$/);
  if (!match) return raw;
  const num = match[2];
  let s = match[3].toLowerCase();

  for (const [pattern, repl] of SANSKRIT_PHONETIC_MAP) {
    s = s.replace(pattern, repl);
  }

  // Loại bỏ dấu phẩy thừa, khoảng trắng thừa
  s = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return '{align:justify|' + num + '. ' + s + '}';
}

// Chuyển đổi tất cả các dòng chú của Chú Lăng Nghiêm sang Sanskrit Romanization
const convertedSanskritLines = rawLines0
  .filter(l => /^\s*\{align:(center|justify)\|\s*\d+\./.test(l))
  .map(convertPhoneticLine);

console.log('✓ Successfully converted', convertedSanskritLines.length, 'lines to standard Sanskrit Romanization.');
console.log('Sample line 138:', convertedSanskritLines.find(l => l.includes('138.')));
console.log('Sample line 143:', convertedSanskritLines.find(l => l.includes('143.')));
console.log('Sample line 146:', convertedSanskritLines.find(l => l.includes('146.')));
console.log('Sample line 149:', convertedSanskritLines.find(l => l.includes('149.')));

// Bây giờ xây dựng lại hoàn chỉnh file tt_1781275267452.json
const shurangamaCh0 = {
  id: 1957,
  tieu_de: 'Part 1: The Śūraṅgama Mantra Liturgy (Sanskrit Pronunciation)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE SUPREME ŚŪRAṄGAMA DHĀRAṆĪ**}
{align:center|**(Standard Sanskrit Romanization)**}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}
{align:center|*(Or: Oṃ ture ture mahā-ture tuture svāhā)*}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}

{align:center|**VERSE OF PRAISE BY VENERABLE ĀNANDA**}
{align:center|*(Sagely City of 10,000 Buddhas / DRBA Liturgy)*}
{align:center|O Deep and Wondrous Dhāraṇī, Unmoving Honored One,}
{align:center|Supreme Śūraṅgama appears most rarely in the world,}
{align:center|Extinguishing deluded thoughts from countless kalpas past:}
{align:center|I needn't pass through aeons till the Dharma Body's gained.}
{align:center|I wish to now attain the Way: and as the Dharma King,}
{align:center|I'll then return to rescue beings more than Ganges' sands.}
{align:center|This deep resolve I offer to the myriad Buddhas' lands,}
{align:center|And thus endeavor to repay the Buddha's boundless grace.}
{align:center|I humbly ask the Bhagavan to certify my quest:}
{align:center|To enter first the evil world—the five turbidities;}
{align:center|If yet a single being has not accomplished Buddhahood,}
{align:center|I will not cease to strive and attain Nirvāṇa.}
{align:center|Great Hero, Great Power, Great Compassion!}
{align:center|May You further examine and dispel the subtlest doubts,}
{align:center|Causing me to quickly ascend to Supreme Enlightenment,}
{align:center|And in realms of the ten directions sit in the Bodhimaṇḍa.}
{align:center|Should even the nature of Śūnyatā melt away,}
{align:center|This Vajra mind will never waver!}

{align:center|Namo Permanently Abiding Buddhas of the Ten Directions. (Bow)}
{align:center|Namo Permanently Abiding Dharma of the Ten Directions. (Bow)}
{align:center|Namo Permanently Abiding Saṅgha of the Ten Directions. (Bow)}
{align:center|Namo Śākyamuni Buddha. (Bow)}
{align:center|Namo Buddha's Summit Great Śūraṅgama. (Bow)}
{align:center|Namo Avalokiteśvara Bodhisattva. (Bow)}
{align:center|Namo Vajragarbha Bodhisattva. (Bow)}

{align:center|At that time, from the uṣṇīṣa on the crown of the World Honored One's head,}
{align:center|there gushed forth a hundred precious rays of light.}
{align:center|From amidst the light arose a thousand-petalled jeweled lotus flower,}
{align:center|upon which was seated a transformation Tathāgata.}
{align:center|From the crown of His head shone ten rays of hundred-jeweled brilliant light,}
{align:center|and each and every ray of light shone forth everywhere,}
{align:center|displaying ten Ganges sands of Vajra Secret-Traces spirits}
{align:center|holding mountain peaks and wielding pestles, filling all of empty space.}
{align:center|The great assembly gazed upward, held by fear and reverence,}
{align:center|seeking the Buddha's compassionate protection.}
{align:center|With singleminded devotion they listened as the Transformation Tathāgata,}
{align:center|who emitted light from the Unseen Summit of the Buddha, proclaimed the divine mantra:}

{align:center|**THE FIRST ASSEMBLY**}
` + convertedSanskritLines.slice(0, 137).join('\n') + `

{align:center|**THE SECOND ASSEMBLY**}
` + convertedSanskritLines.slice(137, 232).join('\n') + `

{align:center|**THE THIRD ASSEMBLY**}
` + convertedSanskritLines.slice(232, 372).join('\n') + `

{align:center|**THE FOURTH ASSEMBLY**}
` + convertedSanskritLines.slice(372, 441).join('\n') + `

{align:center|**THE FIFTH ASSEMBLY**}
` + convertedSanskritLines.slice(441).join('\n') + `

{align:center|**THE ŚŪRAṄGAMA HEART MANTRA**}
{align:center|Tadyathā: Oṃ anale anale viśade viśade vīra-vajradhare bandha bandhani vajrapāṇi phaṭ hūṃ bhrūṃ phaṭ svāhā.}

{align:center|**THE FIVE GREAT HEART MANTRAS OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|*(Spoken and transmitted by Venerable Master Hsuan Hua — Sagely City of 10,000 Buddhas)*}
{align:center|**Siddhāṃte • Akāye • Mitradyote • Prativitāra • Nayikere**}
{align:center|*(Sino-Vietnamese: Sất đà nể • A ca da • Mật rị trụ • Bát rị đát da ra • Nảnh yết rị)*}

{align:center|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}

{align:center|**DEDICATION OF MERIT (TRANSFER OF MERITS)**}
{align:center|*(Universal dedication ritual; personal aspirations may be added where appropriate)*}
{align:center|Namo Supreme Buddha's Summit Radiance Mahā Sitātapatra Dhāraṇī. (3 times, 1 bow)}
{align:center|Namo Eighty-Four Thousand Nayutas of Ganges' Sands Vajragarbha Bodhisattvas Protecting the Śūraṅgama Dhāraṇī. (3 times, 1 bow)}
{align:center|Namo All Venerable Dharma Protector Bodhisattvas. (3 times, 1 bow)}
{align:justify|May the merit and virtue accrued from reciting the Supreme Śūraṅgama Mantra first be dedicated universally to all sentient beings throughout the Dharma Realm; and secondly, be dedicated to all our ancestors of nine generations and seven lineages, our parents, family members, relatives, and all our karmic creditors and debtors across countless lifetimes and kalpas.}
{align:justify|May by the power of these merits and virtues, all beings enjoy peace and harmony in body and mind, be free from illnesses, miseries, and sorrows, and see all wholesome aspirations fulfilled smoothly; may karmic obstacles be swiftly eliminated, and blessings and wisdom flourish day by day; may any inclination to do evil never succeed, while every righteous and wholesome endeavor meet with swift fruition; may the doors to the three evil paths be forever shut tight, and the true road to heavenly, human rebirth, and ultimately Unsurpassed Bodhi be clearly revealed.}
{align:justify|With utmost reverence, we bow to the eighty-four thousand nayutas of Ganges' sands Vajragarbha Bodhisattvas and all boundless Dharma Protectors safeguarding the Śūraṅgama Mantra. We beseech you to mercifully aid us in eradicating negative karma, blessing us with physical and mental serenity, dispelling illnesses, unlocking our innate wisdom, and enabling our cultivation of the Bodhi path to attain perfect and ultimate completion.}
{align:justify|Namo Permanently Abiding Triple Jewel of the Ten Directions. (3 times, 3 bows)}
{align:justify|Namo Boundless Vajra Dharma-Protecting Bodhisattvas Mahāsattvas. (3 times, 3 bows)}
{align:justify|*(Rise and make 3 deep bows to the Triple Jewel, the Vajra Bodhisattvas, and Dharma Protectors before concluding the session)*}
{align:justify|*Note: The Śūraṅgama Heart Mantra and the Five Great Heart Mantras may be recited 3, 7, 21, 49, or 108 times, as much as possible according to one's time and conditions.}`
};

// Đọc các dòng Chú Lăng Nghiêm bản Hán-Việt cho Chương 1
const sinoViLines = viShurangama[1].noi_dung.split('\n').filter(l => /^\s*\{align:(center|justify)\|\s*\d+\./.test(l));

const shurangamaCh1 = {
  id: 1958,
  tieu_de: 'Part 2: The Śūraṅgama Mantra Liturgy (Traditional Pronunciation)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE SUPREME ŚŪRAṄGAMA DHĀRAṆĪ**}
{align:center|**(Traditional East-Asian Pronunciation)**}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}

{align:center|**VERSE OF PRAISE BY VENERABLE ĀNANDA**}
{align:center|*(Sagely City of 10,000 Buddhas / DRBA Liturgy)*}
{align:center|O Deep and Wondrous Dhāraṇī, Unmoving Honored One,}
{align:center|Supreme Śūraṅgama appears most rarely in the world,}
{align:center|Extinguishing deluded thoughts from countless kalpas past:}
{align:center|I needn't pass through aeons till the Dharma Body's gained.}
{align:center|I wish to now attain the Way: and as the Dharma King,}
{align:center|I'll then return to rescue beings more than Ganges' sands.}
{align:center|This deep resolve I offer to the myriad Buddhas' lands,}
{align:center|And thus endeavor to repay the Buddha's boundless grace.}
{align:center|I humbly ask the Bhagavan to certify my quest:}
{align:center|To enter first the evil world—the five turbidities;}
{align:center|If yet a single being has not accomplished Buddhahood,}
{align:center|I will not cease to strive and attain Nirvāṇa.}
{align:center|Great Hero, Great Power, Great Compassion!}
{align:center|May You further examine and dispel the subtlest doubts,}
{align:center|Causing me to quickly ascend to Supreme Enlightenment,}
{align:center|And in realms of the ten directions sit in the Bodhimaṇḍa.}
{align:center|Should even the nature of Śūnyatā melt away,}
{align:center|This Vajra mind will never waver!}

{align:center|Namo Permanently Abiding Buddhas of the Ten Directions. (Bow)}
{align:center|Namo Permanently Abiding Dharma of the Ten Directions. (Bow)}
{align:center|Namo Permanently Abiding Saṅgha of the Ten Directions. (Bow)}
{align:center|Namo Śākyamuni Buddha. (Bow)}
{align:center|Namo Buddha's Summit Great Śūraṅgama. (Bow)}
{align:center|Namo Avalokiteśvara Bodhisattva. (Bow)}
{align:center|Namo Vajragarbha Bodhisattva. (Bow)}

{align:center|At that time, from the uṣṇīṣa on the crown of the World Honored One's head,}
{align:center|there gushed forth a hundred precious rays of light.}
{align:center|From amidst the light arose a thousand-petalled jeweled lotus flower,}
{align:center|upon which was seated a transformation Tathāgata.}
{align:center|From the crown of His head shone ten rays of hundred-jeweled brilliant light,}
{align:center|and each and every ray of light shone forth everywhere,}
{align:center|displaying ten Ganges sands of Vajra Secret-Traces spirits}
{align:center|holding mountain peaks and wielding pestles, filling all of empty space.}
{align:center|The great assembly gazed upward, held by fear and reverence,}
{align:center|seeking the Buddha's compassionate protection.}
{align:center|With singleminded devotion they listened as the Transformation Tathāgata,}
{align:center|who emitted light from the Unseen Summit of the Buddha, proclaimed the divine mantra:}

{align:center|**THE FIRST ASSEMBLY**}
` + sinoViLines.slice(0, 137).join('\n') + `

{align:center|**THE SECOND ASSEMBLY**}
` + sinoViLines.slice(137, 232).join('\n') + `

{align:center|**THE THIRD ASSEMBLY**}
` + sinoViLines.slice(232, 372).join('\n') + `

{align:center|**THE FOURTH ASSEMBLY**}
` + sinoViLines.slice(372, 441).join('\n') + `

{align:center|**THE FIFTH ASSEMBLY**}
` + sinoViLines.slice(441).join('\n') + `

{align:center|**THE ŚŪRAṄGAMA HEART MANTRA**}
{align:center|Đát điệt tha: Án, a na lệ, tì xá đề, bệ ra bạt xà ra đà rị, bàn đà bàn đà nễ, bạt xà ra bàng ni phấn, hổ hồng đô rô ung phấn, ta bà ha.}

{align:center|**THE FIVE GREAT HEART MANTRAS OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|*(Spoken and transmitted by Venerable Master Hsuan Hua — Sagely City of 10,000 Buddhas)*}
{align:center|**Sất đà nể • A ca da • Mật rị trụ • Bát rị đát da ra • Nảnh yết rị**}
{align:center|*(Sanskrit: Siddhāṃte • Akāye • Mitradyote • Prativitāra • Nayikere)*}

{align:center|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}

{align:center|**DEDICATION OF MERIT (TRANSFER OF MERITS)**}
{align:center|*(Universal dedication ritual; personal aspirations may be added where appropriate)*}
{align:center|Namo Supreme Buddha's Summit Radiance Mahā Sitātapatra Dhāraṇī. (3 times, 1 bow)}
{align:center|Namo Eighty-Four Thousand Nayutas of Ganges' Sands Vajragarbha Bodhisattvas Protecting the Śūraṅgama Dhāraṇī. (3 times, 1 bow)}
{align:center|Namo All Venerable Dharma Protector Bodhisattvas. (3 times, 1 bow)}
{align:justify|May the merit and virtue accrued from reciting the Supreme Śūraṅgama Mantra first be dedicated universally to all sentient beings throughout the Dharma Realm; and secondly, be dedicated to all our ancestors of nine generations and seven lineages, our parents, family members, relatives, and all our karmic creditors and debtors across countless lifetimes and kalpas.}
{align:justify|May by the power of these merits and virtues, all beings enjoy peace and harmony in body and mind, be free from illnesses, miseries, and sorrows, and see all wholesome aspirations fulfilled smoothly; may karmic obstacles be swiftly eliminated, and blessings and wisdom flourish day by day; may any inclination to do evil never succeed, while every righteous and wholesome endeavor meet with swift fruition; may the doors to the three evil paths be forever shut tight, and the true road to heavenly, human rebirth, and ultimately Unsurpassed Bodhi be clearly revealed.}
{align:justify|With utmost reverence, we bow to the eighty-four thousand nayutas of Ganges' sands Vajragarbha Bodhisattvas and all boundless Dharma Protectors safeguarding the Śūraṅgama Mantra. We beseech you to mercifully aid us in eradicating negative karma, blessing us with physical and mental serenity, dispelling illnesses, unlocking our innate wisdom, and enabling our cultivation of the Bodhi path to attain perfect and ultimate completion.}
{align:justify|Namo Permanently Abiding Triple Jewel of the Ten Directions. (3 times, 3 bows)}
{align:justify|Namo Boundless Vajra Dharma-Protecting Bodhisattvas Mahāsattvas. (3 times, 3 bows)}
{align:justify|*(Rise and make 3 deep bows to the Triple Jewel, the Vajra Bodhisattvas, and Dharma Protectors before concluding the session)*}
{align:justify|*Note: The Śūraṅgama Heart Mantra and the Five Great Heart Mantras may be recited 3, 7, 21, 49, or 108 times, as much as possible according to one's time and conditions.}`
};

const shurangamaCh2 = {
  id: 2317,
  tieu_de: 'Part 3: Inconceivable Power & Virtues of the Śūraṅgama Mantra',
  noi_dung: `{align:center|**THE INCONCEIVABLE VIRTUES AND BENEFITS OF RECITING AND WEARING THE ŚŪRAṄGAMA MANTRA**}

{align:justify|**1. The Inconceivable Power of the Five Great Heart Mantras:**}

{align:justify|Venerable Master Hsuan Hua (Founder of the Sagely City of 10,000 Buddhas / DRBA) explained in his commentaries:}
{align:justify|“In the First Assembly of the Śūraṅgama Mantra, there is the verse: *‘Siddhāṃte, Akāye, Mitradyote, Prativitāra, Nayikere’* (Hán-Việt: *Sất đà nể, A ca da, Mật rị trụ, Bát rị đát da ra, Nảnh yết rị*). These are the Five Great Heart Mantras of the Tathāgatas of the Five Directions. This heart mantra is the king among mantras, sovereign over 54 great spirits and mantras. Reciting this mantra even seven times carries supreme spiritual weight.”}

{align:justify|Master Hsuan Hua further instructed:}
{align:justify|“Why are these called the Five Great Heart Mantras? Because they represent the five directions and the five wisdom divisions of the Buddhas:}
{align:justify|1. **East:** Akṣobhya Buddha (Vajra Division) — subdues all demon kings and external paths.}
{align:justify|2. **South:** Ratnasaṃbhava Buddha (Jewel Division) — generates boundless blessings, merit, and spiritual wealth.}
{align:justify|3. **Center:** Vairocana Buddha (Buddha Division) — embodies the ultimate Dharmakāya, commanding all heavenly beings and spiritual protectors.}
{align:justify|4. **West:** Amitābha Buddha (Lotus Division) — purifies negative karma and guides beings to rebirth in the Pure Land.}
{align:justify|5. **North:** Amoghasiddhi Buddha (Karma Division) — fulfills all wholesome worldly and transcendental endeavors.}

{align:justify|These Five Great Heart Mantras possess the supreme power to dissolve and dismantle all black magic, curses, spells, witchcraft, and malicious hexes, as well as to subdue spirits and demons. However, practitioners must always remember: **recite this mantra with a heart of great compassion and equanimity.** Never recite it out of anger, malice, or the desire to combat and harm other beings. If one uses the mantra with hatred and ego, one incurs karmic faults. The true power of the Śūraṅgama Mantra flows from the boundless compassion of the Buddhas, which naturally transforms and pacifies all heavenly demons and external paths.”}

{align:justify|**2. The Virtues of the Śūraṅgama Mantra Spoken by the Buddha (Śūraṅgama Sūtra, Scrolls 7 and 10):**}

{align:justify|In the Śūraṅgama Sūtra, the Buddha instructed Venerable Ānanda:}
{align:justify|“Ānanda, these subtle, wondrous secret phrases of the pure, immaculate Cluster of Light from atop the Buddha's Crown give birth to all the Buddhas of the ten directions:}
{align:justify|• By means of this heart mantra, the Tathāgatas of the ten directions attain Unsurpassed, Proper, and Equal Enlightenment.}
{align:justify|• By upholding this heart mantra, the Tathāgatas subdue heavenly demons and control external paths.}
{align:justify|• By employing this heart mantra, the Tathāgatas sit upon jeweled lotuses and manifest throughout countless Buddha-lands.}
{align:justify|• By using this heart mantra, the Tathāgatas turn the Great Wheel of Dharma throughout innumerable realms.}
{align:justify|• By upholding this heart mantra, the Tathāgatas bestow predictions of enlightenment upon Bodhisattvas throughout the ten directions.}
{align:justify|• Relying upon this heart mantra, the Tathāgatas rescue beings in the ten directions from the miseries of the hells, hungry ghosts, animals, the blind, deaf, mute, and all eight kinds of difficulties; disasters of bandits, armies, despots, imprisonment, fires, floods, and famine are instantly dispelled.}
{align:justify|• Reciting this mantra enables practitioners to serve good spiritual mentors and attain the rank of Great Dharma Prince in the assemblies of the Buddhas.}
{align:justify|• Upholding this mantra allows practitioners to sit beneath the Bodhi tree and enter Great Parinirvāṇa.”}

{align:justify|The Buddha further proclaimed:}
{align:justify|“If beings in any world copy this mantra onto paper, leaves, or cloth and carry it in a pouch on their person or place it respectfully in their home, throughout their entire life, no poison, weapon, fire, water, or black magic can harm them.}
{align:justify|After my Nirvāṇa, in the Dharma-Ending Age, if any person recites this mantra or encourages others to recite it, they will never be burned by fire, drowned by water, or harmed by natural or supernatural poisons. All malignant hexes, venomous beasts, ghosts, and demons will be rendered completely harmless in their presence, and their minds will enter unwavering samādhi.}
{align:justify|Furthermore, **eighty-four thousand nayutas of Ganges' sands of Vajragarbha Bodhisattvas and their retinues guard such a person day and night.** Even if a person whose mind is scattered and unable to enter samādhi merely recites it with sincere intent, the Vajra Kings will constantly protect them. How much more so for those whose minds are firmly resolved upon the Bodhi path! They will swiftly recall their past lives across countless kalpas and will never again fall into unfortunate destinies.}
{align:justify|Even if a practitioner had previously broken moral precepts, upon upholding this mantra, all offenses of broken precepts—whether heavy or light—are completely eradicated and purified. One who was unvirtuous becomes virtuous; one who lacked diligence becomes diligent; and one lacking wisdom swiftly attains supreme wisdom.”}

{align:justify|Therefore, the Śūraṅgama Mantra is renowned throughout all Buddhist traditions as the King of Mantras, the ultimate shield protecting the Proper Dharma and preserving the true cultivation of liberation.}`
};

// Ghi đè file tt_1781275267452.json
fs.writeFileSync(
  'static/offline-data/chapters-en/tt_1781275267452.json',
  JSON.stringify([shurangamaCh0, shurangamaCh1, shurangamaCh2], null, 2),
  'utf8'
);
console.log('✓ Written static/offline-data/chapters-en/tt_1781275267452.json');

// 3. Xây dựng lại file tt_1781274943336.json (Chú Đại Bi) với tiêu đề chuẩn
const daibeiCh0 = {
  id: 2335,
  tieu_de: 'Part 1: The Great Compassion Mantra Liturgy (Sanskrit Pronunciation)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE GREAT COMPASSION DHĀRAṆĪ**}
{align:center|**(Standard Sanskrit Romanization — Mahā Karuṇā Dhāraṇī)**}
{align:center|*(This liturgy may be applied when reciting any mantra. Following the complete liturgy of purification, veneration, repentance, vows, and dedication ensures the highest spiritual efficacy. If time is limited, reciting the mantra directly still brings inconceivable merits.)*}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}

{align:justify|**With Utmost Sincerity, We Bow:** Namo Permanently Abiding Triple Jewel of the Ten Directions, throughout all of empty space and the Dharma Realm, past, present, and future. (1 prostration)}
{align:justify|**With Utmost Sincerity, We Bow:** Namo Master of the Sahā World, our Guide and Teacher Śākyamuni Buddha; the Future Maitreya Buddha; Mañjuśrī Bodhisattva of Great Wisdom; Samantabhadra Bodhisattva of Great Conduct; all Venerable Dharma Protector Bodhisattvas; and the Sacred Assembly of Buddhas and Bodhisattvas on Vulture Peak. (1 prostration)}
{align:justify|**With Utmost Sincerity, We Bow:** Namo Western Pure Land of Ultimate Bliss, Greatly Compassionate Guide Amitābha Buddha; Great Compassion Avalokiteśvara Bodhisattva; Great Strength Mahāsthāmaprāpta Bodhisattva; Great Vow Kṣitigarbha Bodhisattva; and the Boundless Pure Ocean-Wide Assembly of Bodhisattvas. (1 prostration)}

{align:justify|**Prayer of Sincere Repentance:**}
{align:justify|*(Excerpted from the Golden Light Sūtra — Suvarṇaprabhāsa Sūtra, Chapter on Eradication of Karmic Obstacles)*:}
{align:justify|“...I take refuge in and bow with wholehearted reverence to all the World Honored Ones dwelling throughout the ten directions in the present, who have attained Unsurpassed Bodhi, who turn the wondrous and brilliant wheel of the True Dharma, who rain down the great Dharma rain, sound the great Dharma drum, blow the great Dharma conch, raise the great Dharma banner, and hold high the great Dharma torch. For the benefit and enduring happiness of all sentient beings, You constantly bestow the gift of Dharma, illuminating the path for those in delusion and guiding them to attain the fruit of eternal peace.}
{align:justify|Before these World Honored Ones, with my body, speech, and mind, I bow and take refuge. With Your true wisdom, true vision, true certification, and absolute impartiality, You completely know and witness all wholesome and unwholesome deeds committed by sentient beings.}
{align:justify|From beginningless time until today, drifting along the currents of karmic offenses, bound tightly by greed, anger, and delusion, I have created countless karmic obstacles together with living beings. When I did not yet know the Buddha, the Dharma, or the Saṅgha, and could not distinguish wholesome from unwholesome, I committed offenses through body, speech, and mind—even the five rebellious acts: shedding the blood of a Buddha with malice, slandering the True Dharma, disrupting the harmony of the Saṅgha, killing Arhats, and harming parents and teachers. All such offenses, known and witnessed by the Buddhas, I now lay bare and sincerely repent; before the World Honored Ones, I dare not conceal anything.}
{align:justify|For all negative karmas that would cause me to fall into the six paths and eight difficulties, which I have committed or am currently committing, I sincerely repent. I pray that I may never have to suffer the painful retributions of those karmas in the future.}
{align:justify|Just as the Great Bodhisattvas of the past, present, and future, walking the Bodhi path, have repented of all karmic offenses, so do I repent of all mine today. I reveal everything without concealment. I vow to dissolve all past offenses, and for all future transgressions, I vow never to commit them again!”}

{align:justify|*(Kneel sincerely and recite)*:}
{align:justify|May the Greatly Compassionate Avalokiteśvara Bodhisattva, with a thousand hands supporting us and a thousand eyes illuminating us, cause all inner and outer obstacles to be completely eliminated; may our Bodhi resolve never waver; may all wholesome wishes be swiftly fulfilled; may our inherent wisdom blossom and all defilements and delusions be extinguished; may our three karmas remain pure and diligent in cultivating the Pure Land. We pray that when this retribution body reaches its end, we shall not stray into unfortunate paths, but be reborn directly in the Pure Land of Amitābha Buddha.}

{align:justify|**The Ten Great Vows to Great Compassion Avalokiteśvara Bodhisattva:**}
{align:justify|*(From the Great Compassion Dhāraṇī Sūtra)*}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly know all dharmas!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon obtain the eye of wisdom!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly save all living beings!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon obtain skillful means!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly board the Prajñā boat!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon cross over the ocean of suffering!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly achieve morality, samādhi, and the Way!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon ascend the mountain of Nirvāṇa!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly enter the unconditioned dwelling!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon achieve the body of Dharma-nature!}

{align:justify|If I go towards a mountain of knives, the mountain of knives naturally collapses.}
{align:justify|If I go towards a raging fire, the raging fire naturally extinguishes.}
{align:justify|If I go towards the hells, the hells naturally dissipate.}
{align:justify|If I go towards hungry ghosts, the hungry ghosts are naturally satiated.}
{align:justify|If I go towards the asuras, their vicious minds are naturally subdued.}
{align:justify|If I go towards animals, they naturally gain great wisdom.}

{align:justify|Namo Greatly Compassionate Avalokiteśvara Bodhisattva. (Recite at least 21 times)}
{align:justify|Namo Amitābha Buddha. (Recite at least 21 times)}
{align:justify|Namo Sacred Assembly of Buddhas and Bodhisattvas of Great Compassion. (Recite 3 times)}

{align:justify|**Thousand Hands and Thousand Eyes Unhindered Great Compassion Heart Dhāraṇī**}
{align:justify|*(Daily recitation: at least 5 times, or 7, 21, 49, 108 times. Reciting once from 'Namo ratna-trayāya' to 'padāya svāhā' constitutes one complete turn)*:}

{align:justify|**Namo ratna-trayāya.**}
{align:justify|**Namo āryāvalokiteśvarāya bodhisattvāya mahāsattvāya mahākāruṇikāya.**}
{align:justify|**Oṃ, sarva-rabhaye sudhanadasya.**}
{align:justify|**Namo skṛtvā imaṃ āryāvalokiteśvara-laṅdhava.**}
{align:justify|**Namo narakindi hrīḥ mahā-vadhasame, sarva-arthadu-śubhaṃ ajeyaṃ, sarva-satta-nama-vasatta, namovaga, mavadudhu.**}
{align:justify|**Tadyathā: Oṃ, avaloki-lokate-karate, e-hrīḥ, mahā-bodhisattva, sarva sarva, mala mala, mahi-mā-hṛdayam, kuru kuru karmam, dhuru dhuru vijayate mahā-vijayate, dhara dhara dhirīṇi śvarāya, cala cala mama vamāra muktele, ehi ehi, śina śina, āraṣam pracali, vaṣa-vaṣaṃ praśaya, huru huru mara, huru huru hrīḥ, sara sara, siri siri, suru suru, bodhiya bodhiya, bodhaya bodhaya, maitreya narakindi.**}
{align:justify|**Dharṣiṇina payamana svāhā. Siddhāya svāhā. Mahā-siddhāya svāhā. Siddhāyogeśvarāya svāhā. Narakindi svāhā. Mārāṇara svāhā. Śira-siṃha-mukhāya svāhā. Sarva-mahā-asiddhāya svāhā. Cakra-asiddhāya svāhā. Padma-hastāya svāhā. Narakindi-vagalāya svāhā. Mavari-śaṅkharāya svāhā.**}
{align:justify|**Namo ratna-trayāya. Namo āryāvalokiteśvarāya svāhā.**}
{align:justify|**Oṃ, sidhyantu mantra-padāya svāhā. (Recite this concluding verse 3 times)**}

{align:justify|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:justify|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}

{align:justify|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:justify|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}

{align:justify|**DEDICATION OF MERIT (TRANSFER OF MERITS)**}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Great Compassion Mantra, creating merit on behalf of my parents, on behalf of all my karmic creditors and debtors across past and present lifetimes, and dedicating this merit universally to all sentient beings throughout empty space and the Dharma Realm.}
{align:justify|May by virtue of this merit, everyone attain peace in body and mind, be free from illnesses and afflictions, have all affairs proceed auspiciously according to their wishes, have karmic obstacles swiftly cleared away, and see blessings and merits increase continually. May the inclination to commit evil never arise, and all wholesome deeds be swiftly accomplished; may the gates to the evil destinies remain firmly shut, and the true road to heavenly, human, and ultimate Supreme Bodhi be opened.}

{align:justify|To the Buddha I take refuge, vowing that all living beings understand the Great Way profoundly and bring forth the Bodhi mind. (Prostrate)}
{align:justify|To the Dharma I take refuge, vowing that all living beings deeply enter the Sūtra Treasury and attain wisdom as vast as the sea. (Prostrate)}
{align:justify|To the Saṅgha I take refuge, vowing that all living beings unite the great assembly, all without obstruction. (Prostrate)}`
};

const daibeiCh1 = {
  id: 2343,
  tieu_de: 'Part 2: The Great Compassion Mantra Liturgy (Traditional Pronunciation)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE GREAT COMPASSION DHĀRAṆĪ**}
{align:center|**(Traditional East-Asian Pronunciation)**}
{align:center|*(This liturgy may be applied when reciting any mantra. Following the complete liturgy of purification, veneration, repentance, vows, and dedication ensures the highest spiritual efficacy. If time is limited, reciting the mantra directly still brings inconceivable merits.)*}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}

{align:justify|**With Utmost Sincerity, We Bow:** Namo Permanently Abiding Triple Jewel of the Ten Directions, throughout all of empty space and the Dharma Realm, past, present, and future. (1 prostration)}
{align:justify|**With Utmost Sincerity, We Bow:** Namo Master of the Sahā World, our Guide and Teacher Śākyamuni Buddha; the Future Maitreya Buddha; Mañjuśrī Bodhisattva of Great Wisdom; Samantabhadra Bodhisattva of Great Conduct; all Venerable Dharma Protector Bodhisattvas; and the Sacred Assembly of Buddhas and Bodhisattvas on Vulture Peak. (1 prostration)}
{align:justify|**With Utmost Sincerity, We Bow:** Namo Western Pure Land of Ultimate Bliss, Greatly Compassionate Guide Amitābha Buddha; Great Compassion Avalokiteśvara Bodhisattva; Great Strength Mahāsthāmaprāpta Bodhisattva; Great Vow Kṣitigarbha Bodhisattva; and the Boundless Pure Ocean-Wide Assembly of Bodhisattvas. (1 prostration)}

{align:justify|**Prayer of Sincere Repentance:**}
{align:justify|*(Excerpted from the Golden Light Sūtra — Suvarṇaprabhāsa Sūtra, Chapter on Eradication of Karmic Obstacles)*:}
{align:justify|“...I take refuge in and bow with wholehearted reverence to all the World Honored Ones dwelling throughout the ten directions in the present, who have attained Unsurpassed Bodhi, who turn the wondrous and brilliant wheel of the True Dharma, who rain down the great Dharma rain, sound the great Dharma drum, blow the great Dharma conch, raise the great Dharma banner, and hold high the great Dharma torch. For the benefit and enduring happiness of all sentient beings, You constantly bestow the gift of Dharma, illuminating the path for those in delusion and guiding them to attain the fruit of eternal peace.}
{align:justify|Before these World Honored Ones, with my body, speech, and mind, I bow and take refuge. With Your true wisdom, true vision, true certification, and absolute impartiality, You completely know and witness all wholesome and unwholesome deeds committed by sentient beings.}
{align:justify|From beginningless time until today, drifting along the currents of karmic offenses, bound tightly by greed, anger, and delusion, I have created countless karmic obstacles together with living beings. When I did not yet know the Buddha, the Dharma, or the Saṅgha, and could not distinguish wholesome from unwholesome, I committed offenses through body, speech, and mind—even the five rebellious acts: shedding the blood of a Buddha with malice, slandering the True Dharma, disrupting the harmony of the Saṅgha, killing Arhats, and harming parents and teachers. All such offenses, known and witnessed by the Buddhas, I now lay bare and sincerely repent; before the World Honored Ones, I dare not conceal anything.}
{align:justify|For all negative karmas that would cause me to fall into the six paths and eight difficulties, which I have committed or am currently committing, I sincerely repent. I pray that I may never have to suffer the painful retributions of those karmas in the future.}
{align:justify|Just as the Great Bodhisattvas of the past, present, and future, walking the Bodhi path, have repented of all karmic offenses, so do I repent of all mine today. I reveal everything without concealment. I vow to dissolve all past offenses, and for all future transgressions, I vow never to commit them again!”}

{align:justify|*(Kneel sincerely and recite)*:}
{align:justify|May the Greatly Compassionate Avalokiteśvara Bodhisattva, with a thousand hands supporting us and a thousand eyes illuminating us, cause all inner and outer obstacles to be completely eliminated; may our Bodhi resolve never waver; may all wholesome wishes be swiftly fulfilled; may our inherent wisdom blossom and all defilements and delusions be extinguished; may our three karmas remain pure and diligent in cultivating the Pure Land. We pray that when this retribution body reaches its end, we shall not stray into unfortunate paths, but be reborn directly in the Pure Land of Amitābha Buddha.}

{align:justify|**The Ten Great Vows to Great Compassion Avalokiteśvara Bodhisattva:**}
{align:justify|*(From the Great Compassion Dhāraṇī Sūtra)*}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly know all dharmas!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon obtain the eye of wisdom!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly save all living beings!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon obtain skillful means!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly board the Prajñā boat!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon cross over the ocean of suffering!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly achieve morality, samādhi, and the Way!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon ascend the mountain of Nirvāṇa!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I quickly enter the unconditioned dwelling!}
{align:justify|Namo Greatly Compassionate Avalokiteśvara: May I soon achieve the body of Dharma-nature!}

{align:justify|If I go towards a mountain of knives, the mountain of knives naturally collapses.}
{align:justify|If I go towards a raging fire, the raging fire naturally extinguishes.}
{align:justify|If I go towards the hells, the hells naturally dissipate.}
{align:justify|If I go towards hungry ghosts, the hungry ghosts are naturally satiated.}
{align:justify|If I go towards the asuras, their vicious minds are naturally subdued.}
{align:justify|If I go towards animals, they naturally gain great wisdom.}

{align:justify|Namo Greatly Compassionate Avalokiteśvara Bodhisattva. (Recite at least 21 times)}
{align:justify|Namo Amitābha Buddha. (Recite at least 21 times)}
{align:justify|Namo Sacred Assembly of Buddhas and Bodhisattvas of Great Compassion. (Recite 3 times)}

{align:justify|**Thousand Hands and Thousand Eyes Unhindered Great Compassion Heart Dhāraṇī**}
{align:justify|*(Traditional Sino-Vietnamese / East-Asian recitation)*:}

{align:justify|**Nam mô hắc ra đát na đa ra dạ da. Nam mô a rị da, bà lô yết đế, thước bát ra da, bồ đề tát đỏa bà da, ma ha tát đỏa bà da, ma ha ca lô ni ca da. Án, tát bàn ra phạt duệ, số đát na đát tỏa. Nam mô tất kiết lật đỏa y mông a rị da, bà lô kiết đế thất Phật ra lăng đà bà. Nam mô na ra cẩn trì, hê rị ma ha bàn đa sa mế, tát bà a tha đậu du bằng, a thệ dựng, tát bà tát đa, na ma bà tát đa, na ma bà già, ma phạt đạt đậu.**}
{align:justify|**Đát điệt tha. Án, a bà lô hê, lô ca đế, ca ra đế, di hê rị, ma ha bồ đề tát đỏa, tát bà tát bà, ma ra ma ra, ma hê ma hê rị đà dựng, cu lô cu lô kiết mông, độ lô độ lô phạt xà da đế, ma ha phạt xà da đế, đà ra đà ra, địa rị ni, thất Phật ra da, giá ra giá ra, mạ mạ phạt ma ra, mục đế lệ, y hê y hê, thất na thất na, a ra sâm Phật ra xá lợi, phạt sa phạt sâm, Phật ra xá da, hô lô hô lô ma ra, hô lô hô lô hê rị, ta ra ta ra, tất rị tất rị, tô rô tô rô, bồ đề dạ bồ đề dạ, bồ đà dạ bồ đà dạ, di đế rị dạ, na ra cẩn trì.**}
{align:justify|**Địa rị sắc ni na, ba dạ ma na, ta bà ha. Tất đà dạ, ta bà ha. Ma ha tất đà dạ ta bà ha. Tất đà du nghệ thất bàn ra dạ ta bà ha. Na ra cẩn trì ta bà ha. Ma ra na ra ta bà ha. Tất ra tăng a mục khư da ta bà ha. Tát bà ma ha a tất đà dạ ta bà ha. Bánh xà ra a tất đà dạ ta bà ha. Ba đà ma yết thất đà dạ ta bà ha. Na ra cẩn trì bàn đà ra dạ ta bà ha. Ma bà lợi thắng kiết ra dạ ta bà ha.**}
{align:justify|**Nam mô hắc ra đát na đá ra mạ da, Nam mô a rị da bà lô yết đế, thước bàn ra dạ, ta bà ha.**}
{align:justify|**Án tất điện đô, mạn đa ra, bạt đà dạ, ta bà ha. (Recite this concluding verse 3 times)**}

{align:justify|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:justify|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}

{align:justify|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:justify|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}

{align:justify|**DEDICATION OF MERIT (TRANSFER OF MERITS)**}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Great Compassion Mantra, creating merit on behalf of my parents, on behalf of all my karmic creditors and debtors across past and present lifetimes, and dedicating this merit universally to all sentient beings throughout empty space and the Dharma Realm.}
{align:justify|May by virtue of this merit, everyone attain peace in body and mind, be free from illnesses and afflictions, have all affairs proceed auspiciously according to their wishes, have karmic obstacles swiftly cleared away, and see blessings and merits increase continually. May the inclination to commit evil never arise, and all wholesome deeds be swiftly accomplished; may the gates to the evil destinies remain firmly shut, and the true road to heavenly, human, and ultimate Supreme Bodhi be opened.}

{align:justify|To the Buddha I take refuge, vowing that all living beings understand the Great Way profoundly and bring forth the Bodhi mind. (Prostrate)}
{align:justify|To the Dharma I take refuge, vowing that all living beings deeply enter the Sūtra Treasury and attain wisdom as vast as the sea. (Prostrate)}
{align:justify|To the Saṅgha I take refuge, vowing that all living beings unite the great assembly, all without obstruction. (Prostrate)}`
};

const daibeiCh2 = {
  id: 2348,
  tieu_de: 'Part 3: Inconceivable Power & Virtues of the Great Compassion Mantra',
  noi_dung: `{align:center|**THE INCONCEIVABLE POWER AND VIRTUES OF THE GREAT COMPASSION MANTRA**}
{align:center|*(Excerpted from the Mahā Karuṇā Dhāraṇī Sūtra — Kinh Đại Bi Tâm Đà La Ni)*}

{align:justify|**1. The Great Vows of Avalokiteśvara Bodhisattva:**}

{align:justify|In the Great Compassion Dhāraṇī Sūtra, Avalokiteśvara Bodhisattva addressed the Buddha:}
{align:justify|“World-Honored One! If any sentient being who recites and holds the Great Compassion Mantra should ever fall into the three evil paths (hells, hungry ghosts, or animals), I vow not to attain Right Enlightenment!}
{align:justify|If any sentient being who recites and holds the Great Compassion Mantra is not reborn in whatever Buddha-land they wish, I vow not to attain Right Enlightenment!}
{align:justify|If any sentient being who recites and holds the Great Compassion Mantra does not obtain boundless samādhi and eloquence, I vow not to attain Right Enlightenment!}
{align:justify|If any sentient being who recites and holds the Great Compassion Mantra does not have all wholesome wishes of this present life fulfilled, this mantra cannot be called the Great Compassion Dhāraṇī—excepted only are those who pray with insincerity or harbor doubts within their minds!”}

{align:justify|**2. Freedom from the Fifteen Kinds of Evil Death:**}

{align:justify|Avalokiteśvara Bodhisattva said: “World-Honored One, if living beings recite and uphold the Great Compassion Dhāraṇī, they will never suffer any of the fifteen kinds of untimely, tragic, or evil deaths:}
{align:justify|1. They will not die of starvation, poverty, or famine.}
{align:justify|2. They will not die from shackles, imprisonment, beatings, or execution.}
{align:justify|3. They will not die at the hands of battlefield enemies or armed bandits.}
{align:justify|4. They will not die from slaughter on the battlegrounds.}
{align:justify|5. They will not die torn apart by ferocious tigers, wolves, or savage beasts.}
{align:justify|6. They will not die from the bites of poisonous snakes, vipers, or scorpions.}
{align:justify|7. They will not die by drowning in deep waters or being swept away by floods.}
{align:justify|8. They will not die burned by fire or consuming flames.}
{align:justify|9. They will not die by poisoning, venom, or harmful potions.}
{align:justify|10. They will not die from black magic, insect curses (Gu poison), or evil sorcery.}
{align:justify|11. They will not die from madness, hysteria, or demonic possession.}
{align:justify|12. They will not die by falling from trees, cliffs, or mountain heights.}
{align:justify|13. They will not die from the malicious hexes or spells of evil people.}
{align:justify|14. They will not die from pestilence, epidemic diseases, or lethal plagues.}
{align:justify|15. They will not die by their own hand or commit suicide.”}

{align:justify|**3. Attainment of the Fifteen Kinds of Auspicious Rebirth:**}

{align:justify|“Living beings who recite and hold the Great Compassion Mantra will perpetually attain the fifteen kinds of auspicious, noble rebirths:}
{align:justify|1. In whatever realm they are born, they will always meet righteous rulers and benevolent leaders.}
{align:justify|2. They will always be born in virtuous and peaceful lands.}
{align:justify|3. They will always encounter auspicious eras and harmonious seasons.}
{align:justify|4. They will always meet good spiritual teachers (Kalyāṇa-mitra).}
{align:justify|5. Their bodily faculties will always be complete, sound, and healthy.}
{align:justify|6. Their mind on the Path will be pure, deep, and fully ripened.}
{align:justify|7. They will never break the pure moral precepts.}
{align:justify|8. Their family and retinue will be harmonious, loving, and virtuous.}
{align:justify|9. Their wealth, provisions, and necessities of life will always be abundant.}
{align:justify|10. They will always be respected, assisted, and honored by others.}
{align:justify|11. Their possessions will never be plundered, stolen, or destroyed.}
{align:justify|12. Whatever wholesome goals they seek will be effortlessly fulfilled.}
{align:justify|13. Dragons, devas, and benevolent spirits will protect them day and night.}
{align:justify|14. In whatever place they are born, they will hear the Buddha's teachings and see the Buddhas.}
{align:justify|15. They will awaken to the profound significance of the Proper Dharma and understand it without obstacle.”}

{align:justify|**4. Eradication of Heavy Karmic Offenses & Everlasting Protection:**}

{align:justify|The Buddha praised Avalokiteśvara Bodhisattva, saying:}
{align:justify|“Virtuous one! The Great Compassion Dhāraṇī is the wondrous jewel that fulfills all wishes. It can heal all eighty-four thousand diseases in the world, eliminate the ten evil deeds, and dissolve the grave offenses of the five rebellious acts. Even the heaviest offenses of slandering the Dharma, breaking precepts, or stealing from the Sangha—which cannot be wiped out by hundreds of thousands of kalpas of repentance—can be eradicated through sincere, continuous recitation of this Dhāraṇī.}
{align:justify|Whenever anyone recites this mantra, **twenty-eight benevolent spirit kings, dragon deities, and vajra guardians** will dispatch their retinues to surround and protect that practitioner constantly, never leaving their side. Whether walking, standing, sitting, or reclining, they will be guarded so that no pestilence, ghost, or malevolent entity can approach them.”}

{align:justify|Therefore, every practitioner who upholds the Great Compassion Mantra should generate a profound heart of loving-kindness and compassion for all living beings, chant with undivided focus, and dedicate the boundless merits to the peace and liberation of the entire Dharma Realm.}`
};

fs.writeFileSync(
  'static/offline-data/chapters-en/tt_1781274943336.json',
  JSON.stringify([daibeiCh0, daibeiCh1, daibeiCh2], null, 2),
  'utf8'
);
console.log('✓ Written static/offline-data/chapters-en/tt_1781274943336.json');

// 4. Đồng bộ sang thư mục build/
const buildDir = 'build/offline-data/chapters-en';
if (fs.existsSync(buildDir)) {
  fs.copyFileSync('static/offline-data/chapters-en/tt_1781275267452.json', path.join(buildDir, 'tt_1781275267452.json'));
  fs.copyFileSync('static/offline-data/chapters-en/tt_1781274943336.json', path.join(buildDir, 'tt_1781274943336.json'));
  console.log('✓ Copied to build/offline-data/chapters-en/');
}

// 5. Cập nhật offline-books-en.json
const booksEnPath = 'src/lib/data/offline-books-en.json';
const booksEn = JSON.parse(fs.readFileSync(booksEnPath, 'utf8'));

booksEn['tt_1781275267452'] = {
  title: 'The Śūraṅgama Mantra Recitation Liturgy',
  author: 'Buddhist Text Translation Society / Quang Tu',
  summary: 'Sacred daily liturgy for reciting the Supreme Śūraṅgama Mantra (King of Mantras) according to the tradition of the Sagely City of Ten Thousand Buddhas (CTTB / DRBA).'
};

booksEn['tt_1781274943336'] = {
  title: 'The Great Compassion Mantra Recitation Liturgy',
  author: 'Buddhist Text Translation Society / Quang Tu',
  summary: 'Sacred daily liturgy for reciting Avalokiteśvara Bodhisattva’s Great Compassion Dhāraṇī (Mahā Karuṇā Dhāraṇī) according to the tradition of the Sagely City of Ten Thousand Buddhas (CTTB / DRBA).'
};

fs.writeFileSync(booksEnPath, JSON.stringify(booksEn, null, 2), 'utf8');
console.log('✓ Updated src/lib/data/offline-books-en.json');

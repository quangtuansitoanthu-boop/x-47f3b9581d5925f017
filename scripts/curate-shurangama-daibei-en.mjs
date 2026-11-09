import fs from 'node:fs';
import path from 'node:path';

// 1. DỮ LIỆU CHÚ THỦ LĂNG NGHIÊM (tt_1781275267452)
// Đọc bản tiếng Việt gốc để lấy chính xác các dòng phiên âm thần chú 554 câu
const viShurangama = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781275267452.json', 'utf8'));

// Tách các câu thần chú phiên âm tiếng Phạn (Chương 0 bản gốc)
const rawSanskritLines = viShurangama[0].noi_dung.split('\n');
const sanskritMantraOnly = rawSanskritLines.filter(line => /^\s*\{align:(center|justify)\|\s*\d+\./.test(line));

// Tách các câu thần chú phiên âm Hán-Việt (Chương 1 bản gốc)
const rawSinoViLines = viShurangama[1].noi_dung.split('\n');
const sinoViMantraOnly = rawSinoViLines.filter(line => /^\s*\{align:(center|justify)\|\s*\d+\./.test(line));

const shurangamaCh0 = {
  id: 1957,
  tieu_de: 'RECITATION LITURGY (SANSKRIT TRANSLITERATION)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE SUPREME ŚŪRAṄGAMA DHĀRAṆĪ**}
{align:center|**(Sanskrit Pronunciation / Transliteration)**}

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
` + sanskritMantraOnly.slice(0, 137).join('\n') + `

{align:center|**THE SECOND ASSEMBLY**}
` + sanskritMantraOnly.slice(137, 232).join('\n') + `

{align:center|**THE THIRD ASSEMBLY**}
` + sanskritMantraOnly.slice(232, 372).join('\n') + `

{align:center|**THE FOURTH ASSEMBLY**}
` + sanskritMantraOnly.slice(372, 441).join('\n') + `

{align:center|**THE FIFTH ASSEMBLY**}
` + sanskritMantraOnly.slice(441).join('\n') + `

{align:center|**THE ŚŪRAṄGAMA HEART MANTRA**}
{align:center|Tadyathā: Oṃ anale anale viśade viśade vīra-vajradhare bandha bandhani vajrapāṇi phaṭ hūṃ bhrūṃ phaṭ svāhā.}
{align:center|*(Phonetic: Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha)*}

{align:center|**THE FIVE GREAT HEART MANTRAS OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|*(Taught by Venerable Master Hsuan Hua — Sagely City of 10,000 Buddhas)*}
{align:center|**Siddhāṃte • Akāye • Mitradyote • Prativitāra • Nayikere**}
{align:center|*(Phonetic: Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim / Hán-Việt: Sất đà nể, A ca da, Mật rị trụ, Bát rị đát da ra, Nảnh yết rị)*}

{align:center|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}
{align:center|*(Phonetic: Ôm Hu Ru Hu Ru Gia Gia Mu Khê Xoa Ha)*}

{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}
{align:center|*(Phonetic: Ôm, sam ba ra, sam ba ra, bi ma na, sa ra, ma ha, da va, hum. Ôm, sờ ma ra, sờ ma ra, bi ma na, sờ ca ra, ma ha, da va, hum)*}

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

const shurangamaCh1 = {
  id: 1958,
  tieu_de: 'RECITATION LITURGY (SINO-VIETNAMESE TRANSLITERATION)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE SUPREME ŚŪRAṄGAMA DHĀRAṆĪ**}
{align:center|**(Traditional Sino-Vietnamese Transliteration)**}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Ôm tu rê, tu rê, ma ha tu rê, tu tu rê, xoa ha)*}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}
{align:center|*(Phonetic: Ôm soa ba va, sut đa xa rờ va, đa rờ ma, Soa ba va sut đa ham)*}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}
{align:center|*(Phonetic: Ôm ram, soa ha)*}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Na mắc sa măn tá bút đa năm, Ôm đu ru đu ru đê vi soa ha)*}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Ôm pờ ra ma ni đa ni xoa ha)*}

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
` + sinoViMantraOnly.slice(0, 137).join('\n') + `

{align:center|**THE SECOND ASSEMBLY**}
` + sinoViMantraOnly.slice(137, 232).join('\n') + `

{align:center|**THE THIRD ASSEMBLY**}
` + sinoViMantraOnly.slice(232, 372).join('\n') + `

{align:center|**THE FOURTH ASSEMBLY**}
` + sinoViMantraOnly.slice(372, 441).join('\n') + `

{align:center|**THE FIFTH ASSEMBLY**}
` + sinoViMantraOnly.slice(441).join('\n') + `

{align:center|**THE ŚŪRAṄGAMA HEART MANTRA**}
{align:center|Đát điệt tha: Án, a na lệ, tì xá đề, bệ ra bạt xà ra đà rị, bàn đà bàn đà nễ, bạt xà ra bàng ni phấn, hổ hồng đô rô ung phấn, ta bà ha.}
{align:center|*(Sanskrit: Tadyathā: Oṃ anale anale viśade viśade vīra-vajradhare bandha bandhani vajrapāṇi phaṭ hūṃ bhrūṃ phaṭ svāhā)*}

{align:center|**THE FIVE GREAT HEART MANTRAS OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|*(Taught by Venerable Master Hsuan Hua — Sagely City of 10,000 Buddhas)*}
{align:center|**Sất đà nể • A ca da • Mật rị trụ • Bát rị đát da ra • Nảnh yết rị**}
{align:center|*(Sanskrit: Siddhāṃte • Akāye • Mitradyote • Prativitāra • Nayikere)*}

{align:center|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:center|Ôm Hu Ru Hu Ru Gia Gia Mu Khê Xoa Ha. (Recite 7 times)}
{align:center|*(Sanskrit: Oṃ kuru kuru jayamukhe svāhā)*}

{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Ôm, sam ba ra, sam ba ra, bi ma na, sa ra, ma ha, da va, hum. Ôm, sờ ma ra, sờ ma ra, bi ma na, sờ ca ra, ma ha, da va, hum. (Recite 7 times)}
{align:center|*(Sanskrit: Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ)*}

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
{align:justify|*Note: The Śūraṅgama Heart Mantra and the Five Great Heart Mantras may be recited 3, 7, 21, 49, or 108 times, as many times as possible according to one's time and conditions.}`
};

const shurangamaCh2 = {
  id: 2317,
  tieu_de: 'WONDERFUL EFFICACY AND VIRTUES OF THE ŚŪRAṄGAMA MANTRA',
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

// Ghi file tt_1781275267452.json
fs.writeFileSync(
  'static/offline-data/chapters-en/tt_1781275267452.json',
  JSON.stringify([shurangamaCh0, shurangamaCh1, shurangamaCh2], null, 2),
  'utf8'
);
console.log('✓ Updated static/offline-data/chapters-en/tt_1781275267452.json');

// 2. DỮ LIỆU CHÚ ĐẠI BI (tt_1781274943336)
const daibeiCh0 = {
  id: 2335,
  tieu_de: 'RECITATION LITURGY (SANSKRIT TRANSLITERATION)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE GREAT COMPASSION DHĀRAṆĪ**}
{align:center|**(Sanskrit Transliteration — Mahā Karuṇā Dhāraṇī)**}
{align:center|*(This liturgy may be applied when reciting any mantra. Following the complete liturgy of purification, veneration, repentance, vows, and dedication ensures the highest spiritual efficacy. If time is limited, reciting the mantra directly still brings inconceivable merits.)*}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Ôm tu rê, tu rê, ma ha tu rê, tu tu rê, xoa ha)*}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}
{align:center|*(Phonetic: Ôm soa ba va, sut đa xa rờ va, đa rờ ma, Soa ba va sut đa ham)*}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}
{align:center|*(Phonetic: Ôm ram, soa ha)*}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Na mắc sa măn tá bút đa năm, Ôm đu ru đu ru đê vi soa ha)*}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Ôm pờ ra ma ni đa ni xoa ha)*}

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

{align:justify|**Namo ratna-trayāya. Namo āryāvalokiteśvarāya bodhisattvāya mahāsattvāya mahākāruṇikāya. Oṃ, sarva-rabhaye sudhanadasya. Namo skṛtvā imaṃ āryāvalokiteśvara-laṅdhava. Namo narakindi hrīḥ mahā-vadhasame, sarva-arthadu-śubhaṃ ajeyaṃ, sarva-satta-nama-vasatta, namovaga, mavadudhu.**}
{align:justify|**Tadyathā: Oṃ, avaloki-lokate-karate, e-hrīḥ, mahā-bodhisattva, sarva sarva, mala mala, mahi-mā-hṛdayam, kuru kuru karmam, dhuru dhuru vijayate mahā-vijayate, dhara dhara dhirīṇi śvarāya, cala cala mama vamāra muktele, ehi ehi, śina śina, āraṣam pracali, vaṣa-vaṣaṃ praśaya, huru huru mara, huru huru hrīḥ, sara sara, siri siri, suru suru, bodhiya bodhiya, bodhaya bodhaya, maitreya narakindi.**}
{align:justify|**Dharṣiṇina payamana svāhā. Siddhāya svāhā. Mahā-siddhāya svāhā. Siddhāyogeśvarāya svāhā. Narakindi svāhā. Mārāṇara svāhā. Śira-siṃha-mukhāya svāhā. Sarva-mahā-asiddhāya svāhā. Cakra-asiddhāya svāhā. Padma-hastāya svāhā. Narakindi-vagalāya svāhā. Mavari-śaṅkharāya svāhā.**}
{align:justify|**Namo ratna-trayāya. Namo āryāvalokiteśvarāya svāhā.**}
{align:justify|**Oṃ, sidhyantu mantra-padāya svāhā. (Recite this concluding verse 3 times)**}

{align:justify|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:justify|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}
{align:justify|*(Phonetic: Ôm hu ru hu ru gia gia mu khê xoa ha)*}

{align:justify|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:justify|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}
{align:justify|*(Phonetic: Ôm, sam ba ra, sam ba ra, bi ma na, sa ra, ma ha, da va, hum, ôm, sờ ma ra, sờ ma ra, bi ma na, sờ ca ra, ma ha, da va, hum)*}

{align:justify|**DEDICATION OF MERIT (TRANSFER OF MERITS)**}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Great Compassion Mantra, creating merit on behalf of my parents, on behalf of all my karmic creditors and debtors across past and present lifetimes, and dedicating this merit universally to all sentient beings throughout empty space and the Dharma Realm.}
{align:justify|May by virtue of this merit, everyone attain peace in body and mind, be free from illnesses and afflictions, have all affairs proceed auspiciously according to their wishes, have karmic obstacles swiftly cleared away, and see blessings and merits increase continually. May the inclination to commit evil never arise, and all wholesome deeds be swiftly accomplished; may the gates to the evil destinies remain firmly shut, and the true road to heavenly, human, and ultimate Supreme Bodhi be opened.}

{align:justify|To the Buddha I take refuge, vowing that all living beings understand the Great Way profoundly and bring forth the Bodhi mind. (Prostrate)}
{align:justify|To the Dharma I take refuge, vowing that all living beings deeply enter the Sūtra Treasury and attain wisdom as vast as the sea. (Prostrate)}
{align:justify|To the Saṅgha I take refuge, vowing that all living beings unite the great assembly, all without obstruction. (Prostrate)}`
};

const daibeiCh1 = {
  id: 2343,
  tieu_de: 'RECITATION LITURGY (SINO-VIETNAMESE TRANSLITERATION)',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE GREAT COMPASSION DHĀRAṆĪ**}
{align:center|**(Traditional Sino-Vietnamese Transliteration)**}
{align:center|*(This liturgy may be applied when reciting any mantra. Following the complete liturgy of purification, veneration, repentance, vows, and dedication ensures the highest spiritual efficacy. If time is limited, reciting the mantra directly still brings inconceivable merits.)*}

{align:center|**MANTRA FOR PURIFYING KARMIC ACTIONS OF SPEECH**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Ôm tu rê, tu rê, ma ha tu rê, tu tu rê, xoa ha)*}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (Recite 3 times)}
{align:center|*(Phonetic: Ôm soa ba va, sut đa xa rờ va, đa rờ ma, Soa ba va sut đa ham)*}

{align:center|**MANTRA FOR PURIFYING THE DHARMA REALM**}
{align:center|Oṃ raṃ svāhā. (Recite 7 times)}
{align:center|*(Phonetic: Ôm ram, soa ha)*}

{align:center|**MANTRA FOR PACIFYING THE LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Na mắc sa măn tá bút đa năm, Ôm đu ru đu ru đê vi soa ha)*}

{align:center|**MANTRA FOR ERADICATING FIXED KARMA**}
{align:center|Oṃ pramardani svāhā. (Recite 3 times)}
{align:center|*(Phonetic: Ôm pờ ra ma ni đa ni xoa ha)*}

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
{align:justify|*(Daily recitation: at least 5 times, or 7, 21, 49, 108 times. Reciting once from 'Nam mô hắc ra đát na...' to 'bạt đà dạ, ta bà ha' constitutes one complete turn)*:}

{align:justify|**Nam mô hắc ra đát na đa ra dạ da. Nam mô a rị da, bà lô yết đế, thước bát ra da, bồ đề tát đỏa bà da, ma ha tát đỏa bà da, ma ha ca lô ni ca da. Án, tát bàn ra phạt duệ, số đát na đát tỏa. Nam mô tất kiết lật đỏa y mông a rị da, bà lô kiết đế thất Phật ra lăng đà bà. Nam mô na ra cẩn trì, hê rị ma ha bàn đa sa mế, tát bà a tha đậu du bằng, a thệ dựng, tát bà tát đa, na ma bà tát đa, na ma bà già, ma phạt đạt đậu.**}
{align:justify|**Đát điệt tha. Án, a bà lô hê, lô ca đế, ca ra đế, di hê rị, ma ha bồ đề tát đỏa, tát bà tát bà, ma ra ma ra, ma hê ma hê rị đà dựng, cu lô cu lô kiết mông, độ lô độ lô phạt xà da đế, ma ha phạt xà da đế, đà ra đà ra, địa rị ni, thất Phật ra da, giá ra giá ra, mạ mạ phạt ma ra, mục đế lệ, y hê y hê, thất na thất na, a ra sâm Phật ra xá lợi, phạt sa phạt sâm, Phật ra xá da, hô lô hô lô ma ra, hô lô hô lô hê rị, ta ra ta ra, tất rị tất rị, tô rô tô rô, bồ đề dạ bồ đề dạ, bồ đà dạ bồ đà dạ, di đế rị dạ, na ra cẩn trì.**}
{align:justify|**Địa rị sắc ni na, ba dạ ma na, ta bà ha. Tất đà dạ, ta bà ha. Ma ha tất đà dạ ta bà ha. Tất đà du nghệ thất bàn ra dạ ta bà ha. Na ra cẩn trì ta bà ha. Ma ra na ra ta bà ha. Tất ra tăng a mục khư da ta bà ha. Tát bà ma ha a tất đà dạ ta bà ha. Bánh xà ra a tất đà dạ ta bà ha. Ba đà ma yết thất đà dạ ta bà ha. Na ra cẩn trì bàn đà ra dạ ta bà ha. Ma bà lợi thắng kiết ra dạ ta bà ha.**}
{align:justify|**Nam mô hắc ra đát na đá ra mạ da, Nam mô a rị da bà lô yết đế, thước bàn ra dạ, ta bà ha.**}
{align:justify|**Án tất điện đô, mạn đa ra, bạt đà dạ, ta bà ha. (Recite this concluding verse 3 times)**}

{align:justify|**MANTRA FOR RECTIFYING ERRORS IN PRONUNCIATION**}
{align:justify|Ôm hu ru hu ru gia gia mu khê xoa ha. (Recite 7 times)}
{align:justify|*(Sanskrit: Oṃ kuru kuru jayamukhe svāhā)*}

{align:justify|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:justify|Ôm, sam ba ra, sam ba ra, bi ma na, sa ra, ma ha, da va, hum, ôm, sờ ma ra, sờ ma ra, bi ma na, sờ ca ra, ma ha, da va, hum. (Recite 7 times)}
{align:justify|*(Sanskrit: Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ)*}

{align:justify|**DEDICATION OF MERIT (TRANSFER OF MERITS)**}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Great Compassion Mantra, creating merit on behalf of my parents, on behalf of all my karmic creditors and debtors across past and present lifetimes, and dedicating this merit universally to all sentient beings throughout empty space and the Dharma Realm.}
{align:justify|May by virtue of this merit, everyone attain peace in body and mind, be free from illnesses and afflictions, have all affairs proceed auspiciously according to their wishes, have karmic obstacles swiftly cleared away, and see blessings and merits increase continually. May the inclination to commit evil never arise, and all wholesome deeds be swiftly accomplished; may the gates to the evil destinies remain firmly shut, and the true road to heavenly, human, and ultimate Supreme Bodhi be opened.}

{align:justify|To the Buddha I take refuge, vowing that all living beings understand the Great Way profoundly and bring forth the Bodhi mind. (Prostrate)}
{align:justify|To the Dharma I take refuge, vowing that all living beings deeply enter the Sūtra Treasury and attain wisdom as vast as the sea. (Prostrate)}
{align:justify|To the Saṅgha I take refuge, vowing that all living beings unite the great assembly, all without obstruction. (Prostrate)}`
};

const daibeiCh2 = {
  id: 2348,
  tieu_de: 'INCONCEIVABLE POWER AND VIRTUES OF THE GREAT COMPASSION MANTRA',
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

// Ghi file tt_1781274943336.json
fs.writeFileSync(
  'static/offline-data/chapters-en/tt_1781274943336.json',
  JSON.stringify([daibeiCh0, daibeiCh1, daibeiCh2], null, 2),
  'utf8'
);
console.log('✓ Updated static/offline-data/chapters-en/tt_1781274943336.json');

// 3. Đồng bộ sang thư mục build/ nếu tồn tại
const buildDir = 'build/offline-data/chapters-en';
if (fs.existsSync(buildDir)) {
  fs.copyFileSync('static/offline-data/chapters-en/tt_1781275267452.json', path.join(buildDir, 'tt_1781275267452.json'));
  fs.copyFileSync('static/offline-data/chapters-en/tt_1781274943336.json', path.join(buildDir, 'tt_1781274943336.json'));
  console.log('✓ Copied updated files to build/offline-data/chapters-en/');
}

// 4. Cập nhật chapters-en-availability.json: chuyển 2 id này từ mtIds sang ids (đã được hiệu đính chuẩn)
const availPath = 'src/lib/data/chapters-en-availability.json';
const avail = JSON.parse(fs.readFileSync(availPath, 'utf8'));

const targetIds = ['tt_1781275267452', 'tt_1781274943336'];
avail.ids = avail.ids || [];
avail.mtIds = avail.mtIds || [];

for (const id of targetIds) {
  if (!avail.ids.includes(id)) {
    avail.ids.push(id);
  }
  avail.mtIds = avail.mtIds.filter(item => item !== id);
}

fs.writeFileSync(availPath, JSON.stringify(avail, null, 2), 'utf8');
console.log('✓ Updated src/lib/data/chapters-en-availability.json (moved to verified ids)');

// 5. Cập nhật offline-books-en.json với tiêu đề và tóm tắt chuẩn
const booksEnPath = 'src/lib/data/offline-books-en.json';
const booksEn = JSON.parse(fs.readFileSync(booksEnPath, 'utf8'));

booksEn['tt_1781275267452'] = {
  title: 'Śūraṅgama Mantra Recitation Liturgy',
  author: 'Quang Tu',
  summary: 'Sacred daily liturgy for reciting the Supreme Śūraṅgama Mantra (King of Mantras) to extinguish delusion, overcome karmic obstacles, and establish unwavering samādhi, referencing the Sagely City of 10,000 Buddhas (CTTB) tradition.'
};

booksEn['tt_1781274943336'] = {
  title: 'Great Compassion Mantra Recitation Liturgy',
  author: 'Quang Tu',
  summary: 'Sacred daily liturgy for reciting Avalokiteshvara Bodhisattva’s Great Compassion Dhāraṇī (Mahā Karuṇā Dhāraṇī) for peace, healing, protection, and boundless compassion, referencing the Sagely City of 10,000 Buddhas (CTTB) tradition.'
};

fs.writeFileSync(booksEnPath, JSON.stringify(booksEn, null, 2), 'utf8');
console.log('✓ Updated src/lib/data/offline-books-en.json');

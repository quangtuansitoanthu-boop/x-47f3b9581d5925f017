import fs from 'fs';

// 1. UPDATE book_1788356229855_48d01c4c (Food Offering / Mengshan Food Bestowal)
const foodOfferingCh0 = `<h2><strong>THINGS TO NOTE BEFORE CONDUCTING THE FOOD OFFERING RITUAL (MENGSHAN FOOD BESTOWAL)</strong></h2>

<h3><strong>1. LOCATION</strong></h3>
<p>This ritual should be performed outdoors in the yard, on the street, or on a veranda/balcony, because wandering spirits and preta souls can more easily assemble and accept food offering and spiritual deliverance in open spaces. (It should not be performed inside living rooms, except for internal repentance rituals for personal karmic creditors).</p>
<p>If you live in an apartment without a private balcony, you can place a small table near an open window or go to a public park/quiet outdoor area.</p>

<h3><strong>2. OFFERINGS</strong></h3>
<p>Offerings are simple and purely plant-based (vegan):<br/>
• Clean, clear water (1 small bowl or cup)<br/>
• Cooked rice or uncooked rice grains mixed with sesame seeds (a small bowl)<br/>
• A few sweet pastries, biscuits, or candy<br/>
• Incense and candles/tea-lights (if fire safety permits)<br/>
<em>Important: Never offer meat, alcohol, or animal products.</em></p>

<h3><strong>3. MINDSET AND ATTITUDE</strong></h3>
<p>The essence of the Mengshan Food Bestowal is not the physical quantity of food, but <strong>boundless compassion (Karuṇā)</strong> and the spiritual empowerment of the Mantras and Buddhas' Names. When reciting, maintain sincere reverence, visualizing that through the Buddha's grace, each grain of food and drop of water transforms into oceans of sweet celestial ambrosia (amṛta) that relieve the hunger, thirst, and burnings of all wandering spirits, guiding them to rebirth in Amitābha Buddha's Pure Land.</p>`;

const foodOfferingCh1 = `<h2 style="text-align:center"><strong>THE LITURGY OF FOOD BESTOWAL TO HUNGRY SPIRITS (MENGSHAN FOOD OFFERING)</strong></h2>

<p style="text-align:center"><strong>Mantra for Purifying Speech Karma:</strong><br/>
Oṃ śucite śucite mahā-śucite śuśucite svāhā. (3 times)</p>

<p style="text-align:center"><strong>Mantra for Purifying the Three Karmas:</strong><br/>
Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (3 times)</p>

<p style="text-align:center"><strong>Mantra for Shattering the Hells:</strong><br/>
Oṃ karaday svāhā. (3 times)</p>

<p style="text-align:center"><strong>Mantra for Eradicating Fixed Karma:</strong><br/>
Oṃ pra-marda-ni svāhā. (3 times)</p>

<p style="text-align:center"><strong>Mantra for Purifying the Dharma Realm:</strong><br/>
Oṃ raṃ svāhā. (3 times)</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:80px;margin:20px auto;"/>

<h3 style="text-align:center">INVITATION OF UNSEEN SPIRITS & SINCERE ASPIRATION</h3>
<p style="text-align:justify"><em>(The practitioner kneels with palms joined and recites):</em><br/>
"Today, I, disciple [Name / Dharma Name], prepare this modest, pure vegetarian offering. With utmost sincerity, I respectfully invite all my personal karmic creditors from beginningless lifetimes—whether in human form, ghostly form, or animal form—across the six destinies, whether dwelling within my body or outside, who have ever suffered harm, grievance, or sorrow through my past actions.<br/>
I also reverently invite all lonely spirits, wandering souls, and hungry preta ghosts who have no families, no shelter, and no offerings, who wander in cold hunger, and all spirits with karmic affinities in this local area: May you all rely upon the boundless spiritual power of the Buddha, Dharma, and Sangha to assemble here and receive our offering of food, drink, and Dharma nectar.<br/>
May you receive this modest feast, rely upon the Buddha's compassionate guidance and the sacred sūtras, be freed from all suffering and pain, and swiftly be reborn in the Western Pure Land of Ultimate Bliss to enjoy eternal joy." (1 bow, repeat 3 times)</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:80px;margin:20px auto;"/>

<h3 style="text-align:center">INCENSE OFFERING TO THE WRATHFUL MAHASATTVA</h3>
<p style="text-align:center">May the wondrous Dharma and all Bodhisattvas,<br/>
Śrāvakas, Pratyekabuddhas, and Holy Sages,<br/>
Manifest as luminous clouds of light,<br/>
Pervading the realms of the ten directions.<br/>
Inspiring all living beings<br/>
To bring forth the supreme Bodhi Mind,<br/>
Leaving behind all unwholesome karma,<br/>
And together perfecting the Unsurpassed Way.<br/>
<strong>Namo Incense Offering Flaming-Faced Mahāsattva Bodhisattva (Avalokiteśvara).</strong> (3 times, 1 bow)</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:80px;margin:20px auto;"/>

<h3 style="text-align:center">THE EMPOWERMENT MANTRAS</h3>

<p style="text-align:center"><strong>Mantra for Opening the Throat:</strong><br/>
Oṃ bu-pū-ti-ri ga-ta-ri ta-thā-ga-tā-ya. (3 times)</p>

<p style="text-align:center"><strong>Avalokiteśvara Bodhisattva's Karma-Eliminating Mantra:</strong><br/>
Oṃ ārolik svāhā. (3 times)</p>

<p style="text-align:center"><strong>Namo Great Compassion Avalokiteśvara Bodhisattva.</strong> (7 times)</p>

<p style="text-align:center"><strong>The Wish-Fulfilling Wheel King Dhāraṇī (Cintāmaṇicakra):</strong><br/>
Namo Buddhāya • Namo Dharmāya • Namo Saṅghāya •<br/>
Namo 'ryāvalokiteśvarāya Bodhisattvāya Mahāsattvāya Mahākāruṇikāya •<br/>
Tadyathā: Oṃ cakra-varti cintā-maṇi mahā-padme ruru tiṣṭha jvala ākarṣāya hūṃ phaṭ svāhā. (3 times)</p>

<p style="text-align:justify"><em>"Reverently bowing to the Great Compassionate Bodhisattva Avalokiteśvara: Relying upon the merit of this Dhāraṇī and the boundless empowerment of the Buddhas, may these offerings transform according to the wishes of all spirits assembled here, multiplying infinitely so that all are fully satisfied without lack."</em> (1 bow)</p>

<p style="text-align:center"><strong>Food-Multiplying Dhāraṇī (Biến Thực Chân Ngôn):</strong><br/>
Namo sarva-tathāgatāvalokite oṃ saṃbhāra saṃbhāra hūṃ. (7 times)</p>

<p style="text-align:center"><strong>Sweet Dew Water Dhāraṇī (Cam Lồ Thủy Chân Ngôn):</strong><br/>
Namo surūpāya tathāgatāya tadyathā: oṃ suru suru pra-suru pra-suru svāhā. (3 times)</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:80px;margin:20px auto;"/>

<h3 style="text-align:center">EXHORTATION TO REBIRTH IN THE PURE LAND</h3>
<p style="text-align:justify">Respected spirits and unseen beings: When the Fundamental Teacher Śākyamuni Buddha was in the world, he taught that past hundreds of thousands of kotis of Buddha-lands to the West, there is a world named <strong>Sukhāvatī (Ultimate Bliss)</strong>, where Amitābha Buddha presently expounds the Dharma.<br/>
That world is adorned with seven treasures, filled with jeweled lotus ponds and pure ambrosia. It is completely free from hunger, cold, sickness, deformity, or enmity. Those reborn there attain immeasurable lifespan, progressing irreversibly toward supreme Buddhahood.<br/>
Those who wish to be reborn there need only bring forth sincere faith, mindfully recite <strong>"Namo Amitābha Buddha"</strong>, and dedicate their hearts toward rebirth.<br/>
Now let us all recite together with single-minded devotion:</p>

<h3 style="text-align:center">PRAISE OF AMITĀBHA BUDDHA</h3>
<p style="text-align:center">Amitābha Buddha's body is the color of gold,<br/>
His splendid marks and brilliant radiance are incomparable.<br/>
The white curl between his brows revolves like Mount Sumeru,<br/>
His clear blue eyes are vast as the four great oceans.<br/>
Within his radiant aura manifest countless transformation Buddhas,<br/>
And limitless Bodhisattvas appear within his light.<br/>
His forty-eight great vows deliver all living beings,<br/>
The nine grades of golden lotuses carry all to liberation.<br/>
We take refuge and prostrate to Amitābha Buddha,<br/>
In the Western World of Peaceful Sustenance.<br/>
We now bring forth the sincere resolve for rebirth,<br/>
Beseeching the Compassionate One to receive and guide us.<br/>
<strong>Namo Western Land of Ultimate Bliss, Great Kindness and Great Compassion Amitābha Buddha.</strong></p>

<p style="text-align:center"><strong>NAMO AMITĀBHA BUDDHA (NAMO A DI ĐÀ PHẬT)</strong><br/>
<em>(Recite 108 times or continuously)</em></p>

<p style="text-align:center"><strong>Pure Land Rebirth Dhāraṇī (Wang Sheng Zhou):</strong><br/>
Namo amitābhāya tathāgatāya tadyathā: amṛtodbhave amṛtasaṃbhave amṛtavikrānte amṛtavikrāntagāmini gagana kīrtikare svāhā. (3 times)</p>

<p style="text-align:center"><strong>Mantra for Completing Omissions:</strong><br/>
Oṃ huru huru jaya-mukhe svāhā. (7 times)</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align:center">THE THREE REFUGES</h3>
<p style="text-align:center">I take refuge in the Buddha, wishing that all sentient beings understand the Great Way profoundly and bring forth the supreme Bodhi Mind.<br/>
I take refuge in the Dharma, wishing that all sentient beings penetrate the Treasury of Sūtras and attain wisdom as vast as the ocean.<br/>
I take refuge in the Sangha, wishing that all sentient beings lead the great assembly in harmony, without any obstruction.</p>

<h3 style="text-align:center">DEDICATION OF MERIT</h3>
<p style="text-align:center">May the merit and virtue accrued from this food offering<br/>
Eradicate karmic obstacles for all our karmic creditors and wandering spirits.<br/>
May all be born together in the Western Land of Ultimate Bliss,<br/>
Swiftly perfecting Unsurpassed Supreme Enlightenment.<br/>
<strong>Namo Ever-Abiding Triple Gem of the Ten Directions.</strong> (3 times)</p>`;

fs.writeFileSync('static/offline-data/chapters-en/book_1788356229855_48d01c4c.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Instructions & Essentials (Read First)', noi_dung: foodOfferingCh0 },
  { id: 'chap_2', tieu_de: 'Food Bestowal Liturgy (Mengshan Food Offering)', noi_dung: foodOfferingCh1 }
], null, 2), 'utf8');

fs.writeFileSync('static/offline-data/chapters-en/1788356229855_48d01c4c.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Instructions & Essentials (Read First)', noi_dung: foodOfferingCh0 },
  { id: 'chap_2', tieu_de: 'Food Bestowal Liturgy (Mengshan Food Offering)', noi_dung: foodOfferingCh1 }
], null, 2), 'utf8');

console.log('Successfully updated Food Offering ritual in chapters-en!');

// 2. UPDATE tt_1781615695204 (Repentance to Karmic Creditors)
const karmicCreditorsCh0 = `{align:justify|# 1. WHY MUST WE SINCERELY REPENT TO KARMIC CREDITORS? (Oan Gia Trái Chủ)}

{align:justify|After passing away, many souls remain attached to the earthly realm, unwilling to seek rebirth because they cannot release deep grievances, anger, and hatred. Among them, the most poignant are our **Karmic Creditors and Debtor Spirits (Oan Gia Trái Chủ)**.}

{align:justify|They are the spirits of human beings or animals who, in this lifetime or across countless past lifetimes, shared deep karmic enmities with us. In past lives, they may have been animals whom we slaughtered, hunted, or consumed; or human beings whom we abused, exploited, defrauded, injured, or killed; or aborted infant souls who were deprived of life. These actions created tangled knots of hatred and resentment across the wheel of saṃsāra.}

{align:justify|When karmic conditions ripen, these spirits recognize their debtors. Driven by lingering pain and anger, they often follow close behind, causing disturbances to physical health, emotional well-being, family discord, or spiritual hindrances.}

{align:justify|**How can these karmic grievances be truly resolved?**}
{align:justify|Retaliation and confrontation only multiply suffering. The Buddha taught that hatred can never cease through hatred, but only through love, compassion, and sincere repentance. By holding sincere repentance ceremonies, sincerely acknowledging past wrongdoings, asking for their forgiveness, offering them spiritual merits, and guiding them to recite Amitābha Buddha's name for rebirth in the Pure Land, both practitioner and spirits are liberated from the shackles of vengeance.}

{align:justify|**Preparation for the Practice:**
• Choose a quiet room or space before the Buddha altar or ancestral altar.
• Light incense, keep the mind calm, respectful, and free of fear.
• Recite with genuine remorse and heartfelt compassion, viewing these spirits as sentient beings who have suffered immense pain.}
`;

const karmicCreditorsCh1 = `{align:center|# THE LITURGY OF SINCERE REPENTANCE AND DELIVERANCE FOR KARMIC CREDITORS}
{align:center|*(Nghi Thức Sám Hối & Cầu Siêu Oan Gia Trái Chủ)*}

{align:center|*(All recite in unison)*:
Bowing our heads to the Tathāgata,
Unequaled throughout the Ten Dharma Realms.
The Dharmakāya ever abides eternally,
His limitless transformation bodies endure hardships to deliver beings.}

{align:center|**HOMAGE TO THE BUDDHAS AND BODHISATTVAS**}
{align:center|Namo Fundamental Teacher Śākyamuni Buddha! (3 bows)}
{align:center|Namo Guide of the Western Paradise Amitābha Buddha! (1 bow)}
{align:center|Namo Medicine Master Lapis Lazuli Light King Buddha! (1 bow)}
{align:center|Namo Many Treasures (Prabhūtaratna) Tathāgata! (1 bow)}
{align:center|Namo Fearless (Abhayaṅkara) Tathāgata! (1 bow)}
{align:center|Namo Exquisite Form (Surūpakāya) Tathāgata! (1 bow)}
{align:center|Namo Vast Body (Vipulakāya) Tathāgata! (1 bow)}
{align:center|Namo Great Compassion Avalokiteśvara Bodhisattva! (1 bow)}
{align:center|Namo Mahāsthāmaprāpta Bodhisattva! (1 bow)}
{align:center|Namo Great Vow Kṣitigarbha Bodhisattva! (1 bow)}
{align:center|Namo Future Maitreya Buddha! (1 bow)}
{align:center|Namo Ever-Abiding Triple Gem of the Ten Directions! (1 bow)}

{align:center|**MANTRA FOR PURIFYING SPEECH KARMA**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (3 times)}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (3 times)}

{align:center|**THE GREAT COMPASSION MANTRA**}
{align:center|*(Recite 3 times)*
namo ratnatrayāya • namo 'ryāvalokiteśvarāya bodhisattvāya mahāsattvāya mahākāruṇikāya • oṃ sarva-rabhaye sidhyantu mantra-padāni svāhā • namas-kṛtvā imaṃ aryāvalokiteśvara-stavaṃ nīlakaṇṭha-nāma • hṛdayaṃ vartayiṣyāmi sarvārtha-sādhanaṃ śubham • aje yaṃ sarva-bhūtānāṃ bhava-mārga-viśodhakam • tadyathā: oṃ āloka-lokātīta krānta he hare mahābodhisattva • smara smara hṛdayam • kuru kuru karma • dhara dhara dharani-rāja • cala cala malla-vikrānte • ehy-ehi loka-jiteśvara rāga-viṣa-vināśana • dveṣa-viṣa-vināśana • moha-viṣa-vināśana • hulu hulu mālā • sara sara siri siri suru suru • buddhya buddhya bodhaya bodhaya • maitreya nīlakaṇṭha kāmasya darśanaṃ prahlādaya manaḥ svāhā • siddhāya svāhā • mahāsiddhāya svāhā • siddhayogeśvarāya svāhā • nīlakaṇṭhāya svāhā • padma-hastāya svāhā • cakra-yudhāya svāhā • namo ratnatrayāya • namo 'ryāvalokiteśvarāya svāhā.}

{align:center|**THE HEART OF PRAJÑĀPĀRAMITĀ SŪTRA (HEART SŪTRA)**}
{align:justify|When Bodhisattva Avalokiteśvara was practicing the profound Prajñāpāramitā, he illuminated the Five Skandhas and saw that they are all empty, thereby transcending all suffering and adversity. Śāriputra, form does not differ from emptiness; emptiness does not differ from form. Form itself is emptiness; emptiness itself is form. The same is true of feelings, perceptions, impulses, and consciousness... Therefore know that Prajñāpāramitā is the great transcendent mantra, the unexcelled mantra: *Gate gate pāragate pārasaṃgate bodhi svāhā.*}

{align:center|**PRAYER OF SINCERE REPENTANCE BEFORE KARMIC CREDITORS**}
{align:justify|I, disciple [Name / Dharma Name], with a deeply remorseful and sincere heart, speak to all my karmic creditors, ancestral spirits, and debtor beings across beginningless time:<br/>
"From beginningless lifetimes until this day, shrouded in delusion and driven by greed, anger, and ignorance, I have committed countless harmful actions. I have killed, abused, caused pain, resentment, and bitter suffering to you. Seeing the deep anguish you have endured, I now feel profound remorse and shame.<br/>
Today, before the compassionate presence of the Triple Gem, I openly disclose and sincerely repent all my past offenses. I beseech you with all my heart to accept my sincere apology and release all hatred, bitterness, and vengeance.<br/>
Holding on to grievances only binds us to ongoing cycles of rebirth and pain. Let us together take refuge in the Triple Gem, listen to the Buddha's holy names, and transform our minds into peace."} (1 bow)

{align:center|**ASPIRATION FOR REBIRTH IN SUKHĀVATĪ**}
{align:center|Namo Western Land of Ultimate Bliss, Great Kindness and Great Compassion Amitābha Buddha. (1 bow)}
{align:center|**NAMO AMITĀBHA BUDDHA (NAMO A DI ĐÀ PHẬT)** (Recite 108 times)}

{align:center|**PURE LAND REBIRTH DHĀRAṆĪ**}
{align:center|Namo amitābhāya tathāgatāya tadyathā: amṛtodbhave amṛtasaṃbhave amṛtavikrānte amṛtavikrāntagāmini gagana kīrtikare svāhā. (3 times)}

{align:center|**THE THREE REFUGES**}
{align:center|I take refuge in the Buddha.
I take refuge in the Dharma.
I take refuge in the Sangha.}

{align:center|**DEDICATION OF MERIT**}
{align:center|May all merit and virtue accrued from this recitation
Be dedicated to all my karmic creditors and debtor spirits.
May your grievances be thoroughly extinguished,
Your hearts filled with tranquility and light,
And may you be swiftly reborn together in the Land of Ultimate Bliss.}
`;

fs.writeFileSync('static/offline-data/chapters-en/tt_1781615695204.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Instructions & Karmic Understanding (Read First)', noi_dung: karmicCreditorsCh0 },
  { id: 'chap_2', tieu_de: 'Liturgy of Sincere Repentance to Karmic Creditors', noi_dung: karmicCreditorsCh1 }
], null, 2), 'utf8');

console.log('Successfully updated Karmic Creditors ritual in chapters-en!');

// 3. UPDATE book_1788620832166_04b4ffd5 (Resolving Unseen Karmic Bonds / Duyên Âm)
const duyenAmCh0 = `<h2 style="text-align:center"><strong>GUIDE: UNDERSTANDING AND RESOLVING UNSEEN ATTACHED BONDS (DUYÊN ÂM)</strong></h2>

<h3><strong>1. WHAT ARE UNSEEN ATTACHED BONDS?</strong></h3>
<p style="text-align:justify">"Duyên Âm" refers to unseen spirits who, in one or more past lifetimes, shared deep romantic, marital, or emotional bonds with us. Due to profound longing, attachment, vows made in past lives ("never to part throughout lifetimes"), or untimely death, these spirits cannot let go of their affection after passing into the spirit realm.</p>
<p style="text-align:justify">Because of their lingering attachment, they remain close to the living person. However, since the spirit realm belongs to negative (yin) energy and the human realm belongs to positive (yang) energy, their close proximity often drains vitality, causing emotional depression, inexplicable loneliness, marital discord, or obstacles in relationships.</p>

<h3><strong>2. HOW TO TRULY RESOLVE THESE BONDS</strong></h3>
<p style="text-align:justify">One should never attempt to "exorcise" or harm these spirits through violent spells, because hatred only breeds greater resentment. Instead, Buddhist compassion teaches us that they are beings who loved us and are trapped in tragic suffering. By showing them genuine gratitude, explaining the impermanence of all things, reciting sūtras, and dedicating merits to help them ascend to Amitābha Buddha's Pure Land, both beings obtain true freedom and peace.</p>`;

const duyenAmCh1 = `<h2 style="text-align:center"><strong>THE LITURGY FOR RESOLVING UNSEEN KARMIC BONDS AND LIBERATING ATTACHED SPIRITS</strong></h2>

<p style="text-align:center"><em>(All recite in unison)</em>:<br/>
Bowing our heads to the Tathāgata,<br/>
Unequaled throughout the Ten Dharma Realms.<br/>
The Dharmakāya ever abides eternally,<br/>
His limitless transformation bodies deliver living beings.</p>

<h3 style="text-align:center">HOMAGE TO THE BUDDHAS</h3>
<p style="text-align:center">Namo Fundamental Teacher Śākyamuni Buddha! (3 bows)<br/>
Namo Guide of the Western Paradise Amitābha Buddha! (1 bow)<br/>
Namo Medicine Master Lapis Lazuli Light King Buddha! (1 bow)<br/>
Namo Great Compassion Avalokiteśvara Bodhisattva! (1 bow)<br/>
Namo Great Vow Kṣitigarbha Bodhisattva! (1 bow)<br/>
Namo Ever-Abiding Triple Gem of the Ten Directions! (1 bow)</p>

<p style="text-align:center"><strong>Mantra for Purifying Speech Karma:</strong><br/>
Oṃ śucite śucite mahā-śucite śuśucite svāhā. (3 times)</p>

<p style="text-align:center"><strong>Mantra for Purifying the Three Karmas:</strong><br/>
Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (3 times)</p>

<h3 style="text-align:center">HEARTFELT WORDS OF RESOLUTION TO THE ATTACHED SPIRIT</h3>
<p style="text-align:justify">"Dear spiritual companion from past lifetimes: In past existences, we shared deep bonds of love and affection. For your care and fidelity, I am profoundly grateful.<br/>
However, life is impermanent. Our former bodies and circumstances have already passed away. The realms of the living and departed are separated, and clinging to past attachments only prolongs your agony in the lower paths.<br/>
Today, before the sacred Triple Gem, I pray that you realize the emptiness of all compounded phenomena. Release all attachments, turn your heart toward the light of Amitābha Buddha, and let us mutually forgive all karmic debts. May you ascend to the Land of Ultimate Bliss, where true joy and liberation never end."</p>

<p style="text-align:center"><strong>Namo Amitābha Buddha (Namo A Di Đà Phật).</strong> (108 times)</p>

<p style="text-align:center"><strong>Pure Land Rebirth Dhāraṇī:</strong><br/>
Namo amitābhāya tathāgatāya tadyathā: amṛtodbhave amṛtasaṃbhave amṛtavikrānte amṛtavikrāntagāmini gagana kīrtikare svāhā. (3 times)</p>

<h3 style="text-align:center">THE THREE REFUGES & DEDICATION</h3>
<p style="text-align:center">I take refuge in the Buddha, Dharma, and Sangha.<br/>
May the merit of this practice liberate my spiritual companion from all attachment.<br/>
May you be reborn in the Western Pure Land and attain supreme enlightenment.</p>`;

fs.writeFileSync('static/offline-data/chapters-en/book_1788620832166_04b4ffd5.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Guide: Understanding Attached Spirits (Read First)', noi_dung: duyenAmCh0 },
  { id: 'chap_2', tieu_de: 'Liturgy for Resolving Unseen Karmic Bonds', noi_dung: duyenAmCh1 }
], null, 2), 'utf8');

fs.writeFileSync('static/offline-data/chapters-en/1788620832166_04b4ffd5.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Guide: Understanding Attached Spirits (Read First)', noi_dung: duyenAmCh0 },
  { id: 'chap_2', tieu_de: 'Liturgy for Resolving Unseen Karmic Bonds', noi_dung: duyenAmCh1 }
], null, 2), 'utf8');

console.log('Successfully updated Duyen Am ritual in chapters-en!');

// 4. UPDATE book_1788617549554_84d86968 (Repentance & Deliverance for Aborted Infants)
const thaiNhiCh0 = `<h2 style="text-align:center"><strong>PURPOSE: WHY SINCERELY REPENT AND PRAY FOR DECEASED AND ABORTED INFANTS?</strong></h2>

<p style="text-align:justify">In modern society, many parents have undergone abortions or lost infants through premature miscarriage. In the spiritual perspective of Buddhism, human life begins at the precise moment of conception when consciousness enters the womb. An aborted infant loses the precious opportunity to obtain a human rebirth and often wanders in deep confusion, cold, and resentment.</p>

<p style="text-align:justify">Because of their vulnerability and attachment to their mother, these infant spirits often stay close to their parents. Without understanding the Dharma, their feelings of rejection and abandonment can manifest as family friction, psychological anguish, or health complications.</p>

<p style="text-align:justify">By holding sincere repentance rituals, giving the infant spirit a Dharma name, offering sincere apologies with tears of remorse, and transferring meritorious deeds to them, parents can help heal the spiritual wound. Relying on Kṣitigarbha Bodhisattva and Amitābha Buddha, these infant souls are guided directly to the Pure Land.</p>`;

const thaiNhiCh1 = `<h2 style="text-align:center"><strong>THE LITURGY OF SINCERE REPENTANCE AND DELIVERANCE FOR DECEASED AND ABORTED INFANTS</strong></h2>

<p style="text-align:center"><em>(All recite in unison)</em>:<br/>
Bowing our heads to the Tathāgata,<br/>
Unequaled throughout the Ten Dharma Realms.<br/>
The Dharmakāya ever abides eternally,<br/>
His limitless transformation bodies deliver living beings.</p>

<h3 style="text-align:center">HOMAGE TO THE BUDDHAS AND BODHISATTVAS</h3>
<p style="text-align:center">Namo Fundamental Teacher Śākyamuni Buddha! (3 bows)<br/>
Namo Guide of the Western Paradise Amitābha Buddha! (1 bow)<br/>
Namo Great Vow Kṣitigarbha Bodhisattva! (3 bows)<br/>
Namo Great Compassion Avalokiteśvara Bodhisattva! (1 bow)<br/>
Namo Ever-Abiding Triple Gem of the Ten Directions! (1 bow)</p>

<h3 style="text-align:center">HEARTFELT SINCERE REPENTANCE BEFORE THE INFANT SPIRIT</h3>
<p style="text-align:justify">"Dear child: Due to our ignorance, selfishness, and difficult circumstances in the past, your father and mother committed the gravest wrong of depriving you of your chance to be born into this world. We know that you suffered immense terror, pain, and abandonment, and for this, we feel unbearable heartbreak and remorse.<br/>
Today, before the Buddhas and the Great Vow Kṣitigarbha Bodhisattva, we prostrate with all our heart to beg for your forgiveness. We bestow upon you the Dharma name <strong>[Dharma Name]</strong>.<br/>
May you not harbor resentment or pain toward us any longer. Take the hand of Kṣitigarbha Bodhisattva and Avalokiteśvara Bodhisattva, step upon the radiant golden lotus, and follow Amitābha Buddha to the Western Pure Land of Ultimate Bliss, where only eternal peace, joy, and beauty exist."</p>

<p style="text-align:center"><strong>Namo Great Vow Kṣitigarbha Bodhisattva.</strong> (108 times)<br/>
<strong>Namo Amitābha Buddha.</strong> (108 times)</p>

<p style="text-align:center"><strong>Pure Land Rebirth Dhāraṇī:</strong><br/>
Namo amitābhāya tathāgatāya tadyathā: amṛtodbhave amṛtasaṃbhave amṛtavikrānte amṛtavikrāntagāmini gagana kīrtikare svāhā. (3 times)</p>

<h3 style="text-align:center">THE THREE REFUGES & DEDICATION</h3>
<p style="text-align:center">I take refuge in the Buddha, Dharma, and Sangha.<br/>
May all merit from this ceremony be dedicated to our child.<br/>
May you leave all pain behind and be peacefully reborn in the Land of Ultimate Bliss.</p>`;

fs.writeFileSync('static/offline-data/chapters-en/book_1788617549554_84d86968.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Purpose & Significance (Read First)', noi_dung: thaiNhiCh0 },
  { id: 'chap_2', tieu_de: 'Liturgy of Sincere Repentance for Aborted Infants', noi_dung: thaiNhiCh1 }
], null, 2), 'utf8');

fs.writeFileSync('static/offline-data/chapters-en/1788617549554_84d86968.json', JSON.stringify([
  { id: 'chap_1', tieu_de: 'Purpose & Significance (Read First)', noi_dung: thaiNhiCh0 },
  { id: 'chap_2', tieu_de: 'Liturgy of Sincere Repentance for Aborted Infants', noi_dung: thaiNhiCh1 }
], null, 2), 'utf8');

console.log('Successfully updated Thai Nhi ritual in chapters-en!');

// 5. UPDATE chapters-en-availability.json
const avPath = 'src/lib/data/chapters-en-availability.json';
const av = JSON.parse(fs.readFileSync(avPath, 'utf8'));
const newIds = [
  'tt_1781615695204',
  'book_1788356229855_48d01c4c',
  '1788356229855_48d01c4c',
  'book_1788620832166_04b4ffd5',
  '1788620832166_04b4ffd5',
  'book_1788617549554_84d86968',
  '1788617549554_84d86968',
  'tt_1783477721256'
];

for (const id of newIds) {
  if (!av.ids.includes(id)) {
    av.ids.push(id);
  }
}
if (av.mtIds) {
  av.mtIds = av.mtIds.filter(id => !newIds.includes(id));
}

fs.writeFileSync(avPath, JSON.stringify(av, null, 2), 'utf8');
console.log('Successfully updated chapters-en-availability.json with all practice rituals!');

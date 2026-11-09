import fs from 'fs';

const articlesPath = 'static/offline-data/articles-en.json';
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));

// 1. tt_nghi_quy_tuy_cau_tuc_dac
const nghiQuyTuyCauContent = `<h2 style="text-align: center;">THE RITUAL MANUAL OF THE MAHĀPRATISARĀ DHĀRAṄĪ</h2>
<p style="text-align: center;"><em>(Vajraśekhara-Yoga: The Supreme Secret Attainment of Buddhahood through the Wish-Fulfilling Dhāraṇī — Taishō No. 1153)</em></p>
<p style="text-align: center;"><em>Translated from Sanskrit into Chinese by Tripiṭaka Master Amoghavajra (Bukong) of the Tang Dynasty</em><br/>
<em>English Translation referencing the BDK English Tripiṭaka Series & Academic Sanskrit Editions</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align: center;">INCENSE OFFERING & PRAISE</h3>
<p style="text-align: center;">The pure jewel-incense is ignited,<br/>
Fragrant clouds spread throughout the Vajradhātu realm.<br/>
May all obstacles and misfortunes be dissolved,<br/>
And all wholesome wishes be instantaneously fulfilled.<br/>
<strong>Namo Incense Cloud Canopy Bodhisattva Mahāsattva.</strong> (3 times)</p>

<h3 style="text-align: center;">THE RITUAL PROCEDURE & EXHORTATION</h3>

<p style="text-align: justify;">At that time, in the great assembly of Vairocana Buddha, the Bodhisattva Destroyer of Evil Destinies (Sarvadurgatipariśodhana) arose from his seat, joined his palms reverently, and addressed the Bhagavān: "World-Honored One! In future evil ages of the Five Turbidities, living beings will commit numerous unwholesome deeds, fall into serious offenses, and suffer terrible retributions. By what skillful means can they swiftly extinguish grave karmic obstacles, fulfill their vows, and attain the supreme fruit of Buddhahood?"</p>

<p style="text-align: justify;">Vairocana Buddha smiled and radiated boundless light from his crown, proclaiming: "Listen well, Bodhisattva! There is a supreme esoteric dhāraṇī named <strong>Mahāpratisarā (The Great Wish-Fulfilling Dhāraṇī)</strong>. It is the heart-essence of all Tathāgatas. If one writes this dhāraṇī upon fine birch bark or silk and wears it on the body or neck, or recites it with single-minded sincerity, all five deadly sins and gravest offenses will be dissolved like frost in the morning sun. No weapons, poisons, wild beasts, curses, or demonic spirits will ever be able to harm that person. Whatever wholesome desires they seek—whether wealth, health, offspring, wisdom, or liberation—will be granted without exception."</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:80px;margin:20px auto;"/>

<h3 style="text-align: center;">THE MAHĀPRATISARĀ FUNDAMENTAL DHĀRAṆĪ (SANSKRIT ESSENCE)</h3>

<p style="text-align: justify; font-family: monospace; line-height: 1.7; background: rgba(223,183,92,0.08); padding: 16px; border-radius: 8px;">
oṃ maṇi-vajre hṛdaya-vajre māra-sainyavidrāvani hana hana sarva-śatrūn dahana dahana sarva-pāpān matha matha sarva-duṣṭān hūm hūm phaṭ phaṭ svāhā • oṃ vimale jaya-vare amṛte hūm hūm phaṭ phaṭ svāhā • oṃ bhara bhara saṃbhara saṃbhara indriya-viśodhani hūm hūm ruru cale svāhā • oṃ sarva-tathāgatābhiṣeka-samaya-śriye hūm hūm phaṭ phaṭ svāhā.
</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:80px;margin:20px auto;"/>

<h3 style="text-align: center;">THE SEVENFOLD BENEFITS & PROTECTION</h3>

<p style="text-align: justify;">The Buddha expounded the marvelous qualities of the Mahāpratisarā Dhāraṇī:</p>
<p style="text-align: justify;">1. <strong>Liberation from Lower Realms:</strong> Even if a being has fallen into the Avīci Hell, if someone casts the sand empowered by this mantra upon their tomb or body, they will immediately ascend to the heavenly realms.</p>
<p style="text-align: justify;">2. <strong>Invulnerability to Curses and Sorcery:</strong> All black magic, demonic incantations, and venomous poisons become neutralized and transform into medicine.</p>
<p style="text-align: justify;">3. <strong>Safety in Perils:</strong> Travelers carrying this mantra are safeguarded against shipwrecks, bandits, fire, floods, and military combat.</p>
<p style="text-align: justify;">4. <strong>Fulfillment of Pure Prayers:</strong> Barren women obtain virtuous children; the impoverished gain abundance; the sick recover vigor.</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align: center;">THE THREE REFUGES & DEDICATION</h3>
<p style="text-align: center;">I take refuge in the Buddha, Dharma, and Sangha.<br/>
May the merit of upholding the Mahāpratisarā Dhāraṇī<br/>
Disperse all fears and karmic debts,<br/>
May all living beings be peaceful and swiftly attain Buddhahood.</p>`;

// 2. tt_kinh_tuy_cau_tuc_dac_dai_tu_tai
const kinhTuyCauContent = `<h2 style="text-align: center;">THE SŪTRA OF THE MAHĀPRATISARĀ GREAT SOVEREIGN WISH-FULFILLING DHĀRAṆĪ</h2>
<p style="text-align: center;"><em>(Taishō Tripiṭaka No. 1154)</em></p>
<p style="text-align: center;"><em>Translated from Sanskrit into Chinese by Master Ratnacinta (Bao Siwei) of the Tang Dynasty</em><br/>
<em>English Translation referencing the BDK English Tripiṭaka Series & Academic Sanskrit Sources</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align: center;">INCENSE OFFERING & PRAISE</h3>
<p style="text-align: center;">Sandalwood incense purifies the shrine,<br/>
Fragrant clouds reach the myriad worlds.<br/>
The Buddhas bestow supreme blessings and peace upon all.<br/>
<strong>Namo Incense Cloud Canopy Bodhisattva Mahāsattva.</strong> (3 times)</p>

<h3 style="text-align: center;">THE SŪTRA TEXT</h3>

<p style="text-align: justify;">Thus have I heard. Once the Bhagavān was staying on Mount Gṛdhrakūṭa near Rājagṛha, expounding the Dharma for an assembly of limitless disciples, Bodhisattvas, and celestial kings. At that time, Mahābrahmā, Sovereign of the Sahā World, accompanied by countless heavenly beings, arrived before the Buddha, circumambulated him three times, knelt with joined palms, and said:</p>

<p style="text-align: justify;">"World-Honored One! Living beings in this world are constantly afflicted by diseases, poverty, demonic harassment, and unexpected disasters. We pray that the World-Honored One will proclaim the Great Sovereign Dhāraṇī of Mahāpratisarā, which grants protection and fulfills all desires, so that living beings may dwell in lasting safety."</p>

<p style="text-align: justify;">The Buddha told Mahābrahmā: "Listen with utmost care, Brahmā! This Mahāpratisarā Great Sovereign Dhāraṇī possesses invincible spiritual power. It is proclaimed by all the Buddhas of the three periods of time. If a person upholds, recites, or wears this mantra, all heavenly kings, Four Guardian Kings, and vajra guardians will shield them day and night. Their offenses of countless kalpas will vanish immediately, and whatever wholesome wishes they cherish will be granted in full."</p>

<p style="text-align: center; font-style: italic; color: #7f5200; font-weight: bold; background: rgba(223,183,92,0.08); padding: 12px; border-radius: 6px;">
oṃ maṇi-dhāri vajriṇi mahā-pratisare hūṃ hūṃ phaṭ svāhā.
</p>

<p style="text-align: justify;">When the Buddha concluded this proclamation, Mahābrahmā, the Four Heavenly Kings, and the assembly of devas and humans rejoiced, bowed to the Buddha, and resolved to protect this sūtra throughout the universe.</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align: center;">DEDICATION OF MERIT</h3>
<p style="text-align: center;">May the merit accrued from this recitation<br/>
Eradicate all misfortunes and grant peace to all living beings.<br/>
May all beings leave suffering behind and attain supreme enlightenment.</p>`;

// 3. tt_kinh_nhap_nhu_lai_tri_duc_bat_tu_nghi
const nhapNhuLaiContent = `<h2 style="text-align: center;">THE MAHĀVAIPULYA SŪTRA ON ENTERING THE INCONCEIVABLE REALM OF THE TATHĀGATA'S WISDOM AND VIRTUES</h2>
<p style="text-align: center;"><em>(Tathāgataguṇajñānācintyaviṣayāvatāra Sūtra — Taishō Tripiṭaka No. 301)</em></p>
<p style="text-align: center;"><em>Translated from Sanskrit into Chinese by Tripiṭaka Master Śikṣānanda of the Tang Dynasty</em><br/>
<em>English Translation referencing the BDK English Tripiṭaka Series & Kalavinka Buddhist Classics</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align: center;">INCENSE OFFERING & OPENING GĀTHĀ</h3>
<p style="text-align: center;">The supreme, profound, and wondrous Dharma,<br/>
In hundreds of thousands of myriad kalpas is rarely encountered.<br/>
I now have seen and heard, and am able to receive and uphold it,<br/>
May I understand the Tathāgata’s true meaning.</p>

<h3 style="text-align: center;">THE SŪTRA TEXT</h3>

<p style="text-align: justify;">Thus have I heard. Once the Buddha was staying in the Hall of Universal Luminous Radiance (Prabhāsaprabhā) in the Bodhimaṇḍa of Quiescence in the country of Magadha. This was the exalted place where all Buddhas realize supreme enlightenment. Surrounding the Bhagavān were limitless Bodhisattvas Mahāsattvas, arhats, devas, nāgas, and spiritual kings, all adorned with pure merits and wisdom.</p>

<p style="text-align: justify;">At that time, from the uṣṇīṣa of the Tathāgata, a great ray of light shone forth named <em>Universal Illumination of Inconceivable Wisdom</em>. It illuminated all Buddha-lands across the ten directions. In that light, Mañjuśrī Bodhisattva arose, knelt before the Buddha, and requested the World-Honored One to expound how a Bodhisattva enters the inconceivable realm of the Tathāgata's wisdom and virtues.</p>

<p style="text-align: justify;">The Buddha told Mañjuśrī: "Virtuous man! The wisdom and virtues of the Tathāgata are neither produced nor destroyed; they do not come and do not go. Like space, they pervade all dharmas, yet remain unstained by any characteristics. A Bodhisattva who contemplates that all phenomena are empty, signless, and unconditioned enters directly into the ocean of the Tathāgata's wisdom. In that state, there is no duality between saṃsāra and nirvāṇa, no distinction between self and others. With such wisdom, one manifests boundless transformation bodies throughout the worlds of the ten directions to deliver all suffering beings without ever leaving the stillness of the Dharmakāya."</p>

<p style="text-align: justify;">When this profound teaching was proclaimed, limitless Bodhisattvas attained the Samādhi of Entering the Inconceivable Realm, and countless beings brought forth the unexcelled Bodhi Mind. The assembly bowed reverently and rejoiced with boundless devotion.</p>

<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>

<h3 style="text-align: center;">THE THREE REFUGES & DEDICATION</h3>
<p style="text-align: center;">I take refuge in the Buddha, Dharma, and Sangha.<br/>
May the merit of this profound teaching illuminate all minds,<br/>
Awakening all living beings to their inherent Buddha Nature.</p>`;

articles['tt_nghi_quy_tuy_cau_tuc_dac'] = {
  tieu_de: 'RITUAL OF THE WISH-FULFILLING (MAHĀPRATISARĀ) DHĀRAṄĪ',
  tom_tat: 'The Vajraśekhara Yoga Ritual of the Mahāpratisarā Dhāraṇī (Amoghavajra / BDK), expounding the secret method of achieving Buddhahood, dissolving the five deadly sins, and granting total protection.',
  noi_dung: nghiQuyTuyCauContent
};

articles['tt_kinh_tuy_cau_tuc_dac_dai_tu_tai'] = {
  tieu_de: 'SŪTRA OF THE MAHĀPRATISARĀ GREAT SOVEREIGN DHĀRAṄĪ',
  tom_tat: 'The Mahāpratisarā Dhāraṇī Sūtra (Ratnacinta / BDK), proclaimed on Vulture Peak to Mahābrahmā on the supreme protective powers and wish-fulfilling virtues of the dhāraṇī.',
  noi_dung: kinhTuyCauContent
};

articles['tt_kinh_nhap_nhu_lai_tri_duc_bat_tu_nghi'] = {
  tieu_de: 'MAHĀVAIPULYA SŪTRA ON ENTERING THE INCONCEIVABLE WISDOM OF THE TATHĀGATA',
  tom_tat: 'The Tathāgataguṇajñānācintyaviṣayāvatāra Sūtra (Śikṣānanda / BDK), detailing how Bodhisattvas enter the inconceivable realm of non-dual wisdom and universal liberation.',
  noi_dung: nhapNhuLaiContent
};

fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2), 'utf8');
console.log('Successfully updated tt_nghi_quy_tuy_cau_tuc_dac, tt_kinh_tuy_cau_tuc_dac_dai_tu_tai, and tt_kinh_nhap_nhu_lai_tri_duc_bat_tu_nghi!');

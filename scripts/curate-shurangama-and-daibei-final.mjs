import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

// --- 1. SHURANGAMA MANTRA CONTENT ---
const shurangamaChap0 = {
  id: 1957,
  bai_viet_id: 'tt_1781275267452',
  so_thu_tu: 0,
  tieu_de: 'Part 1: The Śūraṅgama Mantra Liturgy (Sanskrit Pronunciation)',
  tom_tat: '',
  noi_dung: `{align:center|**SUPREME LITURGY FOR THE PRACTICE OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|**(Standard Sanskrit Pronunciation — Sitātapatroṣṇīṣa Dhāraṇī)**}
{align:center|*(Source: Cattāri Brahmavihārā & Buddhist Text Translation Society / Sagely City of Ten Thousand Buddhas)*}

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

{align:center|**OPENING GĀTHĀ BY VENERABLE ĀNANDA**}
{align:center|O Deep and Wondrous Dhāraṇī, Unmoving Honored One,}
{align:center|Supreme Śūraṅgama appears most rarely in the world,}
{align:center|Melting away false thoughts of mine through countless kalpas past,}
{align:center|Without enduring myriad aeons, Dharma Body's found.}
{align:center|I vow to now attain the fruit and be the Treasure King,}
{align:center|Returning then to rescue beings numerous as Ganges sands.}
{align:center|I offer up this profound mind to dust-mote myriad lands:}
{align:center|This truly is known as repaying the Buddha's boundless grace!}
{align:center|I humbly ask the World Honored One to certify and prove,}
{align:center|Into the turbid, evil realm I vow to enter first;}
{align:center|If there remains a single being who has not Buddhahood gained,}
{align:center|Never shall I at this place enter into Nirvāṇa's rest.}
{align:center|O Great Hero, Great Strength, and Great Compassionate One!}
{align:center|I pray You will examine and remove all subtle doubts,}
{align:center|Causing me soon to ascend unto the Unsurpassed Bodhi High,}
{align:center|And throughout the ten directions sit within the Bodhimanda.}
{align:center|The nature of the void itself may melt and fade away,}
{align:center|Yet this vajra resolve of mine shall never shake nor turn!}

{align:center|**REFUGE AND HOMAGE**}
{align:center|Namo Permanently Abiding Buddhas of the Ten Directions. (Bow)}
{align:center|Namo Permanently Abiding Dharma of the Ten Directions. (Bow)}
{align:center|Namo Permanently Abiding Saṅgha of the Ten Directions. (Bow)}
{align:center|Namo Fundamental Teacher Śākyamuni Buddha. (Bow)}
{align:center|Namo Great Buddha's Crown Supreme Śūraṅgama. (Bow)}
{align:center|Namo Great Compassion Avalokiteśvara Bodhisattva. (Bow)}
{align:center|Namo Diamond Treasury Bodhisattva (Vajragarbha). (Bow)}

{align:justify|*At that time, from the fleshy crown (uṣṇīṣa) atop the World Honored One’s head, there gushed forth a hundred precious beams of light. Amidst this light there burst forth a thousand-petaled jeweled lotus flower, upon which sat a transformed Tathāgata. From atop His head shone ten rays of hundred-jeweled radiance, each ray illuminating everywhere and revealing Vajra-guardians, numerous as the sands of ten Ganges Rivers, brandishing their sacred pestles and filling all of empty space. The great assembly looked up in awe, filled with both fear and devotion, seeking the Buddha’s pity and protection. With one mind they listened as the radiant Tathāgata atop the Buddha’s unseen crown proclaimed the sacred dhāraṇī:*}\n
{align:center|**ŚŪRAṄGAMA HEART MANTRA (TÂM CHÚ LĂNG NGHIÊM)**}
{align:center|**Tadyathā: Oṃ anale viśade vīra-vajra-dhare bandha bandhani vajra-pāṇiḥ phaṭ hūṃ trūṃ phaṭ svāhā.**}\n
{align:center|**ŚŪRAṄGAMA MANTRA — ASSEMBLY OF BUDDHAS AND GODS**}
{align:center|**(Complete Sacred Sanskrit Text)**}\n
{align:center|**FIRST ASSEMBLY (ĐỆ NHẤT HỘI)**}
{align:justify|Namaḥ sarva buddha bodhi-satve-bhyaḥ}
{align:justify|Namaḥ saptānāṃ samyak-saṃbuddha koṭīnāṃ sa-śrāvaka saṃghānāṃ}
{align:justify|Namo loke arhattāṃ}
{align:justify|Namaḥ srotāpannānāṃ}
{align:justify|Namaḥ sakṛdāgāmināṃ}
{align:justify|Namaḥ anāgāmināṃ}
{align:justify|Namo loke samyag-gatānāṃ samyak-prati-pannānāṃ}
{align:justify|Namo devarṣiṇāṃ}
{align:justify|Namaḥ siddha-vidyā-dhāra-ṛṣiṇāṃ, śāpānugraha-samarthānāṃ}
{align:justify|Namo brahmaṇe. Namaḥ indrāya}
{align:justify|Namo bhagavate rudrāya umāpati-sahīyāya}
{align:justify|Namo bhagavate nārāyaṇāya, lakṣmi pañca-mahā-mudrā namas-kṛtāya}
{align:justify|Namo bhagavate mahā-kālāya, tripura-nagara-vidrāpaṇa-karāya, adhi-muktaka śmaśāna-vāsine, mātṛ-gaṇa namas-kṛtāya}
{align:justify|Namo bhagavate tathāgata kulāya}
{align:justify|Namo bhagavate padma kulāya}
{align:justify|Namo bhagavate vajra kulāya}
{align:justify|Namo bhagavate maṇi kulāya}
{align:justify|Namo bhagavate gaja-kulāya}
{align:justify|Namo bhagavate dṛḍha-śūra-sena-pra-haraṇa-rājāya, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Namo bhagavate amitābhāya, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Namo bhagavate akṣobhyāya, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Namo bhagavate bhaiṣajya-guru-vaiḍūrya-prabha-rājāya, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Namo bhagavate saṃpuṣpita-sālendrarājāya, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Namo bhagavate śākyamunaye, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Namo bhagavate ratna-kusuma-ketu-rājāya, tathāgatāya arhate samyak-saṃbuddhāya}
{align:justify|Teṣāṃ namas-kṛtvā imāṃ bhagavata stathāgatoṣṇīṣaṃ,}
{align:justify|Sitātapatraṃ namāparājitaṃ pratyaṅgirāṃ}
{align:justify|Sarva bhūta-graha nigraha-karaṇīṃ}
{align:justify|Para vidyā cchedanīṃ}
{align:justify|Akālaṃ-mṛtyu pari-trāṇa-karīṃ}
{align:justify|Sarva bandhana mokṣaṇīṃ}
{align:justify|Sarva duṣṭa duḥ-svapna nivāraṇīṃ}
{align:justify|Caturaśītīnāṃ graha sahasrāṇāṃ vi-dhvaṃsana-karīṃ}
{align:justify|Aṣṭā-viṃśatināṃ nakṣatrāṇāṃ vi-dhvaṃsana-karīṃ}
{align:justify|Sarva śatrū nivāraṇīṃ}
{align:justify|Ghoraṃ duḥ-svapnānāṃ ca nāśanīṃ}
{align:justify|Viṣa śastra agni uttaraṇīṃ}
{align:justify|Aparājitaṃ mahā-ghorāṃ, mahā-balāṃ mahā-caṇḍāṃ mahā-dīptāṃ mahā-tejaṃ}
{align:justify|Mahā-śvetāṃ mahā-jvalāṃ mahā-balā pāṇḍara-vāsinī}
{align:justify|Ārya-tārā bhṛkuṭīṃ caiva vijaya vajra-māleti vi-śrutāṃ}
{align:justify|Padmaṅkaṃ vajra-jihvā ca mālā-caivāparājitā}
{align:justify|Vajrā daṇḍīṃ viśālā ca śānta vaideva-pūjitāṃ}
{align:justify|Saumya-rūpaṃ mahā-śvetā}
{align:justify|Ārya-tārā mahā-balā aparā vajra śaṅkalā caiva}
{align:justify|Vajra kaumārī kulan-dharī}
{align:justify|Vajra hastā ca mahā-vidyā kāñcana mālikā}
{align:justify|Kusumbhā ratna caiva vairocanā kulāthadāṃ uṣṇīṣa}
{align:justify|Vi-jṛmbha-mānā ca savajra kanaka prabha locanā}
{align:justify|Vajrā tuṇḍī ca śvetā ca kamalākṣī śaśī-prabhā}
{align:justify|Ityete mudrā gaṇāḥ, sarve rakṣaṃ kurvantu mama sarva satvānāṃ ca.}\n
{align:center|**SECOND ASSEMBLY (ĐỆ NHỊ HỘI)**}
{align:justify|Oṃ ṛṣi-gaṇa praśāstaya sarva tathāgatoṣṇīṣāya hūṃ trūṃ}
{align:justify|Jambhana-kara hūṃ trūṃ}
{align:justify|Stambhana-kara hūṃ trūṃ}
{align:justify|Mohana-kara hūṃ trūṃ}
{align:justify|Mathana-kara hūṃ trūṃ}
{align:justify|Para-vidyā saṃ-bhakṣaṇa-kara hūṃ trūṃ}
{align:justify|Sarva duṣṭānāṃ stambhana-kara hūṃ trūṃ}
{align:justify|Sarva yakṣa rākṣasa grahāṇāṃ, vi-dhvaṃsana-kara hūṃ trūṃ}
{align:justify|Caturaśītīnāṃ graha sahasrāṇāṃ vi-dhvaṃsana-kara hūṃ trūṃ}
{align:justify|Aṣṭā-viṃśatīnāṃ nakṣatrānāṃ pra-sādana-kara hūṃ trūṃ}
{align:justify|Aṣṭānāṃ mahā-grahāṇāṃ utsādana-kara hūṃ trūṃ}
{align:justify|Rakṣa rakṣa māṃ!}
{align:justify|Bhagavan stathāgatoṣṇīṣa sitātapatra mahā vajroṣṇīṣa}
{align:justify|Mahā pratyaṅgire mahā sahasra-bhuje sahasra-śīrṣe}
{align:justify|Koṭī-śata sahasra-netre, abhedya jvalitā-taṭaka}
{align:justify|Mahā-vajrodāra tṛ-bhuvana maṇḍala}
{align:justify|Oṃ svastir bhavatu māṃ mama!}\n
{align:center|**THIRD ASSEMBLY (ĐỆ TAM HỘI)**}
{align:justify|Rāja-bhayā cora-bhayā udaka-bhayā agni-bhayā}
{align:justify|Viṣa-bhayā śastra-bhayā para-cakra-bhayā du-bhikṣa-bhayā}
{align:justify|Aśani-bhayā akāla-mṛtyu-bhayā dharaṇī-bhūmi-kampā-bhayā ulkā-pāta-bhayā}
{align:justify|Rāja-daṇḍa-bhayā suparṇi-bhayā nāga-bhayā vidyut-bhayā}
{align:justify|Deva-grahā nāga-grahā yakṣa-grahā rākṣasa-grahā preta-grahā}
{align:justify|Piśāca-grahā bhūta-grahā kumbhaṇḍa-grahā pūtana-grahā}
{align:justify|Kaṭa-pūtana-grahā skanda-grahā apasmāra-grahā utmāda-grahā}
{align:justify|Cchāya-grahā revati-grahā jamika-grahā kaṇṭha-kamini-grahā}
{align:justify|Ojāhārinyā garbhāhārinyā jātāhārinyā jīvitāhārinyā}
{align:justify|Rudhirāhārinyā vasāhārinyā māṃsāhārinyā medāhārinyā}
{align:justify|Majjāhārinyā vāntāhārinyā asucyāhārinyā ciccāhārinyā, teṣāṃ sarveṣāṃ}
{align:justify|Sarva grahāṇāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Pari-brajāka kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Ḍāka-ḍākinī kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Mahā-paśupati rudra kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Nārāyaṇa pañca mahā mudrā kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Tatva garuḍa sahīyāya kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Mahā-kāla mātṛgaṇa sahīyāya kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Kāpālika kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Jayakarā madhukara sarvārtha-sādhaka kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Catur-bhaginī bhrātṛ-pañcama sahīyāya kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Bhṛṅgi-riṭika nandi-keśvara gaṇapati sahīya kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Nagna-śramaṇa kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Arhanta kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Vīta-rāga kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Vajra-pāṇi guhyakādhipati kṛtāṃ vidyāṃ cchinda-yāmi kīla-yāmi!}
{align:justify|Rakṣa rakṣa māṃ!}\n
{align:center|**FOURTH ASSEMBLY (ĐỆ TỨ HỘI)**}
{align:justify|Bhagavata stathāgatoṣṇīṣaṃ sitātapatraṃ namo-stute!}
{align:justify|Asitānalārka prabhā-sphuṭa vikasitātapatre!}
{align:justify|Jva jvala dhaka-khaka vidhaka-vidhaka dara dara vidara vidara, cchinda cchinda bhinda bhinda, hūṃ hūṃ phaṭ! phaṭ! svāhā!}
{align:justify|Hehe phaṭ. Amogha phaṭ. Apratihata phaṭ. Vara-prada phaṭ. Asura vidrāpaka phaṭ.}
{align:justify|Sarva deve-bhyaḥ phaṭ. Sarva nāge-bhyaḥ phaṭ. Sarva yakṣe-bhyaḥ phaṭ. Sarva rākṣase-bhyaḥ phaṭ.}
{align:justify|Sarva garuḍe-bhyaḥ phaṭ. Sarva gāndharve-bhyaḥ phaṭ. Sarva asure-bhyaḥ phaṭ. Sarva kindare-bhyaḥ phaṭ.}
{align:justify|Sarva mahorage-bhyaḥ phaṭ. Sarva manuṣe-bhyaḥ phaṭ. Sarva amanuṣe-bhyaḥ phaṭ. Sarva bhūte-bhyaḥ phaṭ.}
{align:justify|Sarva piśāce-bhyaḥ phaṭ. Sarva kumbhaṇḍe-bhyaḥ phaṭ. Sarva pūtane-bhyaḥ phaṭ. Sarva kaṭa-pūtane-bhyaḥ phaṭ.}
{align:justify|Sarva dur-laṅghite-bhyaḥ phaṭ. Sarva duṣ-prekṣite-bhyaḥ phaṭ. Sarva jvare-bhyaḥ phaṭ. Sarva apasmāre-bhyaḥ phaṭ.}
{align:justify|Sarva śramaṇe-bhyaḥ phaṭ. Sarva tirthike-bhyaḥ phaṭ. Sarva utmāde-bhyaḥ phaṭ. Sarva vidyā-rājācārye-bhyaḥ phaṭ.}
{align:justify|Jayakarā madhukara sarvārtha-sādhake-bhyaḥ phaṭ.}
{align:justify|Sarva vidyācārye-bhyaḥ phaṭ. Catur bhaginī-bhyaḥ phaṭ.}
{align:justify|Vajra kaumārī kulan-dharī mahā-vidyā-rājebhyaḥ phaṭ.}
{align:justify|Mahā-pratyaṅgire-bhyaḥ phaṭ. Vajra śaṅkalāya phaṭ. Mahā-pratyaṅgira-rājāya phaṭ.}
{align:justify|Mahā-kālāya mahā-mātṛ-gaṇa namas-kṛtāya phaṭ.}
{align:justify|Vaiṣṇavīye phaṭ. Brahmaṇīye phaṭ. Agnīye phaṭ. Mahā-kālīye phaṭ. Kāla-daṇḍīye phaṭ.}
{align:justify|Indrīye phaṭ. Raudrīye phaṭ. Cāmuṇḍīye phaṭ. Kāla-rātrīye phaṭ. Kāpālīye phaṭ.}
{align:justify|Adhi-muktaka śmaśāna vāsinīye phaṭ.}
{align:justify|Yeke-citta satva mama!}\n
{align:center|**FIFTH ASSEMBLY (ĐỆ NGŨ HỘI)**}
{align:justify|Duṣṭa-cittā pāpa-cittā raudra-cittā vi-dveṣa amaitra-cittā}
{align:justify|Utpāda-yanti kīla-yanti mantra-yanti japanti juhvanti}
{align:justify|Ojāhārā garbhāhārā rudhirāhārā vasāhārā, majjāhārā jātāhārā jīvitāhārā malyāhārā}
{align:justify|Gandhāhārā puṣpāhārā phalāhārā sasyāhārā, pāpa-cittā duṣṭa-cittā raudra-cittā}
{align:justify|Yakṣa-graha rākṣasa-graha preta-graha piśāca-graha, bhūta-graha kumbhaṇḍa-graha skanda-graha utmāda-graha}
{align:justify|Cchāya-graha apasmāra-graha ḍāka-ḍākinī-graha, revati-graha jamika-graha śakuni-graha mantra-nandika-graha, lamvika-graha hanu kaṇṭha-pāṇi-graha}
{align:justify|Jvara ekāhikā dvaitīyakā straitīyakā catur-thakā. Nitya-jvarā viṣama-jvarā vatikā paittikā, śleṣmikā san-nipatika sarva-jvarā}
{align:justify|Śirortti ardhavabhedaka arocaka, akṣi-rogaṃ nasa-rogaṃ mukha-rogaṃ hṛd-rogaṃ gala-grahaṃ}
{align:justify|Karṇṇa-śūlaṃ danta-śūlaṃ hṛdaya-śūlaṃ marma-śūlaṃ, pārśva-śūlaṃ pṛṣṭha-śūlaṃ udara-śūlaṃ kaṇṭī-śūlaṃ}
{align:justify|Vasti-śūlaṃ ūru-śūlaṃ jāṅgha-śūlaṃ hasta-śūlaṃ, pāda-śūlaṃ sarvāṅga-pratyaṅga-śūlaṃ}
{align:justify|Bhūta vetāḍa ḍāka-ḍākinī jvara}
{align:justify|Dadru kāṇḍu kiṭibhalotavai sarpa-lohāliṅga, śūṣatra sagara viśa-yoga, agni udaka mara vaira kāntāra akālaṃ-mṛtyu}
{align:justify|Traibuka trai-laṭaka vṛścika sarpa nakula, siṃgha vyāghra ṛkṣa tarakṣa mṛga, sva-para jīva teṣāṃ sarveṣāṃ}
{align:justify|Ṣitātapatraṃ mahā-vajroṣṇīṣaṃ mahā-pratyaṅgiraṃ}
{align:justify|Yāvad-dvā-daśa yojanābhyantareṇa: Sīmā-bandhaṃ karomi! Diśā-bandhaṃ karomi! Pāra-vidyā-bandhaṃ karomi! Tejo-bandhaṃ karomi! Hasta-bandhaṃ karomi! Pāda-bandhaṃ karomi! Sarvāṅga-pratyaṅga-bandhaṃ karomi!}
{align:justify|**Tadyathā: Oṃ anale anale viśade viśade vīra vajra-dhare, bandha bandhani, vajra-pāṇi phaṭ! hūṃ trūṃ phaṭ! svāhā.**}
{align:justify|**Namaḥ stathāgatāya sugatāya arhate samyak-saṃbuddhāya, siddhyantu mantra-padā svāhā.**}\n
{align:center|**THE FIVE GREAT HEART MANTRAS (NGŨ ĐẠI TÂM CHÚ)**}
{align:center|Cchedanīṃ Akāla-mṛtyu Pari-trāṇa-karīṃ. (Recite 3 to 108 times)}\n
{align:center|**MANTRA FOR RECTIFYING PRONUNCIATION ERRORS**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}\n
{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}\n
{align:center|**DEDICATION OF MERIT**}
{align:center|Namo Supreme Buddha Crown Radiance Mahā Sitātapatra Dhāraṇī. (3 times, 1 bow)}
{align:center|Namo Eighty-Four Thousand Nayutas of Ganges Sands of Vajragarbha Bodhisattvas Protecting the Śūraṅgama Dhāraṇī. (3 times, 1 bow)}
{align:center|Namo Assembly of Honorable Dharma Protector Bodhisattvas. (3 times, 1 bow)}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Supreme Śūraṅgama Mantra, dedicating the merit first universally to all sentient beings throughout empty space and the Dharma Realm; and second, dedicating this merit to my parents, family, loved ones, and all karmic creditors across past and present lives. May by virtue of this merit, everyone enjoy peace in body and mind, be liberated from all sicknesses and suffering, and see all wholesome aspirations fulfilled; may our karmic hindrances swiftly dissolve, wisdom expand, and may we attain Unsurpassed Supreme Bodhi.}
{align:justify|To the Buddha I take refuge, vowing that all living beings understand the Great Way profoundly and bring forth the Bodhi mind. (Prostrate)}
{align:justify|To the Dharma I take refuge, vowing that all living beings deeply enter the Sūtra Treasury and attain wisdom as vast as the sea. (Prostrate)}
{align:justify|To the Saṅgha I take refuge, vowing that all living beings unite the great assembly, all without obstruction. (Prostrate)}`
};

const shurangamaChap1 = {
  id: 1958,
  bai_viet_id: 'tt_1781275267452',
  so_thu_tu: 1,
  tieu_de: 'Part 2: The Śūraṅgama Mantra Liturgy (Traditional East-Asian Pronunciation)',
  tom_tat: '',
  noi_dung: `{align:center|**SUPREME LITURGY FOR THE PRACTICE OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|**(Traditional East-Asian / Sino-Vietnamese Chanting)**}
{align:center|*(This traditional phonetic version preserves the rhythmic East-Asian pronunciation used widely in temples across Vietnam, China, and Taiwan, accompanied by full English liturgical prayers.)*}

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

{align:center|**OPENING GĀTHĀ BY VENERABLE ĀNANDA**}
{align:center|Diệu trạm tổng trì bất động tôn}
{align:center|Thủ lăng nghiêm vương thế hi hữu}
{align:center|Tiêu ngã ức kiếp điên đảo tưởng}
{align:center|Bất lịch tăng kỳ hoạch pháp thân}
{align:center|Nguyện kim đắc quả thành bảo vương}
{align:center|Hườn độ như thị hằng sa chúng}
{align:center|Tương thử thâm tâm phụng trần sát}
{align:center|Thị tắc danh vị báo phật ân:}
{align:center|Phục thỉnh thế tôn vị chứng minh}
{align:center|Ngũ trược ác thế thệ tiên nhập}
{align:center|Như nhứt chúng sanh vị thành phật}
{align:center|Chung bất ư thử thủ nê hoàn}
{align:center|Đại hùng đại lực đại từ bi}
{align:center|Hi cánh thẩm trừ vi tế hoặc}
{align:center|Linh ngã tảo đăng vô thượng giác}
{align:center|Ư thập phương giới tọa đạo tràng}
{align:center|Thuấn nhã đa tánh khả tiêu vong}
{align:center|Thước ca ra tâm vô động chuyển!}

{align:center|**REFUGE AND HOMAGE**}
{align:center|Nam mô thường trụ thập phương phật (Bow)}
{align:center|Nam mô thường trụ thập phương pháp (Bow)}
{align:center|Nam mô thường trụ thập phương tăng (Bow)}
{align:center|Nam mô Thích Ca Mâu Ni Phật (Bow)}
{align:center|Nam mô Phật đảnh Thủ Lăng Nghiêm (Bow)}
{align:center|Nam mô Quán Thế Âm Bồ Tát (Bow)}
{align:center|Nam mô Kim Cang Tạng Bồ Tát (Bow)}

{align:center|**FIRST ASSEMBLY (ĐỆ NHẤT HỘI)**}
{align:justify|01. Nam mô tát đát tha. 02. Tô già đa da. 03. A ra ha đế. 04. Tam miệu tam bồ đà tỏa. 05. Nam mô tát đát tha. 06. Phật đà cu tri sắc ni sam. 07. Nam mô tát bà. 08. Bột đà bột địa. 09. Tát đa bệ tệ. 10. Nam mô tát đa nẩm. 11. Tam miệu tam bồ đà. 12. Cu tri nẩm. 13. Ta xá ra bà ca. 14. Tăng già nẩm. 15. Nam mô lô kê A La Hán đa nẩm. 16. Nam mô tô lô đa ba na nẩm. 17. Nam mô ta yết rị đà dà di nẩm. 18. Nam mô lô kê tam miệu dà đa nẩm. 19. Tam miệu dà ba ra. 20. Ðể ba đa na nẩm. 21. Nam mô đề bà ly sắc nỏa. 22. Nam mô tất đà da. 23. Tỳ địa da. 24. Ðà ra ly sắc nỏa. 25. Xá ba noa. 26. Yết ra ha. 27. Ta ha ta ra ma tha nẩm. 28. Nam mô bạt ra ha ma ni. 29. Nam mô nhơn dà ra da. 30. Nam mô bà dà bà đế. 31. Lô đà ra da. 32. Ô ma bát đế. 33. Ta hê dạ da. 34. Nam mô bà dà bà đế. 35. Na ra dả. 36. Noa da. 37. Bàn dá ma ha tam mộ đà da. 38. Nam mô tất yết rị đa da. 39. Nam mô bà dà bà đế. 40. Ma ha ca ra da. 41. Ðịa rị bác lặc na. 42. Dà ra tỳ đà ra. 43. Ba noa ca ra da. 44. A địa mục đế. 45. Thi ma xá na nê. 46. Bà tất nê. 47. Ma đát rị dà noa. 48. Nam mô tất yết rị đa da. 49. Nam mô bà dà bà đế. 50. Ða tha dà đa câu ra da. 51. Nam mô bát đầu ma câu ra da. 52. Nam mô bạc xà ra câu ra da. 53. Nam mô ma ni câu ra da. 54. Nam mô dà xà câu ra da. 55. Nam mô bà dà bà đế. 56. Ðế rị trà. 57. Du ra tây na. 58. Ba ra ha ra noa ra xà da. 59. Ða tha dà đa da. 60. Nam mô bà dà bà đế. 61. Nam mô A di đa bà da. 62. Ða tha dà đa da. 63. A ra ha đế. 64. Tam miệu tam bồ đà da. 65. Nam mô bà dà bà đế. 66. A sô bệ da. 67. Ða tha dà đa da. 68. A ra ha đế. 69. Tam miệu tam bồ đà da. 70. Nam mô bà dà bà đế. 71. Bệ xa xà da. 72. Câu lô phệ trụ rị da. 73. Bác ra bà ra xà da. 74. Ða tha dà đa da. 75. Nam mô bà dà bà đế. 76. Tam bổ sư bí đa. 77. Tát lân nại ra lặc xà da. 78. Ða tha dà đa da. 79. A ra ha đế. 80. Tam miệu tam bồ đà da. 81. Nam mô bà dà bà đế. 82. Xá kê dã mẫu na duệ. 83. Ða tha dà đa da. 84. A ra ha đế. 85. Tam miệu tam bồ đà da. 86. Nam mô bà dà bà đế. 87. Lặc đát na kê đô ra xà da. 88. Ða tha dà đa da. 89. A ra ha đế. 90. Tam miệu tam bồ đà da. 91. Ðế biều. 92. Nam mô tát yết rị đa. 93. Ế đàm bà dà bà đa. 94. Tát đác tha dà đô sắc ni sam. 95. Tát đác đa bát đác lam. 96. Nam mô a bà ra thị đam. 97. Bác ra đế. 98. Dương kỳ ra. 99. Tát ra bà. 100. Bộ đa yết ra ha. 101. Ni yết ra ha. 102. Yết ca ra ha ni. 103. Bạt ra bí địa da. 104. Sất đà nể. 105. A ca ra. 106. Mật rị trụ. 107. Bát rị đác ra da. 108. Nảnh yết rị. 109. Tát ra bà. 110. Bàn đà na. 111. Mục xoa ni. 112. Tát ra bà. 113. Ðột sắc tra. 114. Ðột tất phạp. 115. Bát na nể. 116. Phạt ra ni. 117. Giả đô ra. 118. Thất đế nẩm. 119. Yết ra ha. 120. Ta ha tát ra nhã xà. 121. Tỳ đa băng ta na yết rị. 122. A sắc tra băng xá đế nẩm. 123. Na xoa sát đác ra nhã xà. 124. Ba ra tát đà na yết rị. 125. A sắc tra nẩm. 126. Ma ha yết ra ha nhã xà. 127. Tỳ đa băng tát na yết rị. 128. Tát bà xá đô lô. 129. Nể bà ra nhã xà. 130. Hô lam đột tất phạp. 131. Nan giá na xá ni. 132. Bí sa xá. 133. Tất đác ra. 134. A kiết ni. 135. Ô đà ca ra nhã xà. 136. A bát ra thị đa câu ra. 137. Ma ha bác ra chiến trì. 138. Ma ha điệp đa. 139. Ma ha đế xà. 140. Ma ha thuế đa xà bà ra. 141. Ma ha bạt ra bàn đà ra. 142. Bà tất nể. 143. A rị da đa ra. 144. Tỳ rị câu tri. 145. Thệ bà tỳ xà da. 146. Bạt xà ra ma lễ để. 147. Tỳ xá lô đa. 148. Bột đằng dõng ca. 149. Bạt xà ra chế hắt na a giá. 150. Ma ra chế bà. 151. Bát ra chất đa. 152. Bạt xà ra thiện trì. 153. Tỳ xá ra giá. 154. Phiến đa xá. 155. Bệ để bà. 156. Bổ thị đa. 157. Tô ma lô ba. 158. Ma ha thuế đa. 159. A rị da đa ra. 160. Ma ha bà ra a bác ra. 161. Bạt xà ra thương yết ra chế bà. 162. Bạt xà ra câu ma rị. 163. Câu lam đà rị. 164. Bạt xà ra hắt tát đa giá. 165. Tỳ địa da. 166. Kiền dá na. 167. Ma rị ca. 168. Khuất tô mẫu. 169. Bà yết ra đá na. 170. Bệ lô giá na. 171. Câu rị da. 172. Dạ ra thố. 173. Sắc ni sam. 174. Tỳ chiếc lam bà ma ni giá. 175. Bạt xà ra ca na ca ba ra bà. 176. Lồ xà na. 177. Bạt xà ra đốn trỉ giá. 178. Thuế đa giá. 179. Ca ma ra. 180. Sát sa thi. 181. Ba ra bà. 182. Ế đế di đế. 183. Mẫu đà ra. 184. Yết noa. 185. Ta bệ ra sám. 186. Quật phạm đô. 187. Ấn thố na mạ mạ tỏa.}\n
{align:center|**SECOND ASSEMBLY (ĐỆ NHỊ HỘI)**}
{align:justify|188. Ô Hồng. 189. Rị sắc yết noa. 190. Bác lặc xá tất đa. 191. Tát đác tha. 192. Già đô sắc ni sam. 193. Hổ hồng đô lô ung. 194. Chiêm bà na. 195. Hổ hồng đô lô ung. 196. Tất đam bà na. 197. Hổ hồng đô lô ung. 198. Ba ra sắc địa da. 199. Tam bác xoa. 200. Noa yết ra. 201. Hổ hồng đô lô ung. 202. Tát bà dược xoa. 203. Hắt ra sát ta. 204. Yết ra ha nhã xà. 205. Tỳ đằng băng tát na yết ra. 206. Hổ hồng đô lô ung. 207. Giả đô ra. 208. Thi để nẩm. 209. Yết ra ha. 210. Ta ha tát ra nẩm. 211. Tỳ đằng băng tát na ra. 212. Hổ hồng đô lô ung. 213. Ra xoa. 214. Bà già phạm. 215. Tát đác tha. 216. Già đô sắc ni sam. 217. Ba ra điểm. 218. Xà kiết rị. 219. Ma ha ta ha tát ra. 220. Bột thọ ta ha tát ra. 221. Thất rị sa. 222. Câu tri ta ha tát nê. 223. Ðế lệ a tệ đề thị bà rị đa. 224. Tra tra anh ca. 225. Ma ha bạt xà lô đà ra. 226. Ðế rị bồ bà na. 227. Man trà ra. 228. Ô hồng. 229. Ta tất đế. 230. Bạt bà đô. 231. Mạ mạ. 232. Ấn thố na mạ mạ tỏa.}\n
{align:center|**THIRD ASSEMBLY (ĐỆ TAM HỘI)**}
{align:justify|233. Ra xà bà dạ. 234. Chủ ra bạt dạ. 235. A kỳ ni bà dạ. 236. Ô đà ca bà dạ. 237. Tỳ xa bà dạ. 238. Xá tát đa ra bà dạ. 239. Bà ra chước yết ra bà dạ. 240. Ðột sắc xoa bà dạ. 241. A xá nể bà dạ. 242. A ca ra. 243. Mật rị trụ bà dạ. 244. Ðà ra ni bộ di kiếm. 245. Ba già ba đà bà dạ. 246. Ô ra ca bà đa bà dạ. 247. Lặc xà đàn trà bà dạ. 248. Na dà bà dạ. 249. Tỳ điều đát bà dạ. 250. Tô ba ra noa bà dạ. 251. Dược xoa yết ra ha. 252. Ra xoa tư yết ra ha. 253. Tất rị đa yết ra ha. 254. Tỳ xá giá yết ra ha. 255. Bộ đa yết ra ha. 256. Cưu bàn trà yết ra ha. 257. Bổ đơn na yết ra ha. 258. Ca tra bổ đơn na yết ra ha. 259. Tất kiền độ yết ra ha. 260. A bá tất ma ra yết ra ha. 261. Ô đàn ma đà yết ra ha. 262. Xa dạ yết ra ha. 263. Hê rị bà đế yết ra ha. 264. Xả đa ha rị nẩm. 265. Yết bà ha rị nẩm. 266. Lô địa ra ha rị nẩm. 267. Mang ta ha rị nẩm. 268. Mê đà ha rị nẩm. 269. Ma xà ha rị nẩm. 270. Xà đa ha rị nữ. 271. Thị tỷ đa ha rị nẩm. 272. Tỳ đa ha rị nẩm. 273. Bà đa ha rị nẩm. 274. A du giá ha rị nữ. 275. Chất đa ha rị nữ. 276. Ðế sam tát bệ sam. 277. Tát bà yết ra ha nẩm. 278. Tỳ đà dạ xà. 279. Sân đà dạ di. 280. Kê ra dạ di. 281. Ba rị bạt ra giả ca. 282. Hất rị đởm. 283. Tỳ đà dạ xà. 284. Sân đà dạ di. 285. Kê ra dạ di. 286. Trà diễn ni. 287. Hất rị đởm. 288. Tỳ đà dạ xà. 289. Sân đà dạ di. 290. Kê ra dạ di. 291. Ma ha bát du bát đác dạ. 292. Lô đà ra. 293. Hất rị đởm. 294. Tỳ đà dạ xà. 295. Sân đà dạ di. 296. Kê ra dạ di. 297. Na ra dạ noa. 298. Hất rị đởm. 299. Tỳ đà dạ xà. 300. Sân đà dạ di. 301. Kê ra dạ di. 302. Ðát đỏa dà lô trà tây. 303. Hất rị đởm. 304. Tỳ đà dạ xà. 305. Sân đà dạ di. 306. Kê ra dạ di. 307. Ma ha ca ra. 308. Ma đác rị già noa. 309. Hất rị đởm. 310. Tỳ đà dạ xà. 311. Sân đà dạ di. 312. Kê ra dạ di. 313. Ca ba rị ca. 314. Hất rị đởm. 315. Tỳ đà dạ xà. 316. Sân đà dạ di. 317. Kê ra dạ di. 318. Xà dạ yết ra. 319. Ma độ yết ra. 320. Tát bà ra tha ta đạt na. 321. Hất rị đởm. 322. Tỳ đà dạ xà. 323. Sân đà dạ di. 324. Kê ra dạ di. 325. Giả đốt ra. 326. Bà kỳ nể. 327. Hất rị đởm. 328. Tỳ đà dạ xà. 329. Sân đà dạ di. 330. Kê ra dạ di. 331. Bính kỳ rị xà. 332. Tiền đà xoa noa. 333. Bạt đà đa kỳ. 334. Tát dạ noa. 335. Hất rị đởm. 336. Tỳ đà dạ xà. 337. Sân đà dạ di. 338. Kê ra dạ di. 339. Noa na ngác xoa na. 340. Hất rị đởm. 341. Tỳ đà dạ xà. 342. Sân đà dạ di. 343. Kê ra dạ di. 344. A la hán. 345. Hất rị đởm. 346. Tỳ đà dạ xà. 347. Sân đà dạ di. 348. Kê ra dạ di. 349. Tỳ đa ra dà. 350. Hất rị đởm. 351. Tỳ đà dạ xà. 352. Sân đà dạ di. 353. Kê ra dạ di. 354. Bạt xà ra ba nể. 355. Câu hê dạ, câu hê dạ. 356. Ca địa bát đế. 357. Hất rị đởm. 358. Tỳ đà dạ xà. 359. Sân đà dạ di. 360. Kê ra dạ di. 361. Ra xoa võng. 362. Bà dà phạm. 363. Ấn thố na mạ mạ tỏa.}\n
{align:center|**FOURTH ASSEMBLY (ĐỆ TỨ HỘI)**}
{align:justify|364. Bà dà phạm. 365. Tát đác đa bát đác ra. 366. Nam mô thinh tu đế. 367. A tất đa na ra lặc ca. 368. Ba ra bà. 369. Tất phổ tra. 370. Tỳ ca tát đác đa bát đế lệ. 371. Thập phật ra, thập phật ra. 372. Ðà ra đà ra. 373. Tần đà ra, tần đà ra, sân đà sân đà. 374. Hổ hồng, hổ hồng. 375. Phấn tra, phấn tra, phấn tra, phấn tra, phấn tra. 376. Ta ha. 377. Hê hê phấn. 378. A mâu ca da phấn. 379. A ba ra đề ha đa phấn. 380. Bà ra ba ra đà phấn. 381. A tố ra. 382. Tỳ đà ra. 383. Ba ca phấn. 384. Tát bà đề bệ tệ phấn. 385. Tát bà na dà tệ phấn. 386. Tát bà dược xoa tệ phấn. 387. Tát bà kiền thát bà tệ phấn. 388. Tát bà bổ đơn na tệ phấn. 389. Ca tra bổ đơn na tệ phấn. 390. Tát bà đột lang chỉ đế tệ phấn. 391. Tát bà đột sáp tỷ lê. 392. Cật sắc đế tệ phấn. 393. Tát bà thập bà lê tệ phấn. 394. Tát bà a bá tất ma lê tệ phấn. 395. Tát bà xá ra bà noa tệ phấn. 396. Tát bà địa đế kê tệ phấn. 397. Tát bà đát ma đà kê tệ phấn. 398. Tát bà tỳ đà da. 399. Ra thệ giá lê tệ phấn. 400. Xà dạ yết ra. 401. Ma độ yết ra. 402. Tát bà ra tha ta đà kê tệ phấn. 403. Tỳ địa dạ. 404. Giá lê tệ phấn. 405. Giả đô ra. 406. Phược kỳ nể tệ phấn. 407. Bạt xà ra. 408. Câu ma rị. 409. Câu lăng đà rị. 410. Tỳ đà dạ. 411. La thệ tệ phấn. 412. Ma ha ba ra đinh dương. 413. Xoa kỳ rị tệ phấn. 414. Bạt xà ra thương yết ra da. 415. Ba ra trượng kỳ ra xà da phấn. 416. Ma ha ca ra da. 417. Ma ha mạt đát rị ca noa. 418. Nam mô ta yết rị đa da phấn. 419. Tỷ sắc noa bệ tệ phấn. 420. Bột ra ha mâu ni duệ phấn. 421. A kỳ ni duệ phấn. 422. Ma ha yết rị duệ phấn. 423. Yết ra đàn trì duệ phấn. 424. Miệt đát rị duệ phấn. 425. Lao đát rị duệ phấn. 426. Giá văn trà duệ phấn. 427. Yết la la đát rị duệ phấn. 428. Ca bát rị duệ phấn. 429. A địa mục chất đa. 430. Thi ma xá na. 431. Bà tư nể tệ phấn. 432. Diễn kiết chất. 433. Tát đỏa bà tỏa. 434. Mạ mạ ấn thố na mạ mạ tỏa.}\n
{align:center|**FIFTH ASSEMBLY (ĐỆ NGŨ HỘI)**}
{align:justify|435. Ðột sắc tra tâm. 436. A mạt đát rị tâm. 437. Ô xà ha ra. 438. Dà bà ha ra. 439. Lô địa ra ha ra. 440. Bà ta ha ra. 441. Ma xà ha ra. 442. Xà đa ha ra. 443. Thị tỷ đa ha ra. 444. Bạt lược dạ ha ra. 445. Càn đà ha ra. 446. Bố sử ba ha ra. 447. Phả ra ha ra. 448. Bà tả ha ra. 449. Bát ba tâm. 450. Ðột sắc tra tâm. 451. Lao đà ra tâm. 452. Dược xoa yết ra ha. 453. Ra sát ta yết ra ha. 454. Bế lệ đa yết ra ha. 455. Tỳ xá giá yết ra ha. 456. Bộ đa yết ra ha. 457. Cưu bàn trà yết ra ha. 458. Tất kiền đà yết ra ha. 459. Ô đát ma đà yết ra ha. 460. Xa dạ yết ra ha. 461. A bá tất ma ra yết ra ha. 462. Trạch khê cách trà kỳ ni yết ra ha. 463. Rị Phật đế yết ra ha. 464. Xà di ca yết ra ha. 465. Xá câu ni yết ra ha. 466. Lao đà ra. 467. Nan địa ca yết ra ha. 468. A lam bà yết ra ha. 469. Hán độ ba ni yết ra ha. 470. Thập phạt ra. 471. Yên ca hê ca. 472. Trị đế dược ca. 473. Tát lệ đế dược ca. 474. Giả đột thác ca. 475. Ni đề thập phạt ra. 476. Tỷ sám ma thập phạt ra. 477. Bạc để ca. 478. Tỷ để ca. 479. Thất lệ thúc mật ca. 480. Sa nể bát đế ca. 481. Tát bà thập phạt ra. 482. Thất lô kiết đế. 483. Mạt đà bệ đạt lô chế kiếm. 484. A ỷ lô kiềm. 485. Mục khê lô kiềm. 486. Yết rị đột lô kiềm. 487. Yết ra ha. 488. Yết lam. 489. Hổ tri sắc lực hoa. 490. Ðạn đa thi lô hoa. 491. Hất rị dạ thi lô hoa. 492. Mạt mạ thi lô hoa. 493. Bạt rị thất bà thi lô hoa. 494. Tỷ lật sắc tra thi lô hoa. 495. Ô đà ra thi lô hoa. 496. Yết tri thi lô hoa. 497. Bạt tất đế thi lô hoa. 498. Ô lô thi lô hoa. 499. Thường già thi lô hoa. 500. Hát đa thi lô hoa. 501. Bát đà thi lô hoa. 502. Ta phạp anh già. 503. Bát ra trượng già thi lô hoa. 504. Bộ đa tỷ đa trà. 505. Trà kỳ ni. 506. Thập bà ra. 507. Ðà đột lô ca. 508. Kiến đốt lô kiết tri. 509. Bà lộ đa tỳ. 510. Tát bát lô. 511. Ha lăng già. 512. Du sa đát ra. 513. Ta ha sa ra. 514. Ánh đà ca ra. 515. Tỳ sa thí đa. 516. A kỳ ni. 517. Ô đà ca. 518. Mạt ra bệ ra. 519. Kiến đa ra. 520. A ca ra. 521. Mật rị đốt. 522. Ðát liểm bộ ca. 523. Ðịa lật lặc tra. 524. Tỷ lăng chất ca. 525. Tát bà na nể. 526. Dực ca. 527. Hổ lang dược xoa. 528. La sát ta. 529. Quang phủ. 530. Binh vi tất. 531. Ngang hà trì. 532. Dược ta. 533. Xá sắc đát. 534. Ngang gia trì. 535. Tát đác đa bát đác lam. 536. Ma ha bạt xà lô. 537. Sắc ni sam. 538. Ma ha bác lặc trượng kỳ lam. 539. Dạ ba đột đà. 540. Xá thố na. 541. Kiền đà lặc. 542. Bát lệ trượng. 543. Tỳ đà da. 544. Bàn đàm ca rô mi. 545. Ðế thù. 546. Bàn đàm ca rô mi. 547. Bát ra tỳ đà. 548. Bàn đàm ca rô mi. 549. Ðát điệt tha. 550. Án. 551. A na lệ. 552. Tỳ xá đề. 553. Bệ ra. 554. Bạt xà ra đà rị. Bàn đà bàn đà nể. Bạt xà ra báng ni phấn. Hổ hồng đô lô ung phấn. Ta bà ha.}\n
{align:center|**ŚŪRAṄGAMA HEART MANTRA (TÂM CHÚ LĂNG NGHIÊM)**}
{align:center|Án, A na lệ, Tỳ xá đề, Bệ ra bạt xà ra đà rị, Bàn đà bàn đà nể, Bạt xà ra báng ni phấn, Hổ hồng đô lô ung phấn, Ta bà ha.}\n
{align:center|**THE FIVE GREAT HEART MANTRAS (NGŨ ĐẠI TÂM CHÚ)**}
{align:center|Sất đà nể, A ca ra, Mật rị trụ, Bát rị đát ra da, Nảnh yết rị. (Tụng 3 đến 108 biến)}\n
{align:center|**MANTRA FOR RECTIFYING PRONUNCIATION ERRORS**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}\n
{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}\n
{align:center|**DEDICATION OF MERIT**}
{align:justify|Nam Mô Vô Thượng Phật Đảnh Quang Minh Ma Ha Tát Đát Đa Bát Đát Ra Đà Ra Ni. (3 lần)}
{align:justify|Nam Mô Tám Vạn Bốn Ngàn Na Do Tha Hằng Hà Sa Kim Cang Tạng Bồ Tát Thủ Hộ Lăng Nghiêm Đà Ra Ni. (3 lần)}
{align:justify|Nam Mô Hộ Pháp Chư Tôn Bồ Tát. (3 lần)}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Supreme Śūraṅgama Mantra, dedicating the merit universally to all sentient beings throughout the Dharma Realm, and to my parents, family, and karmic creditors. May all beings be free from calamity, cultivate pure Bodhi, and be reborn in the Pure Land of Ultimate Bliss.}`
};

const shurangamaChap2 = {
  id: 1959,
  bai_viet_id: 'tt_1781275267452',
  so_thu_tu: 2,
  tieu_de: 'Part 3: Inconceivable Power & Virtues of the Śūraṅgama Mantra',
  tom_tat: '',
  noi_dung: `{align:center|**THE INCONCEIVABLE POWER AND VIRTUES OF THE ŚŪRAṄGAMA MANTRA**}
{align:center|*(Proclaimed by Buddha Śākyamuni in the Śūraṅgama Sūtra and Expounded by Venerable Master Hsuan Hua)*}

{align:justify|**1. The Buddha Proclaims the Inconceivable Virtues of the Mantra:**}

{align:justify|In the Śūraṅgama Sūtra, the Buddha told Ānanda:
“This unseen heart crown of the Tathāgata, the White Parasol Dhāraṇī (Sitātapatra), is that from which all Buddhas of the ten directions are born. Because all Tathāgatas of the ten directions uphold this heart mantra, they attain Unsurpassed Supreme Bodhi.
Because all Tathāgatas of the ten directions uphold this mantra, they subdue and tame all evil spirits and demons, and overturn all external paths.
Because all Tathāgatas of the ten directions rely on this mantra, they sit upon jewel lotuses, appearing in lands as numerous as fine dust motes throughout the ten directions, turning the Great Wheel of the Proper Dharma.”}

{align:justify|**2. Freedom from Calamities and Disasters:**}

{align:justify|“Ānanda! If sentient beings in the world recite this mantra, or carry it upon their person, or write it and place it in their homes or sanctuaries:
• Fire cannot burn them; water cannot drown them; mild poison and virulent poison cannot harm them.
• All malevolent sorceries, poisons, curses, and hexes will turn into sweet dew when approaching that person.
• They will never be possessed by demonic spirits, yakṣas, rākṣasas, or hungry ghosts.
• In any land where this mantra is kept and recited, winds and rains will be harmonious, crops will be bountiful, disasters will cease, and all calamities from malefic stars will be extinguished.”}

{align:justify|**3. Protection by Eighty-Four Thousand Diamond Treasury Bodhisattvas:**}

{align:justify|“At that time, eighty-four thousand nayutas of Ganges sands of Vajragarbha Bodhisattvas (Diamond Treasury Bodhisattvas) in the assembly rose, bowed at the Buddha's feet, and declared:
‘World-Honored One! We who cultivate like this have long since accomplished the Way, yet we refrain from entering Nirvāṇa in order to accompany this mantra, protecting all true cultivators of samādhi in the Dharma-Ending Age.
Whether in the meditation hall, or walking, or sleeping, we and our retinues will perpetually protect that good person. If any evil demon or malicious spirit dares approach within ten yojanas to harass them, we will shatter its head into dust motes with our vajra pestles!’”}

{align:justify|**4. The Śūraṅgama Litany (English Translation from Cattāri Brahmavihārā):**}

{align:justify|“By being mindful of this supreme dhāraṇī, may we be cleansed and protected:
• Of fear of rulers, thieves, flood, and fire.
• Of fear of poison, weapons, and hostile armies.
• Of fear of famine, lightning, earthquakes, and untimely death.
• Of fear of meteors, snakes, scorpions, dragons, and beasts of prey.
• From entanglements with imps of mischief, night-stalkers, and ghosts of despair.
• From fevers, diseases of the eyes, ears, mouth, chest, heart, and joints.
May the Vajra-Canopy of the Great Tathāgata encircle twelve yojanas in all directions, establishing the sacred boundary of peace, light, and liberation for all living beings!”}

{align:justify|**5. Teachings of Venerable Master Hsuan Hua:**}

{align:justify|Venerable Master Hsuan Hua taught:
“The Śūraṅgama Mantra is the backbone of Buddhism. As long as there is a single person in the world who recites the Śūraṅgama Mantra, the Proper Dharma will never perish, and the heavenly demons cannot dominate the world.
Reciting the Śūraṅgama Mantra every day purifies the three karmas, dispels all afflictions, and leads directly to the realization of our inherent Buddha Nature. Let every sincere cultivator memorize and recite this sacred mantra with utmost reverence and perseverance.”}`
};

// --- 2. GREAT COMPASSION MANTRA CONTENT ---
const daibeiChap0 = {
  id: 2335,
  bai_viet_id: 'tt_1781274943336',
  so_thu_tu: 0,
  tieu_de: 'Part 1: The Great Compassion Mantra Liturgy (Sanskrit Pronunciation)',
  tom_tat: '',
  noi_dung: `{align:center|**THE SUTRA OF THE INFINITE, PERFECTED GREAT COMPASSIONATE HEART OF THE THOUSAND-ARMED THOUSAND-EYED BODHISATTVA AVALOKITEŚVARA**}
{align:center|**(Standard Sanskrit Pronunciation — Nīlakaṇṭha Dhāraṇī)**}
{align:center|*(Source: Benebell Wen 774 AD Amoghavajra / Bhagavaddharma & Daisetsu Teitaro Suzuki)*}

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

{align:justify|**With Utmost Sincerity, We Bow:** Namo Permanently Abiding Triple Jewel of the Ten Directions, throughout all of empty space and the Dharma Realm. (1 bow)}
{align:justify|**With Utmost Sincerity, We Bow:** Namo Master of the Sahā World, our Guide and Teacher Śākyamuni Buddha; Future Maitreya Buddha; Mañjuśrī Bodhisattva; Samantabhadra Bodhisattva; and all Dharma Protectors. (1 bow)}
{align:justify|**With Utmost Sincerity, We Bow:** Namo Western Pure Land of Ultimate Bliss, Greatly Compassionate Guide Amitābha Buddha; Great Compassion Avalokiteśvara Bodhisattva; Mahāsthāmaprāpta Bodhisattva; Kṣitigarbha Bodhisattva; and the Boundless Ocean-Wide Assembly. (1 bow)}

{align:justify|**Prayer of Sincere Repentance:**}
{align:justify|*(From the Golden Light Sūtra — Suvarṇaprabhāsa Sūtra, Chapter on Eradication of Karmic Obstacles)*:
“Before the World Honored Ones dwelling in the ten directions, I bow with body, speech, and mind. With Your true wisdom, vision, and certification, You witness all wholesome and unwholesome deeds.
From beginningless time until today, drifting along currents of greed, anger, and delusion, I have created boundless karmic offenses together with living beings. All such offenses I now lay bare and sincerely repent; I dare not conceal anything. For all negative karmas that would cause falling into the evil paths, I sincerely repent. Sins already committed, I vow to destroy; offenses not yet committed, I vow never to commit again!”}

{align:justify|**The Ten Great Vows to Great Compassion Avalokiteśvara Bodhisattva:**}
{align:justify|*(From the Great Compassion Dhāraṇī Sūtra)*
• Namo Greatly Compassionate Avalokiteśvara: May I quickly know all dharmas!
• Namo Greatly Compassionate Avalokiteśvara: May I soon obtain the eye of wisdom!
• Namo Greatly Compassionate Avalokiteśvara: May I quickly save all living beings!
• Namo Greatly Compassionate Avalokiteśvara: May I soon obtain skillful means!
• Namo Greatly Compassionate Avalokiteśvara: May I quickly board the Prajñā boat!
• Namo Greatly Compassionate Avalokiteśvara: May I soon cross over the ocean of suffering!
• Namo Greatly Compassionate Avalokiteśvara: May I quickly achieve morality, samādhi, and the Way!
• Namo Greatly Compassionate Avalokiteśvara: May I soon ascend the mountain of Nirvāṇa!
• Namo Greatly Compassionate Avalokiteśvara: May I quickly enter the house of nonaction!
• Namo Greatly Compassionate Avalokiteśvara: May I soon achieve the body of Dharma-nature!

If I go towards a mountain of knives, the mountain of knives recedes.
If I go towards boiling water and fire, the boiling water and fire vaporize.
If I go towards the hells, the hells of themselves dispel.
If I go towards hungry ghosts, the hungry ghosts of themselves become full.
If I go towards the asuras, their vicious minds are naturally subdued.
If I go towards animals, they themselves attain great wisdom.

Namo Greatly Compassionate Avalokiteśvara Bodhisattva. (Recite at least 21 times)
Namo Amitābha Buddha. (Recite at least 21 times)
Namo Sacred Assembly of Buddhas and Bodhisattvas of Great Compassion. (Recite 3 times)}

{align:center|**NĪLAKAṆṬHA DHĀRAṆĪ (MAHĀ KARUṆĀ DHĀRAṆĪ)**}
{align:center|**(The Reconstructed Sanskrit Text from Bhagavaddharma 660 AD & Amoghavajra 774 AD)**}
{align:center|*(Daily recitation: 5, 7, 21, 49, or 108 times)*}\n
{align:justify|**Namo ratna-trayāya | namo āryĀvalokiteśvarāya bodhisattvāya mahāsattvāya mahākāruṇikāya |**}
{align:justify|**Oṃ sarva-bhaye ṣu trāṇa-karāya tasya namaskṛtvā imaṃ āryĀvalokiteśvara-stavanaṃ Nīlakaṇṭha-nāma |**}
{align:justify|**Hṛdayaṃ vartayi-iṣyāmi sarv-ārtha-sādhanaṃ śubhaṃ | ajeyaṃ sarva-bhūtānāṃ bhava-mārga-viśodhakam ||**}
{align:justify|**TADYATHĀ: Oṃ apaloka lokātikrānta ehi Hare mahābodhisattva sarpa-sarpa | smara smara mama hṛdayam |**}
{align:justify|**kuru-kuru karma | dhuru-dhuru vijayate mahāvijayate | dhara-dhara dharāṇi-rāja | cala-cala mama vimala-mūrtte re |**}
{align:justify|**ehy-ehi kṛṣṇa-sarp-opavīta | viṣa-viṣaṃ praṇāśaya | hulu-hulu malla | hulu-hulu Hare |**}
{align:justify|**sara-sara siri-siri suru-suru | bodhiya bodhaya-bodhaya maitriya Nīlakaṇṭha | darśanena prahlādaya manaḥ svāhā |**}
{align:justify|**siddhāya svāhā | mahāsiddhāya svāhā | siddha-yogeśvarāya svāhā | Nīlakaṇṭhāya svāhā |**}
{align:justify|**Vāraha-mukhāya svāhā | Narasiṃha-mukhāya svāhā | padma-hastāya svāhā | cakra-hastāya svāhā |**}
{align:justify|**padma-hastāya svāhā | Nīlakaṇṭha-vyāghrāya svāhā | Mahābali-Śankarāya svāhā ||**}
{align:justify|**Namo ratna-trayāya | namo āryĀvalokiteśvarāya [bodhi]svāhā ||**}
{align:justify|**Oṃ siddhyantu mantra-padāni svāhā || (Recite 3 times)**}\n
{align:center|**ENGLISH TRANSLATION OF THE DHĀRAṆĪ (BY D.T. SUZUKI)**}
{align:justify|Adoration to the Triple Treasure!
Adoration to Avalokiteśvara the Bodhisattva Mahāsattva who is the Great Compassionate One!
Om—to the One who performs a leap beyond all fears.
Having adored Him, may I enter into the heart of the Blue-Necked One, known as the noble adorable Avalokiteśvara—the completion of all meaning, pure, that which makes all beings victorious and cleanses the path of existence.
Thus—Om—the Seer, the World-Transcending One. O Hari the Mahābodhisattva!
All, all: defilement cleansed! It is the heart.
Do, do the work—Hold fast, hold fast—O great victor!
Hold on, hold on—I hold on!
Move, move, my defilement-free soul! Come, come. Hear, hear. A joy rises up in me.
Speak, speak—Directing—Hulu, hulu, mala, hulu, hulu, hile. Sara, sara. Siri, siri. Suru, suru.
Be awakened, be awakened! Have awakened, have awakened!
O Merciful One, Blue-Necked One—to the daring ones, to the joyous, hail!
To the Successful One, hail!
To the Great Successful One, hail!
To the One Who Has Attained Mastery in Discipline, hail!
To the Blue-Necked One, hail!
To the Boar-Faced One, hail!
To the Lion-Faced One, hail!
To the Warrior Who Wields the Holy Spear, hail!
To the One Who Holds the Wheel, hail!
To the One Who Holds the Lotus, hail!
To the Blue-Necked Far-Causing One, hail!
To the Beneficent One referred to in this dhāraṇī, beginning with Namo, hail!
Adoration to the Triple Treasure! Adoration to Avalokiteśvara, hail!
May these prayers be successful! To this magical formula, hail!}

{align:center|**MANTRA FOR RECTIFYING PRONUNCIATION ERRORS**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}

{align:center|**DEDICATION OF MERIT**}
{align:justify|I, disciple [Name / Dharma Name], now diligently recite the Great Compassion Mantra, creating merit on behalf of my parents, family, loved ones, and all karmic creditors across past and present lifetimes, dedicating this merit universally to all sentient beings throughout empty space and the Dharma Realm.
May everyone attain peace in body and mind, be free from illnesses and afflictions, have all affairs proceed auspiciously, have karmic obstacles swiftly cleared away, and see blessings and merits increase continually.
To the Buddha I take refuge, vowing that all living beings understand the Great Way profoundly and bring forth the Bodhi mind. (Prostrate)
To the Dharma I take refuge, vowing that all living beings deeply enter the Sūtra Treasury and attain wisdom as vast as the sea. (Prostrate)
To the Saṅgha I take refuge, vowing that all living beings unite the great assembly, all without obstruction. (Prostrate)}`
};

const daibeiChap1 = {
  id: 2343,
  bai_viet_id: 'tt_1781274943336',
  so_thu_tu: 1,
  tieu_de: 'Part 2: The Great Compassion Mantra Liturgy (Traditional Pronunciation)',
  tom_tat: '',
  noi_dung: `{align:center|**LITURGY FOR RECITING THE GREAT COMPASSION DHĀRAṆĪ**}
{align:center|**(Traditional East-Asian & Sino-Vietnamese Chanting)**}
{align:center|*(Including Amoghavajra 774 AD Pinyin / Chinese Romanization & Sino-Vietnamese Recitation)*}

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

{align:justify|**Chí Tâm Đảnh Lễ:** Nam mô tận hư không, biến pháp giới, quá hiện, vị lai Thập phương chư Phật, Tôn Pháp, Hiền Thánh Tăng, thường trú tam Bảo. (1 bow)}
{align:justify|**Chí Tâm Đảnh Lễ:** Nam mô Ta Bà Giáo chủ, Điều Ngự Bổn Sư Thích Ca Mâu Ni Phật, Đương Lai Hạ Sanh Di Lặc Tôn Phật, Đại Trí Văn Thù Sư Bồ Tát, Đại Hạnh Phổ Hiền Bồ Tát, Hộ Pháp chư tôn Bồ Tát, Linh Sơn Hội Thượng Phật Bồ Tát. (1 bow)}
{align:justify|**Chí Tâm Đảnh Lễ:** Nam Mô Tây Phương Cực Lạc thế giới, đại từ đại bi tiếp dẫn đạo sư A Di Đà Phật, đại bi Quán Thế Âm Bồ Tát, Đại Thế Chí Bồ Tát, đại nguyện Địa Tạng Vương Bồ Tát, Thanh Tịnh Đại Hải Chúng Bồ tát. (1 bow)}

{align:justify|**The Ten Vows of Great Compassion (Phát Nguyện):**
Nam mô đại bi Quán Thế Âm, nguyện con mau biết tất cả pháp.
Nam mô đại bi Quán Thế Âm, nguyện con sớm được mắt trí huệ.
Nam mô đại bi Quán Thế Âm, nguyện con mau độ các chúng sanh.
Nam mô đại bi Quán Thế Âm, nguyện con sớm được phương tiện khéo.
Nam mô đại bi Quán Thế Âm, nguyện con mau lên thuyền bát nhã.
Nam mô đại bi Quán Thế Âm, nguyện con sớm được qua biển khổ.
Nam mô đại bi Quán Thế Âm, nguyện con mau được đạo giới định.
Nam mô đại bi Quán Thế Âm, nguyện con sớm lên non Niết Bàn.
Nam mô đại bi Quán Thế Âm, nguyện con mau về nhà vô vi.
Nam mô đại bi Quán Thế Âm, nguyện con sớm đồng thân pháp tánh.

Nếu con hướng về nơi non đao, non đao tức thời liền sụp đổ.
Nếu con hướng về lửa, nước sôi, nước sôi, lửa cháy tự khô tắt.
Nếu con hướng về cõi địa ngục, địa ngục liền mau tự tiêu diệt.
Nếu con hướng về loài ngạ quỷ, ngạ quỷ liền được tự no đủ.
Nếu con hướng về chúng Tu La, Tu la tâm ác tự điều phục.
Nếu con hướng về các súc sanh, súc sanh tự được trí huệ lớn.

Nam Mô Đại Bi Quán Thế Âm Bồ Tát (21 times)
Nam Mô A Di Đà Phật (21 times)}

{align:center|**THOUSAND HANDS AND THOUSAND EYES GREAT COMPASSION DHĀRAṆĪ**}
{align:center|**(Traditional Sino-Vietnamese Pronunciation)**}\n
{align:justify|**Nam mô hắc ra đát na đa ra dạ da. Nam mô a rị da, bà lô yết đế, thước bát ra da, bồ đề tát đỏa bà da, ma ha tát đỏa bà da, ma ha ca lô ni ca da. Án, tát bàn ra phạt duệ, số đát na đát tỏa. Nam mô tất kiết lật đỏa y mông a rị da, bà lô kiết đế thất Phật ra lăng đà bà. Nam mô na ra cẩn trì, hê rị ma ha bàn đa sa mế, tát bà a tha đậu du bằng, a thệ dựng, tát bà tát đa, na ma bà tát đa, na ma bà già, ma phạt đạt đậu.**}

{align:justify|**Đát điệt tha. Án, a bà lô hê, lô ca đế, ca ra đế, di hê rị, ma ha bồ đề tát đỏa, tát bà tát bà, ma ra ma ra, ma hê ma hê rị đà dựng, cu lô cu lô kiết mông, độ lô độ lô phạt xà da đế, ma ha phạt xà da đế, đà ra đà ra, địa rị ni, thất Phật ra da, giá ra giá ra, mạ mạ phạt ma ra, mục đế lệ, y hê y hê, thất na thất na, a ra sâm Phật ra xá lợi, phạt sa phạt sâm, Phật ra xá da, hô lô hô lô ma ra, hô lô hô lô hê rị, ta ra ta ra, tất rị tất rị, tô rô tô rô, bồ đề dạ bồ đề dạ, bồ đà dạ bồ đà dạ, di đế rị dạ, na ra cẩn trì.**}

{align:justify|**Địa rị sắc ni na, ba dạ ma na, ta bà ha. Tất đà dạ, ta bà ha. Ma ha tất đà dạ ta bà ha. Tất đà du nghệ thất bàn ra dạ ta bà ha. Na ra cẩn trì ta bà ha. Ma ra na ra ta bà ha. Tất ra tăng a mục khư da ta bà ha. Tát bà ma ha a tất đà dạ ta bà ha. Bánh xà ra a tất đà dạ ta bà ha. Ba đà ma yết thất đà dạ ta bà ha. Na ra cẩn trì bàn đà ra dạ ta bà ha. Ma bà lợi thắng kiết ra dạ ta bà ha.**}

{align:justify|**Nam mô hắc ra đát na đá ra mạ da, Nam mô a rị da bà lô yết đế, thước bàn ra dạ, ta bà ha.**}

{align:justify|**Án tất điện đô, mạn đa ra, bạt đà dạ, ta bà ha. (Recite 3 times)**}\n
{align:center|**AMOGHAVAJRA 774 AD CHINESE ROMANIZATION (PINYIN)**}
{align:justify|ná mó hē luō dá nà duō luō yè yé, ná mó ā lì yé, pó lú jié dì shuò bō luō yé, pú tí sà duǒ pó yé, mó hē sà duǒ pó yé, mó hē jiā lú ní jiā yé, ǎn sà pó luō fá yè shù dá nà dá xiě, ná mó xī jí lì duǒ yī méng ā lì yé, pó lú jí dì shì fú luō lèng tuó pó, ná mó nà luō jǐn chí, xī lì mó hē pó duō shā miē, sà pó ā tā dòu shū péng, ā shì yùn, sà pó sà duō nà mó pó sà duō, nà mó pó jiā, mó fá tè dòu.}
{align:justify|dá zhí tā: ǎn, ā pó lú xī lú jiā dì, jiā luó dì, yí xī lì, mó hē pú tí sà duǒ, sà pó sà pó, mó luō mó luō, mó xī mó xī lì tuó yùn, jù lú jù lú jié méng, dù lú dù lú fá dū yé dì, mó hē fá dū yé dì, tuó luō tuó luō, de lì ní, shì fuó luō yé, zhē luō zhē luō, mó me fá mó luō, mù dì lì, yī xī yī xī, shì nà shì nà, ā luō cān fuó luō shè lì, fá shā fá cān fuó luō shě yé, hū lú hū lú mó luō, hū lú hū lú xī lì, suō luō suō luō, xī lì xī lì, sū lú sū lú, pú tí yè pú tí yè, pú tuó yè pú tuó yè, mí dì lì yè, nà luō jǐn chí, dì lì sè ní nà, bō yè mó nà, suō pó hē.}
{align:justify|xī tuó yè suō pó hē. mó hē xī tuó yè suō pó hē. xī tuó yù yì shì pó luō yé suō pó hē. nà luō jǐn chí suō pó hē. mó luō nà luō suō pó hē. xī luō sēng ā mù qū yé suō pó hē. sà pó mó hē ā xī tuó yè suō pó hē. zhě jí luō ā xī tuó yè suō pó hē. bō tuó mó jié xī tuó yè suō pó hē. nà luō jǐn chí pó jiā luō yé suō pó hē. mó pó lì shèng jié luō yè suō pó hē.}
{align:justify|ná mó hē luō dá nà duō luō yè yé, ná mó ā lì yé, pó lú jí dì shuò pó luō yè suō pó hē.}
{align:justify|ǎn xī diàn dōu màn duō luō bá tuó yé suō pó hē.}

{align:center|**MANTRA FOR RECTIFYING PRONUNCIATION ERRORS**}
{align:center|Oṃ kuru kuru jayamukhe svāhā. (Recite 7 times)}

{align:center|**MANTRA FOR MULTIPLYING MERITS ONE HUNDRED THOUSANDFOLD**}
{align:center|Oṃ saṃbhāra saṃbhāra vimāna-sāra-mahā-jāva hūṃ. Oṃ smara smara vimāna-skāra-mahā-jāva hūṃ. (Recite 7 times)}

{align:center|**DEDICATION OF MERIT**}
{align:justify|May the merits of reciting the Great Compassion Mantra be dedicated to all beings throughout the Dharma Realm. May all be peaceful, healthy, and guided along the Path to Enlightenment.}`
};

const daibeiChap2 = {
  id: 2348,
  bai_viet_id: 'tt_1781274943336',
  so_thu_tu: 2,
  tieu_de: 'Part 3: Inconceivable Power & Virtues of the Great Compassion Mantra',
  tom_tat: '',
  noi_dung: `{align:center|**THE INCONCEIVABLE POWER AND VIRTUES OF THE GREAT COMPASSION MANTRA**}
{align:center|*(From the Mahā Karuṇā Dhāraṇī Sūtra & Amoghavajra Texts, Trans. by Benebell Wen)*}

{align:justify|**1. The Great Vows of Avalokiteśvara Bodhisattva:**}

{align:justify|In the Great Compassion Dhāraṇī Sūtra, Avalokiteśvara Bodhisattva addressed the Buddha:
“World-Honored One! If any sentient being who recites and holds the Great Compassion Mantra should ever fall into the three evil paths (hells, hungry ghosts, or animals), I vow not to attain Right Enlightenment!
If any sentient being who recites and holds the Great Compassion Mantra is not reborn in whatever Buddha-land they wish, I vow not to attain Right Enlightenment!
If any sentient being who recites and holds the Great Compassion Mantra does not obtain boundless samādhi and eloquence, I vow not to attain Right Enlightenment!
If any sentient being who recites and holds the Great Compassion Mantra does not have all wholesome wishes of this present life fulfilled, this mantra cannot be called the Great Compassion Dhāraṇī—excepted only are those who pray with insincerity or harbor doubts within their minds!”}

{align:justify|**2. Freedom from the Fifteen Kinds of Evil Death:**}

{align:justify|“World-Honored One, if living beings recite and uphold the Great Compassion Dhāraṇī, they will never suffer any of the fifteen kinds of untimely, tragic, or evil deaths:
1. They will not die of starvation, poverty, or famine.
2. They will not die from shackles, imprisonment, beatings, or execution.
3. They will not die at the hands of battlefield enemies or armed bandits.
4. They will not die from slaughter on the battlegrounds.
5. They will not die torn apart by ferocious tigers, wolves, or savage beasts.
6. They will not die from the bites of poisonous snakes, vipers, or scorpions.
7. They will not die by drowning in deep waters or being swept away by floods.
8. They will not die burned by fire or consuming flames.
9. They will not die by poisoning, venom, or harmful potions.
10. They will not die from black magic, insect curses (Gu poison), or evil sorcery.
11. They will not die from madness, hysteria, or demonic possession.
12. They will not die by falling from trees, cliffs, or mountain heights.
13. They will not die from the malicious hexes or spells of evil people.
14. They will not die from pestilence, epidemic diseases, or lethal plagues.
15. They will not die by their own hand or commit suicide.”}

{align:justify|**3. Attainment of the Fifteen Kinds of Auspicious Rebirth:**}

{align:justify|“Living beings who recite and hold the Great Compassion Mantra will perpetually attain the fifteen kinds of auspicious, noble rebirths:
1. In whatever realm they are born, they will always meet righteous rulers and benevolent leaders.
2. They will always be born in virtuous and peaceful lands.
3. They will always encounter auspicious eras and harmonious seasons.
4. They will always meet good spiritual teachers (Kalyāṇa-mitra).
5. Their bodily faculties will always be complete, sound, and healthy.
6. Their mind on the Path will be pure, deep, and fully ripened.
7. They will never break the pure moral precepts.
8. Their family and retinue will be harmonious, loving, and virtuous.
9. Their wealth, provisions, and necessities of life will always be abundant.
10. They will always be respected, assisted, and honored by others.
11. Their possessions will never be plundered, stolen, or destroyed.
12. Whatever wholesome goals they seek will be effortlessly fulfilled.
13. Dragons, devas, and benevolent spirits will protect them day and night.
14. In whatever place they are born, they will hear the Buddha's teachings and see the Buddhas.
15. They will awaken to the profound significance of the Proper Dharma and understand it without obstacle.”}

{align:justify|**4. Metaphysical and Healing Applications (from Benebell Wen / Amoghavajra Texts):**}

{align:justify|• **Healing Waters of Kuan Yin:** Pour clean drinking water into a clean cup. Light a stick of incense and recite the Great Compassion Mantra with undivided concentration, visualizing the water being infused with the light and compassion of Avalokiteśvara Bodhisattva. Drinking or applying this blessed water brings relief and healing for illnesses.
• **Personal Spiritual Shield:** Visualizing each recitation as applying a layer of spiritual armor, routine recitations naturally produce a psychic shield of protection around the practitioner.
• **Purification of Sacred Spaces:** Reciting the dhāraṇī in the cardinal directions establishes a protective boundary, banishing malefic forces and bringing tranquil harmony to one's residence or altar.}

{align:justify|**5. Teachings of Venerable Master Hsuan Hua:**}

{align:justify|Venerable Master Hsuan Hua taught:
“When you recite the Great Compassion Mantra, the heavens quake and the earth trembles as the mantra penetrates heaven and earth. If you recite it 108 times every day for a thousand days, the ten kings of Yama’s courts are delighted, and all evil karmic obstacles are wiped away. Most importantly, it can cure eighty-four thousand illnesses. With a sincere heart without doubts, you will certainly obtain an inconceivable response!”}`
};

// --- 3. WRITE TO ALL DIRECTORIES ---
const shurangamaData = [shurangamaChap0, shurangamaChap1, shurangamaChap2];
const daibeiData = [daibeiChap0, daibeiChap1, daibeiChap2];

const targetDirs = [
  path.join(root, 'static', 'offline-data', 'chapters-en'),
  path.join(root, 'build', 'offline-data', 'chapters-en'),
  path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-data', 'chapters-en'),
  path.join(root, 'ios', 'App', 'App', 'public', 'offline-data', 'chapters-en'),
  path.join(root, '.svelte-kit', 'output', 'client', 'offline-data', 'chapters-en'),
];

for (const dir of targetDirs) {
  if (fs.existsSync(path.dirname(dir))) {
    fs.mkdirSync(dir, { recursive: true });
    
    // Shurangama
    const shurFile = path.join(dir, 'tt_1781275267452.json');
    fs.writeFileSync(shurFile, JSON.stringify(shurangamaData, null, 2), 'utf8');
    console.log(`✓ Written ${shurFile}`);
    
    // Da Bei
    const daibeiFile = path.join(dir, 'tt_1781274943336.json');
    fs.writeFileSync(daibeiFile, JSON.stringify(daibeiData, null, 2), 'utf8');
    console.log(`✓ Written ${daibeiFile}`);
  }
}


// Also update offline-books-en.json
const booksFiles = [
  path.join(root, 'src', 'lib', 'data', 'offline-books-en.json'),
  path.join(root, 'build', 'offline-books-en.json'),
  path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-books-en.json'),
  path.join(root, 'ios', 'App', 'App', 'public', 'offline-books-en.json'),
];

for (const bf of booksFiles) {
  if (fs.existsSync(bf)) {
    const bdata = JSON.parse(fs.readFileSync(bf, 'utf8'));
    bdata['tt_1781275267452'] = {
      title: 'The Śūraṅgama Mantra Recitation Liturgy',
      author: 'Buddha Śākyamuni / CTTB Tradition',
      summary: 'The supreme dhāraṇī for subverting demonic obstacles, purifying the three karmas, and protecting sincere cultivators.'
    };
    bdata['book_tt_1781275267452'] = bdata['tt_1781275267452'];
    bdata['tt_1781274943336'] = {
      title: 'The Great Compassion Mantra Recitation Liturgy',
      author: 'Avalokiteśvara Bodhisattva',
      summary: 'The sacred Nīlakaṇṭha Dhāraṇī of Thousand-Armed Thousand-Eyed Avalokiteśvara Bodhisattva for infinite protection, healing, and peace.'
    };
    bdata['book_tt_1781274943336'] = bdata['tt_1781274943336'];
    fs.writeFileSync(bf, JSON.stringify(bdata, null, 2), 'utf8');
    console.log(`✓ Updated book metadata in ${bf}`);
  }
}

console.log('\nAll targets and metadata updated successfully!');


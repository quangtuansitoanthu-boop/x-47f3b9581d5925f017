import fs from 'fs';

// Complete, authentic English translation of the Diamond Sutra & Liturgy
// Referencing:
// - Ling Jiou Mountain Prajna Buddhist Education Foundation (LJM ID=2959: The Diamond Sutra)
// - Buddhist Text Translation Society (BTTS) / Tripitaka Master Xuanhua (City of Ten Thousand Buddhas)
// - Venerable Master Hsing Yun / Kumarajiva Chinese translation

const kimCangEnglishText = `{align:center|**INCENSE PRAISE**}

{align:center|The incense burner glows with warmth,
Its fragrance perfumes the Dharma Realm.
The ocean-wide assembly of Buddhas perceive it from afar,
Everywhere gather auspicious clouds.
Sincere devotion bears wondrous fruit,
As all Buddhas manifest their full presence.}

{align:center|**NAMO INCENSE CLOUD CANOPY BODHISATTVA MAHASATTVA.** (3 times)}

{align:center|**MANTRA FOR PURIFYING SPEECH KARMA**}
{align:center|Oṃ śucite śucite mahā-śucite śuśucite svāhā. (3 times)}

{align:center|**MANTRA FOR PURIFYING THE THREE KARMAS**}
{align:center|Oṃ svabhāva-śuddhāḥ sarva-dharmāḥ svabhāva-śuddho 'ham. (3 times)}

{align:center|**MANTRA FOR PACIFYING LOCAL EARTH SPIRITS**}
{align:center|Namo samanta-buddhānāṃ: Oṃ dhuru dhuru devī svāhā. (3 times)}

{align:center|**UNIVERSAL OFFERING MANTRA**}
{align:center|Oṃ gagana-saṃbhava vajra hoḥ. (3 times)}

{align:center|**INVOCATION OF THE EIGHT VAJRA PROTECTORS**}
{align:center|We respectfully invoke the Vajra Being who Dispels Calamities (Thanh Trừ Tai Kim Cang).}
{align:center|We respectfully invoke the Vajra Being who Eliminates Poisons (Bích Độc Thần Kim Cang).}
{align:center|We respectfully invoke the Vajra Being who Fulfills Wishes (Hoàng Tùy Cầu Kim Cang).}
{align:center|We respectfully invoke the Vajra Being of Pure Water (Bạch Tịnh Thủy Kim Cang).}
{align:center|We respectfully invoke the Vajra Being of Red Radiance (Xích Thanh Hỏa Kim Cang).}
{align:center|We respectfully invoke the Vajra Being who Settles Calamities (Định Trừ Tai Kim Cang).}
{align:center|We respectfully invoke the Vajra Being of Purple Virtue (Tử Hiền Kim Cang).}
{align:center|We respectfully invoke the Vajra Being of Great Awesome Power (Đại Thần Lực Kim Cang).}

{align:center|**INVOCATION OF THE FOUR BODHISATTVAS**}
{align:center|We respectfully invoke Diamond Holding Bodhisattva (Kim Cang Quyến Bồ Tát).}
{align:center|We respectfully invoke Diamond Cord Bodhisattva (Kim Cang Sách Bồ Tát).}
{align:center|We respectfully invoke Diamond Loving Bodhisattva (Kim Cang Ái Bồ Tát).}
{align:center|We respectfully invoke Diamond Speech Bodhisattva (Kim Cang Ngữ Bồ Tát).}

{align:center|**ASPIRATION VERSE**}

{align:center|Bowing to the Honored One of the Three Realms,
Taking refuge with the Buddhas of the ten directions.
I now bring forth this vast resolve:
To uphold and recite the Diamond Sūtra.
Above, to repay the Four Great Kindnesses,
Below, to relieve the suffering of the Three Destinies.
May all who see or hear of this
Bring forth the supreme Bodhi Mind,
When this retribution body is fulfilled,
Be reborn together in the Land of Ultimate Bliss.}

{align:center|**HOW TO UPHOLD THE SŪTRA**}

{align:center|How is long life attained,
With an adamantine, indestructible body?
Through what causes and conditions
Is great steadfast strength achieved?
How through this sacred Sūtra
Does one reach the Other Shore?
We pray the Buddha reveals the wondrous secret,
And expounds it widely for all living beings.}

{align:center|**NAMO FUNDAMENTAL TEACHER SHAKYAMUNI BUDDHA.** (3 times)}

{align:center|**OPENING GĀTHĀ**}

{align:center|The Unsurpassed, profound, and subtle Dharma,
In hundreds of thousands of myriad kalpas is rarely encountered.
I now have seen and heard, and am able to receive and uphold it,
May I understand the Tathāgata’s true meaning.}

{align:center|**NAMO PRAJÑĀ ASSEMBLY BUDDHAS AND BODHISATTVAS MAHASATTVAS.** (3 times)}

{align:center|# THE DIAMOND PERFECTION OF WISDOM SŪTRA}
{align:center|*(VAJRACCHEDIKĀ PRAJÑĀPĀRAMITĀ SŪTRA)*}
{align:center|*Translated from Sanskrit into Chinese by Tripiṭaka Master Kumārajīva of Yao Qin*
*English Translation referencing Ling Jiou Mountain & Buddhist Text Translation Society*}

{align:center|**Section 1: The Convocation of the Assembly**}

{align:justify|Thus have I heard. At one time the Buddha was dwelling in Śrāvastī, in the Jeta Grove, the Garden of Anāthapiṇḍika, together with a great assembly of bhikṣus, twelve hundred and fifty in all. At that time, when it was mealtime, the World-Honored One put on his robe, took up his alms bowl, and entered the great city of Śrāvastī to beg for food from house to house. Having finished his begging within the city, he returned to his dwelling place. After eating his meal, he put away his robe and bowl, washed his feet, arranged his seat, and sat down.}

{align:center|**Section 2: Subhūti's Request**}

{align:justify|At that time, the Venerable Subhūti arose from his seat in the midst of the assembly, bared his right shoulder, knelt on his right knee, placed his palms together respectfully, and addressed the Buddha, saying: "Rare indeed, World-Honored One! The Tathāgata is ever mindful of and protects all Bodhisattvas, and skillfully instructs and entrusts all Bodhisattvas. World-Honored One, when good men and good women resolve to attain Anuttarā Samyaksambodhi (Unexcelled, Complete, Perfect Enlightenment), how should they abide their minds, and how should they subdue their thoughts?"}

{align:justify|The Buddha said: "Excellent, excellent, Subhūti! It is as you have said: the Tathāgata is ever mindful of and protects all Bodhisattvas, and skillfully instructs and entrusts all Bodhisattvas. Listen attentively now, and I shall explain it to you. A good man or good woman who resolves to attain Anuttarā Samyaksambodhi should abide thus and subdue their mind thus."}

{align:justify|"Yes, World-Honored One. We listen with joyous anticipation."}

{align:center|**Section 3: The Orthodox Teaching of the Great Vehicle**}

{align:justify|The Buddha told Subhūti: "All Bodhisattva-Mahāsattvas should subdue their minds in this manner: 'Of all classes of sentient beings—whether born from eggs, from wombs, from moisture, or by transformation; whether having form or without form; whether having perception or without perception; or neither with perception nor without perception—I shall guide them all to enter Parinirvāṇa without residue, and thereby liberate them.' Yet even when infinite, countless, and boundless beings are thus liberated, in reality not a single sentient being has been liberated. Why is this so? Subhūti, if a Bodhisattva still retains the notion of an ego, a person, a sentient being, or a life span, then he is not a true Bodhisattva."}

{align:center|**Section 4: The Wondrous Practice of Non-Attachment**}

{align:justify|"Furthermore, Subhūti, when practicing giving (dāna), a Bodhisattva should not abide in anything whatsoever. That is to say, he should give without abiding in sights, and without abiding in sounds, smells, tastes, tangibles, or dharmas. Subhūti, a Bodhisattva should practice giving in this manner, without abiding in any characteristics. Why? If a Bodhisattva gives without abiding in characteristics, his merit and virtue are beyond calculation."}

{align:justify|"Subhūti, what do you think? Can the space of the eastern direction be measured by thought?"}
{align:justify|"No, World-Honored One."}
{align:justify|"Subhūti, can the space of the south, west, north, the four intermediate directions, above, and below be measured by thought?"}
{align:justify|"No, World-Honored One."}
{align:justify|"Subhūti, the merit of a Bodhisattva who practices giving without attachment to characteristics is likewise immeasurable and beyond calculation. Subhūti, a Bodhisattva should only abide in accordance with this teaching."}

{align:center|**Section 5: Genuine Perception of the True Principle**}

{align:justify|"Subhūti, what do you think? Can the Tathāgata be recognized by his physical characteristics?"}
{align:justify|"No, World-Honored One, the Tathāgata cannot be recognized by his physical characteristics. Why? Because what the Tathāgata speaks of as physical characteristics are in reality not physical characteristics."}
{align:justify|The Buddha told Subhūti: "All that has characteristics is illusory and false. If you see that all characteristics are non-characteristics, you perceive the Tathāgata."}

{align:center|**Section 6: Rare Is True Faith**}

{align:justify|Subhūti addressed the Buddha, saying: "World-Honored One, will there be living beings who hear these words and chapters and bring forth true faith?"}

{align:justify|The Buddha told Subhūti: "Do not speak thus. In the last five hundred years after the Tathāgata's Parinirvāṇa, there will be those who uphold the precepts and cultivate blessings who will be able to give rise to a faithful mind upon hearing these sentences and regard them as true. You should know that such persons have planted wholesome roots not merely before one Buddha, two Buddhas, three, four, or five Buddhas, but have planted wholesome roots before immeasurable hundreds of thousands of Buddhas."}

{align:justify|"Upon hearing these passages, if they give rise to pure faith for even a single thought, Subhūti, the Tathāgata fully knows and fully sees that these living beings acquire such immeasurable merit. Why? Because these living beings are free from the notion of an ego, a person, a sentient being, or a life span. They have no notion of dharmas, nor any notion of non-dharmas. Why? If their minds grasp at marks, they would be clinging to an ego, a person, a sentient being, and a life span. If they grasp at the mark of a dharma, they would still cling to an ego, a person, a sentient being, and a life span. If they grasp at the mark of a non-dharma, they would likewise cling to an ego, a person, a sentient being, and a life span. Therefore, one should not grasp at dharmas, nor should one grasp at non-dharmas. For this reason, the Tathāgata always teaches: 'Bhikṣus, know that my teaching is like a raft. Even dharmas must be relinquished, how much more so non-dharmas!'"}

{align:center|**Section 7: Nothing Obtained, Nothing Expounded**}

{align:justify|"Subhūti, what do you think? Has the Tathāgata attained Anuttarā Samyaksambodhi? Has the Tathāgata expounded any Dharma?"}

{align:justify|Subhūti replied: "As I understand the meaning of what the Buddha has said, there is no fixed Dharma called Anuttarā Samyaksambodhi, nor is there any fixed Dharma that the Tathāgata can expound. Why? Because the Dharma expounded by the Tathāgata cannot be grasped, cannot be spoken; it is neither dharma nor non-dharma. Why is this so? Because all the Noble Ones are distinguished by the unconditioned Dharma."}

{align:center|**Section 8: Arising from the Dharma**}

{align:justify|"Subhūti, what do you think? If a person filled the three-thousand great thousand worlds with the seven precious jewels and gave them all away in alms, would the merit obtained by that person be great?"}

{align:justify|Subhūti said: "Extremely great, World-Honored One! Why? Because this merit is not of the nature of merit; therefore, the Tathāgata says that the merit is great."}

{align:justify|"The Buddha said: 'If, on the other hand, someone were to receive and uphold from this Sūtra even a four-line verse and expound it to others, his merit would surpass the former. Why? Subhūti, all Buddhas and all teachings of Anuttarā Samyaksambodhi of all Buddhas issue forth from this Sūtra. Subhūti, what is called the Buddha Dharma is not the Buddha Dharma; therefore it is named the Buddha Dharma.'"}

{align:center|**Section 9: The One Form Without Form**}

{align:justify|"Subhūti, what do you think? Can a Stream-Enterer (Srotāpanna) think to himself: 'I have attained the fruit of Stream-Entry'?"}
{align:justify|Subhūti said: "No, World-Honored One. Why? A Stream-Enterer is called one who has entered the stream, yet he has not entered anything: he does not enter sights, sounds, smells, tastes, tangibles, or dharmas. Therefore he is named a Stream-Enterer."}

{align:justify|"Subhūti, what do you think? Can a Once-Returner (Sakṛdāgāmin) think: 'I have attained the fruit of a Once-Returner'?"}
{align:justify|Subhūti said: "No, World-Honored One. Why? A Once-Returner is called one who goes and returns once, but in truth there is no going or returning. Therefore he is named a Once-Returner."}

{align:justify|"Subhūti, what do you think? Can a Non-Returner (Anāgāmin) think: 'I have attained the fruit of a Non-Returner'?"}
{align:justify|Subhūti said: "No, World-Honored One. Why? A Non-Returner is called one who does not return, but in truth there is no non-returning. Therefore he is named a Non-Returner."}

{align:justify|"Subhūti, what do you think? Can an Arhat think: 'I have attained the fruition of Arhatship'?"}
{align:justify|Subhūti said: "No, World-Honored One. Why? In reality there is no dharma called an Arhat. If an Arhat were to think 'I have attained Arhatship,' he would be clinging to an ego, a person, a sentient being, and a life span. World-Honored One, the Buddha has declared that I excel in the Samādhi of Non-Contention, and am the foremost among men, the foremost Arhat free from desire. Yet I do not think: 'I am an Arhat free from desire.' If I had the thought 'I have attained Arhatship,' the World-Honored One would not have said: 'Subhūti is one who delights in the practice of Araṇā (peaceful non-contention).' Because Subhūti in truth practices nothing, he is called one who delights in Araṇā."}

{align:center|**Section 10: Solemnly Adorning the Pure Land**}

{align:justify|The Buddha said to Subhūti: "What do you think? When the Tathāgata was formerly with Dīpaṃkara Buddha, did he attain any Dharma?"}
{align:justify|"No, World-Honored One. When the Tathāgata was with Dīpaṃkara Buddha, he attained no Dharma whatsoever."}

{align:justify|"Subhūti, what do you think? Does a Bodhisattva adorn Buddha lands?"}
{align:justify|"No, World-Honored One. Why? To adorn Buddha lands is not an adornment; therefore it is named adornment."}

{align:justify|"Therefore, Subhūti, all Bodhisattva-Mahāsattvas should give rise to a pure and clear mind in this manner: they should not give rise to a mind that abides in form; they should not give rise to a mind that abides in sound, smell, taste, touch, or dharmas. They should give rise to a mind that does not abide in anything whatsoever."}

{align:justify|"Subhūti, suppose a person had a body as large as Mount Sumeru, King of Mountains. What do you think? Would that body be large?"}
{align:justify|Subhūti said: "Extremely large, World-Honored One. Why? The Buddha speaks of no-body, which is named a large body."}

{align:center|**Section 11: The Superiority of Unconditioned Blessings**}

{align:justify|"Subhūti, if there were as many Ganges Rivers as there are grains of sand in the Ganges River, what do you think? Would the grains of sand in all those Ganges Rivers be many?"}
{align:justify|Subhūti said: "Very many, World-Honored One! The Ganges Rivers themselves would be countless, how much more so their sands."}
{align:justify|"Subhūti, I now tell you truly: If a good man or good woman filled as many three-thousand great thousand worlds as there are grains of sand in all those rivers with the seven precious jewels and gave them in alms, would their merit be great?"}
{align:justify|Subhūti said: "Very great, World-Honored One."}
{align:justify|The Buddha told Subhūti: "If a good man or good woman receives and upholds from this Sūtra even a four-line verse and explains it to others, his merit would surpass the former merit."}

{align:center|**Section 12: Honoring the Correct Teaching**}

{align:justify|"Furthermore, Subhūti, wherever this Sūtra is expounded, even if only a four-line verse, you should know that this place is worthy of offerings from all worldly gods, humans, and asuras, just like a Buddha shrine or pagoda. How much more so if someone can receive, uphold, read, and recite the entire Sūtra! Subhūti, you should know that such a person accomplishes the foremost, rarest, and highest Dharma. Wherever this Sūtra is present, the Buddha and his revered disciples are present there."}

{align:center|**Section 13: Upholding the Sūtra in Accord with the Dharma**}

{align:justify|At that time, Subhūti addressed the Buddha, saying: "World-Honored One, by what name should this Sūtra be known, and how should we uphold it?"}

{align:justify|The Buddha told Subhūti: "This Sūtra is named *The Vajracchedikā Prajñāpāramitā* (The Diamond Perfection of Wisdom). By this title you should receive and uphold it. Why? Subhūti, what the Buddha speaks of as the Perfection of Wisdom is not the Perfection of Wisdom; therefore it is named the Perfection of Wisdom."}

{align:justify|"Subhūti, what do you think? Has the Tathāgata expounded any Dharma?"}
{align:justify|Subhūti said to the Buddha: "World-Honored One, the Tathāgata has expounded nothing."}

{align:justify|"Subhūti, what do you think? Are all the motes of dust in the three-thousand great thousand worlds many?"}
{align:justify|Subhūti said: "Very many, World-Honored One."}
{align:justify|"Subhūti, the Tathāgata says these motes of dust are not motes of dust; therefore they are named motes of dust. The Tathāgata says worlds are not worlds; therefore they are named worlds."}

{align:justify|"Subhūti, what do you think? Can the Tathāgata be recognized by the thirty-two physical marks?"}
{align:justify|"No, World-Honored One. Why? The Tathāgata speaks of the thirty-two marks as no-marks; therefore they are named the thirty-two marks."}

{align:justify|"Subhūti, if a good man or good woman were to renounce their life as many times as there are grains of sand in the Ganges, and if someone else were to receive and uphold even a four-line verse from this Sūtra and expound it to others, his merit would be far greater."}

{align:center|**Section 14: Absolute Stillness Beyond Marks**}

{align:justify|At that time, Subhūti, having heard this Sūtra and deeply understood its profound meaning, was moved to tears. He addressed the Buddha, saying: "Rare indeed, World-Honored One! The Buddha has expounded such a profound Sūtra. From the time my prajñā eye opened until today, I have never before heard such a teaching! World-Honored One, if anyone hears this Sūtra with pure faith, they will give rise to the Real Mark. One should know that such a person accomplishes the foremost rare merit."}

{align:justify|"World-Honored One, this Real Mark is non-mark; therefore the Tathāgata calls it the Real Mark. World-Honored One, hearing this Sūtra now, I have no difficulty believing, understanding, receiving, and upholding it. But in the future, in the last five hundred years, if living beings hear this Sūtra and can believe, understand, receive, and uphold it, they will be the rarest of all! Why? Because they will be free from the mark of an ego, a person, a sentient being, and a life span. Why? The mark of an ego is non-mark; the marks of a person, a sentient being, and a life span are non-marks. One who has relinquished all marks is called a Buddha."}

{align:justify|The Buddha told Subhūti: "So it is, so it is! If someone hears this Sūtra and is neither frightened, terrified, nor apprehensive, know that this person is extraordinarily rare. Why? Subhūti, the Tathāgata says that the foremost perfection is not the foremost perfection; therefore it is named the foremost perfection."}

{align:justify|"Subhūti, the perfection of patience (kṣānti-pāramitā) is expounded by the Tathāgata as not the perfection of patience; therefore it is named the perfection of patience. Why? Subhūti, formerly when King Kali dismembered my body, at that time I was free from the idea of an ego, a person, a sentient being, and a life span. If in the past I had possessed notions of an ego, a person, a sentient being, or a life span, I would have given rise to anger and hatred. Subhūti, I recall that for five hundred lifetimes in the past I was an ascetic cultivating patience (kṣāntivādin); in those lifetimes I had no notion of an ego, a person, a sentient being, or a life span."}

{align:justify|"Therefore, Subhūti, a Bodhisattva should leave behind all marks and bring forth the mind of Anuttarā Samyaksambodhi. He should not give rise to a mind abiding in forms, nor abiding in sounds, smells, tastes, tangibles, or dharmas. He should bring forth a mind that abides nowhere. If the mind abides, it is non-abiding. Therefore the Buddha says a Bodhisattva's mind should not abide in form when practicing giving. Subhūti, for the benefit of all sentient beings, a Bodhisattva should practice giving in this manner. The Tathāgata says all marks are non-marks, and all sentient beings are non-sentient beings."}

{align:justify|"Subhūti, the Tathāgata speaks what is true, what is real, what is accordant with reality; he does not speak falsehood, nor does he speak deceit. Subhūti, the Dharma attained by the Tathāgata is neither real nor unreal."}

{align:justify|"Subhūti, if a Bodhisattva's mind abides in dharmas while practicing giving, he is like a person entering darkness who sees nothing. If a Bodhisattva's mind does not abide in dharmas while practicing giving, he is like a person with eyes in the bright sunshine, seeing all kinds of colors clearly."}

{align:justify|"Subhūti, in the future, if good men and good women can receive, uphold, read, and recite this Sūtra, the Tathāgata with his Buddha wisdom fully knows and sees them all, and they will accomplish immeasurable and boundless merit."}

{align:center|**Section 15: The Merit of Upholding the Sūtra**}

{align:justify|"Subhūti, if a good man or good woman in the morning gives up bodies as numerous as the sands of the Ganges; and at noon gives up bodies as numerous as the sands of the Ganges; and in the evening gives up bodies as numerous as the sands of the Ganges, continuing thus for countless hundreds of thousands of myriad kalpas; and if another person hears this Sūtra and believes it with open heart without doubting, his merit would surpass the former. How much more so if one writes, receives, upholds, reads, recites, and expounds it for others!"}

{align:justify|"Subhūti, to summarize: this Sūtra possesses inconceivable, immeasurable, and boundless merit. The Tathāgata expounds it for those who set out on the Great Vehicle; he expounds it for those who set out on the Supreme Vehicle. If someone can receive, uphold, read, recite, and broadly explain it to others, the Tathāgata fully knows and sees them all: they will achieve immeasurable, incalculable, boundless, and inconceivable merit. Such persons bear upon their shoulders the Tathāgata's Anuttarā Samyaksambodhi."}

{align:justify|"Why? Subhūti, one who delights in lesser teachings is attached to the view of an ego, a person, a sentient being, and a life span, and cannot hear, receive, read, recite, or explain this Sūtra to others. Subhūti, wherever this Sūtra is found, all worldly gods, humans, and asuras should make offerings to it. Know that this place is a sacred stūpa, which all should reverently circumambulate and honor with flowers and incense."}

{align:center|**Section 16: Purifying Karmic Obstacles**}

{align:justify|"Furthermore, Subhūti, if good men and good women who receive, uphold, read, and recite this Sūtra are despised or mistreated by others, their evil karma from past lives that would have condemned them to the lower realms will be eradicated through the contempt of others in this life, and they will attain Anuttarā Samyaksambodhi."}

{align:justify|"Subhūti, I remember in the past, throughout countless kalpas before Dīpaṃkara Buddha, I met eighty-four thousand quadrillion nayutas of Buddhas, made offerings to them all, and served them without fault. Yet if someone in the final Dharma age can receive, uphold, read, and recite this Sūtra, the merit they obtain compared with my past merit of making offerings to all those Buddhas is more than a hundredfold, a thousandfold, a hundred-thousandfold, beyond any calculation or parable."}

{align:justify|"Subhūti, if I were to expound in full the merit acquired by good men and good women in the final age who receive, uphold, read, and recite this Sūtra, those who hear it might become confused, doubt, and disbelieve. Subhūti, know that the meaning of this Sūtra is inconceivable, and its karmic retribution is likewise inconceivable."}

{align:center|**Section 17: Ultimately Selfless**}

{align:justify|At that time, Subhūti addressed the Buddha: "World-Honored One, when good men and good women resolve to attain Anuttarā Samyaksambodhi, how should they abide their minds, and how should they subdue their thoughts?"}

{align:justify|The Buddha told Subhūti: "One who resolves upon Anuttarā Samyaksambodhi should give rise to this thought: 'I must lead all sentient beings to Parinirvāṇa; yet when all have been liberated, not a single sentient being has in truth been liberated.' Why? Subhūti, if a Bodhisattva retains the notion of an ego, a person, a sentient being, or a life span, he is not a Bodhisattva. Why? Subhūti, in truth there is no dharma by which one resolves upon Anuttarā Samyaksambodhi."}

{align:justify|"Subhūti, what do you think? When the Tathāgata was with Dīpaṃkara Buddha, was there any Dharma by which he attained Anuttarā Samyaksambodhi?"}
{align:justify|"No, World-Honored One. As I understand the meaning of the Buddha's words, there was no Dharma by which the Buddha attained Anuttarā Samyaksambodhi."}

{align:justify|The Buddha said: "So it is, so it is, Subhūti! In truth there was no Dharma by which the Tathāgata attained Anuttarā Samyaksambodhi. If there had been such a Dharma, Dīpaṃkara Buddha would not have bestowed the prophecy upon me: 'In a future age you will become a Buddha named Śākyamuni.' Because in reality there is no Dharma for attaining Anuttarā Samyaksambodhi, Dīpaṃkara Buddha bestowed the prophecy upon me. Why? 'Tathāgata' means the Suchness of all dharmas."}

{align:justify|"If anyone says that the Tathāgata attained Anuttarā Samyaksambodhi, Subhūti, in truth there is no Dharma by which the Buddha attained it. The Anuttarā Samyaksambodhi attained by the Tathāgata is neither real nor false. Therefore the Tathāgata says that all dharmas are the Buddha Dharma. Subhūti, what are called all dharmas are not all dharmas; therefore they are named all dharmas."}

{align:justify|"Subhūti, consider a person whose body is tall and great."}
{align:justify|Subhūti said: "World-Honored One, what the Tathāgata calls a tall and great body is not a great body; therefore it is called a great body."}

{align:justify|"Subhūti, a Bodhisattva is likewise. If he says, 'I shall liberate countless beings,' he is not a Bodhisattva. Why? Subhūti, in reality there is no dharma called a Bodhisattva. Therefore the Buddha says that all dharmas are without an ego, without a person, without a sentient being, and without a life span. Subhūti, if a Bodhisattva says, 'I shall adorn Buddha lands,' he is not a Bodhisattva. Why? The Tathāgata says adornments of Buddha lands are not adornments; therefore they are named adornments. Subhūti, when a Bodhisattva thoroughly comprehends selflessness in dharmas, the Tathāgata calls him a true Bodhisattva."}

{align:center|**Section 18: One Integrity of Vision**}

{align:justify|"Subhūti, what do you think? Does the Tathāgata possess the physical eye?"}
{align:justify|"Yes, World-Honored One, the Tathāgata possesses the physical eye."}
{align:justify|"Subhūti, does the Tathāgata possess the divine eye?"}
{align:justify|"Yes, World-Honored One, the Tathāgata possesses the divine eye."}
{align:justify|"Subhūti, does the Tathāgata possess the wisdom eye?"}
{align:justify|"Yes, World-Honored One, the Tathāgata possesses the wisdom eye."}
{align:justify|"Subhūti, does the Tathāgata possess the Dharma eye?"}
{align:justify|"Yes, World-Honored One, the Tathāgata possesses the Dharma eye."}
{align:justify|"Subhūti, does the Tathāgata possess the Buddha eye?"}
{align:justify|"Yes, World-Honored One, the Tathāgata possesses the Buddha eye."}

{align:justify|"Subhūti, what do you think? Regarding the sand in the Ganges River, does the Buddha speak of it as sand?"}
{align:justify|"Yes, World-Honored One, the Tathāgata speaks of it as sand."}

{align:justify|"Subhūti, what do you think? If there were as many Ganges Rivers as there are grains of sand in the Ganges, and if there were as many Buddha worlds as there are grains of sand in all those rivers, would those worlds be many?"}
{align:justify|"Extremely many, World-Honored One!"}

{align:justify|The Buddha told Subhūti: "The myriad thoughts in the minds of all the living beings in all those worlds are fully known to the Tathāgata. Why? The Tathāgata says that all minds are not minds; therefore they are named minds. Why is this so? Subhūti, past mind cannot be grasped, present mind cannot be grasped, and future mind cannot be grasped."}

{align:center|**Section 19: The Dharma Realm Universally Transformed**}

{align:justify|"Subhūti, what do you think? If someone filled the three-thousand great thousand worlds with the seven precious jewels and gave them in alms, would that person obtain great merit from such causes and conditions?"}
{align:justify|"Yes, World-Honored One. From such causes and conditions, that person would obtain great merit."}
{align:justify|"Subhūti, if merit were real, the Tathāgata would not say that the merit obtained is great. Because merit is non-existent, the Tathāgata says that the merit is great."}

{align:center|**Section 20: Transcending Form and Appearance**}

{align:justify|"Subhūti, what do you think? Can the Buddha be seen by the perfection of his physical form?"}
{align:justify|"No, World-Honored One. The Tathāgata should not be seen by the perfection of his physical form. Why? The Tathāgata says that the perfection of physical form is not perfection; therefore it is named perfection of physical form."}

{align:justify|"Subhūti, what do you think? Can the Tathāgata be seen by the perfection of all marks?"}
{align:justify|"No, World-Honored One. The Tathāgata should not be seen by the perfection of marks. Why? The Tathāgata says the perfection of marks is not perfection; therefore it is named perfection of marks."}

{align:center|**Section 21: Non-Expounding as Expounding**}

{align:justify|"Subhūti, do not say that the Tathāgata has the thought: 'I have expounded the Dharma.' Do not entertain such a thought. Why? If someone says the Tathāgata has expounded the Dharma, he slanders the Buddha, because he does not understand what I teach. Subhūti, in expounding the Dharma, there is no Dharma that can be expounded; this is named expounding the Dharma."}

{align:justify|At that time, the Venerable Subhūti addressed the Buddha: "World-Honored One, will there be living beings in future ages who hear this Dharma and bring forth faith?"}
{align:justify|The Buddha said: "Subhūti, they are neither living beings nor non-living beings. Why? Subhūti, the Tathāgata says living beings are not living beings; therefore they are named living beings."}

{align:center|**Section 22: Unattainable Enlightenment**}

{align:justify|Subhūti said to the Buddha: "World-Honored One, when the Buddha attained Anuttarā Samyaksambodhi, was nothing attained?"}
{align:justify|The Buddha said: "So it is, so it is, Subhūti! Regarding Anuttarā Samyaksambodhi, I did not attain the slightest dharma whatsoever; therefore it is named Anuttarā Samyaksambodhi."}

{align:center|**Section 23: The Pure Mind Practicing Good**}

{align:justify|"Furthermore, Subhūti, this Dharma is equal and level, without high or low; therefore it is named Anuttarā Samyaksambodhi. Practicing all wholesome dharmas without an ego, without a person, without a sentient being, and without a life span, one attains Anuttarā Samyaksambodhi. Subhūti, what are called wholesome dharmas are spoken of by the Tathāgata as not wholesome dharmas; therefore they are named wholesome dharmas."}

{align:center|**Section 24: Blessings and Wisdom Incomparable**}

{align:justify|"Subhūti, if someone collected piles of the seven precious jewels as vast as all the Mount Sumerus in the three-thousand great thousand worlds and gave them in alms, and another person received, upheld, read, recited, and explained to others even a four-line verse from this Prajñāpāramitā Sūtra, the former merit would not equal a hundredth part, a thousandth part, a ten-thousandth part, or any conceivable fraction or comparison of the latter."}

{align:center|**Section 25: Transforming Without Transforming**}

{align:justify|"Subhūti, what do you think? Do not say that the Tathāgata thinks: 'I shall liberate living beings.' Subhūti, do not think thus. Why? In reality there are no living beings liberated by the Tathāgata. If there were living beings liberated by the Tathāgata, the Tathāgata would possess an ego, a person, a sentient being, and a life span. Subhūti, the Tathāgata speaks of the existence of an ego as non-ego, yet ordinary people regard it as an ego. Subhūti, the Tathāgata says ordinary people are not ordinary people; therefore they are named ordinary people."}

{align:center|**Section 26: The Dharmakāya Transcending Marks**}

{align:justify|"Subhūti, what do you think? Can the Tathāgata be contemplated through the thirty-two marks?"}
{align:justify|Subhūti said: "So it is, so it is. One can contemplate the Tathāgata through the thirty-two marks."}
{align:justify|The Buddha said: "Subhūti, if the Tathāgata could be contemplated through the thirty-two marks, a Wheel-Turning Sage King would be a Tathāgata."}
{align:justify|Subhūti addressed the Buddha, saying: "World-Honored One, as I understand the meaning of your words, one should not contemplate the Tathāgata through the thirty-two marks."}

{align:justify|At that time, the World-Honored One spoke this gāthā:

{align:center|*If you see me in form,
Or seek me through sound,
You walk on a heterodox path,
And cannot behold the Tathāgata.*}}

{align:center|**Section 27: Neither Annihilation Nor Extinction**}

{align:justify|"Subhūti, if you think: 'The Tathāgata did not attain Anuttarā Samyaksambodhi by means of the perfection of marks,' Subhūti, do not entertain the thought: 'The Tathāgata did not attain Anuttarā Samyaksambodhi through the perfection of marks.' Subhūti, if you have this thought, you would be claiming that those who resolve on Anuttarā Samyaksambodhi declare the annihilation and extinction of all dharmas. Do not think thus! Those who resolve on Anuttarā Samyaksambodhi do not declare that dharmas are annihilated or extinct."}

{align:center|**Section 28: Neither Grasping Nor Clinging**}

{align:justify|"Subhūti, if a Bodhisattva filled worlds as numerous as the sands of the Ganges with the seven precious jewels and gave them in alms, and another person realized that all dharmas are selfless and attained patience, the merit of the latter Bodhisattva would surpass the former. Why? Subhūti, because Bodhisattvas do not receive merit."}

{align:justify|Subhūti addressed the Buddha: "World-Honored One, how is it that Bodhisattvas do not receive merit?"}
{align:justify|"Subhūti, Bodhisattvas do not greedily crave or cling to the merit they create; therefore it is said they do not receive merit."}

{align:center|**Section 29: Majestic Demeanor of Stillness**}

{align:justify|"Subhūti, if anyone says that the Tathāgata comes, goes, sits, or lies down, that person does not understand the meaning of my teaching. Why? The Tathāgata comes from nowhere and goes nowhere; therefore he is named the Tathāgata."}

{align:center|**Section 30: The Principle of Unity and Diversity**}

{align:justify|"Subhūti, if a good man or good woman crushed the three-thousand great thousand worlds into fine dust, what do you think? Would those motes of dust be many?"}
{align:justify|Subhūti said: "Extremely many, World-Honored One! Why? If these particles were real, the Buddha would not speak of them as particles of dust. Why? The particles of dust spoken of by the Buddha are not particles of dust; therefore they are named particles of dust. World-Honored One, the three-thousand great thousand worlds spoken of by the Tathāgata are not worlds; therefore they are named worlds. Why? If worlds were real, they would be an integrated unity. The Tathāgata says an integrated unity is not an integrated unity; therefore it is named an integrated unity."}

{align:justify|"Subhūti, an integrated unity is ineffable, yet ordinary people greedily cling to its appearances."}

{align:center|**Section 31: Neither Cognition Nor Knowledge**}

{align:justify|"Subhūti, if someone says that the Buddha speaks of the view of an ego, a person, a sentient being, and a life span, what do you think? Does that person understand the meaning of my words?"}
{align:justify|"No, World-Honored One, that person does not understand the meaning of the Tathāgata's teaching. Why? The view of an ego, a person, a sentient being, and a life span spoken of by the Tathāgata is not the view of an ego, a person, a sentient being, or a life span; therefore it is named the view of an ego, a person, a sentient being, and a life span."}

{align:justify|"Subhūti, one who resolves upon Anuttarā Samyaksambodhi should know, perceive, believe, and understand all dharmas thus, without giving rise to the notion of dharmas. Subhūti, what is called the notion of dharmas is spoken of by the Tathāgata as not the notion of dharmas; therefore it is named the notion of dharmas."}

{align:center|**Section 32: The Transformation Body Is Not Real**}

{align:justify|"Subhūti, if someone filled immeasurable, incalculable worlds with the seven precious jewels and gave them in alms, and a good man or good woman resolving on the Bodhisattva path took from this Sūtra even a four-line verse, receiving, upholding, reading, reciting, and explaining it to others, their merit would far surpass the former."}

{align:justify|"How should one explain it to others? Without clinging to marks, unmoving in True Suchness. Why?

{align:center|*All conditioned dharmas
Are like a dream, an illusion, a bubble, a shadow,
Like dew and like a lightning flash:
Contemplate them thus!*}}

{align:justify|When the Buddha finished speaking this Sūtra, the Elder Subhūti, together with the bhikṣus, bhikṣuṇīs, upāsakas, upāsikās, and all the gods, humans, and asuras of the world, having heard what the Buddha said, rejoiced greatly, believed, received, and practiced it.}

{align:center|**NAMO PRAJÑĀ ASSEMBLY BUDDHAS AND BODHISATTVAS MAHASATTVAS.** (3 times)}

{align:center|**VAJRA DHĀRAṆĪ (KIM CANG CHÂN NGÔN)**}
{align:center|Oṃ khuru khuru jaya-mukhe svāhā. (Recite 7 times)}

{align:center|**UNIVERSAL DEDICATION MANTRA (PHỔ HỒI HƯỚNG CHÂN NGÔN)**}
{align:center|Oṃ smara smara vimāna-sāra-mahā-cakra hūṃ. (Recite 7 times)}

{align:justify|First Dedication: May every thought accord with True Suchness and Reality.
Second Dedication: May Unexcelled Buddhahood and Bodhi be perfected in every thought.
Third Dedication: May all living beings throughout the Dharma Realm be reborn together in the Pure Land.}

{align:center|**PRAISE OF THE VAJRA SŪTRA**}

{align:justify|The merit of the Vajra Sūtra is boundless,
Its wondrous principle beyond all measure.
The Tathāgata expounds it widely for the great assembly;
Those who receive and uphold it awaken to the eternal truth.
With varied blossoms and fragrant incense,
Universally scattering offerings to the King of the Dharma.}

{align:center|**NAMO SŪTRA ASSEMBLY AT JETA GROVE BUDDHAS AND BODHISATTVAS MAHASATTVAS.** (3 times)}

{align:center|**THE HEART OF PRAJÑĀPĀRAMITĀ SŪTRA**}
{align:center|*(MAHĀ PRAJÑĀPĀRAMITĀ HṚDAYA SŪTRA)*}

{align:justify|When Bodhisattva Avalokiteśvara was practicing the profound Prajñāpāramitā, he illuminated the Five Skandhas and saw that they are all empty, thereby transcending all suffering and distress.}

{align:justify|Śāriputra, form is not different from emptiness, emptiness is not different from form; form is emptiness, emptiness is form. Feeling, perception, volition, and consciousness are also like this.}

{align:justify|Śāriputra, all dharmas are marked by emptiness: they are neither produced nor destroyed, neither defiled nor pure, neither increasing nor decreasing. Therefore, in emptiness there is no form, no feeling, perception, volition, or consciousness; no eyes, ears, nose, tongue, body, or mind; no sights, sounds, smells, tastes, tangibles, or dharmas; no realm of the eye up to no realm of mind-consciousness; no ignorance and no end of ignorance, up to no aging and death and no end of aging and death; no suffering, accumulation, cessation, or path; no wisdom and no attainment.}

{align:justify|Because there is nothing to be attained, the Bodhisattva relies on Prajñāpāramitā, and his mind is without hindrance. Because there is no hindrance, there is no fear; distant from all inverted, deluded thoughts, he ultimately attains Nirvāṇa. All Buddhas of the three periods rely on Prajñāpāramitā and attain Anuttarā Samyaksambodhi.}

{align:justify|Therefore know that the Prajñāpāramitā is the Great Transcendent Mantra, the Great Bright Mantra, the Unsurpassed Mantra, the Unequaled Mantra, which can remove all suffering and is true, not false.}

{align:justify|Hence, speak the Prajñāpāramitā Mantra; speak the mantra thus:}

{align:center|**Gate gate pāragate pārasaṃgate bodhi svāhā.** (3 times)}

{align:center|**THE THREE REFUGES**}

{align:center|I take refuge in the Buddha, wishing that all sentient beings understand the Great Way and bring forth the supreme mind.
I take refuge in the Dharma, wishing that all sentient beings deeply penetrate the Sutra Treasury and attain wisdom like the ocean.
I take refuge in the Sangha, wishing that all sentient beings lead the great assembly in harmony, without any obstacle.}

{align:center|**DEDICATION OF MERIT**}

{align:center|May the merit and virtue accrued from this recitation
Adorn the Buddha's Pure Lands,
Repaying fourfold kindness above,
And relieving suffering in the three paths below.
May all who see or hear of this
Bring forth the Bodhi Mind,
And when this retribution body is finished,
Be born together in the Land of Ultimate Bliss.}
`;

// 1. Update articles-en.json
const articlesEnPath = 'static/offline-data/articles-en.json';
const articlesEn = JSON.parse(fs.readFileSync(articlesEnPath, 'utf8'));

articlesEn['tt_1781359043077'] = {
  tieu_de: 'THE DIAMOND PERFECTION OF WISDOM SUTRA (VAJRACCHEDIKA)',
  tom_tat: 'The Diamond Perfection of Wisdom Sutra, translated into Chinese by Tripitaka Master Kumarajiva, with complete opening incense praise, purification mantras, invocation of the eight vajras and four bodhisattvas, 32 sections, Vajra Dharani, Heart Sutra, and dedication of merit. (Authoritative English translation.)',
  noi_dung: kimCangEnglishText
};

fs.writeFileSync(articlesEnPath, JSON.stringify(articlesEn, null, 2), 'utf8');
console.log('Successfully updated articles-en.json with Kim Cang!');

// 2. Also write static/offline-data/chapters-en/tt_1781359043077.json
const chapterData = [{
  id: 'tt_1781359043077_full',
  bai_viet_id: 'tt_1781359043077',
  so_thu_tu: 0,
  tieu_de: 'The Diamond Perfection of Wisdom Sutra (Complete Liturgy & 32 Sections)',
  tom_tat: 'Complete Vajracchedika Prajnaparamita Sutra in 32 sections with full recitation liturgy.',
  noi_dung: kimCangEnglishText
}];

fs.writeFileSync('static/offline-data/chapters-en/tt_1781359043077.json', JSON.stringify(chapterData, null, 2), 'utf8');
console.log('Successfully wrote static/offline-data/chapters-en/tt_1781359043077.json!');

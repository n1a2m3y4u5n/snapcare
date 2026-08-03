# FINAL PROJECT PROPOSAL
## \<The 16th e-ICON World Contest\>

| | |
|---|---|
| **[Team No.] Global Team Name** | [H1] SnapCare |
| **Web App Name** | SnapCare |
| **Name of Korean Students** | Yunsu NAM · Dohun KIM |
| **Name of International Students** | Cristian RUDICO · Daniel STANCHEVICI (Moldova) |
| **Related SDGs** | Target 3.4 Noncommunicable diseases · Target 3.8 Universal health coverage · Target 3.d Health risk management |
| **URL** | Github Repository: https://github.com/16th-eicon-contest/h1-SnapCare<br>Deployment URL: https://snapcare.fly.dev |

---

## □ Summary of Web App
SnapCare is a web app that answers a single photograph of a prescription, a nutrition label, a medicine or a meal with a picture, a spoken sentence and one colour, so that adults with low literacy and older adults who cannot read, or read only with difficulty, can take their medicine and choose their food on their own. Worldwide 739 million adults lack basic literacy skills and even across 31 developed countries 18% of adults fall below the most elementary level, and these people are cut off from the content of a prescription from the moment they receive it, which exposes them to dosing errors, treatment failure and antibiotic resistance. The app never asks the user to read or type anywhere on screen, using two engines we built ourselves, SIGIL, which composes pictograms through a grammar of 78 morphemes, and VOCA, which reconstructs spoken instructions, and its verdicts are computed on the device from thresholds derived from the user's age and conditions, so the app works without an internet connection.

---

## □ Problem Statement and Background

### 1.1 The size and trend of the non-literate population

There are 739 million non-literate adults worldwide, and roughly two thirds of them, 466 million, are women (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). The adult literacy rate rose from 86% in 2015 to 88% in 2024, so on the numbers alone the situation is improving (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025).

There are regions, however, where the improvement in the rate has not kept pace with population growth. In sub-Saharan Africa the literacy rate rose from 65% to 69% over the same period, yet the absolute number of non-literate adults grew from 196 million to 225 million (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). Central and Southern Asia follows with 347 million, the second largest total after sub-Saharan Africa (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). More than half of all non-literate adults, 441 million people, are concentrated in ten countries (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025).

This is therefore not the kind of problem that time resolves on its own. While education expands, the number of people collecting medicine today does not fall.

Averages hide the size of the problem. The fifteen countries with the lowest adult literacy rates fall between 29% and 60%, and Chad stands at 28% (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025).

The values below are not period averages. Each is **the value from the single most recent survey year available for that country within the 2015 to 2024 census round**, so the reference year differs from country to country. National literacy rates vary considerably with survey year and definition (the same country can differ by more than 10 percentage points across different compilations), so only values from within a single source are used here, which keeps them comparable with one another.

[Table 1] Countries with low adult literacy rates (2015–2024 census round; UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, 2025)

| Country | Adult literacy | Country | Adult literacy |
|---|---|---|---|
| Chad | 28% | Guinea | 48% |
| South Sudan | 35% | Liberia | 48% |
| Burkina Faso | 37% | Ethiopia | 51.8% |
| Afghanistan | 37% | Somalia | 54% |
| Niger | 38% | Guinea-Bissau | 56% |
| Central African Republic | 38% | Benin | 58% |
| Mali | 44% | Pakistan | 58% |
| | | Sierra Leone | 60% |

In Chad seven adults in ten cannot read a prescription. In these countries a paper prescription is close to a literally blank sheet.

The countries with the worst rates and the countries with the most people, however, largely do not overlap. More than half of all non-literate adults, 441 million, are concentrated in ten countries, and those ten are mostly populous ones.

[Table 2] The ten countries with the most non-literate adults (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025)

| Country | Non-literate adults | Country | Non-literate adults |
|---|---|---|---|
| India | 191 million | Ethiopia | 30 million |
| Pakistan | 59 million | Bangladesh | 25 million |
| Nigeria | 43 million | Egypt | 19 million |
| China | 38 million | Afghanistan | 14 million |
| | | Brazil | 11 million |
| | | DR Congo | 11 million |

**Ten countries total 441 million (60% of the worldwide 739 million)**

Placing the two tables side by side shows what kind of problem this is. Only three countries appear in both Table 1 and Table 2: Pakistan, Ethiopia and Afghanistan. The rest are either countries with the world's worst rates whose small populations keep them out of the totals (Chad, South Sudan, Guinea-Bissau) or countries whose rates are near the world average but whose populations make the head count overwhelming (India, China, Brazil).

This distinction affects the design. Where the rate is high the app is dealing with the condition of the majority, and where the head count is high it is dealing with a minority that is nonetheless very large in absolute terms. India's literacy rate is 81%, close to the world average, but that remaining 19% is 191 million people. Either way the problem at the moment one person collects their medicine is the same, and it is the head count rather than the rate that sets the size of what this app has to reach.

The distribution is also uneven within a single country. In some sub-Saharan African countries **the literacy rate among older women is 31% against 55% among older men**, while among men in parts of Europe and North America it is 99% (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025).

We record here that the experts we asked answered in a direction that cuts against this statistic. Of the 35 respondents in §5.7, 15 answered that they "almost never" encounter someone unable to read a written medication instruction, and 4 that they encounter such a person almost daily. Half the respondents work in Korea, so this answer reflects the within-country distribution seen in §1.2 rather than contradicting the world figures of §1.1. Professor Hwi-Yeol Yun of Chungnam National University College of Pharmacy set down the circumstance directly.

> "Among Koreans the rate of not being able to read is close to zero, so it is mainly foreign patients. We therefore explain in English."
> (Professor Hwi-Yeol Yun, College of Pharmacy, Chungnam National University)

In a country with high literacy the problem does not disappear; it appears with a different face. Instead of people who cannot read there are people handed a paper that is not in their language, and the pharmacist fills the gap in a third language.

What this distribution indicates is not that the target should be narrowed but where the need is greatest. SnapCare does not require reading, so people who can read are free to use it as well, and missing a prescription instruction in fact happens independently of literacy (§1.3). If one asks where the same app makes the largest difference, though, it is where gaps like these exist, and that is why field evaluation is part of the plan (§5.10).

![Figure 1](fig/chart09_country_literacy.png)

**[Figure 1]** The fifteen countries with the lowest adult literacy rates (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). The distance from the world average of 88% is the point of this figure. In these countries the people who cannot read a prescription are the majority.

![Figure 2](fig/chart01_literacy.png)

**[Figure 2]** Literacy rate and number of non-literate adults in sub-Saharan Africa (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). Bars are absolute numbers, the line is the rate. The two axes moving in opposite directions is the point of this section. The rate rose 4 percentage points while the head count grew by 29 million. By the rate this is improvement, by the head count it is deterioration. This is the evidence that the problem is not one that time will resolve.


### 1.2 The distribution of health literacy

Being able to read letters and being able to understand health information are different things. The HLS19 survey, which interviewed 42,445 people across 17 European countries, measured general health literacy on four levels (excellent, sufficient, problematic, inadequate) and reported that a substantial share of low health literacy remained in every participating country (HLS19 Consortium of the WHO Action Network M-POHL, *International Report on the Methodology, Results, and Recommendations of the European Health Literacy Population Survey 2019–2021*, Austrian National Public Health Institute, Vienna, 2021). That report states explicitly, however, that collection period and method differed by country and that cross-country comparison should be made with caution, and it does not put forward a single pooled figure for the 17 countries. Korean data are therefore used here in place of a pooled percentage.

[Table 3] Health literacy among Korean adults (Korea National Health and Nutrition Examination Survey, 2023)

| Group | Sufficient level | Complement | Source |
|---|---|---|---|
| Korea, aged 65+ | 40.3% | **59.7%** | KNHANES (2023) |
| Korea, all adults | 60.4% | 39.6% | KNHANES (2023) |
| Korea, lower income | 54.4% | 45.6% | KNHANES (2023) |
| Korea, upper income | 66.3% | 33.7% | KNHANES (2023) |

An "adequate level" of health literacy means a score of 30 or above out of 40 (Korea Disease Control and Prevention Agency, *Korea National Health and Nutrition Examination Survey, 9th cycle, year 2*, 2023).

What Table 3 shows is that this problem divides more sharply within a country than between countries. Among Korean adults overall, 60.4% have sufficient health literacy, but among those aged 65 and over the figure falls to 40.3%. Taking the complements, that is 59.7% against 39.6%, a gap of 20.1 percentage points. Splitting by income gives the same direction, 54.4% in the lower group against 33.7% in the upper. This is therefore not a problem belonging to "countries where people cannot read" but one that appears in any country. That is why SnapCare is not an app for one particular region. There are people who miss prescription instructions in a country with 88% literacy, and there are simply more of them in a country at 40%. The team is Korean and Moldovan not because those are the two target populations but because the same app can be tested in two different environments.

![Figure 3](fig/chart02_health_literacy.png)

**[Figure 3]** Share of Korean adults without sufficient health literacy (Korea Disease Control and Prevention Agency, *Korea National Health and Nutrition Examination Survey, 9th cycle, year 2*, 2023). Against 39.6% overall, the figure for those aged 65 and over is 59.7%, higher by 20.1 percentage points. Splitting by income gives a difference of 11.9 percentage points. That this problem divides more sharply within a country than between countries is the point of this figure.


Measuring literacy directly rather than by self-report makes the picture worse. In the Programme for the International Assessment of Adult Competencies (PIAAC), covering 31 developed countries, **18% of adults did not reach the most elementary level in literacy, numeracy and adaptive problem solving**, and adult literacy in these countries has stagnated or declined since 2012 (OECD, *Programme for the International Assessment of Adult Competencies*, cited in UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). The distance between the self-report "I can read" and the ability "I can follow the instruction on a medicine packet" appears here.

Nor is this particular to Korea. The OECD, pooling data from 18 countries, wrote that at least one third show low health literacy, and the same report, citing United States research, put the additional cost arising from low health literacy at 3 to 5% of total annual health expenditure (Moreira, L., "Health literacy for people-centred care: Where do OECD countries stand?", *OECD Health Working Papers*, No. 107, DELSA/HEA/WD/HWP(2018)4, 2018).

That the figure is one third matters because it speaks to a different layer than the non-literacy rate in §1.1. These 18 countries are places where being unable to read letters is rare, and even so one in three has difficulty handling health information.

This gap carries through to clinical outcomes. A systematic review synthesising 96 studies reported that low health literacy is consistently associated with increased hospitalisation, greater use of emergency care, lower uptake of mammography and influenza vaccination, poorer ability to demonstrate taking medications appropriately, and poorer ability to interpret labels and health messages (Berkman, N. D., Sheridan, S. L., Donahue, K. E., Halpern, D. J. & Crotty, K., "Low health literacy and health outcomes: an updated systematic review," *Annals of Internal Medicine*, 155(2):97–107, 2011). For mortality, the association was confirmed among older adults.

Observation in the field points at the same place as this literature. Of the nine respondents in the nursing and public health segment of §5.7, eight answered that people who cannot read are not receiving medication information properly (3 "yes", 5 "partly"). And two respondents widened the scope beyond literacy.

> "I have not had many such occasions, but there are also many people who, even knowing how to read, are not receiving proper medication guidance."
> (Professor Namsoo Park, Hyupsung University)

> "I am not convinced anybody actually gets proper medication information."
> (Professor Celia, University of Pretoria)

The second is a broader claim than the premise this document sets out. We wrote that people who cannot read miss the information; this response says that people who can read miss it too. If that is right, the population this app addresses is wider than we defined, and at the same time it is not a problem this app alone resolves.

The two items in that list that overlap directly with our problem are the last two, the ability to demonstrate taking medications appropriately and the ability to interpret labels and health messages. If the earlier items are problems of access to care, these two are problems at the point where information is transferred, and they occur outside the consulting room. The policy blind spot taken up in §1.4 is exactly here.

### 1.3 The types of medication error and what they cost

Looking at which types medication errors cluster into narrows down what has to be fixed. In a study that observed the dispensing stage by direct observation, of 155 dispensing errors found by pharmacists 51 (32.9%) were omissions, 44 (28.4%) were dose errors and 36 (23.2%) were timing errors. These three alone account for 84.5% of the total (Anacleto, T. A., Perini, E., Rosa, M. B. & César, C. C., "Medication dispensing errors in a Brazilian hospital pharmacy," *Clinics*, 62(3):243–250, 2007).

[Table 4] Distribution of medication errors by type and the corresponding SnapCare pictogram morphemes

| Error type | Count | Share | Morpheme carrying that instruction |
|---|---|---|---|
| Omission | 51 | 32.9% | `finish_course` |
| Dose error | 44 | 28.4% | `qty_one` – `qty_five` |
| Timing error | 36 | 23.2% | `time_morning` – `time_night` |
| Other | 24 | 15.5% | — |

Based on 155 dispensing errors found by pharmacists (Anacleto, T. A., Perini, E., Rosa, M. B. & César, C. C., "Medication dispensing errors in a Brazilian hospital pharmacy," *Clinics*, 62(3):243–250, 2007).

We checked whether the same distribution appears in another country and another period. A meta-analysis pooling 36 studies (6,238 participants) of medication errors by Iranian nurses put the top two error types at wrong timing, 27.3% (95% CI 19–36), and wrong dose, 26.4% (95% CI 20–33) (Fathizadeh, H., Mousavi, S. S., Gharibi, Z., Rezaeipour, H. & Biojmajd, A. R., "Prevalence of medication errors and its related factors in Iranian nurses: an updated systematic review and meta-analysis," *BMC Nursing*, 23:175, 2024, doi:10.1186/s12912-024-01836-w). The top two are the same as those observed in one Brazilian hospital in 2007.

Two cautions belong beside that pairing. First, the stages differ: the earlier figures are errors pharmacists made while dispensing, the later ones errors nurses made while administering. Neither is an error a patient makes at home, and §1.4 takes up that gap separately. Second, heterogeneity in the Iranian data is very high (I² = 91–96). The values should not be carried across; only the recurrence of the ordering should be read from them.

There is a reason this section needs that recurrence even so. We designed the morpheme set to match this distribution (Table 8), and if the distribution had been an accident of one hospital in one year, the grounds for that design would fall away. That the top two are the same across seventeen years and two continents reduces the accident.

Table 4 shows that most errors cluster into three things: what, how much and when. All three are information that can be carried in a picture, and SnapCare's morpheme design follows exactly this distribution.

Because that distribution is now close to twenty years old, we asked the same thing again in §5.7. Asked what must not be wrong medically, the twelve pharmacy respondents chose dose and frequency most often at 7, with contraindications and interactions at 3 and route of administration and not stopping early at 1 each. The 28.4% dose errors in the 2007 dispensing record and twelve pharmacists in 2026 naming dose and frequency first point at the same place.

One respondent set down the reason as well. The explanation is given in speech, but what the patient can go back to afterwards is only the dose written on the label.

> "The patient is thoroughly explained/ counselled about the medication. However, it is only the dose that is written on the label which the patient can refer to when taking the medication."
> (Professor Atif Usman, The Islamia University of Bahawalpur)

A spoken explanation disappears the moment the patient leaves the pharmacy and only the paper remains. If they cannot read that paper, nothing remains.

One qualification is needed here. This distribution covers errors made on the dispensing side, not errors patients make at home, and the two stages cannot be treated as the same. The reason for grounding the design in these figures anyway is that if these three go wrong often at the dispensing stage, then these three are the information most easily lost in transfer. If trained pharmacists miss them in a controlled environment, there is no reason to expect a patient handed the same information in text alone to keep hold of it. We did not find data measuring the distribution at the patient stage directly, and this is recorded among the unverified items in §5.9.

![Figure 4](fig/chart03_error_types.png)

**[Figure 4]** Distribution by type of 155 dispensing errors found by pharmacists (Anacleto, T. A., Perini, E., Rosa, M. B. & César, C. C., "Medication dispensing errors in a Brazilian hospital pharmacy," *Clinics*, 62(3):243–250, 2007). Omission, dose and timing account for 84.5%. That all three are information which can be carried in a picture is the starting point of the SIGIL morpheme design, and `finish_course`, `qty_*` and `time_*` correspond to them respectively.


#### 1.3.1 Misreading measured on the patient side

The distribution above is a record from the dispensing side. What happens on the patient side has been measured separately.

In a study at three primary care clinics in the United States in which 395 adults were shown five actual pill bottle labels and asked whether they understood the instruction, correct understanding ranged from **67.1% to 91.1%** depending on the label. The sharpest result of that study lies elsewhere. Among low-literacy patients, **70.7% correctly restated the instruction "take two tablets twice daily" in words, but only 34.7% could actually demonstrate how many tablets to take in a day** (Davis, T. C. et al., "Literacy and misunderstanding prescription drug labels," *Annals of Internal Medicine*, 145(12):887–894, 2006).

Restating an instruction and acting on it are separate abilities, and reading the text aloud does not by itself close that gap. This is why SnapCare sends a picture of the action alongside the speech.

With liquid medicines the error appears as a visible quantity. In a randomised trial of caregivers giving liquid medicine to young children, **47.8% of the control group, who received standard counselling only, administered a dose more than 20% away from the one prescribed** (40.0% for as-needed medicines). Twenty percent is not a small number. For a medicine taken three times a day, three days is enough to be off by a full day's dose.

The worldwide annual cost associated with medication errors is about 42 billion US dollars, roughly 1% of total global health expenditure (World Health Organization, *Medication Without Harm: WHO Global Patient Safety Challenge*, WHO/HIS/SDS/2017.6, 2017). There are figures for the United States on its own. Avoidable health care costs arising from medication non-adherence are estimated at 100 to 300 billion dollars a year, which is 3% to 10% of total US health care spending. About 10% of hospitalisations among older adults may be attributed to non-adherence, and the majority of the costs attributed to non-adherence come from hospitalisations that could have been avoided (Iuga, A. O. & McGuire, M. J., "Adherence and health care costs," *Risk Management and Healthcare Policy*, 7:35–44, 2014, doi:10.2147/RMHP.S19801).

Three corrections made while carrying these figures over are set down here. We had taken them from a hospital's public-information page and written "100 billion in direct costs and as much as 300 billion including indirect costs", whereas the source does not divide direct from indirect and gives a range of avoidable costs. What we wrote as "at least 10% of hospitalisations" is limited in the source to hospitalisations among older adults. And the "roughly 125,000 deaths a year" we had beside them is not in this paper's abstract, so it is removed: it is a widely quoted number, but we could not confirm it at a primary source.

The World Health Organization's first global patient safety report, issued in 2024, measured this scale again. One patient in twenty worldwide (5%) experiences preventable medication-related harm, and close to a quarter of that harm is severe or life threatening. By region, Africa and South-East Asia are highest at 9% each (World Health Organization, *Global patient safety report 2024*, ISBN 978-92-4-009545-8, 2024).

In low- and middle-income countries there are 134 million adverse events in hospitals each year, and about 2.6 million people die as a result (WHO, *Global patient safety report 2024*).

Where the harm occurs is what fixes the place of this work. The World Health Organization reports that more than half of the harm arising in the course of care (one patient in twenty) is preventable, and that half of that preventable harm is medication related. Medication-related harm affects one patient in thirty, and more than a quarter of it is severe or life threatening. This harm is also more common outside hospital than inside it. **In primary and ambulatory care up to four patients in ten experience harm, and up to 80% of that harm (23.6% to 85%) is avoidable** (World Health Organization, *Patient safety* fact sheet).

What these figures point to together is that medication-related harm occurs outside the consulting room and in an avoidable form. That is the part SnapCare sets out to address. In low- and middle-income countries, deaths from unsafe care reach 4 in every 100 (WHO, *Patient safety*).

The cost estimates span a wide range, and the basis of the 300 billion dollar upper figure is disputed. Our purpose in citing these numbers is to give a sense of scale rather than to argue for any particular value, and the indicator on which this work claims improvement is not cost but the delivery success rate in §5.1.

### 1.4 International policy and its blind spot

In 2017 the World Health Organization declared Medication Without Harm as its third Global Patient Safety Challenge, setting a goal of reducing severe avoidable medication-related harm by 50% within five years (World Health Organization, *Medication Without Harm: WHO Global Patient Safety Challenge*, WHO/HIS/SDS/2017.6, 2017). It identified three priority areas: high-risk situations, polypharmacy and transitions of care (World Health Organization, *Medication Without Harm: WHO Global Patient Safety Challenge*, WHO/HIS/SDS/2017.6, 2017).

Seven years after that declaration, however, as of 2024 only **18% of WHO member states** have established national targets for reducing medication-related harm (World Health Organization, *Medication without harm: policy brief*, ISBN 978-92-4-006276-4, 2024).

The global patient safety report of the same year records that 74% of member states have endorsed the challenge and are implementing it (WHO, *Global patient safety report 2024*). The two figures do not contradict each other. The first counts countries that have set a reduction target as a number; the second counts countries that have accepted the challenge. In the same report, 24% have a national expert body for the challenge. That the count falls as one moves from endorsement to target and from target to a standing body shows how far down this policy has actually travelled.

![Figure 5](fig/chart12_policy_depth.png)

**[Figure 5]** How far Medication Without Harm has reached inside national systems (World Health Organization, *Global patient safety report 2024*, ISBN 978-92-4-009545-8, 2024). Seventy-four percent of member states have accepted the challenge; 18% have set a numerical reduction target. What to read here is the distance between declaration and implementation. The blind spot §1.4 describes exists not because there is no policy but because the policy has not come down this far.

A gap remains even after the instruction has been delivered. Adherence among patients with chronic disease averages 50% in developed countries and is lower in developing ones (World Health Organization, *Adherence to long-term therapies: evidence for action*, 2003). That figure was measured over populations including people who can read and who have been diagnosed, which also means this is not a problem that literacy alone accounts for.

The relationship between literacy and adherence itself is not on our side either. A meta-analysis pooling studies that measured the direct relationship between health literacy and medication adherence found the association statistically significant but **weak**, with weighted correlation coefficients between 0.056 and 0.072 (Zhang, N. J., Terry, A. & McHorney, C. A., "Impact of health literacy on medication adherence: a systematic review and meta-analysis," *Annals of Pharmacotherapy*, 48(6):741–751, 2014, doi:10.1177/1060028014526562). The authors suggest health literacy may mediate other determinants of adherence rather than setting adherence directly.

There is more direct evidence too. A multisite randomised controlled trial gave 315 adults with low health literacy the same chronic-disease self-management app, differing only in the reading difficulty of its text: third-grade level with audio narration, sixth-grade level, and eighth-grade level as the control. All three groups gained in activation, self-efficacy and health-related quality of life, but **there were no between-group differences and medication adherence did not change in any group** (Ownby, R. L., Simonson, M., Caballero, J. et al., "A mobile app for chronic disease self-management for individuals with low health literacy: A multisite randomized controlled clinical trial," *Journal of Ageing and Longevity*, 4(2):51–71, 2024, doi:10.3390/jal4020005).

That result stings because the design is close to ours. It targeted low health literacy, it simplified the text, and it added audio. Doing all three moved nothing. What that trial varied, however, is the difficulty of the text rather than the medium. Eighth-grade text and third-grade text are both text, and to someone who cannot read they are the same thing. We change the medium rather than the difficulty, so we do not take the result as applying directly, but we have no grounds for saying it does not apply either.

Read plainly, that means solving literacy raises adherence only a little. We do not claim to improve adherence (§5.9), so this does not undo the argument of this work, but the figure shows the distance between making something readable and making someone take it. What §5.1 measures is the first of those. The second we did not measure.

There is evidence for low- and middle-income countries taken on their own. Pooling 22 studies and 92,443 subjects, non-adherence to antihypertensive medication ranged from 25.45% (95% CI 17.23–33.76) to 63.35% (38.78–87.91) depending on the measurement instrument, and most of the studies located the cause in what the World Health Organization classifies as socioeconomic factors (Nielsen, J. Ø., Shrestha, A. D., Neupane, D. & Kallestrup, P., "Non-adherence to anti-hypertensive medication in low- and middle-income countries: a systematic review and meta-analysis of 92443 subjects," *Journal of Human Hypertension*, 31(1):14–21, 2017, doi:10.1038/jhh.2016.31).

That measuring the same phenomenon yields 25% with one instrument and 63% with another says something about the nature of this indicator. Any claim that this app improved adherence would have to state which instrument produced the number, and that is why the evaluation design in §5.10 fixes the instrument in advance.

This work does not claim to address that whole half. Many factors depress adherence, and several of them, such as the price of medicines and side effects, are beyond anything an app can touch. Among those factors, though, "could not read the instruction" is the kind an app can touch, and for someone who cannot read it is the first factor in the sequence. It has to be resolved before the remaining factors can even be weighed.

What happens inside the consulting room and the pharmacy we asked about directly in §5.7. The answers to what they do now when they meet a patient who cannot read show what this section is arguing.

> "Carefully explain to the patient, and have them repeat after me. Also talk to some other relative/caregiver of the patient."
> (Professor Samirah Abdu-Aguye, Ahmadu Bello University, Zaria)

> "Draw pictures. Show them pictures from internet at dispensing counter."
> (Sheron Sir Loon Goh, Pharmacy Lecturer, Department of Clinical Pharmacy and Pharmacy Practice)

Teach-back, telling the carer as well, finding pictures on the internet. None of the three was instructed by any system; each was invented by the person standing there. Professor Eun-Kyoung Kim of Kongju National University recorded the same scene from the patient's side.

> "The person concerned relies on the explanation of the pharmacist or of the family member who collected the medicine."
> (Professor Eun-Kyoung Kim, Kongju National University)

Why that place is the last one, Professor Katarina Vučićević of the University of Belgrade in Serbia set down in a single sentence.

> "The pharmacist is the last healthcare professional to interact with the patient before the medication reaches their hands and therefore has a crucial responsibility to ensure that appropriate information is given."
> (Professor Katarina Vučićević, University of Belgrade, Faculty of Pharmacy)

The pharmacist is the last clinician the patient meets before the medicine is in their hands. After that there is no one. What §1.4 calls "the last step" is what lies after that sentence.

This is what the blind spot of this section actually looks like. As far as the system reaches, people are filling it in, and what is empty begins where those people are not. The picture a pharmacist drew exists only inside the pharmacy; by the time the patient is home it is gone.

This gap does not exist because the problem has gone unrecognised. National policy and health systems reach as far as the clinic and the pharmacy, and the moment a patient opens the medicine packet at home lies outside that reach. The point at which SnapCare intervenes is exactly that last step.

The size of that last step has been measured. In a study following ambulatory patients aged 65 and over for 30,397 person-years, 1,523 adverse drug events occurred, of which 27.6% were preventable. Looking at which stage the 421 preventable errors arose in, prescribing accounts for 58.4% and monitoring for 60.8%, alongside **21.1% at the patient adherence stage** (Gurwitz, J. H. et al., "Incidence and preventability of adverse drug events among older persons in the ambulatory setting," *JAMA*, 289(9):1107–1116, 2003).

Here we set down, alongside it, evidence that cuts against our own argument. According to the same WHO 2024 report, about half of preventable medication harm (53%) arises at the prescribing stage and about a third (36%) at the monitoring stage. And in low- and middle-income countries the prescribing share approaches 80% (WHO, *Global patient safety report 2024*).

![Figure 6](fig/chart11_harm_stage.png)

**[Figure 6]** The stage at which preventable medication harm arises (World Health Organization, *Global patient safety report 2024*, ISBN 978-92-4-009545-8, 2024). Grey is the world, red is low- and middle-income countries. We include it because it is not a figure that favours us.

The centre of gravity of this harm therefore lies with the prescriber rather than the patient, and that skew is more pronounced in the regions we target. This app does not intervene at the prescribing stage.

Two reasons nonetheless led this work to the patient stage. First, harm at the prescribing stage occurs where clinicians are present, so it can be reduced through prescription-review systems and training, and that is in fact what the international policy cited earlier in §1.4 does. Second, the patient stage is the one place that policy does not reach. Being a smaller share and having someone able to act on it are different statements, and what we chose was not the larger share but the place where no one is standing.

That choice carries a cost. If the prescription is already wrong, this app delivers a wrong prescription accurately. In §5.7, nine of the twelve pharmacy respondents answering that a pharmacist must review every time is pointing at exactly this.

Returning to Gurwitz et al.'s three stages: prescribing and monitoring occur where clinicians are present, so there is room to fix them through systems. One of the remaining five occurs at the moment the patient takes out their medicine at home, and there is no one there to put the mistake right. Read alongside the finding in the same study that 42.2% of the 578 events classified as serious, life threatening or fatal were preventable, it is also clear that what is missed at this stage is not of a trivial kind.

Where that reach ends also shows up in staffing. Physician density is 2.9 per 10,000 population in sub-Saharan Africa against 38.3 in Central and Eastern Europe and Central Asia, a gap of more than thirteenfold (GBD 2019 Human Resources for Health Collaborators, "Measuring the availability of human resources for health," *The Lancet*, 399(10341):2129–2154, 2022). When consultation time shortens, the first thing cut is the explanation of how to take the medicine, and the share thus cut has to be made up by the patient reading the paper alone. That the regions with the lowest literacy and the regions with the least health workforce coincide is the structure of this problem.

### 1.5 The undiagnosed population as a precondition

Existing personalised health apps assume the user knows their own condition. That assumption does not hold.

Diabetes prevalence among adults aged 20 to 79 is 11.1%, reaching 589 million people, and of these **252 million, about 43%, do not know they have diabetes** (International Diabetes Federation, *IDF Diabetes Atlas*, 11th ed., 2025). Three in four adults with diabetes live in low- and middle-income countries. The figure is projected to reach 853 million (13%) by 2050, and in 2024 alone diabetes caused 3.4 million deaths, one every nine seconds (International Diabetes Federation, *IDF Diabetes Atlas*, 11th ed., 2025).

The number that matters to us here is not the prevalence but the **43%**. These people have never been to a hospital and received the name, so they answer no to the question "do you have diabetes." The app that receives that answer then gives them a verdict computed without regard to diabetes.

The same value appears again in hypertension. As of 2024, 1.4 billion adults aged 30 to 79 have hypertension (33% of that age range), and 600 million of them, 44%, are unaware that they have the condition. Those both diagnosed and treated number 630 million (44%), and only 320 million (23%) have their blood pressure actually under control (World Health Organization, *Hypertension* fact sheet, 2024 estimates).

That both conditions land on 43% and 44% is no coincidence. A diagnosis is a name attached only to people who can reach testing, and the conditions that keep people from testing largely overlap with the conditions of low literacy. A screen that asks about conditions by diagnostic name misses both of these groups in the same way.

Food allergy shows the same structure. Self-reported prevalence is consistently higher than clinically confirmed prevalence, which suggests a substantial number of people without access to diagnostic means. In the United States about 18 million adults, 7 in every 100, have a food allergy (Food Allergy Research & Education, *Food Allergy Facts and Statistics*, 2024).

The question "what are you allergic to" is therefore a question only someone who has been tested can answer. Leaving that assumption in place filters out, at the very first screen, the people who most need the help.

There is one further assumption. Even someone who can read, in their own language, has no guarantee that they can see the letters at all. At least 2.2 billion people worldwide have near or distance vision impairment, and in at least 1 billion of them it could have been prevented or has yet to be addressed. The prevalence of distance vision impairment in low- and middle-income regions is estimated at four times that of high-income regions, and the majority of people with vision impairment and blindness are over the age of 50 (World Health Organization, *Blindness and vision impairment* fact sheet).

That figure is three times the 739 million non-literate adults of §1.1. In the expert survey of §5.7, five respondents remarked that the largest group of people who cannot read is likely to be blind and partially sighted people rather than non-literate people, and this figure supports that remark. How far the two groups overlap, and how many of those with vision impairment actually cannot read a medication instruction, cannot be established from this source.

![Figure 7](fig/chart13_three_layers.png)

**[Figure 7]** Three ways of not being able to read a prescription. The three overlap, and they come from different sources with different denominators, so they are not placed here to be compared in size. What this document has addressed since §1.1 is the middle bar; the bar above is a layer we have not addressed. The bottom line is not drawn as a bar because its denominator differs.

What that layer lacks has been measured as well. More than 2.5 billion people worldwide need one or more assistive products, and the figure is projected to reach 3.5 billion by 2050 as populations age and noncommunicable disease rises. Access is uneven. **In some low-income countries as few as 3% of people have access to the assistive products they need, against 90% in some high-income countries** (World Health Organization, *Assistive technology* fact sheet; WHO and UNICEF, *Global report on assistive technology*, 2022).

That gap overlaps with the regions we target. Smartphones have already spread, as §1.6 showed, and assistive devices have not, so there is a real difference between something that runs on the device already in someone's hand and something that needs separate equipment.

This app was not designed for blindness. The pictures are drawn large and speech is attached, but two responses in §5.7 noted that the act of taking a photograph is itself a barrier for someone who cannot see. It is a layer we have not addressed and it belongs to the unverified items in §5.10.

There is a further assumption still. Even someone who can read has no guarantee that the text in front of them is in their own language. Forty percent of the world's population does not have access to education in a language they understand, and most literacy surveys themselves measure in a single language (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). Prescriptions and nutrition labels are printed in a country's official language or in English, so among those counted as "able to read" in literacy statistics there are people who cannot read the paper in front of them. Pictures and speech step over both layers at once. After the survey of §5.7 the speech acquired the languages of the six countries the respondents work in; the account and its limits are in §5.7.

### 1.6 How widely the delivery medium has spread

The medium for solving the problem has already spread. In a 2025 survey, smartphone ownership among United States adults aged 65 and over was 78%. In the same survey it was 97% for those under 50 and 90% for those aged 50 to 64, with 91% across all adults, up from 35% in the first survey in 2011 (Pew Research Center, *Mobile Fact Sheet: Demographics of Mobile Device Ownership and Adoption in the United States*, fieldwork 5 February to 18 June 2025, 2025). Mobile internet users in sub-Saharan Africa are projected to grow from about 287 million in 2022 to 438 million in 2030, with smartphone adoption rising from 51% to 88% (GSM Association, *The Mobile Economy Sub-Saharan Africa 2023*, GSMA Intelligence, 2023).

[Table 5] Smartphone ownership by age group (United States; Pew Research Center, *Mobile Fact Sheet*, 2025)

| Age group | Ownership |
|---|---|
| Under 50 | 97% |
| 50–64 | 90% |
| 65 and over | 78% |

What Table 5 says is that people are not failing to use these tools for want of a device. Three in four older adults already own a smartphone. What blocks access is that the screen demands reading.

![Figure 8](fig/chart04_smartphone.png)

**[Figure 8]** Smartphone ownership by age group (United States; Pew Research Center, *Mobile Fact Sheet*, 2025). The gap between those 65 and over and those under 50 is 19 percentage points, already too narrow for "device availability" to explain the problem. The remaining gap lies on the side of the screen.

Having a device and reaching the internet are different things, however. As of 2024, 5.5 billion people use the internet (68% of the world population), while 2.6 billion still do not. That is 32% of the world population, one person in three (International Telecommunication Union, *Measuring digital development: Facts and Figures 2024*, 2024).

Owning a device and being able to keep using it are also different things. Asked in §5.7 where this app would fail first for an older patient living alone, the nine nursing and public health respondents split between not being able to operate the screen (4) and not being able to manage the device (4). The latter is charging and loss, and lies outside our design. Professor Namsoo Park of Hyupsung University objected to the single-choice design of the question itself and wrote that the three arrive together.

> "Only one answer is allowed, but I think operating the screen, managing the device and trust in the app (given the characteristics of older people) can all be causes."
> (Professor Namsoo Park, Hyupsung University)

The offline operation of §4.5 handles a connection being cut; it does not handle the device being off. The ownership rates in Table 5 are the ceiling on who this app can reach, not the number it actually reaches.

Those 2.6 billion split SnapCare's design at one point. The verdict has to be produced on the device in the user's hand, because a structure that yields an answer only by asking a server is, for these people, the same as no app at all. The offline operation described in §4.5 and §5.6 is therefore not a convenience but a premise. Regions with low literacy and regions where people do not use the internet are largely the same places, so this app has to work where the two conditions overlap.


### 1.7 The scale of population ageing and its geographic shift

The population aged 60 and over will grow from 1 billion in 2020 to 1.4 billion in 2030, at which point one person in six worldwide will be 60 or older. By 2050 it doubles again to 2.1 billion, and its share of the world population rises from 12% in 2015 to 22% in 2050. More important is the distribution. **By 2050 two thirds of the population aged 60 and over will live in low- and middle-income countries** (World Health Organization, *Ageing and health* fact sheet).

![Figure 9](fig/chart20_ageing.png)

**[Figure 9]** The scale and geographic shift of the older population, and the position those people are in. Only the 2050 bar on the left is split in two, because the source gives the distribution for that year alone. Splitting the two earlier years in the same proportion would mean drawing something the data does not contain. The three on the right are measured among Korean adults aged 65 and over, and the distance between the top bar and the bottom one is where this proposal sits.

Ageing is commonly perceived as a problem of wealthy countries, but it is in fact moving in the opposite direction. And older adults in low- and middle-income countries are a group in which three conditions overlap: a higher likelihood of low literacy, taking several medicines at once, and difficulty accessing care.

The middle condition is confirmed numerically. Synthesising 545 studies covering 16.62 million people in 56 countries, the prevalence of polypharmacy among older adults is 50.4% (95% CI 48.2–52.7%), and each additional medicine raises the hazard ratio for mortality by 1.05 (1.03–1.06), for emergency care by 1.02 (1.02–1.03) and for hospitalisation by 1.04 (1.02–1.07) (Tian, F., Chen, Z., Zhang, Y. et al., "Global prevalence, trends, and dose-response associations of polypharmacy in older adults," *The Journals of Gerontology: Series A*, 81(8):glag176, doi:10.1093/gerona/glag176).

That half of older adults take five or more medicines together also means that several medicines arrive on one screen of this app at once. In §5.7, Niken Nur Widyakusuma, a pharmacist at Universitas Gadjah Mada in Indonesia, noting that "when several medicines are handed over at once it is hard to tell which one is three times a day" comes out of this condition.

Korean data show this overlap concretely. In a study surveying 131 people aged 65 and over, **79.4% took their medicines themselves** while only **28.2%** had received medication safety education (Lee, M., Kim, K., Rhew, K. & Choi, K.-H., "A knowledge, attitude, and practice survey on medication safety in Korean older adults," *Healthcare*, 9(10):1365, 2021, doi:10.3390/healthcare9101365). And the share of that age group with adequate health literacy is 40.3% (Korea Disease Control and Prevention Agency, *Korea National Health and Nutrition Examination Survey, 9th cycle, year 2*, 2023). Most of them have to manage on their own, while only a minority are equipped to read what they are given.

The sample of 131 is small and the survey was conducted in 2017, which should be stated. Using this value as an estimate for Korean older adults as a whole would be a stretch, and what is used here is the direction of the ratio: that those managing on their own far outnumber those who have been taught how.

The same structure is observed in Moldova. Between 2015 and 2060 the population is projected to fall by 31% and the median age to rise from 38 to 47, while **the share of older people more than doubles to 27%.** The disease burden is overwhelmingly concentrated in noncommunicable diseases, and between 2008 and 2015 diabetes prevalence rose by 75% and circulatory disease by 41% (Voncina, L., Dozol, A., Volovei, I. & Cetinkaya, V., *Human Development Assessment for Moldova: Background Paper on Health*, World Bank, 2022).

There is also research addressing the relationship between health literacy and primary care use directly in a Moldovan population. The subjects of that study, however, are not residents of Moldova but **170 Moldovan migrant women living in Padua, Italy**, and it reports higher smoking rates (33.3% against 14.3%) and fewer visits to a general practitioner among those with lower literacy (Vianello, F. A. et al., "Health status of female Moldovan migrants to Italy by health literacy level and age group," *BMC Public Health*, 20:1502, 2020, doi:10.1186/s12889-020-09582-9). Being a migrant sample, it cannot be transferred directly to the population inside Moldova. What we take from this study is not the figures but **the relationship, that health literacy is in fact linked to primary care use**, and confirming that relationship in Moldova itself belongs to the field evaluation in §5.9.

### 1.8 The effect and the limits of visual delivery

That pictures are remembered better than text is a repeatedly verified finding in cognitive psychology. The picture superiority effect refers to pictures being recalled at higher rates than words and persisting longer, and dual coding theory explains this by holding that visual information is encoded along both a visual and a verbal route, giving two paths to recall, whereas text is not readily encoded visually (Paivio, A., *Imagery and Verbal Processes*, Holt, Rinehart & Winston, 1971; *Mental Representations: A Dual Coding Approach*, Oxford University Press, 1986). In health communication as well, pictures closely tied to text markedly increase attention and recall relative to text alone (Houts, P. S., Doak, C. C., Doak, L. G. & Loscalzo, M. J., "The role of pictures in improving health communication," *Patient Education and Counseling*, 61(2):173–190, 2006).

Two distinctions have to be drawn here, however.

First, the result of Houts et al. holds for pictures closely combined with text or with speech. The original writes "written or spoken text." This distinction bears directly on the present design. SnapCare pairs pictures with speech rather than with text, so it corresponds to the latter of the two conditions Houts et al. covered. We were unable to confirm whether the studies included in that review addressed the spoken condition as extensively as the written one, and the effect on a screen with text removed entirely still needs separate verification.

Second, drawing a picture and having it read correctly are different things. ISO 9186-1, the international standard for graphical symbols, requires that at least 67% of users understand a symbol correctly (ISO 9186-1:2014, *Graphical symbols — Test methods — Part 1: Method for testing comprehensibility*), while ANSI Z535.3, the United States safety sign standard, requires both a correct-response rate of 85% or higher in a sample of at least 50 people and **critical confusion of 5% or less** (ANSI Z535.3-2022, *Criteria for Safety Symbols*).

How far the pharmaceutical pictograms actually produced pass these criteria is the crux of the problem.

[Table 6] Pass rates of pharmaceutical pictograms against comprehension criteria

| Study | Subjects | Criterion | Result |
|---|---|---|---|
| Gutierrez et al. (2022) | Filipino adults · 82 USP + 26 FIP symbols | ANSI 85% | Passed **17 of 108 (15.7%)** |
| Dowse, R., Okeyo, S., Sikhondze, S. & Khumalo, N. (2023) | Low-literate South African adults · 10 locally made | ISO 66.7% | Passed **8 of 10 (80%)** · mean comprehension 7.9 ± 1.8 / 10 |
| Dowse & Ehlers (2001) | 46 South African Xhosa speakers (≤7 years schooling) · 23 symbols each | ANSI 85% | Locally made **20 of 23 (87%)** vs. USP-DI **11 of 23 (48%)** |

What Table 6 shows is that making a pictogram does not mean it will be read. When 108 internationally used USP and FIP pictograms were tested on Filipino adults, 17 passed the ANSI 85% criterion, roughly one in six (Gutierrez, M. M., Patikorn, C. & Anantachoti, P., "Evaluation of pharmaceutical pictogram comprehension among adults in the Philippines," *Journal of Pharmaceutical Policy and Practice*, 15:30, 2022, doi:10.1186/s40545-022-00426-y).

Placing the three studies side by side shows what separates the pass rates. The highest belongs to the set made locally and tested on local people (Dowse, R., Okeyo, S., Sikhondze, S. & Khumalo, N., *Health SA Gesondheid*, 28:2192, 2023: 8 of 10). The most direct evidence is the controlled comparison by Dowse & Ehlers. When the same 46 people were shown two sets carrying the same instructions, 20 of the 23 locally made symbols (87%) passed the ANSI 85% criterion while only 11 of the 23 USP-DI symbols (48%) did (Dowse, R. & Ehlers, M. S., "The evaluation of pharmaceutical pictograms in a low-literate South African population," *Patient Education and Counseling*, 45(2):87–99, 2001). The same people were asked about the same meanings, and the answers split almost twofold according to where the pictures came from.

The same thing is observed outside pharmaceutical pictograms. In a study testing 18 internationally standardised in-vitro diagnostic symbols on 293 health workers in four countries, the number of symbols exceeding the ISO criterion was six in Belgium and Cuba, two in the Democratic Republic of the Congo and one in Cambodia. The widest gap was the biological-hazard symbol, answered correctly by 94.1% in Cuba and by 8.0% in the Democratic Republic of the Congo (Hermans, V., Monzote, L., Van den Sande, B. et al., "Assessment of the knowledge of graphical symbols labelled on malaria rapid diagnostic tests in four international settings," *Malaria Journal*, 10:331, 2011).

![Figure 10](fig/chart16_symbol_country.png)

**[Figure 10]** The same internationally standardised symbols tested in four countries (Hermans, V., Monzote, L., Van den Sande, B. et al., "Assessment of the knowledge of graphical symbols labelled on malaria rapid diagnostic tests in four international settings," *Malaria Journal*, 10:331, 2011). On the left, how many of the 18 exceeded the ISO criterion; on the right, the correct-answer rate for the biological-hazard symbol alone. The symbols are the same; only the country differs.

One and the same picture becomes 94% in one country and 8% in another. This is the sharpest available demonstration that pictogram comprehension is not settled by the quality of the drawing alone, and it also means that the name "international standard" does not guarantee comprehension.

That taking something built as an international standard directly into another culture lowers the pass rate is what this field has observed repeatedly. This is why field evaluation in Moldova is part of our plan (§5.9), and at the same time why the machine-scored results for our own set must be read as values from before cultural adaptation.

Beyond that, a statistically significant positive correlation between health literacy and pictogram comprehension has been confirmed. The study tested 10 pictograms on 90 people in South Africa; mean comprehension was 7.9 ± 1.8 out of 10, the correlation *r* = 0.34 (*p* = 0.001), and the association with health literacy *p* = 0.002 (Dowse, R., Okeyo, S., Sikhondze, S. & Khumalo, N., "Pharmaceutical indication pictograms for low literacy viewers: Health literacy and comprehension," *Health SA Gesondheid*, 28:2192, 2023, doi:10.4102/hsag.v28i0.2192). There was more misreading among low-literacy participants. This means pictures work least well for the people who need them most, which leads to the design in §2.1, where delivery is not entrusted to a picture alone but layered with speech and colour. There is one further report in the same direction. In a study testing 10 pictograms on 197 pharmacy visitors in the Netherlands, half exceeded the 67% comprehension criterion (individual range 31.0% to 98.5%), but **in the low-literacy group only 2 of the 10 exceeded it.** In 3 symbols a risk of false confidence, believing one understands while not recognising the symbol, was observed (van Beusekom, M. M. et al., "Pharmaceutical pictograms for low-literate patients: Understanding, risk of false confidence, and evidence-based design strategies," *Patient Education and Counseling*, 100(5):966–973, 2017).

One line from that paper's conclusion matches our own judgement. **For safety-related information, 67% comprehension may not be enough.** Passing a criterion and being safe to rely on are different things, which is why SnapCare keeps speech and colour alongside a picture even when the picture passes.

Evidence in the opposite direction is equally clear at the same spot, however. The liquid-medicine trial cited earlier (§1.3) was a randomised controlled trial, and what separated it from the control arm was instructions containing pictograms. Among caregivers who received pictograms, dosing errors greater than 20% fell from 47.8% to **5.4%** (absolute risk reduction 42.4 percentage points), and non-adherence fell from 38.0% to 9.3% (Yin, H. S. et al., "Randomized controlled trial of a pictogram-based intervention to reduce liquid medication dosing errors and improve adherence among caregivers of young children," *Archives of Pediatrics & Adolescent Medicine*, 162(9):814–822, 2008).

In a South African trial dividing 60 low-literate adults with seven years of schooling or less into control and experimental groups, **significantly more participants exceeded 80% comprehension on both the medicine label and the patient information leaflet** in the group that also received pictures (Mansoor, L. E. & Dowse, R., "Effect of pictograms on readability of patient information materials," *Annals of Pharmacotherapy*, 37:1003–1009, 2003).

One trial separated directly what has to be layered with what. In Qatar, 123 migrant workers who read neither Arabic nor English were randomised into three arms: text with verbal instruction, a pictogram-only label, and a pictogram with verbal instruction. **The pictogram with verbal instruction did best on most of the instructions** (*p* ≤ 0.05) (Kheir, N., Awaisu, A., Radoui, A., El Badawi, A., Jean, L. & Dowse, R., "Development and evaluation of pictograms on medication labels for patients with limited literacy skills in a culturally diverse multiethnic population," *Research in Social and Administrative Pharmacy*, 10(5):720–730, 2014, doi:10.1016/j.sapharm.2013.11.003).

The arm that won is the same combination SnapCare uses. Not text with speech, and not pictures alone, but pictures with speech. The decision in §2.1 to overlay three layers is supported directly by this trial.

The result running the other way in the same study should be recorded too. "Take two tablets three times a day" and "Instill one drop in the eye" came across well, but **"Do not take with dairy products" remained difficult even with a picture and an explanation.** Abstract and negative instructions are what is left over. It is the same place as the AAC respondent in §5.7 predicting that abstract concepts such as empty stomach and interaction would fail first, and as all five of the morphemes we could not improve in §5.3 being problems of concept.

There is work with a large sample as well. Showing 1,848 Lebanese adults the same prescription instructions in text alone and then with pictograms raised the comprehension score from 9.36 (±1.60) to 10.88 (±0.89), a difference of 1.52 (95% CI 1.45–1.60, *p* < 0.001) (Mourad, N., Younes, S., Mourad, L. et al., "Comprehension of prescription orders with and without pictograms," *BMC Public Health*, 23:1926, 2023, doi:10.1186/s12889-023-16856-5).

That study also carries a result against us. **The older the participant, the smaller the gain from the pictures** (Beta = −0.019, *p* < 0.001). Given that this app takes older adults as a main target (§1.7), that is not a figure to pass over. Professor Eun-Kyoung Kim of Kongju National University writing in §5.7 that "older people unfamiliar with images of this kind would find it harder still" is an observation in the same direction.

There is also work that pools the individual trials. Screening 4,160 records produced 54 randomised controlled trials, 42 of which were meta-analysed: pictorial health information moderately improved knowledge, understanding and recall overall, and **largely increased knowledge and understanding in lower health literacy populations (13 studies)** (Schubbe, D., Scalia, P., Yen, R. W., Saunders, C. H., Cohen, S., Elwyn, G., van den Muijsenbergh, M. & Durand, M.-A., "Using pictures to convey health information: A systematic review and meta-analysis of the effects on patient and consumer health behaviors and outcomes," *Patient Education and Counseling*, 103(10):1935–1960, 2020, doi:10.1016/j.pec.2020.04.010).

The same paper left one sentence that bears directly on our design: **icons with few words may be most helpful** in conveying health information. It points the same way, independently, as the respondents in three countries who said in §5.7 that there are too many elements in one image. The authors note that heterogeneity across the outcomes was substantial and that the results should be read with caution, and we read them that way here. These figures are grounds for using pictures, not grounds for thinking any picture will do.

To summarise, this field has observed three things together. Well-made pictures do in fact reduce errors (Yin, H. S. et al., *Arch Pediatr Adolesc Med*, 162(9):814–822, 2008: 47.8% to 5.4%). Pictures work better with speech than alone (Kheir, N., Awaisu, A., Radoui, A., El Badawi, A., Jean, L. & Dowse, R., *Res Social Adm Pharm*, 10(5):720–730, 2014). And making them does not mean making them well (Gutierrez, M. M., Patikorn, C. & Anantachoti, P., *J Pharm Policy Pract*, 15:30, 2022: 17 of 108). The first two are the reason to take this approach, and the third is the reason to measure afterwards.

One thing the field has not answered attaches to that. Mourad et al. finding that the gain from pictures shrinks with age, and Schubbe et al. finding that icons with few words help most, both ask how much we should be showing an older person and in what form. Neither answers it for our set. That is what we have to measure in the field evaluation of §5.10.

![Figure 11](fig/chart05_pictogram_pass.png)

**[Figure 11]** Share of pharmaceutical pictograms passing comprehension criteria. The criterion applied differs by bar and is noted underneath each. Sharing an axis does not make these values competitors. The middle two bars are the control and experimental arms of the same study, **the result of showing two sets carrying the same instructions to the same 46 people**. Where the pictures came from splits the pass rate almost twofold. Our own value (69.2%) is the machine-scored result from §5.2 and was not obtained by asking people, so it is not directly comparable with the rest. It is placed on the same panel not to claim superiority but to show that our value falls within the range this field has observed.

This is why the present work does not stop at making pictograms but designs a procedure for measuring their comprehension alongside.


### 1.9 Structural constraints of the existing pictogram standard

The most widely used pharmaceutical pictogram standard at present is the 81-symbol set from the United States Pharmacopeia (USP). It is organised into three categories, mandatory (square), prohibition (circle with slash) and warning (inverted triangle), and USP distributes it free in GIF and EPS form (U.S. Pharmacopeia, *USP Pictograms*, https://www.usp.org/health-quality-safety/usp-pictograms).

How the set arrived at its present 81 we could not confirm at a primary source. Several secondary works record a start in the 1980s and the present count reached during the 1990s, but we could not open the originals, so no years are given here. The argument of this section is not when the set was made but that it does not compose, and the grounds for that are the licence conditions below.

The limitation of this standard lies in its expressive power. A single prescription instruction such as **"three times a day, 30 minutes after meals, keep refrigerated, contraindicated in pregnancy"** cannot be expressed by any one USP pictogram and can only be conveyed by listing five or six symbols.

This is an explicit constraint rather than a design shortcoming. USP grants free use subject to four conditions: that, because of the potential for misinterpretation, the pictograms are not used as the sole means of conveying information to the patient; that they are not modified or used together with symbols USP did not develop without USP's permission; that only the latest versions are used, because the pictograms are subject to change; and that a notice of USP copyright accompanies them. USP also reserves the right to withdraw permission where it judges the pictograms to be used inappropriately (U.S. Pharmacopeia, *USP Pictograms*).

The second of those conditions is what forbids composition. As long as the standard is observed, overlaying or joining symbols will remain impossible.

The first clause, by contrast, is on our side. Telling implementers not to use pictograms as the sole means of conveying information is the standard's own authors recording that one picture is not enough, and it is the same judgement behind SnapCare overlaying three layers of picture, speech and colour in §2.1. We agree with the clause and differ only in having made the secondary means something other than text.

The difference between a fixed list and a grammar is a difference of kind rather than of count. Expanding 81 symbols to 810 does not help, because the combinations of prescription instructions grow faster still, and sooner or later an instruction appears that is not on the list. A grammar moves the other way. SIGIL consists of 78 morphemes and five operators, and adding one more morpheme also creates the positions where it can combine with every existing operator and modifier. What grows is a layer of combinations rather than a single entry.

This difference can be counted. Each of the 57 heads has one slot for a modifier, and the dictionary carries no list restricting which modifiers may enter which slot. Head-and-modifier cells therefore number 57 × 21 = 1,197, and adding the 57 cells of a bare head and the four time morphemes that can stand alone gives 1,258. No negation, daily-cadence or half operator has been applied to that count. The rate of growth is plainer still. Drawing one more symbol for the USP set adds one expression; drawing one more modifier for SIGIL creates a slot alongside all 57 heads at once and adds 57. Drawing one more head adds 21.

![Figure 12](fig/chart19_expressive.png)

**[Figure 12]** How a fixed list and a grammar grow. On the left, the cells each set can render today; on the right, the cells gained by drawing one more item. The right-hand panel is the point of this section. The 1,258 on the left is not a boast about size but the reason the right-hand panel looks as it does.

Two things should be set down so that 1,258 is not read in our favour. First, we have not counted how many of them mean anything. The grammar does not stop `\bandage{allergen_peanut}`, and that picture says nothing at all. What a grammar guarantees is that a combination is well formed, not that the combination means something, and filtering for meaning is the job of the semantic check in §5.2. Second, the 81 USP symbols are a set validated by asking people, and our 1,258 are not. The two numbers were not measured with the same instrument. What this figure says is not that our set is better but that the two approaches grow in different ways.

Where this difference actually shows is in the part that records concepts the app could not build (step 4 in §5.10). With a fixed list, meeting a picture that does not exist is the end of it, whereas with a grammar what was missing remains at the level of the morpheme, which settles what to add next.

That comprehension varies by culture and that culturally adapted versions are needed is already shown in Table 6.

### 1.10 Prior work on interfaces for low-literate users

Research on interfaces for low-literate users shows that removing text is a necessary condition rather than a sufficient one.

Medhi et al. built a text-free interface through ethnographic design with non-literate domestic workers in a Bangalore slum, with the criterion that it be "usable without anyone's intervention" (Medhi, I., Sagar, A. & Toyama, K., "Text-Free User Interfaces for Illiterate and Semi-Literate Users," *Information Technologies and International Development*, 4(1):37–50, 2007). That criterion means creating no step that requires explanation.

Follow-up work surveying 400 low-literate, low-income people in India, the Philippines and South Africa found the barriers to include cognitive difficulty, cultural etiquette, prior exposure, intimidation, mediation, motivation, cost, power relations and social standing as well as literacy (Medhi, I., Cutrell, E. & Toyama, K., "It's not just illiteracy," *Proc. International Conference on Interaction Design & International Development*, 2010).

A structural problem was confirmed as well. In an experiment asking 20 non-literate adults in a Bangalore slum to find 5 items out of 40 on a touchscreen phone, a multi-page list spread over 7 pages took 25 seconds on average while a hierarchy 4 levels deep took 65.5 seconds (*t*(18) = 4.6, *p* < 0.001). Accuracy also split, at 100% for the list against 80% for the hierarchy (*t*(18) = −3, *p* = 0.0077) (Medhi, I., Toyama, K., Joshi, A., Athavankar, U. & Cutrell, E., "A Comparison of List vs. Hierarchical UIs on Mobile Phones for Non-literate Users," *INTERACT 2013*, LNCS 8118:497–504, doi:10.1007/978-3-642-40480-1_33).

Another group found the same failure on a different task. In a study asking 10 patients with stage 5 chronic kidney disease (three at or below third grade on the REALM test, three at seventh to eighth grade, four at or above ninth grade) to estimate food portions on a handheld device, all ten succeeded with liquids and eight of ten with amorphous foods, but **not one succeeded on the screen for measuring solid food.** What the authors observed was that participants could not decide which image to select and kept forgetting which dimension they had already measured (Chaudry, B., Connelly, K., Siek, K. A. & Welch, J. L., "The design of a mobile portion size estimation interface for a low literacy population," *International Conference on Pervasive Computing Technologies for Healthcare*, 160–167, 2011, doi:10.4108/icst.pervasivehealth.2011.246113).

Different task, different group, same reason for failing. The screen asked the user to hold something in their head. In the earlier study it was how far down they had gone; here it is which dimension they had already measured. SnapCare removed the steps not to reduce the number of screens but to remove that demand.

If those two studies concern structure inside the screen, one response in §5.7 points at what happens before the screen is reached. Professor Namsoo Park of Hyupsung University wrote that how well people who cannot read handle a mobile device has to be examined first, giving as an example that this app's profile-setup screen carries the instruction "select any that apply to you". Anyone who cannot read that instruction is stopped at that screen.

The opening sentence of this section, that removing text is a necessary condition, is confirmed once more here. We wrote that text had been removed from the path to a verdict (§2.1), and text was still sitting on the setup screen before it. The survey found for us that what we decided to remove and what we actually removed were different.

Work from another group belongs here too. A study built a multimedia patient-reported outcomes measure for low-literacy patients through human-centred design, with 17 adults (12 patients, 3 caregivers, 2 clinic staff), 46% of whom scored as low literacy on REALM-SF. Six features went in: audio narration on every question, animations showing the task being asked about, icons that switch the multimedia on and off, gender-neutral and ethnically diverse avatars, a progress indicator, and an illustrated response scale (Azad, C. L., Beres, L. K., Wu, A. W., Fong, A. & Giladi, A. M., "Developing a multimedia patient-reported outcomes measure for low literacy patients with a human-centered design approach," *PLOS ONE*, 19(6):e0304351, 2024, doi:10.1371/journal.pone.0304351).

That study parts from us at two points. First, the authors divided users by literacy into three (non-literate, slow reader, literate). It is the same kind of judgement Associate Professor Hangil Lee asked for in §1.5 when he separated total blindness, low vision and low literacy, and we designed for those three as one. Second, the authors made the multimedia switchable by icon, so that higher-literacy users pass it by and only lower-literacy users receive it, whereas this app sends the speech to everyone (§3.5). Which is right, neither that study nor ours settled by asking people.

What the same literature records about icons is set down as well: icons are often semantically opaque to low-literacy users, abstract symbols in particular fail to cross cultural and literacy barriers, and users prefer concrete, photorealistic representations to stylised glyphs. The last of those runs directly against our design. The set in §2.2 is a black-and-white silhouette, chosen so that it survives at 32 pixels (§5.2). Surviving and being preferred may not point the same way, and that divergence is an item for the field evaluation of §5.10.

The authors locate the cause in the understanding of nesting itself. Some participants did not grasp that a higher-level picture in the hierarchy stood for a bundle of items beneath it, and some could not remember how to return upward after entering the wrong branch. Turning pages was not itself the problem. The problem is having to hold in mind how far down one has gone.

### 1.11 The problem in summary

The discussion so far comes to five points.

First, scale. There are 739 million non-literate adults, and in some regions the absolute number is rising (UNESCO, *Youth and Adult Literacy: International Literacy Day 2025 Factsheet*, UNESCO, 2025). Applying a health literacy criterion widens the target further. Health literacy is not sufficient for 39.6% of Korean adults and 59.7% of those aged 65 and over (Korea Disease Control and Prevention Agency, *Korea National Health and Nutrition Examination Survey, 9th cycle, year 2*, 2023).

Second, cost. Medication errors generate 42 billion dollars a year in costs (World Health Organization, *Medication Without Harm: WHO Global Patient Safety Challenge*, WHO/HIS/SDS/2017.6, 2017), and in 2019 deaths directly attributable to bacterial antimicrobial resistance numbered 1.27 million, more than HIV/AIDS or malaria (Murray, C. J. L. et al. (Antimicrobial Resistance Collaborators), "Global burden of bacterial antimicrobial resistance in 2019: a systematic analysis," *The Lancet*, 399(10325):629–655, 2022). In 2023 data, one in six laboratory-confirmed bacterial infections showed resistance to antibiotics (World Health Organization, *Global antibiotic resistance surveillance report 2025 (GLASS)*, 2025).

Third, the effect and the limits of visual methods. Pictures are remembered better than text (Houts, P. S., Doak, C. C., Doak, L. G. & Loscalzo, M. J., "The role of pictures in improving health communication," *Patient Education and Counseling*, 61(2):173–190, 2006), yet of 108 pharmaceutical pictograms actually produced only 17 passed the ANSI criterion (Gutierrez, M. M., Patikorn, C. & Anantachoti, P., "Evaluation of pharmaceutical pictogram comprehension among adults in the Philippines," *Journal of Pharmaceutical Policy and Practice*, 15:30, 2022).

Fourth, the structural constraint of the standard. The 81 USP symbols are prohibited from being combined, so a compound instruction cannot be made into a single picture (USP Pictogram Library License Agreement).

Fifth, an open delivery channel. Seventy-eight percent of United States adults aged 65 and over already own a smartphone (Pew Research Center, *Mobile Fact Sheet: Demographics of Mobile Device Ownership and Adoption in the United States*, 2025).

These five point to one conclusion. What is needed is an integrated pipeline that runs automatically from a prescription through to pictograms and speech, that measures whether the result is actually read, and that never requires text.

![Figure 13](fig/fig27_synthesis.png)

**[Figure 13]** The five strands of chapter 1 and the three things they point to. Every number on the left is quoted exactly as it appears in the preceding sections, and nothing new is claimed here. All this figure does is put in one frame the fact that the five point at the same place. The red line beneath it is what this section is careful about.

Having set out these five strands, we put them to the field. The survey in §5.7 is that, and the result broadly confirmed the five. What differed was how they were confirmed.

Scale, the first, the respondents rated lower rather than higher: 15 of 35 answered that they almost never meet such a patient. The visual route, the third, was supported but with a condition attached, namely that pictures help in the low-literacy case and that total blindness and low vision are different layers. On the constraint of the standard, the fourth, two respondents recommended consulting existing sets, which are the very sets §1.9 records as unusable by us. The delivery channel, the fifth, was said to fail at managing the device rather than at owning one.

What came up most often was not in the five strands at all. Six respondents independently raised the absence of validation with people, and four of the five who answered the broad question across the five segments chose it as the first thing to resolve. The five strands we used to define the problem all come from the literature, and this finding says that between that literature and our set there is still nothing.

We set the evidence this chapter used side by side, by which direction it points. The column that cuts against is the longer one.

![Figure 14](fig/chart23_evidence.png)

**[Figure 14]** Evidence that supports this approach and evidence that cuts against it. The section number after each item leads to the full citation. The unfavourable column has seven entries to the other's five, and not shortening it is this chapter's method. Two rows on the right are heavy. That the centre of gravity of harm sits at the prescribing stage names the place this app does not intervene, and §1.4 records why we chose the patient stage even so. The last row aims at the form of our own set: low-literacy users are observed to prefer photorealistic images to silhouettes, whereas we chose a black-and-white silhouette so that it survives at 32 pixels (§5.2). Surviving and being preferred may not point the same way. The reason for setting the evidence out this way is that collecting only the favourable half would mean doing to the literature what §5.2 refuses to do to the morphemes.

Within the range we searched, no system had all three. Pictogram sets exist but do not combine (§1.9), work addressing combination does not measure comprehension before release, and the studies that did measure comprehension (Table 4) assembled people and measured after the fact once the set was built. This is an observation from the range we looked over while preparing this work rather than the result of a systematic review, so it should be read as "we did not find one" rather than "there is none." This is SnapCare's starting point.

---

## □ Solution and Main Functions

### 2.1 Design principle

SnapCare has one design principle. At no point on the path by which a user arrives at a judgement are they required to read or type.

The principle follows from two facts established in the previous section. First, removing text is a necessary condition. For someone who cannot read a prescription, a text interface is no different from the paper one. Second, removing text is not sufficient. Pictures too can fail to be read (Gutierrez, M. M., Patikorn, C. & Anantachoti, P., "Evaluation of pharmaceutical pictogram comprehension among adults in the Philippines," *Journal of Pharmaceutical Policy and Practice*, 15:30, 2022), and a hierarchy is itself a barrier (Medhi, I., Toyama, K., Joshi, A., Athavankar, U. & Cutrell, E., "A Comparison of List vs. Hierarchical UIs on Mobile Phones for Non-literate Users," *INTERACT 2013*, LNCS 8118:497–504).

SnapCare therefore answers in three layers. What to do is carried by a picture, what that picture means is carried by speech, and whether this is safe or dangerous right now is carried by a single colour. The three layers overlap rather than substitute for one another. Someone who does not recognise the picture still has the speech, and where the speech cannot be heard the colour remains.

The reason the three layers were not collapsed into one is as follows. One could argue that speech alone is enough, and spoken guidance is indeed the most common approach in this field. Speech cannot be held in place, though. Once it has passed it has to be replayed, and the act of replaying is exactly the barrier the interactive voice response research cited in §1.10 identified. A picture stays on the screen and can be looked at again any number of times, and a colour has already been delivered the moment the eye meets the screen. The three layers put out the same meaning on three timescales: colour immediately, the picture for as long as it stays, speech once through and again if needed.

The only action the user performs is taking a photograph.

![Figure 15](fig/fig01_home.png)

**[Figure 15]** The whole home screen. Above the red line is what is visible without scrolling; below it is veiled. What is actually met on opening the app is the part above the line. The largest element on it is a single capture button, and there is no menu and no search box. Having only one choice is the response to the hierarchy barrier established in §1.10.

Two responses in §5.7 said opposite things about this principle. Professor Celia of the University of Pretoria wrote that a picture is the medium aligned to people who cannot read, without talking down to them.

> "The picture is more aligned to people who cannot read without under estimating their intelligence."
> (Professor Celia, University of Pretoria)

The other side is Professor Heejung Seo of Dong-eui University, also in §5.7: to a non-literate person a picture too can feel like writing. Two responses say the opposite of each other about the same medium, and we do not know which is right. Of everything to confirm in the field evaluation of §5.10, this comes first. Measuring the comprehensibility of a picture without measuring whether it is recognised as a picture means scoring only the people who already passed.

### 2.2 SIGIL, the pictogram composition engine

SIGIL (Symbol Intuitive Glyph Image Lab) is a pictogram composition engine the team designed and implemented itself. Where existing pictogram sets are lists of pictures, SIGIL is built from morphemes and a grammar.

It currently has 78 morphemes, divided into 57 heads and 21 modifiers. A head is an object that can stand on its own (pill bottle, dropper bottle, inhaler, peanut, milk carton), while a modifier cannot stand alone and goes into a slot inside a head (morning, midday, evening, count, refrigerate, eye, mouth).

There are five operators on top of this. `no{}` applies prohibition, `half{}` applies a half portion, and `twice_daily{}`, `three_times_daily{}` and `four_times_daily{}` apply a daily frequency.

[Table 7] The composition of SIGIL

| Category | Count | Examples |
|---|---|---|
| Head | 57 | `pill_bottle`, `dropper_bottle`, `allergen_peanut`, `symptom_gut` |
| Modifier | 21 | `time_morning`, `qty_two`, `storage_fridge`, `body_eye` |
| Operator | 5 | `no{}`, `half{}`, `twice_daily{}` and 2 more |

How the 78 were chosen says what kind of set this is. They were not drawn in bulk with combination considered afterwards; they were **derived backwards from the error distribution in §1.3.**

[Table 8] The 78 morphemes by category

| Category | Count | What it says |
|---|---|---|
| Form, device, action | 26 | What. Tablet, syrup, eye drops, inhaler, syringe, blood pressure monitor |
| Food | 10 | What. Rice, bread, oil, sugar, vegetables |
| Allergen | 9 | What to avoid. Peanut, tree nut, milk, egg, shellfish |
| Symptom | 8 | What was experienced. Fever, cough, vomiting, abdominal pain |
| State | 7 | Who. Child, teenager, adult, older adult, pregnant, breastfeeding |
| Body site | 6 | Where. Eye, mouth, nose, skin, stomach |
| **Count** | **5** | **How much**, from one to five |
| **Time of day** | **4** | **When**, morning, midday, evening, night |
| Storage | 3 | How. Refrigerate, keep dry, keep out of light |

The two categories in bold correspond directly to the top two errors in Table 4 (dose 28.4%, timing 23.2%). Count stopping at five and time of day having only four is not economy aimed at shrinking the set but a reflection of prescriptions not in fact requiring more. Dosing more than five times a day is rare, and anything more frequent is expressed as "every so many hours" rather than as a time of day.

![Figure 16](fig/chart17_morpheme_map.png)

**[Figure 16]** How the 78 morphemes divide, set against the distribution of medication error. The two red branches map directly onto the leading error types in Table 4. That the size of a branch runs opposite to the size of the error is because the side that needs many drawings and the side that goes wrong often are not the same. Five is enough for count; twenty-six are needed for dosage form. Count stopping at five and time of day having only four is not economising to keep the set small but the fact that prescriptions do not ask for more. Dosing more than five times a day is rare, and anything more frequent is expressed as "every so many hours" rather than as a time of day.

The thickest category, conversely, is dosage form. The reason is in §2.3. Once the form is settled the verb and the body site are settled with it, so adding one form adds a whole instruction. The nine allergens follow the list of major allergens whose declaration is mandatory internationally.

The constraint of the black-and-white silhouette was touched from two directions in §5.7. Professor Namsoo Park of Hyupsung University wrote that in black and white alone it is hard to tell that the egg allergy marking is an egg, and that icons need to be drawn as the real thing; Professor Myoungsoon You of Seoul National University named "the half picture" as a place likely to be misread. The first became the basis, among the fixes after the survey in §5.7, for redrawing `allergen_egg` as a cracked egg; the second says that the half drawn by the `half{}` operator may not read as meaning a half. We have not fixed the second.

E. A. Draffan, retired speech and language therapist and visiting accessibility researcher at Global Symbols, pointed at another layer. Our set is black and white, whereas the symbol systems AAC users are familiar with are usually coloured, and the two look different. It interlocks with the decision in §3.7 to use colour only for the verdict and keep morphemes black and white. Using colour loses users with colour vision deficiency; not using it loses users accustomed to coloured symbols. We chose the former, and we record the cost here.

What is missing, the respondents pointed out themselves. Sheron Sir Loon Goh, Pharmacy Lecturer, gave as examples of special instructions "shake before use" and "keep away from children". Neither is among the present 78. Niken Nur Widyakusuma, PhD and pharmacist at Universitas Gadjah Mada in Indonesia, pointed at another layer: telling the medicines apart comes first when several arrive at once, and the present set distinguishes medicines only by dosage form. Receiving two different capsules produces two identical rows.

Professor Katarina Vučićević of the University of Belgrade widened the scope of interactions. Over-the-counter products, dietary supplements and underlying conditions may be clinically significant too, not only other medicines. What the verdict of §2.4 handles is the prescribed medicine and the conditions the user registered, so that scope currently lies outside.

We record here that the set is not closed. Prescriptions keep producing things these 78 cannot draw, and what the app does at that moment is covered by the `\?concept` marker in §2.3 and the expansion path in §5.10.

Why this structure is needed becomes clear in contrast with the USP standard from the previous section. A single instruction reading "three times a day, after meals, keep refrigerated, contraindicated in pregnancy" can only be conveyed in USP by listing five or six symbols, and will remain so because the licence prohibits combination (USP Pictogram Library License Agreement). In SIGIL it is expressed as follows.

```
\three_times_daily{ \capsule_strip{\food_bowl} }
\capsule_strip{\storage_fridge}
\no{\state_pregnant}
```

Each line is composed into one picture, with slots opened inside the head for modifiers to be drawn into. Adding a morpheme requires one drawing, and the grammar produces the remaining combinations.

The grammar is not merely a set of rules; the parser enforces it. The core of the recursive descent parser is as follows.

```python
def _pictogram(self, in_slot: bool = False) -> Node:
    if self._peek() != "\\":
        raise ParseError(f"expected '\\' at position {self.i}")
    self.i += 1
    name = self._name()

    if self.m.is_operator(name):
        if self._peek() != "{":
            raise ParseError(f"\\{name} requires a child: \\{name}{{...}}")
        ...
        return Node(name=name, kind=NodeKind.OPERATOR, children=[child])

    if self.m.is_head(name):
        children = self._slots()
        for c in children:
            if c.kind != NodeKind.MODIFIER:
                raise ParseError(
                    f"\\{name} slots only accept modifiers; got \\{c.name}"
                )
        return Node(name=name, kind=NodeKind.HEAD, children=children)

    if self.m.is_modifier(name):
        if not in_slot and not self.m.get(name).standalone:
            raise ParseError(
                f"\\{name} is a modifier; must appear inside a head's slot"
            )
        return Node(name=name, kind=NodeKind.MODIFIER)

    raise ParseError(f"unknown macro \\{name}")
```

Design intent. Each of the three branches is one clause of the grammar. A modifier outside a slot fails to parse unless it is marked `standalone` (the four in §2.2 — morning, noon, evening and night; a time of day stands on its own without modifying anything, so it is allowed to stand alone), a head placed in another head's slot fails as well, and a name absent from the dictionary becomes an error rather than a picture. This matters because the DSL is not written by hand but produced by a language model reading a prescription. If the model invents a plausible name, that has to become a parse error rather than a plausible picture on screen. Putting a deterministic verification layer over probabilistic output on a safety-critical screen is what this parser is for, and the same structure is used for the nutrition verdict in §4.2.


![Figure 17](fig/fig02_sigil_sheet.png)

**[Figure 17]** All 78 SIGIL morphemes (57 heads and 21 modifiers). The small image beneath each morpheme is the same glyph reduced to 34 pixels. The reductions are included because these pictures are in practice used on a palm-sized screen, sometimes as a single cell in a list. A picture that is only distinguishable when drawn large cannot be used in this app.

![Figure 18](fig/fig03_dsl.png)

**[Figure 18]** How one line of DSL becomes one picture. All four examples are outputs from the actual engine and were not redrawn for the diagram. Because modifiers go into slots opened in the head, the combinations arising from 78 morphemes are determined by the grammar rather than by a list.

### 2.3 VOCA, the spoken instruction engine

VOCA (Voice-Output Composition Architecture) does not convert the string read by OCR straight into speech. A prescription contains a great deal the patient does not need to know, and what they do need is scattered.

VOCA extracts only what is needed, reassembles it and turns it into sentences. The basis for this design lies in research on interactive voice response. Usability ratings among older users are consistently lower than among younger users and they complete fewer tasks, with most of the difficulty arising from ambiguous options, speech rate and the length of options (Miller, D. I., Bruce, H., Gagnon, M., Talbot, V. & Messier, C., "Improving Older Adults' Experience with Interactive Voice Response Systems," *Telemedicine and e-Health*, 17(6):452–455, 2011, doi:10.1089/tmj.2010.0204). Younger users voiced the same complaints but mostly worked past them, whereas older users often did not. Playing speech is therefore not enough on its own, and what not to say becomes the core of the design.

That study contains one result that appears at first to run against our design: both age groups were more efficient when more options were presented. This concerns the number of options held in a single step, however, and doing so reduces the depth of the menu. It runs in the same direction as the finding in §1.10 that deep hierarchies are particularly unfavourable for non-literate users, and what the two studies point to together is "reduce the steps" rather than "reduce the options." What SnapCare has taken is the extreme of that. There is not a single step on the path to a verdict.

What to discard is settled first. One prescription sheet also carries a patient record number, the name of the institution, a prescription code, the prescriber's licence number, the date of issue and a drug code. All six are needed for administration, billing and traceability, and not one of them changes anything the person about to take the medicine has to do. On paper the eye skips them by itself. Speech cannot be skipped. The listener can neither rewind nor run ahead, so every line read aloud buries what comes after it by that much. This information stays on the screen. It is not deleted; it is not read.

There is a reason for the order in which what remains is spoken. The dose per intake comes first. In the first formative measurement in §5.1, dose and storage information reached the pictogram from OCR but did not reach the speech and the sentences, and that state is exactly the failure type cited in §1.3: repeating the instruction accurately while being unable to point out how many tablets a day. In Davis et al. (2006), of the 70.7% who could do the former, 34.7% could do the latter. Then comes how to take it, then the closing sentence, and storage is attached only when refrigeration is required. Room temperature is the default and not worth another sentence.

![Figure 19](fig/fig26_voca.png)

**[Figure 19]** What VOCA discards from one prescription sheet and in what order it says the rest. The six discarded lines are not erased from the screen; they are simply not read aloud. Order is importance because the listener cannot rewind, and the dose per intake comes first because in the first measurement of §5.1 that item was not reaching the speech channel.

The verb also changes with the dosage form. A tablet is "take," but eye drops are "put in," an ointment is "apply" and an inhaler is "breathe in." The single word "administer" points to completely different physical actions.

The verb is not the only thing that changes. The body site changes too. That eye drops go into the eye is half the instruction, and if the picture has only the bottle and no eye, that half disappears. The body site is therefore derived from the dosage form.

```ts
/**
 * Dosage form → where on the body it is used.
 *
 * That eye drops go 'into the eye' is half the instruction, yet the picture had
 * only the bottle and no eye. The moment OCR identifies the form the site is
 * settled too, so there is no need to ask separately.
 */
const FORM_SITE: Record<string, string> = {
  eyedrop: 'body_eye',
  cream:   'body_skin',
  inhaler: 'body_mouth',
  syrup:   'body_mouth',
};
```

Putting all nine dosage forms side by side shows the rule that governs the two channels.

[Table 9] Body site and speech derived from the dosage form (all nine forms)

| Dosage form | Site in the picture | Spoken verb | Spoken site | Closing sentence |
|---|---|---|---|---|
| eyedrop | eye | Put | in the eye | Use as prescribed. |
| cream | skin | Apply | on the skin | Use as prescribed. |
| inhaler | mouth | Breathe in | none | Use as prescribed. |
| syrup | mouth | Take | none | Take as prescribed. |
| injection | none | Receive | none | Use as prescribed. |
| suppository | none | Use | none | Use as prescribed. |
| tablet | none | Take | none | Take as prescribed. |
| capsule | none | Take | none | Take as prescribed. |
| sachet | none | Take | none | Take as prescribed. |

Two forms speak the site and four draw it. This difference is not an oversight. In speech the site is attached only when the verb cannot carry it. "Put" does not say where, so without "in the eye" only half the instruction arrives. "Breathe in" already carries where the breath goes, and so does "Take." Adding "in the mouth" there gains no information and only lengthens the sentence, and the IVR study cited above, which identified the length of options as a cause of failure among older users, is the basis for that judgement. The same economy does not apply to the picture. In a picture the mouth is not a verb but a place, and leaving the place empty makes it a place with nothing in it.

That leaves injection and suppository. For these two the verb cannot carry the site, and yet the site is neither spoken nor drawn. This is not economy but a gap we have not filled. A prescription often does not record where an injection goes, and the site varies by drug between arm, abdomen and buttock, so choosing one to draw would be inventing something the prescription does not contain. A suppository has a single site, but standing it up as a picture would require drawing the orientation of a human body, and that is outside what the 78 morphemes currently handle. Both are carried over to the unverified items in §5.9. For now, recording that the verb alone does not complete the instruction is all we can do.

One response in §5.7 pointed at a layer this table does not cover. Niken Nur Widyakusuma, PhD and pharmacist at Universitas Gadjah Mada in Indonesia, wrote that "every 8 hours" is better than "three times a day".

> "Instead of 3 times a day, better to say every 8 hours."
> (Niken Nur Widyakusuma, PhD and pharmacist, Universitas Gadjah Mada)

This sits on the boundary of our morpheme design. The four time morphemes of §2.2 are morning, midday, evening and night; they cannot draw "every so many hours". Table 8 records that time of day has only four because prescriptions do not ask for more, and this response says that what a prescription asks for may be a different axis altogether. Three times a day says when; every eight hours says the interval, and for a drug such as an antibiotic where blood concentration matters the latter is the clinically correct one. The engine cannot draw an interval, and drawing more morphemes does not fix it, because the axis itself is different. Carried over to stage 5 of §5.10.

Design intent. The body site is not asked of the user. Asking means options have to be read, and making people read hierarchies and options is, as established in §1.10, exactly what this app sets out to remove. By the time OCR has read "ophthalmic solution" the site is already determined, so it is something to derive rather than to ask.

There is judgement in how an unknown dosage form is handled as well. Previously a form absent from the table fell silently to a generic pill bottle picture. Inhaler or nebuliser, a pill bottle appeared on screen, and no record was left of how often that happened. Now a `\?form` marker is put in front. It means "we have no picture for this concept," and the online build composes a picture on the spot while the on-device build reports the absence rather than substituting a similar picture. For someone who cannot read, a wrong picture is worse than no picture. Absence falls through to speech, whereas a wrong picture is confidently wrong and the user has no way of knowing it is wrong.

We accept that this is only a partial solution. A head is also the vessel that carries time of day, count and storage, so when the form is unknown those lines are still drawn on top of a generic bottle. Fixing it properly requires the concept to become a formal morpheme, which is why `/api/glyph` writes the list of concepts it could not build to a file. That list is the basis for deciding which morpheme to add next. It accumulates in the order users actually encountered them.

### 2.4 Deriving a per-person verdict threshold

SnapCare is not a tool that reads labels aloud but one that reaches a verdict. And that verdict differs from user to user.

Most World Health Organization nutrition recommendations are stated as a share of total energy. Free sugars are less than 10% of total energy (equivalent to 50 g, with possible additional benefit from reducing further to 5% or below), saturated fat less than 10%, and trans fat less than 1%. Only salt is given as an absolute amount, less than 5 g a day for adults (2 g sodium), with children needing less in proportion to their energy intake (World Health Organization, *Healthy diet* fact sheet).

This manner of statement matters. Because the recommendations themselves are written as proportions, the correct implementation of the guidance is to derive from that person's energy requirement rather than to hold a fixed table of gram figures. The result is that the same can of drink becomes a warning for a seven-year-old and harmless for an adult.

The derivation is six lines in total.

```ts
/** Age band → representative age. The value picked as a picture in the profile
 *  takes precedence over string parsing. */
const BAND_AGE: Record<NonNullable<Member['ageBand']>, number> = {
  child: 7, teen: 15, adult: 35, senior: 70,
};

export function referenceFor(member: Member): DailyReference {
  const age = member.ageBand ? BAND_AGE[member.ageBand] : ageFromRole(member.role);
  const { energyKcal, weightKg } = bandFor(age);

  // Converting WHO percentage recommendations to grams — this derivation is the
  // core of the engine.
  const sugarsLimit = (energyKcal * 0.10) / KCAL_PER_G.carb;   // free sugars <10 %E
  const satFatLimit = (energyKcal * 0.10) / KCAL_PER_G.fat;    // saturated fat <10 %E

  // Salt and fibre are absolute recommendations → scale down for children by
  // the ratio of energy requirement
  const energyRatio = energyKcal / ADULT_ENERGY_KCAL;
  const saltLimit   = ADULT_SALT_LIMIT_G * Math.min(1, energyRatio);
  ...
}
```

Design intent. Age is folded into four representative values. The user picks one of four pictures rather than entering a number (§3.2), so all the app knows is the band. Computing with the band left as a band would mean hand-building a table of thresholds per band, and then the table would have to be rebuilt whenever WHO guidance changed, with no one able to check where it came from. Folding to a single representative age makes the computation follow the wording of the recommendation directly.

There is judgement in `Math.min(1, energyRatio)` as well. Salt and fibre are recommended as absolute amounts and cannot be converted proportionally. Children are scaled down in proportion to energy requirement (the very recommendation underlying §2.4 says children should have less according to their energy intake), but someone who eats more than an adult does not get a raised salt limit. The recommendation is a ceiling.

Returning the `basis` string alongside is also deliberate. "1,800 kcal at age 70, free sugars under 10%" appears on screen exactly as written (Figure 22(b)). If the user cannot see where a verdict came from, there is no way for them to examine it.

![Figure 20](fig/fig15_verdict_flow.png)

**[Figure 20]** The path by which the verdict threshold is derived. The user chooses only the two boxes at the top; the rest is computation. It is a derivation rather than a table because the WHO recommendation is itself written as a proportion of total energy, so when the recommendation changes one constant is edited instead of a table being rebuilt.

The pharmacy segment of §5.7 twice pointed at a risk this derivation can create. Professor and pharmacist So-Young Lee of Chungnam National University wrote that an interaction warning can itself prompt unilateral discontinuation.

> "For drug interactions too, even where the dose of the co-administered drug has been reduced in consideration of it, or the prescription has already been adjusted, seeing such a warning may lead the patient to stop the therapy on their own. In clinical situations a drug is sometimes used for the patient's treatment in full knowledge of an interaction."
> (Professor and pharmacist So-Young Lee, Chungnam National University)

Professor Katarina Vučićević of the University of Belgrade in Serbia offered one answer: attach an instruction to contact the doctor or pharmacist to the warning. As it stands this app says only what not to do on an avoid verdict and does not say whom to ask. The design of this section, which made the verdict a derivation, was treating the verdict as an endpoint.

The user's conditions are then added. Diabetes narrows the sugar threshold, taking a blood thinner makes ibuprofen-class drugs something to avoid, and pregnancy or breastfeeding changes the contraindication list.

### 2.5 Collecting conditions and inferring allergies

As established in the previous section, about 43% of adults with diabetes do not know they have it (International Diabetes Federation, *IDF Diabetes Atlas*, 11th ed., 2025), and for allergies there is a large gap between self-report and confirmed diagnosis.

The question "what are you allergic to" can therefore only be answered by someone who has been tested. SnapCare splits this question three ways.

[Table 10] How conditions are asked

| Branch | Form of the question | Example |
|---|---|---|
| What you know now | Current state | Pregnant, breastfeeding |
| What you have experienced | Experience | Ever felt unwell after eating something |
| What you have been told | Diagnosis | Diabetes, hypertension |

![Figure 21](fig/fig16_conditions.png)

**[Figure 21]** The three ways of asking about conditions (§2.5). The further right, the fewer people can answer. Existing apps ask only the third column, and as established in §1.5, 43% of adults with diabetes and 44% of adults with hypertension cannot answer it. That is why the first two columns are there.

The app also infers allergies the user does not know about. It runs Fisher's exact test over the food diary to find ingredients recurring in meals after which the user felt unwell. A minimum evidence threshold and multiple-comparison correction (Bonferroni) are applied, and the result is presented as an observation rather than a diagnosis and is not written into the profile until the user confirms it.

Whether this inference stays silent when it should has been pinned down with tests. In a feature that puts statistical inference on screen, the dangerous side is not missing something but declaring something that is not there. The tests confirm the following. It flags an ingredient when trouble recurs with that one ingredient, it does not flag on coincidental overlap alone, it says nothing when records are few no matter how high the proportion, and it does not allow the comparison at all when there are no meals without trouble to serve as a control. It also raises the bar as more ingredients are examined, does not count unanswered meals as data, and does not group peanuts together with tree nuts. Fisher's test itself is pinned against known values.

The pattern of symptoms is considered too. Hives and swelling, which suggest allergy, are separated from bloating, which suggests intolerance, so that the same ingredient may be presented one way or the other. Being told it is an allergy and being told something is hard to digest lead the user to different actions.

The conditions for staying silent are longer than the test itself.

```ts
export function findTriggers(log: MealFeedback[]): SuspectedTrigger[] {
  // Only ingredients that actually appear in the log are tested. Testing an
  // ingredient never eaten only inflates the Bonferroni denominator and kills
  // the real signal.
  const flags = new Set<ItemFlag>();
  for (const m of log) for (const f of flagsOf(m.tags)) flags.add(f);

  const testable = [...flags]
    .map((f) => ({ flag: f, condition: conditionForFlag(f) }))
    .filter((x): x is { flag: ItemFlag; condition: ConditionDef } => x.condition !== undefined);
  if (testable.length === 0) return [];

  const threshold = ALPHA / testable.length;   // Bonferroni

  for (const { flag, condition } of testable) {
    const withIt = log.filter((m) => flagsOf(m.tags).includes(flag));
    const without = log.filter((m) => !flagsOf(m.tags).includes(flag));

    const a = withIt.filter((m) => m.reaction === 'unwell').length;
    const b = withIt.length - a;
    const c = without.filter((m) => m.reaction === 'unwell').length;
    const d = without.length - c;

    if (a < MIN_UNWELL || withIt.length < MIN_EATEN || without.length < MIN_CONTROL) continue;

    const p = fisherRightTail(a, b, c, d);
    if (p > threshold) continue;
    ...
  }
}
```

The four values form a 2x2 table: `a` is the number of times the ingredient was eaten and the person felt unwell, `b` eaten and fine, `c` not eaten and unwell, `d` not eaten and fine. Design intent. The two `continue` lines are most of what this function does. The first looks at the amount of evidence: the number of times trouble occurred, the number of times the ingredient was eaten, and the number of meals without it. Without the last, the comparison does not hold, because an ingredient present in every meal was present on every occasion of trouble and would pass any test at all.

The threshold on the second line is `ALPHA / number of ingredients tested`. Examining ten ingredients makes the threshold one tenth. Putting twenty ingredients each against a 5% threshold catches about one even when nothing is related, and putting that one on screen as "you may be allergic to this" is the worst thing this feature could do.

Narrowing the tested set to ingredients that actually appear in the log follows the same reasoning. Including ingredients never eaten only enlarges the denominator and pushes the real signal below the threshold. A device for being conservative, carried too far, becomes a device for finding nothing.

Fisher's exact test was used because the samples are small. Chi-square cannot be used when expected frequencies fall below 5, and food diary tables always look like that. It is rare for a person to record eating one ingredient twenty times and how often trouble followed.

### 2.6 How this differs from existing approaches

This section sets out how SnapCare differs from what already exists. Two comparators are taken. One is the general health and nutrition app, the other is the de facto standard for pharmaceutical pictograms, the United States Pharmacopeia set. The first says it addresses the same users but addresses them in text, and the second does not use text but cannot combine.

[Table 11] Existing approaches compared with SnapCare

| Item | General health app | USP pictogram standard | SnapCare |
|---|---|---|---|
| Input | Typing and search | (not applicable) | One photograph |
| Output | Mostly text | 81 static pictures | Composed pictogram + speech + colour |
| Combination | — | **Prohibited by licence** | Combined by grammar |
| Verdict threshold | Fixed table or none | (not applicable) | Derived from personal energy requirement |
| Assumption | User knows their diagnosis | — | No diagnosis assumed |
| Comprehension check | None | Only post hoc studies | Measured automatically before release |
| Network | Required | — | Verdict computed on device |

The rows of the table are not independent of one another. Fixing the input as a single photograph in the first row means the user does not say what they photographed, so the app has to determine it itself (§3.3), and deciding in the fifth row not to assume a diagnosis changes how conditions are asked altogether (§2.5). Settling one brings the rest with it, and the starting point is the first constraint in §2.1.

The heaviest row in the table is the third, composition. As §1.9 showed, the USP set's licence forbids derivative works, so those 81 symbols cannot be joined to one another. Given that one prescription usually carries several instructions, that is not a small constraint. "Three times a day, with food, for a week" is three instructions, and with a fixed set there is nothing to do but place three pictures side by side. Composing by grammar means the combinations available from the same 78 morphemes are settled by a rule rather than by a list (§2.2).

The fourth row is larger than it looks as well. An app that judges from a fixed table applies one threshold, say "warn above 25 g of sugar", to every user. The WHO recommendation is itself written as a proportion of total energy, so that approach is the source rounded once. Derived as in §2.4, the same can of drink is a warning for a seven-year-old and not for an adult. This is a question of what is being measured, not of precision.

One row has to be read again against the survey of §5.7. In the fifth row we record not presuming a diagnosis as a differentiator, and yet 9 of the 12 pharmacy respondents answered that a pharmacist should review the instructions this app produces every time. Not asking about a diagnosis and reaching a verdict alone are different things, and what we removed is the first, not the second. What §2.6 claims as a differentiator is what the user is not asked, not that the process completes without a professional.

The last two rows are where we consider this work to have put something new. We did not find, within the range we looked over, a procedure that measures pictogram comprehension automatically before release (the same qualification as in §1.11), and §5.2 sets out both the procedure and its results. The remaining rows are design choices rather than distinct contributions, and the grounds for each are given in §2.1 through §2.5.

The limits of this comparison are set down too. We treated the general health app as a single type, though there is much variation within it, and we did not survey individual products systematically. The left-hand column is a set of features we observed repeatedly within the range we looked at, not the result of a market study. What the team leader at GC Medi-AI wrote in §5.7, that there are already many medication-counselling solutions, aims exactly at this limit. We may not have seen everything that already exists.

### 2.7 The three core functions

**Function 1. Prescriptions as picture and speech (Prescription Comprehension)**

When the user photographs a prescription, OCR (Tesseract.js) extracts the text inside the browser and SIGIL and VOCA process it in parallel. Six pieces of information are extracted from a prescription: which medicine, how many times a day, when, under what conditions, how to store it, and who must not take it.

![Figure 22](fig/panelA_flow.png)

**[Figure 22]** From capture to verdict. (a) Capture screen. The user does not choose what is being photographed. (b) Recognition in progress. Not hiding this stage is deliberate. A screen that has stopped with no indication reads as a fault. (c) Prescription verdict. From top to bottom: what it is, whether it is safe, what to do, what that means, and when, with the checking step of §3.8 attached at the foot. "How many do you take at a time?" is asked aloud and answered by pointing at a picture; it can be skipped, and the medicine information stays below it. The grey speaker circles that used to sit on every row are absent because §3.5 removed them; what remains is on the header and the pictogram cards, places that are not rows. The previews in (a) and (b) are empty because the browser automating the capture has no camera; on a real device the screen is filled.

**Function 2. Verdicts on food and nutrition labels (Personalized Verdict)**

When a nutrition label is photographed, OCR reads the figures inside the browser and, if a barcode is present, product information is looked up. When a meal is photographed, a nutrition estimation model on the device (EfficientNet-B0, 224px, trained on Nutrition5k) regresses five values: energy, mass, fat, carbohydrate and protein. The model is exported to ONNX and runs in the browser, and at 16 MB it is cached by the service worker (§4.5). Its measured accuracy is in §5.5.

Whichever path a value arrives by, it has to pass the same physical checks before it is used in a verdict: value ranges, subset relations (saturated fat ≤ total fat), mass balance, and the Atwater identity (4·carbohydrate + 4·protein + 9·fat ≈ energy). Why these checks are necessary is set out with actual cases in §5.

![Figure 23](fig/panelB_nutrition.png)

**[Figure 23]** After the verdict. (a) Nutrition label verdict. The figures are not transcribed but converted into the share they occupy of this person's daily reference. (b) Today's running total. Not a single verdict but the day's sum. The source attribution at the bottom has never been removed from the screen. (c) Device link. The result of placing the schedule the app produced into the dispenser trays; because of the constraint in §4.3 this button acts as top-level navigation.

**Function 3. Automatic pill dispenser link (Device Link)**

The dosing schedule produced by the app is sent to the device. The device is based on a Raspberry Pi 3B with three trays, an LED ring, a buzzer, a confirmation button and a real-time clock (DS1302).

The design of the transmission path is the result of several constraints applying at once. This is detailed in §4.

![Figure 24](fig/fig10_dispenser.png)

**[Figure 24]** The dispenser's wiring and the device's own console. On the left is the wiring drawn from the pin map, on the right the same firmware running on a laptop with only the servo driver swapped for a recording stub. The API, the scheduler and the storage are the same code that runs on the device. These two are shown instead of a photograph because what gets decided here is not visible in a photograph. Splitting the power rails in two is an example. One SG90 under load draws about 700 mA, and pulling that from the same rail as the Pi causes a brownout, and the file in use at that instant happens to be the one recording whether this dose has already been dispensed. The two missed doses in the dose log at the lower right matter for the same reason. If a dose that was not dispensed is not recorded as not dispensed, every subsequent dose number is off by one.

---

## □ User Flow of the Web App

### 3.1 The overall flow

SnapCare's user flow is built on the principle of running from a single photograph to a verdict without branching. As cited in the previous section, a deep hierarchy takes non-literate users 65.5 seconds on average against 25 seconds for a flat list (Medhi, I., Toyama, K., Joshi, A., Athavankar, U. & Cutrell, E., "A Comparison of List vs. Hierarchical UIs on Mobile Phones for Non-literate Users," *INTERACT 2013*, LNCS 8118:497–504). Choices on the path to a verdict were therefore minimised.

![Figure 25](fig/fig11_userflow.png)

**[Figure 25]** The overall user flow. Beneath each step is the reason that step is shaped as it is. What to look for in the diagram is that there is no point anywhere requiring reading.

The whole flow is the following five steps.

[Table 12] The steps of the user flow and what each requires

| Step | Screen | What the user does | Text to read |
|---|---|---|---|
| 1 | First-run guide | Press next (skippable) | None (picture + speech) |
| 2 | Profile setup | Choose age and conditions | None (picture selection) |
| 3 | Home | Press the capture button | None |
| 4 | Capture | Point and shoot | None |
| 5 | Verdict | Look and listen | None |

The last column of Table 12 is the point of this design. At no step is the user required to read or type.

There is one more thing absent from the table. There is no step for going back. If the photograph was wrong, take another; if the verdict is unwelcome, close it. Intermediate steps such as cancel, edit and confirm were left out because each of them requires reading "what is being asked right now." Of the five steps, 1 and 2 are passed through only once, so from the second use the real path is three steps: press on the home screen, shoot, look.

One thing should be noted, though. The shortness of this flow is a constraint as much as a result of the design. Removing choices also removed what the user can tell the app. Because the user does not choose what they photographed, there is nothing on screen to correct a misclassification, and taking another photograph is the only recourse. This is recorded as an unverified item in §5.9.

### 3.2 First run and profile setup

Opening the app for the first time leads through five guide cards to profile setup. This step is needed because of the verdict method described in §2.4. Since thresholds are derived from the user's energy requirement, no verdict is possible without knowing the age band.

Age is not entered as a number. Four bands (child, teenager, adult, older adult) are chosen through our own morphemes (`state_child`, `state_teen`, `state_adult`, `state_elderly`). There is a reason emoji were not used. Emoji are drawn differently on every device, and the emoji that might stand for a teenager (🧑‍🎓) actually means "graduate," which means nothing at all to a child who does not attend school. The four morphemes are drawn as one family, so placed side by side the difference in age is visible as form. Conditions are likewise offered as picture cards along the three branches of §2.5 (what you know now, what you have experienced, what you have been told).

Originally this screen asked the user to choose a face first. It was a step of picking one of eight person pictures, and after testing it was removed from the first run. A face is only a marker with no bearing on the verdict (it indicates who someone is), yet it was the first thing demanded on screen, which made the first demand met by a new user a choice with no value attached. That in turn makes the questions after it, age and conditions, read with the same weight, and those two do carry weight. The face was moved to the settings screen.

The step can be skipped, but if it is, the home screen keeps displaying "showing adult thresholds." This is to prevent a default from being applied silently. The reason for this indicator connects directly to the claim in §2.4 that the verdict differs per person. A verdict produced without knowing the age still appears in the same greens and reds on screen, and if the screen does not say whom the verdict was computed for, the user reads it as an answer computed for them.

The lock is a picture key rather than a text password. Four pictograms chosen in advance from twelve are pressed in order. The number of combinations is comparable to a four-digit PIN while what has to be remembered is pictures rather than digits, so users who cannot handle letters and numbers can use it. Only a hash of the sequence is stored (§4.6).

The list of household members sits on this same lock screen (§3.6). It has the same structure as an operating system lock screen, and because choosing a face and unlocking finish on one screen there is no need to build a separate way back after choosing wrongly. Someone using the phone alone never sees the list. Asking a single person to choose is asking them to make a choice that does not exist.

![Figure 26](fig/panelC_onboarding.png)

**[Figure 26]** First run. (a) Five guide cards. Each is a picture and one sentence, and on arrival the screen reads that sentence aloud by itself. (b) Profile setup. The age band is chosen through our morphemes and conditions through picture cards, with no input field on either. This step is needed because of the verdict method in §2.4. Since thresholds are derived from the user's energy requirement, no verdict is possible without knowing the age band.

Two answers in §5.7 split exactly on this screen. Asked where a first run gets stuck, one of the two HCI respondents chose granting camera permission and the other chose that it does not get stuck. Myojung Choi, researcher at the Korea Disabled People's Development Institute, set down the reason for the first.

> "A user who has difficulty reading may struggle with the subsequent steps if spoken guidance is not provided at the initial permission stage, and their actions may be constrained as a result."
> (Myojung Choi, researcher, Korea Disabled People's Development Institute)

The permission dialogue is drawn by the browser, so we cannot put speech inside it. Saying in advance what is about to be asked is all we can do, and the five guide screens occupy that place now. From the moment the dialogue appears after the guide, however, it is no longer our screen. It belongs to the unverified items in §5.9.

Yonghan Lee, Senior Manager at the Korea Craft and Design Foundation, looked at it the other way. Someone who seeks this app out already knows roughly how it works, and if so a procedure of this length is perfectly possible with pictures and speech alongside. The two responses do not contradict each other. The first is about someone opening it for the first time, the second about someone who came looking. How this app reaches whom has not been settled, so both are possible conditions.

### 3.3 From capture to verdict

#### 3.3.1 Getting to the shutter

Pressing the blue circle on the home screen moves to the capture screen. At the very top is one line, "Point at something," and the screen reads that sentence aloud the moment it arrives. You do not have to press anything to find out what to do.

In the middle is a preview area, and below it a single 64-pixel white circle. That circle is the shutter. It is the only pressable thing on the screen, and there is no step for choosing what is being photographed. Prescription mode, label mode and food mode were not created because that choice would itself reintroduce the cost of hierarchy cited in §1.10. The user is already holding whatever they are photographing, so there is no reason to make them tell the app a second time.

Pressing the shutter opens the device's own camera, and the photograph comes straight back to the app. No separate capture screen was built inside the app because the device camera already handles focus, exposure and stabilisation, and reimplementing that could only make it worse.

#### 3.3.2 The order in which what was photographed is decided

The returned photograph is classified into one of four categories: food, drink, medicine or prescription. This determination is not made at once but split across two layers.

The first layer runs on the device. Text is read from the photograph first (Tesseract.js, running inside the browser), and the text is examined for markers. If markers such as `nutrition`, `per 100`, `영양성분` (nutrition facts) or `1회 제공량` (serving size) are present together with two or more nutrient names, it is treated as a nutrition label. If two or more of dose notations such as `500 mg`, dosage forms such as `tablet` or `capsule`, and dosing instructions such as `twice daily` or `after meals` appear, it is treated as a prescription. Once it settles into one of the two, the dedicated parser runs on the spot and no server is called.

The second layer is invoked only when the first has failed. If the text read from the photograph is shorter than four characters (which is usually the case for food photographs) or the markers match neither pattern, the photograph is sent to the vision model on the server.

![Figure 27](fig/fig19_recognition.png)

**[Figure 27]** The two layers that decide what was photographed. Falling to the left calls no server; only falling to the right needs a connection. This split is what makes the offline operation of §4.5 possible.

There is a reason for this order. Finishing anything with text on the device and sending out only what needs a connection means prescriptions and nutrition labels are read without an internet connection. These two are the most urgent things in this app (§4.5).

#### 3.3.3 What is shown while waiting

While recognition runs, the preview area displays what is happening in text, and the same sentence goes out as speech. The four sentences actually displayed are as follows.

[Table 13] The stages shown during recognition

| Display | When it appears | Duration |
|---|---|---|
| `Reading text… 43%` | While text is read on the device, the percentage rising in real time | Usually 2–6 s |
| `Checking the label…` | Read as a label but the values failed the checks, so the server is being asked again | 1–3 s |
| `Estimating…` | The on-device nutrition model is running and server classification is awaited | 2–5 s |
| `Loading sample…` | A sample image was chosen | Under 1 s |

Showing the percentage rather than hiding it is deliberate. One of the barriers identified in research on low-literate users is intimidation (Medhi, I., Cutrell, E. & Toyama, K., "It's not just illiteracy," *Proc. International Conference on Interaction Design & International Development*, 2010), and a screen that has stopped with no indication reads as a fault. Simply watching the number climb conveys "it is running," and that is conveyed without reading. For the same reason the shutter and every button below it are locked against presses while recognition runs. Pressing twice must not run it twice.

#### 3.3.4 The vertical order of the verdict screen

The verdict screen splits into two versions depending on what was photographed. The criterion for the ordering is the same: scanning top to bottom without reading, what is needed has to come first.

[Table 14] Composition of the verdict screen (food and drink / prescription and medicine)

| Order | Food and drink | Prescription and medicine |
|---|---|---|
| 1 | 112px round picture with verdict sentence | 96px round picture |
| 2 | Summary bar carrying colour and symbol | Drug name and dose per administration |
| 3 | Pictogram sequence | Safety bar carrying colour and symbol |
| 4 | Nutrient bars (up to 3) | Pictogram sequence |
| 5 | Alternative suggestion card | Dose card and storage card |
| 6 | Confirm button | Dosing schedule |

![Figure 28](fig/fig22_verdict_order.png)

**[Figure 28]** The two vertical orders of the verdict screen. The red arrow marks where the pictogram was moved up two places on the prescription side. The colour-and-symbol band is pushed down with it.

The difference between the two versions is at positions 4 and 3. For prescriptions the pictograms were moved above the text cards. They were below at first, and a user who cannot read scanning from the top had to pass three empty cards before reaching a picture. Changing the order alone removes those three.

Cutting the nutrient bars to three follows the same criterion. Items below 5% of the daily reference and items already sufficient are dropped, and only the top three of what remains are shown. Showing all ten lines buries which one is the problem.

#### 3.3.5 What determines the verdict

Colour has three levels and is derived from the user's conditions. Where several grounds apply, the worst wins.

[Table 15] Grounds that raise the verdict level

| Ground | How it applies | Result |
|---|---|---|
| Conflict between a user condition and an ingredient | The trigger ingredient of a condition the user selected is present in this item | Varies by condition. Peanut allergy gives avoid, diabetes gives caution |
| Not confident what it is | Vision model confidence below 0.4, or all nutrient values returned as zero | Fixed at caution |
| A whole day's allowance at once | 100% or more of this person's daily limit | Caution |
| Interaction with a medicine being taken | Conflict with an already registered medicine | Fixed at avoid |

The third row is why this app's verdict differs from person to person. Because the daily limit is derived from the user's age band rather than taken from a table (§2.4), the same snack can come out as caution for a 65-year-old and safe for an adult.

The second row was added later. The vision model tends to return all values as zero when it is not confident, and zero passes every one of the physical checks in §4.2. It catches on no check at all and is displayed as a green "safe." A separate judgement, that all zeros means the item was not recognised, was therefore added apart from the physical checks.

The screen during recognition and the resulting verdict screen are in Figure 22(b) and (c).

### 3.4 The path when recognition fails

There are cases where what was photographed cannot be read. What is shown at that moment determines the next action.

The failure sentence is spoken aloud at the same time as it appears on screen. There is a reason this behaviour was added later. Every other screen in the app speaks through pictures and speech, yet on failure alone a single line of text sat there silently. For a user who cannot read, that screen is the same as nothing having happened. The one moment that most needed help was the only one demanding text.

Alongside the sentence come one picture and a two-word instruction.

[Table 16] Failure guidance

| Situation | Picture | Instruction | What it asks for |
|---|---|---|---|
| Table read but values unstable | 🔍 | Move closer | Fill the frame from closer and retry |
| Paper folded or skewed | 📄 | Lay it flat | Flatten it out and retry |
| Camera shake | 📱 | Hold steady | Steady the hand and retry |
| Could not reach the server | 📡 | No connection | Retrying will not help. Photograph a label or pick a sample |
| Not recognised | 🔄 | Try again | Taking another photograph will do |

![Figure 29](fig/fig25_failure.png)

**[Figure 29]** The two paths a failure takes. On the left, failures that another photograph will fix; on the right, failures another photograph will not. This split is why server responses 422 and 501 are handled separately.

What matters in this table is that the fourth and fifth rows are separated. Server responses are handled separately as 501 (no means available) and 422 (not recognised). If it was not recognised, taking another photograph is the answer, but if there is no connection a hundred more photographs give the same result. Showing the same sentence in both cases leaves the user retaking photographs until it works.

On failure, a list of samples unfolds at the bottom of the screen. It stays collapsed normally and appears only at the moment of failure. There is no reason for someone whose scans are working to see it, and someone who is stuck needs to see that another route exists.

No separate "retry" button was added. The shutter is still in place and returns to a pressable state, so adding another button would put two things doing the same job on the screen.

### 3.5 Routes to the audio

Speech plays once automatically on arriving at the verdict screen. The listener cannot rewind it, however. Every sentence on the screen is therefore something that can be pressed to hear again.

This design responds to the IVR research in §1.10. What that study identified as the main difficulties for older users were speech rate and the length of options. Even if it is not all taken in at once, the part that is needed can be heard again.

#### 3.5.1 Signalling that something can be pressed

This design had a defect that surfaced during development. **There were 78 pressable places and only nine visible indicators**, and those nine were emoji at 0.75 times body size with 40% opacity. The capability existed but where to press was invisible, and for a user with reduced vision that is the same as its not being there.

Drawing the indicator larger is only half of it. Pressing is a tool for someone who already knows there is audio, and to someone opening the app for the first time a speaker glyph is just another picture. Three things were therefore put in place together.

[Table 17] Three routes to the audio

| Route | What it does | Why it is needed |
|---|---|---|
| Speaks on arrival | One line per screen, "what this screen is asking" | There is nothing to look for. Nothing has to be pressed |
| Sweep the screen to hear it | Press and hold, then slide, and whatever passes under the finger is read in turn | There is no need to know in advance where the audio is |
| Read the whole screen | One cell in the bottom tab bar | Hear it again from start to finish |

The arrival announcement reads one line per screen. Reading everything would pour a paragraph out on every screen change, and then the user turns the speech off. That is the worst outcome in this app. Once it is off, nothing is heard at all.

The grey speaker circles that sat on every line were taken away. Having attached audio everywhere audio could go, eight to ten circles ended up tiled across a single screen, while the thing being pressed was the whole line and the circle was only a sign saying "there is audio here". What occupied the most space on the screen was not a function but a sign.

The sign was there because we held that the user has to be told in advance where the audio is. Being able to sweep removes that premise. Press and hold, slide, and what passes under the finger is read in turn, so it is swept rather than searched for. This is how a screen reader navigates, and it is closer to the criterion established in §1.10, that no step requiring explanation should be created.

The signs did not disappear altogether; they became transient. While a sweep is in progress `html[data-hearing]` reveals every place that has audio, and they go quiet again when the finger lifts (`app/globals.css`). So the screen shows where the audio is exactly while the user is looking for it, and shows nothing the rest of the time.

#### 3.5.2 Speaking the pictograms

The last thing discovered was that only the pictograms did not speak. The verdict, the product name and the nutrient figures could all be pressed and heard, while the pictures, the core contribution of this work, were silent.

The observation of van Beusekom et al. (2017) cited in §1.8 applies here directly. Three of ten symbols produced false confidence, believing one understands while not recognising the symbol, and that is a worse failure than having no picture. Someone who does not recognise a picture may at least ask, whereas someone who recognises it wrongly acts on it. The remedy the same paper offered was that comprehension rises when a pharmacist points out what the picture means. Pictures work better used alongside words than in place of them.

Our users have no pharmacist beside them. The app therefore takes that place. Pressing a picture makes it say what it means. What is read out is not the appearance of the picture but the action it prescribes.

```
\three_times_daily{\tablet_blister{\food_bowl}}
    → "A tablet, with food, three times a day."

\no{\allergen_peanut}
    → "Do not eat this. It has peanuts."
```

Saying "a tablet and a bowl" only repeats what is already being seen, while what is actually unknown, namely what one is being told to do, remains untouched.

Lines whose meaning is unknown are made unpressable altogether. An invented explanation would harden exactly that false confidence.

### 3.6 Sharing a device and separating household members

In the target regions a smartphone is not a personal possession but the one device in the house (§1.6). If the app handles only one person, then when a grandmother and a grandchild share the same phone what the grandchild scans is added to the grandmother's daily total, and the blood thinner the grandmother takes fires on the grandchild's verdict. It is not merely that records mix; the verdict is wrong.

At the start, therefore, a face is chosen and the user enters their own space. Each space has its own picture key, and profile, history and reminders all accumulate separately. The screen has the same structure as an operating system lock screen. The member list and the lock share one screen, so there is no need to build a separate way back after choosing wrongly.

Someone using the phone alone never sees this screen. Asking a single person to choose is asking them to make a choice that does not exist.

The dividing point is a single storage key. The first person's data stays at `snapcare-profile`, and from the second person on it goes to `snapcare-profile#<id>`. Because this rule sits in the one layer that reads and writes data, the verdict, aggregation and inference code has no need to know how many people it is handling. The same rule covers the five things that must be separated: profile, history, reminders, session and suggestions. No suffix is attached to the first person's key so that data belonging to someone who was already using the app alone is not moved.

Names are still not asked for. Identity is one of eight faces (🧑 🧒 👶 🧓 👩 👨 👦 👧), and faces already taken drop out of the list so that two people cannot choose the same one. A colour is attached as well for cases where the face alone is confusing.

Switching between people does not merely swap the screen but reopens the app from the start. Re-reading the data in place can leave a part of the app still holding the previous person's allergy information, and nothing on screen would show that it is still there. A verdict produced in that state looks exactly like a correct one. The one second it costs to reopen is cheaper than that risk.

On the member list screen only the current person's conditions are shown and the others read simply as "another person." This is not concealment but a genuine inability to read them. Another person's data sits behind a key this session does not open.

Deleting takes two presses. One press raises a red outline, and a second deletes. No "are you sure?" dialogue is raised, because that sentence is not readable by this app's users. An unreadable confirmation dialogue is not a confirmation but merely one more press, so the procedure itself was made two-stage. The current person and the last remaining person cannot be deleted.

What this section covers is several people sharing one device, not several people helping one person. Six of the nine in the nursing and public health segment of §5.7 answered that the patient and the carer should be designed for separately, and Foued Maaoui, researcher at the Institut Pasteur de Tunis, addressed the premise head on.

> "The original assumption that the patient will use the app alone does not match common practice, especially among older adults, people with low literacy, cognitive impairment, or complex regimens."
> (Foued Maaoui, researcher, Institut Pasteur de Tunis)

Professor Minsun Song of Konyang University put the same thing differently: it should be built so that the patient and the carer can both understand it at once. There are dissenting views. Professor Celia of the University of Pretoria did not feel separate designs would be required, and Professor Namsoo Park of Hyupsung University answered that it depends on the age and condition of the target.

This app is designed on the premise that the patient uses it alone. The checking step of §3.8, the per-person thresholds of §2.4 and the member separation of this section all assume one person in front of the screen. Split 6 to 2, this answer aims at that assumption rather than at any one feature. We have not changed it. Building a separate screen for the carer means rebuilding the step §2.1 set out to remove, and which is right can only be learned by asking people. It has been added as an item to confirm in the field evaluation of §5.10.

### 3.7 Channels other than colour

Verdicts are displayed in three colours: green, amber and red. Red-green colour vision deficiency, however, affects about 8% of men and about 0.5% of women of northern European descent, and is estimated at around 300 million people worldwide (Colour Blind Awareness; MedlinePlus Genetics).

One thing should be added. This proportion varies by ancestry, reported at 4% to 6.5% among men of Chinese and Japanese descent and lower in sub-Saharan Africa. The risk therefore varies by region and, depending on where the user is, may be smaller than in northern Europe. The reason for not entrusting the verdict to colour alone even so is the asymmetry of the cost rather than the prevalence. Giving only colour to someone who cannot see colour means the verdict is not delivered at all, whereas the cost of also carrying a symbol and a sentence is one line of screen.

WCAG 1.4.1 requires that colour not be the sole means of conveying meaning, and it has repeatedly been pointed out that contrast alone is not sufficient. Even with high luminance contrast, hue may not be distinguishable to someone with red-green deficiency (W3C WCAG 2.x).

The same verdict therefore goes out through five channels at once.

[Table 18] The five channels one verdict travels through

| Channel | Safe | Caution | Avoid |
|---|---|---|---|
| Colour | Green `#0E7A38` | Amber `#B45309` | Red `#C81E1E` |
| Symbol | ✅ | ⚠️ | ⛔ |
| Word | Safe | Caution | Avoid |
| Sentence | "Safe to eat." | "Caution for 〈name〉" | "Do not eat." |
| Picture | Morpheme as drawn | As drawn plus a warning morpheme | Morpheme wrapped in the negation operator |

The last row is SIGIL's part. An avoid verdict does not paint the picture red but wraps the picture itself in `\no{...}` and draws a slash across it (§2.2). Someone who sees no colour at all still sees the slash.

The same principle repeats in the nutrient bars. One fact is expressed five times over: as bar length, as colour, as a number, as a per-nutrient picture (🔥 🍬 🧂 🧈 🫒 💪 🌾 🍚), and as a spoken sentence. The speech does not read the value alone but appends a judging word, as in "That is high." Hearing a number and deciding for oneself whether it is large requires knowing the reference, and knowing the reference is precisely the ability this app has decided not to assume.

The line currently being read gains an outline. Where the audio has reached has to be visible as well as audible, so that someone who lost the thread can press that spot again.


#### 3.7.1 Whether the colours themselves can be read was measured separately

If everything so far concerns the layers that substitute for colour, whether the colour itself can be read is a separate question. In §5.7, E. A. Draffan, retired speech and language therapist and visiting accessibility researcher at Global Symbols and the University of Southampton, wrote that the WCAG 2.2 mobile criteria should be checked. The reason given was that AAC users frequently have visual difficulties as well and operate by scanning, which makes an audio button hard to reach. Working through the criteria, two items failed.

The first is contrast. All five verdict colours fell short. SC 1.4.3 of WCAG 2.2 requires 4.5:1 for body text, and these colours are not decoration but the colour of the verdict sentence itself. It is not that one of the five channels in Table 18 dims but that the sentence does not read.

[Table 19] Contrast of the verdict colours (on the off-white background `#F4F3EF`, criterion 4.5:1)

| Use | Before | Ratio | Now | Ratio |
|---|---|---|---|---|
| Safe | `#15A34A` | 2.97:1 | `#0E7A38` | 4.90:1 |
| Caution | `#DE8500` | 2.53:1 | `#B45309` | 4.52:1 |
| Avoid | `#DC2626` | 4.35:1 | `#C81E1E` | 5.17:1 |
| Accent | `#2F6BF6` | 4.15:1 | `#1D4ED8` | 6.04:1 |
| Secondary text | `#6B7280` | 4.35:1 | `#55606E` | 5.76:1 |

All five were darkened by one step while the hue was kept. Green, amber and red have to be recognisable as such at a glance for the channels to remain distinct. The present values exceed 4.5:1 in all four combinations: on a white card, on the off-white background, on their own tinted band, and as white text on the colour itself.

These are values the eye cannot hold, so they were locked with a test. The earlier values looked perfectly fine on screen, and that is in fact how they survived this long. The test measures more than contrast: it also checks that the three colours remain distinct in hue. Measuring contrast alone can be satisfied by collapsing everything to dark grey, which is the most common way of passing a test while losing what the test was for.

The second is target size. SC 2.5.8 requires a minimum of 24 pixels. The large controls were already 44 pixels, but secondary controls such as the read-again row and the row back to settings were between 16 and 20. A thin row to scan and tap is particularly bad in this app, because tapping that row is how someone who cannot read reads the screen. A 24-pixel floor was applied.

What was already correct should be recorded too. The path by which a scanning device reaches the audio (SC 2.1.1, keyboard operation), the absence of unnamed controls (SC 4.1.2), no horizontal scrolling at 375 pixels (SC 1.4.10) and no obscured focus (SC 2.4.11) were all confirmed to hold. These four are listed not to claim credit for passing but because stating how far we looked is what separates "passed" from "not checked".

---

### 3.8 Checking that it was understood

A verdict screen having appeared does not mean the delivery is finished. This is the point Foued Maaoui, a researcher at the Institut Pasteur de Tunis, raised in §5.7. However clear the screen, without a procedure for confirming that the person who saw it understood it there is no returning signal, and from a patient-safety standpoint the absence of that loop is a serious risk.

Teach-back as used in clinical practice runs like this. When the explanation is finished, the clinician asks the patient to say how they will take the medicine at home, and re-explains whatever is missing from the answer. The premise is that nodding is not evidence of understanding. The systematic review cited in §5.7 found positive results in 19 of 20 studies of this procedure.

The procedure cannot be carried across to our users as it stands. They cannot read, and the microphone is closed off entirely (§4.6). Speaking back would require speech recognition, and that is a permission we chose not to open. So instead of speaking back, the user points back with pictures. The question goes out as sound and the answer is a picture that gets tapped. The pictures to tap are not drawn afresh; they are the morphemes of §2.2.

This is where the reason for using morphemes rather than a line of DSL as the answer set becomes visible. `\qty_two` is "two" without saying two of what. It is the same reason the grammar of §2.2 forbids a modifier standing alone, and what is needed in this position is not a sentence but a single picture to point at.

[Table 20] What the check asks (it asks only what the prescription said)

| Order | What is asked | Spoken question | Answer set | When it is not asked |
|---|---|---|---|---|
| 1 | How many at a time | How many do you take at a time? | three count morphemes | when the prescription carries no per-intake count |
| 2 | When | When do you take it? | three time morphemes | when the times absent from the prescription cannot fill two slots |
| 3 | With food or not | Do you take it with food? | bowl · empty bowl | when the prescription does not state a meal context |

Count was put first. Of the 155 dispensing errors found by pharmacists in Table 4, 28.4% were dose errors, and Professor Atif Usman's remark in §5.7 that the dose per intake and the times per day are not distinguished points at the same place. At most two of the three are asked rather than all three. A check that drags on becomes another step in itself, and steps are what this app set out to remove.

There are three things we did not concede in the design.

First, it does not block. A wrong answer moves on, the check can be skipped, and the medicine information stays on the screen below throughout. An app that withholds information until a check is passed is an app that stops people taking their medicine. This is a check, not a test.

Second, it asks only what the prescription said. Asking about something not written there would require us to invent an answer, and we would then be teaching an invented answer as correct. Asking about a meal context only when the prescription mentions one is that rule.

Third, when the answer is wrong it says the right thing again on the spot. The correct picture is lit and read aloud once more, using **the same sentence** as when the answer was right. Whichever way the user pointed, the last thing they hear has to be the correct instruction. The point of the check is not a score but a second chance.

What we decided not to ask should be recorded too. The distractors for the time question have to be times absent from that prescription. Offering an actual dosing time as a distractor would mean telling someone who pointed correctly that they were wrong. For a medicine taken three times a day only one time remains, so the answer set would be two, and a fifty-fifty guess is not a check. It is a question that fails to separate those who understood from those who did not while leaving behind the fact that a question was asked, so it is not asked at all. A medicine taken three times a day already has count and meal context worth asking about.

The answer order is shuffled, but always the same way. If the answer moves around each time it is seen, someone who remembered the position they tapped the first time is lost the second. What is needed here is not randomness but only that the correct answer is not always in the first slot, so the shuffle is derived from the item identifier.

This step was built after the survey in §5.7. It has not been verified with people, and whether pointing at pictures produces the same confirming effect as speaking back is an item for the field evaluation in §5.10.

## □ Development and Implementation

### 4.1 Overview of the stack

This section first sets out what was built with which tools, and the sections that follow take up one by one the points where a judgement had to be made. The content of this section is why those choices were made rather than the stack itself.

[Table 21] Technical stack

| Layer | Technology | Note |
|---|---|---|
| Web app | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind | Static build maintained |
| Pictogram engine | SIGIL — own DSL · recursive descent parser · Python/Pillow composition | 78 morphemes |
| Speech engine | VOCA — own composition logic · Web Speech API | Device built-in voices |
| OCR | Tesseract.js | Runs in the browser |
| Nutrition estimation | EfficientNet-B0 224px (trained on Nutrition5k) · onnxruntime-web | On-device inference |
| Product data | OpenFoodFacts API | Via server |
| Image recognition | Claude Vision | Via server |
| Hardware | Raspberry Pi 3B · 3 servos · WS2812 · DS1302 | 3 trays |
| Deployment | fly.io (Tokyo) · 1 GB persistent volume | |

Reading the last column on its own shows how this stack is put together. The heavy things are on the device and the light things are on the server. A 16 MB nutrition estimation model runs in the browser, while recognising what a photograph shows goes out to the server. This is the reverse of an ordinary web app. Sending heavy computation to the server is the conventional choice, and it lets the device be old and makes the model easy to swap.

There is one reason for inverting that convention. Anything on the server becomes nothing when the internet drops. Only the things "without which the verdict does not hold at all" were therefore moved onto the device.

[Table 22] What runs where

| Task | Runs on | If the internet drops |
|---|---|---|
| Reading text from a photograph | Device | Works as normal |
| Label parsing and physical checks | Device | Works as normal |
| Prescription parsing | Device | Works as normal |
| Reading the paper form | Device | Works as normal |
| Nutrition estimation (photo) | Device | Works as normal |
| Verdict and daily reference calculation | Device | Works as normal |
| Recognising what was photographed | Server | Treated as unrecognised, shown as caution |
| Product data lookup | Server | Proceeds without the lookup |
| Composing a new pictogram | Server | Only pre-built ones appear |

What separates the top six rows from the bottom three is urgency. Reading a prescription is not the kind of thing that can be postponed for want of a connection, whereas a verdict still comes out without a product lookup. Whether this boundary actually behaves as stated was checked in §5.6 with the connection cut.

One cost should be recorded. Running the model on the device means 16 MB is downloaded again whenever the model changes. Kept on the server, it could have been swapped without the user noticing. Between working without an internet connection and being fixable quietly, the former was chosen, and once the target users were settled this left no room for deliberation.

### 4.2 Physical checks in the verdict engine

Nutrition information arrives by three routes: OCR of a nutrition label, a product database lookup, and estimation from a food photograph. The three differ in reliability, and photograph estimation is the least reliable. The most recent models in this field give a mean absolute error of **253.7 kcal** for energy, 98.4 g for mass, 24.2 g for carbohydrate, 22.1 g for protein and 14.3 g for fat (Chen, T. et al., "NutritionVerse-Direct: Exploring Deep Neural Networks for Multitask Nutrition Prediction from Food Images," arXiv:2405.07814, 2024).

How large an energy error of 253.7 kcal is becomes clear against the thresholds in §2.4. Against a daily 1,800 kcal at age 70 it is **14%**, and taken against a 700 kcal meal it is more than a third. That is not accuracy sufficient to judge "may I eat this" from a single photograph. This route was kept anyway because local food in the target regions is in no product database, and for that reason values from this route reach the screen only after passing exactly the same physical checks as the other two.

SnapCare therefore applies the same checks regardless of which route a value came in by.

[Table 23] Checks a value must pass before it is accepted

| Check | Content |
|---|---|
| Range | Is each nutrient within a physically possible range |
| Subset | Saturated fat ≤ total fat, sugars ≤ carbohydrates |
| Mass balance | Does the sum of nutrients exceed the total mass |
| Atwater identity | 4·carbohydrate + 4·protein + 9·fat ≈ energy |

![Figure 30](fig/fig17_gate.png)

**[Figure 30]** Three paths pass through one gate (§4.2). The red line underneath is the reason the checks were gathered in one place rather than placed on each path. The third path arrived in this app later, and no additional validation code was written for it. It was simply routed through the gate that already existed.

One response in §5.7 sums up why these checks sit ahead of the verdict. Associate Professor Hangil Lee of the College of Pharmacy, Ewha Womans University, withheld judgement on whether the app could fit a pharmacy workflow and pointed at the order: accuracy has to be secured before convenience. The gate in this section is that order written into code. Wherever a value came from, it is not used in a verdict unless it holds up physically, and the price is that sometimes no value is produced.

The Atwater identity is particularly useful. It is a relation that must hold for values from any source, so the consistency of the values themselves can be checked without having to trust the source.

There was a case where this check was genuinely needed. During development the label parser was found reading the fat value at ten times its actual figure while discarding correctly read carbohydrate and protein values. The Atwater check does not let that combination through.

The checks are gathered into a single function in front of the verdict engine. All three routes pass through this function before anything becomes a value.

```ts
export function validateDensity(per100: NutrientAmounts): ValidationResult {
  const problems: string[] = [];

  for (const [k, v] of Object.entries(per100) as [NutrientKey, number][]) {
    const b = BOUNDS[k];                                   // ① physical range
    if (b && (v < b[0] || v > b[1])) problems.push(`${k}=${v} out of range ${b[0]}–${b[1]}`);
  }

  if (gt(per100.sugars, per100.carbohydrates)) problems.push('sugars > carbohydrates');
  if (gt(per100.saturatedFat, per100.fat)) problems.push('saturatedFat > fat');   // ② subset

  const mass = (['carbohydrates', 'fat', 'protein', 'fiber', 'salt'] as NutrientKey[])
    .reduce((s, k) => s + (per100[k] ?? 0), 0);
  if (mass > MASS_LIMIT) problems.push(`mass ${mass.toFixed(1)} g per 100 g`);     // ③ mass balance
  ...
}
```

Design intent. The checks were gathered in one place rather than placed on each route. Placing them per route means reattaching them every time a route is added, and a route where someone forgot to attach them immediately becomes an unverified channel. The third route (photograph estimation) did in fact arrive later in this app, and no additional verification code was written for it. It was simply made to pass through the gate that already existed.

Returning `problems` as an array of strings rather than a boolean is also deliberate. When a value is rejected the screen has to be able to say what went wrong rather than "could not read it," and during development those strings become the log directly. It was these strings that surfaced the case of the fat value read at ten times its figure.


### 4.3 Choosing the hardware link

Connecting the phone to the dispenser was a problem with several constraints applying at once.

[Table 24] Connection methods considered and why each was excluded

| Method | Reason for exclusion | Nature |
|---|---|---|
| Web Bluetooth | iOS forces WebKit on all browsers, so `navigator.bluetooth` does not exist | Platform constraint |
| Direct `fetch` from an HTTPS page to the device | Mixed content blocking. The request never leaves the browser | Platform constraint |
| Cloud broker (MQTT over wss) | Solves all three problems but **requires internet on both sides** | Conflicts with the target environment |
| Dropping iOS support | Android share is 86.6% in Africa, 90.9% in Latin America and about 95% in India, so there is a basis, but **it contradicts the product's claim of working for anyone** | Our own principle |

The first two are set by the platforms and cannot be worked around, the third is unacceptable as long as low-infrastructure regions are the target, and the fourth we ruled out ourselves. The last row of Table 24 is different in nature from the rest, which should be stated. Technology did not block it; we narrowed the options to keep the product's claim.

The remaining route is top-level navigation. An HTTPS page cannot `fetch` an HTTP device, but navigating to that address is not blocked. The app therefore builds a link to the device's save address, and one press from the user has the device store the schedule and show a confirmation page. No broker and no cloud are required, and the whole thing completes inside the home.

#### 4.3.1 Adding a relay path

The reason for excluding the cloud broker in the third row of Table 24 was that it "requires internet on both sides." That sentence is true when relying on that route alone. Since the LAN route above is already complete, adding an internet route on top of it does not increase the requirements.

That judgement was reached because a problem remained that the LAN route does not solve. The person managing the prescription is usually not in the house. The carer is at work and the dosing time changes on a Tuesday afternoon. And the two constraints excluded earlier in §4.3 remain in force on the LAN route. Mixed content means the app cannot call the device's API, so all a link can carry is the fields the legacy compatibility URL accepts. There is no field there for days of the week and none for duration. A Monday-Wednesday-Friday prescription goes out all seven days, and a 30-day prescription goes out until the tray is empty.

The dispenser was therefore made to hold open one outbound connection to a relay. The direction is outbound because home routers do not open a port to the dispenser, and asking them to is not something to ask for. The relay being HTTPS removes the mixed content problem, and days of the week and duration ride along.

The relay cannot read what it carries. Everything passing through is AES-256-GCM, and the key that opens it is derived independently on both sides from ten characters printed on the device. Neither side ever sends that key. The relay is given a different branch of the same derivation, a value sufficient to distinguish mailboxes and useless for opening them.

```
printed code ──HKDF──► device id      the relay's address    (relay sees it)
             ──HKDF──► access token   rights to that mailbox (relay sees it)
             ──HKDF──► box key        opens the schedule     (relay never sees it)
```

![Figure 31](fig/fig20_relay_keys.png)

**[Figure 31]** Three values separate out of ten printed characters. The relay distinguishes mailboxes by the first two, and the last is sent by neither side, so the relay has no way of holding it.

This is one more channel rather than a dependency. The schedule is already on the device's SD card and the time is known to the real-time clock. Whether the relay is down, unreachable or never configured at all, nobody's dose is missed. The judgement in Table 24 stands. We still do not require a cloud.

### 4.4 Reading the paper form

The original open-source design for the dispenser performs all configuration through a 2.8-inch touchscreen. This collides head-on with SnapCare's premise. A screen with a text menu that has to be read is the very thing we are removing.

The screen was therefore removed and replaced with a paper form. A doctor or pharmacist marks the form, and the patient only has to photograph it. Reading is performed by an OpenCV parser the team built.

The reader was first built in Python with OpenCV on the server and then moved into the browser. The reason for moving it is that this was the only path still requiring the internet. Text recognition, the nutrition estimation model, the verdict engine and the pictograms are all on the device (§4.1), and yet the feature one would most want in a clinic without internet was calling a server.

Rather than shipping opencv.js whole, only the functions used were transcribed: Gaussian blur, adaptive thresholding, Laplacian variance, perspective warp and Otsu thresholding. Making the user fetch another 8 MB runs against the judgement in §4.5 that the 16 MB model is fetched on first use. We wrote the ArUco detection ourselves as well. Only four markers are printed on the paper, so there is no reason to port a dictionary of 50, and the path by which a candidate could be "corrected" into one of the other 46 disappears with it.

We kept the Python version rather than deleting it, because whether the two implementations give the same answer is the only way to judge whether the move was correct.

Reading has four stages. ArUco markers at the four corners of the form are located and the perspective corrected (flattened to 1000×1000), adaptive thresholding is applied, the fill ratio of each bubble is measured at coordinates given in a configuration file, and what has been marked is decided from those ratios. If the markers are not found, no value is invented and an error meaning "the whole sheet is not in frame" is returned.

There is one judgement embedded in the rule for deciding values. Items where only one option may be chosen (tray number, duration, time of day) are handled differently from items where several may be (days of the week). The former picks the single darkest cell but only if the gap from the runner-up is sufficient, and otherwise yields no value and reports a problem. Picking plausibly among ambiguous marks is the worst failure on this route. A misread dosing time is more dangerous than no value read at all.

```python
if group["mode"] == "one":
    ranked = sorted(s.items(), key=lambda kv: -kv[1])
    best, second = ranked[0], ranked[1]

    if best[1] < abs_min:                      # ① nothing filled in
        values[name] = None
        problems.append(f"{name}: nothing filled")

    elif second[1] >= abs_min:                 # ② both properly filled in
        # Looking only at the gap between the two would quietly pick whichever
        # the pen covered more on a sheet where someone changed their mind and
        # did not erase the first mark. The paper is saying two different
        # things, and only the person who wrote it knows which one it was.
        values[name] = None
        problems.append(
            f"{name}: two boxes filled ({best[0]}={best[1]:.2f}, "
            f"{second[0]}={second[1]:.2f}) — erase one and retake"
        )

    elif best[1] - second[1] < margin:         # ③ does not separate
        values[name] = None
        problems.append(
            f"{name}: ambiguous ({best[0]}={best[1]:.2f}, {second[0]}={second[1]:.2f})"
        )

    else:
        values[name] = best[0]
else:                                          # multi-select items (days of week)
    picked  = [k for k in group["bubbles"] if s[k] >= abs_min]
    unclear = [k for k in group["bubbles"] if abs_min - margin <= s[k] < abs_min]
```

![Figure 32](fig/fig23_formsheet.png)

**[Figure 32]** The four stages of reading the paper form, and the three branches on which a single-choice item yields no value. All three red boxes end on the side that produces nothing.

Design intent. That branches ①, ② and ③ all end by yielding no value is the character of this function. Branch ② especially. When two cells are both properly filled in, picking the darker is technically easy, but it manufactures something the paper did not say.

A named problem (`problems`) sends the user back to the paper and is recoverable. A confident misreading is not. This is why the reader has to be able to say "I do not know," and it is the same principle as the parser in §2.2 turning an invented name into an error rather than a picture, and the checker in §5.2 not lowering the pass criterion to fit the results.

For multi-select items such as days of the week, the `unclear` marks, those too ambiguous to call either empty or filled, are collected separately and reported alongside. Yielding a value while also saying what is doubtful is better than dropping something silently.

#### 4.4.1 Measuring where degradation breaks it

We wanted how rough a photograph the parser can still read to be recorded as a measurement rather than an opinion. Testing an optical mark reader normally means printing the form, filling it by hand and photographing it under various lighting, and repeating all of that whenever the code changes. Then nobody runs it, and behaviour under poor conditions stays a guess.

Photographs are therefore generated. Starting from a real form image, bubbles are filled the way a person fills them (off centre, underfilled, sometimes spilling past the outline), and that sheet is put through what a phone camera does to it: perspective from holding it at an angle, a lighting gradient from standing with a window behind, defocus, sensor noise, JPEG compression. The result is an image the parser has never seen and whose correct answer is known exactly.

With this generator each degradation was pushed until reading broke. A point counts as passing only if every trial at that point was read correctly.

[Table 25] The last point at which reading stayed at 100% (16 images per point)

| Degradation | Last value read entirely correctly | At the next value |
|---|---|---|
| Defocus | 2.0 px | Collapses at 2.5 px |
| Perspective skew | 0.18 | Collapses at 0.22 |
| Sensor noise | σ = 32 | 81.2% at σ = 48 |
| Mark fill level | 0.4 | 50.0% at 0.3 |
| Shadow | 0.9 | **Did not break within the range tested** |
| Brightness | 0.25× | **Did not break within the range tested** |
| JPEG quality | 8 | **Did not break within the range tested** |

The bottom three rows are lower bounds rather than limits. They mean 100% was maintained to the harshest value tested, and where they break beyond that is unknown. Reading them as limits would record the parser as worse than it is, so they are marked separately.

What has to be read here is not the left of Table 25 but what the right two rows mean. Robustness to shadow and brightness comes from adaptive thresholding setting its threshold locally, and surviving JPEG quality 8 comes from what is being read being a filled area rather than a fine pattern. The two that collapse are different in nature. Defocus and mark fill erase the boundary of the bubble itself. Half being wrong at fill 0.3 is because at that lightness the difference between filled and unfilled becomes smaller than the paper's own blotching.

Two practical instructions come out of this. Fill more than half the box when marking, and focus when taking the photograph. Nothing else needs worrying about. Dark, shadowed or poor quality makes no difference. That is also why the guidance printed alongside the paper form says only these two things.

![Figure 33](fig/fig14_formsheet.png)

**[Figure 33]** The paper form and what was read from it. On the left is the photograph actually fed to the parser, having been through perspective, a lighting gradient, defocus and sensor noise. On the right are the values read from that photograph and the fill score of each cell. The gap between the chosen cells and the rest (0.67–0.71 against 0.00–0.04) shows the reading was not a near miss at the boundary. The values match exactly the answers set when the image was generated.

### 4.5 Offline operation

The app is built as a PWA, with a service worker caching screens, assets and the model. The strategy differs by the nature of the resource. Navigation is handled network-first so that the latest is always fetched when connected, while static assets and pictograms are handled cache-first. The verdict API is not intercepted, because failing is better than serving a stale answer.

![Figure 34](fig/fig21_sw.png)

**[Figure 34]** The three ways the service worker splits a request. Each is a distinct judgement, and the red cell is a constraint that exists because this app handles medicines.

The branching of the strategy is visible directly in the service worker's `fetch` handling (`public/sw.js`). Only two long comments have been shortened; the code is as it stands in the file.

```js
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The verdict API is not intercepted. Failing is better than giving a stale
  // answer, and the app code (cached profile and pictograms) already covers
  // being offline.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/pictograms/') ||
    // …the nutrition model (16 MB) and its config. Comment shortened
    url.pathname.startsWith('/models/') ||
    // …the OCR worker, core and language data
    url.pathname.startsWith('/ocr/') ||
    url.pathname.startsWith('/nutrition/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(cacheFirst(request));
  }
});
```

Design intent. The three branches are three different judgements.

The verdict API is not intercepted because what this app handles is medicine. Returning a cached verdict leaves the user with no way of knowing whether it is today's answer or yesterday's. A failure is noticed by the user; a stale success is not.

Putting the model and OCR assets under cache-first was the fix for a defect found during development. The whole point of the app is that it computes verdicts on the device without an internet connection, yet the 16 MB estimation model was missing from the cache list. The computation ran on the device while the model to perform it could not be fetched, so the offline claim was only half true.

These assets are nonetheless not prefetched. They are fetched on first use. Demanding 16 MB at the first screen makes the app look as though it has not opened at all where the network is slow, and that is precisely where our users are. One feature arriving late is better than the app not opening.

Cache names carry an asset fingerprint. A pictogram's address is derived from its DSL string, so replacing a picture does not change the address, and without a fingerprint anyone who visited even once would keep being served the old picture. When `qty_four` was fixed and re-rendered (§5.2), the fingerprint changed and all 113 cached pictograms were re-rendered as a set. Without the fingerprint those users would have gone on seeing the four rings from before the fix.

### 4.6 Privacy

Because health information is involved, measures were needed on both storage and transmission.

[Table 26] Privacy-related design

| Item | Content |
|---|---|
| Photographs | **Not stored.** Only the verdict is kept and the image is discarded |
| Verdict history | Automatically deleted after 90 days |
| Server backup | Encrypted on the device before transmission. The server cannot decrypt it |
| Identity | Requests signed with an ECDSA private key generated on the device. The key is `extractable: false` and cannot leave the browser |
| Access control | The storage location is derived from the public key. There is no way to request another person's data |
| Transmission | Signatures travel in a request header. They do not appear in the address bar or in access logs |

The last three of these are fixes for problems found during development. The initial implementation passed a random string as a query parameter, which meant the key granting access to health information accumulated in server logs, and anyone who observed the value once could reproduce it.

The fix was to use a key pair instead of a string.

```ts
// extractable: false — this one word is the point. With true, anyone who read
// the storage takes the key with them, and then it is no different from using
// a string.
const pair = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);

export async function sign(method: string, body: string, ts: number): Promise<string> {
  const { privateKey } = await keyPair();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const payload = `${ts}.${method}.${b64(digest)}`;
  return b64(await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(payload)));
}
```

![Figure 35](fig/fig24_sign.png)

**[Figure 35]** What goes into the signature and what each part prevents. Missing either one makes the signature worthless. Deriving the storage location from the public key is not the signature but a separate access control.

Design intent. The second argument to `generateKey` being `false` means not even our own code can read the private key. All we can do is ask the browser to sign with it. Taking the device's entire storage therefore yields nothing worth taking. It becomes something usable only by holding that device rather than a value that can be observed and imitated.

What is signed is composed for reasons of its own. The timestamp (`ts`) is included so that anyone intercepting a signature cannot replay it later. Because the time is inside the signature the server can reject stale ones, and in practice requests older than five minutes are refused. The body hash is included so that a signature cannot be detached and attached to different content. Missing either one makes the signature worthless.

Permissions the app does not use are closed at the browser level. The response header opens the camera and closes the microphone and location.

```ts
res.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
```

That one line is also why the checking step of §3.8 has the user point at a picture rather than say the answer back. Carrying teach-back over as it stands would need speech recognition, and that is a permission we chose not to open. Opening a permission and not using it is different from closing it: the first can quietly begin to be used when the code changes, the second is refused by the browser.

Deriving the household ID as the SHA-256 hash of the public key follows the same reasoning. It removes the registration step, and requesting someone else's data would require their private key, which cannot leave their device. Access control becomes structural rather than a rule.


### 4.7 The repository and how the team worked

The web app, the hardware firmware and the training code are managed in a single repository. It will be transferred to the contest organisation's GitHub organisation for final submission.

[Table 27] Composition of the repository (as of 3 August 2026)

| Area | Files | Lines | Responsibility |
|---|---|---|---|
| `app` · `components` | 48 | 7,828 | Screens and flow |
| `lib` | 118 | 14,360 | Verdict, nutrition, inference, sync |
| `engine` | 107 | 14,200 | SIGIL morphemes and composition |
| `pill_dispenser` | 160 | 47,183 | Firmware and paper form reading |
| `nutrition_manager` | 61 | 59,335 | Nutrition model training and evaluation |
| `docs` | 125 | 116,410 | The proposal and figure generation |

There is a reason the repository was not split. What breaks most often in this project is not the individual parts but the agreements between them. The cause of 0 passes out of 28 in the formative evaluation in §5.1 was a missing connection rather than a defect in any single feature. With the repository split, that connection cannot be tested in one go, and there is no way to tell which side changed first.

In practice three kinds of test in this repository each require something different.

[Table 28] Three kinds of test

| Kind | Tests | Result | What it needs |
|---|---:|---|---|
| Web app (`node --test`) | 347 | 346 pass · 1 fail | Node only |
| Paper form and cloud relay (`pytest`) | 172 | 169 pass · 3 skipped | OpenCV |
| Device firmware (`pytest`) | 668 | 591 pass · 77 skipped | Python only |

These are counts from running the suites on 3 August 2026, and the single web-app failure is set down as it stands. A default in the condition-tracking module changed and the test still holds the old expectation; it is not a defect in the feature, but leaving the failure out while reporting the passes would change what this table says.

That the firmware suite was for a while not running at all is also set down. Eight screen constants disappeared in one commit, and since every test file goes through that module, all of them stopped at import. Restoring them revealed 35 failures, and those 35 went away when the screen was redesigned around a single panel. They were missed not for want of tests but because the tests were not running, which is to say that counting passes and checking that the tests actually run are two different jobs.

All three run without the hardware. No servo, no Raspberry Pi and no network is needed. Making code that runs on a device you cannot attach a debugger to verifiable by anyone in a few seconds is the purpose of this arrangement, and bringing the whole firmware up on a laptop with `make run` (Figure 23, right) comes from the same principle.

Roles were divided as follows. Yunsu Nam took the web app and the SIGIL and VOCA engines, Dohun Kim took the hardware firmware, the paper form reading and the nutrition estimation model, and the Moldovan team took 3D printing, mechanical design and screen design. Over 17 days 320 commits accumulated.

There is a condition attached here as well. This project used AI coding tools throughout development, and we do not hide it. Nowhere was what a tool produced left as it stood. The defects recorded in this document were all found by a person checking again. Of the 37 citations checked in the first pass, 12 differed from their sources (what was wrong in each is kept case by case in `citations.md` in the repository); the morpheme checker passed four rings as "four" (§5.2); and the sample prescriptions carried five clinical errors (§5.7). What this repository sets out to show is not that tools were used but how the results were verified.

---

## □ Results and Expected Impact (SDG 3 Contribution)

### 5.1 Formative evaluation: whether the information arrives

The first thing to ask once the app was built was whether the necessary information actually reaches the screen.

To measure this reproducibly, 28 runs were constructed from four sample prescriptions crossed with seven user conditions, and the output of each run was scored on six items. Scoring is done by matching rules against the strings and speech targets actually present on the screen rather than by human judgement. It is therefore reproducible, and if a scoring rule is wrong the rule can be corrected and the whole thing rerun.

The record left by one run looks like this.

```json
{
  "stimulus": "antibiotic",   "kind": "rx",   "member": "none",
  "glyphs": 9,                "reached": true,
  "scores": {
    "D1 item identified": true,  "D2 dose per intake": true,  "D3 times per day": true,
    "D4 timing and context": true,  "D5 storage": true,  "D6 contraindication": true
  },
  "all6": true
}
```

Design intent. The scoring result is not reduced to a single true or false but kept per item. Keeping only the figure "27/28" leaves no way of knowing what failed and why, and no way of knowing what to fix next. Which item the single failure reported in §5.1 was (`D5`) and under which condition (`member: none`) were read directly from this record.

Counting `glyphs` alongside has a reason too. All six items can be true while not a single picture appears. That is the state where delivery happens only through sentences and speech and the pictogram route is dead. Eight of the 28 runs before the fix were exactly that, and had we been watching only the item scores those eight would have passed as "partially successful."

[Table 29] Scoring items in the formative evaluation

| Item | What it confirms |
|---|---|
| D1 item identified | Is what was photographed conveyed |
| D2 dose per intake | Is the number of tablets or millilitres present somewhere |
| D3 times per day | Is how many times a day stated |
| D4 timing and context | Does the number of listed times match the frequency, and is the mealtime context conveyed |
| D5 storage | When refrigeration is needed, is that conveyed |
| D6 contraindication | Does it appear when something must be avoided, and stay absent when it need not |

In the initial measurement, **0 of 28 runs satisfied all six items**. The cause was a missing connection rather than a defect in any individual feature. Dose and storage information reached the pictograms from OCR but not the speech and the sentences, pregnancy contraindications were not passed to the verdict engine, and with the pictogram cache empty not a single picture appeared on the verdict screen.

After fixing this and rerunning the same 28, **27 satisfied all six items.**

We state what the one that did not was. In the run where a user with no registered conditions photographed a cereal, D5 (alternative suggestion) did not appear. It appeared in all three remaining runs where the same cereal was photographed by users with peanut, gluten and blood thinner conditions.

This was not fixed as a defect. The alternative suggestion is derived from the reason for avoidance, as described in §2.7, and for a user with no reason to avoid anything there is nothing to derive from. Telling someone with no conditions to "choose that instead of this" would require inventing the grounds, and that is something this app has decided not to do. This one case is therefore the result of applying the scoring items uniformly across all runs rather than a feature failing to work. Splitting the scoresheet by condition would make it 28/28, but under the principle of not adjusting scoring criteria to fit results it is left as it is.

[Table 30] Formative evaluation results

| | Before fix | After fix |
|---|---|---|
| All six items satisfied | 0 / 28 | **27 / 28** |
| Runs ending with zero pictograms | 8 / 28 | 0 / 28 |

It should be made clear that what this evaluation measured is the arrival of information rather than human understanding. The latter has to be asked of people and lies outside the scope of this evaluation.

![Figure 36](fig/chart06_formative.png)

**[Figure 36]** Formative evaluation before and after the fix (n = 28). The left pair is the number of runs satisfying all six items, the right pair the number of runs ending without a single pictogram appearing. More than 0 becoming 27, **the move from 8 to 0 on zero pictograms** is what this evaluation yielded. Those eight arose from an empty cache rather than a missing feature, and without measuring we would have discovered them first during the demonstration.


### 5.2 A procedure for verifying pictogram comprehension

As established in §1.8, making a pictogram does not mean it will be read. Of 108 international standard pictograms, only 17 passed the ANSI 85% criterion (Gutierrez, M. M., Patikorn, C. & Anantachoti, P., "Evaluation of pharmaceutical pictogram comprehension among adults in the Philippines," *Journal of Pharmaceutical Policy and Practice*, 15:30, 2022).

Comprehension testing requires assembling people, however, so it is expensive and hard to repeat. As a result most pictogram sets are evaluated after they are built, and by the time a problem is found they have already been released.

This work designed a procedure that inverts that order. Two gates are placed on each pictogram.

[Table 31] The two gates of pictogram verification

| Gate | What it judges | Method |
|---|---|---|
| 1. Mechanical check | Does the form survive being shrunk | Ink ratio, survival of interior holes at 32px, number of separate blobs |
| 2. Semantic check | Is it read as intended | The picture is shown and **"what does this look like"** asked as an open question |

![Figure 37](fig/fig18_pictogram_gate.png)

**[Figure 37]** The two gates a morpheme passes on its way to release, and the ladder it climbs when it fails. The ladder is keyed to the reason for failure rather than to the number of attempts.

The form of the question at the second gate matters. Asking "is this a peanut" mostly gets a yes. No options are therefore given and a description is requested, and whether the answer matches the intent is judged separately. This is the same reason the ISO 9186 comprehension test presents no options.

Whether this procedure is justified we asked directly in §5.7. Both respondents in the HCI and design segment answered "justified with conditions attached", and each wrote a different condition.

> "For pre-screening rather than as a final conclusion, I think it can be used freely. Since it will ultimately be used with people, all that is needed is the resolve to discard the pre-screening result if testing with actual people shows it does not apply."
> (Yonghan Lee, Senior Manager, Korea Craft and Design Foundation)

> "If, in the process of screening information with a vision-language model, the researcher sets and understands the screening criteria clearly and those criteria can be shown valid on theoretical grounds, procedural justification can be secured."
> (Myojung Choi, researcher, Korea Disabled People's Development Institute)

The two conditions differ. The first asks whether the result can be thrown away; the second asks whether the criteria stand in advance. The second is answered to a degree by this section writing the criteria of both gates down beforehand, but the first cannot be answered because it has not been tested. If the field evaluation of §5.10 produces morphemes where the machine verdict and people's answers diverge, that is when this condition is tested. Being able to discard the machine's side at that point is what makes the procedure justified.

The 512px original and the 32px reduction are also shown together, with the answer given against the reduction, because the reduction is the size actually seen in a list.


#### 5.2.1 The retry strategy

Placing gates is only half of it. Pictures that fail have to be remade, and the retries have to converge.

At first a fixed ladder of instructions was climbed according to the attempt count: fail the first attempt and instruction 1 is added, fail the second and instruction 2 is added. The second rung of that ladder was "draw the form heavier," and giving that instruction to a picture that failed for being too clotted pushes it further in the direction that failed. That is why the ink ratio of `food_bread` spun through 0.52, 0.47 and 0.51 across three attempts. The retries oscillated instead of converging.

The checker already knows why something failed. Counting attempts without using that reason is the same as rolling the same die again, and each roll costs money. Instructions were therefore hooked to the reason. What follows is `engine/gen_glyphs.py` as it stands, with only the comments and the two guard lines above removed. The conditions match on Korean words because the checker writes its reasons in Korean: 뭉쳤다 is clotted, 가늘다 too thin, 개수 wrong count, 뜻이 안 맞는다 misread, 구멍/뭉갠다 holes closing up when shrunk.

```python
def escalate(c: 'Check | None') -> str:
    r = ' · '.join(c.reasons)
    if '뭉쳤다' in r:
        return (' The shape came out far too heavy. Draw it noticeably smaller inside the frame with '
                'wide empty white space around it, and punch two or three much larger white holes '
                'through it. Keep it a solid filled black silhouette — do not turn it into a hollow '
                'outline drawing with an empty white interior.')
    if '가늘다' in r:
        return (' The shape came out too thin and sparse. Make every black part much thicker and '
                'heavier, and let it fill more of the frame. Fewer, larger, bolder masses.')
    if '개수' in r:
        return (' The number of separate shapes was wrong. Draw exactly the number stated, each one '
                'fully detached from the others with wide white space between them.')
    if '뜻이 안 맞는다' in r:
        return (f' The previous attempt was misread: it {r.split("—")[-1].strip()}. '
                'Redraw it so the object is unmistakable at a glance: change the shape and the '
                'outline, not the weight. Exaggerate the one feature that makes this object '
                'different from anything else.')
    if '구멍' in r or '뭉갠다' in r:
        return (' The white holes closed up when the image was shrunk. Use far fewer holes and make '
                'each one much larger — at most three, each at least one sixth of the image wide.')
    return ' Remove every small detail. Keep only the two or three biggest shapes.'
```

Design intent. The six branches push in six different directions. The last catches any reason the preceding five did not match. The last one matters especially. A meaning that came out wrong is a problem of form rather than of weight, so telling the model to adjust thickness makes it draw the wrong picture more sharply wrong. After this branch was added, all four symbols that had previously failed passed on the second attempt.

The last sentence of the first branch was paid for as well. It originally said only "hollow it out," and what came back was an outline drawing rather than a filled silhouette. The weight dropped, but the rest of the set is all filled silhouettes so the visual language became mixed, and above all `qty_one` became a ring rather than a filled dot and read as "0" rather than "1." The method of reduction was therefore restricted to "smaller, with holes punched through" and "do not turn it into a hollow outline" was stated explicitly.

The same defect appeared once more later. `qty_four` had remained as four rings rather than four filled dots, and in a counting picture an empty ring reads as zero, while one, two, three and five in the same set are all filled dots, so it alone followed a different rule within the set. Why the checker passed it is clear: four rings is still correctly "four." This means something can pass both the counting check and the meaning check and still be wrong, and this is the point taken up again as a limitation of the procedure in §5.4.

#### 5.2.2 Results across all 78 morphemes

Applying this procedure to all 78 morphemes gave the following.

[Table 32] Semantic check results for the 78 morphemes

| Category | Count |
|---|---|
| Read as intended | 54 |
| Read differently | **24** |

Of the 24 read differently, 7 are actually exposed on screen, while the remaining 17 exist only in the dictionary and are never called by the app. The 7 that are exposed were reworked with the misreading fed back into the prompt, with the improvements shown below.

![Figure 38](fig/chart07_glyph_check.png)

**[Figure 38]** First-pass semantic check results for the 78 morphemes and the breakdown of the 24 misread. The misreadings are split rather than pooled because the two are different in nature. The 7 exposed on screen are actually seen by users and have to be fixed, while the 17 that exist only in the dictionary are not yet seen by anyone. Fixing the former first is a matter of allocating effort and does not mean the latter are acceptable.


[Table 33] Morphemes improved by rework

| Morpheme | Previously read as | After |
|---|---|---|
| `allergen_tree_nut` | cracked egg | walnut |
| `inhaler` | letter l | inhaler spraying |
| `symptom_gut` | lightning bolt icon | stomach with lightning bolt |
| `glucometer` | key fob | glucose meter |
| `food_sugar` | three hexagons / three dice | spoon with powder |
| `tablet_blister` | die showing four | pill blister pack |
| `food_bowl` | circle with line | bowl of hot food |

The improvement to `allergen_tree_nut` matters particularly. Its being read as "cracked egg" is not simply a misreading, because a different allergen, `egg`, exists in the same set. Two different allergy warnings were being read as the same picture.

### 5.3 Morphemes judged unimprovable

Five symbols were reworked without improving. These differ in nature from the seven above.

[Table 34] Morphemes not improved and why

| Morpheme | Problem | Judgement |
|---|---|---|
| `suppository` | Identical in form to a bullet. Adding packaging made it read as "bomb" or "rocket" | Form alone does not separate them |
| `body_skin` | Drawn as texture it becomes waves, as an arm it clots, as a finger it becomes a footprint | "Skin" is not an object that can stand alone |
| `time_evening` | The sun rising and the sun setting differ **only by direction** | A still picture has no direction |
| `allergen_sesame` | Seeds in a pod worked better than scattered seeds, but `allergen_soy` is already a bean pod | **Collides within the set** |
| `sachet` | The tear serration of a medicine sachet and the crimp of a sweet wrapper are the same shape in silhouette | Form alone does not separate them |

§5.7 added one that is not in this table. Sheron Sir Loon Goh, Pharmacy Lecturer, wrote that a capsule picture with one dot beside it does not read as "once a day"; without hearing the audio the relationship is not visible.

This is the kind the semantic check of §5.2 cannot catch. That check shows one morpheme on its own and asks what it looks like, whereas this problem is whether the relationship reads when two morphemes occupy one cell. One dot reads well as one dot and a capsule reads well as a capsule. Whether overlaying them yields "once a day" was never asked. That the procedure of §5.2 checks morphemes and not combinations shows here.

These five are set out because they show where the limits of the pictogram as a medium lie. All seven that could be improved were resolved by choosing a better object, whereas for these five the concept itself does not hold as a standalone silhouette.

The rework log for `sachet` is worth keeping. Two directions were tried and both failed.

First, the side serration was removed and the powder drawn as small white dots. It was still a "candy wrapper." The diagnosis that the cause was the serration rather than the notch was not itself wrong; what remained after removing the serration was still a sweet wrapper. The worse part is the "small white dots." Those dots **disappeared entirely at 32 pixels (21 to 0).** The very failure the mechanical check in §5.2 exists to catch was produced by the instruction meant to avoid it.

Second, the subject was changed to the moment of tipping the sachet to pour. It was read as "ice cream cone" and "cocktail shaker pouring." A widening wedge becomes a cone. A third attempt was refused by the image generation API; a request to draw "pouring powder" was classified as drug misuse.

The failed pictures were not installed. The assets remain as they were and the prompt was reverted. What was kept is only the record of the attempts. The checker's expected value was, however, changed from a concept name to a sentence. Matching on the name alone is loose enough that the next person running the same check might see this failure as a pass.

For four of these five, speech fills the place on screen. As described in §3.5, pressing a picture makes it say what it means, so `sachet` can be heard as "The powder sachet." even when it is not recognised. Having one more layer where the picture failed is what the three-layer design in §2.1 actually does.

### 5.4 Limits of the measurement

The figures from the previous two sections share a characteristic. Both come from a machine scoring a machine rather than from asking people. This section sets out what those figures say and what they do not.

The results in this section carry three limitations, which are stated alongside them.

First, no people were asked. The semantic check above put the question to a vision language model rather than to people. It therefore cannot be compared directly with the prior figures in Table 6 (17 of 108 passing ANSI). The value of this procedure lies not in replacing testing with people but in filtering obvious misreadings beforehand and saving the cost of one round of testing.

Second, the judgement wavers at the boundary. There were cases where the same picture passed on one run and failed on another (`symptom_cough` being read as "person breathing out"). This check is therefore a gate rather than a verdict, and it was made a principle not to adjust the pass criterion until every item passes.

Third, the scorer and the scored may share the same kind of failure. A vision language model is built by learning the world's pictures, so the more conventional and widespread a representation is, the better it recognises it. Yet it is exactly that convention which varies by culture (Table 6), and that is what concerns us. This check is therefore strong at measuring "did it follow common convention" and weak at measuring "does it work for someone who does not know this convention." No guarantee that the 54 symbols which passed will work as they are for older Moldovan users comes out of this.

Putting the three together makes clear what the procedure in §5.2 is. It is a sieve for filtering obvious misreadings before asking people, not a substitute for asking them. The 24 it filtered out are ones that would have consumed testing time and returned the same answer had they been shown to people.

§5.7 added a fourth to those three. Asked how the set should be tested with AAC users, E. A. Draffan, retired speech and language therapist and visiting accessibility researcher at Global Symbols, answered that a trial is possible but that **the level at which failure occurs will never be known**, because there are too many variables.

That lands directly on the procedure of §5.2. When a morpheme fails the semantic check we read it as the drawing being wrong. But whether it failed because of the drawing, because of the 32-pixel size, or because the judge does not know the concept is something this procedure cannot separate. The five judged unimprovable in §5.3 rest on the same limitation. Three attempts failing three times and a concept not standing up as a silhouette are different statements, and we looked at the first and wrote down the second.

### 5.5 Measured performance of the nutrition estimation model

The model used on the meal photograph route was scored against the official RGB test split of Nutrition5k. The deployed file itself (`web.onnx`) was run with the same preprocessing as the browser: short side resized to 258, 224 centre crop, divided by 255.

[Table 35] Per-item error of the nutrition estimation model (n = 507)

| Item | MAE | MAE% | Test set mean |
|---|---|---|---|
| Energy | 58.12 kcal | 22.75% | 255.5 kcal |
| Mass | 32.97 g | 16.61% | 198.5 g |
| Fat | 4.21 g | 32.82% | 12.8 g |
| Carbohydrate | 6.02 g | 30.60% | 19.7 g |
| Protein | 5.41 g | 30.96% | 17.5 g |
| **Mean** | (| **26.75%** |) |

MAE% follows the official definition: the mean absolute error divided by the mean of the ground truth, not the mean of per-dish ratios. The 507 scored are all the dishes in the 709-item test split for which an overhead frame exists. The official protocol uses overhead frames only, and mixing in side frames produces different numbers and quietly manufactures a value that cannot be compared.

The same figures were recorded in the exported model's metadata, but rather than transcribing them we obtained the data and measured again. All five items matched to two decimal places. If checking citations against their sources has established anything in this document, it is that a value written down somewhere and the value its source actually states are frequently different.

It should be stated that these values can no longer be re-measured. When the Nutrition5k source was deleted, the 3,262 overhead frames of the official test split went with it, and the 507 test dishes contain no side frames to substitute. The figures above were measured while the data existed and the procedure survives in the script in §11, but running it now reports that the data is absent and stops.

There is a value measured on what remains, however, and it is the one that fits this app better.

[Table 36] The difference between two scorings

| | Official test split | Re-measured on what remains |
|---|---|---|
| What | 507 test dishes | 259 held-out dishes, 4,805 frames |
| From what angle | overhead frames only | side frames |
| Running what | `web.onnx` | `web.onnx` (the same file) |
| Mean MAE% | 26.75% | 31.7% |
| Can it be re-measured now | No (the source is gone) | Yes |

The difference between the two values is not the model getting worse but a difference in what is being measured. The official protocol uses only frames taken directly above the dish, whereas users of this app sit at a table and shoot at an angle. Side frames are closer to that angle, which makes 31.7% the value closer to the condition this app will actually meet. The former is the value comparable with the benchmark and the latter is the value that applies to our users, so both are recorded with the table stating which is which. If there is one thing checking citations against sources taught us while writing this document, it is that a value written down somewhere and what its source actually says are often different.

**These figures must not be placed alongside the citation in §4.2.** The 253.7 kcal energy error from NutritionVerse-Direct was measured on a different dataset, NutritionVerse-Real, while our 58.12 kcal was measured on Nutrition5k. Different data means different difficulty, so comparing the magnitudes of the two is meaningless. The two are presented together not to rank them but to show that this field as a whole still cannot determine nutrition from a single photograph.

Our own values show that directly. Mass is comparatively better at 16.61%, but fat, carbohydrate and protein all exceed 30%. Fat at 4.21 g looks small in absolute terms, but the test set mean for fat is 12.8 g, which means **roughly one dish in three is wrong on fat by a third**. Energy at 58.12 kcal is 3.2% of the daily 1,800 kcal at age 70 in §2.4 and is tolerable on a daily basis, but taken against a 700 kcal meal it is 8%.

Values from this route are therefore not trusted on the grounds of accuracy. What justifies putting this route on screen is that it passed the physical checks in §4.2 and that the verdict is presented not as this single value but as a share of the user's own reference. For products carrying a nutrition label this route is not used.

![Figure 39](fig/chart08_model_mae.png)

**[Figure 39]** Per-item MAE% of the nutrition estimation model (n = 507). The dashed line is the mean across the five items (26.75%). Mass and energy are relatively better and the trace items get worse, because a photograph of a plate shows volume but not composition. The same volume of rice and the same volume of fried food have similar mass and completely different fat.

#### 5.5.1 Quantisation not applied

An int8 quantised build reducing the model to 4.86 MB was also exported but not deployed.

[Table 37] float32 compared with int8

| | Size | Mean MAE% | Energy MAE |
|---|---|---|---|
| float32 (deployed) | 16.04 MB | **26.75%** | 58.12 kcal |
| int8 | 4.86 MB | 52.51% | 106.21 kcal |

The size falls to a third while the error roughly doubles. For an app targeting places with slow networks, saving 11 MB is no small temptation, but energy error growing from 58 kcal to 106 kcal widens the band in which the verdict flips. **Deciding in §4.5 not to prefetch this model but to fetch it on first use is the counterpart to this choice.** Instead of trading accuracy for size, the size was kept and the moment of fetching deferred.

### 5.6 Measured offline operation

The claim that verdicts are computed on the device without an internet connection was verified. After building for deployment, the following were confirmed with the server shut down.

[Table 38] Offline operation check

| Item checked | Result |
|---|---|
| Does the app open | Normal |
| Does the nutrition model (16 MB) respond | 200 from cache |
| Does navigation work | Normal |

In the course of this the model file was found to be missing from the service worker's cache list and was fixed. Before the fix, the computation ran on the device while the model to perform it could not be downloaded. Having a registered service worker and the app running end to end with the connection cut are different facts, and this defect would not have surfaced had only the former been checked.

What survives when the connection drops and what does not divides as follows. With the connection cut, prescriptions and nutrition labels are still read, because text recognition and form parsing run entirely on the device (§3.3). Food photograph estimation half survives. The on-device nutrition model runs from cache, but the vision model that identifies what the food is sits on the server, so values are produced while the item is treated as unrecognised and displayed as caution. Pictograms in the static list appear and ones that would have to be newly composed do not.

This division matches the boundary described in §4.5. The most urgent things were placed on the device, so what dies first when the connection drops is the least urgent route. This check was made by cutting the connection in developer tools, however, rather than measured in an actual low-bandwidth environment. Having no connection and having a slow one fail differently, and the latter has not yet been measured (§5.9).

What this measurement does not say is also recorded. Only a completely severed connection was measured, so as the fifth item of §5.9 records, a slow connection was not. And it was measured after the service worker had already filled its cache. Someone opening the app for the first time has to download 16 MB, and how long that download takes on the connections of the target regions was not measured either. What this section shows is behaviour after installation, not installation itself.

### 5.7 Expert opinion survey

As stated in §5.4, every measurement up to this point has been a machine scoring a machine. So we asked people. The people we asked, however, are not low-literate patients but those who deal with such patients every day. Because that distinction matters, we state it first. **This survey does not stand in for the comprehension testing of §5.9.** An expert answering that "a patient would probably be able to read this" does not mean a patient read it.

#### 5.7.1 How the list was built

The list was not built in one pass. It was researched separately across eight domains and then combined. Searching sequentially, one person carries the criteria of the first domain into the later ones and the sample tilts one way. Researching by domain means people are chosen by the standards of each field.

[Table 39] The eight domains of the list (846 in total)

| Domain | Count | On what criteria they were chosen |
|---|---|---|
| Korean pharmacy schools | 109 | 8 with direct contact in counselling and patient communication, 16 in social pharmacy, 45 in clinical pharmacy and pharmacotherapy, 26 in pharmacoepidemiology, medicines policy and health informatics |
| Korean nursing and public health | 64 | 18 health-literacy researchers, 10 in digital and e-health literacy, 5 in migrant and multicultural health, 11 in gerontological and community nursing, 12 in health education and policy |
| Korean HCI and design | 86 | 23 core HCI, 21 information design, pictograms and universal design, 15 security and privacy, 6 voice and audio |
| Korean literacy and special education | 92 | 11 in AAC and graphic symbol design, 19 in adult literacy and lifelong education, 38 in intellectual disability and special-education technology, 5 in multicultural education |
| International pictogram research | 78 | 38 on pictogram comprehension and validation, 27 on medicine label comprehension and health literacy, 5 institutional addresses |
| International pharmacy | 221 | By department rather than by individual. Utrecht 71, Ohio State 30, Nottingham 25, Western Cape 17 and others |
| International HCI | 88 | 12 on text-free UI, low literacy and ICT4D, 13 on pictogram comprehension, 16 on AAC and graphic symbol systems, 18 on accessibility, 9 on plain language |
| International organisations | 108 | WHO, UNESCO, UNICEF and others. 91 addresses confirmed, 17 with a contact form only or unpublished |

The eight domains sum to 846. The remaining 257 came from the regional expansion described below, bringing the final list to 1,103.

Each domain is further divided into priority bands, and the name of the band is itself the selection criterion for that domain. The top band for Korean nursing and public health, for example, is named "people who research health literacy itself", and the reason for writing that criterion was to have the premise of §1.2 examined.

A source URL was recorded for every entry: 599 of them, 296 unique, across 169 hosts. The leading hosts are `pmc.ncbi.nlm.nih.gov` with 94, where corresponding-author addresses were confirmed from papers, the Moldovan Ministry of Health public directory with 32, and `who.int` with 11.

Where an address could not be found it was not invented but left in a separate band. Fourteen from Korean pharmacy schools, 8 from Korean nursing and public health, 15 from Korean HCI, 17 from Korean literacy and special education, 8 from international pictogram research and 17 international organisations were classified this way and excluded from sending. The corresponding band in the international-organisations sheet is named `Contact-form-only or address-not-published (no address fabricated)`.

The initial list leaned towards Korea and the English-speaking world. Since this app claims not to be for one particular region (§1.2), we judged that the people reviewing it should not be concentrated in one country either, and researched and added 105 in Eastern Europe, 100 in the Middle East and North Africa, 96 in South Asia, 50 in Latin America, 49 in Southeast Asia and 47 in Africa. Those six groups come to 447, 40.5% of the whole. That responses arrived from five continents is the result of this step.

Moldova was a judgement call. Thirty-one addresses were obtained from the Ministry of Health directory and only three were used. Thirty-one messages leaving for one ministry at once reads as spam in itself, and we judged it would not serve the team's Moldovan working relationships either.

We wrote down separate rules for handling the list. Taking Article 50-2 of the Korean Act on Promotion of Information and Communications Network Utilisation (prohibition of unauthorised collection of email addresses) as the basis, we set out that messages would be sent individually rather than with several recipients on one message, that the list would not leave the team, that addresses obtained from pages posting a refusal of collection would be excluded from sending, and that no one would be contacted a second time if they did not reply. That no address from the two institutions confirmed to have posted such a refusal remained among the recipients was verified against both the domain and the affiliation string, and the count was zero.

Each recipient was assigned a ten-character token derived from their email address. The token alone identifies no one, and the table linking tokens to people exists only in a spreadsheet in our own hands. The response server stores only tokens, and because the folder holding the list was excluded when the Docker image was built, the server does not hold the list at all. That the deployed image contains no list was verified by connecting to it.

#### 5.7.2 How it was sent

Between 04:48 and 07:50 on 31 July 2026, over 182 minutes, 1,103 messages were sent one at a time. The mean interval was 9.9 seconds and no address was rejected. Bulk mail and blind copy were not used because the rules forbid addresses being exposed to one another and because the link carries a different token for each person, so several people cannot share one message.

A delivery service was not used; the SMTP of a personal mail account was. A delivery service can send 1,103 messages in minutes, but it needs a domain on which SPF and DKIM can be configured, and ours is `snapcare.fly.dev`, a subdomain to which DNS records cannot be attached. Even buying a new domain, sending 1,103 messages from a freshly created domain to university and government mail servers gets filtered harder. Fast, and worse at arriving.

The daily sending limit was not guessed at, because it is not published. Instead the program was built not to die when blocked, and run once. It writes each person to a file and flushes to disk as it goes, so a run cut short can be resumed. The record is written immediately after sending: if we recorded first and the send then failed, that person would never receive it, whereas sending first and failing to record means they might receive it once more, which we judged the less bad tail. A temporary rejection waits and retries with a growing delay, a non-existent address is counted and passed over, and three failures on one message is taken as the account being blocked and stops the run.

The 41 people with the clearest selection basis were put at the front of the sending order. The list is not ordered by rank, so sending it as it stood would have scattered them across three hours, and an account blocked partway would have meant some of them never receiving it. Changing only the order removes that risk. All 41 were in fact sent within the first seven minutes.

We decided the language from the email top-level domain alone. Searching the affiliation string for a country name was not used. If the selection-reason field contains "Moldova", WHO and a Portuguese researcher are caught as Moldovan too; tested that way it caught 30 people, a good number of them misclassified. By domain alone it yields 34, all of them genuinely Romanian-language institutions.

The subject line was revised three times. It began with `SnapCare`, but that name means nothing to the recipient, and a subject beginning with an unfamiliar name reads as advertising. The next version put a ministry name in square brackets at the front, which was worse. It reads as an official letter from an institution rather than a student asking for advice, and gives the impression of borrowing that authority. The final version drops the brackets and leads with the name of the contest alone.

There is judgement in what was taken out of the body as well. The draft carried "I am asking those who have worked on medication guidance and low-literate users," but the 1,103 include professors of computer science and legal scholars, so for many of them it is not true. Reading something at odds with your own career makes you disbelieve the rest of the sentences too. It was changed to "I am writing after reading your published research and work." That is true of everyone and also answers "why me."

A plain-text version was sent alongside the HTML one. In a text-only message the address cannot be tapped and has to be copied by hand, and some people stop there. The HTML version contains no images and no tracking pixel. Anything fetched from outside raises the chance of being caught as spam, and there is no need to know who opened it.

A test send before the run caught three defects: greetings for 63 international recipients that would have gone out with Korean mixed in, message generation dying with an exception in header handling, and links that could not be clicked.

The survey is three screens: consent, a screen showing what we built, and the questions for the field the respondent selected. The second screen places two sample prescriptions beside the result of passing them through the engine. The DSL shown there is the engine's actual output, not something a person wrote. It was written by hand at first, and that produced five lines; putting the same prescription through the engine produced ten. Finish-the-course, no-alcohol, pregnancy contraindication and breastfeeding caution had been missing from the hand-written version. One ends up showing only what one wants to show.

The answer options always kept a choice that is unfavourable to us: "there is nowhere to put it", "it is fundamentally wrong-headed", and "that there is no validation". We judged that having those answers come back was better than learning it after the contest.

We left a morpheme comprehension test out of the survey. A professor reading our pictograms does not mean a low-literate patient reads them, and writing that number down as meeting the ISO 67% criterion would state something untrue.

#### 5.7.3 Who answered

As of 2 August 2026, 35 people had answered: 3.2% of those contacted, with 117 free-text responses alongside.

[Table 40] Composition of respondents (n = 35)

| Field | Responses | Field | Responses |
|---|---|---|---|
| Pharmacy and medication counselling practice | 12 | HCI and design | 2 |
| Nursing and public health | 9 | Adult literacy education | 1 |
| Other | 9 | AAC and special education | 1 |
| | | Industry practice | 1 |

![Figure 40](fig/chart15_survey_who.png)

**[Figure 40]** The composition of the 35 respondents. Field on the left, continent on the right. Pharmacy and nursing account for three fifths at 21 people, and these two are the centre of the five segments we judged qualified to view the demonstration and rule on patient comprehension. That Asia accounts for 25 reflects exactly the order in which the list was built, starting in Korea and widening region by region.

The countries respondents recorded as working in span 20 countries across five continents, with 17 recording Korea only. All respondents consented to being quoted by name and affiliation, so they are recorded here as given.

[Table 41] The 35 respondents (all consented to being named with their affiliation)

| Name | Position | Affiliation | Country |
|---|---|---|---|
| **Pharmacy and medication counselling practice (12)** | | | |
| Hwi-Yeol Yun | Professor | College of Pharmacy, Chungnam National University | Republic of Korea |
| Hangil Lee | Associate Professor | College of Pharmacy, Ewha Womans University | Republic of Korea |
| So-Young Lee | Professor and pharmacist | Chungnam National University | Republic of Korea |
| Dongmun Ha | Professor | Mokpo National University | Republic of Korea |
| Niken Nur Widyakusuma | PhD, pharmacist | Universitas Gadjah Mada | Indonesia |
| Samirah Abdu-Aguye | Professor | Ahmadu Bello University, Zaria | Nigeria |
| Atif Usman | Professor | The Islamia University of Bahawalpur | Pakistan and Malaysia |
| Srikanth Malavalli Siddalingegwod | Assistant Professor | JSS College of Pharmacy, JSS Academy of Higher Education & Research | India |
| Maria Stefanova | Researcher | Medical University of Sofia | Bulgaria |
| Katarina Vučićević | Professor | University of Belgrade, Faculty of Pharmacy | Serbia |
| E. Michael Murphy | Assistant Professor of Clinical Pharmacy | The Ohio State University College of Pharmacy | United States |
| Sheron Sir Loon Goh | Pharmacy Lecturer | Department of Clinical Pharmacy and Pharmacy Practice | Malaysia |
| **Nursing and public health (9)** | | | |
| Sung-il Cho | Professor | Seoul National University | Republic of Korea |
| Myoungsoon You | Professor | Seoul National University | Republic of Korea |
| Minsun Song | Professor | Konyang University | Republic of Korea |
| Namsoo Park | Professor | Hyupsung University | Republic of Korea, Japan and Taiwan |
| Rahul Malhotra | Associate Professor | Duke-NUS Medical School | Singapore |
| Raghupathy Anchala | Professor | Public Health Foundation of India | India |
| Celia | Professor | University of Pretoria | South Africa |
| Foued Maaoui | Researcher | Institut Pasteur de Tunis | Tunisia |
| Aliya Naheed | Senior Scientist | International Centre for Diarrhoeal Disease Research (icddr,b) | Bangladesh |
| **AAC and special education · adult literacy · HCI and design · industry practice (5)** | | | |
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · University of Southampton | United Kingdom |
| Eun-Kyoung Kim | Professor | Kongju National University | Republic of Korea |
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | Republic of Korea |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | Republic of Korea |
| Cheolhyeon Park | Team Leader | VOICEYE | Republic of Korea |
| **Other (9)** | | | |
| Kyogu Lee | Professor | Seoul National University | Republic of Korea |
| Kyunghwa Lee | Professor | Soongsil University | Republic of Korea |
| Heejung Seo | Professor | Dong-eui University | Republic of Korea |
| Youngmee Lee | Professor | Department of Communication Disorders, Ewha Womans University | Republic of Korea |
| Kyungseo Park | Assistant Manager | Korea Disabled People's Development Institute | Republic of Korea |
| (name withheld) | Team Leader | GC Medi-AI, Uisarang Service Centre | Republic of Korea |
| Raisa Kravchenko | Deputy Director | All Ukrainian NGO Coalition for Persons with Intellectual Disabilities | Ukraine |
| Afonso Cavaco | Professor | Faculdade de Farmácia, Universidade de Lisboa | Portugal |
| Mustapha Taibi | Professor of Translation and Interpreting | Western Sydney University | Australia |

Half the respondents work outside Korea. Since this app claims not to be for one particular region (§1.2), we judged that the people reviewing it should not be concentrated in one country either, and when building the list we separately researched and added groups for Eastern Europe, the Middle East and North Africa, South Asia, Latin America, Southeast Asia and Africa. Those groups are 40.5% of the 1,103.

One thing has to be set down here. Forty-three percent of respondents (15 people) answered that they "almost never" encounter someone unable to read a written medication instruction. Four answered that they encounter such a person almost daily. And one respondent pointed this out directly. It means the answers to this question are themselves evidence about the premise of §1.1, and not in a direction that favours us.

#### 5.7.4 What they answered

The questions calling for a judgement on the demonstration were attached to five segments only. They were not attached to the law, standards and industry segments. Ruling on patient comprehension is not something that can be done from those positions, and mixing unqualified answers into the denominator makes the resulting proportion a proportion of nothing.

[Table 42] Could a patient who cannot read take their medicine correctly, alone, with only these screens? (five qualified segments, n = 25)

| Answer | Responses |
|---|---|
| Partly. Some of it would work and some would not | 17 |
| Yes, it probably could | 7 |
| No basis on which to judge | 1 |
| No | 0 |

The zero for "No" and the two thirds for "Partly" have to be read together. No one answered that the approach itself is wrong, and only a few answered that it is sufficient as it stands. Of the five who answered the broad question across the five segments, four chose "that there is no validation with people" as the first thing to resolve.

In the pharmacy segment, 9 of 12 answered that a pharmacist should review the instructions this app produces every time, with 3 answering that once at the start is enough. As to where it belongs, 7 chose a tool supporting the pharmacist's explanation, 3 a means for the patient to check alone at home, and 2 an alternative route for patients a pharmacist cannot reach. As to what must not be wrong medically, 7 named dose and frequency, 3 named contraindications and interactions, and one each named route of administration and not stopping early.

In the nursing and public health segment, asked whether it can change health outcomes, 8 of 9 answered that it can once the conditions are met, and one answered differently. Professor Raghupathy Anchala of the Public Health Foundation of India judged that dosing behaviour might change but not outcomes. It sits in the same place as the third item in §5.9, where we record that we make no claim about clinical outcomes, and although the split is eight to one, the side this document stands on is the one.

In the nursing and public health segment, 6 of 9 answered that the patient and the carer should be designed for separately. This app is designed on the premise that the patient uses it alone, so what was caught is the premise rather than a feature.

#### 5.7.5 How far the numbers can be pushed

The sample is small. The judgement question went only to the five qualified segments, so n = 25 there, and questions taking all respondents as the denominator have n = 35. So rather than recording proportions alone we record how much those proportions move. The intervals below are 95% confidence intervals by the Wilson method. With a small sample the normal approximation produces intervals dropping below 0 or exceeding 1; Wilson does not.

[Table 43] Proportions and 95% confidence intervals for the judgement question (n = 25)

| Answer | Responses | Proportion | 95% CI |
|---|---|---|---|
| Partly | 17 / 25 | 68.0% | 48.4% – 82.8% |
| Yes, it probably could | 7 / 25 | 28.0% | 14.3% – 47.6% |
| No basis on which to judge | 1 / 25 | 4.0% | 0.7% – 19.5% |
| No | 0 / 25 | 0.0% | 0.0% – 13.3% |

![Figure 41](fig/chart10_survey.png)

**[Figure 41]** Proportions and 95% confidence intervals for the judgement question (n = 25). The dot is the proportion, the line is the interval. The width of the intervals is the size of this sample, and what to read in this figure is the length of the lines rather than the position of the dots. Even with zero "No" answers, the interval reaches 13.3%.

The last row is the place in this table to be most careful about. Zero "No" answers does not mean no one would answer that way. What this sample supports is that the proportion is probably below 13.3%, and as many as three in 25 would not contradict this result.

We then tested whether differences exist between groups. Fisher's exact test was used throughout. Chi-squared cannot be used when an expected cell frequency falls below 5, and the tables from this sample always do. It is the same reason the same test is used for allergy inference in §2.5.

[Table 44] Tests of difference between groups

| What against what | Observed | Test | p | Verdict |
|---|---|---|---|---|
| Contact frequency vs judgement | "possible" in 2/4 frequent, 5/21 rare | Fisher | 0.548 | no difference can be claimed |
| Occupation vs judgement | "possible" in 4/12 pharmacy, 3/9 nursing | Fisher | 1.000 | no difference can be claimed |
| Response rate, band A vs B | 0/41 against 35/1,062 | Fisher | 0.637 | no difference can be claimed |
| Language vs judgement | "possible" in 0/11 Korean, 7/14 English | Fisher | **0.0078** | exceeds the corrected threshold |
| Language vs time taken | median 7.1 min against 24.0 min | Mann-Whitney | 0.029 | below threshold after correction |
| Time taken vs free-text volume | rho = 0.723 | Spearman | < 0.0001 | significant |

Six tests were run, so the Bonferroni-corrected threshold is 0.0083. Two rows exceed it. We counted that number as five in an earlier version and wrote the threshold as 0.010. The error ran in our favour, so it is recorded here. The p in the fourth row is 0.0078 against a threshold of 0.0083, so the conclusion did not change, but the margin is 0.0005. That is a width one more response could overturn again. The last says people who stayed longer wrote more, which is not a finding about content. The fourth is different. Not one of the eleven who answered in Korean answered "possible", while half of the fourteen who answered in English did.

Here is why we do not turn that row into a claim. **One person crossed the threshold.** At 34 responses the value was 0.019, short of the corrected threshold; adding one respondent who answered in Korean and chose something other than "possible" brought it to 0.0078. Where a conclusion turns on a single person, that fact is more accurate information than the conclusion. Up to the previous version this section read "nothing in this survey supports a claim of difference between groups", and we set this down as we correct that sentence.

The second reason is the one already given. Language is entangled with the respondent's country, occupation and screen. Seventeen of the eighteen Korean-language respondents recorded Korea only, and the median time taken splits 7.1 minutes against 24.0. Even if a difference exists, this data cannot separate whether it is due to language, to the time put into the response, or to the condition in §1.2 that encountering a low-literate patient is rare in Korea.

Dropping the non-significant tests and reporting only the significant one would be the worst thing that could be done with this sample, so everything that was run is recorded. Bolding the row that crossed the threshold is for the same reason. We do not hide that it crossed, and we put how it crossed beside it.

The sixth row is worth reading on its own. A rank correlation of 0.723 between time taken and free-text volume means that people who stayed longer did in fact write more, and it can serve as a proxy for the care taken over a response. The median time taken is 9.3 minutes, with quartiles at 6.0 and 40.5 minutes. E. A. Draffan, retired speech and language therapist and visiting accessibility researcher, noted separately that they were interrupted partway and that their own time should not be read as time actually spent.

Free text was written by 30 of the 35 respondents, 117 items in all. Counting by keyword how many people independently raised the same point gives 6 on the absence of validation, 5 on too many elements in one image, 6 on blind users, 4 on the prohibition marking and 4 on referring to existing sets. That count is by words we chose, however, so the body text uses the counts a person read and confirmed.

#### 5.7.6 Points raised in several countries at once

The heaviest finding was that a prohibition is not read as a prohibition. The morpheme for pregnancy contraindication, `state_pregnant`, is a picture of a pregnant woman with no prohibition marking. The prescription says "do not use during pregnancy" and the speech says so too, but to someone looking only at the picture it reads the other way round.

> "In second example, the prescription read not to use the eyedrops in pregnancy while the pictogram showed a pregnant woman making the patient assume it is safe to use in pregnancy."
> (Professor Atif Usman, The Islamia University of Bahawalpur)

> "Putting a pregnant mother symbol does not explains that it is not safe for pregnant mother to consume the meds. Perhaps you will need to add a \"X\" symbol somewhere in the picture"
> (Sheron Sir Loon Goh, Pharmacy Lecturer, Department of Clinical Pharmacy and Pharmacy Practice)

Raisa Kravchenko, Deputy Director of the All Ukrainian NGO Coalition for Persons with Intellectual Disabilities in Ukraine, wrote that "with no danger marking it can be understood as being recommended for pregnant women", and Professor Eun-Kyoung Kim of Kongju National University noted that "'you must do this' and 'you must not' are not properly distinguished; the 'must not' in particular ought to be emphasised." The same statement came from four different countries.

**This is exactly the critical confusion that ANSI Z535.3, cited in §1.8, is about.** And as described in §2.2 the engine already has the `\no{}` operator and can draw the prohibition circle and slash. `\no{\contact_lens}` in the same demonstration comes out with the slash on it. The code emitting contraindications simply was not calling it. It is a defect caused by not calling a capability that exists rather than by a capability being absent, which is the same kind as the 0 of 28 in §5.1.

The same kind of inversion was raised for the finish-the-course morpheme.

> "The symbol do not show what it means. For me it means I do not need to finish the course as your black dots did not complete the fully. you may want to add a arrow symbol for direction so that its clearer?"
> (Sheron Sir Loon Goh, Pharmacy Lecturer, Department of Clinical Pharmacy and Pharmacy Practice)

`finish_course` is the very morpheme named in the SDG 3.d contribution of §5.8 as what this app aims at. The finding is that it reads as the exact opposite.

Too many elements in one image was raised in three countries. Myojung Choi, a researcher at the Korea Disabled People's Development Institute, wrote that "if additional information is presented as small images inside the eye-drop bottle pictogram, the information overlaps and legibility falls, so present the dosage form early and separate the details", and Yonghan Lee, Senior Manager at the Korea Craft and Design Foundation, proposed splitting the explanation into two or three. The structure of SIGIL, designed in §2.2 to place modifiers in a slot inside the head, is what is caught here.

The target population differs from our premise was raised five times. Yonghan Lee, Senior Manager at the Korea Craft and Design Foundation, said that "the largest group of people who cannot read is likely to be blind people rather than non-literate people, and for a blind person the act of taking a photograph is itself a barrier." Niken Nur Widyakusuma, a pharmacist in Indonesia, also answered that she sees far more patients with visual impairment, and Professor Hwi-Yeol Yun of Chungnam National University College of Pharmacy answered that in Korea it is mainly foreign patients. It runs in the same direction as what we wrote in §1.5, that even someone who can read has no guarantee the text is in their own language, and it means we defined the target too narrowly.

Associate Professor Hangil Lee of the College of Pharmacy, Ewha Womans University, went one step further into it. Three things have to be separated.

> "Apart from patients with obvious visual impairment, there are cases where it is hard to tell straight away whether someone can read. Being totally blind and therefore unable to see text, having low vision, and having low literacy have to be distinguished. I think pictograms can help in the low-literacy case."
> (Associate Professor Hangil Lee, College of Pharmacy, Ewha Womans University)

Where the earlier five responses said "there are more blind people", this one divides that group again. A totally blind person cannot see the picture at all; low vision is a question of size and contrast; low literacy is a question of letters. The three ask for different things. And this response's verdict is that the place pictograms work is the last of the three. It attaches to the point in §1.5 where, having recorded 2.2 billion people with vision impairment, we noted that this source cannot tell us how far the two groups overlap; here is how those three actually divide in practice.

The same respondent pointed at institutional material we did not know about: a comparative study of domestic and international guidelines for braille labelling on medicines (Yakhak Hoeji), and the Ministry of Food and Drug Safety guideline on braille and voice and sign-language conversion codes for medicines and quasi-drugs. It means standards and guidance already exist for the layer we chose not to address, and it makes us look again at leaving blindness among the unverified items in §5.9. If this app ever does address that layer, it should follow that guidance rather than design something new.

#### 5.7.7 Individual findings

Foued Maaoui, a researcher at the Institut Pasteur de Tunis, noted the absence of teach-back. There is no procedure for confirming that the patient understood correctly, and from a patient-safety standpoint the absence of this feedback loop is a serious risk.

There is evidence behind that point. A systematic review synthesising 20 studies of teach-back found positive results in 19, with significant improvement in medication adherence and diet among patients with type 2 diabetes (Talevski, J., Wong Shee, A., Rasmussen, B., Kemp, G. & Beauchamp, A., "Teach-back: A systematic review of implementation and impacts," *PLOS ONE*, 15(4):e0231350, 2020). It is exactly the procedure that Professor Samirah Abdu-Aguye of Ahmadu Bello University in Nigeria answered she currently uses in practice. Acting on this point we built a checking step, described in §3.8. Instead of speaking back, the user points at pictures; whether that substitution produces the same confirming effect has not yet been put to people. The same respondent also set out a validation design: work with low-literate participants and do not substitute educated volunteers; use predefined scoring criteria and blinded assessors; test pictogram-only, audio-only and both separately; and use real prescriptions rather than a clean demonstration. The evaluation design in §5.10 was revised accordingly.

Professor Celia of the University of Pretoria judged that it would not work on handwritten prescriptions. Up to the survey we had tested only with printed samples, so it was a point we could not answer; after the survey we measured three times and answered it.

First we put in a real one: a public-domain (CC0) photograph of a handwritten prescription from the Eye Foundation Hospital in Lagos. The result was worse than the objection. It did not fail to work; it **worked wrongly.** It read the paper's "8hrly" (every 8 hours) as "8mg", so a frequency became a dose; three dosing times the paper never mentions were attached; and a green verdict lit up on top. That is different from not reading. When it cannot read, the user asks a person; when it reads like this, it is confidently wrong. We fixed three things. Frequency abbreviations (hrly, od, bd, tds, nocte and so on) were built into recognition; times absent from the paper are no longer invented, the schedule is left empty; and when the model judges the writing handwritten, no green light comes on and the screen tells the user to ask a person while offering the paper form (§4.4) as another route. What is read is not erased. What is erased is the confidence.

Fixing it surfaced one more. The caution verdict was drawing a slash across the pictogram, so the moment the handwriting caution attached, a prohibition mark was drawn over the glaucoma eye-drop picture. That amounts to telling someone to stop their medicine because the paper is hard to read, the exact mirror image of the failure this app set out to prevent. The slash now goes out only on avoid, locked with a test.

One photograph is a case, not a measurement, so we measured again on public data: 500 samples from the test split of 5,578 handwritten drug names cut from real Bangladeshi prescriptions (RxHandBD, Zenodo 18478741, MIT licence). Bangladesh is the country of respondent Aliya Naheed, Senior Scientist. All 500 were read, with no failures. The result: read exactly, 45.2%; off by a character or two, 28.2%; read as something else entirely, 26.6%. The middle band is the more dangerous one. Escilex read as Eslilex, and one character away there can be a different real drug; this dataset itself contains Inderen and Indever side by side.

We also measured whether confidence can filter it. It cannot, and the way it fails is not what we first supposed.

At a threshold of 0.4, 45% survive and 71.6% of those are correct. At 0.5, 20.4% survive and accuracy peaks at 83.3%, and **raising the threshold further makes accuracy fall rather than rise**: 79.5% at 0.6, 76.9% at 0.7, 50.0% at 0.8. Allowing for the noise of a shrinking sample, the direction does not go up.

This is where the conclusion changed from the 200-sample run. Then it was that no threshold satisfies accuracy and coverage together. At 500 we can say something stronger: **high confidence is not evidence of correctness.** The conclusion that confidence cannot serve as a filter is the same, but the reason is no longer narrow coverage; it is that the relationship does not continue upward.

![Figure 42](fig/chart21_handwriting.png)

**[Figure 42]** How 500 handwritten drug names were read, and why confidence cannot filter them. The right panel is the design basis: while the share surviving (grey) falls steeply, the accuracy of the survivors (blue) peaks at 0.5 and then falls again. Raising the threshold does not buy accuracy, so confidence cannot serve as a filter. The red bar on the left is the heaviest finding of this measurement. A name read as something else looks wrong; a name off by a character or two can be a different drug that actually exists.

We also measured what the user actually photographs, the full prescription page. All 200 Bangladeshi prescription pages annotated with the number of drug-name regions (Mendeley k62rfd23kz, CC BY 4.0) were sent not to the model but to the app's `/api/analyze`, because a value only becomes the app's value after passing the deployed prompt and post-processing. The ground truth is a count, not text. This dataset has no drug-name text; it records how many medicines each page carries, and the count matters for a reason. If three of five medicines are read, two vanish silently, and the user takes the three on screen to be all of them.

This measurement found a defect. On the first run 11 of the 60 pages failed outright, and not at random: every one carried 5 to 12 medicines, and the same pages failed on every rerun. **It was failing against exactly the people who need it most.** The person taking ten medicines needs this app most, and that very person's prescription would not read. What happened and why is in the comment of the fixed code, carried over as written:

```ts
      /*
        It was 700. Right there, **prescriptions with many medicines were failing
        outright.**

        It surfaced while measuring on 60 whole Bangladeshi prescription pages.
        Eleven failed, and not at random — every one of them listed 5 to 12
        medicines, and it was the same pages every time. The answer was cut off at
        700 tokens (`stop_reason: max_tokens`), the cut JSON failed to parse, the
        failure was caught above, and the screen said "could not read it."
        The actual tail of one admission order sheet:
        `…urinary catheterization. 20.` — cut mid-sentence.

        **It was failing against exactly the people who need it most.** Someone
        taking ten medicines needs this app most, and theirs is precisely the
        prescription that does not get read.

        A nutrition answer fits in 700, but dosing instructions grow with the
        number of medicines. Give it room — short answers end short anyway
        (end_turn), so this value does not raise the cost.
      */
      max_tokens: 3000,
```

The same measurement surfaced one more defect. When a call failed briefly, the app was saying "this server has no photo recognition." A permanent statement about a passing event, and whoever hears it does not try again, because it sounds like something that cannot be fixed. The two are now split: a momentary backlog (503) says try again in a moment, and only the genuine absence of means (501) says there are none.

After the fix all 200 pages were measured again. Recognition as a prescription rose from 95.5% to **100%** (200 of 200, no failures) and recall of the medicine count from 83.2% to **86.9%** (944 of 1,086 annotated). The 4.5% that disappeared is exactly the prescriptions carrying the most medicines, which belong to the people who need this app most.

Handwriting was flagged on 94.5%. Opening all eleven pages that were not flagged showed computer-printed prescriptions without a single handwritten character. Since this dataset states that it mixes handwriting and print, that is a correct discrimination rather than a miss. The fourteen pages carrying a schedule were likewise all reading notation actually on the paper, the Bangladeshi `1+0+1` style.

One more limit belongs here. This measurement was sent straight to `/api/analyze`, so it measures the vision-model route rather than the app's default path. A real camera runs OCR on the device first and never calls the model for a printed prescription (§3.3). Handwriting falls through to this route because OCR cannot hold it, which is what makes these figures meaningful; but rolled up as a "prescription recognition rate" they would be wrong at exactly that point.

![Figure 43](fig/chart22_pageeval.png)

**[Figure 43]** All 200 full prescription pages measured before and after the fix. The gap in the left pair is the pages that failed outright because the reply was truncated. A caveat belongs beside it: the two values must not be multiplied together. The 86.9% recall is a count, not letter accuracy; letter accuracy is the 45.2% of Figure 42. Different sample, different task.

Enlarging the sample overturned one thing we had written. At 200 samples, nothing carrying confidence of 0.8 or higher was wrong, and we took that as grounds for saying the model says it cannot read what it cannot read. At 500 there is one: Folzin (folic acid) read as Naprosyn (naproxen) with confidence 0.85. One in 500 is 0.2% and a small number, but not a small number given that what we were about to build on it was "let anything confident through." Had we not enlarged the sample, we would have put a design on top of a safety that was not there.

In sum, Professor Celia's point is confirmed by three measurements. This app cannot read handwriting. Two things have changed: the screen now knows it, and what the app does everywhere else is now stated in numbers.

Professor Atif Usman noted that **the dose per intake and the number of times a day are not distinguished**. In the amoxicillin example the first picture represents three times a day but cannot represent one capsule at a time, and the morning, midday and evening pictures that follow create confusion. This corresponds directly to the dose errors that make up 28.4% of the total in Table 4.

E. A. Draffan, retired speech and language therapist and visiting accessibility researcher at Global Symbols and the University of Southampton, wrote that AAC users frequently have visual difficulties as well, which makes an audio button hard to reach by scanning, and that since a user's communication-aid interface may differ from this app, the **WCAG 2.2 mobile criteria** should be checked. There was also a point that the morning, midday and evening icons are small and need magnification. Both were addressed. What working through WCAG 2.2 found, and what we changed, are in §3.7, and the icon size was resolved not by magnification but by giving the time morphemes a cell of their own. The account of that is below.

Professor Katarina Vučićević of the University of Belgrade wrote that the refrigerated-storage and midday morphemes are confusable and proposed at least two colours: black and red for warnings, black and yellow for daytime. It is a request to revisit the decision in §3.7 to use colour only for the verdict and keep morphemes in black and white.

Professor Kyogu Lee of Seoul National University raised three things by email reply: whether recombining 78 morphemes can really cover the full range of medicines and regimens; that with the audio alongside it helps, but some pictures are not particularly intuitive; and that where the instruction is negative the pictogram should carry a slash or X, which is missing in the alcohol and pregnancy cases. The last of these found the same defect independently of the four countries in the previous section. The same respondent also proposed push notifications at dosing times and a speech-synthesis toolchain for multilingual expansion.

Aliya Naheed, Senior Scientist at icddr,b in Bangladesh, pointed at a different layer: for this app to change health outcomes the patient has to be able to buy the full course they were prescribed. What the `finish_course` morpheme sets out to convey is completing the course, and if there is no money for the medicine, completing it does not happen however well the picture arrives.

Kyungseo Park, Assistant Manager at the Korea Disabled People's Development Institute, wrote that being unable to read arises from a range of circumstances including old age, childhood, blindness and low vision, and added that the same institute has run a typeface development project for legibility.

Niken Nur Widyakusuma, PhD and pharmacist at Universitas Gadjah Mada in Indonesia, proposed adding markings that can be identified by touch, such as tearing the packaging slightly, for patients with visual impairment. It is a solution outside the screen, and a layer this app does not address.

Professor Atif Usman and Professor Hwi-Yeol Yun both recommended referring to existing pictogram sets, the former naming the USP pictograms and the latter the health.kr pictograms of the Korea Pharmaceutical Information Center. This interlocks with the licence clause prohibiting composition described in §1.9, and it is where the differentiation claimed in §2.6 is directly tested.

Our sample prescription contained a clinical error. Sheron Sir Loon Goh, Pharmacy Lecturer, noted that amoxicillin capsules are normally stored at room temperature, 25 degrees, and do not require refrigeration at 2–8 degrees. The sample prescription we made was wrong, and we showed it to 1,103 people. The refrigeration morpheme was not misattached; the prescription itself was wrong, so it is not an engine defect, but sending an unvalidated example to experts was our error.

Prompted by that point we checked all four samples again from the beginning, and four more came out that nobody had raised. The warnings box of the same amoxicillin sample read "Not for use in pregnancy. Caution if breastfeeding. No alcohol." **All three are wrong.** Amoxicillin is an antibiotic widely used in pregnancy (the NHS writes "It is safe to take amoxicillin during pregnancy"), the amount reaching breast milk is on the order of 0.1 mg/kg a day so it is acceptable while breastfeeding (StatPearls, NBK482250), and it has no clinically significant interaction with alcohol. "Caution if breastfeeding" on the paracetamol sample is the same kind of error. Paracetamol is the analgesic of choice while breastfeeding. "Not for use in pregnancy" on the eye-drop sample is wrong too. The NHS writes that "Chloramphenicol eye treatments and ear drops can be used in pregnancy" and treats them as first choice for an eye infection in pregnancy, because systemic absorption is minimal.

All four errors are of one character. When making the samples we filled the warnings box with plausible-sounding wording, and plausible and correct are different things. Three of the four were pregnancy contraindications, which is the easiest line to put in a warnings box, and the more so because that is what we wanted to demonstrate.

We record this here because the heaviest finding in §5.7 stands on this sample. The point raised independently in four countries, that a prohibition is not read as a prohibition, was about the pregnancy picture carrying no slash, and the engine defect it pointed at was real and has been fixed. But the prescription that demonstrated the defect was itself a faulty example that attached a pregnancy contraindication to amoxicillin. The finding about the engine stands; that the place it was shown was wrong has to be recorded alongside it.

We corrected the samples. The amoxicillin warnings were changed to penicillin allergy and finishing the course, and the eye drops to not wearing contact lenses and not sharing the bottle. Finishing the course is the very thing the `finish_course` morpheme is said to aim at in the SDG 3.d discussion of §5.8, and the demonstration of a pregnancy contraindication was moved to the ibuprofen sample, an NSAID. Contraindication of NSAIDs in the third trimester is a real contraindication.

That all three are problems with the example we made rather than with the engine is the same as the refrigeration error before them. And it says the same thing this section leaves in §5.9. Not one sample in this document has been reviewed by a pharmacist.

#### 5.7.8 Objections to the approach itself

The sharpest response asked whether our product is needed at all. The team leader at the GC Medi-AI Uisarang Service Centre wrote five things: that Korean prescriptions already carry a barcode, so scanning the whole sheet is inefficient; that apps reading the barcode and guiding people with disabilities already exist; that medication counselling is a legal duty of pharmacists and doctors and that many solutions for it already exist; that the market for a business aimed at people who cannot read is too small relative to the investment; and that electronic prescriptions are being prepared, so once they arrive this becomes useless.

We include the response as it stands because there is something in it we have to answer. Three of the five do not conflict with our design. Barcodes are on Korean prescriptions but not on the paper prescriptions of the countries covered in §1.1, and electronic prescriptions will not arrive in those countries first either. That counselling is a legal duty has to be read alongside the physician-density gap cited in §1.4; a duty existing and there being time to discharge it are different things.

For the other two we have no answer. That the domestic market is small is true, and how this app differs from solutions that already exist is what the table in §2.6 tried to answer, but that table is the result of us choosing the comparators. This respondent is in a position to know the comparators we did not choose.

A finding in the same direction came from the industry-practice segment. Cheolhyeon Park, Team Leader at VOICEYE, wrote that "however good a product or piece of software is, without recognition at the client or operator level there is no diffusion", and added that anyone thinking about commercialisation should propose it to a body such as the Korean Pharmaceutical Association and settle both acceptability and price.

#### 5.7.9 Responses that made us revisit our premise

The finding from Professor Heejung Seo of Dong-eui University was the most fundamental in this survey.

> "Pictograms are a good medium for conveying information intuitively, but to a non-literate person these too can feel like letters. As the saying goes, 'the black is the writing and the white is the paper,' so it would be good to implement this with a design and colouring that can be perceived from a non-literate person's point of view."

In §2.1 we assumed that removing text lowers the barrier. This response inverts that assumption. For someone who cannot read, black shapes sitting on paper may already be "writing", and whether it is a picture or a letter may be a distinction only a reader makes. The pictogram comprehension studies cited in §1.8 measured comprehension after a picture was recognised as a picture. Whether a picture is recognised as a picture was not measured.

The point from Professor Eun-Kyoung Kim of Kongju National University runs the same way.

> "Even to me, in my forties, it was hard to grasp at once what the images were saying. I would expect older people unfamiliar with images of this kind to find it harder still."

Professor Kyunghwa Lee of Soongsil University wrote that whether the pictures are fully understood depends on whether the target's level is a matter of literacy alone or also of age and information comprehension, and that more consideration is needed if the prescription is for a condition requiring more expertise than eye drops.

Professor Namsoo Park of Hyupsung University pointed at digital literacy. How well people who cannot read handle a mobile device has to be examined first, and the app in fact contains an instruction reading "select any that apply to you", which blocks that screen for anyone who cannot read it. This is a direct finding about the profile-setup screen of §3.2.

#### 5.7.10 New risks our design could create

Professor and pharmacist So-Young Lee of Chungnam National University pointed out that this app could create a risk that did not exist before.

> "It seems necessary to prevent situations where a patient discontinues medication on their own because of wrong information. For example, even a medicine that carries risk for pregnant women is sometimes prescribed after considering the patient's overall condition, and where the patient checks alone without any clinician's mediation, they may end up not receiving the drug therapy."

In §2.4 we designed contraindications to be displayed according to the user's conditions. In clinical practice, however, there are cases where a drug is prescribed in full knowledge of the risk, and an app displaying the contraindication then amounts to voiding the prescription. Professor Katarina Vučićević of the University of Belgrade writing that "it should go through a pharmacist so that the pharmacy's information and the app's information do not diverge", and 9 of the 12 in the pharmacy segment answering that a pharmacist should review every time, both read as the same concern.

This runs directly into the differentiator we put forward in §2.6, that the verdict is derived from an individual's requirement. A personalised verdict cannot beat a personalised prescription.

A response in the same direction raised the question of order. Asked whether the app could fit a pharmacy workflow, Associate Professor Hangil Lee withheld judgement and gave the reason.

> "The accuracy of the app has to be secured before its convenience for it to be usable in practice, and I think it should be used as an auxiliary tool for the pharmacist."
> (Associate Professor Hangil Lee, College of Pharmacy, Ewha Womans University)

That stings, because what this document measures from §5.1 to §5.6 is largely arrival and operation rather than accuracy. This respondent is telling us to measure first the thing we did not measure. And the first item in §5.9, that there has been no comprehension testing with people, is exactly that place.

The same respondent left a line about what must not be conveyed by picture and speech alone. Only one option could be selected, so they chose contraindications, but side effects and cases needing dose adjustment belong there too. The respondent filled in the limits of our question design for us, and it is why this section has to read the multiple-choice results alongside the free text.

#### 5.7.11 Advice on the evaluation design

The field evaluation design in §5.10 was revised in line with the responses. Advice came from four places.

Foued Maaoui, researcher at the Institut Pasteur de Tunis, asked for low-literate participants rather than educated volunteers, predefined scoring criteria and blinded assessors, separate testing of pictogram-only, audio-only and both, real prescriptions rather than a clean demonstration, and audio in a language matching the participants'.

Myojung Choi, researcher at the Korea Disabled People's Development Institute, cited Nielsen, J. & Landauer, T. K., "A mathematical model of the finding of usability problems," *Proc. INTERCHI '93*, 206–213, 1993, to the effect that a small sample of around 15 can secure the validity of a usability evaluation, and that a small sample in fact allows user behaviour and reactions to be grasped in detail, recommending behavioural analysis alongside the survey responses.

Yonghan Lee, Senior Manager at the Korea Craft and Design Foundation, wrote that the sample should be balanced by age, level of schooling and sex, that participants should have no prior knowledge of the pictograms in question, and that the method should have them describe the meaning. He added that multiple choice looks meaningless, which is the same judgement behind our decision in §5.2 not to offer options.

Professor Celia of the University of Pretoria recommended using an adherence instrument together with the K-HLAT-8 and HLS family of instruments. Professor Namsoo Park of Hyupsung University judged that since the purpose of this app is comprehension of medication instructions, measuring user satisfaction, intention to continue using it and the degree of improvement in convenience fits better than a health-literacy instrument.

Sheron Sir Loon Goh, Pharmacy Lecturer, asked for one more thing ahead of the test: before launching the app, seek professional advice from local pharmacists on whether the symbols are appropriate in the local context. That five clinical errors turned up in our sample prescriptions in §5.7 shows why that advice is needed. We corrected them against public sources without review, and for the 78 morphemes we have not even done that much checking.

The same respondent also pointed us to a reference: a study testing pictograms designed in Malaysia on that country's population (Tumkur, A., Ingle, P., Ling Sze Ning, Q., Bustamin, N. A., Tee, K. H., Chai, T. L. & Hatware, K., "Evaluation of designed pharmaceutical pictograms among the Malaysian population," *Clinical Epidemiology and Global Health*, 2025, doi:10.1016/j.cegh.2025.102115). We record why its results are not used in the body: all three routes, the publisher, DOAJ and Semantic Scholar, failed to open the abstract, and we could not confirm the figures in the search summary at a primary source. What is recorded here is only that the survey pointed us to literature we did not know.

Professor Eun-Kyoung Kim pointed at the procedure before the test rather than the test itself: explain the purpose and the benefit from the learner's point of view to the institution and the literacy teacher first, obtain their cooperation, and only then use part of a class period. Asked whether a tool like this might reduce the motivation to learn to read, the same respondent answered that it would not, on the grounds that the motivation to learn to read is more than the acquisition of a skill.

#### 5.7.12 Every answer, by occupation

The preceding subsections quoted only the questions we selected. To see whether the basis of that selection tilted one way, we laid out the whole tally by occupation again. It had tilted. There were places where the figure unfavourable to us was included and the favourable one omitted, and the bold rows in the table below are those.

[Table 45] Every answer by occupation (the denominator is the number of respondents in that occupation)

| Occupation | Question | Answer | Responses |
|---|---|---|---|
| Pharmacy (12) | Where in medication counselling should it sit | A tool supporting the pharmacist's explanation | 7 |
| | | A means for the patient to check alone at home | 3 |
| | | An alternative route for patients a pharmacist cannot reach | 2 |
| Pharmacy (12) | Should a pharmacist review it | Every time, without exception | 9 |
| | | Once at the start is enough | 3 |
| Pharmacy (12) | What must not be wrong medically | Dose and frequency | 7 |
| | | Contraindications and interactions | 3 |
| | | Route of administration | 1 |
| | | Not stopping on one's own | 1 |
| Pharmacy (12) | Anything that must not be conveyed by picture and speech alone | Yes. Contraindications and interactions | 5 |
| | | Yes. Cases needing dose adjustment | 3 |
| | | Yes. Other | 2 |
| | | No. In principle all of it can be | 2 |
| Pharmacy (12) | Can it fit the pharmacy workflow | It can be recommended while dispensing | 8 |
| | | Difficult, there is no time | 1 |
| | | Non-pharmacist staff can help | 1 |
| | | It should happen outside the pharmacy | 1 |
| | | Hard to say | 1 |
| Nursing (9) | Can it change actual health outcomes | It can, if the conditions are met | 8 |
| | | Dosing behaviour may change but not health outcomes | 1 |
| Nursing (9) | In the field, do people who cannot read fail to receive medication information properly | Yes | 3 |
| | | Partly | 5 |
| | | No | 1 |
| Nursing (9) | For an older patient living alone, where does it fail first | They cannot operate the screen | 4 |
| | | They cannot manage the device (charging, loss) | 4 |
| | | They do not trust the app | 1 |
| Nursing (9) | Instrument for measuring the effect | An adherence instrument | 6 |
| | | A health-literacy instrument | 1 |
| | | Count medication errors directly | 1 |
| | | Existing instruments do not fit | 1 |
| Nursing (9) | Who should it be designed for | The two separately | 6 |
| | | Patient / carer / hard to say | 1 each |
| HCI (2) | The biggest problem | That there is no validation with users | 2 |
| HCI (2) | Can machine pre-screening stand ahead of testing with people | It is justified with conditions attached | 2 |
| HCI (2) | As morpheme combinations grow, what breaks first | It becomes impossible to tell what the main meaning is | 2 |
| HCI (2) | How to measure the criterion with a small sample | Choose from options / observe actual behaviour | 1 each |
| HCI (2) | Where does a first-time user get stuck | Granting camera permission / they do not get stuck | 1 each |
| AAC (1) | Does it fit the accumulated knowledge of this field | Broadly yes, with places where it diverges | 1 |
| AAC (1) | Does combining 78 morphemes by grammar hold up | It holds up with conditions attached | 1 |
| AAC (1) | Which morphemes will be misread first | Abstract concepts (empty stomach, interaction and so on) | 1 |
| AAC (1) | The problem that symbols presuppose learning | It holds for some categories only | 1 |
| Adult literacy (1) | Is there a place for it in adult literacy education | Yes, but the form has to change | 1 |
| Adult literacy (1) | Does it reduce the motivation to learn to read | No. It helps, if anything | 1 |
| Industry (1) | What is most lacking | A route that reaches users | 1 |
| Industry (1) | In operation, what breaks first | Users stop using it after a few days | 1 |
| Other (9) | What has to be resolved first | That there is no validation with people | 2 |
| | | A route that reaches actual users | 1 |

![Figure 44](fig/chart18_field_answers.png)

**[Figure 44]** What the 12 pharmacy and 9 nursing and public-health respondents answered. The denominators are small, so head counts are drawn rather than percentages. The third row on the left and the first row on the right point in different directions. Pharmacy sees things this app cannot handle; nursing sees outcomes that can be changed once the conditions are met.

What we had omitted comes first.

Eight of the nine nursing and public-health respondents answered that in the field people who cannot read are not receiving medication information properly: 3 "yes" and 5 "partly", against 1 "no". This confirms the premise of §1.1 and §1.2 from the field, and in the earlier subsection we recorded only that 44% of respondents almost never encounter such patients and did not record this question. The two questions ask different things. The first is how often the respondent sees it; the second is what those who have seen it saw. Including only the unfavourable side is the same problem that the appendix in §5.11 exists to address, and it is corrected here.

There is one more in the same place. Both HCI and design respondents answered "justified with conditions attached" about our procedure of screening morphemes by asking a vision-language model instead of people (§5.2). That procedure is one of the two rows we claimed in §2.6 to have put down as new, and we had not included the outside judgement on it. The qualifier "with conditions attached" overlaps with the three limitations we set down for ourselves in §5.4.

Then the things that read newly.

Ten of the twelve pharmacy respondents answered that there are things which must not be conveyed by picture and speech alone: contraindications and interactions for 5, cases needing dose adjustment for 3, other for 2, against 2 who answered that all of it can be. This app includes interactions in its verdict (§2.4), so this answer is a request to narrow the scope of our design. It interlocks with the risk of unilateral discontinuation written by Professor So-Young Lee of Chungnam National University.

The nine nursing respondents split on where an older patient living alone fails first: 4 on operating the screen and 4 on managing the device. The latter is charging and loss, which lies outside our design. However much the app is improved, it does not open if the device is flat. The offline operation of §4.5 handles a connection being cut; it does not handle the device being off.

Both HCI respondents chose "it becomes impossible to tell what the main meaning is" as what breaks first as morpheme combinations grow. It is the too-many-elements-in-one-image finding of the earlier subsection, said from another side. It is a prediction that things get worse as the set grows, so it has to be measured alongside step 4 of §5.10 when morphemes are added.

Asked which morphemes would be misread first, the AAC respondent chose abstract concepts, things like empty stomach and interaction. That agrees with all five of the morphemes we could not improve in §5.3 being problems of concept rather than of form. The same respondent answered that the approach of combining 78 morphemes by grammar "holds up with conditions attached", and that on the point that AAC symbols normally presuppose learning while we expect immediate comprehension from a first-time viewer, it "holds for some categories only". It means the range over which our grammar holds differs by the kind of morpheme.

Asked what breaks first in operation, the industry-practice respondent chose "users stop using it after a few days". No measurement in this document addresses continued use. It has been added to the unverified items in §5.9. That the formative evaluation of §5.1 covers only a single capture is what is caught here.

#### 5.7.13 What was fixed after the survey

This survey was carried out to fix things rather than to record results and stop, so what was fixed and what further came to light in the fixing is set down here. All of it took place after the survey in August 2026.

The contraindication marking was fixed. `contentLabels` had handled every flag through a single `avoid`, and it was split into three according to the nature of the flag. Flags that say what is contained (`peanut`, `high_salt`) gain and lose the slash according to the verdict, while flags that say what not to do (`unsafe_pregnancy`) are always drawn as prohibited regardless of the verdict.

Fixing it found one more of the same accident running the other way. An avoid verdict was wrapping `\no{}` around every flag, so the no-alcohol morpheme `no_alcohol` became `\no{\no_alcohol}` and the no-alcohol marking was getting a slash through it. Putting a slash through a picture saying do not drink means it is fine to drink. The bleeding warning `warn_bleeding` was likewise becoming a picture that does not say "do not bleed". What the survey caught was contraindications not being marked, and on the other side of the same function there was a path where contraindications were marked inverted.

`finish_course` was redrawn. The problem was filling three of five cells and leaving two empty. It was meant to draw a number of days, but drawing a state in progress says "not finished yet" rather than "finish it". Using the directional arrow proposed by Sheron Sir Loon Goh, Pharmacy Lecturer, all five cells are now filled with an arrow beneath pointing to the last one.

This revealed why the semantic check of §5.2 had passed it. The expected value of the check was `row of boxes`. Because it asked only about appearance, a picture meaning the opposite passes too. The expected value was changed to `arrow pointing to the end of a row of boxes`, so that looking merely like a row of boxes now fails. What we recorded as the third limitation of that procedure in §5.4 is confirmed here as an actual case. The semantic check is an instrument for asking what a picture looks like, not for asking whether its meaning stands the right way up.

The set was made to use itself as its own list. When Professor Katarina Vučićević wrote that refrigerated storage and midday are confusable, opening the confusion list for the two morphemes showed that neither recorded the other. Each had been asked whether it is confusable with a star; no one had asked whether they are confusable with each other. Writing a longer list does not close this. With 78 morphemes there are 3,003 pairs. So if a picture reads as the meaning of another morpheme, it counts as a collision whether or not we wrote it down in advance.

We added a pixel-level check for similar pairs as well. Installed morphemes are reduced to the 32 pixels at which they are actually seen and the distance between them measured, because being distinguishable at 512 pixels is not this app's problem. Recorded honestly, this check does not catch the pair the expert named (refrigeration against midday). It ranks 944th of 3,003. That confusion is a structural overlap of radial forms rather than a pixel one, a different kind, and that side is the semantic check's job.

So it was fixed by looking rather than by the metric. A snowflake and a sun are both star shapes radiating from a centre, and if the silhouettes are the same, enlarging them does not separate them. The professor's proposal was colour: black and red for warnings, black and yellow for daytime. Colour is good as a second layer but cannot be the first. To someone who cannot see colour the two pictures are still the same, and that person is the one §3.7 undertook to protect. A composed cell is a single PNG, so there is no way to tint only the morpheme inside it either; adding colour would require the engine to emit colour, and that changes the black-and-white-silhouette rule itself. The silhouette was changed instead. The snowflake was not discarded, because it is a picture people have already learned from the refrigeration mark printed on packaging; it was cut into a box as a hole. What was learned stays and what collides disappears. The outline is now a filled rectangle, so there is nowhere left for it to overlap with the sun.

Instead the check found something nobody had raised. `time_morning` and `time_evening` rank fifth. It is the confusion of morning and evening doses being swapped, and it is the same place as `time_evening`, which §5.3 records as one we could not improve.

Part of it was resolved by changing the position rather than redrawing the picture. Several respondents asked for the morning, midday and evening pictures to be enlarged; enlarging did not work, and why it did not was the answer. `\tablet_blister{\time_morning}` is a grammatically correct line. Rendered at the 88 pixels the app draws, however, the six holes of the blister take up the cell and the sun that carries the meaning is trapped in a 20-pixel window in the middle. Put four side by side and morning, midday, evening and night are not distinguishable from one another. Raising the modifier scale further does not help, because the window is the size of the slot, and a black drawing that leaves the window disappears into the black head.

So the dictionary was given a way to record whether a morpheme can stand alone. The principle stays: a modifier cannot stand alone, because a peanut on its own does not say whether it means "contains" or "do not eat". Time of day is the exception to that principle. A sunrise is morning whatever it is attached to, and the preceding cell has already said what the medicine is. Time of day now fills a whole cell the way a head does. A line now reads as one capsule · sunrise · midday · sunset · to the end · with food, and since each cell has come down to one element it also reaches the too-many-elements finding raised in the same survey.

We kept the wording for a morpheme standing alone separate. Hearing only "In the morning." leaves the sentence unfinished as to what should happen in the morning, so a time morpheme standing alone is read as "Take it in the morning." What remains is exactly as §5.3 judged. That sunrise and sunset differ only in direction does not change when the cell grows, and that side is carried over to the field evaluation in §5.10.

There were inversions in the speech as well. `say.ts` had no tests at all. A pictogram at least looks odd when it is wrong, but speech cannot be seen, so it flows out wrong and the listener has no way of knowing. Adding 12 tests caught one. Having split the administration verb by dosage form (§2.3), this file was still ending every closing sentence with "Take as prescribed." Sending out "Put 2 drops in the eye" and "Take as prescribed." together for one eye drop collapses, in that last sentence, the reason the verbs were split.

The same kind appeared in the storage instruction. The positive check was looking only for `refrigerat`, so "Do not refrigerate" was read as refrigerated. A medicine to be kept at room temperature reads as refrigerated, and that inversion goes out through both the picture and the speech. This came to light while fixing the clinical error in the sample prescription that Sheron Sir Loon Goh, Pharmacy Lecturer, identified. The corrected wording happened to be "Do not refrigerate".

Two morphemes were redrawn. `allergen_egg` followed the point made by Professor Namsoo Park of Hyupsung University. A fried egg seen from above loses its white in the silhouette because the white is white, leaving a single yolk circle that reads like a target or a button. In a set drawn as filled silhouettes, a picture whose meaning is carried by the white part never stood up in the first place, so it was changed to a cracked egg. That `allergen_tree_nut` was read as "cracked egg" in §5.2 is the evidence that this form reads as an egg. `hand_wash` followed the instruction given by Yonghan Lee, Senior Manager at the Korea Craft and Design Foundation, exactly: a hand under a running tap.

We went through the accessibility criteria. Checking WCAG 2.2 item by item, as E. A. Draffan, retired speech and language therapist and visiting accessibility researcher, had asked, found all five verdict colours below the contrast criterion and the target size of secondary controls between 16 and 20 pixels. The colours looked perfectly fine on screen, and that is in fact how they survived this long. They are values the eye cannot hold, so they were locked with a test, and the numbers and the judgement are carried as Table 19 in §3.7. What should be recorded here is that we would not have done this without the survey. In §3.7 we had five channels standing in for colour and had not measured whether the colour itself could be read.

The speech was given the languages of six countries. Professor Kyogu Lee of Seoul National University proposed multilingual expansion, and the target user does not speak English in the first place. Only the spoken side was translated. The screen text stays in English, because the channels that reach the target user are the pictures and the sound, and the screen text is for the carer and the reviewer standing beside them. The languages were chosen from where the respondents work: Urdu (Pakistan), Hausa (Nigeria), Indonesian, Bengali (Bangladesh), Romanian (Moldova) and Korean, 72 morpheme sentences × 6 = 432 entries. Swapping words alone does not make a sentence, so each bundle carries its own word order, and doing that revealed that the storage instruction is a separate act rather than a modifier, so the sentence was split; the English improved with it. **No native-speaker clinical review has been done**, and that fact is recorded in both the code and on screen. The wording that goes out on screen, carried over as written:

> "The screen stays in English. Only the voice changes. These translations have not yet been checked by a clinician who speaks the language — English included."
> (Settings screen, below the language picker)

Including English is the point. It is not only the translations that are unreviewed; the source sentences are unreviewed too, and that is not hidden behind a note about translation. A mistranslated dosing instruction causes exactly the harm this app exists to prevent. Seven languages appear in Settings; English is the source, so six were translated.

![Figure 45](fig/fig14_language.png)

**[Figure 45]** The language picker in Settings, captured from the deployment (https://snapcare.fly.dev) as it stands. The note underneath is the point of this screen: the display stays in English and only the voice changes, and the translations have not been checked by a clinician who speaks the language, English included. That is to say it is not only the translations that are unreviewed; the source sentences are not either.

Urdu and Hausa can be seen dimmed and carrying "no voice on this phone" with a mute mark. These are the marks §5.7 describes, and this figure confirms that description.

Getting this figure took one failure. The earlier capture did not carry those marks, and we had a paragraph in the body excusing it: the browser was headless, its voice list empty, so the marks did not appear. The cause was not the browser but our capture procedure. The voice list is filled asynchronously by `speechSynthesis`, and we waited only for the heading of the list before taking the shot, so the shot was taken before the marks were attached. It now waits for the marks themselves to appear on screen.

One more thing should be read from it. The disclosure sits below the red line, which is to say it is reached only by scrolling. Putting a disclosure on the screen and the user seeing it are different things, and this screen currently satisfies only the first. Someone choosing a language stops when they find their own in the list and has no reason to go further down. Whether the disclosure should move above the list is left as an item to settle with people present, in the field evaluation of §5.10.

The dispenser now calls the phone when it presents a dose. The same respondent proposed dosing-time notifications. The release button is visible only while the app is open, so without a place that calls, this feature works only for whoever happens to have the app open. It does not call while you are watching, it does not disappear until touched, and permission is asked right after pairing the box: to someone who has just claimed the box, "shall we tell you when a dose is ready" is a continuation, whereas a dialogue at first launch gets refused before its purpose is known.

A checking step was built. It responds to the absence of teach-back raised by Foued Maaoui, researcher at the Institut Pasteur de Tunis, and its design and rationale are in §3.8. What should be recorded here is that this step is a screen that did not exist at all before the survey. If the earlier fixes corrected things that were already there, this is something the survey created.

The web app test count went from 231 to 347 (Table 28).

#### 5.7.14 Limits of this survey

The sample is self-selected. Thirty-five of 1,103 answered, and those who answered are people with an interest in the subject. The judgement of the 1,068 who did not answer is unknown.

The denominators are small. The largest segment, pharmacy, is 12 people. Written as a percentage, one person moves 8 points, so this section records numerator and denominator together.

**There was no response from the 41 chosen by hand.** The 41 with the clearest selection basis were put at the front of the sending order and all received it within seven minutes, and the response count is zero. This result cannot be used as "the judgement of the 41 we considered most important."

Three respondents told us the survey instrument itself was flawed. Professor Atif Usman of The Islamia University of Bahawalpur asked that multiple responses be allowed in every segment, and Associate Professor Hangil Lee of Ewha Womans University wrote that only one option could be selected so he chose contraindications, though side effects and dose adjustment belong in the same place. Professor Namsoo Park of Hyupsung University said the same thing: asked where an older patient living alone fails first, he answered that operating the screen, managing the device and trust arrive together.

The distributions for single-choice questions in this section therefore do not hold everything the respondents wanted to choose. That has to be read alongside the figures in Table 45, and it is why this section presents the free text next to the multiple choice.

E. A. Draffan, retired speech and language therapist and visiting accessibility researcher at Global Symbols, told us of another flaw: they only realised at the end that there was a button back to the screen showing the 78 morphemes. How many responses were given without being able to look at the morphemes again, we do not know. The same respondent suggested putting a link back to the morphemes inside the questions.

There are groups the link does not reach. The Korea Institute for Health and Social Affairs replied that as a public institution it cannot open an unverified URL and asked us to send the questions by email. The list contains 91 international organisations alone, and running a survey through a single link structurally fails to reach this group. A version with the same questions written in the body of the email should have been prepared alongside.

The screen respondents saw is not the screen our users will see. Of the 35, 30 answered on a desktop, 3 on mobile and 2 on a tablet. This app is built on the premise of use on a handheld device (§1.6), so a judgement formed on a large screen may come out more generous than the real condition. That the point about icons being small and needing magnification came from a desktop respondent rather than a mobile one should be read alongside this.

We do not know how many people heard the audio. Whether the speaker in the demonstration was pressed was being recorded, but the instrumentation failed to account for the speaker rendering as `<span role="button">` rather than `<button>`, so the first 34 were all recorded as not pressed. It was fixed during the survey, so only later responses are valid. In other words, of the responses to the judgement question in this section, how many were answered after hearing the audio cannot be known.

### 5.8 Contribution to SDG 3

The point at which SnapCare intervenes is the last step described in §1.4. The health system takes care of consultation and dispensing, but from the moment the patient opens the medicine packet at home it is left to their own ability to read.

[Table 46] Correspondence with SDG 3 targets

| Target | SnapCare's contribution |
|---|---|
| **3.4** Prevention and treatment of noncommunicable diseases | WHO nutrition recommendations are derived from the individual's energy requirement to produce a verdict. Diabetes and hypertension conditions narrow the thresholds |
| **3.8** Universal health coverage | Reduces the literacy-driven gap at the self-management stage after care |
| **3.d** Health risk management | Conveys completion of an antibiotic course in pictures, intervening in the human factor behind resistance |

The link to 3.4 runs through the undiagnosed population described in §1.5. Of 589 million adults with diabetes worldwide, 43% do not know they have it, and they select "no" on the screen that asks about conditions. SnapCare asking about conditions along three branches (§2.5) is the response to this. Someone who does not know the diagnostic name can still answer what they have experienced, and the thresholds are narrowed from that answer. Given that the management of noncommunicable diseases happens over daily meals rather than in the consulting room, not requiring a diagnostic name is itself a way of widening who can be reached.

The link to 3.8 comes from the workforce gap. As cited in §1.4, physician density varies more than thirteenfold by region, and when consultation time shortens the first thing cut is the explanation of how to take the medicine. Universal health coverage is generally measured by whether care and medicines are within reach, but if the instructions cannot be read once the medicine is in hand, coverage stops there. The 50% adherence figure cited in §1.4 is the size of that stopping point. Half disappears after the medicine has been prescribed, dispensed and handed over, so however much is invested in the earlier stages, leaving this one untouched lets that much leak away. What SnapCare sets out to reduce is this gap remaining after care, and it is a gap that divides along literacy.

The link to 3.d is the most direct. An analysis of more than 23 million laboratory-confirmed infections reported from 104 countries found that in 2023 one in six bacterial infections showed resistance to antibiotics. Between 2018 and 2023 resistance rose in more than 40% of the monitored pathogen and antibiotic combinations, at an annual rate of 5% to 15% (World Health Organization, *Global antibiotic resistance surveillance report 2025 (GLASS)*, 2025). In 2019, deaths directly attributable to bacterial resistance numbered 1.27 million, more than HIV/AIDS or malaria (Murray, C. J. L. et al. (Antimicrobial Resistance Collaborators), "Global burden of bacterial antimicrobial resistance in 2019," *The Lancet*, 399(10325):629–655, 2022). Stopping an antibiotic once symptoms subside is the principal human route to resistance. And it is not the behaviour of a minority. A survey of 9,772 people across 12 countries found **32% believed it was acceptable to stop antibiotics once they felt better**, and 64% believed antibiotics work on colds and flu (World Health Organization, *WHO multi-country survey reveals widespread public misunderstanding about antibiotic resistance*, 2015).

Broken down by region, this problem too is concentrated where we are aimed. In South-East Asia and the Eastern Mediterranean one in three reported infections showed resistance, in Africa one in five and in the Americas one in seven (World Health Organization, *Global antibiotic resistance surveillance report 2025 (GLASS)*, 2025). The regions with the lowest literacy in §1.1 appear here again.

![Figure 46](fig/chart14_amr_region.png)

**[Figure 46]** Share of reported bacterial infections showing antibiotic resistance (World Health Organization, *Global antibiotic resistance surveillance report 2025 (GLASS)*, 2025). The world average is one in six; in South-East Asia and the Eastern Mediterranean it is one in three. The low-literacy countries of Table 1 are in those two regions. That is the place the `finish_course` morpheme aims at.

If one person in three believes that, the course length written on the prescription is not unread but read and not followed. On top of this come the people who cannot read it. If a duration written in text is never delivered in the first place, that instruction may as well not exist, and this is the point SnapCare's `finish_course` morpheme is aimed at. A picture alone does not change a belief, however, and what this morpheme does extends only as far as making the duration arrive.

### 5.9 Unverified items

We state what this proposal does not claim.

First, no comprehension testing with people was carried out. The expert survey in §5.7 is not that test: it asked people who deal with such patients daily, whereas a comprehension test has to ask the patients. The measurement in §5.2 concerns a machine, and whether the 67% criterion required by ISO 9186 is met has to be confirmed with people. Further, because misreading a dosing instruction leads directly to harm, we judge it appropriate to also apply the **critical confusion of 5% or less** required by ANSI Z535.3. The field evaluation plans to tally wrong answers separately as ordinary errors and as opposite-meaning errors.

Second, cultural adaptation has not been verified. In the controlled comparison showing two sets to the same 46 people, 20 of 23 locally made pictograms passed the ANSI criterion while USP-DI managed 11 of 23 (Dowse, R. & Ehlers, M. S., "The evaluation of pharmaceutical pictograms in a low-literate South African population," *Patient Education and Counseling*, 45(2):87–99, 2001). Pictogram comprehension therefore varies by culture. This set was designed in Korea and needs verification with Moldovan users.

Third, no claim is made about clinical outcomes. Ownby et al. (2024), cited in §1.4, makes this item heavier. Three hundred and fifteen people with low health literacy were given an app with lowered reading difficulty and audio, and medication adherence did not move. We hold that changing the medium is different, but whether that holds can only be known by measuring, and we have not measured it. This work measured the arrival of information and did not measure improvement in adherence or health outcomes.

Fourth, the recovery path after a misclassification was not measured. Because the design does not have the user choose what they photographed (§3.3), if the app mistakes food for medicine there is nothing on screen for the user to correct it with and taking another photograph is the only option. This design made the user bear misclassification in exchange for removing the selection step, and how often that misclassification actually occurs was not measured. Nor was it confirmed whether users can notice that something has been read wrongly.

Fifth, behaviour on a slow connection was not measured. The check in §5.6 was made with the connection cut entirely. Having no connection and having a slow one fail differently, and in the latter the request does not fail but hangs for a long time. `Estimating…` stays on screen throughout, and how long to wait before giving up and offering another route has not been settled. Given the connectivity of the target regions, this is likely a more common condition than a complete outage.

Sixth, the site of administration is empty for two dosage forms. As Table 9 showed, for injections and suppositories the spoken verb cannot carry the site and yet the site is neither spoken nor drawn. In the other seven forms either the verb carries the place (Take, Breathe in) or the site is attached separately (Put in the eye, Apply on the skin); these two are neither. Choosing a site to draw for an injection would be inventing something the prescription does not contain, so we did not, and a suppository could not be stood up because the 78 morphemes cannot draw the orientation of a human body. We have not measured what share these two forms hold in real prescriptions, nor how a user receives an instruction that goes out without a site.

Seventh, the sample prescriptions have not been reviewed by a pharmacist. The four samples used in this document and in the survey of §5.7 were made by us from public sources; no pharmacist or doctor reviewed them. Five clinical errors came to light after the fact. One storage condition was raised by a respondent, and four warning lines we found ourselves while re-checking after that. All four were problems with the example rather than with the engine, but that example was where the heaviest finding of §5.7 stood. We have no grounds for saying there are no more. The wording as corrected now was corrected against public sources, not reviewed.

Eighth, users with intellectual disability were not addressed. Raisa Kravchenko, Deputy Director of the All Ukrainian NGO Coalition for Persons with Intellectual Disabilities in Ukraine, wrote that the sounds are good but the pictograms should be improved and tested with people with intellectual disability. This app was designed for low literacy, and intellectual disability is a different condition. The checking step of §3.8 is the feature closest to that direction, but it was not designed for that group.

Ninth, cross-cultural misreading was not measured. Professor Afonso Cavaco of the Universidade de Lisboa wrote that the design needs robust testing and that interpretation errors may happen, especially in cross-cultural practice. Table 6 and Figure 10 in §1.8 already show this, and our set was designed in Korea and has not yet been tested anywhere. It sits in the same place as the second item in this section, but where that item states the absence of cultural adaptation, this one states that we have not measured in which direction misreading occurs before adaptation.

Tenth, the spoken translations in six languages have had no native-speaker clinical review. The 72 morpheme sentences were carried into six languages by us and a machine, not by anyone who has counselled patients in those languages. A mistranslated dosing instruction causes exactly the harm this app exists to prevent, so until reviewed these translations hold the same status as the sample prescriptions of §5.7: plausible, and unconfirmed.

Eleventh, whether people keep using it was not measured. The formative evaluation of §5.1 covers a single capture, and whether the same person opens this app again a few days later was not measured. What the industry-practice respondent in §5.7 chose as the first thing to break in operation is that point.

### 5.10 Future plans

[Table 47] Plans after the contest

| Stage | Content | Rationale |
|---|---|---|
| 1 | Expert opinion survey (**complete**, §5.7) | Sent to 1,103 people, answered by 35. The defects raised pass to stages 3 and 4 below |
| 2 | In-person evaluation with older Moldovan users | Addresses the first and second limitations in §5.9 |
| 3 | Redesign morphemes confirmed as misread | The five in §5.3 need the concept itself reconsidered |
| 4 | Fix the defects raised in §5.7 (partly complete) | The contraindication marking, `finish_course` and the checking step (§3.8) are built. The ceiling on elements per image will be set after the field evaluation |
| 5 | Formalise morphemes generated at runtime | Expand the set on the basis of the gap log the app leaves |

Stage 2 matters most. Every measurement in this work confirmed whether information reaches the screen, and whether it is read by a person can only be learned by asking people.

How that evaluation will be run is already settled. The method follows ISO 9186-1. One picture is shown with no options given, the person says what it looks like, and whether the answer matches the intent is judged separately. That this is the same form of question as the mechanical check in §5.2 is not a coincidence. The mechanical check was built in that form precisely to measure the same thing a test with people measures.

The tally is split two ways. Ordinary wrong answers and opposite-meaning wrong answers are counted separately. ANSI Z535.3 requiring critical confusion of 5% or less alongside an 85% correct-response rate comes from the same judgement. For dosing instructions the latter matters more. Reading a picture wrapped in `no{}` as "take this" is worse than having no picture.

The sample will be older Moldovan users, with the aim, as Table 6 showed, of measuring before and after cultural adaptation separately. The way Dowse & Ehlers showed two sets to the same 46 people is exactly the design we need. Testing the current set as it stands, redrawing locally the morphemes confirmed as misread, and asking the same people again would give us a figure for our own set corresponding to their 87% against 48%.

It should also be recorded that we may not obtain it. That the pass rates in Table 6 spread from 15.7% to 87% means the comprehensibility of any one set is not predictable in advance in this field. What this work offers is not a claim to have a good set but a procedure for measuring a set before release, and whatever that procedure says about our set is the result.

<!-- 부록 시작. survey_appendix.py 가 생성한다. 손으로 고치지 말 것 -->
### 5.11 Appendix. Every free-text response

§5.7 quotes only the responses we selected. Selecting can tilt towards what favours us, so all 117 free-text responses received are set down here in full, by question. Only line breaks were removed; nothing else was touched. Short answers ("N/A", "Yes.") are left in rather than being dropped and reinstated. Responses written in Korean are given here in our own translation; the originals stand unaltered in the Korean version of this document.

**Anything you would add that we did not ask** (14)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Kyogu Lee | Professor | Seoul National University | - The pictograms define 78 "words"; even with recombination, can they really cover the very wide range of medicines and regimens? - Hearing the audio alongside helps with understanding the pictograms, but some of them look less than intuitive. - Where the instruction is negative, it would be good for the pictogram to carry a "/" or "X" as well (some do, but alcohol, pregnancy and so on do not). - Linking it to push notifications so that dosing times are announced and read aloud would help a great deal more. - Using Supertonic TTS would make multilingual expansion easy (https://huggingface.co/spaces/Supertone/supertonic-3). |
| (name withheld) | Team Leader | GC Medi-AI, Uisarang Service Centre | 1. Korean prescriptions carry a barcode, and only the barcode needs reading, so scanning the whole sheet is inefficient. 2. Apps that read the barcode and can guide people with disabilities already exist. 3. Medication counselling is the duty of the pharmacist, and of the doctor for in-hospital prescribing, and there are already many solutions for it. 4. For a business model aimed at people who cannot read, the market is too small relative to the investment. 5. Electronic prescriptions are already being prepared. Once they are electronic this is useless. |
| Kyungseo Park | Assistant Manager | Korea Disabled People's Development Institute | Being in a position of not being able to read comes from a range of individual circumstances: old age, childhood, blindness, low vision. It is certainly needed, and our own institute has run projects such as typeface development for legibility. |
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | From this survey alone it is clear that you may be thinking about this far harder than people currently in the field, and since that thinking and effort is towards making a better world, you have my support. |
| Heejung Seo | Professor | Dong-eui University | I think this is a practical idea that can help with the difficulties people who cannot read may feel. I do not know much about implementing algorithms from an engineering standpoint so I have no technical advice, but I have some thoughts from the position of the non-literate user. Pictograms are a good medium for conveying information intuitively, but to a non-literate person these too can feel like letters. As the saying goes, 'the black is the writing and the white is the paper,' so it would be good to implement this with a design and colouring that can be perceived from a non-literate person's point of view. The same applies to the spoken explanation. It would be good if the information and explanation were accurate and pitched at their level of perception, so that a well-built function can actually be used by them. |
| Kyunghwa Lee | Professor | Soongsil University | It is systematically put together. The level of the target group ought to be considered as well, though. Whether the pictures will be fully understood depends on whether this is simply a literacy problem or also involves age and the level of information comprehension, and I am a little concerned about that. If the prescription is not merely at the level of eye drops but for a condition requiring more expertise, it would need more consideration. |
| Sung-il Cho | Professor | Seoul National University | A plan is needed to reflect the fact that circumstances differ by country. |
| Niken Nur Widyakusuma | PhD, pharmacist | Universitas Gadjah Mada | There is not much patient who can not read without visual impairment (children, adults); i see more patients with visual impairment (therefore thay cant read). It is important for them to tell each medicine apart. It would be hard for them to take picture |
| Atif Usman | Professor | The Islamia University of Bahawalpur | Kindly allow multiple responses in all the sections. Also, refer to USP pictograms instead of developing a new set. You can definitely develop your own when and if these are not available elsewhere to suit your local context. |
| Afonso Cavaco | Professor | Universidade de Lisboa | Nothing. Good look! |
| Mustapha Taibi | 번역·통역학 교수 | Western Sydney University | N/A |
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | I was interrupted during this survey so the time it took should not be taken as being the actual time taken.  I did not realise there was a back button to look at the 78 symbols until I got to the bottom of the page!  I think the idea of this app is good but may suit many people and not just AAC or those with literacy difficulties but it is hard to judge how easy it would be to actually use the app with a some of the complex disabilities that arise due to brain damage such as stroke even though it sounds ideal - taking photos of smally prescription notes is not that physically easy |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | 1) you can add symbols for special instructions:  like 1) shake the medication before use. 2) Please keep it away from children. Examples of special instruction: https://wisconsinliteracy.org/health-literacy/programs/health-literacy-programs/lets-talk-about-medicines/lets-talk-about-medicines-workbooks/special-instructions.html 2) amoxicillin capsule we normally keep at room temperature 25 celcius. No need to keep refrigerated at 2-8 celcius |
| Namsoo Park | Professor | Hyupsung University | I hope the idea is developed well and that the result comes to be used meaningfully in the field. |

**Could they take it alone, and why** (13)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | As noted above, there are several types of people who cannot read, and in fact the largest group is likely to be blind people rather than the 'illiterate'. I do not know whether blind users were considered from the outset, but if you want to include them, for a blind person the very act of taking a photograph can be a barrier. Smartphone use by blind people is not impossible today, so it would be good to consider connecting to that as well. |
| Rahul Malhotra | 부교수 | Duke-NUS Medical School | Pictograms need to validated for understanding before use |
| Sung-il Cho | Professor | Seoul National University | They may not know what the picture means, or may interpret it wrongly. |
| So-Young Lee | Professor and pharmacist | Chungnam National University | For someone who cannot read and is also elderly, even pressing to hear the audio may be difficult. In that case it would be good to refine the pictures further so that the meaning shows from the picture alone. |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | Presenting information on a multi-channel cognitive basis, combining pictogram and sound, seems the right direction. Where one pictogram contains a lot of information, however, clarity of perception can fall, so it needs simplifying around the core information. |
| Celia | Professor | University of Pretoria | It is clear and concise |
| Foued Maaoui | Researcher | Pasteur Institute of Tunis | Although the demonstration screens are visually clear, several critical limitations remain. Many individual pictograms are highly abstract, including symbols representing treatment completion, dosage quantity, administration timing, and warning or prohibition messages. Without prior training or accompanying text, patients may misinterpret the prescribed dose, the timing of medication in relation to meals, or the intended meaning of specific warning icons. The project itself acknowledges that the pictograms have not yet undergone formal comprehension testing. In addition, the speech component is currently available only in English. While the rewritten audio represents a significant improvement over conventional text-to-speech, patients who cannot read the accompanying text and do not understand spoken English must rely exclusively on pictograms. Furthermore, clinically important information may still be lost or inaccurately conveyed through a purely visual and limited audio approach. Distinctions such as "30 minutes after meals" versus "with food," "wash hands before use" as a required sequence of actions, "contraindicated during pregnancy" versus "use with caution while breastfeeding," or whether refrigeration is mandatory or merely recommended are essential for safe medication use but are not guaranteed to be communicated accurately by pictograms alone. The system lacks a teach-back or confirmation mechanism that would allow patients to verify that they have correctly understood the instructions. From a patient safety perspective, the absence of such a feedback loop represents a significant risk, particularly for individuals with limited literacy. |
| Atif Usman | Professor | The Islamia University of Bahawalpur | In second example, the prescription read not to use the eyedrops in pregnancy while the pictogram showed a pregnant woman making the patient assume it is safe to use in pregnancy. |
| Srikanth Malavalli Siddalingegwod | 조교수 | JSS College of Pharmacy | it will be a so much helpful lot of patient with disabilities and illiterate. |
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | I am assuming you are expecting the person to use this on a tablet /phone, however the user's communication aid may have a very different interface so your app may not be totally accessible to them - make sure you have checked all W3C WCAG 2.2. criteria for mobile devices https://www.w3.org/TR/wcag2mobile-22/ |
| Katarina Vučićević | Professor | University of Belgrade | Based on what I have just seen, I think that the provided information are sufficient/detailed enough so the patient can that the medicine correctly. |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | Some symbols need to be improvise to make it self explanatory. Once a day dose, I dont see the relationship by just looking at the capsule symbol with 1 dot means once a day without hearing the audio for explanation. Putting a pregnant mother symbol does not explains that it is not safe for pregnant mother to consume the meds. Perhaps you will need to add a "X" symbol somewhere in the picture |
| Namsoo Park | Professor | Hyupsung University | Differences between individuals are likely to arise from health literacy, digital literacy and variation in individual health status. |

**Places likely to be misread** (9)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Eun-Kyoung Kim | Professor | Kongju National University | The markings for 'you must do this' and 'you must not' do not seem properly distinguished. The 'must not' in particular ought to be emphasised, I think. |
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | Going deeper, an image database for every medicine would probably be needed. It is rare to be prescribed a single tablet alone, and when several medicines are prescribed the instructions for each may differ, so you may have to start from telling the medicines apart. The images clearly reflect a lot of thought, but they need to land more intuitively. The image for washing your hands before taking it, for instance, is not intuitive. A hand under a running tap would come across far better. In fact many pictograms of this kind have already been developed, so it would be good to consult and borrow from them. If the meaning is conveyed to some degree by the picture before any spoken explanation, the meaning of the prescription would come across far more easily. |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | If additional information is presented as small images inside the eye-drop bottle pictogram, the information overlaps and legibility can fall. Presenting 'eye drops' or 'tablet' early and separating details such as morning and evening use or two drops per dose from the bottle image would be clearer. |
| Celia | Professor | University of Pretoria | The picture is more aligned to people who cannot read without under estimating their intelligence |
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | I think the size of the icons with dawn, midday and sun down may be a problem so you may want to offer magnification if possible.  Also the complexity of some may require some learning which can be hard for those with lower IQ and comprehension or even audio or visual perceptual difficulties. |
| Katarina Vučićević | Professor | University of Belgrade | fridge vs at mid-day Maybe at least two colours would be beneficial to some patients - black + red (warnings), black+yellow (for day); ... |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | Yes. |
| Myoungsoon You | Professor | Seoul National University | The half picture. |
| Namsoo Park | Professor | Hyupsung University | For the black icons: when the egg allergy marking is presented in black and white only, it is hard to tell clearly that it is an egg. Icons need to be drawn as images matching the real thing. |

**What you consider to be wrong with it** (3)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Raisa Kravchenko | 부대표 | All Ukrainian NGO Coalition | The soulds are perfect. But the way the pictogram are depicted should be improved and tested with persons with intellectual disfunctions |
| Afonso Cavaco | Professor | Universidade de Lisboa | The design needs robust testing. It looks to me that interpretation errors may happen, especially in cross-cultural practice. |
| Mustapha Taibi | 번역·통역학 교수 | Western Sydney University | N/A |

**How you see the project as a whole** (3)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Raisa Kravchenko | 부대표 | All Ukrainian NGO Coalition | It is OK with problem framing and 2 ways of presentation of the medicine intake solutions. |
| Afonso Cavaco | Professor | Universidade de Lisboa | The pictograms need to be tested in the real world to ascertain their utility in patient information and medication use. |
| Mustapha Taibi | 번역·통역학 교수 | Western Sydney University | The project is likely to solve an issue for people who are unable to read healthcare information. From my perspective, it looks straightforward and effective, but feedback needs to be sought from potential users. |

**References worth consulting** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Afonso Cavaco | Professor | Universidade de Lisboa | Maybe you can consult the "International Organization for Standardization. ISO 9186-1:2014. Graphical symbols – Test methods – Part 1: Method for testing comprehensibility. Geneva: ISO; 2014." Additionally, there is a recent paper: https://pubmed.ncbi.nlm.nih.gov/37214531/. |

**How you see it as a whole, from a pharmacy standpoint** (4)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| So-Young Lee | Professor and pharmacist | Chungnam National University | It seems necessary to prevent situations where a patient discontinues medication on their own because of wrong information. For example, even a medicine that carries risk for pregnant women is sometimes prescribed after considering the patient's overall condition, and where the patient checks alone without any clinician's mediation, they may end up not receiving the drug therapy. |
| Srikanth Malavalli Siddalingegwod | 조교수 | JSS College of Pharmacy | Moreover, it will help to achieve proper medication adherence and to get desired therapeutic outcome |
| Katarina Vučićević | Professor | University of Belgrade | I believe that the information from App should pass pharmacist during dispensing to ensure that patients do not receive conflicting information. |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | The symbols need to be self explanatory even can be use for the deaf and to minimise potential risk for being misinterpreted. Perhaps your team can check out the symbols used from other sources as well. e.g : https://www.sciencedirect.com/science/article/pii/S2213398425002040 Tumkur, A., Ingle, P., Ning, Q. L. S., Bustamin, N. A., Heng, T. K., Leen, C. T., & Hatware, K. (2025). Evaluation of designed pharmaceutical pictograms among the Malaysian population. Clinical Epidemiology and Global Health, 34, 102115. |

**Why pharmacist review is needed** (3)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| So-Young Lee | Professor and pharmacist | Chungnam National University | There could also be cases of drug therapy being stopped because unnecessary information was given to the patient. |
| Atif Usman | Professor | The Islamia University of Bahawalpur | Because the instructions have to be standardized/ validated for public use. |
| Katarina Vučićević | Professor | University of Belgrade | The pharmacist is the last healthcare professional to interact with the patient before the medication reaches their hands and therefore has a crucial responsibility to ensure that appropriate and consistent information is provided |

**How this is handled in practice today** (7)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Hwi-Yeol Yun | Professor | Chungnam National University College of Pharmacy | Among Koreans the rate of not being able to read is close to zero, so it is mainly foreign patients. We therefore explain in English. |
| Niken Nur Widyakusuma | PhD, pharmacist | Universitas Gadjah Mada | Simplify the regimen. Embed something that can be feel by patient with visual impairment, such as  tearing the packages a bit. |
| Samirah Abdu-Aguye | Professor | Ahmadu Bello University, Zaria | Carefully explain to the patient, and have them repeat after me. Also talk to some other relative/caregiver of the patient |
| Atif Usman | Professor | The Islamia University of Bahawalpur | The patient is thoroughly explained/ counselled about the medication. However, it is only the dose that is written on the label which the patient can refer to when taking the medication. |
| Katarina Vučićević | Professor | University of Belgrade | Explain verbally, and ensure the patient understands how to use it correctly. |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | Draw pictures. Show them pictures from internet at dispensing counter |
| 이한길 | Professor | 이화여대 | Apart from patients with obvious visual impairment, there are cases where it is hard to tell straight away whether someone can read. Being totally blind and therefore unable to see text, having low vision, and having low literacy have to be distinguished. I think pictograms can help in the low-literacy case. |

**What must not be wrong medically** (4)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Niken Nur Widyakusuma | PhD, pharmacist | Universitas Gadjah Mada | To tell the medicines apart (when a patient receive many medicines at the same time). It still hard for the patients to tell which medicine is 3 times a day, which medicine should be stopped when symptoms gone, etc |
| Atif Usman | Professor | The Islamia University of Bahawalpur | Plenty of things. In first example, the amoxicillin capsule is given in three times a day. First pictogram is although correct, but does not depict that patient has to take ONLY ONE capsule three times daily. It is followed by three separate pictograms depicting morning, evening and night. Such confusions shall be dealt beforehand. Similarly, drug disease interactions are also missing. And etc... |
| Katarina Vučićević | Professor | University of Belgrade | Interactions with other medicines/OTC/dietary supplements/health-care condition that may be clinically significant. |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | The symbol do not show what it means. For me it means I do not need to finish the course as your black dots did not complete the fully. you may want to add a arrow symbol for direction so that its clearer? |

**What must not be conveyed by picture and speech alone** (5)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Niken Nur Widyakusuma | PhD, pharmacist | Universitas Gadjah Mada | Instead of 3 times a day, better to say every 8 hours |
| So-Young Lee | Professor and pharmacist | Chungnam National University | For drug interactions too, even where the dose of the co-administered drug has been reduced in consideration of it, or the prescription has already been adjusted, seeing such a warning may lead the patient to stop the therapy on their own. In clinical situations a drug is sometimes used for the patient's treatment in full knowledge of an interaction. |
| Atif Usman | Professor | The Islamia University of Bahawalpur | Except first, actually all of the above because the pictograms can be used as a reference by the patient at home to recall the message that was given by the pharmacist. |
| Katarina Vučićević | Professor | University of Belgrade | Instruction to contact MD or pharmacist. |
| 이한길 | Professor | 이화여대 | It is compound content, too much to explain by picture alone. Only one option could be selected so I chose contraindications, but side effects and cases needing dose adjustment are also places where a pharmacist's explanation is needed beyond the picture and the audio. |

**References worth consulting (pharmacy)** (4)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Hwi-Yeol Yun | Professor | Chungnam National University College of Pharmacy | https://health.kr/mediCounsel/pictogram.asp — pictogram information for pharmacists worldwide can be found here. |
| Atif Usman | Professor | The Islamia University of Bahawalpur | Yes, USP pictograms. |
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | Tumkur, A., Ingle, P., Ning, Q. L. S., Bustamin, N. A., Heng, T. K., Leen, C. T., & Hatware, K. (2025). Evaluation of designed pharmaceutical pictograms among the Malaysian population. Clinical Epidemiology and Global Health, 34, 102115. |
| 이한길 | Professor | 이화여대 | Yakhak Hoeji, a comparative analysis of domestic and international guidelines for braille labelling on medicines; and the Ministry of Food and Drug Safety guideline on braille and voice/sign-language conversion codes for medicines and quasi-drugs. |

**Whether it can fit the pharmacy workflow** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Sheron Sir Loon Goh | 약학 전임강사 | Dept. of Clinical Pharmacy and Pharmacy Practice | however, please get professional advice especially from your local pharmacists on the appropriateness of the symbols in local contexts before you launch your apps |
| 이한길 | Professor | 이화여대 | The accuracy of the app has to be secured before its convenience for it to be usable in practice, and I think it should be used as an auxiliary tool for the pharmacist. |

**Whether it can change health outcomes** (5)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Celia | Professor | University of Pretoria | This will only work for typed text |
| Foued Maaoui | Researcher | Pasteur Institute of Tunis | The project currently includes a well-defined problem diagnosis, a privacy-preserving technical architecture, a scalable pictogram composition method, and a rewritten speech system that provides conceptually richer communication than conventional text-to-speech approaches. However, many essential components are still missing before it can be considered an evidence-based public health intervention. In particular, the system has not yet demonstrated measured comprehension, quantified error rates, performance in real prescription settings, cultural validation, multilingual clinical accuracy, clearly defined safety boundaries, or any evidence of improving medication adherence or clinical outcomes. A major priority is the cultural, visual, and cognitive validation of the 78-morpheme pictogram set. This validation should involve testing across diverse populations differing in age, educational level, cultural background, and visual abilities to ensure broad interpretability. It is also necessary to verify that abstract pictograms, such as those representing treatment completion, alcohol consumption, or pregnancy, are consistently understood as intended and do not generate potentially harmful misunderstandings. Furthermore, accessibility must be evaluated for individuals with colour blindness, low vision, and cognitive impairments. Such validation is particularly important because pictograms that perform well among young, highly educated participants in Korea may not be equally effective or intuitive for the populations that stand to benefit most from this technology. |
| Minsun Song | Professor | Konyang University | For older people with many chronic conditions, health outcomes can change if adherence improves. |
| Namsoo Park | Professor | Hyupsung University | The conditions need to be met from a digital-literacy standpoint. How well people who cannot read understand and use mobile and digital devices has to be examined in advance, and with that in mind the app has to be built so that instructions are conveyed by speech or picture as simply as possible. (There is an instruction reading "select any that apply to you", for instance; if that instruction cannot be read, how is the app to be used well?) A good deal of the time people also fail to understand because the wording of medication instructions is difficult. Instructions conveyed by picture or recording will likewise have to be reconstructed in the plainest possible terms while still covering the medical meaning. Examining, from the same standpoint, whether vulnerable groups such as blind and deaf users can use it without difficulty would give a better project outcome. |
| Aliya Naheed | 수석연구원 | icddr,b | Affordability of the patient to purchase the medicines as per prescription for the full course. |

**How the effect should be measured** (4)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Sung-il Cho | Professor | Seoul National University | All of 1, 2 and 3 above are possible. |
| Celia | Professor | University of Pretoria | I suggest two instruments should be used the medication adherence and the K-HLAT-*, HLS Family |
| Foued Maaoui | Researcher | Pasteur Institute of Tunis | Yes, counting dosing errors is the right method, but only under certain conditions. Testing must be done with people who truly have low or no literacy, not with educated volunteers. A pre-defined scoring rubric is required, with blinded raters, and the pictograms alone, the speech alone, and both together must be tested separately. The prescriptions used must be realistic, not just the clean demo examples. Even a low error rate only shows that the information is understood in the moment; it does not prove that the patient will take the medicine correctly over time or that health outcomes will improve. The language of the speech synthesis must match the participant’s language, otherwise the audio channel is effectively unusable. |
| Namsoo Park | Professor | Hyupsung University | I answered health literacy, but since the purpose of this app is for a patient who cannot read to understand the medication instruction properly, what needs measuring is user satisfaction, users' perception of continued use, and the degree of improvement in convenience. An e-health literacy instrument looks like a tool to be used in advance, at the development stage. |

**Where it fails first for an older patient living alone** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Celia | Professor | University of Pretoria | The app should be introduced and facilitated by human contact first with older adults - i am also feeling if could be used for people who cannot see so well |
| Namsoo Park | Professor | Hyupsung University | Only one answer is allowed, but I think operating the screen, managing the device and trust in the app (given the characteristics of older people) can all be causes. |

**Whether causation can be claimed** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Celia | Professor | University of Pretoria | No |

**Whether you have seen patients missing medication information** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Celia | Professor | University of Pretoria | I am not convinced anybody actually gets proper medication information |
| Namsoo Park | Professor | Hyupsung University | I have not had many such occasions, but there are also many people who, even knowing how to read, are not receiving proper medication guidance. |

**References worth consulting (nursing and public health)** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Celia | Professor | University of Pretoria | Not that i know off |
| Minsun Song | Professor | Konyang University | Consult research on literacy among older adults and on medication adherence in older adults. I would particularly suggest designing with a focus on who exactly the non-reading target group is to be. |

**Whether to design for the patient or the carer** (4)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Celia | Professor | University of Pretoria | Although i do not feel  separate designs will be required |
| Foued Maaoui | Researcher | Pasteur Institute of Tunis | The original assumption that the patient will use the app alone does not match common practice, especially among older adults, people with low literacy, cognitive impairment, or complex regimens. In those situations a carer (family member or paid helper) frequently handles the medicines. Designing solely for the patient therefore risks low real-world use. Designing solely for the carer, however, can sideline the patient and reduce their understanding and agency. The practical solution is to support both pathways: a direct patient mode that remains as simple and accessible as possible, and a distinct carer mode that allows the helper to capture the prescription, generate the pictograms and speech, and then share or explain the output with the patient. Without that dual approach the tool will miss a large part of the population it aims to help. |
| Minsun Song | Professor | Konyang University | It should be built so that the patient and the carer can both understand it at the same time. |
| Namsoo Park | Professor | Hyupsung University | It may differ according to the age of the app's main target user and the patient's condition. |

**What to resolve first, from an HCI standpoint** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | An earlier question asked how often one has seen prescriptions for people who genuinely cannot read; taken together with the answer 'almost never', it appears that validation with such people has not been carried out. Validation with real users seems essential, because however much research is done from the user's position, unless you experience the difficulty yourself there are bound to be things omitted or missed. Illiterate people may not be common around you, but you could readily find validation subjects among blind people or people of another nationality (a foreigner receiving a Korean-language prescription, or a Korean receiving one in a foreign language). To add something slightly preachy about that earlier question: you said the question of how many prescriptions for people who cannot read one has seen connects to the premise of the experiment, and most people will probably answer almost none. I hope you will not therefore conclude that this project means little. If even one person can take their medicine properly because of this project, that is a large change for that person, and development for the socially vulnerable fundamentally cannot be explained by the logic of majority benefit. |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | At present this looks like a draft-presentation stage with user evaluation not yet carried out, but usability evaluation can be reflected throughout the development process and can contribute to the effectiveness of the result. |

**What a small sample can establish** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | I do not know how small "small" is here, but if the size makes it hard to attach meaning, it matters to make the sample as even as possible across factors such as age, level of schooling and sex. Participants should have no prior knowledge of the pictograms in question, and the survey should proceed either by having them choose the pictogram from a description or by having them describe the meaning of the pictogram (in which case multiple choice looks meaningless). |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | Prior work such as Nielsen and Landauer (1993) provides grounds that the validity of usability-evaluation results can be secured with a small sample of around 15. A small-sample evaluation also has the advantage over a large survey of allowing user behaviour and reactions to be grasped in detail, so running behavioural analysis during the actual evaluation alongside the survey responses would raise the validity of the findings. |

**Whether machine pre-screening is justified** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | For pre-screening rather than as a final conclusion, I think it can be used freely. Since it will ultimately be used with people, all that is needed is the resolve to discard the pre-screening result if testing with actual people shows it does not apply. |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | If, in the process of screening information with a vision-language model, the researcher sets and understands the screening criteria clearly and those criteria can be shown valid on theoretical grounds, procedural justification can be secured. |

**How many elements in one image before it breaks down** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | Since these are pictograms for medicines, accurate conveyance of meaning is ultimately what matters most. The more elements, the more information can be held, but where the person interpreting is illiterate, blind or foreign, their interpretive capacity cannot be assumed high. Even for information that could ordinarily be explained at once, it would be good to consider splitting the elements and explaining across two or three pictograms. |

**Where a first run gets stuck** (2)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Yonghan Lee | Senior Manager | Korea Craft and Design Foundation | The question is a little hard to answer, in that someone seeking out this app probably comes to it already knowing roughly how it works. If so, a procedure of this length should be perfectly possible with the pictures and spoken explanation alongside. |
| Myojung Choi | Researcher | Korea Disabled People's Development Institute | A user who has difficulty reading may struggle with the subsequent steps if spoken guidance is not provided at the initial permission stage, and their actions may be constrained as a result. |

**How you see it from an adult-literacy standpoint** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Eun-Kyoung Kim | Professor | Kongju National University | Given that the target group is older people, the design needs to be more concrete and should make active use of images they routinely see. Even to me, in my forties, it was hard to grasp at once what the images were saying. I would expect older people unfamiliar with images of this kind to find it harder still. |

**What learners do at present** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Eun-Kyoung Kim | Professor | Kongju National University | This is second-hand. The person concerned relies on the explanation of the pharmacist or of the family member who collected the medicine. |

**Whether it could be trialled in class** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Eun-Kyoung Kim | Professor | Kongju National University | You have to communicate with the institution (and the literacy teacher) first and explain the purpose, the intent and the benefit from the learners' point of view. With their cooperation you could use part of a class period to explain it to learners directly and hear what needs changing. |

**References worth consulting (adult literacy)** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Eun-Kyoung Kim | Professor | Kongju National University | There are adult literacy materials produced by the Ministry of Education. It would also be worth meeting people such as Principal Youngdo Park of Suwon Jeil Lifelong School, who has devoted his life to literacy education and is still active. |

**Whether it reduces the motivation to learn to read** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Eun-Kyoung Kim | Professor | Kongju National University | The motivation to learn to read is more than simply acquiring a skill. I therefore do not think a tool like this would reduce the motivation to learn. |

**How you see it as a whole, from an AAC standpoint** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | I think there are so many variables involved - many AAC users also have visual difficulties and 'scanning' can make access to all the icons difficult so actually reaching the audio buttons may not be easy. |

**Whether a combinatorial grammar holds up** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | See above and also the black and white symbols are different compared to the coloured ones |

**Which morphemes will fail** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | I cannot go back in this survey  to look at the black and white symbols so I would say the astract symbols. - you need to have a link to the morphemes as a reminder! |

**How to test it with AAC users** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | Offer the AAC user a trial as long as they appear capable and willing to take part.  The problem is that you will never know the level at which failure occurs as again too many variables.  It may be an off day, you may offer too many symbols, the person tires easily or they cannot demonstrate their understanding in the way you are presenting the options and gesture and facial expression may show you they understand, but they cannot access the app - think physical difficulties such as athetoid cerebral palsy and switch access where you scan across and down a grid or app. |

**Whether you have seen users of this kind** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | I have in the past met people who miss medication information through lack of literacy skills but they are not necessarily AAC users so this app could help those who have severe dyslexia or have never learnt to read or require the perscription to be auto translated and the audio in their language of choice. |

**References worth consulting (AAC)** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | There are many studies about the need for symbol transparency, but once again it will depend on the user as to which symbol set best suits their needs so perferences will vary hugely. Cultural settings and availability of suitable symbols for this type of interactive app will also need to be considered. |

**Whether learning is required** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| E. A. Draffan | Retired speech and language therapist · visiting accessibility researcher | Global Symbols · Univ. of Southampton | Again that depends on the user and their ability to learnt just the symbols or to listen to the audio, but generally being able to navigate the app's features which seemed quite complex. |

**What to resolve first, from an industry standpoint** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Cheolhyeon Park | Team Leader | VOICEYE | If commercialisation is planned, the level of finish needs raising, and beyond that policy, recognition, a proposal to bodies such as the Korean Pharmaceutical Association, whether they would accept it and the price all need settling. |

**Where users drop off** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Cheolhyeon Park | Team Leader | VOICEYE | From a blind user's standpoint, accessibility and convenience are lacking, and there is no particular app or guideline. |

**Conditions for diffusion** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Cheolhyeon Park | Team Leader | VOICEYE | However good a product or piece of software is, without recognition at the client or operator level there is no diffusion. Good development and a good idea need a good sales or proposal partner alongside. |

**A sustainable form of operation** (1)

| Respondent | Position | Affiliation | Response |
|---|---|---|---|
| Cheolhyeon Park | Team Leader | VOICEYE | An operating body and a partnership are essential, though if there is certainty about capital or investment, preparing it as a startup is one direction and one option. |

### 5.12 Appendix. Every multiple-choice response

For the same reason as the free text, every multiple-choice answer is set down as well. The denominator is the number of people who received that question, and since the questions differ by segment the denominator differs from question to question.

**Main field**

| Option | Responses | Share |
|---|---|---|
| Pharmacy / medication counselling | 12 | 34% |
| Other | 9 | 26% |
| Nursing / public health | 9 | 26% |
| HCI / design | 2 | 6% |
| Adult literacy education | 1 | 3% |
| Industry practitioner (building / operating products) | 1 | 3% |
| AAC / special education | 1 | 3% |

**How often you meet someone who cannot read a written medication instruction**

| Option | Responses | Share |
|---|---|---|
| Almost never | 15 | 43% |
| A few times a year | 15 | 43% |
| Almost daily | 4 | 11% |
| About monthly | 1 | 3% |

**Does this approach hold up from an adult-literacy standpoint**

| Option | Responses | Share |
|---|---|---|
| Yes — but the form would have to change | 1 | 100% |

**Could a patient take their medicine correctly, alone, with only these screens**

| Option | Responses | Share |
|---|---|---|
| Partly — some of it, not all | 17 | 68% |
| Yes, probably | 7 | 28% |
| I have no basis to judge | 1 | 4% |

**How learners handle medication information at present**

| Option | Responses | Share |
|---|---|---|
| This is second-hand. The person concerned relies on the explanation of the pharmacist or of the family member who collected the medicine. | 1 | 100% |

**Could it be trialled in class**

| Option | Responses | Share |
|---|---|---|
| As part of a class session | 1 | 100% |

**Does it conflict with the motivation to learn to read**

| Option | Responses | Share |
|---|---|---|
| No — it helps, if anything | 1 | 100% |

**What to resolve first, from an HCI standpoint**

| Option | Responses | Share |
|---|---|---|
| That there is no validation with users | 2 | 100% |

**What should be measured with a small sample**

| Option | Responses | Share |
|---|---|---|
| Multiple-choice matching | 1 | 50% |
| Observing what they actually do | 1 | 50% |

**Is machine pre-screening justified**

| Option | Responses | Share |
|---|---|---|
| Defensible with conditions | 2 | 100% |

**What breaks as elements accumulate in one image**

| Option | Responses | Share |
|---|---|---|
| It stops being clear which element carries the main meaning | 2 | 100% |

**Where a first run gets stuck**

| Option | Responses | Share |
|---|---|---|
| They do not get stuck | 1 | 50% |
| Granting camera permission | 1 | 50% |

**Is pharmacist review needed**

| Option | Responses | Share |
|---|---|---|
| Yes, every time | 9 | 75% |
| Once at the start is enough | 3 | 25% |

**What must not be wrong medically**

| Option | Responses | Share |
|---|---|---|
| Dose and frequency | 7 | 58% |
| Contraindications and interactions | 3 | 25% |
| Route of administration — oral, rectal, topical, inhaled | 1 | 8% |
| Do not stop early — finishing an antibiotic course | 1 | 8% |

**Can it fit the pharmacy workflow**

| Option | Responses | Share |
|---|---|---|
| Yes, while dispensing | 8 | 67% |
| No — there is no time | 1 | 8% |
| A non-pharmacist staff member could help | 1 | 8% |
| It should happen outside the pharmacy | 1 | 8% |
| Hard to say | 1 | 8% |

**Instrument for measuring the effect**

| Option | Responses | Share |
|---|---|---|
| A medication-adherence instrument | 6 | 67% |
| Count actual dosing errors directly | 1 | 11% |
| None of the existing instruments fit | 1 | 11% |
| A health-literacy instrument (K-HLAT-8, HLS family) | 1 | 11% |

**Where it fails first for an older patient living alone**

| Option | Responses | Share |
|---|---|---|
| They cannot keep the device going — charging, loss | 4 | 44% |
| They cannot operate the screen | 4 | 44% |
| They do not trust the app | 1 | 11% |

**Have you seen patients missing medication information**

| Option | Responses | Share |
|---|---|---|
| Partly | 5 | 56% |
| Yes | 3 | 33% |
| No | 1 | 11% |

**Can it change actual health outcomes**

| Option | Responses | Share |
|---|---|---|
| It could, if certain conditions are met | 8 | 89% |
| Taking behaviour might change, but not outcomes | 1 | 11% |

**Who should it be designed for**

| Option | Responses | Share |
|---|---|---|
| Both, with separate designs | 6 | 67% |
| The patient themselves | 1 | 11% |
| Hard to say | 1 | 11% |
| The carer | 1 | 11% |

**What to resolve first, from an industry standpoint**

| Option | Responses | Share |
|---|---|---|
| A route to the people who would use it | 1 | 100% |

**Where users drop off**

| Option | Responses | Share |
|---|---|---|
| Users stop after a few days | 1 | 100% |

**in1_breaks__why**

| Option | Responses | Share |
|---|---|---|
| From a blind user's standpoint, accessibility and convenience are lacking, and there is no particular app or guideline. | 1 | 100% |

**A sustainable form of operation**

| Option | Responses | Share |
|---|---|---|
| Something else | 1 | 100% |

**Looking at the whole, what to resolve first**

| Option | Responses | Share |
|---|---|---|
| That there is no validation with people | 2 | 67% |
| A route to the people who would use it | 1 | 33% |

**nu3_causal**

| Option | Responses | Share |
|---|---|---|
| No | 1 | 100% |

**How you see it as a whole, from an AAC standpoint**

| Option | Responses | Share |
|---|---|---|
| Mostly, but parts of it do not | 1 | 100% |

**Does a combinatorial grammar hold up**

| Option | Responses | Share |
|---|---|---|
| It holds up with conditions | 1 | 100% |

**How to test it with AAC users**

| Option | Responses | Share |
|---|---|---|
| Have them choose from options | 1 | 100% |

**Which morphemes will fail**

| Option | Responses | Share |
|---|---|---|
| Abstract concepts such as empty stomach or interaction | 1 | 100% |

**Have you seen users of this kind**

| Option | Responses | Share |
|---|---|---|
| Yes | 1 | 100% |

**Is learning required**

| Option | Responses | Share |
|---|---|---|
| It holds for some categories only | 1 | 100% |

<!-- 부록 끝 -->

"""한국어 자유 서술의 영어 번역.

부록은 받은 것을 그대로 싣는 자리다. 그런데 영어판 독자는 한국어를
읽지 못하므로, 영어판에서만 이 번역으로 갈아 끼우고 원문은 한글판에
그대로 남긴다. 사전에 없는 응답은 원문이 그대로 나가므로, 번역을
빠뜨리면 영어판에서 눈에 띈다.

    survey_appendix.py 가 SNAPCARE_LANG=en 일 때만 쓴다.
"""

TRANSLATION = {
    '시스템을 보거나 사용한 적이 없음.(메일에 시스템이 없음)':
        'I have neither seen nor used the system. (There is no system in the email.)',

    '대신할 수 있을 지 판단할 근거 자료(스냅케어의 작동화면이라든지)가 전무하여 판단할 수 없음':
        'There is no material at all to judge from \u2014 no working screens of SnapCare, '
        'for instance \u2014 so I cannot judge.',

    '한국의 경우 한글을 이해하지 못할 정도로 문해력이 낮은 성인이 그렇게 많지 않을 듯 합니다.':
        'In Korea I do not think there are many adults whose literacy is low enough that '
        'they cannot understand Hangul.',

    '명백한 시각장애가 있는 환자를 제외하고 글을 읽지 못하는 여부를 바로 알기 어려운 경우도 있음 전맹이라 글을 보지 못하는 경우와 저시력자, 문해력이 부족한 경우는 구분되어야 함. 픽토그램은 문해력이 부족한 경우에 도움이 될 수 있다고 생각됨.':
        'Apart from patients with obvious visual impairment, there are cases where it is '
        'hard to tell straight away whether someone can read. Being totally blind and '
        'therefore unable to see text, having low vision, and having low literacy have to '
        'be distinguished. I think pictograms can help in the low-literacy case.',

    '그림으로만 설명하기에는 복합적인 내용임 보기를 하나만 선택할 수 있도록 되어 있어서 병용금기를 선택하였으나, 부작용, 용량 조절 필요한 경우도 그림, 음성 외에 약사 설명이 필요한 부분으로 생각됨':
        'It is compound content, too much to explain by picture alone. Only one option '
        'could be selected so I chose contraindications, but side effects and cases '
        'needing dose adjustment are also places where a pharmacist\'s explanation is '
        'needed beyond the picture and the audio.',

    '약학회지, 의약품 점자 표시 국내외 가이드라인의 비교분석 연구 식약처, 의약품(의약외품) 점자 및 음성･수어영상변환용 코드 표시 가이드라인':
        'Yakhak Hoeji, a comparative analysis of domestic and international guidelines '
        'for braille labelling on medicines; and the Ministry of Food and Drug Safety '
        'guideline on braille and voice/sign-language conversion codes for medicines and '
        'quasi-drugs.',

    '앱의 편리성 보다 앱의 정확성이 먼저 담보되어야 현실에서 활용할 수 있으며, 약사의 보조적 도구로서 활용되어야 할 것으로 생각함.':
        'The accuracy of the app has to be secured before its convenience for it to be '
        'usable in practice, and I think it should be used as an auxiliary tool for the '
        'pharmacist.',

    '- 픽토그램에 정의되어 있는 "단어"의 수가 78개인데 재조합을 한다고 해도 매우 많은 다양한 약의 종류와 복용법 등을 모두 포괄할 수 있을까요? - 음성과 함께 들으면 픽토그램을 이해하는데 도움이 되지만 다소 직관적이지 않은 것들도 있어 보입니다. - 부정적인 지시어가 있을 경우 픽토그램에도 "/" 또는 "X"와 같은 표시가 같이 있으면 좋겠습니다(일부는 그렇지만 알콜, 임산부 등의 경우에는 없음). - 푸시 알람 등과 연계되어 복약 시간을 알려주고 읽어주면 더 큰 도움이 될듯 합니다. - Supertonice TTS를 사용하시면 다국어 확장이 용이할 것으로 보입니다(https://huggingface.co/spaces/Supertone/supertonic-3).':
        '- The pictograms define 78 "words"; even with recombination, can they really cover the very wide range of medicines and regimens? - Hearing the audio alongside helps with understanding the pictograms, but some of them look less than intuitive. - Where the instruction is negative, it would be good for the pictogram to carry a "/" or "X" as well (some do, but alcohol, pregnancy and so on do not). - Linking it to push notifications so that dosing times are announced and read aloud would help a great deal more. - Using Supertonic TTS would make multilingual expansion easy (https://huggingface.co/spaces/Supertone/supertonic-3).',

    '1. 국내 처방전에는 바코드가 찍히고 있고, 바코드만 읽히면 되는데 전체를 스캔하는 것은 비효율 적입니다. 2. 이미 바코드를 인식하여 장애인에게 안내 가능한 앱이 있습니다. 3. 복약지도는 약사와 원내처방시 의사의 의무로 관련 솔루션들이 이미 많습니다. 4. 글을 읽지 못하는 사람을 대상으로 비지니스 모델을 만들기에는 투자대비 시장이 너무 작습니다. 5. 이미 전자처방전이 준비되고 있습니다. 전자화 될시 무용지물 입니다.':
        '1. Korean prescriptions carry a barcode, and only the barcode needs reading, so scanning the whole sheet is inefficient. 2. Apps that read the barcode and can guide people with disabilities already exist. 3. Medication counselling is the duty of the pharmacist, and of the doctor for in-hospital prescribing, and there are already many solutions for it. 4. For a business model aimed at people who cannot read, the market is too small relative to the investment. 5. Electronic prescriptions are already being prepared. Once they are electronic this is useless.',

    '글을 읽지 못하는 상황에 놓인 건 노인, 어린이, 시각장애인, 저시력자 등 다양한 개개인의 사정때문입니다. 충분히 필요한 사항이며 저희원에서도 글자의 가독성 등을 위한 서체 개발 등 프로젝트를 진행한 바가 있습니다.':
        'Being in a position of not being able to read comes from a range of individual circumstances: old age, childhood, blindness, low vision. It is certainly needed, and our own institute has run projects such as typeface development for legibility.',

    '해당 내용에 대해서는 어쩌면 현직에 있는 분들보다 훨씬 더 많이 고민하고 있는 것이 지금 이 설문 만으로도 충분히 느껴지고, 그것이 또 더 나은 세상을 만들기 위한 고민과 노력이어서 응원을 보냅니다.':
        'From this survey alone it is clear that you may be thinking about this far harder than people currently in the field, and since that thinking and effort is towards making a better world, you have my support.',

    "글을 읽지 못하는 사람들이 느낄 수 있는 어려움을 도울 수 있는 실제적인 아이디어라 생각합니다. 제가 공학적 관점에서의 알고리즘을 구현하는 것은 잘 알지 못해서 기술적 측면에서 조언할 부분은 없을 것 같지만, 사용하게 될 비문해자 입장에서 느낀 점이 있어 간략히 이야기하려 합니다. 팩토그램이 직관적으로 정보를 줄 수 있는 좋은 소재이지만 비문해자에게는 이 또는 글자로 느껴질 수 있습니다. '까만것은 글자고 하얀 것은 종이'라는 말이 있듯이, 비문해자의 입장에서 인식될 수 있는 디자인과 색감 등을 고려해서 구현하면 좋을 것 같습니다. 음성으로 나오는 설명 또한 동일합니다. 잘 만들어진 기능을 비문해자가 효율적으로 활용할 수 있도록 이들의 인식수준을 고려하여 정확한 정보 안내 및 설명이 이루어지면 좋을 것 같습니다.":
        "I think this is a practical idea that can help with the difficulties people who cannot read may feel. I do not know much about implementing algorithms from an engineering standpoint so I have no technical advice, but I have some thoughts from the position of the non-literate user. Pictograms are a good medium for conveying information intuitively, but to a non-literate person these too can feel like letters. As the saying goes, 'the black is the writing and the white is the paper,' so it would be good to implement this with a design and colouring that can be perceived from a non-literate person's point of view. The same applies to the spoken explanation. It would be good if the information and explanation were accurate and pitched at their level of perception, so that a well-built function can actually be used by them.",

    '체계적으로 구성되어 있습니다. 다만, 대상자의 수준도 고려되어야 할 것 같습니다. 단순히 문해 문제인지, 나이와 정보이해 수준도 포함된 것인지에 따라 그림에 대해 완전한 이해가 될 수있을 지에 대한 점도 조금은 염려됩니다. 처방전이 단순히 안약 수준이 아니라 전문성이 더 필요한 병에 대한 처방이라면 더 고려될 필요가 있을 것 같습니다.':
        'It is systematically put together. The level of the target group ought to be considered as well, though. Whether the pictures will be fully understood depends on whether this is simply a literacy problem or also involves age and the level of information comprehension, and I am a little concerned about that. If the prescription is not merely at the level of eye drops but for a condition requiring more expertise, it would need more consideration.',

    '나라마다 상황이 다른 점을 앞으로 반영할 계획 필요':
        'A plan is needed to reflect the fact that circumstances differ by country.',

    '아이디어를 잘 발전시켜 좋은 결과물이 실제로 현장에 의미있게 활용될 수 있기를 기대합니다.':
        'I hope the idea is developed well and that the result comes to be used meaningfully in the field.',

    "앞서 상기한대로, 글을 읽지 못하는 사람에는 여러 유형이 있을텐데 사실 가장 많은 수는 '문맹'이 아닌 시각장애인일 것 같습니다. 애당초 시각장애인을 대상으로 고려했는지는 모르겠으나, 만약 이 부분도 함께 담고 싶다면 시각장애인에게는 '사진을 찍는 행위'도 장애요소가 될 수 있습니다. 시각장애인의 스마트폰 사용이 현재 불가능하진 않으니 이런 부분에 대한 연결도 고려하면 좋을 것 같습니다.":
        "As noted above, there are several types of people who cannot read, and in fact the largest group is likely to be blind people rather than the 'illiterate'. I do not know whether blind users were considered from the outset, but if you want to include them, for a blind person the very act of taking a photograph can be a barrier. Smartphone use by blind people is not impossible today, so it would be good to consider connecting to that as well.",

    '그림이 무슨 뜻인지 모르거나 잘못 해석할 수 있음':
        'They may not know what the picture means, or may interpret it wrongly.',

    '글자도 못읽고 연세도 있으신 분들이라면 음성을 듣기 위해 누르는 것도 어려워할수 있어보입니다. 이 경우 그림만으로도 무엇을 의미하는지 보일수 있게 직관적으로 그림을 좀 더 다듬으면 좋을 것 같습니다.':
        'For someone who cannot read and is also elderly, even pressing to hear the audio may be difficult. In that case it would be good to refine the pictures further so that the meaning shows from the picture alone.',

    '픽트그램과 소리를 결합한 복합 인지체계 기반의 정보 제시는 적절한 방향으로 판단됨. 다만, 하나의 픽토그램에 많은 정보가 포함될 경우 인지의 명확성이 저하될 수 있으므로, 핵심 정보를 중심으로 단순화할 필요가 있음':
        'Presenting information on a multi-channel cognitive basis, combining pictogram and sound, seems the right direction. Where one pictogram contains a lot of information, however, clarity of perception can fall, so it needs simplifying around the core information.',

    'health literacy, digital literacy, 개개인의 건강수준 편차 등으로 인해 개인간의 차이가 발생할 수 있을것 같다.':
        'Differences between individuals are likely to arise from health literacy, digital literacy and variation in individual health status.',

    "'이렇게 해야 한다'와 '안된다'는 표시가 제대로 구분되지 않는 것 같습니다. 특히, 안된다를 강조해야 하지 않을까 생각합니다.":
        "The markings for 'you must do this' and 'you must not' do not seem properly distinguished. The 'must not' in particular ought to be emphasised, I think.",

    '깊이 들어가자면 모든 약에 대한 이미지 DB도 필요할 것 같습니다. 일반적으로 알약 한 알만 처방받는 일은 드물고, 그렇다면 여러 약을 처방받았을 때 각 약에 대한 처방이 다를 수 있기 때문에, 그 약을 구분하는 것부터 시작해야 할지도 모릅니다. 또한 이미지도 많이 고민한 결과로 보이긴 하나, 더 직관적으로 다가와야 할 것 같습니다. 예를 들면 손을 닦고 먹으라는 이미지의 경우 직관적이지 않습니다. 물 나오는 수도꼭지 아래에 손이 있는 그림이 훨씬 잘 와닿을 것 같습니다. 사실 이런 픽토그램의 경우 이미 개발된 것들이 많이 있을 것이니 참고해 차용하셔도 좋을 것 같습니다. 말로 설명하기 전에 그림으로 의미가 어느 정도 전달된다면 처방의 의미도 훨씬 수월하게 전달 가능할 것 같습니다.':
        'Going deeper, an image database for every medicine would probably be needed. It is rare to be prescribed a single tablet alone, and when several medicines are prescribed the instructions for each may differ, so you may have to start from telling the medicines apart. The images clearly reflect a lot of thought, but they need to land more intuitively. The image for washing your hands before taking it, for instance, is not intuitive. A hand under a running tap would come across far better. In fact many pictograms of this kind have already been developed, so it would be good to consult and borrow from them. If the meaning is conveyed to some degree by the picture before any spoken explanation, the meaning of the prescription would come across far more easily.',

    "점안액병 픽토그램 내에 작은 이미지로 추가 정보를 제시할 경우 정보가 중첩되어 가독성이 저하될 수 있음. 따라서 ‘점안액’ 혹은 '알약'이라는 정보는 초반에 제시하고, 아침·저녁 사용 여부 및 1회 2방울 등 세부 정보는 점안액병 이미지와 분리하여 제시하는 것이 보다 명료할 것으로 판단됨":
        "If additional information is presented as small images inside the eye-drop bottle pictogram, the information overlaps and legibility can fall. Presenting 'eye drops' or 'tablet' early and separating details such as morning and evening use or two drops per dose from the bottle image would be clearer.",

    '절반의 그림': 'The half picture.',

    '검정색 아이콘의 경우 - 계란 알러지 표시할때 흑백으로만 제시되었을때는 그게 계란인지 명확하게 알기 어려움. 아이콘 구성시 실제와 동일한 이미지의 그림 필요':
        'For the black icons: when the egg allergy marking is presented in black and white only, it is hard to tell clearly that it is an egg. Icons need to be drawn as images matching the real thing.',

    '잘못된 정보로 환자가 임의로 투약을 중단하거나 하는 상황을 예방하는게 필요해보임. 예를들어 이 약물이 임산부에게 risk가 있는 약이어도, 환자의 종합적 상태를 고려해 처방되는 경우도 있는데, 다른 의료진의 중재 없이 환자 혼자 확인하게 되는 경우, 임의로 약물 치료를 받지 않는 상황이 생길 수 있을 것 같음.':
        'It seems necessary to prevent situations where a patient discontinues medication on their own because of wrong information. For example, even a medicine that carries risk for pregnant women is sometimes prescribed after considering the patient\'s overall condition, and where the patient checks alone without any clinician\'s mediation, they may end up not receiving the drug therapy.',

    '환자에게 불필요한 정보를 주어 약물치료를 중단하는 사례도 있을 수 있을 것 같음.':
        'There could also be cases of drug therapy being stopped because unnecessary information was given to the patient.',

    '한국인은 글을 읽지 못하는 비율이 거의 0에 가깝기에 주로 외국인 환자 분들이 많습니다. 그래서 영어로 설명 합니다.':
        'Among Koreans the rate of not being able to read is close to zero, so it is mainly foreign patients. We therefore explain in English.',

    '약물간 상호작용에 대해서도 이를 고려하여 병용 약물의 용량을 감소하거나 이미 처방에서 중재가 되었음에도 이러한 경고를 보면 환자가 임의로 약물치료를 중단할 가능성이 있음. 임상적 상황에서는 상호작용이 있는걸 알아도 환자 치료를 위해 쓰이는 경우도 있음.':
        'For drug interactions too, even where the dose of the co-administered drug has been reduced in consideration of it, or the prescription has already been adjusted, seeing such a warning may lead the patient to stop the therapy on their own. In clinical situations a drug is sometimes used for the patient\'s treatment in full knowledge of an interaction.',

    'https://health.kr/mediCounsel/pictogram.asp 전세계약사들을 위한 픽토그램 정보를 확인하실 수 있습니다.':
        'https://health.kr/mediCounsel/pictogram.asp — pictogram information for pharmacists worldwide can be found here.',

    '만성질환이 많은 노인대상자들이라면 복약순응도가 높아지면 건강결과는 바뀔수 있습니다.':
        'For older people with many chronic conditions, health outcomes can change if adherence improves.',

    '디지털리터러시에 대한 관점에서의 조건 충족 필요 --> 글을 읽지 못하는 분들이 모바일이나 디지털 기기에 대한 이해도, 활용도가 어느 정도 될지 사전에 검토 필요  --> 이러한 부분까지 고려해서 앱 이용시 최대한 심플하게 음성이나 그림으로 지시문을 전달하도록 구성 필요 있습니다. (예를 들어  본인에게 해당하는 것을 몇개 고르세요 라는 지시문이 있는데 이 지시문을 읽지 못하는 경우에는 이 앱을 어떻게 잘 이용할 수 있을지) 대부분 복약지시의 워딩이 어려워서 이해를 못하는 경우도 동시에 발생합니다.  그림이나 녹음으로 전달하는 복약지시사항도  의학적 의미를 포괄하면서 최대한 이해하기 쉬운 용어로 재구성되어야 할것입니다. 시각장애인, 청각장애인과 같은 취약계층그룹에서 이용하는데 불편함이 없는지에 대해서도 동일한 관점에서 검토해보면 더 좋은 프로젝트 결과물이 나올것 같습니다.':
        'The conditions need to be met from a digital-literacy standpoint. How well people who cannot read understand and use mobile and digital devices has to be examined in advance, and with that in mind the app has to be built so that instructions are conveyed by speech or picture as simply as possible. (There is an instruction reading "select any that apply to you", for instance; if that instruction cannot be read, how is the app to be used well?) A good deal of the time people also fail to understand because the wording of medication instructions is difficult. Instructions conveyed by picture or recording will likewise have to be reconstructed in the plainest possible terms while still covering the medical meaning. Examining, from the same standpoint, whether vulnerable groups such as blind and deaf users can use it without difficulty would give a better project outcome.',

    '위 1,2,3 모두 가능': 'All of 1, 2 and 3 above are possible.',

    '응답은 건강정보이해력으로 했으나  이 앱의 목적은 글을 읽지 못하는 환자가 복약지시를 제대로 이해하는 것이므로, 앱 이요자 만족도, 앱 이용자의 계속 사용에 대한 인식, 편이성 향상정도 등을 알아보는 것이 필요해 보임. e-health 문해력 도구는 앱을 개발하는 단계에서 사전에 활용되어야 하는 도구로 보임':
        'I answered health literacy, but since the purpose of this app is for a patient who cannot read to understand the medication instruction properly, what needs measuring is user satisfaction, users\' perception of continued use, and the degree of improvement in convenience. An e-health literacy instrument looks like a tool to be used in advance, at the development stage.',

    '한가지만 선택하도록 되어 있는데  화면 조작, 기기 관리, 앱의 신뢰성 (고령자 특성상) 이 원인이 될 수 있다고 생각한다.':
        'Only one answer is allowed, but I think operating the screen, managing the device and trust in the app (given the characteristics of older people) can all be causes.',

    '그런 기회는 많이 없었지만, 설령 글을 알고 있더라도,  복약정도를 제대로 받지 못하고 있는 사람들도 많다.':
        'I have not had many such occasions, but there are also many people who, even knowing how to read, are not receiving proper medication guidance.',

    '노인 문해력 관련 연구, 노인 약물 순응도 연구를 참고하십시오. 특히 글을 읽지 못하는 대상자를 주로 누구를 할 것인지 포커스하여 구상하시는 것을 제언드립니다.':
        'Consult research on literacy among older adults and on medication adherence in older adults. I would particularly suggest designing with a focus on who exactly the non-reading target group is to be.',

    '환자와 보호자가 동시에 이해할 수 있도록 구성해야 합니다.':
        'It should be built so that the patient and the carer can both understand it at the same time.',

    '앱의 주 사용자 타겟의 연령자, 환자의 상태에 따라 다를수 있음.':
        'It may differ according to the age of the app\'s main target user and the patient\'s condition.',

    "앞선 설문에서 실제로 글을 읽지 못하는 사람의 약 처방을 얼마나 봤냐고 질문했는데, 거의 없다고 대답한 부분과 연결지어 실제 그러한 사람에 대한 검증이 진행되지 않은 것으로 보입니다. 실제 사용자에 대한 검증은 반드시 필요할 것 같은데, 이게 아무리 실사용자의 입장에 서서 연구를 진행한다고 해도, 본인이 그러한 불편을 직접 겪는 것이 아닌 이상 빠트리거나 놓치는 부분이 생길 수 밖에 없습니다. 문맹인 사람은 주변에 흔치 않겠지만, 시각장애인이나 타국적자(외국인인데 한글로 된 처방전을 받을 경우 또는 한국인인데 외국어로 된 처방전을 받을 경우 등) 등의 방향으로 충분히 검증대상을 찾을 수 있을 것 같습니다. 첫줄에 상기한 앞선 질문과 관련해 조금은 꼰대처럼 첨언하자면, '실제 글을 읽지 못하는 사람의 처방을 얼마나 봤냐'는 질문이 실험의 전제와 연결된다고 했는데, 아마도 거의 없다는 사람이 대부분일 것 같습니다. 그럼에도 이 프로젝트가 의미가 작을거라고 생각하지는 않으면 좋겠습니다. 단 한명이어도 이 프로젝트를 통해 약 복용을 제대로 할 수 있다면 그 사람에게는 큰 변화인 것이고, 기본적으로 사회적 약자를 위한 개발은 다수의 이익의 논리로 설명될 수 없는 것이기 때문입니다.":
        "An earlier question asked how often one has seen prescriptions for people who genuinely cannot read; taken together with the answer 'almost never', it appears that validation with such people has not been carried out. Validation with real users seems essential, because however much research is done from the user's position, unless you experience the difficulty yourself there are bound to be things omitted or missed. Illiterate people may not be common around you, but you could readily find validation subjects among blind people or people of another nationality (a foreigner receiving a Korean-language prescription, or a Korean receiving one in a foreign language). To add something slightly preachy about that earlier question: you said the question of how many prescriptions for people who cannot read one has seen connects to the premise of the experiment, and most people will probably answer almost none. I hope you will not therefore conclude that this project means little. If even one person can take their medicine properly because of this project, that is a large change for that person, and development for the socially vulnerable fundamentally cannot be explained by the logic of majority benefit.",

    '현재는 시안 제시 단계로 사용자 평가는 아직 실시되지 않은 것으로 보이나, 사용성 평가는 개발 전 과정에 반영될 수 있으며 결과물의 실효성 제고에 기여할 수 있음':
        'At present this looks like a draft-presentation stage with user evaluation not yet carried out, but usability evaluation can be reflected throughout the development process and can contribute to the effectiveness of the result.',

    '소규모라는 것이 어느 정도인지 알 수 없으나, 규모로는 의미를 부여하기 어려운 상황이라면 연령, 학습수준, 성별 등의 여러 요소를 고려해 표본을 최대한 고르게 잡는 것이 중요할 것 같습니다. 그리고 해당 픽토그램에 대한 사전지식이 전혀 없어야 하며, 설명을 통해 해당 픽토그램을 고르는 방식, 또는 해당 픽토그램의 의미를 서술하는 방식(이 경우 객관식은 의미가 없어보임) 등으로 표본조사를 진행해야 할 것 같습니다.':
        'I do not know how small "small" is here, but if the size makes it hard to attach meaning, it matters to make the sample as even as possible across factors such as age, level of schooling and sex. Participants should have no prior knowledge of the pictograms in question, and the survey should proceed either by having them choose the pictogram from a description or by having them describe the meaning of the pictogram (in which case multiple choice looks meaningless).',

    'Nielsen과 Landauer(1993) 등 선행연구에서는 15명 내외의 소규모 표본으로도 사용성 평가 결과의 타당성을 확보할 수 있다는 근거를 제시하고 있음. 또한 소규모 표본 평가는 대규모 표본 조사에 비해 사용자 행동과 반응을 세부적으로 파악할 수 있다는 장점이 있으므로, 설문 응답과 함께 실제 평가 과정에서의 행동 분석을 병행할 경우 연구 결과의 타당성을 높일 수 있을 것으로 판단됨':
        'Prior work such as Nielsen and Landauer (1993) provides grounds that the validity of usability-evaluation results can be secured with a small sample of around 15. A small-sample evaluation also has the advantage over a large survey of allowing user behaviour and reactions to be grasped in detail, so running behavioural analysis during the actual evaluation alongside the survey responses would raise the validity of the findings.',

    '최종 결론이 아닌 사전 선별용으로는 얼마든지 활용 가능하다고 생각합니다. 다만 결국 사람에게 쓰일 예정이기에, 사전 선별의 결과가 실제 사람에게 테스트했을 때 적용할 수 없는 결론이 난다면 이를 폐기할 수 있는 결단력만 있으면 될 것 같습니다.':
        'For pre-screening rather than as a final conclusion, I think it can be used freely. Since it will ultimately be used with people, all that is needed is the resolve to discard the pre-screening result if testing with actual people shows it does not apply.',

    '시각 언어 모델을 활용한 정보 선별 과정에서 연구자가 선별 기준을 명확히 설정·인지하고 있으며, 해당 기준이 이론적 근거에 기반하여 타당성이 입증될 수 있다면, 연구 절차상 정당성을 확보할 수 있을 것으로 판단됨':
        'If, in the process of screening information with a vision-language model, the researcher sets and understands the screening criteria clearly and those criteria can be shown valid on theoretical grounds, procedural justification can be secured.',

    '약에 대한 픽토그램이기에, 결국 정확한 의미 전달이 가장 중요할 것입니다. 요소가 많아질수록 담을 수 있는 정보는 많아지겠지만, 해당 정보를 해석해야 하는 사람이 문맹, 시각장애인, 외국인 등등일 경우 그 해석의 역량이 높다고 보긴 어려울 것 같습니다. 보통이라면 한 번에 설명 가능한 정보라도, 요소를 나눠 두세개의 픽토그램으로 설명하는 방법도 고려하면 좋겠습니다.':
        'Since these are pictograms for medicines, accurate conveyance of meaning is ultimately what matters most. The more elements, the more information can be held, but where the person interpreting is illiterate, blind or foreign, their interpretive capacity cannot be assumed high. Even for information that could ordinarily be explained at once, it would be good to consider splitting the elements and explaining across two or three pictograms.',

    '질문이 좀 답하기 어려운 것이, 이 앱을 찾는 사람은 아마도 앱의 작동방식을 어느 정도 알고 찾을 것 같습니다. 만약 그렇다면 지금 이 절차 정도는 그림과 음성 설명이 동반된다면 충분히 가능할 것 같습니다.':
        'The question is a little hard to answer, in that someone seeking out this app probably comes to it already knowing roughly how it works. If so, a procedure of this length should be perfectly possible with the pictures and spoken explanation alongside.',

    '글을 읽기 어려운 사용자는 최초 권한 허용 단계에서 음성 안내가 함께 제공되지 않을 경우 이후 절차 진행에 어려움을 겪을 수 있으며, 이로 인해 행동이 제한될 가능성이 있음':
        'A user who has difficulty reading may struggle with the subsequent steps if spoken guidance is not provided at the initial permission stage, and their actions may be constrained as a result.',

    '대상자들이 고령자임을 감안할 때 디자인을 조금 더 구체화해야 하고, 그들이 평소에 주로 보는 이미지를 적극 활용해야 합니다. 40대인 제가 보기에도 이미지가 설명하는 바를 한 번에 파악하기는 어려웠습니다. 이런 이미지와 친숙하지 않은 고령자들은 더 어려울 것이라고 예상합니다.':
        'Given that the target group is older people, the design needs to be more concrete and should make active use of images they routinely see. Even to me, in my forties, it was hard to grasp at once what the images were saying. I would expect older people unfamiliar with images of this kind to find it harder still.',

    '저도 들은 얘기입니다. 당사자는 약사 혹은 약을 받아온 가족들의 설명에 의존합니다.':
        'This is second-hand. The person concerned relies on the explanation of the pharmacist or of the family member who collected the medicine.',

    '사전에 기관(그리고 문해교사)과 먼저 소통하며 목적, 취지, 학습자들 입장에서의 이점 등을 잘 설명해야 합니다. 협조가 된다면 수업 시간의 일부를 활용하여 학습자들에게 직접 설명하고 수정해야 할 의견을 들어볼 수 있을 것 같습니다.':
        'You have to communicate with the institution (and the literacy teacher) first and explain the purpose, the intent and the benefit from the learners\' point of view. With their cooperation you could use part of a class period to explain it to learners directly and hear what needs changing.',

    '교육부에서 제작한 성인문해교육 교재들이 있습니다. 수원제일평생학교 박영도 교장선생님 등을 만나봐도 좋겠습니다. 평생을 문해교육에 헌신하신 분이고, 지금도 활동 중입니다.':
        'There are adult literacy materials produced by the Ministry of Education. It would also be worth meeting people such as Principal Youngdo Park of Suwon Jeil Lifelong School, who has devoted his life to literacy education and is still active.',

    '글을 배우려는 동기는 단순히 기능을 습득하는 것 이상입니다. 따라서 이런 도구가 학습 동기를 줄일 것이라고 생각하지 않습니다.':
        'The motivation to learn to read is more than simply acquiring a skill. I therefore do not think a tool like this would reduce the motivation to learn.',

    '상용화 계획이 있다면, 완성도 향상 필요, 추가로 정책, 인지도,  한국약사협회 등 제안과 수용 가능 여부, 금액 등 설정 필요':
        'If commercialisation is planned, the level of finish needs raising, and beyond that policy, recognition, a proposal to bodies such as the Korean Pharmaceutical Association, whether they would accept it and the price all need settling.',

    '시각 장애인 입장에서의 접근성, 편리함 부족, 특정 APP이 있거나, 가이드 라인이 없음.':
        'From a blind user\'s standpoint, accessibility and convenience are lacking, and there is no particular app or guideline.',

    '아무리 좋은 제품이나 SW 라도 고객사나 실제 사용 운영자 단계에서 인지도가 없다면, 확산성이 없음. 좋은 개발,좋은 아이디어 옆엔 좋은 영업이나 제안 파트너가 필요':
        'However good a product or piece of software is, without recognition at the client or operator level there is no diffusion. Good development and a good idea need a good sales or proposal partner alongside.',

    '운영 주체, 제휴 반드시 필요, 다만 자본금이나 투자에 대한 확실성이 있다면 스타트업으로 준비하는 것도 하나의 방향이고 선택지임':
        'An operating body and a partnership are essential, though if there is certainty about capital or investment, preparing it as a startup is one direction and one option.',
}

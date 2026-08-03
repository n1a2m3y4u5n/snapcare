# 인용 대조 기록

본문의 괄호 인용을 원문과 하나씩 대조한 기록이다. 처음 대조한 것이 37종이고, 그 뒤로 조사 응답과 실측이 들어오며 39종이 되었다. 여기서 **확인** 표시가 붙은
것만 참고문헌에 올린다. 확인하지 않은 값을 완전한 서지와 함께 싣는 것은 위험하다 —
서지를 다는 목적이 심사자가 원문을 열어 보게 하는 것이므로, 값이 틀리면 축약식일
때보다 더 확실하게 드러난다.

`refs.md` 는 수집 단계의 메모이고, 이 파일이 대조 결과다. 둘이 어긋나면 이쪽이 맞다.

## 진행

**37종 전부 대조 완료. 12종이 틀렸다** (오류율 32%).

이후 전문(全文)을 다시 읽으며 서지가 이름뿐이던 세 자리를 처리했다 — IVR 연구와
WHO 영양 권고는 원문을 찾아 채웠고, 저널명·설명만 있던 둘은 뺐다. 뺀 쪽은 그 문장이
없어도 §1.8 의 표 4 가 같은 말을 하고 있었다.

확인한 것은 본문 괄호 안에 **전체 서지로 적었다.** 서식에 참고문헌 자리가 없으므로
서지가 갈 곳이 본문밖에 없다. 한동안은 첫 등장만 전체로 하고 이후는 저자·연도로 두었으나, 지금은 나오는 자리마다
전체로 적는다. 저자와 연도만 적으면 읽는 사람이 앞으로 되돌아가야 무엇인지 알기
때문이다. `check_docs.py` 가 이름과 해만 적힌 인용을 걸러 낸다.

## 발견한 오류와 조치

| 본문에 있던 것 | 원문 | 조치 |
|---|---|---|
| 필리핀 연구 — ISO 67% 통과 45.8%, ANSI 85% 통과 8.3% | 108종 중 17종(15.74%)이 ANSI 85% 통과. **ISO 67% 기준은 논문에 없다.** 45.8%·8.3%·67% 어느 숫자도 본문에 없다 | 실제 값으로 교체, ISO 열 삭제 (본문 5곳) |
| 성인 문해율 2014년 85% → 2024년 88% | 2015년 86% → 2024년 88% | 교체 |
| 남아시아 비문해 성인 3억 3,700만 명 | 중앙·남아시아 3억 4,700만 명 | 교체 |
| 심각 위해 가능 오류 중 용량 30.7% · 시각 17.1% · 중복 14.4% | 수집 메모의 출처가 "사건보고 분석" 뿐이고 원문을 찾지 못했다 | 표 2 와 도표에서 해당 열 삭제 |
| Dowse 등 (2012) — 9종 중 3종 ISO 통과 | 2023년 논문이 이를 **미출판 학부 자료**라고 밝히고 있다. 인용할 수 없다 | 같은 연구진의 2023년 출판본(10종 중 8종)으로 교체 |
| Berkman — 응급실 1.52배, 입원 1.5배, 전체 사망률 1.53배 | 초록에 **배수가 없다.** 연관을 서술로만 보고하며, 사망률은 "고령자에서" 로 한정한다 | 배수를 빼고 원문의 서술로 대체 |
| IDF Diabetes Atlas 11판 (2024) | 11판은 **2025년** 판이다 | 연도 교체 |
| 한국 19~64세 충분 65.9% | 확인되지 않는다. 확인되는 것은 전체 60.4%, 65세 이상 40.3%, 소득 하위 54.4%, 상위 66.3% | 확인된 값으로 표 재구성 |
| 2030년 60세 이상의 80%가 저·중소득국 | WHO 팩트시트에 80% 는 없다. **2050년에 3분의 2** 다. 원문은 2050년 21억 명, 2015→2050년 비중 12%→22% 도 준다 | 연도와 값 교체 |
| 항생제 내성 사망이 HIV·말라리아를 넘어섰다 (WHO GLASS, 2025) | 이 비교는 GLASS 가 아니라 GRAM 연구(Murray 등, *Lancet* 2022)의 결과다. 2019년 직접 기인 사망 127만 명 | 출처 교체 |
| 몰도바 인구 대상 연구에서 건강 문해력이 1차 의료 접근을 결정 (PMC7532569) | 대상이 몰도바 거주자가 아니라 **이탈리아 파도바에 사는 몰도바 이주 여성 170명** 이다 | 대상을 명시하고, 국내 인구에 옮길 수 없다는 것을 적음 |
| 사진 추정 평균 오차 14.43% (NutritionVerse-Direct) | 그 논문에 **퍼센트 오차 지표가 없다.** 절대 오차만 싣는다 — 열량 253.7 kcal, 지방 14.3 **g**. 14.3 g 을 퍼센트로 옮겨 적은 것으로 보인다 | 절대 오차로 교체하고, 그것이 하루 기준의 몇 %인지 따로 계산해 붙임 |

45.8%·8.3% 가 다른 논문의 값인지는 아직 찾지 못했다. 찾으면 그 논문을 근거로 되살릴
수 있으나, 그때까지는 본문에서 뺀다.

없앤 값을 그냥 지우지 않고 다른 근거로 갈아 끼울 수 있었던 것이 둘 있다. 표 2 는
분모를 "약사가 발견한 조제 오류 155건" 으로 명시해 남은 세 값만으로 세웠고, 표 4 는
미출판 자료 대신 출판된 2023년 연구를 넣으면서 오히려 논지가 하나 늘었다 — 통과율이
가장 높은 것은 **현지에서 만들어 현지 사람에게 시험한** 세트라는 것이다.

## 확인한 것

### 문해력

**[L1]** UNESCO (2025). *Youth and Adult Literacy: International Literacy Day 2025
Factsheet.* UNESCO. · 2024년 기준 비문해 성인 739M, 그중 여성 466M(약 2/3). 성인
문해율 2015년 86% → 2024년 88%. 사하라이남 아프리카는 65% → 69% 로 올랐으나 절대수는
196M → 225M 로 증가. 중앙·남아시아 347M. 상위 10개국에 441M 집중.

### 건강 문해력

**[H1]** The HLS19 Consortium of the WHO Action Network M-POHL (2021). *International
Report on the Methodology, Results, and Recommendations of the European Health Literacy
Population Survey 2019–2021 (HLS19).* Austrian National Public Health Institute, Vienna.
· 17개국 42,445명, 2019년 11월–2021년 6월. 일반 건강문해력을 excellent·sufficient·
problematic·inadequate 네 수준으로 구분. **주의: 보고서는 자료 수집 시기와 방법이
국가마다 달라 국가 간 비교를 신중히 하라고 명시하며, 17개국 통합 백분율을 대표값으로
내세우지 않는다.** 본문의 "46%" 는 이 보고서에서 직접 확인되지 않았다 — 미확인으로
남긴다.

**[H2]** Berkman, N. D., Sheridan, S. L., Donahue, K. E., Halpern, D. J., & Crotty, K.
(2011). Low health literacy and health outcomes: an updated systematic review. *Annals of
Internal Medicine*, 155(2), 97–107. · 96편(111개 논문)을 종합. 낮은 건강 문해력이
입원 증가, 응급 진료 이용 증가, 유방촬영술·독감백신 수혜 감소, 약을 올바로 복용해
보이는 능력 저하, 라벨과 보건 메시지 해석 능력 저하와 일관되게 연관. 사망률은
**고령자에서** 높았다. **초록에 배수는 제시되지 않는다** — 본문이 쓰던 1.52·1.5·1.53
은 이 논문에서 확인되지 않아 뺐다.

### 복약 오류

**[E1]** Anacleto, T. A., Perini, E., Rosa, M. B., & César, C. C. (2007). Medication
dispensing errors in a Brazilian hospital pharmacy. *Clinics*, 62(3), 243–250.
· 직접 관찰법. 조제 카세트 734건에서 오류 179건(전체 단위용량 7,249건 대비 2.5%).
약사가 발견한 155건 중 누락 51건(32.9%), 용량 44건(28.4%), 시각 36건(23.2%) 으로
이 셋이 84.5%. **주의: 이 분포는 조제하는 쪽의 오류이지 환자 단계의 오류가 아니다.**

### 전달 경로

**[D1]** Pew Research Center (2025). *Mobile Fact Sheet / Demographics of Mobile Device
Ownership and Adoption in the United States.* 조사 기간 2025-02-05 ~ 2025-06-18.
· 50세 미만 97%, 50~64세 90%, 65세 이상 78%. 전체 성인 91% 로 2011년 첫 조사의 35%
에서 상승. 65세 이상이 가장 낮은 집단.

### 만성질환·비순응

**[N1]** International Diabetes Federation (2025). *IDF Diabetes Atlas, 11th edition.*
· 20~79세 성인 당뇨 유병률 11.1%, 5억 8,900만 명. 그중 **2억 5,200만 명(약 43%)이
자신이 당뇨임을 모른다.** 당뇨 성인 네 명 중 세 명이 저·중소득국 거주. 2050년 8억
5,300만 명(13%) 예측. 2024년 당뇨 관련 사망 340만 명.

**[N2]** 질병관리청 (2023). *국민건강영양조사 제9기 2차년도.* · 건강정보이해능력이
적절한 수준(40점 만점 30점 이상)인 비율: 전체 성인 60.4%, **65세 이상 40.3%**,
소득 하위층 54.4%, 소득 상위층 66.3%.

**[N3]** Duke Health · 미국 복약 비순응 관련: 직접 비용 연 1,000억 달러, 간접 비용
포함 시 3,000억 달러까지, 연간 약 125,000명 사망, 입원의 최소 10%. **주의: 널리
인용되는 값이나 3,000억 달러 상단값의 근거에는 이견이 있다.**

### 픽토그램 이해도

**[P1]** Gutierrez, M. M., Patikorn, C., & Anantachoti, P. (2022). Evaluation of
pharmaceutical pictogram comprehension among adults in the Philippines. *Journal of
Pharmaceutical Policy and Practice*, 15, 30. doi:10.1186/s40545-022-00426-y · USP 82종과
FIP 26종을 합한 108종 중 ANSI 85% 기준을 통과한 것은 17종(15.74%), USP 16종·FIP 1종.
단독 사용을 권고할 수 있는 것이 그 17종뿐이라는 것이 저자들의 결론이다.

**[P1b]** Dowse, R., Okeyo, S., Sikhondze, S., & Khumalo, N. (2023). Pharmaceutical
indication pictograms for low literacy viewers: Health literacy and comprehension.
*Health SA Gesondheid*, 28, a2192. doi:10.4102/hsag.v28i0.2192 · 현지 제작 10종 중
8종이 ISO 66.7% 기준을 통과(미달 2종은 전신 통증 51.1%, 어지러움 54.4%). 평균 이해도
7.9 ± 1.8 / 10. **건강 문해력과 픽토그램 이해도 사이에 유의한 양의 상관 (p = 0.002)**
이며 저문해 참여자에서 오독이 더 많았다.

**[P2]** Dowse, R., & Ehlers, M. S. (2001). The evaluation of pharmaceutical pictograms
in a low-literate South African population. *Patient Education and Counseling*, 45(2),
87–99. · Xhosa 46명(정규교육 ≤7년)에게 USP-DI 23종과 그에 대응하는 현지 제작 23종을
같이 보였다. **현지 제작 20종이 ANSI 85% 기준을 통과한 데 비해 USP-DI 는 11종.**
같은 사람에게 같은 뜻을 물었는데 그림의 출신에 따라 두 배 가까이 갈렸다 — 본문이
쓰던 "20 대 11" 의 출처가 2005년이 아니라 이 논문이며, 분모 23을 확인해 도표에
되살렸다.

**[P3]** van Beusekom, M. M., et al. (2017). Pharmaceutical pictograms for low-literate
patients: Understanding, risk of false confidence, and evidence-based design strategies.
*Patient Education and Counseling*, 100(5), 966–973. · 네덜란드 약국 방문자 197명,
픽토그램 10종. 67% 이해 기준을 넘은 것은 절반(개별 31.0~98.5%)이나 **저문해 집단에서는
10종 중 2종.** 3종에서 거짓 확신의 위험. 결론: **안전에 관한 정보에서는 67% 이해로
충분하지 않을 수 있다.**

**[P4]** Houts, P. S., Doak, C. C., Doak, L. G., & Loscalzo, M. J. (2006). The role of
pictures in improving health communication: a review of research on attention,
comprehension, recall, and adherence. *Patient Education and Counseling*, 61(2), 173–190.
doi:10.1016/j.pec.2005.05.004 · **"written or spoken text" 와 밀접히 결합된 그림**이
주의와 회상을 뚜렷이 높인다. 음성이 포함된다는 것이 본 연구의 설계와 직접 닿는다 —
본문이 한때 "문자와 함께" 로만 적어 스스로의 근거를 좁히고 있었다.

### 음성 인터페이스

**[I1]** Miller, D. I., Bruce, H., Gagnon, M., Talbot, V., & Messier, C. (2011). Improving
Older Adults' Experience with Interactive Voice Response Systems. *Telemedicine and
e-Health*, 17(6), 452–455. doi:10.1089/tmj.2010.0204 · 고령 사용자의 IVR 사용성 평가가
젊은 사용자보다 낮고 완료 과제 수도 적다. 문제의 대부분이 **모호한 선택지·말 속도·
선택지의 길이**에서 나온다. 같은 불만을 젊은 사용자도 말했으나 대부분 스스로 넘어선
반면 고령 사용자는 그러지 못했다. **주의: 선택지를 더 많이 제시했을 때 두 연령대 모두
더 효율적이었다는 결과가 함께 있다** — 한 단계에 담는 수에 관한 것이고 그만큼 깊이가
줄어드는 것이므로, §1.10 과 함께 읽으면 "선택지를 줄여라" 가 아니라 "단계를 줄여라"
가 된다. 본문에 그대로 적었다.

### 영양 권고

**[Y1]** World Health Organization. *Healthy diet* (fact sheet). · 유리당 총 에너지의
10% 미만(50 g 상당, 5% 이하로 더 줄이면 추가 이득 가능), 포화지방 10% 미만, 트랜스지방
1% 미만. 소금은 성인 1일 5 g 미만(나트륨 2 g)이라는 절대량. 아동은 에너지 섭취량에
따라 더 적어야 한다.

### 저문해 사용자 인터페이스

**[U1]** Medhi, I., Cutrell, E., & Toyama, K. (2010). It's not just illiteracy. *Proc.
International Conference on Interaction Design & International Development.* · 인도·
필리핀·남아공의 저문해·저소득 400명. 장벽이 문해력만이 아니라 인지적 어려움, 기술에
대한 두려움과 불신, 무엇을 할 수 있는지에 대한 인식 부족까지 얽혀 있음을 보고.
**주의: 본문이 한때 "INTERACT 2013" 으로 적었으나 이 논문은 2010년 ICIDID 발표다.**

**[U2]** Medhi, I., Toyama, K., Joshi, A., Athavankar, U., & Cutrell, E. (2013). A
Comparison of List vs. Hierarchical UIs on Mobile Phones for Non-literate Users.
*INTERACT 2013*, LNCS 8118, 497–504. doi:10.1007/978-3-642-40480-1_33 · 방갈로르 빈민가
비문해 성인 20명(목록 10, 계층 10), 40개 항목 중 5개 찾기. 목록형 평균 25초 대 계층형
65.5초, *t*(18)=4.6, *p*<0.001. 정답률 100% 대 80%, *t*(18)=−3, *p*=0.0077.
저자들은 원인을 중첩 개념의 이해와 되돌아오기의 어려움에서 찾는다.

### 항생제 내성

**[R1]** World Health Organization (2025). *Global antibiotic resistance surveillance
report 2025 (GLASS).* · 104개국이 보고한 실험실 확인 감염 2,300만 건 이상. 2023년
세균 감염 여섯 건 중 한 건이 항생제 내성. 8개 우선 병원체 × 22개 항생제. 2018~2023년
감시 조합의 40% 이상에서 내성 상승, 연평균 5~15%. 동남아·동지중해 3건 중 1건,
아프리카 5건 중 1건, 아메리카 7건 중 1건.

**[R2]** Murray, C. J. L., et al. (Antimicrobial Resistance Collaborators) (2022). Global
burden of bacterial antimicrobial resistance in 2019: a systematic analysis. *The Lancet*,
399(10325), 629–655. · 2019년 세균 내성에 **직접 기인한 사망 127만 명**, 연관 사망
495만 명. HIV/AIDS 나 말라리아보다 많다. 204개국.

### 고령화·알레르기·보급

**[A1]** World Health Organization. *Ageing and health* (fact sheet). · 60세 이상 2020년
10억 명 → 2030년 14억 명, 2030년 여섯 명 중 한 명. 2050년 21억 명. **2050년 60세 이상의
3분의 2가 저·중소득국 거주.** 2015~2050년 세계 인구 중 비중 12% → 22%.

**[A2]** Food Allergy Research & Education (2024). *Food Allergy Facts and Statistics.*
· 미국 전체 3,300만 명 이상. **성인 약 1,800만 명(100명 중 7명)**, 아동 약 400만 명
(100명 중 5명). 아동 13명 중 1명이 진단.

**[A3]** GSM Association (2023). *The Mobile Economy Sub-Saharan Africa 2023.*
· 사하라이남 아프리카 모바일 인터넷 이용자 2022년 2억 8,700만 명 → 2030년 4억
3,800만 명 전망.

### 표준

**[S1]** ISO 9186-1:2014. *Graphical symbols — Test methods — Part 1: Method for testing
comprehensibility.* · 최소 67% 이해.

**[S2]** ANSI Z535.3-2022. *Criteria for Safety Symbols.* · 최소 85% 정답, 치명적 혼동
5% 이하. 두 기준값은 Dowse & Ehlers 논문에서도 교차 확인된다.

**[S3]** U.S. Pharmacopeia. *USP Pictogram Library License Agreement.* · 픽토그램 81종.
라이선스는 (가) 변형하거나 USP 가 만들지 않은 심볼과 함께 쓰는 것을 USP 의 허락 없이
금지하고, (나) **픽토그램을 환자에게 정보를 전달하는 유일한 수단으로 쓰지 말 것**을
요구한다. 후자는 그림 하나로 부족하다는 것을 표준을 만든 쪽이 명시한 것이다.

### 색각

**[C1]** Colour Blind Awareness; MedlinePlus Genetics. · 적록 색각이상은 북유럽계 남성의
약 8%, 여성의 약 0.5%. 전 세계 약 3억 명. **인종에 따라 다르며 중국·일본계 남성에서는
4~6.5%, 사하라이남 아프리카에서는 더 낮게 보고된다.**

### 환자안전

**[W1]** World Health Organization (2017). *Medication Without Harm: WHO Global Patient
Safety Challenge.* WHO/HIS/SDS/2017.6. · 2017년 3월 29일 본(Bonn) 제2차 국제 환자안전
장관급 회의에서 발표. 복약 오류 관련 연간 비용 약 420억 달러로 전 세계 보건지출의 약
1%. 5년 내 중대 회피가능 약물위해 50% 감축 목표.

**[W2]** World Health Organization (2024). *Medication without harm: policy brief.*
ISBN 978-92-4-006276-4. · 회원국의 18%만이 약물위해 감축 국가 목표를 수립.

### 사진 기반 영양 추정

**[V1]** Chen, T., et al. (2024). NutritionVerse-Direct: Exploring Deep Neural Networks
for Multitask Nutrition Prediction from Food Images. arXiv:2405.07814. · ViT 기반
다중작업 회귀. 평균 절대 오차 — 열량 253.7 kcal, 질량 98.4 g, 탄수화물 24.2 g,
단백질 22.1 g, 지방 14.3 g. 합산 MAE 412.6 (Inception-ResNet 554.0 대비 25.5% 개선).
**퍼센트 오차 지표는 이 논문에 없다.**

### 한국·몰도바

**[K1]** Lee, M., Kim, K., Rhew, K., & Choi, K.-H. (2021). A knowledge, attitude, and
practice survey on medication safety in Korean older adults. *Healthcare*, 9(10), 1365.
doi:10.3390/healthcare9101365 · 65세 이상 131명(2017년 5~6월 조사). **79.4%가 스스로
복용, 28.2%만 복약 안전 교육을 받음.** 표본이 작고 조사가 2017년이라는 점을 본문에
밝혔다.

**[K2]** Voncina, L., Dozol, A., Volovei, I., & Cetinkaya, V. (2022). *Human Development
Assessment for Moldova: Background Paper on Health.* World Bank. · 2015~2060년 인구
31% 감소, 평균 연령 38→47세, **고령 인구 비중 두 배 이상 늘어 27%.** 2008~2015년
당뇨 유병률 +75%, 순환기 질환 +41%.

**[K3]** Vianello, F. A., et al. (2020). Health status of female Moldovan migrants to
Italy by health literacy level and age group. *BMC Public Health*, 20, 1502.
doi:10.1186/s12889-020-09582-9 · **대상은 몰도바 거주자가 아니라 이탈리아 파도바의
몰도바 이주 여성 170명.** 문해력이 낮은 쪽에서 흡연 33.3% 대 14.3%, 주치의 방문
적음. 몰도바 국내 인구로 옮길 수 없다.

## 끝내 확인하지 못한 것

**HLS19 의 통합 46%.** 보고서가 17개국을 묶은 대표값을 내세우지 않으며, 국가 간
비교를 신중히 하라고 명시한다. 본문에서 그 수치를 빼고 한국 자료로 대체했다.

**45.8% · 8.3% 의 출처.** 필리핀 연구에서 나온 값이 아니라는 것만 확인했고, 다른
논문의 값인지는 찾지 못했다. 본문에서 뺐다.

## 이 대조에서 배운 것

수집 메모(`refs.md`)의 오류율이 32%였다. 값이 틀린 것보다 더 자주 나온 문제는
**출처가 그 값을 말하지 않는 것**이었다 — 다른 논문의 결과를 붙였거나(항생제 내성
사망), 다른 인구의 결과를 옮겼거나(몰도바 이주 여성), 단위를 바꿔 적었다(14.3 g →
14.43%). 값만 다시 보아서는 걸러지지 않고 원문을 열어야 걸린다.

고친 뒤 논지가 약해진 곳은 없었다. 오히려 여섯 곳에서 세졌다 — 필리핀 실제값이
"여섯에 하나" 로 더 분명해졌고, Dowse & Ehlers 2001 의 분모를 찾아 같은 46명 안에서
87% 대 48% 라는 대조를 얻었으며, Houts 의 "spoken text" 는 우리가 스스로 한계라고
적어 둔 것을 근거로 바꿔 놓았다.

PMC8544505 한국 고령자 79.4%/28.2% · PMC7532569 몰도바 건강문해력 · Houts 등(2006)의
본문 내용(서지는 확인) · 거짓 확신(Patient Educ Couns) · World Bank 몰도바 고령 인구
27% · Paivio 이중부호화 · NutritionVerse 평균 오차 14.43% · Medhi, Sagar & Toyama
(2007) · HLS19 의 46% · Dowse & Ehlers 의 20 대 11 의 연도와 분모.

이 아홉은 본문에서 저자·연도 형태로만 두고 전체 서지를 붙이지 않았다. 붙이는 것은
대조한 뒤에 한다.

## 2026년 8월에 더한 인용

앞의 37종을 대조한 뒤 §1 의 밀도를 올리며 아홉 종을 더했다. 이 아홉은 검색 요약을
쓰지 않고 모두 원문에서 직접 확인했으며, 어떻게 확인했는지를 함께 적는다. 원문에
닿지 못한 것은 쓰지 않았다.

| 인용 | 확인 방법 | 결과 |
|---|---|---|
| WHO, *Global patient safety report 2024* | 388쪽 PDF 를 내려받아 본문 검색 | 확인. 1 in 20, 아프리카·동남아 9%, 53%/36%, LMIC 80%, 1억 3,400만 건·260만 명, 74%·24% |
| WHO, *Blindness and vision impairment* fact sheet | 페이지 원문 | 확인. 22억 명, 10억 명, 저·중소득 4배 |
| WHO, *Hypertension* fact sheet | 페이지 원문 | 확인. 14억 명(33%), 미인지 6억 명(44%), 조절 3억 2,000만 명(23%) |
| ITU, *Facts and Figures 2024* | 보고서 페이지 원문 | 확인. 55억 명(68%), 26억 명(32%) |
| OECD Health Working Papers No. 107 | 55쪽 PDF 를 내려받아 본문 검색 | 확인. 18개국 최소 3분의 1, 총 의료비의 3~5% |
| Tian, F. et al., *J Gerontol A* | PubMed 초록 | 확인. 50.4% (48.2~52.7), 545편·1,662만 명·56개국, HR 1.05/1.02/1.04 |
| Nielsen, J. Ø. et al., *J Hum Hypertens* | PubMed 초록 | 확인. 22편 92,443명, 25.45%·63.35% |
| Hermans, V. et al., *Malaria Journal* | PMC 전문 | 확인. 293명 네 나라, 6·6·2·1종, 쿠바 94.1% 대 콩고 8.0% |
| Talevski, J. et al., *PLOS ONE* | 저널 페이지 | 확인. 20편 중 19편 긍정, 제2형 당뇨에서 순응도·식이 개선 |
| U.S. Pharmacopeia, *USP Pictograms* | 공식 페이지 | 확인. 81종, 라이선스 네 조항 |
| Dowse, R. et al., *Health SA Gesondheid* 28:2192 | PMC 전문 | 확인. n=90, 7.9±1.8, r=0.34 (p=0.001), p=0.002 |
| International Telecommunication Union, *Facts and Figures 2024* | ITU 보도자료 | 확인. 55억 명(68%) 사용, 26억 명(3분의 1) 미사용 |
| Mansoor, L. E. & Dowse, R., *Ann Pharmacother* 37:1003 | PubMed 초록 | 확인. 저문해 60명(정규교육 ≤7년), 실험군에서 라벨·안내문 양쪽 80% 초과가 유의하게 많았다 |
| Schubbe, D. et al., *Patient Educ Couns* 103(10):1935 | PubMed 초록 | 확인. 4,160편 선별 → RCT 54편(메타 42편). 저건강문해력 13편에서 지식·이해 크게 상승. "icons with few words may be most helpful" |
| Zhang, N. J., Terry, A. & McHorney, C. A., *Ann Pharmacother* 48(6):741 | PubMed 초록 | 확인. 가중 상관 0.056~0.072. 유의하나 약하다 |
| Ownby, R. L. et al., *J Ageing Longev* 4(2):51 | PMC 전문 | 확인. 저건강문해력 315명, 2개 기관, 3·6·8학년 수준 세 무리. 무리 간 차이 없음, 복약 순응도 변화 없음 |
| Azad, C. L. et al., *PLOS ONE* 19(6):e0304351 | PMC 전문 | 확인. 성인 17명(46%가 REALM-SF 저문해), 여섯 기능, 문해 페르소나 셋. 아이콘이 저문해에 불투명할 수 있고 사진에 가까운 표현이 선호된다는 관찰 |
| U.S. Pharmacopeia, *USP Pictograms* | USP 공식 페이지 | 확인. 81종, GIF·EPS 무상 배포, 네 조항을 원문 그대로 대조했다. 다만 세트가 81종에 이른 연도는 1차 출처를 못 열어 본문에서 뺐다 |
| Fathizadeh, H. et al., *BMC Nursing* 23:175 | PMC 전문 | 확인. 36편 6,238명. 시각 27.3%, 용량 26.4%. 이질성 I² 91~96 이므로 순서만 읽는다 |
| WHO, *Assistive technology* fact sheet | WHO 공식 페이지 | 확인. 25억 명 필요, 2050년 35억 명. 저소득국 3% 대 고소득국 90% |
| Kheir, N. et al., *Res Social Adm Pharm* 10(5):720 | PubMed 초록 | 확인. 123명 세 갈래 무작위. 그림+구두가 대부분 지시에서 최고 (p ≤ 0.05). "Do not take with dairy products" 는 여전히 어려웠다 |
| Mourad, N. et al., *BMC Public Health* 23:1926 | PMC 전문 | 확인. n=1,848. 9.36±1.60 → 10.88±0.89, 차이 1.52 (95% CI 1.45~1.60). 나이 Beta = −0.019 |
| Chaudry, B. et al., *PervasiveHealth 2011*:160 | PMC 전문 | 확인. CKD 5기 10명, REALM 3/3/4. 액체 10/10, 무정형 8/10, 고형식 0/10 |
| Nielsen, J. & Landauer, T. K., *Proc. INTERCHI 93*:206 | 응답자가 지목 | 최묘정 연구원이 소규모 표본의 근거로 든 것이다. 서지 정보만 보완했고 우리가 이 값을 주장에 쓰지는 않는다 |
| Tumkur, A. et al., *Clin Epidemiol Glob Health*, 2025 | 열지 못함 | Sheron Sir Loon Goh 전임강사가 알려 준 논문이다. 출판사·DOAJ·Semantic Scholar 셋 다 초록을 열지 못해 결과를 쓰지 않고, 응답자가 알려 주었다는 사실만 5.10 에 적었다 |
| RxHandBD (Zenodo 18478741, MIT) | 개발 세션이 직접 측정 | 손글씨 약 이름 5,578장. 시험셋 500장 전수(실패 0), 결과는 scripts/handwriting-eval.json 에 전부 있다 |
| Mendeley k62rfd23kz (CC BY 4.0) | 개발 세션이 직접 측정 | 방글라데시 처방전 전장 200장, 약 이름 영역 개수 주석. 200장 전수(실패 0), scripts/prescription-page-eval.json |

### 표본 처방전을 대조한 것

Sheron Sir Loon Goh 전임강사가 아목시실린 캡슐의 냉장 표기를 지적한 뒤 표본 넷의
임상 내용을 모두 대조했다. 인용을 대조하는 것과 같은 절차이며, 결과도 같았다.
그럴듯한 것과 맞는 것이 달랐다.

| 표본 · 문구 | 무엇으로 대조했나 | 결과 |
|---|---|---|
| 아목시실린 · 냉장 2~8도 | 응답자 지적 → 제형별 보관 조건 | **틀림.** 캡슐은 실온 25도. 냉장은 현탁액 쪽 |
| 아목시실린 · 임신 중 사용 금지 | NHS 의약품 페이지 + StatPearls NBK482250 | **틀림.** "It is safe to take amoxicillin during pregnancy". FDA 분류 B |
| 아목시실린 · 수유 시 주의 | 같은 두 곳 | **틀림.** 모유 이행량 0.1 mg/kg/day. NHS "It's OK to take amoxicillin while breastfeeding" |
| 아목시실린 · 금주 | StatPearls NBK482250 | **틀림.** 알코올 상호작용 언급 없음. 그것은 메트로니다졸 |
| 파라세타몰 · 수유 시 주의 | NHS 의약품 페이지 | **틀림.** "Paracetamol is usually the best painkiller to take if you're breastfeeding" |
| 클로람페니콜 점안액 · 임신 중 사용 금지 | NHS 의약품 페이지 | **틀림.** "Chloramphenicol eye treatments and ear drops can be used in pregnancy" |
| 클로람페니콜 점안액 · 냉장 2~8도 | NHS 의약품 페이지 | 맞음. "Store the eye drops in a fridge" |
| 이부프로펜 · 임신 중 사용 금지 | NHS + SPS 임신 통증 치료 | 맞음. 임신 중 회피, 3분기 금기 |
| 이부프로펜 · 혈액희석제 병용 금지 | NSAID 출혈 위험 | 맞음 |

여섯 가운데 셋이 임신 금기였다. 경고란에 넣기 가장 쉬운 문구이고, 우리가 그것을
시연하고 싶었기 때문에 더 그랬다. 지금 문구도 공개 자료를 대조해 고친 것이지
약사의 검토를 받은 것이 아니며, 그 사실은 §5.9 에 적었다.

### 쓰지 않기로 한 것

| 자료 | 왜 쓰지 않았나 |
|---|---|
| GSMA, *State of Mobile Internet Connectivity 2025* 의 usage gap 31억 명 | §1.6 에 딱 맞는 값이었으나 GSMA 가 세 경로 모두 403 으로 막아 원문을 열지 못했다. 검색 요약만 보고 쓰지 않고 ITU 로 갈음했다 |
| Sherwani 등의 HealthLine (음성 인터페이스, 파키스탄) | §1.10 이 Medhi 한 연구진에만 기대고 있어 다른 연구진의 것을 찾았으나, CMU 사본은 403, IEEE 는 본문이 비어 있어 1차 출처를 열지 못했다. 검색 요약에 수치가 있었으나 쓰지 않았다 |
| Wang, Z. et al., *Pharmacoepidemiol Drug Saf* 33:e5880 의 다제복용 유병률 | 유료 벽에 막혔다. 우회하다 제목이 비슷한 다른 논문(턱관절 장애 질적연구)을 잡은 것을 초록을 열어 확인하고 바로잡았으며, 대신 초록이 공개된 Tian 등을 썼다 |

### 검색 요약과 원문이 달랐던 것

| 항목 | 검색 요약 | 원문 | 
|---|---|---|
| 고혈압 미인지 비율 | 46% | **44%** (WHO 팩트시트) |

한 건이지만 이것이 이 대장을 계속 쓰는 이유다. 처음 37종에서 12종이 틀렸던 것과
같은 종류의 오류이며, 요약을 그대로 옮겼다면 오류율이 다시 올라갔을 것이다.

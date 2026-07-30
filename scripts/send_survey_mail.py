#!/usr/bin/env python3
"""네이버 메일(SMTP)로 전문가 설문 안내를 보낸다.

1103명에게 한 통씩 따로 보낸다. 단체 메일이나 숨은참조가 아니다 — 링크에 사람마다
다른 수신자 토큰이 들어가므로 한 통에 여러 명을 담을 수 없다.

## 쓰는 법

  # 1. 미리보기 (아무것도 보내지 않는다). 기본 동작이다.
  python3 scripts/send_survey_mail.py

  # 2. 내 주소로 한 통만 보내 눈으로 확인한다
  python3 scripts/send_survey_mail.py --test-to 내주소@naver.com --send

  # 3. 실제 발송 — 하루 몫만
  python3 scripts/send_survey_mail.py --send --limit 300

  # 4. 다음 날 다시 같은 명령. 보낸 사람은 자동으로 건너뛴다.
  python3 scripts/send_survey_mail.py --send --limit 300

## 미리 해둘 것

1. 네이버 메일 → 환경설정 → POP3/IMAP 설정 → **IMAP/SMTP 사용: 사용함**
   이걸 켜지 않으면 로그인 단계에서 막힌다.

2. 2단계 인증을 쓰고 있으면 계정 비밀번호가 아니라 **애플리케이션 비밀번호** 가 필요하다.
   네이버 → 내정보 → 보안설정 → 2단계 인증 → 애플리케이션 비밀번호에서 발급한다.

3. 아이디를 환경변수에 넣는다.

     export NAVER_ID='내아이디@naver.com'

4. 앱 비밀번호를 넣는다. 이 파일에도, 이 저장소 어디에도 적지 않는다.

   (권장) 맥 키체인. 잠긴 저장소에 들어가고 이 스크립트가 꺼내 쓸 때만 나온다.

     security add-generic-password -s snapcare-naver -a 내아이디@naver.com -w

   `-w` 뒤에 값을 적지 않으면 화면에 물어보므로 셸 기록에도 남지 않는다.

   (간단) `~/.zshenv` 를 편집기로 열어 `export NAVER_APP_PW='...'` 를 적는다. echo 로
   넣지 마라 — 셸 기록에 그대로 남는다. 그리고 이 파일은 평문이라 아무 프로그램이나 읽는다.

   어느 쪽이든 스크립트는 이 값을 SMTP 에만 넘기고 화면이나 로그에 찍지 않는다.

## 중간에 끊겨도 된다

보낸 사람은 `--log` 파일에 한 줄씩 적힌다. 다시 돌리면 그 파일을 읽어 건너뛴다.
네이버가 중간에 막든 노트북을 덮든, 같은 명령을 다시 치면 이어서 간다. 같은 사람에게
두 번 가는 것이 이 작업에서 가장 나쁜 실패이므로, 보내기 직전이 아니라 **보낸 직후에**
기록한다 — 보내고 기록에 실패하면 다시 보낼 위험이 있지만, 기록하고 보내기에 실패하면
그 사람은 영영 못 받는다. 후자가 더 나쁘다고 판단했다.

## 얼마나 빨리 보낼 수 있나

네이버는 개인 계정의 하루 발송 한도를 공개하지 않는다. 그래서 숫자를 짐작하지 않고,
막혔을 때 죽지 않게 만들었다.

연결이 끊기면 기다렸다 다시 연결해 이어 간다. 일시 거절(4xx)이면 기다렸다 같은 통을 다시
보낸다. 기다리는 시간은 시도마다 늘어난다(--backoff, 기본 60초). 세 번 다 실패하면 계정이
막힌 것으로 보고 멈춘다 — 그 상태에서 계속 밀어붙이면 계정이 잠긴다.

그러므로 한 번에 1103통을 시도해도 된다. 최악의 경우는 중간에 멈추는 것이고, 보낸 사람은
기록에 남아 있으므로 얼마 뒤 같은 명령을 다시 치면 이어진다.

    python3 scripts/send_survey_mail.py --send --limit 1103 --gap 8

간격을 4초로 줄이면 1시간 15분이지만, 빠를수록 스팸으로 걸러질 확률이 올라간다. 스팸함에
들어간 메일은 다시 보낼 수도 없으므로 여기서 아끼는 시간은 값이 비싸다.

"""

from __future__ import annotations

import argparse
import json
import os
import re
import smtplib
import ssl
import sys
import time
import unicodedata
import zipfile
from email.header import Header
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / 'scratchpad' / 'contacts' / 'SnapCare_전문가_명단.xlsx'
LOG = ROOT / 'scratchpad' / 'contacts' / 'sent.jsonl'
BASE = 'https://snapcare.fly.dev/survey'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# 명단 엑셀의 열. 위치가 바뀌면 여기만 고친다.
COL_GRADE, COL_NAME, COL_AFFIL, COL_EMAIL, COL_TOKEN, COL_REGION, COL_WHY = \
    'C', 'E', 'F', 'H', 'I', 'L', 'K'


# ────────────────────────── 명단 읽기 ──────────────────────────

def read_roster(path: Path) -> list[dict]:
    """xlsx 첫 시트를 읽는다. openpyxl 없이 돈다 — 이 스크립트를 다른 기계에서도
    바로 돌릴 수 있어야 하므로 표준 라이브러리만 쓴다."""
    z = zipfile.ZipFile(path)
    shared: list[str] = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))

    rows: list[dict] = []
    for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(NS + 'row'):
        cur: dict[str, str] = {}
        for c in row.iter(NS + 'c'):
            col = re.match(r'[A-Z]+', c.get('r') or '').group()
            v, inline = c.find(NS + 'v'), c.find(NS + 'is')
            if inline is not None:
                cur[col] = ''.join(t.text or '' for t in inline.iter(NS + 't'))
            elif c.get('t') == 's' and v is not None and shared:
                cur[col] = shared[int(v.text)]
            elif v is not None:
                cur[col] = v.text or ''
        rows.append(cur)
    return rows[1:]  # 머리글 한 줄 버린다


def domain(email: str) -> str:
    m = re.search(r'@([\w.-]+)$', (email or '').strip())
    return m.group(1).lower() if m else ''


def language_of(row: dict, allow_ro: bool) -> str:
    """받는 분의 언어.

    **도메인 최상위만 본다.** 소속 문자열에서 'Moldova' 같은 낱말을 찾는 방식은 쓰지
    않는다 — 이 프로젝트에서 그 방식으로 두 번 사고가 났다. 선정 이유 칸에 '몰도바' 가
    적혀 있으면 WHO 나 브라질 연구자까지 몰도바로 잡힌다.
    """
    d = domain(row.get(COL_EMAIL, ''))
    if d.endswith('.md') or d.endswith('.ro'):
        return 'ro' if allow_ro else 'en'
    if (row.get(COL_REGION) or '').strip() == '국내':
        return 'ko'
    return 'en'


ORG_WORDS = (
    # 한국어
    '대학', '학교', '대학교', '재단', '학회', '협회', '연구소', '연구원', '연구센터', '센터',
    '사무소', '사무국', '보건부', '부처', '청', '공단', '진흥원', '위원회', '본부', '지부',
    '사업단', '단체', '병원', '의원', '약국', '팀', '공식 창구', '(주)', '㈜', '주식회사',
    # 영어·기타
    'Membership', 'Foundation', 'Association', 'Institute', 'Institution', 'Office',
    'Society', 'Federation', 'Ministry', 'University', 'College', 'Academy', 'School',
    'Hospital', 'Clinic', 'Center', 'Centre', 'Council', 'Committee', 'Network',
    'Programme', 'Program', 'Bureau', 'Agency', 'Department', 'Division', 'Laboratory',
    'Group', 'Partners', 'Inc', 'Inc.', 'Ltd', 'Ltd.', 'LLC', 'GmbH', 'Corp', 'Co.',
    'Team', 'Fundația', 'Universitatea', 'Ministerul', 'Asociația',
)


HANGUL = re.compile(r'[\uac00-\ud7a3\u3131-\u318e]+')


def latin_only(name: str) -> str:
    """이름에서 한글을 걷어낸다.

    명단의 이름 칸은 우리가 알아보기 위해 적은 것이라 한글 설명이 섞여 있다 —
    "UNESCO 나이로비 동아프리카 지역사무소", "National Literacy Trust 미디어" 처럼.
    그대로 인사말에 넣으면 케냐 사무소가 "Dear UNESCO 나이로비 동아프리카 지역사무소,"
    를 받는다. 63명이 그런 상태였다.

    한글을 지운 뒤 빈 괄호와 남은 구두점을 정리한다. 남는 것이 없으면 빈 문자열을
    돌려주고, 부르는 쪽에서 이름 없는 인사말로 넘어간다 — 잘못된 이름으로 부르는 것보다
    이름을 부르지 않는 편이 낫다.
    """
    t = HANGUL.sub(' ', name or '')
    t = re.sub(r'\(\s*\)', ' ', t)          # 속이 빈 괄호
    t = re.sub(r'[\s·,/]+', ' ', t).strip()
    t = t.strip(' -·,/')
    return t if len(t) >= 2 else ''


def korean_greeting(name: str) -> str:
    """한국어 인사말. 기관이면 담당자를 부른다.

    이름 칸이 이미 직함이나 "담당" 으로 끝나는 경우가 있어서 그대로 붙이면 "공공디자인
    실태조사·연구 담당 담당자분께" 가 된다. 끝을 보고 정리한다.
    """
    n = (name or '').strip()
    if looks_like_person(n):
        return f'{n} 님께'
    if n.endswith('담당'):
        return f'{n}자분께'
    if n.endswith(('과장', '팀장', '부장', '실장', '센터장', '원장', '회장', '국장', '위원장')):
        return f'{n}님께'
    return f'{n} 담당자분께'


def looks_like_person(name: str) -> bool:
    """사람 이름인가 기관 이름인가.

    명단의 '이름 / 기관' 칸에는 둘이 섞여 있다. 기관에 "님께" 를 붙이면 어색하고, 사람에게
    "관계자분께" 를 붙이면 무례하다. 확실하지 않으면 기관으로 본다 — 기관 인사말은
    사람이 받아도 어색한 정도이고, 그 반대는 실례가 된다.
    """
    n = (name or '').strip()
    if not n:
        return False
    return not any(w in n for w in ORG_WORDS)


# 판정이 갈리는 것은 한국어 인사말뿐이다. 영어는 두 형태가 같으므로 어느 쪽으로 판정해도
# 같은 문장이 나간다.


# ────────────────────────── 메일 본문 ──────────────────────────

# 제목.
#
# 받은편지함에서 보이는 것은 앞부분뿐이다 — 한국어는 20자 남짓, 영어는 45자 남짓.
# 그 앞부분이 "누가 왜 보냈나" 에 답해야 열린다.
#
# 두 번 고쳤다. 처음에는 'SnapCare' 로 시작했다 — 받는 분에게 그 이름은 아무 뜻이 없고,
# 모르는 이름으로 시작하는 제목은 광고로 읽힌다. 그 다음에는 "[교육부 주최 e-ICON
# 세계대회]" 로 시작했는데, 그것은 더 나빴다. 부처 이름을 대괄호로 앞세우면 학생이
# 조언을 구하는 메일이 아니라 기관이 보낸 공문처럼 읽히고, 실제로 그런 권위를 빌리는
# 인상을 준다. 우리는 부탁하는 쪽이므로 제목도 부탁으로 읽혀야 한다.
SUBJECT = {
    'ko': '고등학생 프로젝트에 조언을 부탁드립니다 — 글을 읽지 못하는 분을 위한 복약 안내 앱',
    'en': 'A high-school student asking for advice — a medication-guidance app for people who cannot read',
    'ro': 'Un elev de liceu cere un sfat — o aplicație de ghidare a medicației pentru cei care nu pot citi',
}

# 인사말. (사람일 때, 기관일 때) 짝이다.
#
# 영어는 둘을 같게 둔다. "Dear ARASAAC," 도 "Dear Dr Phillips," 도 자연스럽고, 그래서
# **사람인지 기관인지 가릴 필요가 없다.** 가리려 하면 반드시 틀린다 — 낱말 목록을 늘려도
# ARASAAC, Blissymbolics, Tobii Dynavox 는 사람으로 잡혔다. 이 프로젝트에서 낱말 매칭으로
# 두 번 사고가 났고, 여기서도 같은 방식이었다. 틀려도 표가 나지 않는 형태를 고르는 것이
# 분류를 잘하려 애쓰는 것보다 낫다.
#
# 한국어는 그럴 수 없다. "님께" 와 "담당자분께" 가 다르고, 사람에게 "담당자분께" 를
# 붙이는 것이 더 실례이므로 애매하면 사람 쪽으로 둔다 — 기관이 "님께" 를 받는 것은
# 어색한 정도에서 끝난다.
GREET = {
    'ko': ('{name} 님께', '{name} 담당자분께'),
    'en': ('Dear {name},', 'Dear {name},'),
    'ro': ('Stimate/Stimată {name},', 'Stimați colegi de la {name},'),
}

BODY = {
    'ko': """{greeting}

안녕하세요. 충남삼성고등학교에서 IT 디플로마 과정을 이수하고 있는 3학년 남윤수입니다. 교육부가 주최하고 한국교육정보진흥협회가 주관하는 제16회 e-ICON 세계대회에서 본선에 진출해, SnapCare 라는 프로젝트를 진행하고 있습니다. 글을 읽지 못하는 사람이 처방전을 사진으로 찍으면 복약 지시가 그림과 음성으로 전달되게 하는 웹앱입니다. 픽토그램을 그때그때 합성하는 엔진과 음성 문장을 다시 쓰는 엔진을 직접 만들었습니다.

다만 저희는 학생이어서, 이것이 실제 현장에서 어떻게 받아들여질지 판단하기가 어렵습니다. 공개된 연구와 활동을 보고 연락드렸습니다. 선생님께서 보시기에 무엇이 문제인지 알려 주신다면 저희에게 큰 도움이 될 것 같습니다.

혹시 시간이 되신다면, 아래 설문에 한 번만 답해 주실 수 있을까요?

{link}

부족한 점을 짚어 주시는 답이 저희에게 가장 도움이 됩니다. 잘 만들었다는 말보다 어디가 잘못되었는지를 알고 싶습니다.

읽어 주셔서 감사합니다.

{signature}
""",
    'en': """{greeting}

I am a third-year student on the IT diploma programme at ChungNam Samsung Academy in the Republic of Korea. My team reached the final round of the 16th e-ICON World Contest, hosted by the Korean Ministry of Education, and we are working on a project called SnapCare. It is a web app that takes a photograph of a prescription and delivers the dosing instructions as pictograms and speech, for someone who cannot read the text. We built both the engine that composes the pictograms and the one that rewrites the spoken sentences ourselves.

We are students, though, and we cannot really judge how this would be received in practice. We came across your published work and public activity, and it would help us a great deal if you could tell us what you see wrong with it.

If you can spare the time, might we ask you to fill in the short survey below?

{link}

The answers that help us most are the ones that point out what is wrong. We would rather learn where this fails than be told that it is good.

Thank you for reading.

{signature}
""",
    'ro': """{greeting}

Sunt elev în anul al treilea la programul de diplomă în IT al ChungNam Samsung Academy din Republica Coreea. Echipa mea a ajuns în runda finală a celei de-a 16-a ediții a e-ICON World Contest, organizat de Ministerul Educației din Coreea, și lucrăm la un proiect numit SnapCare. Este o aplicație web care fotografiază o rețetă și transmite instrucțiunile de administrare prin pictograme și voce, pentru cineva care nu poate citi textul. Am construit noi înșine atât motorul care compune pictogramele, cât și pe cel care rescrie propozițiile rostite.

Suntem însă elevi și nu putem aprecia cu adevărat cum ar fi primit acest lucru în practică. Am aflat despre lucrările și activitatea dumneavoastră publică, și ne-ar ajuta foarte mult dacă ne-ați spune ce vedeți greșit în el.

Dacă aveți timp, v-am putea ruga să completați scurtul chestionar de mai jos?

{link}

Răspunsurile care ne ajută cel mai mult sunt cele care arată ce este greșit. Am prefera să aflăm unde dă greș decât să ni se spună că este bun.

Vă mulțumim pentru lectură.

{signature}
""",
}

SIGNATURE = {
    'ko': '충남삼성고등학교 3학년 남윤수\n제16회 e-ICON 세계대회 본선 진출 · SnapCare\n{email}',
    'en': '{name_en}\nChungNam Samsung Academy, Republic of Korea\nSnapCare — finalist, 16th e-ICON World Contest\n{email}',
    'ro': '{name_en}\nChungNam Samsung Academy, Republica Coreea\nSnapCare — finalist, a 16-a ediție e-ICON World Contest\n{email}',
}


def display_width(text: str) -> int:
    """화면에서 차지하는 칸 수. 한글과 한자는 두 칸을 차지한다."""
    return sum(2 if unicodedata.east_asian_width(ch) in 'WF' else 1 for ch in text)


def wrap_paragraph(text: str, width: int = 74) -> str:
    """문단 하나를 width 칸에서 접는다.

    textwrap 을 쓰지 않는다 — 그것은 글자 수를 세므로, 한글 74자는 화면에서 148칸이
    되어 받는 쪽에서 아무 데서나 잘린다. 메일은 폭이 좁은 창에서 읽히는 일이 많고,
    직접 접어 두지 않으면 클라이언트가 잘라 놓은 자리가 문장 중간에 걸린다.
    """
    out: list[str] = []
    line = ''
    for word in text.split(' '):
        if not line:
            line = word
        elif display_width(line + ' ' + word) <= width:
            line += ' ' + word
        else:
            out.append(line)
            line = word
    if line:
        out.append(line)
    return '\n'.join(out)


def wrap_body(text: str, width: int = 74) -> str:
    """본문 전체를 접는다.

    두 가지는 건드리지 않는다. 링크가 든 덩어리는 접으면 링크가 깨진다. 그리고 **이미
    줄이 나뉘어 있는 덩어리** 는 그렇게 쓴 이유가 있는 것이므로 그대로 둔다 — 서명이
    그렇다. 한때 '<' 가 들어 있는지로 서명을 알아봤는데, 서명에서 꺾쇠를 빼자마자
    세 줄이 한 줄로 뭉쳐졌다. 모양이 아니라 성질로 판단해야 한다.
    """
    done = []
    for b in text.split('\n\n'):
        if 'http' in b or '\n' in b.strip():
            done.append(b)
        else:
            done.append(wrap_paragraph(' '.join(b.split()), width))
    return '\n\n'.join(done)


def compose(row: dict, lang: str, sender: str, sender_name: str) -> tuple[str, str]:
    name = (row.get(COL_NAME) or '').strip()
    if lang == 'ko':
        greeting = korean_greeting(name)
    else:
        # 한글을 걷어낸 이름으로 부른다. 남는 것이 없으면 이름 없이 부른다.
        shown = latin_only(name)
        person, org = GREET[lang]
        if shown:
            greeting = (person if looks_like_person(shown) else org).format(name=shown)
        else:
            greeting = {'en': 'Dear colleagues,', 'ro': 'Stimați colegi,'}[lang]
    token = (row.get(COL_TOKEN) or '').strip()
    link = f'{BASE}?lang={lang}&r={token}'
    # 로마자 표기는 본인이 정해야 한다. 776통에 잘못된 표기가 나가면 되돌릴 수 없다.
    name_en = os.environ.get('SNAPCARE_SENDER_EN', '').strip() or 'Namyunsu Nam'
    body = BODY[lang].format(
        greeting=greeting,
        link=link,
        signature=SIGNATURE[lang].format(email=sender, name_en=name_en),
    )
    return SUBJECT[lang], wrap_body(body)


# ────────────────────────── 보낸 기록 ──────────────────────────

def load_log(path: Path) -> set[str]:
    if not path.exists():
        return set()
    done = set()
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            done.add(json.loads(line)['email'].lower())
        except Exception:
            continue
    return done


def append_log(path: Path, email: str, lang: str, token: str, msgid: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as f:
        f.write(json.dumps({'email': email, 'lang': lang, 'token': token,
                            'messageId': msgid, 'at': time.strftime('%Y-%m-%dT%H:%M:%S%z')},
                           ensure_ascii=False) + '\n')
        f.flush()
        os.fsync(f.fileno())  # 노트북이 죽어도 기록이 남아야 두 번 보내지 않는다


# ────────────────────────── 발송 ──────────────────────────

KEYCHAIN_SERVICE = 'snapcare-naver'


def app_password(account: str) -> str:
    """앱 비밀번호를 가져온다. 환경변수가 없으면 맥 키체인에서 찾는다.

    환경변수(NAVER_APP_PW)는 편하지만 ~/.zshenv 에 평문으로 남고, 그 파일은 아무 프로그램이나
    읽을 수 있다. 키체인에 넣으면 잠긴 저장소에 들어가고 이 스크립트가 꺼내 쓸 때만 나온다.

        security add-generic-password -s snapcare-naver -a 내아이디@naver.com -w

    -w 뒤에 값을 적지 않으면 화면에 물어보므로 셸 기록에도 남지 않는다.

    어느 쪽이든 이 함수가 돌려준 값은 SMTP 로만 넘어간다. 화면에도 로그에도 찍지 않는다.
    """
    env = os.environ.get('NAVER_APP_PW', '')
    if env:
        return env
    if sys.platform != 'darwin' or not account:
        return ''
    import subprocess
    r = subprocess.run(
        ['security', 'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
        capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ''


def build_message(to: str, subject: str, body: str, sender: str, sender_name: str) -> EmailMessage:
    m = EmailMessage()
    m['From'] = formataddr((str(Header(sender_name, 'utf-8')), sender)) if sender_name else sender
    m['To'] = to
    m['Subject'] = Header(subject, 'utf-8')
    m['Date'] = formatdate(localtime=True)
    m['Message-ID'] = make_msgid(domain='snapcare.fly.dev')
    m['Reply-To'] = sender
    # 자동 회신과 수신확인을 막는다. 1103통에 부재중 자동응답이 섞이면 읽을 수 없다.
    m['Auto-Submitted'] = 'auto-generated'
    m['X-Auto-Response-Suppress'] = 'All'
    m.set_content(body, subtype='plain', charset='utf-8')
    return m


def main() -> int:
    ap = argparse.ArgumentParser(description='네이버 메일로 설문 안내를 보낸다')
    ap.add_argument('--xlsx', type=Path, default=XLSX)
    ap.add_argument('--log', type=Path, default=LOG)
    ap.add_argument('--limit', type=int, default=300, help='이번에 보낼 최대 통수 (기본 300)')
    ap.add_argument('--gap', type=float, default=8.0, help='통 사이 간격, 초 (기본 8)')
    ap.add_argument('--backoff', type=float, default=60.0,
                    help='막혔을 때 기다리는 초. 시도마다 배로 늘어난다 (기본 60)')
    ap.add_argument('--only', choices=['ko', 'en', 'ro'], help='이 언어만 보낸다')
    ap.add_argument('--lang-ro', action='store_true',
                    help='.md/.ro 34명에게 루마니아어로 보낸다 (없으면 영어). 원어민 감수 후에 켜라')
    ap.add_argument('--test-to', help='명단을 무시하고 이 주소로 한 통만 보낸다')
    ap.add_argument('--no-priority', action='store_true',
                    help='등급 A 를 먼저 보내지 않고 명단 순서대로 보낸다')
    ap.add_argument('--send', action='store_true', help='실제로 보낸다. 없으면 미리보기만')
    args = ap.parse_args()

    sender = os.environ.get('NAVER_ID', '').strip()
    sender_name = os.environ.get('SNAPCARE_SENDER_NAME', '').strip()
    pw = app_password(sender)

    rows = [r for r in read_roster(args.xlsx) if (r.get(COL_EMAIL) or '').strip()]
    done = load_log(args.log)

    # ── 미리보기 ──
    if args.test_to:
        queue = [(dict(rows[0], **{COL_EMAIL: args.test_to}), args.only or 'ko')]
    else:
        queue = []
        for r in rows:
            lang = language_of(r, args.lang_ro)
            if args.only and lang != args.only:
                continue
            if (r.get(COL_EMAIL) or '').strip().lower() in done:
                continue
            queue.append((r, lang))
        # 등급 A 를 먼저 보낸다.
        #
        # 명단은 등급 순이 아니다 — 손으로 고른 41명이 1103명에 흩어져 있다. 하루 300통씩
        # 나눠 보내면 가장 근거가 뚜렷한 사람들이 나흘에 걸쳐 나가고, 중간에 계정이 잠기거나
        # 대회 일정이 당겨지면 그 41명 중 일부가 못 받는다. 순서만 바꿔도 그 위험이 없어진다.
        if not args.no_priority:
            queue.sort(key=lambda x: 0 if (x[0].get(COL_GRADE) or '').strip().upper() == 'A' else 1)

    counts: dict[str, int] = {}
    for _, lang in queue:
        counts[lang] = counts.get(lang, 0) + 1

    print(f'명단 {len(rows)}명 · 이미 보낸 사람 {len(done)}명 · 남은 사람 {len(queue)}명')
    print('  언어별 남은 수: ' + (', '.join(f'{k} {v}' for k, v in sorted(counts.items())) or '없음'))
    batch = queue[: args.limit]
    a_total = sum(1 for r, _ in queue if (r.get(COL_GRADE) or '').strip().upper() == 'A')
    a_batch = sum(1 for r, _ in batch if (r.get(COL_GRADE) or '').strip().upper() == 'A')
    print(f'  이번에 보낼 수: {len(batch)}통 (간격 {args.gap}초, 약 {len(batch) * args.gap / 60:.0f}분)')
    print(f'  등급 A: 남은 {a_total}명 중 이번에 {a_batch}명' + ('  ← 먼저 보낸다' if not args.no_priority else ''))
    if not args.lang_ro and not args.test_to:
        print('  루마니아어 34명은 영어로 나간다 (--lang-ro 로 바꿀 수 있다)')
    print()

    if queue:
        r, lang = queue[0]
        subj, body = compose(r, lang, sender or 'me@naver.com', sender_name or 'SnapCare')
        print('─' * 68)
        print(f'첫 통 미리보기 → {r.get(COL_EMAIL)}  [{lang}]')
        print(f'제목: {subj}')
        print('─' * 68)
        print(body)
        print('─' * 68)

    if not args.send:
        print('\n미리보기만 돌았다. 실제로 보내려면 --send 를 붙여라.')
        return 0

    # ── 실제 발송 ──
    if not sender:
        print("\nNAVER_ID 가 필요하다.\n")
        print("  export NAVER_ID='내아이디@naver.com'")
        return 2
    if not pw:
        print('\n앱 비밀번호를 찾지 못했다. 둘 중 하나로 넣어라 — 어느 쪽이든 이 스크립트는')
        print('값을 화면이나 로그에 찍지 않는다.\n')
        print('  (권장) 맥 키체인에 넣는다. -w 뒤를 비우면 화면에 물어보므로 셸 기록에 남지 않는다.')
        print(f'    security add-generic-password -s {KEYCHAIN_SERVICE} -a {sender} -w\n')
        print('  (간단) ~/.zshenv 를 편집기로 열어 한 줄 적는다. echo 로 넣지 마라 — 기록에 남는다.')
        print("    export NAVER_APP_PW='애플리케이션_비밀번호'")
        return 2

    ctx = ssl.create_default_context()
    total = min(len(queue), args.limit)
    sent = failed = 0

    def connect() -> smtplib.SMTP_SSL:
        smtp = smtplib.SMTP_SSL('smtp.naver.com', 465, context=ctx, timeout=30)
        try:
            smtp.login(sender, pw)
        except smtplib.SMTPAuthenticationError:
            # 네이버는 아이디만으로 받는 경우가 있다. 비밀번호는 여기서도 찍지 않는다.
            smtp.login(sender.split('@')[0], pw)
        return smtp

    smtp = connect()
    print(f'smtp.naver.com 로그인 성공 ({sender})\n')
    try:
        i = 0
        for r, lang in queue[: args.limit]:
            i += 1
            to = (r.get(COL_EMAIL) or '').strip()
            subj, body = compose(r, lang, sender, sender_name)
            msg = build_message(to, subj, body, sender, sender_name)

            # 한 통에 대해 최대 세 번까지 버틴다.
            #
            # 오래 도는 발송에서 연결이 끊기는 것은 정상이다 — 서버가 일정 통수마다 끊거나,
            # 속도가 빠르면 잠시 막는다. 전에는 그때 스크립트가 끝나 버렸고, 하루 한도에
            # 닿지도 않았는데 남은 사람을 다음 날로 넘기고 있었다. 다시 연결하고 기다려
            # 이어 가면 한 번에 끝낼 수 있다.
            #
            # 거부된 주소(5xx)는 다시 시도하지 않는다 — 없는 주소는 몇 번을 보내도 없다.
            for attempt in range(3):
                try:
                    smtp.send_message(msg)
                    break
                except (smtplib.SMTPRecipientsRefused, smtplib.SMTPDataError) as e:
                    code = getattr(e, 'smtp_code', 0) or 0
                    if 400 <= code < 500:            # 일시적 거절 — 기다렸다 다시
                        wait = args.backoff * (attempt + 1)
                        print(f'  [{i:4}/{total}] 일시 거절({code}) — {wait:.0f}초 뒤 다시')
                        time.sleep(wait)
                        continue
                    failed += 1
                    print(f'  [{i:4}/{total}] 거부 {to} — {e}')
                    break
                except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as e:
                    wait = args.backoff * (attempt + 1)
                    print(f'  [{i:4}/{total}] 연결 끊김 ({e}) — {wait:.0f}초 뒤 다시 연결')
                    time.sleep(wait)
                    try:
                        smtp.close()
                    except Exception:                 # noqa: BLE001
                        pass
                    try:
                        smtp = connect()
                    except smtplib.SMTPException as e2:
                        print(f'\n다시 연결하지 못했다: {e2}')
                        print(f'{sent}통 보냈다. 같은 명령을 다시 치면 이어서 간다.')
                        return 1
                    continue
                except smtplib.SMTPException as e:
                    print(f'\n보낼 수 없다: {e}')
                    print(f'{sent}통 보냈다. 같은 명령을 다시 치면 이어서 간다.')
                    return 1
            else:
                # 세 번 다 실패 — 계정이 막힌 것일 수 있으므로 더 밀어붙이지 않는다.
                print(f'\n{to} 에 세 번 실패했다. 계정이 막혔을 수 있으니 멈춘다.')
                print(f'{sent}통 보냈다. 얼마 뒤 같은 명령을 다시 치면 이어서 간다.')
                return 1

            if not args.test_to:
                append_log(args.log, to, lang, (r.get(COL_TOKEN) or '').strip(), msg['Message-ID'])
            sent += 1
            print(f'  [{i:4}/{total}] {lang}  {to}')
            if i < total:
                time.sleep(args.gap)
    except KeyboardInterrupt:
        print(f'\n중단했다. {sent}통 보냈고 기록에 남았다. 다시 돌리면 이어서 간다.')
        return 1
    finally:
        try:
            smtp.quit()
        except Exception:                             # noqa: BLE001
            pass

    print(f'\n{sent}통 보냈다. 거부된 주소 {failed}개.')
    if not args.test_to:
        print(f'기록: {args.log}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

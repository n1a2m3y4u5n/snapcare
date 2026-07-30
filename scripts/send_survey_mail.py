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

3. 비밀번호를 환경변수에 넣는다. 이 파일에도, 이 저장소 어디에도 적지 않는다.

     export NAVER_ID='내아이디@naver.com'
     export NAVER_APP_PW='발급받은_비밀번호'

   `~/.zshenv` 에 적어 두면 매번 치지 않아도 된다. 스크립트는 이 값을 읽어 SMTP 에
   넘기기만 하고, 화면에 찍거나 로그에 남기지 않는다.

## 중간에 끊겨도 된다

보낸 사람은 `--log` 파일에 한 줄씩 적힌다. 다시 돌리면 그 파일을 읽어 건너뛴다.
네이버가 중간에 막든 노트북을 덮든, 같은 명령을 다시 치면 이어서 간다. 같은 사람에게
두 번 가는 것이 이 작업에서 가장 나쁜 실패이므로, 보내기 직전이 아니라 **보낸 직후에**
기록한다 — 보내고 기록에 실패하면 다시 보낼 위험이 있지만, 기록하고 보내기에 실패하면
그 사람은 영영 못 받는다. 후자가 더 나쁘다고 판단했다.

## 하루에 몇 통까지인가

네이버는 개인 계정의 하루 발송량을 제한하는데 공개된 숫자가 일정하지 않다. 그래서
기본값을 낮게 잡았다 — 하루 300통, 통 사이 20초. 1103명이면 나흘이다. 한 번에 몰아
보내면 계정이 잠기거나 받는 쪽에서 스팸으로 걸러질 수 있고, 스팸으로 걸러진 것은
다시 보낼 수도 없다. 급해도 이 숫자를 크게 올리지 않는 편이 낫다.
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
COL_NAME, COL_AFFIL, COL_EMAIL, COL_TOKEN, COL_REGION, COL_WHY = 'E', 'F', 'H', 'I', 'L', 'K'


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


ORG_WORDS = ('대학', '재단', '학회', '협회', '연구소', '연구원', '센터', '사무소', '보건부', '부처',
             '청', '공식 창구', 'Membership', 'Foundation', 'Association', 'Institute', 'Office',
             'Society', 'Federation', 'Ministry', 'University', 'Fundația', 'Team', '팀')


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


# ────────────────────────── 메일 본문 ──────────────────────────

SUBJECT = {
    'ko': 'SnapCare — 글을 읽지 못하는 사람의 복약 안내에 대한 전문가 의견을 부탁드립니다',
    'en': 'Request for expert feedback — SnapCare, medication guidance for people who cannot read',
    'ro': 'Solicitare de opinie de specialitate — SnapCare, ghidarea medicației pentru cei care nu pot citi',
}

GREET = {
    'ko': ('{name} 님께', '{name} 담당자분께'),
    'en': ('Dear {name},', 'Dear colleagues at {name},'),
    'ro': ('Stimate/Stimată {name},', 'Stimați colegi de la {name},'),
}

BODY = {
    'ko': """{greeting}

저희는 한국과 몰도바 학생으로 이루어진 팀이고, 제16회 e-ICON 세계대회에 SnapCare 를 출품했습니다. 글을 읽지 못하는 사람이 처방전을 사진으로 찍으면 복약 지시가 그림과 음성으로 전달되게 하는 웹앱입니다. 픽토그램을 그때그때 합성하는 엔진과 음성 문장을 다시 쓰는 엔진을 직접 만들었습니다.

만들어 놓고 보니 저희가 판단할 수 없는 것이 남았습니다. 이 방향이 맞는지, 어디서 무너지는지, 저희가 무엇을 모르고 있는지입니다. 그래서 {field} 쪽에서 일해 오신 분들께 여쭙고 있습니다.

아래 링크에서 저희가 만든 화면을 직접 보시고, 선생님 분야에 해당하는 문항에만 답해 주시면 됩니다. 8~10분 걸립니다.

{link}

저희에게 가장 값어치 있는 답은 칭찬이 아니라 "이건 이래서 안 된다" 는 쪽입니다. 불리한 답도 선택지에 그대로 넣어 두었습니다.

성함과 소속은 저희 문서에 인용할 때 함께 적으며, 첫 화면에 그 내용을 적어 두었습니다. 답하지 않으셔도 되고, 이 메일을 더 받지 않으시려면 회신해 주시면 다시 보내지 않습니다.

읽어 주셔서 감사합니다.

{signature}
""",
    'en': """{greeting}

We are a student team from Korea and Moldova, and SnapCare is our entry to the 16th e-ICON World Contest. It is a web app that takes a photograph of a prescription and delivers the dosing instructions as pictograms and speech, for someone who cannot read the text. We built both the engine that composes the pictograms and the one that rewrites the spoken sentences ourselves.

Having built it, we are left with the questions we cannot answer ourselves: whether this direction is right, where it breaks, and what we do not know that we should. That is why we are writing to people who have worked in {field}.

The link below shows you what we built, and then asks only the questions that belong to your own field. It takes 8-10 minutes.

{link}

The most useful answer to us is not praise but "this will not work, and here is why". We left the unfavourable options in.

Your name and affiliation will appear where we quote you; the first screen sets that out. You are under no obligation to answer, and if you would rather not hear from us again, a reply saying so is enough.

Thank you for reading.

{signature}
""",
    'ro': """{greeting}

Suntem o echipă de elevi din Coreea și Republica Moldova, iar SnapCare este lucrarea noastră înscrisă la a 16-a ediție a e-ICON World Contest. Este o aplicație web care fotografiază o rețetă și transmite instrucțiunile de administrare prin pictograme și voce, pentru cineva care nu poate citi textul. Am construit noi înșine atât motorul care compune pictogramele, cât și pe cel care rescrie propozițiile rostite.

După ce am construit-o, ne-au rămas întrebările la care nu putem răspunde singuri: dacă această direcție este corectă, unde cedează și ce nu știm, dar ar trebui să știm. De aceea scriem persoanelor care au experiență în {field}.

Linkul de mai jos vă arată ce am construit, apoi vă pune doar întrebările care aparțin domeniului dumneavoastră. Durează 8-10 minute.

{link}

Cel mai util răspuns pentru noi nu este lauda, ci „asta nu va funcționa, și iată de ce". Am păstrat și variantele nefavorabile.

Numele și afilierea dumneavoastră vor apărea acolo unde vă cităm; primul ecran explică acest lucru. Nu aveți nicio obligație să răspundeți, iar dacă preferați să nu mai primiți mesaje de la noi, un răspuns în acest sens este suficient.

Vă mulțumim pentru lectură.

{signature}
""",
}

# 어느 분야에 여쭙는지. 한 줄이지만 이것이 있어야 "왜 나한테" 라는 물음에 답이 된다.
FIELD = {
    'ko': '복약 안내와 저문해 사용자',
    'en': 'medication guidance and low-literacy users',
    'ro': 'ghidarea medicației și lucrul cu utilizatori cu alfabetizare redusă',
}

SIGNATURE = {
    'ko': 'SnapCare 팀 (한국·몰도바 합동) — 제16회 e-ICON 세계대회\n{sender}',
    'en': 'The SnapCare team (Korea and Moldova) — 16th e-ICON World Contest\n{sender}',
    'ro': 'Echipa SnapCare (Coreea și Republica Moldova) — a 16-a ediție e-ICON World Contest\n{sender}',
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
    """본문 전체. 링크가 있는 줄은 접지 않는다 — 접으면 링크가 깨진다."""
    blocks = text.split('\n\n')
    done = []
    for b in blocks:
        if 'http' in b or '<' in b:
            done.append(b)
        else:
            done.append(wrap_paragraph(' '.join(b.split()), width))
    return '\n\n'.join(done)


def compose(row: dict, lang: str, sender: str, sender_name: str) -> tuple[str, str]:
    name = (row.get(COL_NAME) or '').strip()
    person, org = GREET[lang]
    greeting = (person if looks_like_person(name) else org).format(name=name or '—')
    token = (row.get(COL_TOKEN) or '').strip()
    link = f'{BASE}?lang={lang}&r={token}'
    body = BODY[lang].format(
        greeting=greeting,
        field=FIELD[lang],
        link=link,
        signature=SIGNATURE[lang].format(sender=f'{sender_name} <{sender}>' if sender_name else sender),
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
    ap.add_argument('--gap', type=float, default=20.0, help='통 사이 간격, 초 (기본 20)')
    ap.add_argument('--only', choices=['ko', 'en', 'ro'], help='이 언어만 보낸다')
    ap.add_argument('--lang-ro', action='store_true',
                    help='.md/.ro 34명에게 루마니아어로 보낸다 (없으면 영어). 원어민 감수 후에 켜라')
    ap.add_argument('--test-to', help='명단을 무시하고 이 주소로 한 통만 보낸다')
    ap.add_argument('--send', action='store_true', help='실제로 보낸다. 없으면 미리보기만')
    args = ap.parse_args()

    sender = os.environ.get('NAVER_ID', '').strip()
    sender_name = os.environ.get('SNAPCARE_SENDER_NAME', '').strip()
    pw = os.environ.get('NAVER_APP_PW', '')

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

    counts: dict[str, int] = {}
    for _, lang in queue:
        counts[lang] = counts.get(lang, 0) + 1

    print(f'명단 {len(rows)}명 · 이미 보낸 사람 {len(done)}명 · 남은 사람 {len(queue)}명')
    print('  언어별 남은 수: ' + (', '.join(f'{k} {v}' for k, v in sorted(counts.items())) or '없음'))
    print(f'  이번에 보낼 수: {min(len(queue), args.limit)}통 (간격 {args.gap}초)')
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
    if not sender or not pw:
        print('\nNAVER_ID 와 NAVER_APP_PW 환경변수가 필요하다. 이 스크립트는 값을 화면에 찍지 않는다.\n')
        print("  export NAVER_ID='내아이디@naver.com'")
        print("  export NAVER_APP_PW='애플리케이션_비밀번호'")
        return 2

    ctx = ssl.create_default_context()
    sent = failed = 0
    try:
        with smtplib.SMTP_SSL('smtp.naver.com', 465, context=ctx, timeout=30) as smtp:
            try:
                smtp.login(sender, pw)
            except smtplib.SMTPAuthenticationError:
                # 네이버는 아이디만으로 받는 경우가 있다. 비밀번호는 여기서도 찍지 않는다.
                smtp.login(sender.split('@')[0], pw)
            print(f'smtp.naver.com 로그인 성공 ({sender})\n')

            for i, (r, lang) in enumerate(queue[: args.limit], 1):
                to = (r.get(COL_EMAIL) or '').strip()
                subj, body = compose(r, lang, sender, sender_name)
                msg = build_message(to, subj, body, sender, sender_name)
                try:
                    smtp.send_message(msg)
                except (smtplib.SMTPRecipientsRefused, smtplib.SMTPDataError) as e:
                    failed += 1
                    print(f'  [{i:4}/{min(len(queue), args.limit)}] 거부 {to} — {e}')
                    continue
                except smtplib.SMTPException as e:
                    # 연결이 끊긴 것이므로 여기서 멈춘다. 기록이 남아 있으니 다시 돌리면 이어진다.
                    print(f'\n연결이 끊겼다: {e}')
                    print(f'{sent}통 보냈다. 같은 명령을 다시 치면 이어서 간다.')
                    return 1
                if not args.test_to:
                    append_log(args.log, to, lang, (r.get(COL_TOKEN) or '').strip(), msg['Message-ID'])
                sent += 1
                print(f'  [{i:4}/{min(len(queue), args.limit)}] {lang}  {to}')
                if i < min(len(queue), args.limit):
                    time.sleep(args.gap)
    except KeyboardInterrupt:
        print(f'\n중단했다. {sent}통 보냈고 기록에 남았다. 다시 돌리면 이어서 간다.')
        return 1

    print(f'\n{sent}통 보냈다. 거부된 주소 {failed}개.')
    if not args.test_to:
        print(f'기록: {args.log}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

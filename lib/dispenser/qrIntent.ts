/**
 * 사진에서 읽어낸 QR 하나가 무엇을 뜻하는지.
 *
 * 왜 이 파일이 필요한가
 * ---------------------
 * 기기 라벨에는 QR 이 **네 개** 인쇄돼 있다 (`server.py` 의 `/label`):
 *
 *     wifi    설정용 핫스팟에 붙는 코드
 *     setup   그 핫스팟에서 열리는 설정 페이지
 *     device  집 와이파이에 붙은 뒤의 기기 주소
 *     pair    짝짓기 코드          ← 우리가 원하는 것
 *
 * 그런데 이 앱을 쓰는 사람은 "QR 을 고른다" 는 일을 하지 않는다. 상자를 찍을 뿐이다.
 * `jsQR` 은 사진에서 **하나만** 돌려주고 어느 것을 집을지는 정해져 있지 않으므로,
 * 짝짓기 코드만 알아보는 앱은 넷 중 셋에서 아무 일도 하지 않는다 — 그리고 "찍었는데
 * 아무 일도 안 났다" 는 글을 못 읽는 사람이 스스로 빠져나올 수 없는 상태다.
 *
 * 그래서 넷을 다 알아본다. 우리가 할 수 있는 일이 없는 것(wifi)까지 포함해서 —
 * 무엇을 찍었는지 알면 최소한 **다음에 무엇을 찍어야 하는지** 말해 줄 수 있고,
 * 그것이 아무 일도 안 나는 것과의 차이다.
 *
 * 여기서 판단만 하고 행동하지 않는 이유: 이 결정은 카메라 화면에도, 설정 화면의
 * 짝짓기 칸에도, 나중에 생길 어떤 스캐너에도 똑같이 필요하다. 순수 함수라 브라우저
 * 없이 시험할 수 있다는 것도 같은 값이다.
 */

import { claimFromPairUrl, normaliseClaim } from './claim.ts';

export type QrIntent =
  /** 짝짓기 코드. `claim` 은 열 글자로 정규화돼 있다. */
  | { kind: 'pair'; claim: string }
  /** 기기 자신의 주소 — 집 와이파이에 이미 붙어 있다는 뜻이다. */
  | { kind: 'device'; url: string }
  /** 설정 페이지. 지금 그 핫스팟에 붙어 있을 때만 열린다. */
  | { kind: 'setup'; url: string }
  /** 와이파이 접속 정보. 앱이 폰을 다른 망에 붙일 수는 없다. */
  | { kind: 'wifi'; ssid: string }
  /**
   * 상자 **화면**에 뜬 복용 결과. 인터넷이 없을 때의 기록 경로다.
   *
   * 라벨의 넷과 달리 이것은 종이가 아니라 화면에 뜨고, 그래서 사람이 상자 앞에 서서
   * 찍는다. 기기 탭에 따로 있던 것을 카메라로 옮기면서 여기 들어왔다 — 이 앱에서
   * 사진을 찍는 자리는 하나여야 하고, "무엇을 찍었는지" 는 이 파일이 답한다.
   */
  | { kind: 'event'; sc1: string }
  /** SnapCare 와 무관하거나 알아볼 수 없는 코드. */
  | { kind: 'unknown' };

/** `WIFI:S:이름;T:WPA;P:암호;;` — 기기가 `identity.wifi_qr` 로 만드는 형식. */
const WIFI_PREFIX = 'WIFI:';

/**
 * 설정 페이지 주소는 **이름이 아니라 숫자 주소**다 (`provisioning.setup_url`).
 * 핫스팟에는 믿을 만한 이름 해석이 없어서 그렇게 정해져 있고, 덕분에 기기 주소와
 * 구별이 된다 — 저쪽은 `pilldispenser.local` 이다.
 */
const SETUP_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;

/** `provisioning.device_url` 이 쓰는 이름. `config.MDNS_HOSTNAME` 과 짝이다. */
const DEVICE_HOST = /(^|\.)pilldispenser\.local$/i;

/**
 * QR 하나를 읽어, 이 앱이 무엇을 해야 하는지 답한다.
 *
 * 순서가 의미를 갖는다. 짝짓기를 **가장 먼저** 본다 — 릴레이가 설정된 기기의 짝짓기
 * 코드는 `https://…/pair#CODE` 라 그냥 URL 이기도 해서, 주소 규칙을 먼저 태우면
 * 짝짓기 코드가 "모르는 주소" 로 떨어진다.
 */
export function readQr(text: string | null | undefined): QrIntent {
  const raw = (text ?? '').trim();
  if (!raw) return { kind: 'unknown' };

  // 1) 짝짓기. 두 형식 다 — `SNAPCARE-PAIR:CODE` 와 `https://릴레이/pair#CODE`.
  const claim = claimFromPairUrl(raw);
  if (claim) return { kind: 'pair', claim };

  // 2) 코드만 덜렁 적힌 경우. 사람이 라벨의 **글자**를 찍었거나, 다른 앱이 만든
  //    QR 일 수 있다. 열 글자가 우리 알파벳에 맞으면 짝짓기 코드로 본다 —
  //    그 알파벳은 O·I·L·0·1 이 빠져 있어서 우연히 맞기 어렵다.
  const bare = normaliseClaim(raw);
  if (bare) return { kind: 'pair', claim: bare };

  // 3) 상자 화면의 복용 결과. `SC1*E*` 로 시작하는 것은 이것뿐이다.
  if (/^SC1\*E\*/i.test(raw)) return { kind: 'event', sc1: raw };

  // 4) 와이파이. 우리가 폰을 다른 망에 붙일 수는 없지만, 무엇을 찍었는지는 안다.
  if (raw.toUpperCase().startsWith(WIFI_PREFIX)) {
    return { kind: 'wifi', ssid: wifiSsid(raw) };
  }

  // 5) 주소 둘. 호스트로 가른다.
  const host = hostOf(raw);
  if (host) {
    if (DEVICE_HOST.test(host)) return { kind: 'device', url: raw };
    if (SETUP_HOST.test(host)) return { kind: 'setup', url: raw };
  }

  return { kind: 'unknown' };
}

/**
 * `WIFI:S:이름;…` 에서 이름만.
 *
 * 이 형식은 `\;` 로 세미콜론을 escape 하므로 그냥 `split(';')` 하면 이름에 세미콜론이
 * 든 망에서 잘린다. 흔하진 않지만, 잘린 이름을 사람에게 읽어 주면 그 사람은 존재하지
 * 않는 망을 찾게 된다.
 */
function wifiSsid(text: string): string {
  const body = text.slice(WIFI_PREFIX.length);
  const match = /(?:^|;)S:((?:\\.|[^;\\])*)/.exec(body);
  return match ? match[1].replace(/\\(.)/g, '$1') : '';
}

/** URL 의 호스트. URL 이 아니면 빈 문자열 — 던지지 않는다. */
function hostOf(text: string): string {
  try {
    return new URL(text).hostname;
  } catch {
    return '';
  }
}

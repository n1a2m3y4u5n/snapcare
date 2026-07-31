import { connect as tlsConnect } from 'node:tls';

/**
 * 응답이 들어오면 우리에게 메일 한 통을 보낸다.
 *
 * 왜 서버에서 보내는가. 볼륨을 사람이 들여다보지 않으면 응답이 온 것을 알 수 없고,
 * 답장이 필요한 회신을 며칠 뒤에 발견하게 된다. 1103명에게 부탁해 놓고 우리가 늦게
 * 보는 것은 그분들 시간을 낭비하는 일이다.
 *
 * 왜 라이브러리를 쓰지 않는가. 서버는 smtp.naver.com 한 곳에, 우리 주소 한 곳으로,
 * 같은 형식만 보낸다. 그 하나를 위해 이미지에 의존성을 더하는 것보다 여기서 끝내는
 * 편이 낫다. 이 파일이 하는 일은 TLS 로 붙어 명령 예닐곱 줄을 주고받는 것이 전부다.
 *
 * ## 설정
 *
 * 세 값이 모두 있어야 보낸다. 하나라도 없으면 아무 일도 하지 않는다 — 알림이 없다고
 * 설문이 멈춰서는 안 된다.
 *
 *   fly secrets set NAVER_ID='...' NAVER_APP_PW='...' SNAPCARE_NOTIFY_TO='...'
 *
 * 값은 fly 가 보관하고 이 코드는 process.env 로 읽기만 한다. 저장소에는 적지 않는다.
 *
 * ## 실패해도 응답은 저장된다
 *
 * 부르는 쪽에서 await 하지 않는다. 네이버가 막히든 연결이 끊기든 응답 저장과 200 응답에
 * 영향을 주지 않아야 한다 — 알림은 우리 편의이고 응답은 그분이 시간을 들여 준 것이다.
 */

const HOST = 'smtp.naver.com';
const PORT = 465;

type Sock = import('node:tls').TLSSocket;

/** 한 줄 이상의 응답을 읽는다. 마지막 줄은 "250 " 처럼 코드 뒤에 빈칸이 온다. */
function readReply(sock: Sock): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last || !/^\d{3} /.test(last)) return; // 아직 이어지는 응답
      cleanup();
      resolve({ code: Number(last.slice(0, 3)), text: buf.trim() });
    };
    const onErr = (e: Error) => { cleanup(); reject(e); };
    const cleanup = () => {
      sock.off('data', onData);
      sock.off('error', onErr);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('smtp timeout')); }, 15_000);
    sock.on('data', onData);
    sock.on('error', onErr);
  });
}

async function say(sock: Sock, line: string, expect: number): Promise<void> {
  sock.write(line + '\r\n');
  const r = await readReply(sock);
  // 명령을 그대로 오류에 담지 않는다. AUTH 뒤에는 비밀번호가 실려 있다.
  if (Math.floor(r.code / 100) !== Math.floor(expect / 100)) {
    throw new Error(`smtp ${r.code}`);
  }
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** 제목에 한글이 들어가므로 RFC 2047 로 감싼다. */
const encodeSubject = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

/** 본문은 base64 로 싣는다. 줄 길이 제한과 점(.) 으로 시작하는 줄 문제를 함께 없앤다. */
function encodeBody(s: string): string {
  const raw = b64(s);
  return (raw.match(/.{1,76}/g) ?? []).join('\r\n');
}

export type Notice = { subject: string; body: string };

/**
 * 알림 한 통. 보내지 못해도 던지지 않는다.
 *
 * 부르는 쪽이 `void notify(...)` 로 부르므로, 여기서 던지면 잡히지 않는 거절이 되어
 * 프로세스를 흔든다.
 */
export async function notify({ subject, body }: Notice): Promise<void> {
  const user = process.env.NAVER_ID?.trim();
  const pass = process.env.NAVER_APP_PW?.replace(/\s+/g, '');
  const to = process.env.SNAPCARE_NOTIFY_TO?.trim();
  if (!user || !pass || !to) return; // 설정하지 않았으면 조용히 넘어간다

  let sock: Sock | null = null;
  try {
    sock = await new Promise<Sock>((resolve, reject) => {
      const s = tlsConnect({ host: HOST, port: PORT, servername: HOST }, () => resolve(s));
      s.once('error', reject);
      s.setTimeout(15_000, () => { s.destroy(); reject(new Error('connect timeout')); });
    });
    await readReply(sock); // 220 인사

    await say(sock, 'EHLO snapcare.fly.dev', 250);
    await say(sock, 'AUTH LOGIN', 334);
    await say(sock, b64(user), 334);
    await say(sock, b64(pass), 235);
    await say(sock, `MAIL FROM:<${user}>`, 250);
    await say(sock, `RCPT TO:<${to}>`, 250);
    await say(sock, 'DATA', 354);

    const headers = [
      `From: SnapCare 설문 <${user}>`,
      `To: <${to}>`,
      `Subject: ${encodeSubject(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      // 이 메일에 대한 자동 회신을 막는다. 우리가 우리에게 보내는 것이다.
      'Auto-Submitted: auto-generated',
      'X-Auto-Response-Suppress: All',
    ].join('\r\n');
    await say(sock, `${headers}\r\n\r\n${encodeBody(body)}\r\n.`, 250);
    await say(sock, 'QUIT', 221);
  } catch (err) {
    // 알림이 실패해도 응답은 이미 저장되어 있다. 기록만 남기고 넘어간다.
    console.error('[survey] 알림 메일 실패:', err instanceof Error ? err.message : err);
  } finally {
    try { sock?.destroy(); } catch { /* 이미 닫혔다 */ }
  }
}

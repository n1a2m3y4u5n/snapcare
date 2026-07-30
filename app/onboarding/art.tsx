'use client';

/**
 * 첫 화면의 그림 — 설명하지 않고 **해 보인다.**
 *
 * 왜 움직여야 하는가
 * ------------------
 * 전에는 장마다 멈춘 그림 한 장이었다. "꾹 누르면 읽어줍니다" 를 손가락 이모지와
 * 스피커 이모지를 나란히 놓아 보여줬는데, 그것은 동작을 그린 것이 아니라 동작에
 * 쓰이는 물건 둘을 늘어놓은 것이다. 누르는 것도, 기다리는 것도, 그래서 소리가
 * 나온다는 것도 그 그림에는 없다.
 *
 * 글을 못 읽는 사람에게 손짓을 가르치는 방법은 하나뿐이다 — 그 손짓이 일어나는
 * 것을 보여주는 것. LEGO 설명서가 부품 사진 대신 **단계 사이의 차이**를 그리는
 * 것과 같은 이유다. 알아보는 것은 그림이 아니라 변화다.
 *
 * 왜 CSS 인가
 * -----------
 * 이 앱은 인터넷 없이 도는 것이 전제다(§4.5). 영상도 애니메이션 라이브러리도
 * 받아야 하는 것이고, 받아야 하는 것은 저인프라 지역에서 없는 것과 같다.
 * 키프레임은 이미 브라우저 안에 있다.
 *
 * 왜 느린가
 * ---------
 * 한 바퀴가 4~6초다. 빠른 움직임은 그 자체가 읽을 수 없는 것이 된다 — 무엇이
 * 일어났는지 알아채기 전에 끝나면 두 번 보여줘도 두 번 놓친다. 대상 사용자가
 * 고령자라는 것이 이 숫자를 정한 이유다.
 */

export type ArtKind = 'scan' | 'verdicts' | 'ages' | 'hold' | 'remind';

const CSS = `
@keyframes sc-sweep {
  0%        { transform: translateY(-14px); opacity: 0; }
  8%        { opacity: 1; }
  46%       { transform: translateY(64px); opacity: 1; }
  56%, 100% { transform: translateY(64px); opacity: 0; }
}
@keyframes sc-pop {
  0%, 52%   { transform: scale(0.2); opacity: 0; }
  66%       { transform: scale(1.12); opacity: 1; }
  74%, 92%  { transform: scale(1); opacity: 1; }
  100%      { transform: scale(1); opacity: 0; }
}
@keyframes sc-rise {
  0%, 4%   { transform: translateY(14px) scale(0.7); opacity: 0; }
  16%      { transform: translateY(0) scale(1.1); opacity: 1; }
  22%, 92% { transform: translateY(0) scale(1); opacity: 1; }
  100%     { transform: translateY(0) scale(1); opacity: 1; }
}
/* 같은 것이 왼쪽 사람에게 갔다가 오른쪽 사람에게 간다 — 판정이 사람에 달렸다는 말. */
@keyframes sc-carry {
  0%, 6%    { transform: translateX(0); }
  18%, 40%  { transform: translateX(-46px); }
  52%, 58%  { transform: translateX(0); }
  70%, 92%  { transform: translateX(46px); }
  100%      { transform: translateX(0); }
}
@keyframes sc-badge-l { 0%, 20% { opacity: 0; transform: scale(0.4); }
                        26%, 44% { opacity: 1; transform: scale(1); }
                        50%, 100% { opacity: 0; transform: scale(0.4); } }
@keyframes sc-badge-r { 0%, 72% { opacity: 0; transform: scale(0.4); }
                        78%, 96% { opacity: 1; transform: scale(1); }
                        100%     { opacity: 0; transform: scale(0.4); } }
/* 손가락이 내려앉아 **머무르고**, 그다음 소리가 나간다. 머무름이 이 손짓의 전부다. */
@keyframes sc-press {
  0%, 8%    { transform: translateY(-26px); }
  22%, 66%  { transform: translateY(0); }
  80%, 100% { transform: translateY(-26px); }
}
@keyframes sc-ring {
  0%, 20%  { transform: scale(0.35); opacity: 0; }
  26%      { opacity: 0.9; }
  56%      { transform: scale(1); opacity: 0.9; }
  64%,100% { transform: scale(1); opacity: 0; }
}
@keyframes sc-lit {
  0%, 54%   { background: var(--color-sc-line); }
  62%, 74%  { background: var(--color-sc-primary); }
  86%, 100% { background: var(--color-sc-line); }
}
@keyframes sc-wave {
  0%, 56%   { transform: scale(0.4); opacity: 0; }
  64%       { opacity: 0.85; }
  84%, 100% { transform: scale(1.5); opacity: 0; }
}
/*
 * 꾹 누르고 **미끄러뜨리기**.
 *
 * 손가락이 내려앉고(누름), 고리가 차오르고(머무름), 소리가 나간 뒤 — 거기서 멈추지
 * 않고 아래로 내려간다. 지나가는 줄이 차례로 켜지는 것이 이 장에서 새로 가르치는
 * 전부다: 손을 뗄 필요가 없다.
 *
 * 이동은 감싸는 상자가 하고(sc-hold-travel) 손가락의 나타남/사라짐은 그 안에서
 * 따로 돈다. 하나의 키프레임에 둘을 섞으면 멈춰 있는 구간의 투명도까지 이동에
 * 끌려다닌다.
 */
@keyframes sc-hold-travel {
  0%, 4%    { transform: translateY(-20px); }
  16%, 30%  { transform: translateY(0); }     /* 첫 줄 — 여기서 머무른다 */
  42%, 50%  { transform: translateY(28px); }
  62%, 70%  { transform: translateY(56px); }
  82%, 100% { transform: translateY(84px); }
}
@keyframes sc-hold-finger {
  0%       { opacity: 0; }
  8%, 88%  { opacity: 1; }
  100%     { opacity: 0; }
}
/*
 * 지나가는 줄이 켜졌다 꺼진다. 줄마다 지연을 달리해 손가락을 따라가게 한다.
 * 지연은 위 travel 의 **도착 시각**에서 그대로 온다(HOLD_LIT_AT). 계산이 아니라 표로
 * 두는 이유: 첫 줄에서만 머무르므로 간격이 고르지 않고, 공식으로 만들면 아래로 갈수록
 * 밀린다. 손가락이 가리키는 줄과 켜지는 줄이 어긋나면 이 장은 아무것도 가르치지 못한다.
 */
@keyframes sc-hold-lit {
  0%        { background: var(--color-sc-line); }
  3%, 12%   { background: var(--color-sc-primary); }
  /* 되돌아오는 지점을 적어 둔다. 없으면 12% 에서 100% 까지 CSS 가 천천히 보간해서,
     줄이 깜빡이는 대신 주기 내내 파랗게 물들어 있다 — 네 줄이 다 켜진 것처럼 보인다. */
  16%, 100% { background: var(--color-sc-line); }
}
/* 머무름을 보이는 고리 — 첫 줄에 머무르는 구간(16~30%)에 맞춰 차오른다. */
@keyframes sc-hold-ring {
  0%, 14%   { transform: scale(0.35); opacity: 0; }
  18%       { opacity: 0.9; }
  28%       { transform: scale(1); opacity: 0.9; }
  34%, 100% { transform: scale(1); opacity: 0; }
}
/* 소리 — 머무름이 끝나는 순간 퍼진다. 그래야 '기다렸더니 소리가 났다' 가 된다. */
@keyframes sc-hold-wave {
  0%, 28%   { transform: scale(0.4); opacity: 0; }
  34%       { opacity: 0.85; }
  52%, 100% { transform: scale(1.5); opacity: 0; }
}
@keyframes sc-swing {
  0%, 10%          { transform: rotate(0deg); }
  20%, 40%, 60%    { transform: rotate(13deg); }
  30%, 50%         { transform: rotate(-13deg); }
  70%, 100%        { transform: rotate(0deg); }
}

/*
 * 움직임을 줄여 달라고 한 사람에게는 멈춰서 보여준다. 이 화면은 움직임 자체가
 * 내용이라 끝 상태에 세워 둔다 — 손가락은 눌린 채로, 소리는 나간 채로.
 */
@media (prefers-reduced-motion: reduce) {
  .sc-anim { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`;

/** 한 바퀴 도는 그림. `kind` 마다 무엇을 해 보이는지가 다르다. */
export function SlideArt({ kind }: { kind: ArtKind }) {
  return (
    <div className="flex min-h-40 items-center justify-center" aria-hidden>
      <style>{CSS}</style>
      {kind === 'scan' && <Scan />}
      {kind === 'verdicts' && <Verdicts />}
      {kind === 'ages' && <Ages />}
      {kind === 'hold' && <Hold />}
      {kind === 'remind' && <Remind />}
    </div>
  );
}

const anim = (name: string, dur: string, delay = '0s'): React.CSSProperties => ({
  animation: `${name} ${dur} ${delay} infinite`,
});

/** 성분표 위로 훑는 선이 지나가고, 판정이 뜬다. */
function Scan() {
  return (
    <div className="relative flex h-36 w-28 flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm">
      {[100, 78, 90, 64, 84].map((w, k) => (
        <span key={k} className="h-2 rounded-full" style={{ width: `${w}%`, background: 'var(--color-sc-line)' }} />
      ))}
      <span className="sc-anim absolute inset-x-2 top-3 h-1 rounded-full"
            style={{ background: 'var(--color-sc-primary)', ...anim('sc-sweep', '4s') }} />
      <span className="sc-anim absolute -bottom-3 -right-3 flex h-12 w-12 items-center justify-center
                       rounded-full text-xl font-bold text-white shadow-md"
            style={{ background: 'var(--color-safe)', ...anim('sc-pop', '4s') }}>✓</span>
    </div>
  );
}

/** 세 색이 차례로 올라온다 — 한꺼번에 놓으면 세 개가 한 덩어리로 보인다. */
function Verdicts() {
  const items: [string, string][] = [
    ['var(--color-safe)', '✓'], ['var(--color-caution)', '!'], ['var(--color-avoid)', '✕'],
  ];
  return (
    <div className="flex items-center gap-4">
      {items.map(([c, mark], k) => (
        <span key={c} className="sc-anim flex h-16 w-16 items-center justify-center rounded-full
                                 text-2xl font-bold text-white"
              style={{ background: c, ...anim('sc-rise', '4.5s', `${k * 0.45}s`) }}>
          {mark}
        </span>
      ))}
    </div>
  );
}

/** 같은 사탕이 아이에게 갔다가 어른에게 간다. 판정만 달라진다. */
function Ages() {
  return (
    <div className="relative flex flex-col items-center gap-3">
      <span className="sc-anim text-3xl" style={anim('sc-carry', '6s')}>🍬</span>
      <div className="flex items-end gap-6">
        {(['state_child', 'state_adult'] as const).map((g, k) => (
          <span key={g} className="relative flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/glyphs/${g}.png`} alt="" className="h-16 w-16" />
            <span className="sc-anim absolute -right-2 -top-1 flex h-8 w-8 items-center justify-center
                             rounded-full text-sm font-bold text-white"
                  style={{
                    background: k === 0 ? 'var(--color-avoid)' : 'var(--color-safe)',
                    ...anim(k === 0 ? 'sc-badge-l' : 'sc-badge-r', '6s'),
                  }}>
              {k === 0 ? '✕' : '✓'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 이 앱 전체의 손짓 — 글 위에 손가락을 얹고 **머무르면** 읽어주고, **누른 채
 * 미끄러뜨리면** 지나가는 것을 차례로 읽는다.
 *
 * 네 가지가 순서대로 일어나야 뜻이 성립한다: 내려앉고, 고리가 차오르고(머무름),
 * 소리가 나가고, 그다음 **내려간다.** 앞의 셋 중 하나라도 빠지면 "눌렀더니 소리가
 * 났다" 가 되어 기다려야 한다는 것이 빠지고, 마지막이 빠지면 자리마다 다시 눌러야
 * 하는 줄 안다 — 화면에서 스피커 원을 걷어낼 수 있었던 것이 바로 이 마지막 때문이다.
 *
 * 줄 간격(28px)과 손가락의 이동 거리는 같은 숫자다. 그림이 가리키는 줄과 켜지는 줄이
 * 어긋나면 이 장은 아무것도 가르치지 못한다.
 */
const HOLD_LINES = [96, 74, 86, 60];
const HOLD_GAP = 28;
const HOLD_CYCLE = '5.6s';
/** 손가락이 각 줄에 닿는 시각 — sc-hold-travel 의 도착 지점(16·42·62·82%)을 초로 옮긴 것. */
const HOLD_LIT_AT = ['0.95s', '2.40s', '3.52s', '4.64s'];

function Hold() {
  return (
    <div className="relative h-40 w-36 rounded-2xl bg-white shadow-sm">
      {HOLD_LINES.map((w, k) => (
        <span key={k} className="sc-anim absolute left-5 h-2.5 rounded-full"
              style={{
                top: 34 + k * HOLD_GAP,
                width: w,
                background: 'var(--color-sc-line)',
                // 손가락이 그 줄에 닿는 순간에 맞춰 켜진다.
                ...anim('sc-hold-lit', HOLD_CYCLE, HOLD_LIT_AT[k]),
              }} />
      ))}

      {/* 손가락과 그에 딸린 것들 — 함께 내려간다 */}
      <span className="sc-anim pointer-events-none absolute left-0 top-0 h-10 w-14"
            style={{ transform: 'translateY(-20px)', ...anim('sc-hold-travel', HOLD_CYCLE) }}>
        {/* 머무름을 보이는 고리 */}
        <span className="sc-anim absolute left-3 top-6 h-9 w-9 rounded-full border-4"
              style={{ borderColor: 'var(--color-sc-primary)', ...anim('sc-hold-ring', HOLD_CYCLE) }} />
        {/* 소리 — 머무름이 끝나는 자리에서 퍼져 나간다 */}
        {[0, 1].map((k) => (
          <span key={k} className="sc-anim absolute left-1 top-4 rounded-full border-2"
                style={{
                  height: 52, width: 52,
                  borderColor: 'var(--color-sc-primary)',
                  ...anim('sc-hold-wave', HOLD_CYCLE, `${k * 0.3}s`),
                }} />
        ))}
        <span className="sc-anim absolute left-3 top-4 text-4xl" style={anim('sc-hold-finger', HOLD_CYCLE)}>👆</span>
      </span>
    </div>
  );
}

/** 종이 흔들리고 소리가 퍼진다. */
function Remind() {
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      {[0, 1].map((k) => (
        <span key={k} className="sc-anim absolute h-20 w-20 rounded-full border-2"
              style={{ borderColor: 'var(--color-avoid)', ...anim('sc-wave', '3s', `${k * 0.4}s`) }} />
      ))}
      <span className="sc-anim text-6xl" style={{ transformOrigin: '50% 15%', ...anim('sc-swing', '3s') }}>🔔</span>
    </div>
  );
}

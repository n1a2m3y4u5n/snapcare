import type { Metadata } from 'next';

/**
 * 설문 페이지의 제목과 설명.
 *
 * 페이지 자체는 클라이언트 컴포넌트라 `metadata` 를 내보낼 수 없어서 이 레이아웃에
 * 둔다. 없으면 앱 전체 제목("SnapCare — one photo, instant verdict")이 그대로
 * 남아서, 받는 분의 탭에 설문이 아니라 앱 이름이 뜬다. 메일로 받은 링크를 여러 개
 * 열어 둔 사람에게는 탭 제목이 유일한 단서다.
 *
 * 검색 색인은 막는다. 이 페이지는 명단에 있는 분들에게만 보내는 것이고, 검색으로
 * 흘러들어온 응답은 분모를 오염시킨다.
 */
export const metadata: Metadata = {
  title: 'SnapCare 전문가 의견 조사 · Expert Feedback',
  description:
    '제16회 e-ICON 세계대회 출품작 SnapCare 에 대한 전문가 의견 조사입니다. 6~7분 걸립니다.',
  robots: { index: false, follow: false },
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

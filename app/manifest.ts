import type { MetadataRoute } from 'next';

/**
 * PWA 매니페스트.
 *
 * 설치 가능해야 하는 이유는 취향이 아니라 전제다. 대상 지역은 모바일 인터넷이
 * 불안정하고 데이터가 비싸다. 매번 받아야 하는 웹페이지는 그런 곳에서 열리지 않는다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SnapCare — one photo, instant verdict',
    short_name: 'SnapCare',
    description:
      'Photograph a meal, a label, a medicine or a prescription and get an answer in pictograms, voice and one colour — no reading required.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F3EF',
    theme_color: '#323E2C',
    categories: ['health', 'medical', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

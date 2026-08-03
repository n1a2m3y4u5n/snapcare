/**
 * 이 빌드가 쓰는 릴레이 주소.
 *
 * 설정 화면 안에만 있던 값인데, 메인 카메라도 짝을 맺게 되면서 두 곳이 됐다. 두 벌로
 * 두면 한쪽만 고쳐지는 날이 오고, 그날의 증상은 "카메라로는 짝이 안 맺어진다" 다.
 */

/** 배포에서는 빌드 때 박고(fly.toml), 개발에서는 화면에서 바꾼다. */
export const CONFIGURED_RELAY = process.env.NEXT_PUBLIC_SNAPCARE_RELAY || '';

export const DEFAULT_RELAY = CONFIGURED_RELAY || 'http://localhost:8088';

/**
 * 배포본인데 주소가 없다.
 *
 * 이때 기본값 `localhost:8088` 은 **폰 자신**을 가리키므로 짝짓기가 반드시 실패한다.
 * 그런데 실패하는 모습이 "코드가 틀렸습니다" 라서, 라벨을 다시 읽고 다시 찍는 사람이
 * 생긴다. 원인은 코드가 아니라 이 빌드에 사서함 주소가 안 들어간 것이다.
 */
export const RELAY_MISSING = !CONFIGURED_RELAY && process.env.NODE_ENV === 'production';

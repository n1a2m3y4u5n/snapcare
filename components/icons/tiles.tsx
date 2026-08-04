import type { IconProps } from './index';
import {
  BellIcon, BirdIcon, DoorIcon, DropIcon, FireIcon, FlowerIcon, HomeIcon,
  KeyIcon, MoonIcon, MountainIcon, RoadIcon, SunIcon,
} from './index';

/**
 * 그림열쇠의 열두 글자.
 *
 * 이 화면이 이모지 벽이었다. 앱에서 이모지가 가장 많이 한 자리에 모이는 곳이고,
 * 하필 사람이 앱을 열 때 가장 먼저 보는 화면이다.
 *
 * **순서가 곧 열쇠다.** `bcrypt` 해시는 이모지가 아니라 **누른 자리의 번호**로
 * 만들어진다(`DEMO_KEY = [0,1,2,3]`). 그래서 그림을 바꿔도 이미 만들어 둔 열쇠는
 * 그대로 열린다 — 바뀌는 것은 같은 자리에 무엇이 그려져 있느냐뿐이다. 배열 순서를
 * 건드리면 그 순간 모든 사람의 열쇠가 깨진다.
 *
 * 열둘이 서로 안 닮아야 한다
 * --------------------------
 * 이건 장식이 아니라 **암호를 이루는 글자**다. 둘이 헷갈리면 사람이 자기 열쇠를 못
 * 누르고, 못 누르면 앱을 못 연다. 그래서 실루엣이 겹치지 않는 것끼리 고른다 —
 * 해와 꽃은 둘 다 가운데가 둥글어서 위험한 짝인데, 해는 뾰족한 살을 두고 꽃은 살
 * 대신 두꺼운 잎을 둬서 바깥 윤곽이 아예 다르게 만들었다. 종과 물방울도 위 쪽이
 * 닮아서, 종은 바닥을 평평하게 자르고 추를 달았다.
 */
export const TILE_ICONS: ((p: IconProps) => React.ReactNode)[] = [
  SunIcon, MoonIcon, DropIcon, FireIcon,
  FlowerIcon, BirdIcon, HomeIcon, MountainIcon,
  RoadIcon, DoorIcon, BellIcon, KeyIcon,
];

/** 소리로 읽어 줄 이름. 그림열쇠는 눈으로만 쓰는 것이 아니다. */
export const TILE_NAMES = [
  'Sun', 'Moon', 'Water', 'Fire',
  'Flower', 'Bird', 'House', 'Mountain',
  'Road', 'Door', 'Bell', 'Key',
];

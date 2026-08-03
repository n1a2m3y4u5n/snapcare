#!/usr/bin/env bash
#
# 알림에 필요한 비밀을 만들어 **곧바로 fly 에 넣는다.**
#
#     bash scripts/vapid-setup.sh
#
# 값이 화면에 안 찍히고 파일로도 안 남는 것이 요점이다. 한 번 출력된 개인키는
# 터미널 기록과 스크롤백에 남고, 그 둘은 아무도 지우지 않는다. 그래서 전부
# 파이프로만 흐르고 `fly secrets import` 로 표준입력에서 바로 들어간다.
#
# 무엇이 만들어지나
#   웹앱    SNAPCARE_VAPID_PRIVATE_KEY   푸시를 서명해 보내는 열쇠 (P-256, PKCS#8 DER 의 base64 한 줄)
#           SNAPCARE_PUSH_HOOK_TOKEN     릴레이가 우리를 부를 때 대야 하는 암호
#   릴레이  SNAPCARE_RELAY_HOOK_URL      어디로 부를지
#           SNAPCARE_RELAY_HOOK_TOKEN    위와 같은 암호
#
# 개인키를 한 줄 base64 로 넣는 이유: `fly secrets import` 는 NAME=VALUE 를 줄
# 단위로 읽어서 여러 줄인 PEM 을 못 받는다. 앱은 두 모양을 다 읽는다(lib/push/vapid.ts).
#
# 다시 돌리면 열쇠가 바뀐다. 그러면 이미 구독한 폰들의 등록이 전부 무효가 되고
# 각자 앱을 열어 스위치를 다시 켜야 한다. 알림이 안 온다고 함부로 다시 돌리지 말 것.
set -euo pipefail

APP="${SNAPCARE_APP:-snapcare}"
RELAY="${SNAPCARE_RELAY_APP:-snapcare-relay}"
HOOK_URL="${SNAPCARE_HOOK_URL:-https://${APP}.fly.dev/api/push/notify}"

command -v fly >/dev/null || { echo "fly 가 PATH 에 없다"; exit 1; }
command -v openssl >/dev/null || { echo "openssl 이 PATH 에 없다"; exit 1; }

echo "웹앱:    $APP"
echo "릴레이:  $RELAY"
echo "부를 주소: $HOOK_URL"
echo

# 서브셸 안에서만 살고 밖으로는 안 나온다.
(
  key="$(openssl ecparam -name prime256v1 -genkey -noout \
         | openssl pkcs8 -topk8 -nocrypt -outform DER \
         | base64 | tr -d '\n')"
  token="$(openssl rand -base64 32 | tr -d '\n=' )"

  echo "→ $APP 에 열쇠와 암호를 넣는다 (다음 배포에서 반영)"
  printf 'SNAPCARE_VAPID_PRIVATE_KEY=%s\nSNAPCARE_PUSH_HOOK_TOKEN=%s\n' "$key" "$token" \
    | fly secrets import --app "$APP" --stage >/dev/null

  echo "→ $RELAY 에 같은 암호와 주소를 넣는다"
  printf 'SNAPCARE_RELAY_HOOK_TOKEN=%s\nSNAPCARE_RELAY_HOOK_URL=%s\n' "$token" "$HOOK_URL" \
    | fly secrets import --app "$RELAY" >/dev/null
)

echo
echo "끝. 값은 어디에도 출력되지 않았다."
echo "확인:   fly secrets list --app $APP"
echo "        fly secrets list --app $RELAY"
echo "웹앱 반영: fly deploy"

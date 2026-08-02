FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 약통 사서함(릴레이) 주소.
#
# 빌드 때 넣어야 한다. `NEXT_PUBLIC_` 붙은 값은 Next 가 **묶는 시점에 코드 안으로
# 박아 넣으므로**, fly.toml 의 [env] 처럼 실행할 때 주는 것으로는 브라우저 쪽에
# 닿지 않는다. 실제로 겪으면 증상이 고약하다 — 서버(미들웨어)는 주소를 알아서 CSP 를
# 열어 주는데 화면은 localhost 로 붙으러 가고, 폰에서는 짝짓기가 조용히 실패한다.
#
#   fly deploy --build-arg NEXT_PUBLIC_SNAPCARE_RELAY=https://…
#
# 비워 두면 같은 Wi-Fi 경로만 남는다. 그때도 앱은 정상이고, 짝짓기 화면이 주소를
# 물어본다.
ARG NEXT_PUBLIC_SNAPCARE_RELAY=""
ENV NEXT_PUBLIC_SNAPCARE_RELAY=$NEXT_PUBLIC_SNAPCARE_RELAY

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 미들웨어(CSP)도 같은 값을 본다. 이쪽은 실행 시점에 읽으므로 fly.toml 의 [env] 로도
# 되지만, 둘이 어긋나면 브라우저가 연결을 막는다 — 같은 자리에서 같이 정한다.
ARG NEXT_PUBLIC_SNAPCARE_RELAY=""
ENV NEXT_PUBLIC_SNAPCARE_RELAY=$NEXT_PUBLIC_SNAPCARE_RELAY

# 파이썬 런타임 — 픽토그램 합성(SIGIL, Pillow)과 폼시트 판독(OpenCV)에 쓴다.
#
# 이 서버는 클라우드 전용이 아니다. 제안서대로 진료소에 놓인 라즈베리파이가
# 같은 이미지를 돌리는 것을 전제로 한다 — 인터넷이 없어도 현장 서버가 있으면
# 판정·픽토그램·폼시트가 전부 동작한다. py3-opencv 는 aarch64/armv7 에도 있다.
#
# apk 판(py3-opencv)을 쓰는 이유: pip 로 opencv 를 넣으려면 musl 에서 소스 빌드가 필요하다.
RUN apk add --no-cache python3 py3-pip py3-opencv py3-numpy && \
    pip3 install --no-cache-dir --break-system-packages Pillow

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/engine ./engine
# 폼시트 판독기 (파이썬) — 종이 시트 사진에서 복약 일정을 읽는다
COPY --from=builder /app/pill_dispenser ./pill_dispenser

# 데모: root로 실행 — 마운트된 /data 볼륨(서버 저장소)에 쓰기 위함
EXPOSE 3000

CMD ["node", "server.js"]

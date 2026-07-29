# The relay, in one layer.
#
# No requirements file and no `pip install`, because there is nothing to
# install — the relay is standard library only. That is worth keeping: this
# image is the thing that has to still build in two years when somebody
# inherits the project, and a dependency is a thing that can stop being
# installable.
FROM python:3.12-slim

# Unbuffered so `fly logs` shows a line when it is written rather than when the
# buffer happens to flush. On a service that is mostly idle by design, a 4 KB
# buffer is the difference between a log and an archive.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SNAPCARE_RELAY_DATA=/data \
    PORT=8080

WORKDIR /app
COPY snapcare_relay ./snapcare_relay

# Not root. The relay is reachable from the internet and writes files under
# /data; there is nothing it needs root for.
RUN useradd --create-home --uid 10001 relay \
    && mkdir -p /data \
    && chown -R relay:relay /data /app
USER relay

EXPOSE 8080

# No shell form, so the process is PID 1 and gets SIGTERM directly — which is
# what makes a deploy a clean shutdown instead of a ten-second kill.
CMD ["python3", "-m", "snapcare_relay"]

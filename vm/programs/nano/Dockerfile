FROM --platform=linux/386 alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0 AS build
RUN apk add --no-cache build-base linux-headers ncurses-dev ncurses-static ncurses-terminfo-base xz
COPY assets/nano-9.2.tar.xz /tmp/nano.tar.xz
RUN echo '05ecb99247b782e8a5b3a25ed4101dd034b0236902f7449bc9795b717642f7e9  /tmp/nano.tar.xz' | sha256sum -c - && tar -xJf /tmp/nano.tar.xz -C /tmp
WORKDIR /tmp/nano-9.2
RUN CFLAGS='-Os -march=i586' LDFLAGS='-static' ./configure --disable-nls --disable-libmagic --disable-speller --enable-utf8 && make -j4 && strip src/nano
RUN mkdir /out && cp src/nano /out/nano-i386 && cp COPYING /out/NANO-GPL-3.0.txt && cp /etc/alpine-release /out/alpine-release.txt && apk info -v > /out/build-packages.txt
RUN cp "$(find /etc/terminfo /usr/share/terminfo -name xterm-256color -type f 2>/dev/null | head -n 1)" /out/xterm-256color
FROM scratch
COPY --from=build /out/ /

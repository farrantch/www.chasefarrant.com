FROM --platform=linux/386 alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0 AS build
RUN apk add --no-cache build-base linux-headers ncurses-dev ncurses-static
COPY assets/vitetris-0.59.1.tar.gz assets/nbsdgames-6.0.2.tar.gz assets/2048-afc88986.tar.gz /tmp/
RUN cd /tmp && echo 'e9035ac874d44582843a7f48a3bbf9c0f89b618a015f018c18672e4af758e6b6  vitetris-0.59.1.tar.gz' | sha256sum -c - \
    && echo '95f9f855557c8d8359d56c175213d3c2f641cfb5744d9bbcc3226d7129087916  nbsdgames-6.0.2.tar.gz' | sha256sum -c - \
    && echo '7fcd88c09c38cbecdf6cbd47ef88787d0a42b2f7e36ad97a6bfbf3ae114db38c  2048-afc88986.tar.gz' | sha256sum -c - \
    && mkdir vitetris nbsdgames 2048 \
    && tar -xzf vitetris-0.59.1.tar.gz -C vitetris --strip-components=1 \
    && tar -xzf nbsdgames-6.0.2.tar.gz -C nbsdgames --strip-components=1 \
    && tar -xzf 2048-afc88986.tar.gz -C 2048 --strip-components=1
WORKDIR /tmp/vitetris
# vitetris 0.59.1 contains a legacy implicit-int declaration.
RUN CFLAGS='-Os -march=i586 -Wno-error=implicit-int' LDFLAGS='-static' ./configure --prefix=/opt/vitetris --without-xlib --without-joystick --without-network curses=-lncursesw pixmapdir= desktopdir= \
    && make -j4 HISCORE_FILENAME=/var/opt/vitetris/hiscores \
    && make DESTDIR=/out/rootfs install
WORKDIR /tmp/nbsdgames/src
RUN CFLAGS='-Os -march=i586' make -j4 LDFLAGS='-Wl,--dynamic-linker=/opt/nbsdgames/lib/ld-musl-i386.so.1,-rpath,/opt/nbsdgames/lib' SCORES_DIR=/var/opt/nbsdgames \
    && make DESTDIR=/out/rootfs GAMES_DIR=/opt/nbsdgames/bin MAN_DIR=/opt/nbsdgames/share/man/man6 install manpages \
    && strip /out/rootfs/opt/nbsdgames/bin/* \
    && mkdir -p /out/rootfs/opt/nbsdgames/lib \
    && cp -L /lib/ld-musl-i386.so.1 /usr/lib/libncursesw.so.6 /out/rootfs/opt/nbsdgames/lib/ \
    && mkdir -p /out/rootfs/opt/nbsdgames/share/doc \
    && cp ../LICENSE ../README.md /out/rootfs/opt/nbsdgames/share/doc/
WORKDIR /tmp/2048
RUN cc -Os -march=i586 -static -std=c99 -Wextra -o 2048 2048.c && strip 2048 && ./2048 test \
    && mkdir -p /out/rootfs/opt/2048/bin /out/rootfs/opt/2048/share/doc \
    && cp 2048 /out/rootfs/opt/2048/bin/ \
    && cp LICENSE README.md /out/rootfs/opt/2048/share/doc/
RUN apk info -v > /out/build-packages.txt \
    && cp /tmp/vitetris/licence.txt /out/VITETRIS-LICENSE.txt \
    && cp /tmp/nbsdgames/LICENSE /out/NBSDGAMES-LICENSE.txt \
    && cp /tmp/2048/LICENSE /out/2048-LICENSE.txt
FROM scratch
COPY --from=build /out/ /

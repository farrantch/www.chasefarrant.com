FROM --platform=linux/386 alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0 AS build
RUN apk add --no-cache build-base linux-headers openssl-dev openssl-libs-static zlib-dev zlib-static ca-certificates xz
COPY assets/curl-8.22.0.tar.xz /tmp/curl.tar.xz
RUN echo 'f7ef3ae8a22e521f289803fe93543eb64c329b58aa73a9e224dfd915a2a5f4f7  /tmp/curl.tar.xz' | sha256sum -c - && tar -xJf /tmp/curl.tar.xz -C /tmp
WORKDIR /tmp/curl-8.22.0
RUN CFLAGS='-Os -march=i586' LDFLAGS='-static' PKG_CONFIG='pkg-config --static' ./configure \
    --build=i586-alpine-linux-musl --host=i586-alpine-linux-musl \
    --disable-shared --enable-static --with-openssl --with-zlib \
    --without-libpsl --without-brotli --without-zstd --without-libidn2 \
    --without-nghttp2 --without-nghttp3 --without-libssh2 --without-libssh \
    --disable-ldap --disable-ldaps --disable-docs \
    --with-ca-bundle=/etc/ssl/certs/ca-certificates.crt --with-ca-path=/etc/ssl/certs \
    && make -j4 LDFLAGS='-all-static' && strip src/curl
RUN mkdir /out && cp src/curl /out/curl-i386 && cp COPYING /out/CURL-LICENSE.txt \
    && cp /etc/ssl/certs/ca-certificates.crt /out/ca-certificates.crt \
    && cp /etc/alpine-release /out/alpine-release.txt && apk info -v > /out/build-packages.txt
FROM scratch
COPY --from=build /out/ /

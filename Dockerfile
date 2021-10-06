FROM alpine:3.14

RUN apk --no-cache add npm git

WORKDIR /opt
RUN cd /opt \
 && git clone https://github.com/sparqling/spang \
 && cd /opt/spang \
 && npm install && npm link

WORKDIR /work

CMD ["spang2"]

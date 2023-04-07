FROM alpine:3.14

RUN apk --no-cache add npm git

RUN cd /opt \
 && git clone https://github.com/sparqling/spang \
 && cd spang \
 && npm install && npm link

WORKDIR /work

CMD ["spang2"]

ARG AWS_NUKE_VERSION=3.36.0

FROM ghcr.io/ekristen/aws-nuke:v${AWS_NUKE_VERSION}-arm64

USER root

RUN apk add --no-cache envsubst yq

COPY ./entrypoint.sh /usr/local/entrypoint.sh
RUN chmod +x /usr/local/entrypoint.sh

USER aws-nuke

ARG BLOCK_LIST='[]'
ENV BLOCK_LIST=$BLOCK_LIST
ARG REGIONS='["all"]'
ENV REGIONS=$REGIONS

COPY --chown=aws-nuke ./config.yaml /home/aws-nuke/config.template.yaml

# add blocklist and regions to config
RUN yq -i '.blocklist = (env(BLOCK_LIST) | unique)' /home/aws-nuke/config.template.yaml
RUN yq -i '.regions = ((["global"] + env(REGIONS)) | unique)' /home/aws-nuke/config.template.yaml

ENTRYPOINT ["/usr/local/entrypoint.sh"]

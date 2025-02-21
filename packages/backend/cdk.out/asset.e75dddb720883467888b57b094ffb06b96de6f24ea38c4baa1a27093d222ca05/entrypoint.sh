#!/bin/sh

# if $AWS_NUKE_ACCOUNT_ID is not set, fail
if [ -z "$AWS_NUKE_ACCOUNT_ID" ]; then
  echo "AWS_NUKE_ACCOUNT_ID is not set. Exiting."
  exit 1
fi

envsubst '$AWS_NUKE_ACCOUNT_ID' < /home/aws-nuke/config.template.yaml > /home/aws-nuke/config.yaml

echo "nuking account $AWS_NUKE_ACCOUNT_ID"

/usr/local/bin/aws-nuke run \
  -c /home/aws-nuke/config.yaml \
  --assume-role-arn "arn:aws:iam::${AWS_NUKE_ACCOUNT_ID}:role/AWSNukeRole" \
  -q \
  -no-prompt \
  --prompt-delay 3

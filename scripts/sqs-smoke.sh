#!/bin/sh
set -eu

sqs() {
    aws --endpoint-url "$AWS_ENDPOINT_URL" --no-cli-pager --cli-connect-timeout 2 --cli-read-timeout 8 sqs "$@"
}

attempt=0
until sqs list-queues >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 15 ]; then
        echo "Local SQS did not become ready at $AWS_ENDPOINT_URL." >&2
        sqs list-queues
        exit 1
    fi
    sleep 1
done

id=$(cat /proc/sys/kernel/random/uuid)
queue_url=$(sqs create-queue --queue-name "logistics-smoke-$id" --query QueueUrl --output text)
trap 'sqs delete-queue --queue-url "$queue_url"' EXIT

sqs send-message --queue-url "$queue_url" --message-body "$id" >/dev/null
received=$(sqs receive-message --queue-url "$queue_url" --wait-time-seconds 5 \
    --query 'Messages[0].[Body, ReceiptHandle]' --output text)
tab=$(printf '\t')
body=${received%%"$tab"*}
receipt=${received#*"$tab"}
if [ "$body" != "$id" ] || [ -z "$receipt" ] || [ "$receipt" = "$received" ]; then
    echo 'The local queue did not return the message sent by this test.' >&2
    exit 1
fi
sqs delete-message --queue-url "$queue_url" --receipt-handle "$receipt"
echo 'Local SQS smoke test passed.'

import { createHmac, timingSafeEqual } from "crypto";

const SLACK_SIGNATURE_VERSION = "v0";
const MAX_REQUEST_AGE_SECONDS = 60 * 5;

type VerifySlackSignatureParams = {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  signingSecret?: string;
};

export function verifySlackSignature({
  rawBody,
  signature,
  timestamp,
  signingSecret = process.env.SLACK_SIGNING_SECRET,
}: VerifySlackSignatureParams): boolean {
  if (!signingSecret || !signature || !timestamp) {
    return false;
  }

  const requestTimestamp = Number(timestamp);

  if (!Number.isFinite(requestTimestamp)) {
    return false;
  }

  const requestAgeSeconds = Math.abs(Date.now() / 1000 - requestTimestamp);

  if (requestAgeSeconds > MAX_REQUEST_AGE_SECONDS) {
    return false;
  }

  const baseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const digest = createHmac("sha256", signingSecret)
    .update(baseString, "utf8")
    .digest("hex");
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=${digest}`;

  const expected = Buffer.from(expectedSignature, "utf8");
  const received = Buffer.from(signature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

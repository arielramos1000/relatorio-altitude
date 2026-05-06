export async function postToSlack(blocks: object[], text: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) throw new Error("SLACK_WEBHOOK_URL nao configurado.");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Slack webhook falhou: ${response.status} ${responseText}`);
  }
}

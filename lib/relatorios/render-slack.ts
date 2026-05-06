import type { BoletimManha } from "./boletim-manha";

export function renderBoletimSlack(boletim: BoletimManha): object[] {
  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `☀️ Boletim Altitude · ${boletim.dateLabel}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Plano do dia*" },
    },
  ];

  if (boletim.atividades.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_Nenhuma atividade planejada para hoje._" },
    });
  } else {
    const list = boletim.atividades.map((a) => `• ${a.rawText}`).join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: list } });
  }

  if (boletim.pendenciasOntem.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Pendências de ontem*" },
    });
    const pendList = boletim.pendenciasOntem
      .map((p) => {
        const icon = p.status === "parcial" ? "⚠️" : "✕";
        const note = p.notes ? ` - ${p.notes}` : "";
        return `${icon} ${p.rawText}${note}`;
      })
      .join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: pendList } });
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Use */altitude-reportar* no Slack ou <${baseUrl}/hoje|abra o link de reporte>.`,
    },
  });

  return blocks;
}

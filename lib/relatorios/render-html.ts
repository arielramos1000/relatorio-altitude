import type { BoletimManha } from "./boletim-manha";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBoletimHTML(boletim: BoletimManha): string {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  const atividadesList =
    boletim.atividades.length > 0
      ? boletim.atividades
          .map(
            (a) => `
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; line-height: 22px; color: #3f3f46;">
                • ${escapeHtml(a.rawText)}
              </td>
            </tr>`
          )
          .join("")
      : `<tr><td style="padding: 10px 0; font-size: 14px; color: #71717a;">Nenhuma atividade planejada para hoje.</td></tr>`;

  const pendenciasSection =
    boletim.pendenciasOntem.length > 0
      ? `
      <tr>
        <td style="padding: 24px 32px 8px;">
          <h2 style="margin: 0; font-size: 18px; line-height: 26px; color: #18181b;">Pendências de ontem</h2>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 32px 8px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            ${boletim.pendenciasOntem
              .map((p) => {
                const icon = p.status === "parcial" ? "⚠" : "✕";
                const note = p.notes ? ` - ${escapeHtml(p.notes)}` : "";
                return `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; line-height: 22px; color: #3f3f46;">
                    <strong>${icon}</strong> ${escapeHtml(p.rawText)}${note}
                  </td>
                </tr>`;
              })
              .join("")}
          </table>
        </td>
      </tr>`
      : "";

  return `
    <div style="margin: 0; padding: 32px 16px; background: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; max-width: 760px; background: #ffffff; border: 1px solid #e4e4e7;">
              <tr>
                <td style="padding: 32px 32px 20px;">
                  <div style="font-size: 13px; line-height: 20px; color: #71717a; text-transform: uppercase; letter-spacing: .06em;">Altitude</div>
                  <h1 style="margin: 6px 0 0; font-size: 28px; line-height: 36px; color: #18181b;">Boletim · ${escapeHtml(boletim.dateLabel)}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 32px 8px;">
                  <h2 style="margin: 0; font-size: 18px; line-height: 26px; color: #18181b;">Plano do dia</h2>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 32px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    ${atividadesList}
                  </table>
                </td>
              </tr>
              ${pendenciasSection}
              <tr>
                <td style="padding: 24px 32px 34px;">
                  <a href="${escapeHtml(baseUrl)}/hoje" style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; font-size: 14px; line-height: 20px; font-weight: 700; padding: 12px 18px;">Reportar agora →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

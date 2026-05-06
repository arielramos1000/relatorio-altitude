import type {
  FechamentoAtividade,
  FechamentoDia,
  FechamentoPendencia,
  FechamentoProjeto,
  PlannedExecutionStatus,
} from "@/lib/relatorios/fechamento-dia";

const STATUS_LABEL: Record<PlannedExecutionStatus, string> = {
  feito: "Concluida",
  parcial: "Parcial",
  nao_feito: "Nao executada",
};

const STATUS_SYMBOL: Record<PlannedExecutionStatus, string> = {
  feito: "✓",
  parcial: "⚠",
  nao_feito: "✕",
};

const STATUS_COLOR: Record<PlannedExecutionStatus, string> = {
  feito: "#166534",
  parcial: "#92400e",
  nao_feito: "#991b1b",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function metricCard(label: string, value: number) {
  return `
    <td style="padding: 8px; width: 25%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; background: #f8fafc; border: 1px solid #e4e4e7;">
        <tr>
          <td style="padding: 18px 16px;">
            <div style="font-size: 24px; line-height: 30px; font-weight: 700; color: #18181b;">${value}</div>
            <div style="font-size: 12px; line-height: 18px; color: #71717a; text-transform: uppercase; letter-spacing: .04em;">${escapeHtml(label)}</div>
          </td>
        </tr>
      </table>
    </td>
  `;
}

function renderActivity(atividade: FechamentoAtividade) {
  const notes = atividade.notes
    ? `<div style="font-size: 13px; line-height: 20px; color: #52525b; padding-top: 4px;">Nota: ${escapeHtml(
        atividade.notes
      )}</div>`
    : "";
  const semReporte = atividade.reported
    ? ""
    : `<span style="color: #71717a;"> · sem reporte</span>`;

  return `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="font-size: 14px; line-height: 22px; color: #27272a;">
          <span style="font-weight: 700; color: ${STATUS_COLOR[atividade.status]};">${STATUS_SYMBOL[atividade.status]}</span>
          <span style="font-weight: 600; color: ${STATUS_COLOR[atividade.status]};">${STATUS_LABEL[atividade.status]}</span>${semReporte}
          <span style="color: #3f3f46;"> - ${escapeHtml(atividade.plannedItem.raw_text)}</span>
        </div>
        ${notes}
      </td>
    </tr>
  `;
}

function renderPendencia(pendencia: FechamentoPendencia) {
  const notes = pendencia.notes ? ` - ${pendencia.notes}` : "";
  const semReporte = pendencia.reported ? "" : " - sem reporte";

  return `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; line-height: 22px; color: #3f3f46;">
        <strong>${STATUS_SYMBOL[pendencia.status]} ${escapeHtml(pendencia.personName)}</strong>: ${escapeHtml(
          pendencia.rawText + notes + semReporte
        )}
      </td>
    </tr>
  `;
}

function renderProjeto(projeto: FechamentoProjeto) {
  const status = projeto.status === "atrasado" ? "Atrasado" : "Em andamento";
  const targetDate = projeto.target_end_date
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${projeto.target_end_date}T12:00:00Z`)
      )
    : "Sem data";

  return `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; line-height: 22px; color: #3f3f46;">
        <strong>${escapeHtml(projeto.name)}</strong> - ${escapeHtml(status)} - alvo ${escapeHtml(targetDate)}
      </td>
    </tr>
  `;
}

export function renderFechamentoHTML(fechamento: FechamentoDia) {
  const reportUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/r/${fechamento.date}`;
  const peopleSections = fechamento.pessoas
    .map((pessoa) => {
      const activities =
        pessoa.atividades.length > 0
          ? pessoa.atividades.map(renderActivity).join("")
          : `<tr><td style="padding: 12px 0; font-size: 14px; line-height: 22px; color: #71717a;">Sem atividades planejadas.</td></tr>`;
      const extras = pessoa.extras
        .map(
          (extra) => `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; line-height: 22px; color: #3f3f46;">
                <strong>+ Extra:</strong> ${escapeHtml(extra.notes)}
              </td>
            </tr>
          `
        )
        .join("");

      return `
        <tr>
          <td style="padding: 24px 32px 8px;">
            <h2 style="margin: 0; font-size: 18px; line-height: 26px; color: #18181b;">${escapeHtml(
              pessoa.person.name
            )}</h2>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 32px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
              ${activities}
              ${extras}
            </table>
          </td>
        </tr>
      `;
    })
    .join("");
  const pendencias =
    fechamento.pendenciasAmanha.length > 0
      ? fechamento.pendenciasAmanha.map(renderPendencia).join("")
      : `<tr><td style="padding: 10px 0; font-size: 14px; line-height: 22px; color: #71717a;">Nenhuma pendencia registrada.</td></tr>`;
  const projetos =
    fechamento.projetos.length > 0
      ? fechamento.projetos.map(renderProjeto).join("")
      : `<tr><td style="padding: 10px 0; font-size: 14px; line-height: 22px; color: #71717a;">Nenhum marco proximo em andamento ou atrasado.</td></tr>`;

  return `
    <div style="margin: 0; padding: 32px 16px; background: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; max-width: 760px; background: #ffffff; border: 1px solid #e4e4e7;">
              <tr>
                <td style="padding: 32px 32px 20px;">
                  <div style="font-size: 13px; line-height: 20px; color: #71717a; text-transform: uppercase; letter-spacing: .06em;">Altitude</div>
                  <h1 style="margin: 6px 0 0; font-size: 28px; line-height: 36px; color: #18181b;">Fechamento · ${escapeHtml(
                    fechamento.dateLabel
                  )}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 24px 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    <tr>
                      ${metricCard("Planejadas", fechamento.metrics.totalPlanejado)}
                      ${metricCard("Concluidas", fechamento.metrics.concluidas)}
                      ${metricCard("Parciais", fechamento.metrics.parciais)}
                      ${metricCard("Extras", fechamento.metrics.extras)}
                    </tr>
                  </table>
                </td>
              </tr>
              ${peopleSections}
              <tr>
                <td style="padding: 24px 32px 8px;">
                  <h2 style="margin: 0; font-size: 18px; line-height: 26px; color: #18181b;">Pendencias para amanha</h2>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 32px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    ${pendencias}
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 24px 32px 8px;">
                  <h2 style="margin: 0; font-size: 18px; line-height: 26px; color: #18181b;">Marcos do projeto</h2>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 32px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    ${projetos}
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 32px 34px;">
                  <a href="${escapeHtml(
                    reportUrl
                  )}" style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; font-size: 14px; line-height: 20px; font-weight: 700; padding: 12px 18px;">Ver relatorio completo →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

import type {
  FechamentoAtividade,
  FechamentoDia,
  FechamentoPendencia,
  FechamentoProjeto,
  PlannedExecutionStatus,
} from "@/lib/relatorios/fechamento-dia";

type SlackText = {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
};

type SlackBlock =
  | {
      type: "header";
      text: SlackText;
    }
  | {
      type: "section";
      text: SlackText;
    }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: SlackText;
        url: string;
        action_id: string;
      }>;
    }
  | {
      type: "divider";
    };

const STATUS_EMOJI: Record<PlannedExecutionStatus, string> = {
  feito: "✓",
  parcial: "⚠",
  nao_feito: "✕",
};

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function activityLine(atividade: FechamentoAtividade) {
  const notes = atividade.notes ? ` - ${atividade.notes}` : "";
  const semReporte = atividade.reported ? "" : " _(sem reporte)_";

  return `${STATUS_EMOJI[atividade.status]} ${atividade.plannedItem.raw_text}${notes}${semReporte}`;
}

function pendenciaLine(pendencia: FechamentoPendencia) {
  const notes = pendencia.notes ? ` - ${pendencia.notes}` : "";
  const semReporte = pendencia.reported ? "" : " _(sem reporte)_";

  return `${STATUS_EMOJI[pendencia.status]} *${pendencia.personName}*: ${pendencia.rawText}${notes}${semReporte}`;
}

function projetoLine(projeto: FechamentoProjeto) {
  const status = projeto.status === "atrasado" ? "Atrasado" : "Em andamento";
  const targetDate = projeto.target_end_date
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${projeto.target_end_date}T12:00:00Z`)
      )
    : "sem data";

  return `• *${projeto.name}* - ${status} - alvo ${targetDate}`;
}

export function renderFechamentoSlack(fechamento: FechamentoDia): SlackBlock[] {
  const reportUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/r/${fechamento.date}`;
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Fechamento · ${fechamento.dateLabel}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✓ ${fechamento.metrics.concluidas} concluídas · ✕ ${fechamento.metrics.naoFeitas} não executadas · + ${fechamento.metrics.extras} extras`,
      },
    },
    {
      type: "divider",
    },
  ];

  for (const pessoa of fechamento.pessoas) {
    const activityLines =
      pessoa.atividades.length > 0
        ? pessoa.atividades.map(activityLine)
        : ["Sem atividades planejadas."];
    const extraLines = pessoa.extras.map((extra) => `+ ${extra.notes}`);
    const text = [`*${pessoa.person.name}*`, ...activityLines, ...extraLines].join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(text, 2900),
      },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        fechamento.pendenciasAmanha.length > 0
          ? `*Pendências para amanhã*\n${truncate(
              fechamento.pendenciasAmanha.map(pendenciaLine).join("\n"),
              2700
            )}`
          : "*Pendências para amanhã*\nNenhuma pendência registrada.",
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        fechamento.projetos.length > 0
          ? `*Marcos do projeto*\n${truncate(
              fechamento.projetos.map(projetoLine).join("\n"),
              2700
            )}`
          : "*Marcos do projeto*\nNenhum marco próximo em andamento ou atrasado.",
    },
  });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: "ver_relatorio_completo",
        url: reportUrl,
        text: {
          type: "plain_text",
          text: "Ver relatório completo →",
          emoji: true,
        },
      },
    ],
  });

  return blocks;
}

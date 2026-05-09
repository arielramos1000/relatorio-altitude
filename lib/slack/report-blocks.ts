import type { PlannedItem } from "@/lib/types";

type SlackText = {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
};

type SlackButton = {
  type: "button";
  action_id: string;
  value: string;
  text: SlackText;
  style?: "primary" | "danger";
};

export type SlackBlock =
  | { type: "header"; text: SlackText }
  | { type: "section"; text: SlackText; block_id?: string }
  | { type: "actions"; block_id?: string; elements: SlackButton[] }
  | {
      type: "input";
      block_id: string;
      optional?: boolean;
      label: SlackText;
      element: { type: "plain_text_input"; action_id: string; multiline?: boolean };
    }
  | { type: "context"; elements: SlackText[] }
  | { type: "divider" };

const MAX_ITEMS_IN_MESSAGE = 22;

function statusButton(
  itemId: string,
  status: "feito" | "parcial" | "nao_feito",
  label: string,
  style?: SlackButton["style"]
): SlackButton {
  return {
    type: "button",
    action_id: `status_${status}_${itemId}`,
    value: itemId,
    text: { type: "plain_text", text: label, emoji: true },
    style,
  };
}

export function buildReportBlocks(
  plannedItems: PlannedItem[],
  dateLabel: string
): SlackBlock[] {
  const visibleItems = plannedItems.slice(0, MAX_ITEMS_IN_MESSAGE);
  const hiddenItemsCount = plannedItems.length - visibleItems.length;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Reporte do dia · ${dateLabel}`, emoji: true },
    },
  ];

  if (visibleItems.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "Nenhuma atividade planejada para hoje." },
    });
  }

  for (const item of visibleItems) {
    blocks.push(
      {
        type: "section",
        block_id: `item_${item.id}`,
        text: { type: "mrkdwn", text: `• ${item.raw_text}` },
      },
      {
        type: "actions",
        block_id: `status_${item.id}`,
        elements: [
          statusButton(item.id, "feito", "✅ Feito", "primary"),
          statusButton(item.id, "parcial", "⚠️ Parcial"),
          statusButton(item.id, "nao_feito", "✕ Não feito", "danger"),
        ],
      }
    );
  }

  if (hiddenItemsCount > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Mostrando ${visibleItems.length} de ${plannedItems.length} atividades.`,
        },
      ],
    });
  }

  blocks.push(
    {
      type: "input",
      block_id: "extra_notes",
      optional: true,
      label: { type: "plain_text", text: "Algo mais que rolou hoje", emoji: true },
      element: {
        type: "plain_text_input",
        action_id: "algo_mais",
        multiline: true,
      },
    },
    {
      type: "actions",
      block_id: "submit_report",
      elements: [
        {
          type: "button",
          action_id: "enviar_reporte",
          value: "submit",
          style: "primary",
          text: { type: "plain_text", text: "Enviar reporte ✓", emoji: true },
        },
      ],
    }
  );

  return blocks;
}

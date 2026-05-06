import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifySlackSignature } from "@/lib/slack/verify";
import type { Person, PlannedItem } from "@/lib/types";

export const runtime = "nodejs";

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
      block_id?: string;
    }
  | {
      type: "actions";
      block_id?: string;
      elements: SlackButton[];
    }
  | {
      type: "input";
      block_id: string;
      optional?: boolean;
      label: SlackText;
      element: {
        type: "plain_text_input";
        action_id: string;
        multiline?: boolean;
      };
    }
  | {
      type: "context";
      elements: SlackText[];
    };

type SlackButton = {
  type: "button";
  action_id: string;
  value: string;
  text: SlackText;
  style?: "primary" | "danger";
};

const TIME_ZONE = "America/Sao_Paulo";
const MAX_ITEMS_IN_MESSAGE = 22;

function getTodayParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
  };
}

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
    text: {
      type: "plain_text",
      text: label,
      emoji: true,
    },
    style,
  };
}

function buildReportBlocks(plannedItems: PlannedItem[], dateLabel: string): SlackBlock[] {
  const visibleItems = plannedItems.slice(0, MAX_ITEMS_IN_MESSAGE);
  const hiddenItemsCount = plannedItems.length - visibleItems.length;
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Reporte do dia · ${dateLabel}`,
        emoji: true,
      },
    },
  ];

  if (visibleItems.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Nenhuma atividade planejada para hoje.",
      },
    });
  }

  for (const item of visibleItems) {
    blocks.push(
      {
        type: "section",
        block_id: `item_${item.id}`,
        text: {
          type: "mrkdwn",
          text: `• ${item.raw_text}`,
        },
      },
      {
        type: "actions",
        block_id: `status_${item.id}`,
        elements: [
          statusButton(item.id, "feito", "Feito", "primary"),
          statusButton(item.id, "parcial", "Parcial"),
          statusButton(item.id, "nao_feito", "Não feito", "danger"),
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
          text: `Mostrando ${visibleItems.length} atividades. ${hiddenItemsCount} ficaram fora por limite de blocos do Slack.`,
        },
      ],
    });
  }

  blocks.push(
    {
      type: "input",
      block_id: "extra_notes",
      optional: true,
      label: {
        type: "plain_text",
        text: "Algo mais que rolou hoje",
        emoji: true,
      },
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
          text: {
            type: "plain_text",
            text: "Enviar reporte",
            emoji: true,
          },
        },
      ],
    }
  );

  return blocks;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValidRequest = verifySlackSignature({
    rawBody,
    signature: req.headers.get("x-slack-signature"),
    timestamp: req.headers.get("x-slack-request-timestamp"),
  });

  if (!isValidRequest) {
    return new NextResponse("Invalid Slack signature", { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const userId = form.get("user_id");

  if (!userId) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Payload do Slack sem user_id.",
      },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id,name,slack_user_id,email,access_token,reports_daily,receives_reports,created_at")
    .eq("slack_user_id", userId)
    .eq("reports_daily", true)
    .maybeSingle<Person>();

  if (personError) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Nao consegui validar seu usuario agora. Tente de novo em instantes.",
      },
      { status: 500 }
    );
  }

  if (!person) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Apenas Adolfo pode usar /altitude-reportar.",
    });
  }

  const today = getTodayParts();
  const { data: plannedItems, error: plannedItemsError } = await supabase
    .from("planned_items")
    .select("id,date,person_id,raw_text,source,created_at")
    .eq("person_id", person.id)
    .eq("date", today.date)
    .order("created_at", { ascending: true })
    .returns<PlannedItem[]>();

  if (plannedItemsError) {
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text: "Nao consegui buscar as atividades planejadas de hoje.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    response_type: "ephemeral",
    text: `Reporte do dia · ${today.label}`,
    blocks: buildReportBlocks(plannedItems ?? [], today.label),
  });
}

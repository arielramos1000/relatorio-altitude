import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifySlackSignature } from "@/lib/slack/verify";
import type { Execution, Person } from "@/lib/types";

export const runtime = "nodejs";

type ReportStatus = "feito" | "parcial" | "nao_feito";

type ReportState = {
  personId: string;
  date: string;
  statuses: Map<string, ReportStatus>;
  expiresAt: number;
};

type ExecutionInsert = {
  date: string;
  person_id: string;
  planned_item_id: string | null;
  status: ReportStatus | "extra";
  notes: string | null;
};

type SlackBlockAction = {
  action_id?: string;
  value?: string;
};

type SlackInputValue = {
  type?: string;
  value?: string | null;
};

type SlackBlockActionsPayload = {
  type?: string;
  team?: {
    id?: string;
  };
  user?: {
    id?: string;
  };
  channel?: {
    id?: string;
  };
  container?: {
    channel_id?: string;
    message_ts?: string;
  };
  message?: {
    ts?: string;
  };
  actions?: SlackBlockAction[];
  state?: {
    values?: Record<string, Record<string, SlackInputValue>>;
  };
  response_url?: string;
};

const TIME_ZONE = "America/Sao_Paulo";
const STATE_TTL_MS = 30 * 60 * 1000;

// TODO: persistir em supabase quando for deploy
const reportStates = new Map<string, ReportState>();

function getTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}`;
}

function getPayloadKey(payload: SlackBlockActionsPayload) {
  const teamId = payload.team?.id ?? "unknown_team";
  const userId = payload.user?.id ?? "unknown_user";
  const channelId =
    payload.container?.channel_id ?? payload.channel?.id ?? "unknown_channel";
  const messageId =
    payload.container?.message_ts ??
    payload.message?.ts ??
    payload.response_url ??
    "unknown_message";

  return `${teamId}:${userId}:${channelId}:${messageId}`;
}

function getStoredState(key: string) {
  const state = reportStates.get(key);

  if (!state) {
    return null;
  }

  if (state.expiresAt <= Date.now()) {
    reportStates.delete(key);
    return null;
  }

  return state;
}

function setStoredStatus(
  key: string,
  personId: string,
  date: string,
  itemId: string,
  status: ReportStatus
) {
  const state = getStoredState(key) ?? {
    personId,
    date,
    statuses: new Map<string, ReportStatus>(),
    expiresAt: Date.now() + STATE_TTL_MS,
  };

  state.personId = personId;
  state.date = date;
  state.statuses.set(itemId, status);
  state.expiresAt = Date.now() + STATE_TTL_MS;
  reportStates.set(key, state);
}

function parseStatusAction(actionId: string) {
  const match = actionId.match(/^status_(feito|parcial|nao_feito)_(.+)$/);

  if (!match) {
    return null;
  }

  return {
    status: match[1] as ReportStatus,
    itemId: match[2],
  };
}

function getExtraNotes(payload: SlackBlockActionsPayload) {
  return (
    payload.state?.values?.extra_notes?.algo_mais?.value?.trim() ??
    ""
  );
}

function savedResponse(selectedCount: number) {
  const plural = selectedCount === 1 ? "atividade" : "atividades";
  const text = `Reporte salvo ✓ ${selectedCount} ${plural}`;

  return NextResponse.json({
    response_type: "ephemeral",
    replace_original: true,
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${text}*`,
        },
      },
    ],
  });
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
  const rawPayload = form.get("payload");

  if (!rawPayload) {
    return new NextResponse("Missing Slack payload", { status: 400 });
  }

  let payload: SlackBlockActionsPayload;

  try {
    payload = JSON.parse(rawPayload) as SlackBlockActionsPayload;
  } catch {
    return new NextResponse("Invalid Slack payload", { status: 400 });
  }

  const actionId = payload.actions?.[0]?.action_id;
  const userId = payload.user?.id;

  if (payload.type !== "block_actions" || !actionId || !userId) {
    return new Response(null, { status: 200 });
  }

  const supabase = createServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id,name,slack_user_id,email,access_token,reports_daily,receives_reports,created_at")
    .eq("slack_user_id", userId)
    .eq("reports_daily", true)
    .maybeSingle<Person>();

  if (personError || !person) {
    return NextResponse.json({
      response_type: "ephemeral",
      replace_original: false,
      text: "Apenas Adolfo pode usar /altitude-reportar.",
    });
  }

  const key = getPayloadKey(payload);
  const today = getTodayInSaoPaulo();

  if (actionId.startsWith("status_")) {
    const statusAction = parseStatusAction(actionId);

    if (statusAction) {
      setStoredStatus(
        key,
        person.id,
        today,
        statusAction.itemId,
        statusAction.status
      );
    }

    return new Response(null, { status: 200 });
  }

  if (actionId === "enviar_reporte") {
    const state = getStoredState(key);
    const statuses = state?.statuses ?? new Map<string, ReportStatus>();
    const notes = getExtraNotes(payload);
    const executionRows: ExecutionInsert[] = Array.from(statuses.entries()).map(
      ([plannedItemId, status]) => ({
        date: state?.date ?? today,
        person_id: person.id,
        planned_item_id: plannedItemId,
        status,
        notes: null,
      })
    );

    if (notes) {
      executionRows.push({
        date: state?.date ?? today,
        person_id: person.id,
        planned_item_id: null,
        status: "extra",
        notes,
      });
    }

    if (executionRows.length > 0) {
      const { error: insertError } = await supabase
        .from("executions")
        .insert(executionRows)
        .returns<Execution[]>();

      if (insertError) {
        return NextResponse.json(
          {
            response_type: "ephemeral",
            replace_original: false,
            text: "Nao consegui salvar o reporte agora. Tente de novo em instantes.",
          },
          { status: 500 }
        );
      }
    }

    reportStates.delete(key);

    return savedResponse(statuses.size);
  }

  return new Response(null, { status: 200 });
}

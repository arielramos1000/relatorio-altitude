import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifySlackSignature } from "@/lib/slack/verify";
import type { Execution, Person } from "@/lib/types";

export const runtime = "nodejs";

type ReportStatus = "feito" | "parcial" | "nao_feito";

type ReportState = {
  key: string;
  personId: string;
  date: string;
  statuses: Record<string, ReportStatus>;
};

type SlackInteractionStateRow = {
  id: string;
  payload: ReportState;
  expires_at: string;
  created_at: string | null;
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
const STATE_TTL_MINUTES = 30;

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

function getExpiresAt() {
  return new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000).toISOString();
}

async function cleanupExpiredStates(supabase: ReturnType<typeof createServerClient>) {
  await supabase
    .from("slack_interaction_state")
    .delete()
    .lt("expires_at", new Date().toISOString());
}

async function getStoredState(
  supabase: ReturnType<typeof createServerClient>,
  slackUserId: string,
  key: string
) {
  const { data, error } = await supabase
    .from("slack_interaction_state")
    .select("id,payload,expires_at,created_at")
    .eq("slack_user_id", slackUserId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<SlackInteractionStateRow[]>();

  if (error) {
    throw new Error(`Erro ao buscar estado Slack: ${error.message}`);
  }

  return (data ?? []).find((row) => row.payload.key === key) ?? null;
}

async function setStoredStatus(
  supabase: ReturnType<typeof createServerClient>,
  key: string,
  slackUserId: string,
  personId: string,
  date: string,
  itemId: string,
  status: ReportStatus
) {
  const existingState = await getStoredState(supabase, slackUserId, key);
  const payload: ReportState = existingState?.payload ?? {
    key,
    personId,
    date,
    statuses: {},
  };

  payload.personId = personId;
  payload.date = date;
  payload.statuses[itemId] = status;

  if (existingState) {
    const { error } = await supabase
      .from("slack_interaction_state")
      .update({
        payload,
        expires_at: getExpiresAt(),
      })
      .eq("id", existingState.id);

    if (error) {
      throw new Error(`Erro ao atualizar estado Slack: ${error.message}`);
    }

    return;
  }

  const { error } = await supabase.from("slack_interaction_state").insert({
    slack_user_id: slackUserId,
    payload,
    expires_at: getExpiresAt(),
  });

  if (error) {
    throw new Error(`Erro ao salvar estado Slack: ${error.message}`);
  }
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
  try {
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
        await setStoredStatus(
          supabase,
          key,
          userId,
          person.id,
          today,
          statusAction.itemId,
          statusAction.status
        );
      }

      return new Response(null, { status: 200 });
    }

    if (actionId === "enviar_reporte") {
      const storedState = await getStoredState(supabase, userId, key);
      const state = storedState?.payload;
      const statusEntries = Object.entries(state?.statuses ?? {}) as Array<
        [string, ReportStatus]
      >;
      const notes = getExtraNotes(payload);
      const executionRows: ExecutionInsert[] = statusEntries.map(
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

      if (storedState) {
        await supabase.from("slack_interaction_state").delete().eq("id", storedState.id);
      }

      return savedResponse(statusEntries.length);
    }

    return new Response(null, { status: 200 });
  } finally {
    await cleanupExpiredStates(supabase);
  }
}

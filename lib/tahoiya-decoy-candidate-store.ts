import { createHash } from "node:crypto";
import { emitObservabilityEvent, observabilityErrorCode } from "@/lib/observability";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import {
  tahoiyaDecoyEventsFromRoom,
  type TahoiyaDecoyCandidateEventInput,
} from "@/lib/tahoiya-decoy-candidate-core";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";

type InsertEventResult = { inserted: boolean };

export type TahoiyaDecoyCandidateStats = {
  candidateCount: number;
  wordCount: number;
  eventCount: number;
  multiplayerVotes: number;
  soloVotes: number;
  pureZeroCount: number;
};

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function recordTahoiyaDecoyCandidateEvent(input: TahoiyaDecoyCandidateEventInput) {
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = await sql`
    WITH upserted_candidate AS (
      INSERT INTO tahoiya_decoy_candidates (
        id, word, normalized_word, reading, real_definition, real_definition_hash,
        definition_text, normalized_definition, definition_hash,
        first_seen_at, last_seen_at
      ) VALUES (
        ${input.candidateId}, ${input.word}, ${input.normalizedWord}, ${input.reading},
        ${input.realDefinition}, ${input.realDefinitionHash}, ${input.definitionText},
        ${input.normalizedDefinition}, ${input.definitionHash}, ${input.occurredAt}, ${input.occurredAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        word = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at THEN EXCLUDED.word
          ELSE tahoiya_decoy_candidates.word
        END,
        reading = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at
            THEN COALESCE(EXCLUDED.reading, tahoiya_decoy_candidates.reading)
          ELSE tahoiya_decoy_candidates.reading
        END,
        real_definition = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at THEN EXCLUDED.real_definition
          ELSE tahoiya_decoy_candidates.real_definition
        END,
        real_definition_hash = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at THEN EXCLUDED.real_definition_hash
          ELSE tahoiya_decoy_candidates.real_definition_hash
        END,
        definition_text = EXCLUDED.definition_text,
        status = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at
            AND tahoiya_decoy_candidates.real_definition_hash <> EXCLUDED.real_definition_hash
            AND tahoiya_decoy_candidates.status IN ('eligible', 'excluded_same_as_answer', 'review_uncertain')
            THEN 'unreviewed'
          ELSE tahoiya_decoy_candidates.status
        END,
        reviewed_real_definition_hash = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at
            AND tahoiya_decoy_candidates.real_definition_hash <> EXCLUDED.real_definition_hash THEN NULL
          ELSE tahoiya_decoy_candidates.reviewed_real_definition_hash
        END,
        review_label = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at
            AND tahoiya_decoy_candidates.real_definition_hash <> EXCLUDED.real_definition_hash THEN NULL
          ELSE tahoiya_decoy_candidates.review_label
        END,
        review_prompt_version = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at
            AND tahoiya_decoy_candidates.real_definition_hash <> EXCLUDED.real_definition_hash THEN NULL
          ELSE tahoiya_decoy_candidates.review_prompt_version
        END,
        reviewed_at = CASE
          WHEN EXCLUDED.last_seen_at >= tahoiya_decoy_candidates.last_seen_at
            AND tahoiya_decoy_candidates.real_definition_hash <> EXCLUDED.real_definition_hash THEN NULL
          ELSE tahoiya_decoy_candidates.reviewed_at
        END,
        first_seen_at = LEAST(tahoiya_decoy_candidates.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at = GREATEST(tahoiya_decoy_candidates.last_seen_at, EXCLUDED.last_seen_at),
        updated_at = NOW()
      RETURNING id
    ), inserted_event AS (
      INSERT INTO tahoiya_decoy_candidate_events (
        id, candidate_id, source_kind, votes_awarded, voter_opportunities, appearances, occurred_at
      )
      SELECT ${input.sourceEventId}, id, ${input.sourceKind}, ${input.votes},
        ${input.voterOpportunities}, ${input.appearances}, ${input.occurredAt}
      FROM upserted_candidate
      ON CONFLICT (id) DO NOTHING
      RETURNING candidate_id, source_kind, votes_awarded, voter_opportunities, appearances
    ), updated_candidate AS (
      UPDATE tahoiya_decoy_candidates candidate
      SET
        multiplayer_votes = candidate.multiplayer_votes + CASE WHEN event.source_kind = 'solo_choice' THEN 0 ELSE event.votes_awarded END,
        multiplayer_appearances = candidate.multiplayer_appearances + CASE WHEN event.source_kind = 'solo_choice' THEN 0 ELSE event.appearances END,
        multiplayer_vote_opportunities = candidate.multiplayer_vote_opportunities + CASE WHEN event.source_kind = 'solo_choice' THEN 0 ELSE event.voter_opportunities END,
        solo_votes = candidate.solo_votes + CASE WHEN event.source_kind = 'solo_choice' THEN event.votes_awarded ELSE 0 END,
        solo_appearances = candidate.solo_appearances + CASE WHEN event.source_kind = 'solo_choice' THEN event.appearances ELSE 0 END,
        updated_at = NOW()
      FROM inserted_event event
      WHERE candidate.id = event.candidate_id
      RETURNING candidate.id
    )
    SELECT EXISTS (SELECT 1 FROM updated_candidate) AS inserted
  ` as InsertEventResult[];
  return rows[0]?.inserted === true;
}

export async function recordTahoiyaDecoyCandidates(room: TahoiyaRoom) {
  if (!isPostgresConfigured()) return 0;
  const events = tahoiyaDecoyEventsFromRoom(room);
  if (events.length === 0) return 0;
  try {
    let inserted = 0;
    for (const event of events) {
      if (await recordTahoiyaDecoyCandidateEvent(event)) inserted += 1;
    }
    return inserted;
  } catch (error) {
    emitObservabilityEvent("error", "persistence.write", {
      game: "tahoiya",
      operation: "record-decoy-candidates",
      round: room.round,
      affectedCount: events.length,
      outcome: "failed",
      errorCode: observabilityErrorCode(error),
    });
    return 0;
  }
}

export async function recordTahoiyaSoloDecoyVote(candidateId: string, attemptId: string, occurredAt = Date.now()) {
  if (!candidateId.startsWith("tahoiya_decoy_") || !attemptId.trim()) return false;
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const eventId = `tahoiya_decoy_event_${createHash("sha256").update(`solo_choice\0${attemptId}\0${candidateId}`).digest("hex").slice(0, 40)}`;
  const rows = await sql`
    WITH inserted_event AS (
      INSERT INTO tahoiya_decoy_candidate_events (
        id, candidate_id, source_kind, votes_awarded, voter_opportunities, appearances, occurred_at
      )
      SELECT ${eventId}, id, 'solo_choice', 1, 1, 1, ${occurredAt}
      FROM tahoiya_decoy_candidates
      WHERE id = ${candidateId}
      ON CONFLICT (id) DO NOTHING
      RETURNING candidate_id
    ), updated_candidate AS (
      UPDATE tahoiya_decoy_candidates candidate
      SET solo_votes = candidate.solo_votes + 1,
        solo_appearances = candidate.solo_appearances + 1,
        last_seen_at = GREATEST(candidate.last_seen_at, ${occurredAt}),
        updated_at = NOW()
      FROM inserted_event event
      WHERE candidate.id = event.candidate_id
      RETURNING candidate.id
    )
    SELECT EXISTS (SELECT 1 FROM updated_candidate) AS inserted
  ` as InsertEventResult[];
  return rows[0]?.inserted === true;
}

export async function inspectTahoiyaDecoyCandidateStats(): Promise<TahoiyaDecoyCandidateStats> {
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = await sql`
    SELECT
      COUNT(*) AS candidate_count,
      COUNT(DISTINCT normalized_word) AS word_count,
      COALESCE(SUM(multiplayer_votes), 0) AS multiplayer_votes,
      COALESCE(SUM(solo_votes), 0) AS solo_votes,
      COUNT(*) FILTER (
        WHERE multiplayer_votes + solo_votes = 0
          AND multiplayer_vote_opportunities + solo_appearances > 0
      ) AS pure_zero_count,
      (SELECT COUNT(*) FROM tahoiya_decoy_candidate_events) AS event_count
    FROM tahoiya_decoy_candidates
  ` as Array<Record<string, string | number>>;
  const row = rows[0] ?? {};
  return {
    candidateCount: numeric(row.candidate_count),
    wordCount: numeric(row.word_count),
    eventCount: numeric(row.event_count),
    multiplayerVotes: numeric(row.multiplayer_votes),
    soloVotes: numeric(row.solo_votes),
    pureZeroCount: numeric(row.pure_zero_count),
  };
}

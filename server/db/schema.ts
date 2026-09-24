import { ARCHETYPES, LINE_OF_POSITION } from '../../shared/data/archetypes.js';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { POSITION_CODES } from '../../shared/fc27.js';

export const playerPosition = pgEnum('player_position', ['FW', 'MF', 'DF', 'GK']);
export const matchType = pgEnum('match_type', ['league', 'playoff', 'friendly']);
export const matchResult = pgEnum('match_result', ['win', 'draw', 'loss']);

export const clubs = pgTable('clubs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  handle: text('handle'),
  eaClubId: text('ea_club_id').unique(),
  platform: text('platform'),
  region: text('region').notNull(),
  reputation: text('reputation').notNull(),
  skillRating: integer('skill_rating').notNull(),
  bestDivision: smallint('best_division'),
  wins: integer('wins').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  gamesPlayed: integer('games_played').generatedAlwaysAs(sql`wins + draws + losses`),
  goalsFor: integer('goals_for').notNull().default(0),
  goalsAgainst: integer('goals_against').notNull().default(0),
  leagueApps: integer('league_apps').notNull().default(0),
  playoffApps: integer('playoff_apps').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Historique du skill rating — sert à calculer la tendance « ▲ +42 ce mois ».
export const clubRatingSnapshots = pgTable(
  'club_rating_snapshots',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    clubId: integer('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    skillRating: integer('skill_rating').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('club_rating_snapshots_club_taken_idx').on(t.clubId, t.takenAt.desc())],
);

export const members = pgTable(
  'members',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    clubId: integer('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    gamertag: text('gamertag').notNull(),
    position: playerPosition('position').notNull(),
    ovr: smallint('ovr').notNull(),
    matchesPlayed: integer('matches_played').notNull().default(0),
    goals: integer('goals').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    avgRating: numeric('avg_rating', { precision: 3, scale: 1 }),
    passPct: smallint('pass_pct'),
    isActive: boolean('is_active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('members_club_gamertag_key').on(t.clubId, t.gamertag),
    check('members_ovr_check', sql`${t.ovr} between 0 and 99`),
    check('members_avg_rating_check', sql`${t.avgRating} between 0 and 10`),
    check('members_pass_pct_check', sql`${t.passPct} between 0 and 100`),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    clubId: integer('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    eaMatchId: text('ea_match_id').unique(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    type: matchType('match_type').notNull(),
    opponentName: text('opponent_name').notNull(),
    opponentEaClubId: text('opponent_ea_club_id'),
    goalsFor: smallint('goals_for').notNull(),
    goalsAgainst: smallint('goals_against').notNull(),
    result: matchResult('result').notNull(),
    possessionPct: smallint('possession_pct'),
    shots: smallint('shots'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('matches_club_played_idx').on(t.clubId, t.playedAt.desc()),
    check('matches_goals_for_check', sql`${t.goalsFor} >= 0`),
    check('matches_goals_against_check', sql`${t.goalsAgainst} >= 0`),
    check('matches_possession_pct_check', sql`${t.possessionPct} between 0 and 100`),
    check('matches_shots_check', sql`${t.shots} >= 0`),
  ],
);

// Compléments saisis à la main — ces infos ne viennent jamais de l'API EA.
export const matchNotes = pgTable(
  'match_notes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    matchId: bigint('match_id', { mode: 'number' })
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    motmMemberId: integer('motm_member_id').references(() => members.id, { onDelete: 'set null' }),
    videoUrl: text('video_url'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('match_notes_match_created_idx').on(t.matchId, t.createdAt.desc()),
    check('match_notes_author_name_check', sql`char_length(${t.authorName}) between 1 and 40`),
    check('match_notes_body_check', sql`char_length(${t.body}) between 1 and 2000`),
    check('match_notes_video_url_check', sql`${t.videoUrl} ~ '^https?://'`),
  ],
);

export const fc27Position = pgEnum('fc27_position', POSITION_CODES);
export const fc27Campaigns = pgTable('fc27_campaigns', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  clubId: integer('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('preparation'),
  expectedVoters: integer('expected_voters').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('fc27_one_active_campaign').on(t.clubId).where(sql`${t.status} = 'preparation'`),
  index('fc27_campaign_club_idx').on(t.clubId),
  check('fc27_campaign_status_check', sql`${t.status} in ('preparation', 'archived')`),
  check('fc27_quorum_check', sql`${t.expectedVoters} between 1 and 1000`),
]);

export const fc27NameProposals = pgTable('fc27_name_proposals', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer('campaign_id').notNull().references(() => fc27Campaigns.id, { onDelete: 'cascade' }),
  /** Compte auteur (migration 0010). Null pour les propositions d'avant les comptes. */
  authorAccountId: integer('author_account_id').references(() => clubAccounts.id, { onDelete: 'set null' }),
  /** Nom affiché au moment de la proposition, copié depuis le compte. */
  authorPseudo: text('author_pseudo').notNull(),
  clubName: text('club_name').notNull(),
  finalVotes: integer('final_votes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('fc27_proposal_campaign_key').on(t.id, t.campaignId),
  index('fc27_proposal_campaign_idx').on(t.campaignId),
  index('fc27_proposal_author_idx').on(t.campaignId, t.authorAccountId),
  check('fc27_proposal_pseudo_check', sql`char_length(${t.authorPseudo}) between 1 and 40 and ${t.authorPseudo} ~ '[^[:space:]]'`),
  check('fc27_name_check', sql`char_length(${t.clubName}) between 1 and 60 and ${t.clubName} ~ '[^[:space:]]'`),
  check('fc27_proposal_final_votes_check', sql`${t.finalVotes} >= 0`),
]);

export const fc27Rounds = pgTable('fc27_rounds', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer('campaign_id').notNull().references(() => fc27Campaigns.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  status: text('status').notNull().default('open'),
  quorum: integer('quorum'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closeReason: text('close_reason'),
  eliminatedProposalId: integer('eliminated_proposal_id'),
  tieBreakApplied: boolean('tie_break_applied').notNull().default(false),
}, (t) => [
  unique('fc27_round_number_key').on(t.campaignId, t.number),
  unique('fc27_round_campaign_key').on(t.id, t.campaignId),
  uniqueIndex('fc27_one_open_round').on(t.campaignId).where(sql`${t.status} = 'open'`),
  index('fc27_round_deadline_idx').on(t.deadlineAt).where(sql`${t.status} = 'open' and ${t.number} > 0`),
  foreignKey({ name: 'fc27_eliminated_campaign_fk', columns: [t.eliminatedProposalId, t.campaignId], foreignColumns: [fc27NameProposals.id, fc27NameProposals.campaignId] }),
  check('fc27_round_status_check', sql`${t.status} in ('open', 'closed')`),
  check('fc27_round_phase_check', sql`(${t.number} = 0 and ${t.quorum} is null and ${t.deadlineAt} is null) or (${t.number} > 0 and ${t.quorum} between 1 and 1000 and ${t.deadlineAt} is not null)`),
  check('fc27_round_close_check', sql`(${t.status} = 'open' and ${t.closedAt} is null and ${t.closeReason} is null) or (${t.status} = 'closed' and ${t.closedAt} is not null and ${t.closeReason} in ('start', 'quorum', 'timeout', 'archive'))`),
]);

export const fc27RoundCandidates = pgTable('fc27_round_candidates', {
  roundId: integer('round_id').notNull(),
  proposalId: integer('proposal_id').notNull(),
  campaignId: integer('campaign_id').notNull(),
  finalVoteCount: integer('final_vote_count'),
  eliminated: boolean('eliminated').notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.roundId, t.proposalId] }),
  foreignKey({ columns: [t.roundId, t.campaignId], foreignColumns: [fc27Rounds.id, fc27Rounds.campaignId] }).onDelete('cascade'),
  foreignKey({ columns: [t.proposalId, t.campaignId], foreignColumns: [fc27NameProposals.id, fc27NameProposals.campaignId] }).onDelete('cascade'),
  index('fc27_candidate_proposal_idx').on(t.proposalId, t.campaignId),
  check('fc27_final_votes_check', sql`${t.finalVoteCount} >= 0`),
]);

export const fc27Votes = pgTable('fc27_votes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  roundId: integer('round_id').notNull(),
  proposalId: integer('proposal_id').notNull(),
  voterPseudo: text('voter_pseudo').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('fc27_vote_pseudo_key').on(t.roundId, t.voterPseudo),
  foreignKey({ columns: [t.roundId, t.proposalId], foreignColumns: [fc27RoundCandidates.roundId, fc27RoundCandidates.proposalId] }).onDelete('cascade'),
  index('fc27_vote_candidate_idx').on(t.roundId, t.proposalId),
  check('fc27_vote_pseudo_check', sql`char_length(${t.voterPseudo}) between 1 and 40 and ${t.voterPseudo} ~ '[^[:space:]]'`),
]);

// Analyses rédigées par le modèle, mises en cache par composition d'effectif (migration 0008).
export const fc27StaffReports = pgTable('fc27_staff_reports', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer('campaign_id').notNull().references(() => fc27Campaigns.id, { onDelete: 'cascade' }),
  /** Empreinte calculée par squadFingerprint() : identifie la composition, pas la campagne. */
  squadHash: text('squad_hash').notNull(),
  payload: jsonb('payload').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fc27_staff_report_key').on(t.campaignId, t.squadHash),
  check('fc27_staff_report_hash_check', sql`char_length(${t.squadHash}) between 1 and 80`),
]);

export const clubAccounts = pgTable('club_accounts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Identifiant Discord : c'est lui qui fait l'unicité d'un compte, pas le pseudo. */
  discordId: text('discord_id').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('club_account_discord_key').on(t.discordId),
  check('club_account_username_check', sql`char_length(${t.username}) between 1 and 60`),
]);

export const clubPlayerClaims = pgTable('club_player_claims', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer('account_id').notNull().references(() => clubAccounts.id, { onDelete: 'cascade' }),
  memberId: integer('member_id').notNull().references(() => members.id),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: integer('reviewed_by').references(() => clubAccounts.id, { onDelete: 'set null' }),
  reviewNote: text('review_note'),
}, t => [
  uniqueIndex('club_player_claim_account_active').on(t.accountId).where(sql`${t.status} in ('pending', 'approved')`),
  uniqueIndex('club_player_claim_member_approved').on(t.memberId).where(sql`${t.status} = 'approved'`),
  index('club_player_claim_account_history').on(t.accountId, t.id.desc()),
  index('club_player_claim_member_idx').on(t.memberId),
  index('club_player_claim_reviewer_idx').on(t.reviewedBy),
  check('club_player_claims_status_check', sql`${t.status} in ('pending', 'approved', 'rejected', 'cancelled', 'revoked')`),
  check('club_player_claims_review_note_check', sql`char_length(${t.reviewNote}) <= 240`),
  check('club_player_claims_check', sql`(${t.status} = 'pending' and ${t.reviewedAt} is null) or (${t.status} <> 'pending' and ${t.reviewedAt} is not null)`),
]);

export const fc27PlayerProfiles = pgTable('fc27_player_profiles', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer('campaign_id').notNull().references(() => fc27Campaigns.id, { onDelete: 'cascade' }),
  pseudo: text('pseudo').notNull(),
  inGameName: text('in_game_name'), // nom floqué sur le maillot
  primaryPosition: fc27Position('primary_position').notNull(),
  notes: text('notes'),
  // Carte joueur (migration 0005) — null pour les fiches antérieures.
  kitNumber: smallint('kit_number'),
  preferredFoot: text('preferred_foot'),
  heightCm: smallint('height_cm'),
  weightKg: smallint('weight_kg'),
  archetype: text('archetype'),
  playStyles: text('play_styles').array().notNull().default(sql`'{}'::text[]`),
  // Ordre de dépense des points choisi par le joueur (migration 0007), vide pour les fiches antérieures.
  attributePriorities: text('attribute_priorities').array().notNull().default(sql`'{}'::text[]`),
  /** Compte propriétaire (migration 0009). Null pour les fiches d'avant les comptes. */
  accountId: integer('account_id').references(() => clubAccounts.id, { onDelete: 'set null' }),
  weakFoot: smallint('weak_foot'),
  skillMoves: smallint('skill_moves'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('fc27_player_pseudo_key').on(t.campaignId, t.pseudo),
  uniqueIndex('fc27_player_kit_number_key').on(t.campaignId, t.kitNumber).where(sql`${t.kitNumber} is not null`),
  // Une seule fiche par compte et par campagne.
  uniqueIndex('fc27_player_account_key').on(t.campaignId, t.accountId).where(sql`${t.accountId} is not null`),
  index('fc27_player_position_idx').on(t.campaignId, t.primaryPosition),
  check('fc27_player_pseudo_check', sql`char_length(${t.pseudo}) between 1 and 40 and ${t.pseudo} ~ '[^[:space:]]'`),
  check('fc27_player_name_check', sql`char_length(${t.inGameName}) <= 60`),
  check('fc27_player_notes_check', sql`char_length(${t.notes}) <= 1000`),
  check('fc27_player_kit_number_check', sql`${t.kitNumber} between 1 and 99`),
  check('fc27_player_foot_check', sql`${t.preferredFoot} in ('Droit', 'Gauche')`),
  check('fc27_player_height_check', sql`${t.heightCm} between 160 and 200`),
  check('fc27_player_weight_check', sql`${t.weightKg} between 50 and 100`),
  check('fc27_player_archetype_check', sql.raw(ARCHETYPES.map((a) => {
    const positions = Object.entries(LINE_OF_POSITION).filter(([, line]) => line === a.line).map(([position]) => "'" + position + "'").join(', ');
    return "(archetype = '" + a.id.replaceAll("'", "''") + "' and primary_position in (" + positions + "))";
  }).join(' or '))),
  check('fc27_player_play_styles_check', sql`cardinality(${t.playStyles}) <= 3`),
  check('fc27_player_attribute_priorities_check', sql`cardinality(${t.attributePriorities}) <= 5`),
  check('fc27_player_weak_foot_check', sql`${t.weakFoot} between 1 and 5`),
  check('fc27_player_skill_moves_check', sql`${t.skillMoves} between 1 and 5`),
]);

export const fc27PlayerSecondaryPositions = pgTable('fc27_player_secondary_positions', {
  profileId: integer('profile_id').notNull().references(() => fc27PlayerProfiles.id, { onDelete: 'cascade' }),
  position: fc27Position('position').notNull(),
}, (t) => [primaryKey({ columns: [t.profileId, t.position] })]);

// Single ballot per campaign. Old round tables remain solely for legacy records.
export const fc27NameElections = pgTable('fc27_name_elections', {
  campaignId: integer('campaign_id').primaryKey().references(() => fc27Campaigns.id, { onDelete: 'cascade' }),
  phase: text('phase').notNull().default('proposing'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  winnerProposalId: integer('winner_proposal_id'),
  tieBreakApplied: boolean('tie_break_applied').notNull().default(false),
}, (t) => [
  foreignKey({ columns: [t.winnerProposalId, t.campaignId], foreignColumns: [fc27NameProposals.id, fc27NameProposals.campaignId] }),
  check('fc27_election_phase_check', sql`${t.phase} in ('proposing', 'voting', 'closed', 'cancelled')`),
  check('fc27_election_state_check', sql`(${t.phase} = 'proposing' and ${t.startedAt} is null and ${t.closedAt} is null and ${t.winnerProposalId} is null) or (${t.phase} = 'voting' and ${t.startedAt} is not null and ${t.closedAt} is null and ${t.winnerProposalId} is null) or (${t.phase} = 'closed' and ${t.startedAt} is not null and ${t.closedAt} is not null and ${t.winnerProposalId} is not null) or (${t.phase} = 'cancelled' and ${t.closedAt} is not null and ${t.winnerProposalId} is null)`),
]);

/** Étapes du vote du nom (migration 0014) : premier tour, second tour, demi-finales, finale ou podium. */
export const fc27NameStages = pgTable('fc27_name_stages', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer('campaign_id').notNull().references(() => fc27NameElections.campaignId, { onDelete: 'cascade' }),
  number: smallint('number').notNull(),
  kind: text('kind').notNull(),
  maxChoices: smallint('max_choices').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  tieBreakApplied: boolean('tie_break_applied').notNull().default(false),
}, (t) => [
  unique('fc27_stage_number_key').on(t.campaignId, t.number),
  unique('fc27_stage_campaign_key').on(t.id, t.campaignId),
  uniqueIndex('fc27_stage_open_key').on(t.campaignId).where(sql`${t.closedAt} is null`),
  check('fc27_name_stages_number_check', sql`${t.number} between 1 and 20`),
  check('fc27_name_stages_kind_check', sql`${t.kind} in ('qualif', 'repechage', 'semis', 'final', 'podium')`),
  check('fc27_name_stages_max_choices_check', sql`${t.maxChoices} between 1 and 3`),
]);

/** Noms en jeu dans une étape, avec leur tête de série, leur duel et leur sort à la clôture. */
export const fc27NameStageEntries = pgTable('fc27_name_stage_entries', {
  stageId: integer('stage_id').notNull(),
  campaignId: integer('campaign_id').notNull(),
  proposalId: integer('proposal_id').notNull(),
  seed: smallint('seed').notNull(),
  duel: smallint('duel'),
  finalVotes: integer('final_votes'),
  result: text('result'),
}, (t) => [
  primaryKey({ columns: [t.stageId, t.proposalId] }),
  foreignKey({ columns: [t.stageId, t.campaignId], foreignColumns: [fc27NameStages.id, fc27NameStages.campaignId] }).onDelete('cascade'),
  foreignKey({ columns: [t.proposalId, t.campaignId], foreignColumns: [fc27NameProposals.id, fc27NameProposals.campaignId] }).onDelete('cascade'),
  check('fc27_name_stage_entries_seed_check', sql`${t.seed} between 1 and 200`),
  check('fc27_name_stage_entries_duel_check', sql`${t.duel} in (1, 2)`),
  check('fc27_name_stage_entries_final_votes_check', sql`${t.finalVotes} >= 0`),
  check('fc27_name_stage_entries_result_check', sql`${t.result} in ('advanced', 'eliminated', 'winner', 'runner_up', 'third')`),
]);

export const fc27NameVotes = pgTable('fc27_name_votes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer('campaign_id').notNull().references(() => fc27NameElections.campaignId, { onDelete: 'cascade' }),
  proposalId: integer('proposal_id').notNull(),
  /** Compte votant (migration 0010). Jusqu'à trois choix par compte et par étape (migration 0014). */
  voterAccountId: integer('voter_account_id').references(() => clubAccounts.id, { onDelete: 'set null' }),
  voterPseudo: text('voter_pseudo').notNull(),
  /** Étape du vote (migration 0014). Null pour les voix d'avant les étapes. */
  stageId: integer('stage_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fc27_name_vote_account_key').on(t.campaignId, t.voterAccountId).where(sql`${t.voterAccountId} is not null and ${t.stageId} is null`),
  uniqueIndex('fc27_name_vote_stage_key').on(t.stageId, t.voterAccountId, t.proposalId).where(sql`${t.stageId} is not null`),
  foreignKey({ name: 'fc27_name_votes_stage_entry_fk', columns: [t.stageId, t.proposalId], foreignColumns: [fc27NameStageEntries.stageId, fc27NameStageEntries.proposalId] }).onDelete('cascade'),
  foreignKey({ columns: [t.proposalId, t.campaignId], foreignColumns: [fc27NameProposals.id, fc27NameProposals.campaignId] }),
  index('fc27_name_vote_proposal_idx').on(t.proposalId, t.campaignId),
  check('fc27_name_vote_pseudo_check', sql`char_length(${t.voterPseudo}) between 1 and 40 and ${t.voterPseudo} ~ '[^[:space:]]'`),
]);

/** Débriefs de match rédigés par le modèle, un par (match, état des notes). */
export const matchDebriefs = pgTable('match_debriefs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  /** Empreinte des stats, des notes et de la version du format (voir debriefInputHash). */
  inputHash: text('input_hash').notNull(),
  payload: jsonb('payload').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('match_debrief_key').on(t.matchId, t.inputHash),
  check('match_debriefs_input_hash_check', sql`char_length(${t.inputHash}) between 1 and 80`),
]);

/** Appels IA facturés, par compte et par jour : c'est le plafond du coach. */
export const aiUsage = pgTable('ai_usage', {
  accountId: integer('account_id').notNull().references(() => clubAccounts.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  calls: integer('calls').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.accountId, t.day] }),
  check('ai_usage_calls_check', sql`${t.calls} >= 0`),
]);

/** Réglages modifiables sans redéploiement. `bets_mode` : interrupteur de Vestiaire Bets. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => clubAccounts.id, { onDelete: 'set null' }),
}, (t) => [
  check('app_settings_key_check', sql`char_length(${t.key}) between 1 and 60`),
]);

import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

async function getDoubleUseTeams(supabase: any, competition_id: string, user_id: string): Promise<number[]> {
  const { data } = await supabase
    .from('tier_draft_picks')
    .select('tier1_team_id, tier2_team_id, tier3_team_id, tier4_team_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user_id)
    .single()

  if (!data) return []
  return [data.tier1_team_id, data.tier2_team_id, data.tier3_team_id, data.tier4_team_id]
    .filter((id): id is number => id != null)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { gameweek_id, competition_id, team_id, player1_id, player2_id, player1_fixture_id, player2_fixture_id, is_banker, question_answer, comments, all_or_nothing_player_id, play_bonus_card, bonus_card_fixture_id } = await request.json()

  if (player1_id === player2_id) {
    return NextResponse.json({ error: 'Please pick two different players' }, { status: 400 })
  }

  const { data: team } = await supabase
    .from('teams')
    .select('active')
    .eq('id', team_id)
    .single()

  if (!team?.active) {
    return NextResponse.json({ error: 'That team is not currently active' }, { status: 400 })
  }

  // No foreign key exists between players.team_id and teams.id, so this is
  // a plain two-step lookup rather than a select(...) embed.
  const { data: pickedPlayers } = await supabase
    .from('players')
    .select('id, team_id')
    .in('id', [player1_id, player2_id])

  const pickedTeamIds = [...new Set((pickedPlayers ?? []).map(p => p.team_id))]
  const { data: pickedPlayersTeams } = await supabase
    .from('teams')
    .select('id, active')
    .in('id', pickedTeamIds)

  const activeTeamIds = new Set((pickedPlayersTeams ?? []).filter(t => t.active).map(t => t.id))
  const bothPlayersActive = pickedPlayers?.length === 2 && pickedPlayers.every(p => activeTeamIds.has(p.team_id))

  if (!bothPlayersActive) {
    return NextResponse.json({ error: 'One of the selected players is not on an active team' }, { status: 400 })
  }

  // Double gameweek check: if a picked player's team has more than one
  // fixture in this gameweek, which match the pick counts for is genuinely
  // ambiguous — require it to be nominated explicitly rather than silently
  // guessing (or, worse, letting both games' goals count).
  const { data: gwFixtures } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id')
    .eq('gameweek_id', gameweek_id)

  const fixturesByTeam: Record<number, number[]> = {}
  gwFixtures?.forEach(f => {
    ;(fixturesByTeam[f.home_team_id] ??= []).push(f.id)
    ;(fixturesByTeam[f.away_team_id] ??= []).push(f.id)
  })

  const player1Team = pickedPlayers?.find(p => p.id === player1_id)?.team_id
  const player2Team = pickedPlayers?.find(p => p.id === player2_id)?.team_id

  for (const [label, playerTeam, nominatedFixtureId] of [
    ['Player 1', player1Team, player1_fixture_id],
    ['Player 2', player2Team, player2_fixture_id],
  ] as const) {
    const teamFixtures = playerTeam != null ? (fixturesByTeam[playerTeam] ?? []) : []
    if (teamFixtures.length >= 2) {
      if (nominatedFixtureId == null || !teamFixtures.includes(nominatedFixtureId)) {
        return NextResponse.json({
          error: `${label}'s team plays twice this gameweek — you need to choose which match this pick is for.`,
          double_gameweek: true,
          player: label === 'Player 1' ? 'player1' : 'player2',
          fixture_ids: teamFixtures,
        }, { status: 400 })
      }
    }
  }

  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('deadline, status')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  if (new Date() > new Date(gameweek.deadline) || gameweek.status === 'locked') {
    return NextResponse.json({ error: 'Deadline has passed — picks are locked' }, { status: 400 })
  }

  const { data: entry } = await supabase
    .from('competition_entries')
    .select('id, removed')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (!entry || entry.removed) {
    return NextResponse.json({ error: 'You are not entered in this competition' }, { status: 400 })
  }

  const doubleUseTeams = await getDoubleUseTeams(supabase, competition_id, user.id)

  // All or Nothing can raise or lower ONE specific player's normal 2-use
  // cap for the rest of the competition — success grants a bonus 3rd use,
  // failure removes all further uses. At most one row ever exists per
  // user per competition (a unique constraint enforces that), and only a
  // resolved (non-pending) row changes anything.
  const { data: existingAoN } = await supabase
    .from('all_or_nothing_picks')
    .select('id, gameweek_id, player_id, outcome, pick_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const playerMaxOverride: Record<number, number> =
    existingAoN && existingAoN.outcome !== 'pending'
      ? { [existingAoN.player_id]: existingAoN.outcome === 'success' ? 3 : 1 }
      : {}

  const { data: allPicks } = await supabase
    .from('picks')
    .select('team_id, player1_id, player2_id, gameweek_id, is_banker')
    .eq('user_id', user.id)
    .eq('competition_id', competition_id)
    .neq('gameweek_id', gameweek_id)

  if (allPicks) {
    const teamUseCounts: Record<number, number> = {}
    allPicks.forEach(p => {
      teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
    })

    const currentUses = teamUseCounts[team_id] || 0
    const maxUses = doubleUseTeams.includes(team_id) ? 2 : 1

    if (currentUses >= maxUses) {
      return NextResponse.json({
        error: doubleUseTeams.includes(team_id)
          ? 'You have already used this team twice'
          : 'You have already used this team in this competition'
      }, { status: 400 })
    }

    const playerCounts: Record<number, number> = {}
    allPicks.forEach(pick => {
      playerCounts[pick.player1_id] = (playerCounts[pick.player1_id] || 0) + 1
      playerCounts[pick.player2_id] = (playerCounts[pick.player2_id] || 0) + 1
    })

    const max1 = playerMaxOverride[player1_id] ?? 2
    if ((playerCounts[player1_id] || 0) >= max1) {
      return NextResponse.json({ error: `You have already used this player the maximum ${max1} time${max1 === 1 ? '' : 's'} this competition` }, { status: 400 })
    }
    const max2 = playerMaxOverride[player2_id] ?? 2
    if ((playerCounts[player2_id] || 0) >= max2) {
      return NextResponse.json({ error: `You have already used this player the maximum ${max2} time${max2 === 1 ? '' : 's'} this competition` }, { status: 400 })
    }

    if (is_banker) {
      const bankerCount = allPicks.filter(p => p.is_banker).length
      if (bankerCount >= 2) {
        return NextResponse.json({ error: 'You have already used both your bankers' }, { status: 400 })
      }
    }

    // All or Nothing eligibility — only checked when actually nominating.
    if (all_or_nothing_player_id != null) {
      if (all_or_nothing_player_id !== player1_id && all_or_nothing_player_id !== player2_id) {
        return NextResponse.json({ error: 'All or Nothing can only be played on one of your two picks' }, { status: 400 })
      }
      if (existingAoN && existingAoN.gameweek_id !== gameweek_id) {
        return NextResponse.json({ error: 'You have already used your All or Nothing card this competition' }, { status: 400 })
      }
      if ((playerCounts[all_or_nothing_player_id] || 0) > 0) {
        return NextResponse.json({ error: "All or Nothing can only be played on a player you haven't used yet this competition" }, { status: 400 })
      }
      const { data: excluded } = await supabase
        .from('all_or_nothing_exclusions')
        .select('reason')
        .eq('player_id', all_or_nothing_player_id)
        .maybeSingle()
      if (excluded) {
        return NextResponse.json({ error: `That player can't be used for All or Nothing: ${excluded.reason}` }, { status: 400 })
      }
    }
  }

  // Bonus Card — an independent, whole-competition-once bonus on top of the
  // two normal picks above. The existing play (if any) is fetched
  // unconditionally, same reasoning as All or Nothing above — needed both
  // to validate a new play AND to un-play one (unchecking the box).
  const { data: existingBonusCardPlay } = await supabase
    .from('bonus_card_plays')
    .select('id, gameweek_id, fixture_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .maybeSingle()

  let bonusCardPlayerId: number | null = null
  let bonusCardFixtureToStore: number | null = null

  if (play_bonus_card) {
    const { data: comp } = await supabase
      .from('competitions')
      .select('bonus_card_enabled, bonus_card_player_id')
      .eq('id', competition_id)
      .single()

    if (!comp?.bonus_card_enabled || !comp.bonus_card_player_id) {
      return NextResponse.json({ error: 'The Bonus Card is not currently available for this competition' }, { status: 400 })
    }

    bonusCardPlayerId = comp.bonus_card_player_id

    if (bonusCardPlayerId === player1_id || bonusCardPlayerId === player2_id) {
      return NextResponse.json({ error: "You can't play the Bonus Card on a player who's already one of your two picks this gameweek" }, { status: 400 })
    }

    if (existingBonusCardPlay && existingBonusCardPlay.gameweek_id !== gameweek_id) {
      return NextResponse.json({ error: "You've already played your Bonus Card this competition" }, { status: 400 })
    }

    // Same double-gameweek disambiguation normal picks already require,
    // reusing the fixturesByTeam lookup built above for player1/player2.
    const { data: cardPlayer } = await supabase
      .from('players')
      .select('team_id')
      .eq('id', bonusCardPlayerId)
      .single()

    const cardPlayerTeamFixtures = cardPlayer?.team_id != null ? (fixturesByTeam[cardPlayer.team_id] ?? []) : []
    if (cardPlayerTeamFixtures.length >= 2) {
      if (bonus_card_fixture_id == null || !cardPlayerTeamFixtures.includes(bonus_card_fixture_id)) {
        return NextResponse.json({
          error: "The Bonus Card player's team plays twice this gameweek — you need to choose which match this is for.",
          double_gameweek: true,
          player: 'bonus_card',
          fixture_ids: cardPlayerTeamFixtures,
        }, { status: 400 })
      }
      bonusCardFixtureToStore = bonus_card_fixture_id
    }
  }

  // Only ever persist a nominated fixture for a player actually in a double
  // gameweek — anything sent for a single-fixture player is meaningless and
  // discarded here rather than trusted from the client.
  const player1FixturesCount = player1Team != null ? (fixturesByTeam[player1Team]?.length ?? 0) : 0
  const player2FixturesCount = player2Team != null ? (fixturesByTeam[player2Team]?.length ?? 0) : 0
  const player1FixtureToStore = player1FixturesCount >= 2 ? player1_fixture_id : null
  const player2FixtureToStore = player2FixturesCount >= 2 ? player2_fixture_id : null

  const { data: existingPick } = await supabase
    .from('picks')
    .select('id, is_banker, comments')
    .eq('user_id', user.id)
    .eq('gameweek_id', gameweek_id)
    .single()

  let error
  let pickId: string | null = existingPick?.id ?? null
  if (existingPick) {
    const nextComments = comments ?? null
    // A previously-approved comment going straight back onto The Wall
    // unreviewed the moment someone edits it would defeat the entire
    // point of moderation — only reset when the text actually changed,
    // so re-submitting the same pick with an unchanged comment doesn't
    // needlessly bump an already-approved post back into the queue.
    const commentChanged = nextComments !== (existingPick.comments ?? null)

    const { error: updateError } = await supabase
      .from('picks')
      .update({
        team_id,
        player1_id,
        player2_id,
        player1_fixture_id: player1FixtureToStore,
        player2_fixture_id: player2FixtureToStore,
        is_banker,
        is_autopick: false,
        submitted_at: new Date().toISOString(),
        question_answer: question_answer ?? null,
        comments: nextComments,
        ...(commentChanged ? { wall_status: 'pending', wall_rating: null } : {}),
      })
      .eq('id', existingPick.id)
    error = updateError
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('picks')
      .insert({
        user_id: user.id,
        competition_id,
        gameweek_id,
        team_id,
        player1_id,
        player2_id,
        player1_fixture_id: player1FixtureToStore,
        player2_fixture_id: player2FixtureToStore,
        is_banker,
        is_autopick: false,
        question_answer: question_answer ?? null,
        comments: comments ?? null
      })
      .select('id')
      .single()
    error = insertError
    pickId = inserted?.id ?? null
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sync the All or Nothing nomination for THIS gameweek's pick to match
  // what was just requested — eligibility was already fully validated
  // above, before the pick itself was saved, so this just makes the row
  // match (create it, change which player it's on, or remove it if the
  // player nominated no longer matches what was requested).
  if (pickId) {
    await syncAllOrNothingNomination(supabase, {
      existingAoN,
      competition_id,
      user_id: user.id,
      gameweek_id,
      pick_id: pickId,
      nominatedPlayerId: all_or_nothing_player_id ?? null,
    })

    await syncBonusCardPlay(supabase, {
      existingPlay: existingBonusCardPlay,
      competition_id,
      user_id: user.id,
      gameweek_id,
      pick_id: pickId,
      playBonusCard: !!play_bonus_card,
      frozenPlayerId: bonusCardPlayerId,
      fixtureId: bonusCardFixtureToStore,
    })
  }

  return NextResponse.json({ success: true })
}

async function syncBonusCardPlay(
  supabase: any,
  opts: {
    existingPlay: { id: string; gameweek_id: string; fixture_id: number | null } | null
    competition_id: string
    user_id: string
    gameweek_id: string
    pick_id: string
    playBonusCard: boolean
    frozenPlayerId: number | null
    fixtureId: number | null
  }
) {
  const { existingPlay, competition_id, user_id, gameweek_id, pick_id, playBonusCard, frozenPlayerId, fixtureId } = opts

  // A row for THIS gameweek that's no longer wanted is removed first —
  // covers unchecking the card before the deadline. A row belonging to a
  // past gameweek is never reachable here (the earlier validation already
  // blocks submitting a play for any gameweek but the one it was made in).
  if (existingPlay && existingPlay.gameweek_id === gameweek_id && !playBonusCard) {
    await supabase.from('bonus_card_plays').delete().eq('id', existingPlay.id)
    return
  }

  if (!playBonusCard || !frozenPlayerId) return

  if (existingPlay && existingPlay.gameweek_id === gameweek_id) {
    // Already exists for this gameweek — the frozen player never changes
    // once the row exists, only the fixture nomination can still move.
    if (existingPlay.fixture_id !== fixtureId) {
      await supabase.from('bonus_card_plays').update({ fixture_id: fixtureId }).eq('id', existingPlay.id)
    }
    return
  }

  // This is the moment "frozen at play time" actually happens — the live
  // nomination was read once, earlier in this request, and is copied in
  // here as a plain value, never re-read from competitions again.
  await supabase.from('bonus_card_plays').insert({
    competition_id, user_id, gameweek_id, pick_id, player_id: frozenPlayerId, fixture_id: fixtureId,
  })
}

async function syncAllOrNothingNomination(
  supabase: any,
  opts: {
    existingAoN: { id: number; gameweek_id: string; player_id: number; outcome: string; pick_id: string } | null
    competition_id: string
    user_id: string
    gameweek_id: string
    pick_id: string
    nominatedPlayerId: number | null
  }
) {
  const { existingAoN, competition_id, user_id, gameweek_id, pick_id, nominatedPlayerId } = opts

  // A row for THIS gameweek that no longer matches what was requested is
  // removed first — covers backing out of a nomination and swapping which
  // of the two picks it's on. A resolved row belongs to a past gameweek
  // and is never touched here (RLS would refuse the delete anyway).
  if (existingAoN && existingAoN.gameweek_id === gameweek_id && existingAoN.player_id !== nominatedPlayerId) {
    await supabase.from('all_or_nothing_picks').delete().eq('id', existingAoN.id)
  }

  if (!nominatedPlayerId) return
  if (existingAoN && existingAoN.gameweek_id === gameweek_id && existingAoN.player_id === nominatedPlayerId) return

  await supabase.from('all_or_nothing_picks').insert({
    competition_id, user_id, gameweek_id, pick_id, player_id: nominatedPlayerId, outcome: 'pending',
  })
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const competition_id = searchParams.get('competition_id')
  const gameweek_id = searchParams.get('gameweek_id')

  const [{ data: pick }, { data: allPicks }] = await Promise.all([
    supabase
      .from('picks')
      .select('*, teams(name), player1:players!picks_player1_id_fkey(name), player2:players!picks_player2_id_fkey(name)')
      .eq('user_id', user.id)
      .eq('gameweek_id', gameweek_id!)
      .single(),
    supabase
      .from('picks')
      .select('team_id, player1_id, player2_id, is_banker')
      .eq('user_id', user.id)
      .eq('competition_id', competition_id!)
  ])

  const doubleUseTeams = await getDoubleUseTeams(supabase, competition_id!, user.id)

  const teamUseCounts: Record<number, number> = {}
  allPicks?.forEach(p => {
    teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
  })

  const usedTeams = Object.entries(teamUseCounts)
    .filter(([teamId, count]) => {
      const id = parseInt(teamId)
      const max = doubleUseTeams.includes(id) ? 2 : 1
      return count >= max
    })
    .map(([teamId]) => parseInt(teamId))

  const playerCounts: Record<number, number> = {}
  allPicks?.forEach(p => {
    playerCounts[p.player1_id] = (playerCounts[p.player1_id] || 0) + 1
    playerCounts[p.player2_id] = (playerCounts[p.player2_id] || 0) + 1
  })

  const bankersUsed = allPicks?.filter(p => p.is_banker).length ?? 0

  // Its own isolated query, same reasoning as everywhere else in this
  // route — a problem here should never take down the rest of what this
  // endpoint returns.
  const { data: allOrNothing } = await supabase
    .from('all_or_nothing_picks')
    .select('player_id, gameweek_id, outcome')
    .eq('competition_id', competition_id!)
    .eq('user_id', user.id)
    .maybeSingle()

  const playerMaxOverride: Record<number, number> =
    allOrNothing && allOrNothing.outcome !== 'pending'
      ? { [allOrNothing.player_id]: allOrNothing.outcome === 'success' ? 3 : 1 }
      : {}

  // Same isolated-query reasoning as All or Nothing above. Returns the
  // live/current nomination (name resolved client-side from the already-
  // loaded players list) alongside the user's own play, if any — the Picks
  // page needs both to know what the card currently is AND whether/where
  // this user has already used theirs.
  const [{ data: bonusCard }, { data: bonusCardPlay }] = await Promise.all([
    supabase
      .from('competitions')
      .select('bonus_card_enabled, bonus_card_player_id, bonus_card_name')
      .eq('id', competition_id!)
      .single(),
    supabase
      .from('bonus_card_plays')
      .select('gameweek_id, player_id, fixture_id, points')
      .eq('competition_id', competition_id!)
      .eq('user_id', user.id)
      .maybeSingle()
  ])

  return NextResponse.json({
    pick,
    usedTeams,
    playerCounts,
    doubleUseTeams,
    bankersUsed,
    allOrNothing,
    playerMaxOverride,
    bonusCard,
    bonusCardPlay
  })
}
/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import GameInviteModal from './GameInviteModal'
import CharacterSelectionModal from './CharacterSelectionModal'
import EndGameModal from './EndGameModal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck,
  faXmark,
  faGamepad,
  faHourglass,
  faUserPlus,
  faPlay,
  faStop,
  faTrash,
  faRightToBracket
} from '@fortawesome/free-solid-svg-icons'

export default function GamesManager({ user }) {
  const router = useRouter()
  const [games, setGames] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedGameForInvite, setSelectedGameForInvite] = useState(null)
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [selectedGameForCharacter, setSelectedGameForCharacter] = useState(null)
  const [startingGame, setStartingGame] = useState(null)
  const [endingGame, setEndingGame] = useState(null)
  const [deletingGame, setDeletingGame] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [gameToDelete, setGameToDelete] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [showEndGameModal, setShowEndGameModal] = useState(false)
  const [gameToEnd, setGameToEnd] = useState(null)

  useEffect(() => {
    fetchGamesAndCharacters()
  }, [])

  const fetchGamesAndCharacters = async () => {
    try {
      setLoading(true)

      // Fetch games and characters in parallel
      const [gamesResponse, charactersResponse] = await Promise.all([
        fetch('/api/games/my-games', { credentials: 'include' }),
        fetch('/api/characters/', { credentials: 'include' })
      ])

      if (!gamesResponse.ok || !charactersResponse.ok) {
        throw new Error('Failed to fetch data')
      }

      const gamesData = await gamesResponse.json()
      const charactersData = await charactersResponse.json()

      setGames(gamesData.games || [])
      setCharacters(charactersData || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper functions
  const isUserHost = (game) => game.host_id === user.id
  const isUserInvited = (game) => game.invited_users && game.invited_users.includes(user.id)
  const isUserJoined = (game) => game.joined_users && game.joined_users.includes(user.id)

  const getUserRole = (game) => {
    if (isUserHost(game)) return 'DM'
    if (isUserJoined(game)) return 'Player'
    if (isUserInvited(game)) return 'Invited'
    return 'Unknown'
  }

  const getAvailableCharacters = (gameId) => {
    // Return characters that are either not locked or locked to this specific game
    return characters.filter(char =>
      !char.active_game || char.active_game === gameId
    )
  }

  const getSelectedCharacter = (gameId) => {
    // Find character locked to this game
    return characters.find(char => char.active_game === gameId)
  }

  // Accept invite (no character selection)
  const acceptInvite = async (gameId) => {
    try {
      const response = await fetch(`/api/games/${gameId}/invites/accept`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to accept invite')
      }

      // Refresh games list
      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error accepting invite:', err)
      setError(err.message)
    }
  }

  // Decline invite
  const declineInvite = async (gameId) => {
    try {
      const response = await fetch(`/api/games/${gameId}/invites`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to decline invite')
      }

      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error declining invite:', err)
      setError(err.message)
    }
  }

  // Enter game (prompts character selection if needed)
  const enterGame = (game) => {
    const selectedChar = getSelectedCharacter(game.id)

    if (!selectedChar && isUserJoined(game)) {
      // User joined but hasn't selected character - show modal
      setSelectedGameForCharacter(game)
      setShowCharacterModal(true)
    } else {
      // DM or character already selected - join directly
      router.push(`/game?room_id=${game.session_id || game.id}`)
    }
  }

  // Handle character selection success
  const handleCharacterSelected = async () => {
    setShowCharacterModal(false)
    setSelectedGameForCharacter(null)
    // Refresh to show the selected character
    await fetchGamesAndCharacters()
  }

  // Leave game permanently
  const leaveGame = async (gameId) => {
    if (!confirm('Are you sure you want to leave this game? This will remove you from the roster.')) {
      return
    }

    try {
      const response = await fetch(`/api/games/${gameId}/leave`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to leave game')
      }

      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error leaving game:', err)
      setError(err.message)
    }
  }

  // Open invite modal
  const openInviteModal = (game) => {
    setSelectedGameForInvite(game)
    setShowInviteModal(true)
  }

  // Handle successful invite
  const handleInviteSuccess = async (updatedGame) => {
    // Update the game in local state immediately (faster than refetching)
    setGames(prevGames =>
      prevGames.map(g => g.id === updatedGame.id ? updatedGame : g)
    )
    // Also update the selected game being passed to the modal
    setSelectedGameForInvite(updatedGame)
  }

  // Start game session
  const startGame = async (gameId) => {
    setStartingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameId}/start`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to start game')
      }

      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error starting game:', err)
      setError(err.message)
    } finally {
      setStartingGame(null)
    }
  }

  // Show end game modal
  const promptEndGame = (game) => {
    setGameToEnd(game)
    setShowEndGameModal(true)
  }

  // Cancel end game
  const cancelEndGame = () => {
    setShowEndGameModal(false)
    setGameToEnd(null)
  }

  // Confirm end game
  const confirmEndGame = async () => {
    if (!gameToEnd) return

    setEndingGame(gameToEnd.id)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameToEnd.id}/end`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to end game')
      }

      setShowEndGameModal(false)
      setGameToEnd(null)
      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error ending game:', err)
      setError(err.message)
    } finally {
      setEndingGame(null)
    }
  }

  // Show delete confirmation modal
  const handleDeleteClick = (game) => {
    setGameToDelete(game)
    setShowDeleteModal(true)
    setDeleteError(null)
  }

  // Cancel delete
  const handleCancelDelete = () => {
    setShowDeleteModal(false)
    setGameToDelete(null)
    setDeleteError(null)
  }

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!gameToDelete) return

    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch(`/api/games/${gameToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete game')
      }

      // Close modal and refresh
      setShowDeleteModal(false)
      setGameToDelete(null)
      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error deleting game:', err)
      setDeleteError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Separate games into two categories
  // "My Games" includes both games I host (DM) and games I've joined (Player)
  const myGames = games.filter(game => isUserHost(game) || isUserJoined(game))
  const invitedGames = games.filter(game => isUserInvited(game) && !isUserHost(game) && !isUserJoined(game))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mr-3"></div>
        <div className="text-slate-400">Loading games...</div>
      </div>
    )
  }

  // Render game card component
  const renderGameCard = (game, role) => {
    const availableChars = getAvailableCharacters(game.id)
    const selectedChar = getSelectedCharacter(game.id)
    const isOwner = isUserHost(game)

    return (
      <div
        key={game.id}
        className="bg-slate-800 p-6 rounded-lg border border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/30 transition-all"
      >
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          {/* Left side: Title and badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-semibold text-slate-200">
              {game.name}
            </h2>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border flex items-center gap-1.5 ${
              role === 'DM'
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                : role === 'Player'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              <FontAwesomeIcon icon={faGamepad} className="text-xs" />
              {role}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${
              game.status === 'active'
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : game.status === 'starting'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-slate-700 text-slate-400 border-slate-600'
            }`}>
              {game.status}
            </span>
          </div>

          {/* Right side: Action buttons in a row */}
          <div className="flex gap-2 flex-wrap">
            {/* Buttons for My Games (DM) */}
            {isOwner && (
              <>
                {game.status === 'inactive' && (
                  <>
                    <button
                      onClick={() => startGame(game.id)}
                      disabled={startingGame === game.id}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg border border-green-500 hover:bg-green-500 hover:shadow-lg hover:shadow-green-500/30 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {startingGame === game.id ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          Starting...
                        </>
                      ) : (
                        <>
                          <FontAwesomeIcon icon={faPlay} className="text-xs" />
                          Start
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => openInviteModal(game)}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg border border-purple-500 hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
                      Invite
                    </button>
                    <button
                      onClick={() => handleDeleteClick(game)}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg border border-red-500 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                      Delete
                    </button>
                  </>
                )}

                {game.status === 'starting' && (
                  <button
                    disabled
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg border border-amber-500 font-semibold text-sm opacity-50 cursor-not-allowed flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faHourglass} className="animate-pulse text-xs" />
                    Starting...
                  </button>
                )}

                {game.status === 'active' && (
                  <>
                    <button
                      onClick={() => enterGame(game)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg border border-blue-500 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon icon={faRightToBracket} className="text-xs" />
                      Enter
                    </button>
                    <button
                      onClick={() => openInviteModal(game)}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg border border-purple-500 hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
                      Invite
                    </button>
                    <button
                      onClick={() => promptEndGame(game)}
                      className="px-3 py-1.5 bg-orange-600 text-white rounded-lg border border-orange-500 hover:bg-orange-500 hover:shadow-lg hover:shadow-orange-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon icon={faStop} className="text-xs" />
                      End
                    </button>
                  </>
                )}

                {game.status === 'stopping' && (
                  <button
                    disabled
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg border border-amber-500 font-semibold text-sm opacity-50 cursor-not-allowed flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faHourglass} className="animate-pulse text-xs" />
                    Stopping...
                  </button>
                )}
              </>
            )}

            {/* Buttons for Invited Games */}
            {role === 'Invited' && (
              <>
                <button
                  onClick={() => acceptInvite(game.id)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg border border-green-500 hover:bg-green-500 hover:shadow-lg hover:shadow-green-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                >
                  <FontAwesomeIcon icon={faCheck} className="text-xs" />
                  Accept
                </button>
                <button
                  onClick={() => declineInvite(game.id)}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg border border-red-500 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                  Decline
                </button>
              </>
            )}

            {/* Buttons for Joined Games */}
            {role === 'Player' && (
              <>
                {game.status === 'active' && (
                  <button
                    onClick={() => enterGame(game)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg border border-blue-500 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faRightToBracket} className="text-xs" />
                    Enter
                  </button>
                )}
                <button
                  onClick={() => leaveGame(game.id)}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg border border-red-500 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all font-semibold text-sm flex items-center gap-1.5"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                  Leave
                </button>
              </>
            )}
          </div>
        </div>

        {/* Game Meta Info */}
        <div className="text-sm text-slate-400 space-y-1 mb-4">
          <p>
            <span className="font-semibold text-slate-300">Players:</span>{' '}
            {game.player_count} / {game.max_players}
          </p>
          <p>
            <span className="font-semibold text-slate-300">Created:</span>{' '}
            {new Date(game.created_at).toLocaleDateString()}
          </p>
          <p>
            <span className="font-semibold text-slate-300">Last played:</span>{' '}
            {game.started_at ? new Date(game.started_at).toLocaleDateString() : 'Never played'}
          </p>
        </div>

        {/* Character Selection Prompt for Joined Players without Character */}
        {role === 'Player' && !selectedChar && (
          <div className="mb-4 p-3 bg-amber-500/20 border border-amber-500/30 rounded">
            <p className="text-sm text-amber-400">
              ⚠ You need to select a character before entering the game.
            </p>
            <button
              onClick={() => {
                setSelectedGameForCharacter(game)
                setShowCharacterModal(true)
              }}
              className="mt-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg border border-purple-500 hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all font-semibold text-sm"
            >
              Select Character
            </button>
          </div>
        )}

        {/* Roster Display - Show players who have joined */}
        {game.roster && game.roster.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold text-slate-300 mb-3">
              Game Roster ({game.roster.length}/{game.max_players})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {game.roster.map((player) => {
                const isCurrentUser = player.user_id === user.id
                return (
                  <div
                    key={player.user_id}
                    className={`p-3 rounded border max-w-xs ${
                      isCurrentUser
                        ? 'bg-purple-500/20 border-purple-500/50'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  >
                    {player.character_name ? (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isCurrentUser && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded border border-purple-500/50 font-semibold flex-shrink-0">
                              You
                            </span>
                          )}
                          <div className="flex items-baseline gap-1.5 min-w-0">
                            <p className="text-sm font-semibold text-slate-200 truncate">
                              {player.character_name}
                            </p>
                            <p className="text-xs text-slate-400 whitespace-nowrap">
                              Lvl {player.character_level} {player.character_race} {player.character_class}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          Player: {player.username}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isCurrentUser && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded border border-purple-500/50 font-semibold flex-shrink-0">
                              You
                            </span>
                          )}
                          <p className="text-sm font-semibold text-slate-200 truncate">
                            {player.username}
                          </p>
                        </div>
                        <p className="text-xs text-amber-400">
                          No character selected
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Game Info for DMs */}
        {role === 'DM' && game.pending_invites_count > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-sm text-amber-400">
              <span className="font-semibold">{game.pending_invites_count}</span> pending invite(s)
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white uppercase">Games</h1>
        <p className="mt-2 text-slate-400">Manage your active game sessions and invitations</p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* My Games Section (DM + Joined) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-purple-400 uppercase">My Games</h2>
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-sm font-semibold">
            {myGames.length}
          </span>
        </div>

        {myGames.length === 0 ? (
          <div className="bg-slate-800 p-8 rounded-lg text-center border-2 border-dashed border-purple-500/30">
            <p className="text-slate-300 mb-2">You haven't joined any games yet.</p>
            <p className="text-sm text-slate-500">
              Create a game from the Campaign tab, or accept an invite from a friend!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {myGames.map((game) => {
              // Determine role: DM if host, Player if joined
              const role = isUserHost(game) ? 'DM' : 'Player'
              return renderGameCard(game, role)
            })}
          </div>
        )}
      </div>

      {/* Invited Games Section (Pending Invites) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-purple-400 uppercase">Invited Games</h2>
          <span className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-sm font-semibold">
            {invitedGames.length}
          </span>
        </div>

        {invitedGames.length === 0 ? (
          <div className="bg-slate-800 p-8 rounded-lg text-center border-2 border-dashed border-purple-500/30">
            <p className="text-slate-300 mb-2">You haven't been invited to any games yet.</p>
            <p className="text-sm text-slate-500">
              Wait for a DM to invite you, or ask your friends to add you to their games!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {invitedGames.map((game) => renderGameCard(game, 'Invited'))}
          </div>
        )}
      </div>

      {/* Game Invite Modal */}
      {showInviteModal && selectedGameForInvite && (
        <GameInviteModal
          game={selectedGameForInvite}
          onClose={() => {
            setShowInviteModal(false)
            setSelectedGameForInvite(null)
          }}
          onInviteSuccess={handleInviteSuccess}
        />
      )}

      {/* Character Selection Modal */}
      {showCharacterModal && selectedGameForCharacter && (
        <CharacterSelectionModal
          game={selectedGameForCharacter}
          characters={getAvailableCharacters(selectedGameForCharacter.id)}
          onClose={() => {
            setShowCharacterModal(false)
            setSelectedGameForCharacter(null)
          }}
          onCharacterSelected={handleCharacterSelected}
        />
      )}

      {/* Delete Game Confirmation Modal */}
      {showDeleteModal && gameToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-purple-500/30 rounded-lg shadow-2xl shadow-purple-500/20 p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-purple-400 mb-2">Delete Game Session</h3>
            <p className="text-slate-300 mb-1">
              Are you sure you want to delete <strong className="text-purple-400">{gameToDelete.name}</strong>?
            </p>
            <p className="text-sm text-slate-500 mb-4">This action cannot be undone.</p>

            {deleteError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 text-white border border-red-500 rounded-lg hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faTrash} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* End Game Confirmation Modal */}
      {showEndGameModal && (
        <EndGameModal
          game={gameToEnd}
          onConfirm={confirmEndGame}
          onCancel={cancelEndGame}
          isEnding={endingGame === gameToEnd?.id}
        />
      )}
    </div>
  )
}

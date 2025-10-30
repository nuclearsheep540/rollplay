/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import GameInviteModal from './GameInviteModal'
import CharacterSelectionModal from './CharacterSelectionModal'

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

  // End game session
  const endGame = async (gameId) => {
    if (!confirm('Are you sure you want to end this game session? All player progress will be saved.')) {
      return
    }

    setEndingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameId}/end`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to end game')
      }

      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error ending game:', err)
      setError(err.message)
    } finally {
      setEndingGame(null)
    }
  }

  // Delete game
  const deleteGame = async (gameId, gameName) => {
    if (!confirm(`Are you sure you want to delete "${gameName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete game')
      }

      await fetchGamesAndCharacters()
    } catch (err) {
      console.error('Error deleting game:', err)
      setError(err.message)
    } finally {
      setDeletingGame(null)
    }
  }

  // Separate games into three categories
  const myGames = games.filter(game => isUserHost(game))
  const invitedGames = games.filter(game => isUserInvited(game) && !isUserHost(game))
  const joinedGames = games.filter(game => isUserJoined(game) && !isUserHost(game))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading games...</div>
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
        className="bg-white p-6 rounded-lg shadow border border-slate-200"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-semibold text-slate-800">
                {game.name}
              </h2>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                role === 'DM'
                  ? 'bg-purple-100 text-purple-700'
                  : role === 'Player'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {role}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                game.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : game.status === 'starting'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {game.status}
              </span>
            </div>

            <div className="text-sm text-slate-600 space-y-1">
              <p>
                <span className="font-semibold">Players:</span>{' '}
                {game.player_count} / {game.max_players}
              </p>
              <p>
                <span className="font-semibold">Created:</span>{' '}
                {new Date(game.created_at).toLocaleDateString()}
              </p>
              {game.started_at && (
                <p>
                  <span className="font-semibold">Last played:</span>{' '}
                  {new Date(game.started_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Buttons for My Games (DM) */}
            {isOwner && (
              <>
                {game.status === 'inactive' && (
                  <>
                    <button
                      onClick={() => startGame(game.id)}
                      disabled={startingGame === game.id}
                      className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {startingGame === game.id ? 'Starting...' : 'Start Game'}
                    </button>
                    <button
                      onClick={() => openInviteModal(game)}
                      className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-semibold"
                    >
                      Invite Friends
                    </button>
                    <button
                      onClick={() => deleteGame(game.id, game.name)}
                      disabled={deletingGame === game.id}
                      className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingGame === game.id ? 'Deleting...' : 'Delete Game'}
                    </button>
                  </>
                )}

                {game.status === 'starting' && (
                  <button
                    disabled
                    className="px-6 py-2 bg-yellow-600 text-white rounded font-semibold opacity-50 cursor-not-allowed"
                  >
                    Starting...
                  </button>
                )}

                {game.status === 'active' && (
                  <>
                    <button
                      onClick={() => enterGame(game)}
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold"
                    >
                      Enter Game
                    </button>
                    <button
                      onClick={() => endGame(game.id)}
                      disabled={endingGame === game.id}
                      className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {endingGame === game.id ? 'Ending...' : 'End Game'}
                    </button>
                  </>
                )}

                {game.status === 'stopping' && (
                  <button
                    disabled
                    className="px-6 py-2 bg-yellow-600 text-white rounded font-semibold opacity-50 cursor-not-allowed"
                  >
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
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-semibold"
                >
                  Accept Invite
                </button>
                <button
                  onClick={() => declineInvite(game.id)}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
                >
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
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Enter Game
                  </button>
                )}
                <button
                  onClick={() => leaveGame(game.id)}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
                >
                  Leave Game
                </button>
              </>
            )}
          </div>
        </div>

        {/* Character Info for Joined Players */}
        {role === 'Player' && selectedChar && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              Your Character:
            </p>
            <div className="bg-indigo-50 border border-indigo-300 rounded p-3">
              <p className="font-semibold text-indigo-900">{selectedChar.character_name}</p>
              <p className="text-sm text-indigo-700">
                Level {selectedChar.level} {selectedChar.character_race} {selectedChar.character_class}
              </p>
              {selectedChar.is_alive === false && (
                <p className="text-xs font-semibold text-red-600 mt-1">☠ Deceased</p>
              )}
            </div>
          </div>
        )}

        {/* Character Selection Prompt for Joined Players without Character */}
        {role === 'Player' && !selectedChar && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-amber-600">
              ⚠ You need to select a character before entering the game.
            </p>
            <button
              onClick={() => {
                setSelectedGameForCharacter(game)
                setShowCharacterModal(true)
              }}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-semibold text-sm"
            >
              Select Character
            </button>
          </div>
        )}

        {/* Game Info for DMs */}
        {role === 'DM' && game.pending_invites_count > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-amber-600">
              <span className="font-semibold">{game.pending_invites_count}</span> pending invite(s)
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800">Games</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* My Games Section (DM) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-slate-800">My Games</h2>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
            {myGames.length}
          </span>
        </div>

        {myGames.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center border-2 border-dashed border-slate-300">
            <p className="text-slate-600 mb-2">You haven't created any games yet.</p>
            <p className="text-sm text-slate-500">
              Create a campaign and start a game from the Campaign tab!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {myGames.map((game) => renderGameCard(game, 'DM'))}
          </div>
        )}
      </div>

      {/* Invited Games Section (Pending Invites) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-slate-800">Invited Games</h2>
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
            {invitedGames.length}
          </span>
        </div>

        {invitedGames.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center border-2 border-dashed border-slate-300">
            <p className="text-slate-600 mb-2">You haven't been invited to any games yet.</p>
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

      {/* Joined Games Section (Accepted Roster) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-slate-800">Joined Games</h2>
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
            {joinedGames.length}
          </span>
        </div>

        {joinedGames.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center border-2 border-dashed border-slate-300">
            <p className="text-slate-600 mb-2">You haven't joined any games yet.</p>
            <p className="text-sm text-slate-500">
              Accept an invite to join a game and start playing!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {joinedGames.map((game) => renderGameCard(game, 'Player'))}
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
    </div>
  )
}

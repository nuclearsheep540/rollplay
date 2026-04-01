audio cue state isnt persisted between drawer states. ie, I could 'prep' what I want my next cue to look like, close the drawer, re-open the drawer and find that my prepared cue state is no more - its defauling to PGM.

when a user is invited to a campaign where the session was already ACTIVE then their name data isnt present in the mongo data, but their UUID. We might be expecting ETL to hydrate values, so a new join to a session which live could HTTPX a player-ETL to hydrate the mongo instance with new values to work off - will need to test that with this approach, ETL is still happy, i.e new user joins with character, HTTPX hydrates users character, user makes a change to character in game e.g losing hp, end session ETL still respects the character changes


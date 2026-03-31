audio cue state isnt persisted between drawer states. ie, I could 'prep' what I want my next cue to look like, close the drawer, re-open the drawer and find that my prepared cue state is no more - its defauling to PGM.

when a user is invited to a campaign where the session was already ACTIVE then their name isnt present in the mongo data, just their UUID. We might be expecting ETL to hydrate values, so a new join to a session which live could HTTPX a player-ETL to hydrate the mongo instance with new values to work off - will need to test that with this approach, ETL is still happy, i.e new user joins with character, HTTPX hydrates users character, user makes a change to character in game e.g losing hp, end session ETL still respects the character changes

here is a film grain example with css:
https://codepen.io/ooblek/pen/vYxYomx

I prefer it with these parameters:
.hero:after{
  content:"";
  background-image:url("https://upload.wikimedia.org/wikipedia/commons/7/76/1k_Dissolve_Noise_Texture.png");
  height: 200%;
  width: 200%;
  position: fixed;
  opacity:0.2;
   animation: animateGrain 1.2s steps(1) infinite;
}
# Online play and TURN

The game loads `multiplayer-config.json` before creating either player's
PeerJS client. It uses the same static Metered client credentials as Stacker's
`e3b94d3` commit, replacing the old generic `openrelayproject` credentials.
The configuration includes UDP, TCP, and TLS on port 443. PeerJS continues to
handle signalling; gameplay uses a WebRTC data channel.

## Test the relay

1. Serve the updated game over HTTP on localhost or HTTPS, or deploy the changed
   files to the existing GitHub Pages site.
2. Open the game with `?relay=1` **on both devices**. After deployment, use
   `https://ricardobertolin.github.io/chicken_keeper_app/?relay=1`.
3. Choose **Play Online**, host a lobby, and share its six-character code.
4. Join from the second device, preferably on a different network, and play.

This game shares codes rather than invitation URLs, so each player must open
the relay-test URL themselves. A successful game in this mode confirms a TURN
route; a successful game with the normal URL may use a direct connection.
Use the normal URL for everyday play so ICE can choose any working route.

Both host and guest stop unestablished data-channel attempts after 15 seconds.
Settings and optional credential-service requests each have a separate
10-second timeout; the data-channel timeout starts after signalling offers a
connection. Leaving the lobby cancels that attempt and prevents late events
from starting a game.

## Change credentials

Replace `iceServers` in `multiplayer-config.json` with your provider's exact
ICE server array. `multiplayer-config.example.json` shows the format. These are
public browser client credentials; never put an account API token or TURN
shared secret in this file. The copied credentials share Stacker's provider
quota and can be replaced independently here.

Alternatively, set `turnCredentialsUrl` to an HTTPS endpoint returning
`{ "iceServers": [...] }` from a POST request, and leave `iceServers` empty.
The endpoint must permit this game's origin through CORS. The optional Stacker
credential service can be reused if deployed and configured for this origin;
no new backend is needed for the included static credentials.

Configuring both sources, invalid credentials, or a failing configured service
stops lobby creation with an error. With neither source configured, the game
allows direct connections and explains that restrictive networks may need a
relay. `?relay=1` requires configured TURN servers.

The service worker bypasses the settings file, and the client requests settings
and temporary credentials without caching. Reopen the updated game on both
devices after deployment; an already open tab retains its running code.

## Automated checks

Run `node --test tests/multiplayer.test.mjs` (Node.js 20 or newer). The checks
exercise host and guest setup, invalid settings, cancellation, timeouts,
connection lifecycle, relay-only policy, and service-worker cache bypass.
They mock PeerJS and network responses; they do not establish a live TURN
allocation or prove connectivity across two real networks.

# ArewaSafe server

```
cd server
npm install
cp .env.example .env   # add GEMINI_API_KEY and GEMMA_MODEL
npm start
```

Without a key/model the dispatcher uses a built-in fallback SitRep, so the demo never breaks.

## Quick tests (curl)

```
# start a trip
curl -X POST localhost:3000/trips/start            # -> {"tripId":1}

# send a heartbeat (speed in km/h)
curl -X POST localhost:3000/heartbeat -H 'content-type: application/json' \
  -d '{"tripId":1,"lat":10.70,"lng":7.52,"speed":80,"heading":20}'

# silent "911=" alert
curl -X POST localhost:3000/alert -H 'content-type: application/json' -d '{"tripId":1}'

# dead-man's switch: start a trip, send one heartbeat, then stop.
# After ~2 x HEARTBEAT_MS a DEAD_MAN incident appears at /incidents.

# approve the community broadcast
curl -X POST localhost:3000/incidents/1/confirm
```

## Notes
- Edit CORRIDOR in config.js with real road points before relying on the deviation detector.
- Phone must send speed in km/h (expo-location gives m/s: multiply by 3.6).
- End a trip normally with POST /trips/:id/end or the dead-man's switch will fire.
- broadcaster.js is a stub; swap in a real Flash SMS / voice provider later.

// Tiny Server-Sent Events hub for the dashboard.
const clients = new Set();

export function addClient(res) { clients.add(res); }
export function removeClient(res) { clients.delete(res); }

export function emit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

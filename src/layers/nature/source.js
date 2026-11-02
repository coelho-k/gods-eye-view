/** Read NOAA Coral Reef Watch stations and history through the local proxy. */
export function createCoralStationSource({
  fetchImpl = globalThis.fetch,
} = {}) {
  async function getJson(path, signal) {
    const response = await fetchImpl(path, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Coral Reef Watch unavailable');
    return response.json();
  }
  return {
    async getStations({ signal } = {}) {
      const body = await getJson('/api/coral/stations', signal);
      return Array.isArray(body?.stations) ? body : { stations: [] };
    },
    async getSeries(id, { signal } = {}) {
      return getJson(`/api/coral/series?id=${encodeURIComponent(id)}`, signal);
    },
  };
}

/* =====================================================================
   sync.js — live updates between browsers and users. Loaded after dashboard.js (both deferred, same global
   scope): it uses apiRequest, LOOKUPS, lookup / suggest, pbData, allLists(), masterImport and
   recheckImportDuplicates() from there; dashboard.js calls noteOwnChange() from apiRequest and
   initLiveUpdates() once signed in.

   What it guarantees, and what the server guarantees:
   - The server refuses duplicates itself (api_bootstrap.php: one write at a time per endpoint, a name
     check inside that lock), so two people saving the same name at the same moment get one record and
     one "already exists" — whatever any screen showed.
   - This file makes every open screen show other people's changes within about LIVE_POLL_MS.
   ===================================================================== */

/* How it works:
   Every write bumps its endpoint's version on the server (data_versions). Each open dashboard asks
   api/changes.php for those numbers every LIVE_POLL_MS while its tab is visible (and at once when it
   comes back), then reloads only what changed: the dropdown / lookup lists of that endpoint and the open
   list page (keeping its search, page and focus), also behind a popup — an open Import preview marks the
   rows someone else just added as duplicates. Forms being typed in are never touched.
   This browser's own writes come back in X-Data-Version and are not reloaded twice.
*/

const LIVE_POLL_MS = 1000;                  // a change shows on every other open screen within about a second
const live = { versions: null, busy: false, pending: new Set() };
const endpointName = url => url.split('?')[0].split('/').pop().replace(/\.php$/, '');

// "uoms=42" from this browser's own write: when it is the very next version, nobody else changed it meanwhile.
function noteOwnChange(header) {
  const [name, value] = header.split('=');
  const version = Number(value);
  if (!live.versions || !name || !version) return;
  if (version === (live.versions[name] ?? 0) + 1) live.versions[name] = version;
}

async function pollChanges() {
  if (document.hidden || live.busy) return;
  live.busy = true;
  try {
    const { versions } = await apiRequest('api/changes.php');
    if (live.versions) {
      for (const [name, version] of Object.entries(versions)) if (live.versions[name] !== version) live.pending.add(name);
    }
    live.versions = { ...versions };
    if (live.pending.size) await applyLiveChanges();
  } catch { /* offline for a moment: the next poll tries again */ } finally {
    live.busy = false;
  }
}

// Endpoints whose changes also show in another list (an item row shows its unit, category, stock points …).
const LIVE_DEPENDS = {
  'api/items.php': ['uoms', 'categories', 'sub-categories', 'brands', 'warehouses', 'rack-bins', 'suppliers', 'grns'],
  'api/suppliers.php': ['brands'],
};

async function applyLiveChanges() {
  const changed = new Set(live.pending);
  // Cached lookup rows go stale: the next popup or dropdown loads them again. An open one keeps its rows.
  const kinds = Object.keys(LOOKUPS).filter(kind => LOOKUPS[kind].api && changed.has(endpointName(LOOKUPS[kind].api)));
  const openKind = byId('lookup').open ? lookup.kind : suggest.field?.dataset.suggest;
  forgetLookups(...kinds.filter(kind => kind !== openKind));
  if (changed.has('items')) pbData.items.clear();
  if (changed.has('suppliers')) pbData.suppliers.clear();
  if (changed.has('rack-bins')) apiRequest('api/rack-bins.php').then(racks => { pbData.racks = racks; }).catch(() => {});

  // The open list page, unless a popup is over it (then on a later poll, once it has closed).
  const list = allLists().find(entry => entry.pageKey === currentPage);
  const affects = list && [endpointName(list.config.api), ...(LIVE_DEPENDS[list.config.api] || [])].some(name => changed.has(name));
  const keep = new Set(kinds.includes(openKind) ? [endpointName(LOOKUPS[openKind].api)] : []);   // forget it once closed
  if (affects) {
    if (masterImport.busy || !list.loaded) for (const name of changed) keep.add(name);   // after our own import
    else {
      await list.refresh();
      if (byId('master-import').open && masterImport.list === list) recheckImportDuplicates();
    }
  }
  live.pending = keep;
}

function initLiveUpdates() {
  pollChanges();
  setInterval(pollChanges, LIVE_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollChanges(); });
  window.addEventListener('focus', pollChanges);
}

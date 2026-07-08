/**
 * ROUTE (PAGE) TILES — a full-page view rendered as a layout-tree pane BESIDE
 * the main thread, the page analog of session tiles. Built-in pages
 * (Capabilities / Messaging / Artifacts) render their view; plugin pages render
 * their `ROUTES_AREA` contribution. Lifecycle mirrors session tiles:
 * `openRouteTile(path)` -> `watchRouteTiles` registers a pane docked beside
 * main -> tree adoption lands it on the chosen edge; closing removes it.
 */

import { lazy, type ReactNode, Suspense } from 'react'

import { registerPaneCloser, removeTreePane } from '@/components/pane-shell/tree/store'
import { ContribBoundary } from '@/contrib/react/boundary'
import { useContributions } from '@/contrib/react/use-contributions'
import { registry } from '@/contrib/registry'
import { $routeTiles, closeRouteTile } from '@/store/route-tiles'

import { ARTIFACTS_ROUTE, contributedRoutes, MESSAGING_ROUTE, ROUTES_AREA, SKILLS_ROUTE } from '../routes'

const SkillsView = lazy(async () => ({ default: (await import('../skills')).SkillsView }))
const MessagingView = lazy(async () => ({ default: (await import('../messaging')).MessagingView }))
const ArtifactsView = lazy(async () => ({ default: (await import('../artifacts')).ArtifactsView }))

// Built-in page views + their pane titles, keyed by route.
const BUILTIN_PAGES: Record<string, { render: () => ReactNode; title: string }> = {
  [ARTIFACTS_ROUTE]: { render: () => <ArtifactsView />, title: 'Artifacts' },
  [MESSAGING_ROUTE]: { render: () => <MessagingView />, title: 'Messaging' },
  [SKILLS_ROUTE]: { render: () => <SkillsView />, title: 'Capabilities' }
}

const routeTilePaneId = (path: string) => `route-tile:${path}`

/** Title for a route tile: the built-in name, else the plugin route's own. */
function routeTitle(path: string): string {
  return BUILTIN_PAGES[path]?.title ?? contributedRoutes().find(r => r.path === path)?.key ?? path
}

function RouteTilePane({ path }: { path: string }) {
  const builtin = BUILTIN_PAGES[path]

  // Subscribe so a plugin page tile appears the moment its route registers.
  useContributions(ROUTES_AREA)
  const contrib = builtin ? null : contributedRoutes().find(r => r.path === path)

  if (builtin) {
    return (
      <ContribBoundary id={path}>
        <Suspense fallback={null}>{builtin.render()}</Suspense>
      </ContribBoundary>
    )
  }

  if (contrib) {
    return <ContribBoundary id={path}>{contrib.render()}</ContribBoundary>
  }

  return <div className="grid h-full place-items-center font-mono text-[11px] text-(--ui-text-quaternary)">no page at {path}</div>
}

// ---------------------------------------------------------------------------
// Route tile -> pane contribution sync (call once from the app root).
// ---------------------------------------------------------------------------

const registered = new Map<string, { dispose: () => void; title: string }>()

function syncRouteTilePanes(): void {
  const tiles = $routeTiles.get()
  const wanted = new Set(tiles.map(t => t.path))

  for (const { dir, path } of tiles) {
    const title = routeTitle(path)
    const current = registered.get(path)

    if (!current || current.title !== title) {
      const dispose = registry.register({
        id: routeTilePaneId(path),
        area: 'panes',
        title,
        data: { dock: { pane: 'workspace', pos: dir ?? 'right' }, minWidth: '22rem', placement: 'main' },
        render: () => <RouteTilePane path={path} />
      })

      registered.set(path, { dispose, title })

      if (!current) {
        registerPaneCloser(routeTilePaneId(path), () => closeRouteTile(path))
      }
    }
  }

  for (const [path, entry] of registered) {
    if (!wanted.has(path)) {
      entry.dispose()
      registered.delete(path)
      removeTreePane(routeTilePaneId(path))
    }
  }
}

/** Keep pane contributions mirroring `$routeTiles`. Call once from the root. */
export function watchRouteTiles(): void {
  syncRouteTilePanes()
  $routeTiles.listen(syncRouteTilePanes)
}

import { useEffect, useRef, useState } from 'react'
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, reconcileElements } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, BinaryFiles, BinaryFileData, DataURL } from '@excalidraw/excalidraw/types'
import type { FileId, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile'
import '@excalidraw/excalidraw/index.css'
import type { InsertAsset } from './InsertPanel'

interface Props {
  elements: unknown[] | null
  files?: Record<string, unknown>
  theme: 'dark' | 'light'
  onChange: (els: unknown[], files: Record<string, unknown>) => void
  /** An icon or image to drop at the centre of the view. */
  insert?: InsertAsset | null
  onInserted?: () => void
}

export default function Whiteboard({ elements, files, theme, onChange, insert, onInserted }: Props) {
  const lastSig = useRef('')
  const timer = useRef<number | undefined>(undefined)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  // The API exists before initialData is applied; inserting earlier gets overwritten by the initial scene.
  const [loaded, setLoaded] = useState(false)

  // Someone else drew: merge their elements into the scene, newer version of each winning.
  useEffect(() => {
    if (!api || !loaded || !elements) return
    const incoming = elements as OrderedExcalidrawElement[]
    const sig = signature(incoming)
    if (sig === lastSig.current) return
    const missing = Object.entries(files ?? {}).filter(([id]) => !api.getFiles()[id])
    if (missing.length) api.addFiles(missing.map(([, f]) => f as BinaryFileData))
    const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), incoming as RemoteExcalidrawElement[], api.getAppState())
    // Not added to this browser's undo history: undo should only take back your own strokes.
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER })
  }, [api, loaded, elements, files])

  useEffect(() => {
    if (!api || !loaded || !insert) return
    const fileId = crypto.randomUUID() as FileId
    api.addFiles([{ id: fileId, dataURL: insert.dataURL as DataURL, mimeType: insert.mimeType as BinaryFileData['mimeType'], created: Date.now() }])
    const st = api.getAppState()
    const z = st.zoom.value
    const x = st.width / 2 / z - st.scrollX - insert.width / 2
    const y = st.height / 2 / z - st.scrollY - insert.height / 2
    const [el] = convertToExcalidrawElements([{ type: 'image', fileId, x, y, width: insert.width, height: insert.height }])
    api.updateScene({ elements: [...api.getSceneElements(), el], appState: { selectedElementIds: { [el.id]: true } } })
    onInserted?.()
  }, [api, loaded, insert, onInserted])

  return (
    <div className="whiteboard">
      <Excalidraw
        excalidrawAPI={setApi}
        theme={theme}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={{ elements: (elements ?? []) as any, files: (files ?? {}) as BinaryFiles, appState: { viewBackgroundColor: 'transparent' } }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
        onChange={(els, _state, allFiles) => {
          if (!loaded) setLoaded(true)
          // Excalidraw fires onChange on every pointer move; only save real edits.
          const sig = signature(els)
          if (sig === lastSig.current) return
          lastSig.current = sig
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            // Deleted elements are sent too (marked isDeleted), so the delete reaches others.
            const used = new Set(els.flatMap((e) => (e.type === 'image' && e.fileId ? [e.fileId] : [])))
            const kept = Object.fromEntries(Object.entries(allFiles).filter(([id]) => used.has(id as FileId)))
            onChange(els as unknown[], kept)
          }, 400)
        }}
      />
    </div>
  )
}

/** Changes whenever any element is added or edited. */
const signature = (els: readonly { id: string; version: number }[]) => els.map((e) => e.id + ':' + e.version).join(',')

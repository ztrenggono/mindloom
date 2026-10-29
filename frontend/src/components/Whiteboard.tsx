import { useEffect, useRef, useState } from 'react'
import { convertToExcalidrawElements, Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, BinaryFiles, BinaryFileData, DataURL } from '@excalidraw/excalidraw/types'
import type { FileId } from '@excalidraw/excalidraw/element/types'
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
          const sig = els.map((e) => e.id + ':' + e.version).join(',')
          if (sig === lastSig.current) return
          lastSig.current = sig
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            const live = els.filter((e) => !e.isDeleted)
            // Keep only images still on the board, so deleted uploads do not pile up.
            const used = new Set(live.flatMap((e) => (e.type === 'image' && e.fileId ? [e.fileId] : [])))
            const kept = Object.fromEntries(Object.entries(allFiles).filter(([id]) => used.has(id as FileId)))
            onChange(live as unknown[], kept)
          }, 400)
        }}
      />
    </div>
  )
}

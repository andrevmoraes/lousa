import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Download, Group, Plus, Search, Trash2, Ungroup, Upload } from 'lucide-react'
import '@xyflow/react/dist/style.css'

type CardData = {
  title: string
  text: string
  status: CardStatus
  tag?: string
}

type GroupData = CardData

type CardStatus = 'confirmed' | 'invited' | 'not-invited' | 'paid'

const statusOptions: { value: CardStatus; label: string }[] = [
  { value: 'paid', label: 'Pago' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'invited', label: 'Convidado' },
  { value: 'not-invited', label: 'Não convidado' },
]

const CARD_WIDTH = 216
const CARD_HEIGHT = 72
const GROUP_TOP_PADDING = 24
const GROUP_LEFT_PADDING = 72
const GROUP_RIGHT_PADDING = 24
const GROUP_BOTTOM_PADDING = 24

const exportData = (nodes: Node<CardData>[]) => nodes.map((node) => ({
  ...(node.type === 'group'
    ? { id: node.id, type: 'group', title: node.data.title, style: node.style }
    : {
        id: node.id,
        type: 'card',
        ...(node.parentId ? { parentId: node.parentId } : {}),
        text: node.data.text,
        status: node.data.status,
        color: node.data.status === 'paid' ? 'sparkling-green' : node.data.status === 'confirmed' ? 'green' : node.data.status === 'invited' ? 'orange' : 'gray',
      }),
  position: {
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
  },
}))

const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function GroupNode({ data, id }: { data: GroupData; id: string }) {
  return (
    <div className="group-node">
      <div className="group-label-wrap">
        <input
          className="group-label nodrag"
          value={data.title}
          aria-label="Nome do grupo"
          onChange={(event) => {
            window.dispatchEvent(new CustomEvent('change-group-title', {
              detail: { id, title: event.target.value },
            }))
          }}
        />
      </div>
      <div className="group-content" />
    </div>
  )
}

const isCardStatus = (value: unknown): value is CardStatus =>
  value === 'confirmed' || value === 'invited' || value === 'not-invited' || value === 'paid'

const parseImportedData = (content: string, filename: string): { projectName?: string; nodes: Node<CardData>[] } => {
  if (!filename.toLowerCase().endsWith('.json')) {
    throw new Error('Selecione um arquivo JSON exportado pela lousa.')
  }
  const parsed = JSON.parse(content) as { projectName?: unknown; cards?: unknown } | unknown[]
  const importedCards = (Array.isArray(parsed) ? parsed : parsed.cards) as {
    id?: unknown
    type?: unknown
    title?: unknown
    text?: unknown
    status?: unknown
    parentId?: unknown
    style?: { width?: number; height?: number }
    position?: { x?: unknown; y?: unknown }
  }[]

  if (!Array.isArray(importedCards) || importedCards.length === 0) {
    throw new Error('O arquivo não contém cards.')
  }

  const nodes: Node<CardData>[] = importedCards.map((card, index): Node<CardData> => {
    const x = Number(card.position?.x)
    const y = Number(card.position?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`O card ${index + 1} possui dados inválidos.`)
    }
    if (card.type === 'group') {
      return {
        id: typeof card.id === 'string' && card.id ? card.id : `imported-group-${Date.now()}-${index}`,
        type: 'group',
        position: { x, y },
        style: {
          width: Number(card.style?.width) || CARD_WIDTH + GROUP_LEFT_PADDING + GROUP_RIGHT_PADDING,
          height: Number(card.style?.height) || CARD_HEIGHT + GROUP_TOP_PADDING + GROUP_BOTTOM_PADDING,
        },
        data: { title: typeof card.title === 'string' && card.title ? card.title : 'Novo grupo', text: '', status: 'invited' as const },
        draggable: true,
      }
    }
    const text = typeof card.text === 'string' ? card.text : ''
    const status = isCardStatus(card.status) ? card.status : 'invited'
    if (!text) throw new Error(`O card ${index + 1} possui dados inválidos.`)
    return {
      id: typeof card.id === 'string' && card.id ? card.id : `imported-${Date.now()}-${index}`,
      type: 'card',
      parentId: typeof card.parentId === 'string' ? card.parentId : undefined,
      position: { x, y },
      data: { title: text, text, status },
      ...(typeof card.parentId === 'string' ? { extent: 'parent' as const } : {}),
    }
  })
  const groupIds = new Set(nodes.filter((node) => node.type === 'group').map((node) => node.id))
  const orderedNodes = [
    ...nodes.filter((node) => node.type === 'group'),
    ...nodes.filter((node) => node.type === 'card').map((node) => (
      node.parentId && !groupIds.has(node.parentId)
        ? { ...node, parentId: undefined, extent: undefined, position: { ...node.position } }
        : node
    )),
  ]
  const projectName = !Array.isArray(parsed) && typeof parsed.projectName === 'string' ? parsed.projectName : undefined
  return { projectName, nodes: orderedNodes }
}

const loadNodes = (): Node<CardData>[] => {
  try {
    const saved = localStorage.getItem('lousa-nodes')
    if (!saved) return []

    const parsed = JSON.parse(saved) as { cards?: unknown } | Node<Partial<CardData>>[]
    if (!Array.isArray(parsed) && Array.isArray(parsed.cards)) {
      return parseImportedData(saved, 'saved.json').nodes
    }

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((node) => node.id !== 'welcome' && node.id !== 'idea')
      .map((node) => node.type === 'group'
        ? { ...node, data: { title: node.data?.title ?? 'Novo grupo', text: '', status: 'invited' as const } }
        : {
            ...node,
            data: {
              title: node.data?.title ?? 'Novo cartão',
              text: node.data?.text ?? '',
              status: isCardStatus(node.data?.status) ? node.data.status : 'invited',
              tag: node.data?.tag,
            },
          }) as Node<CardData>[]
  } catch {
    return []
  }
}

const loadProjectName = () => {
  try {
    const saved = localStorage.getItem('lousa-nodes')
    if (saved) {
      const parsed = JSON.parse(saved) as { projectName?: unknown }
      if (typeof parsed.projectName === 'string' && parsed.projectName) return parsed.projectName
    }
  } catch {
    // Fall back to the legacy project-name key when the board data is invalid.
  }
  return localStorage.getItem('lousa-project-name') ?? 'Minha lousa'
}

function CardNode({ data, id }: { data: CardData; id: string }) {
  return (
    <article className={`card-node card-${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="card-top">
        <div className="card-status nodrag" role="group" aria-label="Status do cartão">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              className={data.status === option.value ? 'selected' : ''}
              aria-label={option.label}
              aria-pressed={data.status === option.value}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('change-card-status', {
                  detail: { id, status: option.value },
                }))
              }}
            />
          ))}
        </div>
        <button className="icon-button nodrag" aria-label="Excluir cartão" onClick={() => window.dispatchEvent(new CustomEvent('delete-card', { detail: id }))}>
          <Trash2 size={13} />
        </button>
      </div>
      <input
        className="card-text nodrag"
        type="text"
        value={data.text}
        aria-label="Texto do cartão"
        placeholder="Escreva uma ideia..."
        onChange={(event) => {
          window.dispatchEvent(new CustomEvent('change-card-text', {
            detail: { id, text: event.target.value },
          }))
        }}
      />
    </article>
  )
}

function Board() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>(loadNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [search, setSearch] = useState('')
  const [projectName, setProjectName] = useState(loadProjectName)
  const [importError, setImportError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  const allNodeTypes: NodeTypes = useMemo(() => ({ card: CardNode, group: GroupNode }), [])

  const resizeGroups = useCallback((currentNodes: Node<CardData>[]) => {
    const nextNodes = [...currentNodes]
    currentNodes.forEach((group) => {
      if (group.type !== 'group') return
      const children = currentNodes.filter((node) => node.parentId === group.id && node.type === 'card')
      if (children.length === 0) return

      const minX = Math.min(...children.map((node) => node.position.x))
      const minY = Math.min(...children.map((node) => node.position.y))
      const maxX = Math.max(...children.map((node) => node.position.x + CARD_WIDTH))
      const maxY = Math.max(...children.map((node) => node.position.y + CARD_HEIGHT))
      const offsetX = minX - GROUP_LEFT_PADDING
      const offsetY = minY - GROUP_TOP_PADDING
      const groupIndex = nextNodes.findIndex((node) => node.id === group.id)

      nextNodes[groupIndex] = {
        ...group,
        position: {
          x: group.position.x + offsetX,
          y: group.position.y + offsetY,
        },
        style: {
          ...group.style,
          width: maxX - offsetX + GROUP_RIGHT_PADDING,
          height: maxY - offsetY + GROUP_BOTTOM_PADDING,
        },
      }
      nextNodes.forEach((node, index) => {
        if (node.parentId === group.id) {
          nextNodes[index] = {
            ...node,
            position: {
              x: node.position.x - offsetX,
              y: node.position.y - offsetY,
            },
          }
        }
      })
    })
    return nextNodes
  }, [])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    setNodes((current) => resizeGroups(applyNodeChanges(changes, current)))
  }, [onNodesChange, resizeGroups, setNodes])

  useEffect(() => {
    localStorage.setItem('lousa-nodes', JSON.stringify({ projectName, cards: exportData(nodes) }))
  }, [nodes, projectName])

  useEffect(() => {
    const onDelete = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      setNodes((current) => current.filter((node) => node.id !== id))
    }
    const onChanged = () => setNodes((current) => [...current])
    const onStatusChange = (event: Event) => {
      const { id, status } = (event as CustomEvent<{ id: string; status: CardStatus }>).detail
      setNodes((current) => current.map((node) => (
        node.id === id ? { ...node, data: { ...node.data, status } } : node
      )))
    }
    const onTextChange = (event: Event) => {
      const { id, text } = (event as CustomEvent<{ id: string; text: string }>).detail
      setNodes((current) => current.map((node) => (
        node.id === id ? { ...node, data: { ...node.data, text } } : node
      )))
    }
    const onGroupTitleChange = (event: Event) => {
      const { id, title } = (event as CustomEvent<{ id: string; title: string }>).detail
      setNodes((current) => current.map((node) => (
        node.id === id ? { ...node, data: { ...node.data, title } } : node
      )))
    }
    window.addEventListener('delete-card', onDelete)
    window.addEventListener('cards-changed', onChanged)
    window.addEventListener('change-card-status', onStatusChange)
    window.addEventListener('change-card-text', onTextChange)
    window.addEventListener('change-group-title', onGroupTitleChange)
    return () => {
      window.removeEventListener('delete-card', onDelete)
      window.removeEventListener('cards-changed', onChanged)
      window.removeEventListener('change-card-status', onStatusChange)
      window.removeEventListener('change-card-text', onTextChange)
      window.removeEventListener('change-group-title', onGroupTitleChange)
    }
  }, [setNodes])

  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true, style: { stroke: '#a8adb8' } }, current)), [setEdges])

  const addCard = useCallback(() => {
    const id = `card-${Date.now()}`
    const newNode: Node<CardData> = {
      id,
      type: 'card',
      position: { x: 380 + (nodes.length % 3) * 90, y: 180 + (nodes.length % 4) * 80 },
      data: { title: 'Novo cartão', text: 'Escreva uma ideia...', status: 'invited' },
    }
    setNodes((current) => [...current, newNode])
  }, [nodes.length, setNodes])

  const groupSelectedCards = useCallback(() => {
    const selectedCards = nodes.filter((node) => node.type === 'card' && node.selected)
    if (selectedCards.length < 2) return

    const cardWidth = CARD_WIDTH
    const cardHeight = CARD_HEIGHT
    const minX = Math.min(...selectedCards.map((node) => node.position.x))
    const minY = Math.min(...selectedCards.map((node) => node.position.y))
    const maxX = Math.max(...selectedCards.map((node) => node.position.x + cardWidth))
    const maxY = Math.max(...selectedCards.map((node) => node.position.y + cardHeight))
    const groupId = `group-${Date.now()}`
    const groupNode: Node<GroupData> = {
      id: groupId,
      type: 'group',
      position: { x: minX - GROUP_LEFT_PADDING, y: minY - GROUP_TOP_PADDING },
      style: {
        width: maxX - minX + GROUP_LEFT_PADDING + GROUP_RIGHT_PADDING,
        height: maxY - minY + GROUP_TOP_PADDING + GROUP_BOTTOM_PADDING,
      },
      data: { title: 'Novo grupo', text: '', status: 'invited' },
      draggable: true,
    }
    const groupedNodes = nodes.map((node) => {
      if (!selectedCards.some((selected) => selected.id === node.id)) return node
      return {
        ...node,
        parentId: groupId,
        position: { x: node.position.x - groupNode.position.x, y: node.position.y - groupNode.position.y },
        selected: false,
        extent: 'parent' as const,
      }
    })
    setNodes([groupNode as Node<CardData>, ...groupedNodes])
  }, [nodes, setNodes])

  const ungroupSelectedGroups = useCallback(() => {
    const selectedGroups = nodes.filter((node) => node.type === 'group' && node.selected)
    if (selectedGroups.length === 0) return

    const selectedGroupIds = new Set(selectedGroups.map((group) => group.id))
    const ungroupedNodes = nodes
      .filter((node) => !selectedGroupIds.has(node.id))
      .map((node) => {
        if (!node.parentId || !selectedGroupIds.has(node.parentId)) return node

        const parent = selectedGroups.find((group) => group.id === node.parentId)
        if (!parent) return node

        const { parentId: _parentId, extent: _extent, ...card } = node
        return {
          ...card,
          position: {
            x: parent.position.x + node.position.x,
            y: parent.position.y + node.position.y,
          },
          selected: false,
        }
      })

    setNodes(ungroupedNodes)
  }, [nodes, setNodes])

  const visibleNodes = search.trim()
    ? nodes.map((node) => ({ ...node, hidden: !`${node.data.title} ${node.data.text} ${node.data.tag ?? ''}`.toLowerCase().includes(search.toLowerCase()) }))
    : nodes
  const statusCounts = nodes.filter((node) => node.type === 'card').reduce(
    (counts, node) => {
      counts[node.data.status] += 1
      return counts
    },
    { confirmed: 0, invited: 0, 'not-invited': 0, paid: 0 } as Record<CardStatus, number>,
  )
  const handleExportJson = () => downloadFile(JSON.stringify({ projectName, cards: exportData(nodes) }, null, 2), 'lousa-cards.json', 'application/json')
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const importedData = parseImportedData(await file.text(), file.name)
      setNodes(importedData.nodes)
      setEdges([])
      if (importedData.projectName) setProjectName(importedData.projectName)
      setImportError('')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível importar o arquivo.')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <input className="project-name-input" value={projectName} aria-label="Nome do projeto" onChange={(event) => setProjectName(event.target.value)} />
        <div className="board-counts" aria-label="Resumo dos convidados">
          <span className="count-equation">
            <span className="count-item" title="Pagos"><i className="count-light count-paid" />{statusCounts.paid}</span>
            <span className="equation-symbol">+</span>
            <span className="count-item" title="Confirmados"><i className="count-light count-green" />{statusCounts.confirmed}</span>
            <span className="equation-symbol">=</span>
            <strong className="green-subtotal" title="Subtotal de cards verdes">{statusCounts.paid + statusCounts.confirmed}</strong>
            <span className="equation-symbol">+</span>
            <span className="count-item" title="Convidados"><i className="count-light count-orange" />{statusCounts.invited}</span>
            <span className="equation-symbol">+</span>
            <span className="count-item" title="Não convidados"><i className="count-light count-gray" />{statusCounts['not-invited']}</span>
            <span className="equation-symbol">=</span>
            <span className="count-result" title="Total de cards">
              <strong>{nodes.length}</strong>
            </span>
          </span>
        </div>
        <div className="header-actions">
          <input ref={importInputRef} className="file-input" type="file" accept=".json,application/json" onChange={handleImport} />
          <button className="export-button" onClick={() => importInputRef.current?.click()}><Upload size={13} /> Importar</button>
          <button className="export-button" onClick={handleExportJson}><Download size={13} /> Exportar</button>
          <button className="export-button group-button" onClick={groupSelectedCards} disabled={nodes.filter((node) => node.type === 'card' && node.selected).length < 2}><Group size={13} /> Agrupar</button>
          <button className="export-button group-button" onClick={ungroupSelectedGroups} disabled={!nodes.some((node) => node.type === 'group' && node.selected)}><Ungroup size={13} /> Desagrupar</button>
          <button className="header-add-button" onClick={addCard}><Plus size={15} /> Adicionar cartão</button>
        </div>
      </header>
      {importError && <div className="import-error" role="alert">{importError}</div>}
      <section className="workspace">
        <div className="canvas-wrap">
          <div className="canvas-toolbar">
            <div className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar na lousa" /></div>
          </div>
          <ReactFlow nodes={visibleNodes} edges={edges} onNodesChange={handleNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={allNodeTypes} snapToGrid snapGrid={[24, 24]} selectionOnDrag selectionMode={SelectionMode.Partial} selectionKeyCode="Shift" multiSelectionKeyCode={['Control', 'Meta']} fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.25} maxZoom={1.5}>
            <Background variant={BackgroundVariant.Lines} color="#e7e9ed" gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  return <ReactFlowProvider><Board /></ReactFlowProvider>
}

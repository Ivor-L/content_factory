import { ReactCanvasRoot } from './components/ReactCanvasRoot'
import { listCanvasProjects } from '@/lib/canvasProjects'
import { getServerRequestUserContext } from '@/lib/serverRequestContext'
import type { CanvasProjectRecord } from './types'

type SearchParamValue = string | string[] | undefined

type CanvasPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>
}

function pickFirstQueryValue(value: SearchParamValue): string {
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  if (typeof value === 'string') return value.trim()
  return ''
}

export default async function CanvasPage({ searchParams }: CanvasPageProps) {
  const params = await searchParams

  const view = pickFirstQueryValue(params.view).toLowerCase()
  const forceProjectList = view === 'projects' || view === 'list'
  const projectId = pickFirstQueryValue(params.projectId)
  const prompt = pickFirstQueryValue(params.prompt)
  const effectiveProjectId = forceProjectList ? '' : projectId
  const effectivePrompt = forceProjectList ? '' : prompt

  const { userId } = await getServerRequestUserContext()
  let initialProjects: CanvasProjectRecord[] = []
  if (userId) {
    try {
      const projects = await listCanvasProjects(userId, 200)
      initialProjects = projects.map((project) => ({
        id: project.id,
        name: project.name,
        thumbnail: project.thumbnail,
        canvasData: project.canvasData,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }))
    } catch (error) {
      console.error('[canvas] Failed to preload canvas projects', error)
    }
  }

  return (
    <ReactCanvasRoot
      initialProjectId={effectiveProjectId || undefined}
      initialPrompt={effectivePrompt || undefined}
      forceProjectList={forceProjectList}
      initialProjects={initialProjects}
    />
  )
}

import { ReactCanvasRoot } from './components/ReactCanvasRoot'

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
  const media = pickFirstQueryValue(params.media)
  const effectiveProjectId = forceProjectList ? '' : projectId
  const effectivePrompt = forceProjectList ? '' : prompt
  const effectiveMedia = forceProjectList ? '' : media

  return (
    <ReactCanvasRoot
      initialProjectId={effectiveProjectId || undefined}
      initialPrompt={effectivePrompt || undefined}
      initialMedia={effectiveMedia || undefined}
      forceProjectList={forceProjectList}
      initialProjects={[]}
    />
  )
}

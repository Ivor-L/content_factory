import { headers } from 'next/headers'
import { getTenantConfig, VALID_TENANT_SLUGS } from '@/lib/tenants/config'
import { CanvasAuthBridge } from './components/CanvasAuthBridge'

const NEXTIDE_CANVAS_LOGO = '/logo/黑底白色鲸鱼logo_SVG.svg'

type SearchParamValue = string | string[] | undefined

type CanvasPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>
}

function pickFirstQueryValue(value: SearchParamValue): string {
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  if (typeof value === 'string') return value.trim()
  return ''
}

function resolveTenantSlugFromHeaders(raw: string | null): string {
  const fallback = 'nextide'
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return fallback
  return VALID_TENANT_SLUGS.includes(normalized) ? normalized : fallback
}

function buildCanvasRuntimeUrl({
  projectId,
  prompt,
  returnTo,
  view,
  brandName,
  tenantLogo,
  browserLogo,
}: {
  projectId: string
  prompt: string
  returnTo: string
  view?: string
  brandName?: string
  tenantLogo?: string
  browserLogo?: string
}): string {
  const runtimePath = projectId
    ? `/canvas-runtime/canvas/${encodeURIComponent(projectId)}`
    : '/canvas-runtime'

  const url = new URL(runtimePath, 'https://canvas-runtime.local')

  if (prompt) url.searchParams.set('prompt', prompt)
  if (returnTo) url.searchParams.set('returnTo', returnTo)
  if (view) url.searchParams.set('view', view)
  if (brandName) url.searchParams.set('brandName', brandName)
  if (tenantLogo) url.searchParams.set('tenantLogo', tenantLogo)
  if (browserLogo) url.searchParams.set('browserLogo', browserLogo)

  return `${url.pathname}${url.search}${url.hash}`
}

export default async function CanvasPage({ searchParams }: CanvasPageProps) {
  const params = await searchParams
  const requestHeaders = await headers()

  const view = pickFirstQueryValue(params.view).toLowerCase()
  const forceProjectList = view === 'projects' || view === 'list'
  const projectId = pickFirstQueryValue(params.projectId)
  const prompt = pickFirstQueryValue(params.prompt)
  const effectiveProjectId = forceProjectList ? '' : projectId
  const effectivePrompt = forceProjectList ? '' : prompt
  const returnToFromQuery = pickFirstQueryValue(params.returnTo)

  const tenantSlug = resolveTenantSlugFromHeaders(requestHeaders.get('x-tenant-slug'))
  const tenant = getTenantConfig(tenantSlug)
  const tenantBasePath = tenantSlug === 'nextide' ? '' : `/${tenantSlug}`
  const defaultReturnTo = `${tenantBasePath}/dashboard`
  const canvasTenantLogo = tenantSlug === 'nextide'
    ? NEXTIDE_CANVAS_LOGO
    : (tenant.logo || tenant.browserLogo)
  const canvasBrowserLogo = tenantSlug === 'nextide'
    ? NEXTIDE_CANVAS_LOGO
    : (tenant.browserLogo || tenant.logo)

  const targetUrl = buildCanvasRuntimeUrl({
    projectId: effectiveProjectId,
    prompt: effectivePrompt,
    returnTo: returnToFromQuery || defaultReturnTo,
    view: forceProjectList ? 'projects' : '',
    brandName: tenant.name,
    tenantLogo: canvasTenantLogo,
    browserLogo: canvasBrowserLogo,
  })

  return <CanvasAuthBridge targetUrl={targetUrl} />
}

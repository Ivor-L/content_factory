import { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import {
  Download,
  ChevronRight,
  User,
  FileText,
  Layers,
  Trash2,
  StopCircle,
  AlertCircle,
  Heart,
  Star,
  MessageSquare,
  CloudUpload,
  Users,
  UserPlus,
  ChevronDown
} from 'lucide-react'

type CollectorConfig = {
  apiBaseUrl: string
  apiKey: string
}

const DEFAULT_API_BASE = 'https://atomx.top'
const LOCAL_COLLECTOR_CONFIG_KEY = 'nextide_collector_config'

const readLocalCollectorConfig = (): CollectorConfig | null => {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(LOCAL_COLLECTOR_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        apiBaseUrl: (parsed.apiBaseUrl || DEFAULT_API_BASE).replace(/\/$/, ''),
        apiKey: parsed.apiKey || ''
      }
    }
  } catch (err) {
    console.warn('[Muse] Failed to read local collector config', err)
  }
  return null
}

const writeLocalCollectorConfig = (config: CollectorConfig) => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOCAL_COLLECTOR_CONFIG_KEY, JSON.stringify(config))
  } catch (err) {
    console.warn('[Muse] Failed to persist local collector config', err)
  }
}

const loadCollectorConfig = (): Promise<CollectorConfig> =>
  new Promise((resolve) => {
    const fallbackFromLocal = () => {
      const cached = readLocalCollectorConfig()
      if (cached) {
        resolve(cached)
        return true
      }
      resolve({ apiBaseUrl: DEFAULT_API_BASE, apiKey: '' })
      return false
    }

    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      fallbackFromLocal()
      return
    }

    chrome.storage.sync.get(['apiBaseUrl', 'apiKey'], (data) => {
      const normalized = {
        apiBaseUrl: (data.apiBaseUrl || DEFAULT_API_BASE).replace(/\/$/, ''),
        apiKey: data.apiKey || ''
      }
      writeLocalCollectorConfig(normalized)
      resolve(normalized)
    })
  })

const getTenantName = (baseUrl: string): string => {
  const lower = (baseUrl || '').toLowerCase()
  if (lower.includes('jubaopen')) return '聚保盆'
  if (lower.includes('nextide') || lower.includes('atomx') || lower.includes('cpolar')) return 'NexTide'
  return '平台'
}

const openApiConfigPage = () => {
  try {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage()
      return
    }
  } catch (err) {
    console.warn('[Muse] Failed to open options page', err)
  }

  try {
    const url = chrome.runtime?.getURL ? chrome.runtime.getURL('options.html') : null
    if (url) {
      window.open(url, '_blank')
    }
  } catch (err) {
    console.warn('[Muse] Unable to open options page fallback', err)
  }
}

// ==========================================
// Login State Detection
// ==========================================
const checkLoginState = (): boolean => {
  try {
    // Method 1: Check window.__INITIAL_STATE__ (most reliable)
    const initialState = (window as any).__INITIAL_STATE__
    if (initialState?.user?.userInfo?.nickname) {
      return true
    }

    // Method 2: Check for web_session cookie
    const hasWebSession = document.cookie.split(';').some((cookie) => {
      return cookie.trim().startsWith('web_session=')
    })
    if (hasWebSession) {
      return true
    }

    // Method 3: Check for login button in DOM (fallback)
    const loginButton = Array.from(document.querySelectorAll('button, a, div')).find(
      (el) => el.textContent?.trim() === '登录' && (el as HTMLElement).offsetParent !== null
    )
    return !loginButton
  } catch (e) {
    console.error('[Muse] Login state check error:', e)
    return false
  }
}

// Login Warning Overlay Component
const LoginWarningOverlay = ({ onDismiss }: { onDismiss: () => void }) => {
  const handleLoginClick = () => {
    onDismiss()
    window.location.href = 'https://www.xiaohongshu.com/login'
  }

  const handleLaterClick = () => {
    onDismiss()
  }

  return (
    <div className="fixed inset-0 z-[2147483648] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">需要登录小红书</h2>

          {/* Description */}
          <p className="text-gray-600 mb-6 leading-relaxed">
            检测到您尚未登录小红书账号。
            <br />
            为了正常使用 RedNote Muse 同步功能，
            <br />
            请先登录您的小红书账号。
          </p>

          {/* Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={handleLoginClick}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-red-200"
            >
              去登录
            </button>
            <button
              onClick={handleLaterClick}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all"
            >
              稍后再说
            </button>
          </div>

          {/* Footer Note */}
          <p className="text-xs text-gray-400 mt-4">💡 登录后即可使用所有同步功能</p>
        </div>
      </div>
    </div>
  )
}

// Risk Disclaimer Modal (Soft Version)
const RiskDisclaimerModal = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [hasReadBottom, setHasReadBottom] = useState(false)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const [countdown, setCountdown] = useState(10) // 10 seconds countdown

  const handleScroll = () => {
    const el = contentRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    // Check if bottom (tolerance 10px)
    const isBottom = scrollHeight - scrollTop - clientHeight < 10

    if (isBottom) {
      setHasReadBottom(true)
    }
    setShowScrollHint(!isBottom)
  }

  // Initial check
  useEffect(() => {
    const el = contentRef.current
    if (el) {
      // If content doesn't overflow, mark as read
      if (el.scrollHeight <= el.clientHeight + 1) {
        setHasReadBottom(true)
        setShowScrollHint(false)
      } else {
        setShowScrollHint(true)
      }
    }
  }, [])

  // Countdown Timer
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  // Robust Scroll Lock
  useEffect(() => {
    // 1. CSS Lock (Html + Body)
    const originalBodyOverflow = document.body.style.overflow
    const originalHtmlOverflow = document.documentElement.style.overflow

    document.body.style.setProperty('overflow', 'hidden', 'important')
    document.documentElement.style.setProperty('overflow', 'hidden', 'important')

    // 2. Native Event Lock (Intercept wheel events on the overlay)
    const preventScroll = (e: Event) => {
      // Allow scroll inside the modal content? 
      // Current modal is small, but if it overflows, we shouldn't block it.
      // But overlay covers everything aside from the modal content div?
      // Actually 'overlayRef' is on the wrapper div.
      // If we preventDefault on the wrapper, does it stop scroll inside inner div? Yes if propagation bubbles up.
      // We should check if the target is scrolling.
      // For now, given the requirement is "don't scroll underlying page", full lock is safer.
      e.preventDefault()
      e.stopPropagation()
    }

    // 3. Card Unlock (Allow internal scroll)
    const stopPropagation = (e: Event) => {
      e.stopPropagation()
    }

    const overlay = overlayRef.current
    const card = cardRef.current

    if (overlay) {
      overlay.addEventListener('wheel', preventScroll, { passive: false })
      overlay.addEventListener('touchmove', preventScroll, { passive: false })
    }

    if (card) {
      card.addEventListener('wheel', stopPropagation, { passive: false })
      card.addEventListener('touchmove', stopPropagation, { passive: false })
    }

    return () => {
      // Restore Styles
      document.body.style.overflow = originalBodyOverflow
      document.documentElement.style.overflow = originalHtmlOverflow

      // Remove Listeners
      if (overlay) {
        overlay.removeEventListener('wheel', preventScroll)
        overlay.removeEventListener('touchmove', preventScroll)
      }
      if (card) {
        card.removeEventListener('wheel', stopPropagation)
        card.removeEventListener('touchmove', stopPropagation)
      }
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[2147483649] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4"
    >
      <div
        ref={cardRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 pb-2 shrink-0 text-center">
          <h2 className="text-xl font-black text-gray-900">用户使用协议与免责声明</h2>
        </div>

        {/* Scrollable Content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 pt-2 min-h-0 custom-scrollbar relative"
        >
          <div className="bg-blue-50/50 rounded-xl p-5 border border-blue-100/50 text-left">
            <p className="text-xs text-gray-500 mb-4 leading-relaxed font-bold">
              欢迎使用薯小智助手！在使用本工具前，请您务必阅读并同意以下条款，点击同意即代表您已充分理解并接受本协议的全部内容。如您不同意本协议的任何条款，请立即停止使用本工具。
            </p>
            <ul className="space-y-4">
              <li className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                <span className="shrink-0 text-gray-900 font-black mt-0.5">1.</span>
                <span>
                  <strong className="text-gray-900 block mb-0.5">关于使用频率与风险的约定</strong>
                  请您<strong className="text-gray-800">合理控制同步操作的时间间隔和频率</strong>。请知悉：任何使用第三方辅助工具的行为（无论频率高低）均有可能<strong className="text-gray-800">触发平台的风控检测机制</strong>。因此导致的一切风险（如验证码、<strong className="text-gray-800">限流或封禁</strong>），均<strong className="text-gray-800">由用户自行承担责任</strong>，开发者不对此负责。
                </span>
              </li>
              <li className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                <span className="shrink-0 text-gray-900 font-black mt-0.5">2.</span>
                <span>
                  <strong className="text-gray-900 block mb-0.5">用户行为规范</strong>
                  本工具仅供个人学习参考与素材整理。本工具仅基于浏览器<strong className="text-gray-800">模拟人工操作流程</strong>辅助整理<strong className="text-gray-800">公开可见数据</strong>，不涉及任何破坏平台技术措施或非授权获取后台数据的行为。用户承诺不将本工具用于任何商业数据售卖、恶意营销或破坏平台生态的行为。因违规使用导致的一切法律责任由用户自行承担。
                </span>
              </li>
              <li className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                <span className="shrink-0 text-gray-900 font-black mt-0.5">3.</span>
                <span>
                  <strong className="text-gray-900 block mb-0.5">服务可用性与免责</strong>
                  本工具系<strong className="text-gray-800">第三方独立开发</strong>，<strong className="text-gray-800">与平台官方无关</strong>。其功能受限于多种不可控因素，开发者不对因使用本工具而产生的任何直接或间接后果（包括但不限于功能受限、数据丢失、账号状态异常或<strong className="text-gray-800">被封禁</strong>等）承担任何法律责任或赔偿义务。
                </span>
              </li>
            </ul>
          </div>

          {/* Scroll Hint Overlay */}
          {showScrollHint && (
            <div className="sticky bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none flex items-end justify-center pb-0 z-10 -mx-6 -mb-6">
              <span className="text-xs text-blue-600 font-bold animate-bounce bg-blue-50 px-3 py-1.5 rounded-full shadow-sm border border-blue-100 mb-2">
                👇 请向下滑动阅读全文
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        {/* Actions */}
        <div className="p-6 pt-0 shrink-0 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100 transition-colors"
          >
            不同意并退出
          </button>
          <button
            onClick={onConfirm}
            disabled={!hasReadBottom || countdown > 0}
            className={`px-8 py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${hasReadBottom && countdown === 0
              ? 'bg-gray-900 hover:bg-black text-white hover:shadow-xl hover:-translate-y-0.5'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
          >
            {countdown > 0
              ? `请细读协议 (${countdown}s)`
              : (hasReadBottom ? '我已阅读并同意' : '请阅读完协议')
            }
          </button>
        </div>
      </div>
    </div >
  )
}

const CATEGORY_OPTIONS = [
  '美妆护肤',
  '时尚穿搭',
  '美食',
  '旅行',
  '健身运动',
  '读书学习',
  '家居',
  '情感',
  '母婴育儿',
  '萌宠',
  '剧情',
  '测评',
  '科技数码',
  '游戏',
  '职场',
  '教育',
  '摄影',
  '户外运动'
]
import { v4 as uuidv4 } from 'uuid'
import {
  extractNoteFromDOM,
  extractFromState,
  extractBloggerProfile,
  extractFeedNotes,
  CollectedItem
} from './utils/extractor'
import { useStore } from './store'

// Determine initial tab based on current URL and obfuscated query params
const getInitialTab = (): 'single' | 'blogger' | 'profile' => {
  const url = new URL(window.location.href)
  const tabParam = url.searchParams.get('_m_t')

  if (tabParam) {
    if (tabParam.startsWith('a')) return 'single'
    if (tabParam.startsWith('b')) return 'blogger'
    if (tabParam.startsWith('c')) return 'profile'
    if (tabParam.startsWith('c')) return 'profile'
  }

  const urlStr = window.location.href
  if (urlStr.includes('/user/profile/')) {
    return 'blogger'
  }
  return 'single'
}

const formatCount = (num: number): string => {
  if (!num) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return num.toString()
}

const DebugPanel = ({ info }: { info: any }) => {
  if (!info) return null
  return (
    <div className="fixed left-4 top-20 w-[450px] max-h-[85vh] overflow-y-auto z-[2147483647] bg-black/95 text-green-400 p-5 rounded-2xl text-xs font-mono break-all shadow-2xl border border-green-500/30 backdrop-blur-xl animate-in slide-in-from-left-4 duration-300 pointer-events-auto">
      <div className="flex justify-between items-center mb-4 border-b border-green-500/30 pb-3 sticky top-0 bg-black/95 -mt-2 pt-2 z-10">
        <h3 className="font-bold text-sm text-green-500 flex items-center gap-2 tracking-wider">
          <span>🛡️</span> MUSE DEBUG CONSOLE
        </h3>
        <button
          onClick={(e) => {
            const parent = e.currentTarget.parentElement?.parentElement
            if (parent) parent.style.display = 'none'
          }}
          className="text-green-700 hover:text-green-500 transition-colors px-2 py-1 hover:bg-green-900/20 rounded"
        >
          ✕
        </button>
      </div>

      <div className="space-y-6">
        {Object.entries(info).map(([plan, data]: [string, any]) => (
          <div key={plan} className="border-b border-gray-800/80 pb-6 last:border-0 last:pb-0">
            <div className="font-bold text-white mb-3 bg-gradient-to-r from-green-900/40 to-transparent px-3 py-2 rounded-lg border-l-4 border-green-500 flex justify-between items-center">
              <span className="tracking-wide text-[13px]">{plan}</span>
              {data && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm ${data.type === 'video' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                  {data.type?.toUpperCase()}
                </span>
              )}
            </div>

            {data ? (
              <div className="pl-2 space-y-3">
                {/* Video Info */}
                <div className="grid grid-cols-[60px_1fr] gap-3 items-start group">
                  <span className="text-gray-500 font-bold uppercase text-[10px] pt-1 tracking-wider">Video</span>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold px-1.5 rounded ${data.videoUrl ? (data.videoUrl.startsWith('blob:') ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400') : 'bg-gray-800 text-gray-500'}`}>
                        {data.videoUrl ? (data.videoUrl.startsWith('blob:') ? '⚠️ BLOB URL' : '✅ HTTP URL') : 'MISSING'}
                      </span>
                    </div>
                    {data.videoUrl && !data.videoUrl.startsWith('blob:') && (
                      <div className="text-[10px] text-gray-400 bg-gray-900/80 p-2 rounded-lg border border-gray-800 select-all whitespace-pre-wrap break-words font-mono leading-relaxed transition-colors hover:border-gray-700 hover:text-gray-300">
                        {data.videoUrl}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cover Info */}
                <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                  <span className="text-gray-500 font-bold uppercase text-[10px] pt-1 tracking-wider">Cover</span>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className={`${data.coverUrl ? 'text-gray-300' : 'text-red-500'}`}>
                      {data.coverUrl ? '✅ Found' : 'MISSING'}
                    </span>
                    {data.coverUrl && (
                      <div className="text-[10px] text-gray-500 bg-gray-900/50 p-2 rounded-lg break-words select-all hover:text-gray-400 transition-colors">
                        {data.coverUrl}
                      </div>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                  <span className="text-gray-500 font-bold uppercase text-[10px] pt-1 tracking-wider">Title</span>
                  <span className="text-gray-200 leading-relaxed bg-gray-900/30 p-1.5 rounded">{data.title}</span>
                </div>

                {/* ID */}
                <div className="grid grid-cols-[60px_1fr] gap-3 items-start">
                  <span className="text-gray-500 font-bold uppercase text-[10px] pt-1 tracking-wider">ID</span>
                  <span className="text-gray-400 font-mono select-all bg-gray-900/30 p-1.5 rounded">{data.noteId}</span>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 italic py-4 text-center bg-gray-900/20 rounded-lg border border-dashed border-gray-800 flex flex-col items-center gap-1">
                <span className="text-lg opacity-50">🚫</span>
                <span>Extraction Failed</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-800 text-[9px] text-gray-600 flex justify-between font-mono tracking-tight uppercase">
        <span className="truncate max-w-[200px]" title={window.location.pathname}>{window.location.pathname}</span>
        <span>{new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  )
}

// ==========================================
// Publisher Logic (For creator.xiaohongshu.com)
// ==========================================
const PublisherApp = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [isAutoMode, setIsAutoMode] = useState(false)

  // Agreement State
  const [hasAcceptedRules, setHasAcceptedRules] = useState(() => localStorage.getItem('rednote_muse_rules_accepted') === 'true')
  const [showRulesModal, setShowRulesModal] = useState(false)

  const handleRulesConfirm = () => {
    localStorage.setItem('rednote_muse_rules_accepted', 'true')
    setHasAcceptedRules(true)
    setShowRulesModal(false)
  }
  const handleRulesCancel = () => {
    localStorage.setItem('rednote_muse_rules_accepted', 'false')
    setShowRulesModal(false)
  }

  const fetchImage = async (url: string): Promise<File> => {
    const response = await fetch(url)
    const blob = await response.blob()
    const filename = 'image.jpg'
    return new File([blob], filename, { type: blob.type })
  }

  const handleAutoFill = async () => {
    // Check Agreement
    if (!hasAcceptedRules) {
      setShowRulesModal(true)
      return
    }

    try {
      setStatus('loading')
      setMsg('正在获取笔记数据...')

      // 1. Fetch data from Electron App
      const urlParams = new URLSearchParams(window.location.search)
      const port = urlParams.get('p') || '3333'
      const res = await fetch(`http://localhost:${port}/api/current-note`)
      if (!res.ok) throw new Error('无法连接 RedNote Muse，请先在软件中点击发布')
      const data = await res.json()
      console.log('[Muse] Received data:', data)

      setMsg('正在等待页面元素加载...')

      // Helper to wait for element (increased timeout for auto mode)
      const waitFor = async <T extends Element>(
        checkFn: () => T | null,
        timeout = 30000
      ): Promise<T | null> => {
        const start = Date.now()
        while (Date.now() - start < timeout) {
          const res = checkFn()
          if (res) return res
          await new Promise((r) => setTimeout(r, 200))
        }
        return null
      }

      // 1. Upload Images (First, to trigger UI render)
      setMsg('正在上传图片...')
      if (data.images && data.images.length > 0) {
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        if (fileInput) {
          const dataTransfer = new DataTransfer()

          for (const imgUrl of data.images) {
            try {
              const file = await fetchImage(imgUrl)
              dataTransfer.items.add(file)
            } catch (e) {
              console.error('Failed to load image', imgUrl, e)
            }
          }

          fileInput.files = dataTransfer.files
          fileInput.dispatchEvent(new Event('change', { bubbles: true }))

          // Wait a bit for UI to update after upload
          await new Promise((r) => setTimeout(r, 1000))
        } else {
          console.warn('[Muse] File input not found')
        }
      }

      setMsg('正在等待输入框出现...')

      // 2. Fill Title
      // Wait for title input to appear (up to 10s)
      const titleInput = await waitFor(
        () =>
          (document.querySelector('input.d-text') as HTMLElement) ||
          (document.querySelector('textarea.d-text') as HTMLElement) ||
          (document.querySelector('[placeholder*="标题"]') as HTMLElement)
      )

      if (titleInput) {
        setMsg('正在填入标题...')
        console.log('[Muse] Found title input:', titleInput.tagName, titleInput.className)
        titleInput.focus()
        await new Promise((r) => setTimeout(r, 100))

        // Handle both Input and Textarea
        const tagName = titleInput.tagName.toLowerCase()
        const proto =
          tagName === 'textarea'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(titleInput, data.title)
        } else {
          ; (titleInput as any).value = data.title
        }

        titleInput.dispatchEvent(new Event('input', { bubbles: true }))
        titleInput.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        console.warn('[Muse] Title input not found after timeout')
        setMsg('警告: 找不到标题输入框')
      }

      // 3. Fill Content (Editor)
      const editor = await waitFor(
        () =>
          (document.querySelector('.tiptap.ProseMirror') as HTMLElement) ||
          (document.querySelector('.ql-editor') as HTMLElement)
      )

      if (editor) {
        setMsg('正在填入正文...')
        console.log('[Muse] Found editor:', editor.className)
        editor.focus()
        await new Promise((r) => setTimeout(r, 100))

        // Append tags to content if available
        let finalContent = data.content
        if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
          const tagString = data.tags
            .map((t: string) => (t.startsWith('#') ? t : `#${t}`))
            .join(' ')
          finalContent = `${finalContent}\n\n${tagString}`
        }

        // Use execCommand to ensure editor state updates correctly
        document.execCommand('selectAll', false, undefined)
        document.execCommand('insertText', false, finalContent)
      } else {
        console.warn('[Muse] Editor not found')
      }

      setStatus('success')
      setMsg('填充完成！请检查后发布')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e) {
      console.error(e)
      setStatus('error')
      setMsg('错误: ' + (e as Error).message)
    }
  }

  // Auto-trigger when m1_t=1 is detected
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('m1_t') === '1') {

      // Check Agreement FIRST
      if (localStorage.getItem('rednote_muse_rules_accepted') !== 'true') {
        setShowRulesModal(true)
        return
      }

      setIsAutoMode(true)
      setMsg('检测到自动发布指令，正在准备...')
      // Wait a bit for page to fully load before auto-filling
      const timer = setTimeout(() => {
        handleAutoFill()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  return (
    <div className="fixed bottom-10 right-10 z-[99999]">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-64">
        <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
          <div className="w-6 h-6 flex items-center justify-center">
            <img src={chrome.runtime.getURL('images/logo.png')} className="w-full h-full object-contain" alt="Logo" />
          </div>
          <span className="font-bold text-gray-800 text-sm">薯小智助手</span>
        </div>

        <div className="text-xs text-gray-500 mb-3 leading-relaxed">
          {isAutoMode ? (
            <>
              🤖 自动发布模式已激活
              <br />
              正在智能填入内容...
            </>
          ) : (
            <>
              检测到发布页面。
              <br />
              点击下方按钮自动填入 Muse 中的笔记。
            </>
          )}
        </div>

        {status === 'loading' && (
          <div className="text-xs text-amber-500 mb-2 animate-pulse">⏳ {msg}</div>
        )}
        {status === 'error' && <div className="text-xs text-red-500 mb-2">❌ {msg}</div>}
        {status === 'success' && <div className="text-xs text-green-500 mb-2">✅ {msg}</div>}

        {!isAutoMode && (
          <button
            onClick={handleAutoFill}
            disabled={status === 'loading'}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-red-200"
          >
            <CloudUpload size={16} />
            一键填入
          </button>
        )}

        {/* Modal */}
        {showRulesModal && (
          <RiskDisclaimerModal
            onConfirm={handleRulesConfirm}
            onCancel={handleRulesCancel}
          />
        )}
      </div>
    </div>
  )
}

// Helper to validate note content
const isValidNote = (data: Partial<CollectedItem['data']> | null): boolean => {
  if (!data) return false
  if (!data.noteId) return false

  // 1. Must have a cover image
  if (!data.coverUrl || data.coverUrl.trim() === '') {
    return false
  }

  // 2. Must have some text content (Title or Description)
  const hasTitle = data.title && data.title !== '无标题' && data.title.trim() !== ''
  const hasDesc = data.desc && data.desc.trim() !== ''

  if (!hasTitle && !hasDesc) {
    return false
  }

  return true
}

const App = () => {
  // Rules Agreement State
  const [hasAcceptedRules, setHasAcceptedRules] = useState(() => localStorage.getItem('rednote_muse_rules_accepted') === 'true')

  // Modal Visibility: 
  // Always false on init. User must manually trigger it.
  const [showRulesModal, setShowRulesModal] = useState(false)

  // Sidebar Visibility: Default Open
  const [isOpen, setIsOpen] = useState(true)

  const handleRulesConfirm = () => {
    localStorage.setItem('rednote_muse_rules_accepted', 'true')
    setHasAcceptedRules(true)
    setShowRulesModal(false)
  }

  const handleRulesCancel = () => {
    // User disagreed: Persist 'false', close modal, show empty state
    localStorage.setItem('rednote_muse_rules_accepted', 'false')
    setShowRulesModal(false)
  }

  // Secret Debug Mode
  const [showDebug, setShowDebug] = useState(false)
  const debugClickCountRef = useRef(0)
  const debugClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSecretDebugToggle = () => {
    debugClickCountRef.current += 1

    if (debugClickTimerRef.current) {
      clearTimeout(debugClickTimerRef.current)
    }

    if (debugClickCountRef.current >= 5) {
      setShowDebug(prev => !prev)
      debugClickCountRef.current = 0
      // No visual feedback per requirement
    } else {
      // Reset count if gap between clicks > 1s
      debugClickTimerRef.current = setTimeout(() => {
        debugClickCountRef.current = 0
      }, 500)
    }
  }



  const [activeTab, setActiveTab] = useState<'single' | 'blogger' | 'profile'>(
    getInitialTab()
  )

  // Login State Management
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true)
  const [showLoginWarning, setShowLoginWarning] = useState<boolean>(false)
  const [isWarningDismissed, setIsWarningDismissed] = useState<boolean>(false)

  // Check login state on mount and periodically
  useEffect(() => {
    const checkLogin = () => {
      // 1. Skip if we are on the login page itself
      if (window.location.href.includes('/login')) {
        return
      }

      // 2. Already dismissed in this page load
      if (isWarningDismissed) {
        return
      }

      const loggedIn = checkLoginState()
      setIsLoggedIn(loggedIn)
      if (!loggedIn) {
        setShowLoginWarning(true)
      }
    }

    // Initial check
    checkLogin()

    // Recheck every 5 seconds to detect login changes
    const interval = setInterval(checkLogin, 5000)

    return () => clearInterval(interval)
  }, [isWarningDismissed])

  // Global Store
  const { queue, addItem, removeItem, clearQueue } = useStore()
  const [notification, setNotification] = useState<string | null>(null)
  const hasAutoCollectedRef = useRef(false)

  // Derived state for current view
  const currentItems = queue.filter((item) => {
    if (!item || !item.sourceType || !item.data) return false
    if (activeTab === 'single') return item.sourceType === 'note'
    if (activeTab === 'blogger') return item.sourceType === 'blogger_note'
    if (activeTab === 'profile') return item.sourceType === 'profile'
    if (activeTab === 'settings') return false
    return true
  })

  const [isCollecting, setIsCollecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const collectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use a ref to access queue in callbacks without closure issues
  const queueRef = useRef(queue)
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // Initial State Extraction (Plan A Listener)
  const [initialState, setInitialState] = useState<any>(null)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'REDNOTE_MUSE_INITIAL_STATE') {
        setInitialState(event.data.payload)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Sidebar Push Layout Logic
  useEffect(() => {
    const styleId = 'muse-global-layout-styles'
    let styleEl = document.getElementById(styleId)

    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    if (isOpen) {
      document.documentElement.classList.add('muse-sidebar-open')
      styleEl.innerHTML = `
                html.muse-sidebar-open body {
                    padding-right: 380px !important;
                    transition: padding-right 0.3s ease-in-out !important;
                    overflow-x: hidden !important;
                }
                /* Shift XHS fixed headers to the left to avoid overlap */
                html.muse-sidebar-open .header-container,
                html.muse-sidebar-open .探索-header,
                html.muse-sidebar-open .mask-paper,
                html.muse-sidebar-open [class*="header-"],
                html.muse-sidebar-open [class*="nav-container"] {
                    margin-right: 380px !important;
                    width: calc(100% - 380px) !important;
                    transition: margin-right 0.3s ease-in-out, width 0.3s ease-in-out !important;
                }
                /* Floating buttons on the right */
                html.muse-sidebar-open .back-top,
                html.muse-sidebar-open [class*="back-top"],
                html.muse-sidebar-open .side-bar-right {
                    right: 400px !important;
                    transition: right 0.3s ease-in-out !important;
                }
                /* Ensure left sidebar stays fixed to the left and isn't affected */
                html.muse-sidebar-open .side-bar {
                    left: 0 !important;
                    transform: none !important;
                    transition: left 0.3s ease-in-out !important;
                }
            `
    } else {
      document.documentElement.classList.remove('muse-sidebar-open')
      styleEl.innerHTML = ''
    }

    return () => {
      document.documentElement.classList.remove('muse-sidebar-open')
      styleEl?.remove()
    }
  }, [isOpen])

  // Form states
  const [category, setCategory] = useState('')

  const [benchmark, setBenchmark] = useState<number>(3)
  const [remark, setRemark] = useState('')
  const [hasApiKeyConfigured, setHasApiKeyConfigured] = useState(false)
  const hasApiKeyConfiguredRef = useRef(false)

  const showError = (msg: string) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
    }
    setError(msg)
    errorTimerRef.current = setTimeout(() => {
      setError(null)
      errorTimerRef.current = null
    }, 6000)
  }

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  useEffect(() => {
    hasApiKeyConfiguredRef.current = hasApiKeyConfigured
  }, [hasApiKeyConfigured])

  useEffect(() => {
    let mounted = true
    loadCollectorConfig().then((config) => {
      if (mounted) {
        setHasApiKeyConfigured(!!config.apiKey)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  const ensureApiKeyConfigured = useCallback(
    (message = '请先在插件设置中配置内容工厂 API Key') => {
      if (hasApiKeyConfiguredRef.current) return true
      showError(message)
      openApiConfigPage()
      return false
    },
    [showError]
  )

  const syncItems = async (items: CollectedItem[]) => {
    if (items.length === 0) return false

    const payloadItems = items.map((item) => ({
      ...item,
      platform: item.platform || 'xiaohongshu'
    }))

    const config = await loadCollectorConfig()
    const normalizedBase = (config.apiBaseUrl || DEFAULT_API_BASE).replace(/\/$/, '')
    const TARGET_URL = `${normalizedBase}/api/viral-references/import`
    const tenantName = getTenantName(normalizedBase)

    if (!config.apiKey) {
      showError(`请先在插件选项中配置 ${tenantName} API Key`)
      openApiConfigPage()
      setHasApiKeyConfigured(false)
      return false
    }

    setHasApiKeyConfigured(true)

    const baseHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-user-api-key': config.apiKey
    }

    console.log('[Muse] Starting sync for', items.length, 'items ->', TARGET_URL)

    const syncViaProxy = async (): Promise<boolean> => {
      console.log('[Muse] Attempting sync via Background Proxy...')
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'PROXY_REQ',
            payload: {
              url: TARGET_URL,
              options: {
                method: 'POST',
                headers: baseHeaders,
                body: JSON.stringify(payloadItems)
              }
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('[Muse] Proxy messaging error:', chrome.runtime.lastError)
              resolve(false)
              return
            }
            if (response && response.success) {
              console.log('[Muse] Proxy sync success:', response.response)
              if (response.response.ok) {
                resolve(true)
              } else {
                showError('同步失败(Proxy): ' + response.response.statusText)
                resolve(false)
              }
            } else {
              console.error('[Muse] Proxy sync failed:', response?.error)
              showError(`同步失败: 无法连接 ${tenantName} API`)
              resolve(false)
            }
          }
        )
      })
    }

    try {
      console.log('[Muse] Attempting direct sync...')
      const response = await fetch(TARGET_URL, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(payloadItems)
      }).catch(async (err) => {
        console.warn('[Muse] Direct sync failed, switching to Proxy Strategy. Error:', err)
        throw new Error('FALLBACK_TO_PROXY')
      })

      if (response && !response.ok) {
        const errorText = await response.text()
        showError('同步失败: ' + (errorText || response.statusText))
        if (response.status === 401) {
          setHasApiKeyConfigured(false)
        }
        return false
      }

      if (response && response.ok) {
        const result = await response.json()
        console.log('[Muse] Direct sync success:', result)
        return true
      }

      return false
    } catch (e) {
      const message = (e as Error).message
      if (message === 'FALLBACK_TO_PROXY' || message.includes('Failed to fetch')) {
        return await syncViaProxy()
      }

      console.error('[Muse] Sync fatal error', e)
      showError('同步请求错误: ' + message)
      return false
    }
  }

  const handleSync = async (): Promise<void> => {
    if (queue.length === 0) {
      showError('队列为空，无法同步')
      return
    }

    if (!ensureApiKeyConfigured()) {
      return
    }

    setIsSyncing(true)
    try {
      const success = await syncItems(queue as CollectedItem[])
      if (success) {
        clearQueue()
        showNotification('同步成功！')
      }
    } finally {
      setIsSyncing(false)
    }
  }

  const resetForm = () => {
    setCategory('')
    setBenchmark(3)
    setRemark('')
  }

  const stopCollection = useCallback(async (): Promise<void> => {
    if (collectionTimerRef.current) {
      clearTimeout(collectionTimerRef.current)
      collectionTimerRef.current = null
    }
    setIsCollecting(false)
    document.getElementById('muse-blocker')?.remove()
    document.getElementById('muse-overlay-blocker')?.remove()

    // Check if this was an auto-sync session
    const url = new URL(window.location.href)
    const isAuto = !!url.searchParams.get('_m_ac')

    if (activeTab === 'blogger') {
      resetForm()
      if (isAuto) {
        showNotification('同步完成，正在执行最后保存...')
        // Sync any remaining items in queue
        const currentQueue = useStore.getState().queue
        const bloggerItems = currentQueue.filter((i) => i.sourceType === 'blogger_note')
        if (bloggerItems.length > 0) {
          await syncItems(bloggerItems as CollectedItem[])
          clearQueue()
        }
        showNotification('同步完成，窗口即将关闭')
        setTimeout(() => window.close(), 2000)
      } else {
        showNotification('同步已停止，请检查素材并点击下方同步按钮进行保存。')
      }
    }
  }, [activeTab, clearQueue])

  const collectFeedBatch = useCallback(
    async (baseItem: any, sessionIds?: Set<string>): Promise<number> => {
      if (!hasApiKeyConfiguredRef.current) {
        showError('请先配置 API Key 后再使用批量同步')
        openApiConfigPage()
        return 0
      }

      // Check for forced ID from renderer
      const url = new URL(window.location.href)
      const forcedId = url.searchParams.get('_m_i')

      // Standardize on urlId (Hex ID) to match profile collection prioritizations
      const redIdFromDOM =
        document.querySelector('.user-redId')?.textContent?.replace('小红书号：', '').trim() ||
        document.querySelector('.redId')?.textContent?.trim() ||
        ''
      const urlId =
        window.location.pathname.replace(/\/$/, '').split('/').pop()?.split('?')[0] || ''
      const bloggerId = (forcedId || urlId || redIdFromDOM || '').trim()

      console.log('[Muse] Batch collection for bloggerId:', bloggerId)

      const notes = extractFeedNotes()
      if (notes.length === 0) return 0

      // Use queueRef to avoid stale closure and dependency issues
      const currentQueue = queueRef.current
      const existingIds = sessionIds || new Set(currentQueue.map((i) => i.data.noteId))
      const newItems: CollectedItem[] = []

      const now = Date.now()
      notes.forEach((note: any, index: number) => {
        // Ensure note has basic data before adding
        if (isValidNote(note) && !existingIds.has(note.noteId)) {
          newItems.push({
            ...baseItem,
            id: uuidv4(),
            sourceType: 'blogger_note',
            data: {
              ...note,
              bloggerId, // Link to blogger
              publishDate: now - index * 1000 // Ensure stable sort order from top to bottom
            } as CollectedItem['data'],
            userTags: {
              category,
              rank: benchmark.toString(),
              remark
            }
          })
          if (sessionIds) {
            sessionIds.add(note.noteId)
          }
        }
      })

      if (newItems.length > 0) {
        newItems.forEach((item) => addItem(item))

        // If this is an auto-sync session, sync immediately
        const isAuto = !!url.searchParams.get('_m_ac')
        if (isAuto) {
          const success = await syncItems(newItems)
          if (success) {
            // Remove the specific items we just synced
            newItems.forEach((item) => removeItem(item.id))
          }
        }
      }

      return newItems.length
    },
    [addItem, removeItem, category, benchmark, remark]
  )

  // HELPER & MASTER PATTERN: Broadcast Channel for Cross-Tab Communication
  useEffect(() => {
    const channel = new BroadcastChannel('muse_helper_channel')
    const urlParams = new URLSearchParams(window.location.search)
    const isHelper = urlParams.get('_m_helper') === 'true'

    // [WORKER ROLE] If this is a helper tab opened in background
    if (isHelper) {
      console.log('[Muse] Running in Background Helper Mode')
      // Execute extraction immediately
      const performHelperTask = async () => {
        try {
          // CRITICAL FIX: Content Script cannot access window.__INITIAL_STATE__ directly (Isolated World).
          // We must use extractNoteFromDOM() which parses the <script> tags from DOM.
          console.log('[Muse] Helper starting DOM extraction...')
          const data = await extractNoteFromDOM()

          if (data && data.videoUrl && !data.videoUrl.startsWith('blob:')) {
            console.log('[Muse] Helper extracted data, broadcasting...', data)
            channel.postMessage({ type: 'HELPER_SUCCESS', data })
            // Close self after short delay
            setTimeout(() => window.close(), 500)
          } else {
            console.warn('[Muse] Helper extraction incomplete:', data)
            // Retry once or close? Let's check if inject.js sends state
            // Fallback: If DOM failed, wait for inject.js message (Plan A)
            // But usually extracting from script tag is instantaneous.
            // If failed, close to avoid zombie tabs
            setTimeout(() => window.close(), 3000)
          }
        } catch (e) {
          console.error('[Muse] Helper failed', e)
          setTimeout(() => window.close(), 1000)
        }
      }

      // Delay slightly to ensure page hydrated
      setTimeout(performHelperTask, 1500)
    }

    // [MASTER ROLE] Listen for data from helper tabs
    channel.onmessage = async (event) => {
      if (event.data?.type === 'HELPER_SUCCESS' && event.data.data) {
        console.log('[Muse] Master received helper data:', event.data.data)
        const receivedData = event.data.data

        // Update Debug Panel with Plan F results
        setDebugInfo((prev: any) => ({
          ...prev,
          'Plan F (Helper)': receivedData
        }))

        // Construct Full Item
        const newItem: CollectedItem = {
          id: uuidv4(),
          sourceType: 'note',
          status: 'pending',
          data: receivedData,
          userTags: {
            category: '自动采集', // Default or get from current state if possible
            rank: '0',
            remark: '后台提取'
          }
        }

        // Add & Sync
        addItem(newItem)
        showNotification('数据同步成功！正在保存...')

        const success = await syncItems([newItem])
        if (success) {
          removeItem(newItem.id)
          showNotification('同步并保存成功！')
        } else {
          showError('素材同步成功，但保存到本地APP失败')
        }
      }
    }

    return () => channel.close()
  }, [addItem, syncItems, removeItem])

  const handleCollect = useCallback(async (): Promise<void> => {
    // Check login state before any collection action
    if (!isLoggedIn) {
      if (!isWarningDismissed) {
        setShowLoginWarning(true)
      }
      showError('请先登录小红书账号后再使用同步功能')
      return
    }

    if (isCollecting) {
      stopCollection()
      showError('已停止同步')
      return
    }

    const newItemBase = {
      id: uuidv4(),
      status: 'pending' as const,
      userTags: {
        category,
        rank: benchmark.toString(),
        remark
      }
    }

    if (activeTab === 'single') {
      if (window.location.href.includes('/user/profile/')) {
        showError('请先点击进入任意笔记详情页，再进行单篇同步')
        return
      }

      let data: Partial<CollectedItem['data']> | null = null
      console.log('[Muse] Current URL:', window.location.href)


      if (initialState) {
        // data = extractFromState(initialState)
        // console.log('[Muse] Plan A extracted data:', data)
        // console.log('[Muse] Plan A data.url:', data?.url)
      }

      // Debug Mode: Run Everything Independently
      // Debug Mode: Run Everything Independently
      let planA_result = null
      let planB_result = null


      // PLAN A: Global State
      if (initialState) {
        try {
          planA_result = extractFromState(initialState)
        } catch (e) {
          console.error('Plan A Error', e)
        }
      }

      // PLAN B: Pure DOM (Standard)
      try {
        planB_result = await extractNoteFromDOM()
      } catch (e) {
        console.error('Plan B/C Error', e)
      }

      setDebugInfo({
        'Plan A (Global)': planA_result,
        'Plan B/C (DOM)': planB_result
      })

      // Decision Logic: Prefer Plan A > Plan B/C
      data = planA_result || planB_result

      // FORCE RETRY IN NEW TAB STRATEGY
      // If we found a video note but failed to get the HTTP URL (e.g. valid Plan A/E failed, standard DOM failed)
      // and we are NOT already in a retry loop (check _m_ac), open a new tab.
      if (
        data &&
        data.type === 'video' &&
        (!data.videoUrl || data.videoUrl.startsWith('blob:')) &&
        !window.location.href.includes('_m_helper')
      ) {
        console.warn('[Muse] Video extraction failed in current context. Triggering deep extraction in new tab.')
        showNotification('正在尝试深度抓取视频源，请稍候...')

        const retryUrl = new URL(window.location.href)
        // 'a_retry' starts with 'a' so it triggers 'single' mode auto-collection
        retryUrl.searchParams.set('_m_helper', 'true')
        retryUrl.searchParams.set('_m_close', 'true')

        // Use background script to open tab without activating it (stay on current page)
        try {
          chrome.runtime.sendMessage({
            type: 'OPEN_BACKGROUND_TAB',
            url: retryUrl.toString()
          })
        } catch (e) {
          // Fallback if background script is not ready
          window.open(retryUrl.toString(), '_blank')
        }
        return
      }

      if (isValidNote(data)) {
        console.log('[Muse] Final data before creating item:', data)
        console.log('[Muse] Final data.url:', data.url)

        const newItem: CollectedItem = {
          ...newItemBase,
          id: uuidv4(),
          sourceType: 'note',
          data: data as CollectedItem['data'],
          userTags: {
            category,
            rank: benchmark.toString(),
            remark
          }
        }

        console.log('[Muse] Created item:', newItem)
        console.log('[Muse] Created item.data.url:', newItem.data.url)

        // Add to queue first (visible feedback)
        addItem(newItem)

        // Auto sync
        const success = await syncItems([newItem])
        if (success) {
          removeItem(newItem.id) // Remove from queue if synced locally
          showNotification('同步并保存成功！')
          resetForm() // Reset form for single note

          // Auto-Close Strategy for Background Extraction
          const urlParams = new URLSearchParams(window.location.search)
          if (urlParams.get('_m_close') === 'true') {
            setTimeout(() => {
              window.close()
            }, 800)
          }
        } else {
          // Keep in queue if sync fails
          showError('同步成功，但保存失败，请手动点击保存')
        }
      } else {
        showError('无法提取笔记信息，请确保在笔记详情页')
      }
    } else if (activeTab === 'profile') {
      if (!window.location.href.includes('/user/profile/')) {
        showError('请先进入博主主页再同步博主信息')
        return
      }
      const data = extractBloggerProfile()
      if (data) {
        // Apply forced ID if present
        const url = new URL(window.location.href)
        const forcedId = url.searchParams.get('_m_i')
        if (forcedId && data.author) {
          data.author.id = forcedId
        }

        const newItem: CollectedItem = {
          ...newItemBase,
          id: uuidv4(),
          sourceType: 'profile',
          data: data as CollectedItem['data']
        }
        addItem(newItem)
        // Auto sync
        const success = await syncItems([newItem])
        if (success) {
          removeItem(newItem.id)
          showNotification('博主信息同步并保存成功！')
        }
      } else {
        showError('无法提取博主信息，请确保在博主主页')
      }
    } else if (activeTab === 'blogger') {
      if (!window.location.href.includes('/user/profile/')) {
        showError('请先进入博主主页再进同步')
        return
      }

      // Automatically collect and sync profile first
      const profileData = extractBloggerProfile()
      if (profileData) {
        // Apply forced ID if present
        const url = new URL(window.location.href)
        const forcedId = url.searchParams.get('_m_i')
        if (forcedId && profileData.author) {
          profileData.author.id = forcedId
        }

        const profileItem: CollectedItem = {
          ...newItemBase,
          id: uuidv4(),
          sourceType: 'profile',
          data: profileData as CollectedItem['data']
        }
        await syncItems([profileItem])
      }

      setIsCollecting(true)

      // Interaction blocker
      const style = document.createElement('style')
      style.id = 'muse-blocker'
      style.innerHTML = `
                html, body { pointer-events: none !important; overflow: hidden !important; user-select: none !important; }
                #rednote-muse-root { pointer-events: auto !important; }
            `
      document.head.appendChild(style)

      const overlay = document.createElement('div')
      overlay.id = 'muse-overlay-blocker'
      overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483646; background: transparent; cursor: wait;`
      document.body.appendChild(overlay)

      let lastHeight = 0
      let noChangeCount = 0

      // Scroll to top first to ensure we capture everything
      window.scrollTo(0, 0)

      // Session tracking
      const sessionProcessedIds = new Set<string>()
      let sessionCollectedCount = 0
      const MAX_SESSION_LIMIT = 200

      // Brief delay to allow the page to settle after scrolling to top
      setTimeout(async () => {
        sessionCollectedCount += await collectFeedBatch(newItemBase, sessionProcessedIds)

        // Randomized Collection Loop to mimic human behavior
        const runCollectionLoop = async () => {
          // 1. Random Scroll (700px - 950px)
          const scrollAmount = 700 + Math.floor(Math.random() * 250)
          window.scrollBy(0, scrollAmount)

          // 2. Random Wait for Render (1000ms - 2000ms)
          const renderWait = 1000 + Math.floor(Math.random() * 1000)

          collectionTimerRef.current = setTimeout(async () => {
            const currentHeight = document.body.scrollHeight
            const currentScroll = window.scrollY + window.innerHeight

            // Capture
            const newlyAdded = await collectFeedBatch(newItemBase, sessionProcessedIds)
            sessionCollectedCount += newlyAdded
            console.log(`[Muse] Session Progress: ${sessionCollectedCount}/${MAX_SESSION_LIMIT}`)

            if (sessionCollectedCount >= MAX_SESSION_LIMIT) {
              stopCollection()
              showNotification(`已达到单次同步上限 (${MAX_SESSION_LIMIT}篇)，自动停止`)
              return
            }

            // Check if we've truly hit the bottom
            const isAtBottom = currentScroll >= currentHeight - 100

            if (isAtBottom && currentHeight === lastHeight) {
              noChangeCount++
              if (noChangeCount >= 3) {
                stopCollection()
                showNotification('同步完成：已到达页面底部')
                return
              }
            } else {
              noChangeCount = 0
              lastHeight = currentHeight
            }

            // 3. Random Interval to next action (2000ms - 4000ms)
            const nextStepWait = 2000 + Math.floor(Math.random() * 2000)
            collectionTimerRef.current = setTimeout(runCollectionLoop, nextStepWait)

          }, renderWait)
        }

        // Start the loop
        runCollectionLoop()
      }, 1000)
    }
  }, [
    isCollecting,
    isLoggedIn,
    isWarningDismissed,
    activeTab,
    category,
    benchmark,
    remark,
    initialState,

    addItem,
    removeItem,
    stopCollection,
    collectFeedBatch,
    syncItems,
    showError,
    setShowLoginWarning
  ])

  // Handle auto-collect once upon discovery of parameters
  const handleCollectRef = useRef(handleCollect)
  useEffect(() => {
    handleCollectRef.current = handleCollect
  }, [handleCollect])

  useEffect(() => {
    const url = new URL(window.location.href)
    const acParam = url.searchParams.get('_m_ac')

    if (
      acParam &&
      (acParam.startsWith('a') ||
        acParam.startsWith('b') ||
        acParam.startsWith('c') ||
        acParam.startsWith('d')) &&
      !hasAutoCollectedRef.current
    ) {
      // 必须先同意协议才能开始自动同步
      if (localStorage.getItem('rednote_muse_rules_accepted') !== 'true') {
        setShowRulesModal(true)
        return
      }

      console.log('[Muse] Auto-collect triggered via query param')
      hasAutoCollectedRef.current = true
      showNotification('检测到自动同步指令，即将开始同步...')

      const timer = setTimeout(() => {
        handleCollectRef.current()
        showNotification('正在同步中，请稍等...')
      }, 1500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [initialState])



  if (!isOpen) {
    return (
      <div
        className="fixed top-24 right-10 z-[2147483647] cursor-pointer group flex flex-col items-center gap-1.5"
        onClick={() => {
          setIsOpen(true)
        }}
      >
        <div className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center transition-transform transform group-hover:scale-110 active:scale-95 border-2 border-gray-100 p-2">
          <img src={chrome.runtime.getURL('images/logo.png')} className="w-full h-full object-contain" alt="M" />
        </div>
        <span className="bg-white/95 backdrop-blur px-2.5 py-1 rounded-full shadow-lg border border-gray-100 text-[10px] font-bold text-gray-700 whitespace-nowrap">
          薯小智助手
        </span>
      </div>
    )
  }

  return (
    <>
      {showDebug && <DebugPanel info={debugInfo} />}


      {/* Login Warning Overlay */}
      {showLoginWarning && !isLoggedIn && !isWarningDismissed && (
        <LoginWarningOverlay
          onDismiss={() => {
            setIsWarningDismissed(true)
            setShowLoginWarning(false)
          }}
        />
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[2147483650] bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300">
          {notification}
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-[2147483650] bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300">
          {error}
        </div>
      )}

      {/* Error / Status Toast - Existing implementation reused above but styled differently */}
      <div className="fixed top-0 right-0 h-full w-[380px] bg-[#F7F7F7] shadow-[-10px_0_30px_rgba(0,0,0,0.1)] z-[2147483645] flex flex-col font-sans overflow-hidden border-l border-white/10">
        {!hasAcceptedRules ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
              <img src={chrome.runtime.getURL('images/logo.png')} className="w-10 h-10 opacity-50 grayscale" alt="Logo" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">功能暂未开启</h3>
              <p className="text-sm text-gray-500 max-w-[240px] mx-auto leading-relaxed">
                您需要阅读并同意用户协议后，才能使用同步助手的所有功能。
              </p>
            </div>
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              查看用户协议
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 font-medium text-xs mt-4"
            >
              暂不使用
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white px-4 pt-4 pb-2 flex flex-col gap-4 shadow-sm relative z-10 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-2 select-none cursor-pointer"
                  onClick={handleSecretDebugToggle}
                >
                  <div className="w-6 h-6 flex items-center justify-center">
                    <img src={chrome.runtime.getURL('images/logo.png')} className="w-full h-full object-contain" alt="Logo" />
                  </div>
                  <span className="font-bold text-gray-800 text-sm tracking-tight">薯小智助手</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex justify-between border-b border-gray-100 -mx-4 px-4">
                {[
                  { id: 'single', label: '单篇笔记', icon: FileText },
                  { id: 'blogger', label: '博主笔记', icon: Layers },
                  { id: 'profile', label: '博主信息', icon: User }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any)
                    }}
                    className={`flex flex-col items-center gap-1.5 pb-2 text-[11px] font-bold transition-all relative flex-1 ${activeTab === tab.id ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <tab.icon size={18} />
                    <span>{tab.label}</span>
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-red-500 rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Area */}
            <div className="p-4 flex flex-col gap-4 bg-[#F7F7F7] flex-shrink-0">
              <div className="space-y-3">
                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-500 text-[11px] p-3 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 transition-all shadow-sm text-gray-700"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="" disabled>
                      选择分类标签
                    </option>
                    <option value="">(无)</option>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>

                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl py-2 px-3 shadow-sm">
                  <span className="text-xs text-gray-500">对标评分</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setBenchmark(star)}
                        className="focus:outline-none transform transition-transform active:scale-90"
                      >
                        <Star
                          size={16}
                          className={
                            star <= benchmark ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  placeholder="备注信息..."
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 transition-all shadow-sm min-h-[60px] resize-none"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                />
                <button
                  onClick={handleCollect}
                  className={`w-full font-bold py-3.5 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0 ${isCollecting ? 'bg-amber-100 text-amber-600' : 'bg-red-500 text-white'}`}
                >
                  {isCollecting ? (
                    <>
                      <StopCircle size={18} className="animate-pulse" />
                      <span>采集中，请稍等... (点击停止)</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>{activeTab === 'blogger' ? '开始同步' : '开始同步'}</span>
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Task Queue Container */}
            <div className="flex-1 flex flex-col min-h-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.02)] rounded-t-[32px] mt-2 border-t border-gray-100">
              {/* Queue Header & Actions */}
              <div className="flex items-center justify-between mb-2 px-4 pt-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 text-sm">
                    同步队列 (
                    {activeTab === 'single'
                      ? '单篇'
                      : activeTab === 'blogger'
                        ? '同步'
                        : activeTab === 'profile'
                          ? '博主'
                          : '列表'}
                    )
                  </h2>
                  <div className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {currentItems.length}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => clearQueue()}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="清空列表"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 custom-scrollbar">
                {currentItems.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-gray-300 gap-2">
                    <Layers size={32} strokeWidth={1} />
                    <span className="text-[11px] font-medium">空空如也, 快去采集吧</span>
                  </div>
                ) : (
                  currentItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex gap-3 p-3 bg-white hover:bg-gray-50 rounded-2xl border border-gray-100 hover:border-red-100 transition-all shadow-sm"
                    >
                      {/* Left Cover */}
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-50">
                        <img
                          src={item.data.coverUrl}
                          className="w-full h-full object-cover"
                          alt="cover"
                        />
                      </div>

                      {/* Right Info */}
                      <div className="flex flex-1 flex-col justify-between py-0.5 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-1 leading-snug break-all">
                          {item.data.title}
                        </h3>

                        {(item.sourceType === 'note' || item.sourceType === 'blogger_note') && (
                          <div className="flex items-center gap-1.5 mt-1 min-w-0">
                            {item.data.author.avatar && (
                              <img
                                src={item.data.author.avatar}
                                className="w-4 h-4 rounded-full object-cover border border-gray-100"
                                alt="avatar"
                              />
                            )}
                            <span className="text-xs text-gray-500 truncate">
                              {item.data.author.name}
                            </span>
                          </div>
                        )}

                        {item.sourceType === 'profile' && (
                          <p className="text-[10px] text-gray-400 line-clamp-1 mt-1 leading-relaxed italic">
                            {item.data.desc || '暂无简介'}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-auto">
                          {item.sourceType === 'profile' ? (
                            <>
                              <div
                                className="flex items-center gap-1 text-xs text-gray-400"
                                title="粉丝"
                              >
                                <Users className="w-3 h-3 text-blue-400" />
                                <span>{formatCount(item.data.stats?.fans || 0)}</span>
                              </div>
                              <div
                                className="flex items-center gap-1 text-xs text-gray-400"
                                title="关注"
                              >
                                <UserPlus className="w-3 h-3 text-green-400" />
                                <span>{formatCount(item.data.stats?.following || 0)}</span>
                              </div>
                              <div
                                className="flex items-center gap-1 text-xs text-gray-400"
                                title="获赞与收藏"
                              >
                                <Heart className="w-3 h-3 text-red-400" fill="currentColor" />
                                <span>{formatCount(item.data.stats?.likes || 0)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <Heart
                                  className="w-3 h-3 text-red-400"
                                  fill={item.data.stats?.likes ? 'currentColor' : 'none'}
                                />
                                <span>{formatCount(item.data.stats?.likes || 0)}</span>
                              </div>
                              {item.sourceType !== 'blogger_note' && (
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <MessageSquare className="w-3 h-3 text-blue-400" />
                                  <span>{formatCount(item.data.stats?.comments || 0)}</span>
                                </div>
                              )}
                              {item.sourceType !== 'blogger_note' && (
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Star
                                    className="w-3 h-3 text-yellow-400"
                                    fill={item.data.stats?.collects ? 'currentColor' : 'none'}
                                  />
                                  <span>{formatCount(item.data.stats?.collects || 0)}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete Button (Hover Only) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeItem(item.id)
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 backdrop-blur opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-500 text-gray-400 shadow-md border border-gray-100 z-20"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Fixed Sync Button */}
              {currentItems.length > 0 && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                  <button
                    onClick={handleSync}
                    disabled={isCollecting || isSyncing}
                    className={`w-full font-bold py-3 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all transform ${isCollecting || isSyncing
                      ? 'bg-gray-300 cursor-not-allowed opacity-50 text-gray-500'
                      : 'bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-0.5 active:translate-y-0'
                      }`}
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                        <span>同步中...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload size={20} />
                        <span>同步数据 ({currentItems.length}项)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Global Risk Agreement Modal - Always On Top */}
      {isOpen && showRulesModal && (
        <RiskDisclaimerModal
          onConfirm={handleRulesConfirm}
          onCancel={handleRulesCancel}
        />
      )}
    </>
  )
}

const MOUNT_POINT_ID = 'rednote-muse-root'

async function init() {
  if (document.getElementById(MOUNT_POINT_ID)) return
  const mountPoint = document.createElement('div')
  mountPoint.id = MOUNT_POINT_ID
  document.body.appendChild(mountPoint)

  const shadowRoot = mountPoint.attachShadow({ mode: 'open' })

  // Initial styles
  const style = document.createElement('style')
  style.textContent = `
      :host { all: initial; font-family: sans-serif; display: none; }
      :host(.ready) { display: block; }
      div { box-sizing: border-box; }
      /* Ensure fixed positioning works relative to viewport not host */
      .fixed { position: fixed !important; }

      /* Custom Scrollbar */
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent; 
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #e5e7eb;
        border-radius: 99px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #d1d5db;
      }
      `
  shadowRoot.appendChild(style)

  // Load External CSS
  if (chrome.runtime?.getURL) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = chrome.runtime.getURL('style.css')

    const cssLoaded = new Promise((resolve) => {
      link.onload = resolve
      link.onerror = resolve
    })

    shadowRoot.appendChild(link)
    await cssLoaded
  }

  // Inject JS (Main page context)
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('inject.js')
  script.onload = function (this: HTMLScriptElement) {
    this.remove()
  }
    ; (document.head || document.documentElement).appendChild(script)

  // Final render
  const root = createRoot(shadowRoot)

  if (window.location.hostname === 'creator.xiaohongshu.com') {
    root.render(<PublisherApp />)
  } else {
    root.render(<App />)
  }

  mountPoint.classList.add('ready')
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

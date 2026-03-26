// Basic Data Interface for Collected Items
export interface CollectedItem {
  id: string
  sourceType: 'note' | 'profile' | 'feed_batch' | 'blogger_note'
  status: 'pending' | 'synced' | 'error'
  platform?: string
  data: {
    noteId?: string
    originalNoteId?: string
    title: string
    coverUrl: string
    desc?: string
    type?: 'video' | 'image'
    mediaUrls?: string[]
    stats: {
      likes: number
      collects?: number
      comments?: number
      fans?: number
      following?: number
    }
    author: {
      name: string
      id: string
      avatar: string
    }
    publishDate?: number
    profileUrl?: string
    videoUrl?: string
    url?: string
  }
  userTags: {
    category?: string
    rank?: string
    customTags?: string[]
    remark?: string
  }
}

/**
 * Plan A: Global State Extraction (For Note Detail Page)
 */
/**
 * Plan A: Global State Extraction (For Note Detail Page)
 */
export function extractFromState(
  state: Record<string, unknown>
): Partial<CollectedItem['data']> | null {
  try {
    const noteMap = state?.note?.noteDetailMap
    if (!noteMap) return null

    // Get noteId specifically from URL to avoid grabbing stale state
    const urlId = window.location.pathname.replace(/\/$/, '').split('/').pop()?.split('?')[0]
    if (!urlId) return null

    let noteDetail = noteMap[urlId]

    // Fallback: If URL ID not found in map, search for any key that looks like a note id
    if (!noteDetail) {
      // XHS sometimes uses different internal keys or prefixes
      const keys = Object.keys(noteMap)
      if (keys.length > 0) {
        // If only one note is in the map, it's likely the one we want
        if (keys.length === 1) {
          noteDetail = noteMap[keys[0]]
        } else {
          // Try to find the one with the correct noteId property
          const foundKey = keys.find((k) => noteMap[k].note?.noteId === urlId || k === urlId)
          if (foundKey) noteDetail = noteMap[foundKey]
        }
      }
    }

    if (!noteDetail) {
      console.warn('[Muse] Plan A: Note ID not found in state mapping')
      return null
    }

    const note = noteDetail.note || noteDetail
    const interact = noteDetail.interactInfo || note.interactInfo || note.stats || {}
    const user = note.user || {}

    // Extract all images
    // Even for video notes, imageList often contains the high-res cover
    const imageList = note.imageList || []
    const mediaUrls = imageList.map(
      (img: Record<string, any>) => img.urlDefault || img.url || img.url_default
    )

    // Robust Video URL Extraction
    let videoUrl = ''
    if (note.video?.media?.stream) {
      const stream = note.video.media.stream
      // Sort keys to prioritize h264 > h265 > av1 > others
      const priority = ['h264', 'h265', 'hevc', 'av1']
      const keys = Object.keys(stream).sort((a, b) => {
        const ia = priority.indexOf(a)
        const ib = priority.indexOf(b)
        // If both are in priority list, lower index comes first
        if (ia !== -1 && ib !== -1) return ia - ib
        // If only a is in priority, it comes first
        if (ia !== -1) return -1
        // If only b is in priority, it comes first
        if (ib !== -1) return 1
        // Otherwise stable sort
        return a.localeCompare(b)
      })

      for (const key of keys) {
        const streamList = stream[key]
        if (Array.isArray(streamList) && streamList.length > 0) {
          // Try to find a masterUrl in the objects
          const validObj = streamList.find((item: any) => item.masterUrl && item.masterUrl.startsWith('http'))
          if (validObj) {
            videoUrl = validObj.masterUrl
            console.log(`[Muse] Found video stream in format: ${key}`)
            break
          }
        }
      }
    }
    
    // Fallback video URL
    if (!videoUrl && note.video?.url) {
        videoUrl = note.video.url
    }

    const extractedData = {
      noteId: note.noteId || urlId,
      title: note.title || note.desc?.slice(0, 50).replace(/\n/g, ' ') || '无标题',
      desc: note.desc || '',
      // Smart Cover Logic: 
      // 1. Try mediaUrls[0] (High res from imageList)
      // 2. Try note.video.cover.url (Often decent)
      // 3. Try note.cover.urlDefault
      coverUrl: mediaUrls[0] || note.video?.cover?.url || note.cover?.urlDefault || '',
      type:
        note.type === 'video' ||
        (note.video && !note.imageList?.some((img: Record<string, any>) => img.livePhoto))
          ? 'video'
          : 'image',
      mediaUrls: mediaUrls,
      stats: {
        likes:
          typeof interact.likedCount === 'string'
            ? parseInt(interact.likedCount, 10)
            : interact.likedCount || 0,
        collects:
          typeof interact.collectedCount === 'string'
            ? parseInt(interact.collectedCount, 10)
            : interact.collectedCount || 0,
        comments:
          typeof interact.commentCount === 'string'
            ? parseInt(interact.commentCount, 10)
            : interact.commentCount || 0
      },
      author: {
        name: user.nickname || '',
        id: user.userid || '',
        avatar: user.avatar || ''
      },
      publishDate: note.time || Date.now(),
      url: cleanUrl(window.location.href),
      videoUrl: videoUrl
    }

    // Defensive check for blob in Plan A
    if (extractedData.videoUrl?.startsWith('blob:')) {
      console.warn('[Muse] Plan A returned a blob URL, clearing it to force Plan B/C')
      extractedData.videoUrl = ''
    }

    console.log('[Muse] Plan A outcome:', {
      type: extractedData.type,
      hasVideoUrl: !!extractedData.videoUrl,
      mediaCount: extractedData.mediaUrls.length
    })
    return extractedData as Partial<CollectedItem['data']>
  } catch (e) {
    console.warn('[Muse] Plan A matching failed', e)
    return null
  }
}

/**
 * Extract Blogger Profile Info from DOM
 */
export function extractBloggerProfile(): Partial<CollectedItem['data']> | null {
  try {
    const name =
      document.querySelector('.user-name')?.textContent?.trim() ||
      document.querySelector('.nickname')?.textContent?.trim() ||
      ''

    // Improved avatar selector
    const avatarImg =
      document.querySelector('.avatar-wrapper img') ||
      document.querySelector('.user-image img') ||
      document.querySelector('.avatar-item') ||
      document.querySelector('.user-info img')
    const avatar = (avatarImg as HTMLImageElement)?.src || ''

    const redId =
      document.querySelector('.user-redId')?.textContent?.replace('小红书号：', '').trim() ||
      document.querySelector('.redId')?.textContent?.trim() ||
      ''

    const desc = document.querySelector('.user-desc')?.textContent?.trim() || ''

    // Stats extraction
    const interactions = document.querySelector('.user-interactions')
    let following = 0
    let fans = 0
    let totalInteractions = 0 // Likes & Collects

    if (interactions) {
      const items = interactions.querySelectorAll('div')
      items.forEach((item) => {
        const fullText = item.textContent?.trim() || ''
        const label = item.querySelector('.shows')?.textContent?.trim() || ''
        const val = parseXhsCount(fullText)

        if (label.includes('关注')) following = val
        else if (label.includes('粉丝')) fans = val
        else if (label.includes('获赞') || label.includes('收藏')) totalInteractions = val
      })
    }

    const urlId = window.location.pathname.replace(/\/$/, '').split('/').pop()?.split('?')[0] || ''

    return {
      title: name,
      desc: desc || `小红书号: ${redId}`,
      coverUrl: avatar,
      author: {
        name,
        avatar,
        id: urlId || redId // Prioritize permanent hex ID (urlId) for consistency with notes
      },
      stats: {
        likes: totalInteractions,
        fans: fans,
        following: following
      },
      profileUrl: cleanUrl(window.location.href)
    }
  } catch (e) {
    console.error('Blogger extraction failed', e)
    return null
  }
}

/**
 * Extract feed notes from a container (Blogger homepage)
 */
export function extractFeedNotes(): Partial<CollectedItem['data']>[] {
  const feedItems = document.querySelectorAll('section.note-item')
  const results: Partial<CollectedItem['data']>[] = []

  feedItems.forEach((item) => {
    try {
      // DOM Selectors based on Browser Investigation (Step 408)
      const title = item.querySelector('.title')?.textContent?.trim() || ''
      const coverUrl = (item.querySelector('img') as HTMLImageElement)?.src || ''
      const noteLink =
        (item.querySelector('a.cover') as HTMLAnchorElement)?.href ||
        (item.querySelector('a.title') as HTMLAnchorElement)?.href ||
        (item.querySelector('a') as HTMLAnchorElement)?.href ||
        ''

      const cleanNoteLink = cleanUrl(noteLink)
      // Extract noteId while preserving the full cleanNoteLink for the url field
      const urlParts = cleanNoteLink.split('?')[0].split('/')
      const noteId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2]

      const authorEl = item.querySelector('.author') as HTMLAnchorElement | null
      const authorName = authorEl?.textContent?.trim() || ''
      const authorUrl = authorEl?.href || ''
      const authorId = authorUrl.split('/').pop()?.split('?')[0] || ''

      // Likes are usually in a span within .footer, sometimes nested
      const likesRaw =
        item.querySelector('.footer .count')?.textContent?.trim() ||
        item.querySelector('.like-wrapper')?.textContent?.trim() ||
        '0'

      if (!noteId) return

      results.push({
        noteId,
        title: title || '无标题',
        coverUrl,
        url: cleanNoteLink, // Preserve original URL with xsec_token
        desc: '', // Feed items don't have full description
        author: { name: authorName, id: authorId, avatar: '' },
        stats: {
          likes: parseXhsCount(likesRaw),
          collects: 0, // Not available on feed scan
          comments: 0 // Not available on feed scan
        }
      })
    } catch {
      // ignore
    }
  })

  return results
}

/**
 * Simplified DOM Plan B for Note Detail (Fallback)
 */
export async function extractNoteFromDOM(): Promise<Partial<CollectedItem['data']>> {
  const noteId = location.pathname.split('/').pop() || ''

  // Scope to the relevant container to avoid feed items
  const container = document.querySelector('.note-container') || document.body
  const interactBar =
    container.querySelector('.engage-bar-style') ||
    container.querySelector('.interaction-container') ||
    container

  const getText = (selector: string, parent: Element = document.body): string =>
    parent.querySelector(selector)?.textContent?.trim() || ''



  const desc = getText('.desc', container) || getText('.note-scroller .desc', container)
  const rawTitle = getText('.title', container) || getText('#detail-title', container)

  const videoElement = container.querySelector('video') as HTMLVideoElement
  // Live photos also have a <video> element. We check for image-specific containers to avoid misclassification.
  const hasImageSlider =
    !!container.querySelector('.note-slider') ||
    !!container.querySelector('.swiper-container') ||
    container.querySelectorAll('.media-container img').length > 1

  const hasVideo =
    (!!videoElement && !hasImageSlider) ||
    !!document.querySelector('meta[property="og:video"]') ||
    !!document.querySelector('meta[name="og:video"]') ||
    !!container.querySelector('.video-container') ||
    !!container.querySelector('.xg-video-container')

  const getBG = (el: Element | null): string => {
    if (!el) return ''
    const style = window.getComputedStyle(el)
    const bg = style.backgroundImage
    if (bg && bg.startsWith('url')) {
      return bg.slice(5, -2).replace(/"/g, '').replace(/'/g, '')
    }
    return ''
  }

  const videoPoster =
    videoElement?.poster ||
    (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ||
    (document.querySelector('meta[name="og:image"]') as HTMLMetaElement)?.content ||
    getBG(container.querySelector('xg-poster')) ||
    getBG(container.querySelector('.xgplayer-poster')) ||
    getBG(container.querySelector('.v-poster')) ||
    (container.querySelector('.video-poster') as HTMLImageElement)?.src ||
    (container.querySelector('.v-poster') as HTMLImageElement)?.src ||
    (container.querySelector('video + img') as HTMLImageElement)?.src ||
    (container.querySelector('.media-container img') as HTMLImageElement)?.src ||
    ''

  console.log('[Muse] Video Poster Check:', {
    videoPoster,
    hasVideoElement: !!videoElement,
    xgPoster: !!container.querySelector('xg-poster'),
    metaOg: (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content
  })

  // Extract multiple images from DOM carousel
  // Strategy: Get broad set of candidates, then strict filter
  const candidates = container.querySelectorAll(
    '.swiper-wrapper img, .media-container img, .note-slider-img img, .img-container img'
  )

  const mediaUrls: string[] = []
  candidates.forEach((imgCandidate) => {
    const img = imgCandidate as HTMLImageElement
    // 1. Check if ANY ancestor is a duplicate slide
    if (img.closest('.swiper-slide-duplicate')) return

    // 2. Basic validation
    const src = img.src
    if (src && !mediaUrls.includes(src)) {
      const isClear = src.includes('clear.png') || src.includes('data:image')
      // Filter out profiles/avatars
      const isAvatar =
        img.classList.contains('avatar-item') ||
        img.closest('.author-container') ||
        img.closest('.user-info')

      if (!isClear && !isAvatar) {
        mediaUrls.push(src)
      }
    }
  })

  const extractedDomData = {
    noteId,
    title: rawTitle || desc.slice(0, 50).replace(/\n/g, ' ') || '无标题',
    desc,
    type: (hasVideo ? 'video' : 'image') as 'video' | 'image',
    mediaUrls:
      mediaUrls.length > 0
        ? mediaUrls
        : videoPoster
          ? [videoPoster]
          : [(container.querySelector('.note-slider-img img') as HTMLImageElement)?.src || ''],
    coverUrl:
      mediaUrls[0] ||
      videoPoster ||
      (container.querySelector('.note-slider-img img') as HTMLImageElement)?.src ||
      '',
    author: {
      name: getText('.author-container .name', container) || getText('.username', container),
      avatar:
        (container.querySelector('.author-container img.avatar-item') as HTMLImageElement)?.src ||
        '',
      id:
        ((container.querySelector('.author-container a') as HTMLAnchorElement)?.href || '')
          .split('/')
          .pop()
          ?.split('?')[0] || ''
    },
    stats: {
      likes: parseXhsCount(getText('.like-wrapper .count', interactBar)),
      collects: parseXhsCount(getText('.collect-wrapper .count', interactBar)),
      comments: parseXhsCount(getText('.chat-wrapper .count', interactBar))
    },
    url: cleanUrl(window.location.href),
    videoUrl:
      (document.querySelector('meta[property="og:video"]') as HTMLMetaElement)?.content ||
      (document.querySelector('meta[name="og:video"]') as HTMLMetaElement)?.content ||
      (container.querySelector('video')?.src?.startsWith('blob:')
        ? ''
        : container.querySelector('video')?.src) ||
      '',
    publishDate: (() => {
      const dateEl = container.querySelector('.bottom-container .date') || container.querySelector('.date')
      const dateText = dateEl?.textContent?.trim() || ''
      const parsed = parseXhsDate(dateText)
      console.log('[Muse Extractor] extractNoteFromDOM Date Debug:', {
        selector: '.bottom-container .date || .date',
        foundEl: !!dateEl,
        html: dateEl?.innerHTML,
        text: dateText,
        parsed: parsed,
        parsedDateString: new Date(parsed).toLocaleString()
      })
      return parsed
    })()
  }

  // Plan C: React Fiber Traversal (The "God Mode" Fix)
  // This bypasses DOM/Script obfuscation by reading the internal React state of the components.
  if (extractedDomData.type === 'video' && !extractedDomData.videoUrl) {
    console.log('[Muse] Plan C: Attempting React Fiber Extraction...')
    const targetId = extractedDomData.noteId || noteId

    try {
      // Helper to safely find fiber node on an element
      const getFiber = (el: Element | null) => {
        if (!el) return null
        return (el as any)[Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) || '']
      }

      // Helper to search fiber props for our target ID and video data
      const searchFiber = (fiber: any): string | null => {
        let curr = fiber
        let attempts = 0
        while (curr && attempts < 50) {
          const p = curr.memoizedProps
          if (p) {
             // Check if this component holds data for our note
             // We look for objects that contain both the ID and the video data structure
             // Simplified check: Does this prop object have 'note' or 'noteDetail'?
             const noteObj = p.note || p.noteDetail || (p.id === targetId ? p : null)
             
             if (noteObj) {
               // Verify ID matches if present
               if ((noteObj.id === targetId || noteObj.noteId === targetId || noteObj.note?.id === targetId)) {
                  // Extract URL
                  const videoData = noteObj.video || noteObj.note?.video
                  if (videoData?.media?.stream) {
                     // Standard XHS stream structure
                     const stream = videoData.media.stream
                     const candidates = [
                       ...(stream.h264 || []),
                       ...(stream.h265 || []),
                       ...(stream.hevc || []),
                       ...(stream.av1 || [])
                     ]
                     const master = candidates.find((c: any) => c.masterUrl)
                     if (master) return master.masterUrl
                  }
               }
             }
          }
          curr = curr.return
          attempts++
        }
        return null
      }

      // 1. Try from video element directly (most likely success)
      let fiberUrl = searchFiber(getFiber(document.querySelector('video')))
      
      // 2. Try from main container if video tag specific fail
      if (!fiberUrl) {
        fiberUrl = searchFiber(getFiber(document.querySelector('#noteContainer'))) || 
                   searchFiber(getFiber(document.querySelector('.note-container'))) ||
                   searchFiber(getFiber(document.querySelector('.note-detail-mask')))
      }

      if (fiberUrl) {
        extractedDomData.videoUrl = fiberUrl
        console.log('[Muse] Plan C (React Fiber) success:', fiberUrl)
      } else {
        // Plan D: Deep State Parsing (Fallback)
        console.log('[Muse] Plan D: Deep State Parsing...')
        const scripts = Array.from(document.querySelectorAll('script'))
        for (const script of scripts) {
          if (script.textContent && script.textContent.includes('window.__INITIAL_STATE__=')) {
            try {
              const content = script.textContent
              const jsonText = content.replace('window.__INITIAL_STATE__=', '').replace(/;$/, '')
              // Use a safe parser or standard JSON.parse
              const state = JSON.parse(jsonText)
              // Specific path seen in analysis: note.noteDetailMap[id]
              const noteMap = state?.note?.noteDetailMap || {}
              const targetNote = noteMap[targetId]
              
              if (targetNote?.note?.video?.media?.stream) {
                  const stream = targetNote.note.video.media.stream
                  const candidates = [
                       ...(stream.h264 || []),
                       ...(stream.h265 || []),
                       ...(stream.hevc || [])
                  ]
                  const master = candidates.find((c: any) => c.masterUrl)
                  if (master) {
                    extractedDomData.videoUrl = master.masterUrl
                    console.log('[Muse] Plan D (State Parse) success:', extractedDomData.videoUrl)
                    break
                  }
              }
            } catch (e) { /* ignore parse errors */ }
          }
        }
      }
      
      // Attempt to extract cover/poster from the same success if missing
      // (This part is implicit: if we found the note object, we could have extracted the cover too, 
      // but let's stick to fixing the critical video URL failure first)

    } catch (e) {
      console.warn('[Muse] Plan C/D Extraction failed:', e)
    }
  }

  console.log('[Muse] Plan B/C outcome:', {
    type: extractedDomData.type,
    videoUrl: extractedDomData.videoUrl,
    publishDate: extractedDomData.publishDate
  })
  return extractedDomData
}

/**
 * Helper to parse XHS formatted counts (e.g. 1.2w, 500)
 */
export function parseXhsCount(text: string): number {
  if (!text) return 0
  const clean = text.trim().toLowerCase()
  if (clean === '点赞' || clean === '收藏' || clean === '评论') return 0

  const hasW = clean.includes('w') || clean.includes('万')
  const hasK = clean.includes('k') || clean.includes('千')

  const numMatch = clean.match(/[\d.]+/)
  if (!numMatch) return 0

  const baseNum = parseFloat(numMatch[0])

  if (hasW) {
    return Math.floor(baseNum * 10000)
  }
  if (hasK) {
    return Math.floor(baseNum * 1000)
  }

  return Math.floor(baseNum)
}

/**
 * Filter out obfuscated query parameters from URLs
 */
export function cleanUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr)
    url.searchParams.delete('_m_ac')
    url.searchParams.delete('_m_t')
    return url.toString()
  } catch {
    return urlStr
  }
}

/**
 * Parse XHS Date string (e.g. "01-15", "2023-11-20", "昨天 12:00", "01-01 广东")
 */
export function parseXhsDate(dateText: string): number {
  if (!dateText) return 0
  
  try {
    const now = new Date()
    const cleanRaw = dateText.replace('编辑于', '').trim()
    // Split by space to isolate the date part (e.g. "2023-11-20" from "2023-11-20 四川")
    const cleanText = cleanRaw.split(' ')[0].trim() 

    // Enhanced logging to debug specific failing cases
    console.log('[Muse Extractor Date Logic]', {
      original: dateText,
      cleanRaw,
      cleanText,
      isYYYYMMDD: /^\d{4}-\d{2}-\d{2}$/.test(cleanText),
      isMMDD: /^\d{2}-\d{2}$/.test(cleanText)
    })
    
    // 1. "昨天 HH:mm"
    if (dateText.includes('昨天')) {
      return now.getTime() - 24 * 60 * 60 * 1000
    }
    
    // 2. "今天 HH:mm" or just "今天"
    if (dateText.includes('今天')) {
      return now.getTime()
    }

    // 3. "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanText)) {
      const ts = new Date(cleanText).getTime()
      console.log('[Muse Extractor Date Logic] Matched YYYY-MM-DD:', ts)
      return ts
    }

    // 4. "MM-DD" (Current Year)
    if (/^\d{2}-\d{2}$/.test(cleanText)) {
      const year = now.getFullYear()
      const ts = new Date(`${year}-${cleanText}`).getTime()
      console.log('[Muse Extractor Date Logic] Matched MM-DD:', ts)
      return ts
    }

    // 5. "天前" relative
    if (dateText.includes('天前')) {
      const days = parseInt(dateText) || 0
      return now.getTime() - days * 24 * 60 * 60 * 1000
    }

    // Fallback: Try standard parse
    const ts = Date.parse(cleanText)
    if (!isNaN(ts)) {
      console.log('[Muse Extractor Date Logic] Matched Fallback Date.parse:', ts)
      return ts
    }

  } catch (e) {
    console.warn('Date parse failed:', dateText, e)
  }
  
  return 0
}

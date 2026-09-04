;(function () {
  const config = window.DAYKEEP_SITE_CONFIG || { environments: {} }
  const hostname = window.location.hostname
  const environments = config.environments || {}
  const environment = Object.entries(environments).find(([, value]) => value.hosts.includes(hostname))
  const [environmentName, settings] = environment || ['testing', environments.testing || {}]
  const isTesting = environmentName === 'testing'

  document.title = `${settings.miniProgramName || '只我们'}｜世界很大，这里只我们`
  const environmentBadge = document.getElementById('environmentBadge')
  if (environmentBadge) environmentBadge.hidden = !isTesting
  document.getElementById('latestVersion').textContent = settings.latestVersion || '即将发布'
  document.getElementById('releasedAt').textContent = settings.releasedAt || '信息待更新'
  const yearElement = document.getElementById('year')
  if (yearElement) yearElement.textContent = new Date().getFullYear()

  const footerEnvironment = document.getElementById('footerEnvironment')
  if (footerEnvironment && settings.label) {
    footerEnvironment.textContent = settings.label
  } else if (footerEnvironment && !isTesting) {
    footerEnvironment.textContent = ''
  }

  function configureDownload(id, url) {
    const button = document.getElementById(id)
    if (!button || !url) return
    button.disabled = false
    button.classList.remove('disabled')
    button.textContent = '立即下载 →'
    button.addEventListener('click', () => window.location.assign(url))
  }

  configureDownload('iosButton', settings.iosUrl)
  configureDownload('androidButton', settings.androidUrl)

  function configureLink(id, url) {
    if (!url) return
    const element = document.getElementById(id)
    if (!element) return
    element.href = url
    element.removeAttribute('aria-disabled')
    element.removeAttribute('tabindex')
  }

  configureLink('privacyLink', settings.privacyUrl)
  configureLink('footerPrivacyLink', settings.privacyUrl)
  configureLink('agreementLink', settings.agreementUrl)

  let dialogScrollPosition = 0
  let pageLockedForDialog = false

  function lockPageForDialog() {
    if (pageLockedForDialog) return
    dialogScrollPosition = window.scrollY
    pageLockedForDialog = true
    document.body.style.position = 'fixed'
    document.body.style.inset = `-${dialogScrollPosition}px 0 auto`
    document.body.style.width = '100%'
  }

  function unlockPageAfterDialog() {
    if (!pageLockedForDialog) return
    pageLockedForDialog = false
    document.body.style.position = ''
    document.body.style.inset = ''
    document.body.style.width = ''
    const previousScrollBehavior = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, dialogScrollPosition)
    window.requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior
    })
  }

  function showDialogWithoutScrollJump(target) {
    lockPageForDialog()
    target.setAttribute('tabindex', '-1')
    try {
      target.showModal()
      target.focus({ preventScroll: true })
    } catch (error) {
      unlockPageAfterDialog()
      throw error
    }
  }

  const dialog = document.getElementById('platformDialog')
  const miniProgramButton = document.getElementById('miniProgramButton')
  const miniProgramDownloadButton = document.getElementById('miniProgramDownloadButton')
  const dialogTitle = document.getElementById('dialogTitle')
  const dialogDescription = document.getElementById('dialogDescription')
  const dialogAccessNote = document.getElementById('dialogAccessNote')
  const qrPlaceholder = document.getElementById('qrPlaceholder')
  if (settings.accessNotice) {
    dialogAccessNote.textContent = settings.accessNotice
    dialogAccessNote.hidden = false
  }
  function openMiniProgramDialog() {
    dialogTitle.textContent = `打开${settings.miniProgramName || '只我们'}`
    const qrIsValid = settings.miniProgramQr && (!settings.miniProgramQrExpiresAt || Date.now() < new Date(settings.miniProgramQrExpiresAt).getTime())
    if (qrIsValid) {
      qrPlaceholder.innerHTML = `<img src="${settings.miniProgramQr}" alt="${settings.miniProgramName} 小程序二维码">`
      dialogDescription.textContent = settings.miniProgramQrExpiresAt
        ? `请使用微信扫码打开体验版小程序。该入口于 ${new Date(settings.miniProgramQrExpiresAt).toLocaleDateString('zh-CN')} 前有效。`
        : '请使用微信扫码打开小程序。'
    } else {
      qrPlaceholder.textContent = '⌘'
      dialogDescription.textContent = settings.miniProgramQr ? '体验入口正在更新，请稍后再试。' : '小程序二维码将在上线后展示于此。'
    }
    showDialogWithoutScrollJump(dialog)
  }
  miniProgramButton.addEventListener('click', openMiniProgramDialog)
  miniProgramDownloadButton.addEventListener('click', openMiniProgramDialog)
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', unlockPageAfterDialog)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })

  const feedbackDialog = document.getElementById('feedbackDialog')
  const feedbackLink = document.getElementById('feedbackLink')
  const feedbackForm = document.getElementById('feedbackForm')
  const feedbackStatus = document.getElementById('feedbackStatus')
  const feedbackEnvironment = document.getElementById('feedbackEnvironment')
  const feedbackClose = document.getElementById('feedbackClose')
  const feedbackImages = document.getElementById('feedbackImages')
  const feedbackPreviews = document.getElementById('feedbackPreviews')
  const feedbackApiBase = (settings.apiBase || '').replace(/\/$/, '')
  let selectedFeedbackImages = []

  function renderFeedbackPreviews() {
    feedbackPreviews.replaceChildren()
    selectedFeedbackImages.forEach((file, index) => {
      const item = document.createElement('div')
      item.className = 'feedback-preview'
      const image = document.createElement('img')
      image.src = URL.createObjectURL(file)
      image.alt = `待上传截图 ${index + 1}`
      image.onload = () => URL.revokeObjectURL(image.src)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.ariaLabel = `移除截图 ${index + 1}`
      remove.textContent = '×'
      remove.addEventListener('click', () => {
        selectedFeedbackImages.splice(index, 1)
        renderFeedbackPreviews()
      })
      item.append(image, remove)
      feedbackPreviews.append(item)
    })
  }

  feedbackImages.addEventListener('change', () => {
    const candidates = Array.from(feedbackImages.files || [])
    const invalid = candidates.find((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)
    if (invalid) {
      feedbackStatus.textContent = '请添加图片文件，且单张不能超过 5MB。'
      feedbackImages.value = ''
      return
    }
    selectedFeedbackImages = candidates.slice(0, 3)
    if (candidates.length > 3) feedbackStatus.textContent = '最多可添加 3 张截图，已保留前 3 张。'
    renderFeedbackPreviews()
  })

  async function uploadFeedbackImages() {
    const imageUrls = []
    for (const file of selectedFeedbackImages) {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`${feedbackApiBase}/api/feedback/upload`, { method: 'POST', body: form })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.code !== 0 || !body.data?.url) throw new Error(body.msg || '截图上传失败，请稍后重试')
      imageUrls.push(body.data.url)
    }
    return imageUrls
  }

  feedbackLink.addEventListener('click', (event) => {
    event.preventDefault()
    feedbackStatus.textContent = ''
    feedbackEnvironment.textContent = isTesting
      ? '当前是本地预览环境，请在配置 API 后提交反馈。'
      : '你的反馈会进入问题处理队列。'
    showDialogWithoutScrollJump(feedbackDialog)
  })
  feedbackClose.addEventListener('click', () => feedbackDialog.close())
  feedbackDialog.addEventListener('close', unlockPageAfterDialog)
  feedbackDialog.addEventListener('click', (event) => {
    if (event.target === feedbackDialog) feedbackDialog.close()
  })
  feedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(feedbackForm)
    const content = String(formData.get('content') || '').trim()
    const submitButton = feedbackForm.querySelector('button[type="submit"]')
    if (content.length < 5) {
      feedbackStatus.textContent = '请至少填写 5 个字，方便我们理解问题。'
      return
    }
    submitButton.disabled = true
    submitButton.textContent = selectedFeedbackImages.length ? '正在上传截图…' : '正在提交…'
    feedbackStatus.textContent = ''
    try {
      const imageUrls = await uploadFeedbackImages()
      submitButton.textContent = '正在提交…'
      const response = await fetch(`${feedbackApiBase}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: formData.get('category'),
          content,
          contact: String(formData.get('contact') || '').trim(),
          imageUrls,
          website: String(formData.get('website') || ''),
          source: 'website',
          clientMeta: {
            platform: navigator.platform || 'web',
            appVersion: 'website',
            page: window.location.pathname || '/',
            system: navigator.userAgent.slice(0, 128),
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.code !== 0) throw new Error(body.msg || '反馈提交失败，请稍后重试')
      feedbackForm.reset()
      selectedFeedbackImages = []
      renderFeedbackPreviews()
      feedbackStatus.textContent = `已收到反馈，编号 #${body.data.id}${isTesting ? '（体验环境）' : ''}。`
    } catch (error) {
      feedbackStatus.textContent = error instanceof Error ? error.message : '反馈提交失败，请稍后重试'
    } finally {
      submitButton.disabled = false
      submitButton.textContent = '提交反馈'
    }
  })

  const featureLinks = Array.from(document.querySelectorAll('.feature-switcher a'))
  const featureSections = Array.from(document.querySelectorAll('.feature-row[id]'))
  if (featureLinks.length && featureSections.length) {
    const setActiveFeature = (id) => {
      featureLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`))
    }
    setActiveFeature(featureSections[0].id)
    const featureObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActiveFeature(visible.target.id)
    }, { rootMargin: '-28% 0px -52% 0px', threshold: [0.05, 0.2, 0.45] })
    featureSections.forEach((section) => featureObserver.observe(section))
  }
})()

import { test, expect } from './helpers/electron'

test.setTimeout(180_000)

test.describe('Claude Code Chat Provider', () => {
  test('configure and send a chat message', async ({ electronApp, mainWindow }) => {
    console.log('App launched, window ready')
    await mainWindow.screenshot({ path: 'test-results/screenshots/01-launched.png' })

    // --- Step 1: Configure Settings ---
    console.log('Step 1: Settings...')
    await mainWindow.click('text=Settings')
    await mainWindow.waitForTimeout(1000)
    await mainWindow.screenshot({ path: 'test-results/screenshots/02-settings.png' })

    // Set provider to claude-code
    const providerSelect = mainWindow.locator('select').filter({ has: mainWindow.locator('option[value="claude-code"]') })
    await providerSelect.selectOption('claude-code')
    await mainWindow.waitForTimeout(500)

    // Set model to sonnet
    const modelSelect = mainWindow.locator('select').filter({ has: mainWindow.locator('option[value="sonnet"]') })
    await modelSelect.last().selectOption('sonnet')

    // Save
    await mainWindow.click('text=Save Settings')
    await mainWindow.waitForTimeout(1000)
    await mainWindow.screenshot({ path: 'test-results/screenshots/03-settings-saved.png' })
    console.log('  Provider=claude-code, model=sonnet saved')

    // --- Step 1b: Enable & Start MCP HTTP Transport ---
    console.log('Step 1b: Enabling MCP HTTP transport...')

    // Scroll down to MCP section — find the Enable dropdown and set to Enabled
    const mcpEnableSelect = mainWindow.locator('select').filter({ has: mainWindow.locator('option[value="true"]') })
    const mcpSelects = await mcpEnableSelect.all()
    for (const sel of mcpSelects) {
      const opts = await sel.locator('option').allTextContents()
      if (opts.some(o => o.includes('Enabled')) && opts.some(o => o.includes('Disabled'))) {
        await sel.selectOption('true')
        console.log('  MCP HTTP Transport set to Enabled')
        break
      }
    }

    // Save settings again to persist MCP config
    await mainWindow.click('text=Save Settings')
    await mainWindow.waitForTimeout(1000)

    // Click the Start button for MCP transport
    const startBtn = mainWindow.locator('button').filter({ hasText: 'Start' })
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click()
      console.log('  Clicked MCP Start button')
      await mainWindow.waitForTimeout(2000)
    }

    await mainWindow.screenshot({ path: 'test-results/screenshots/03b-mcp-started.png' })

    // Verify MCP status shows Running
    const statusText = await mainWindow.locator('text=Running').isVisible().catch(() => false)
    console.log(`  MCP status Running: ${statusText}`)

    // --- Step 2: Navigate to a project ---
    console.log('Step 2: Projects...')
    await mainWindow.click('text=Projects')
    await mainWindow.waitForTimeout(1000)
    await mainWindow.screenshot({ path: 'test-results/screenshots/04-projects.png' })

    // List sidebar items
    const projectLinks = await mainWindow.locator('.sidebar').locator('a, button, [role="button"]').all()
    console.log(`  Found ${projectLinks.length} sidebar items`)
    for (const link of projectLinks.slice(0, 5)) {
      const text = await link.textContent()
      console.log(`    - "${text?.trim()}"`)
    }

    // Click first project (skip header links)
    const projectLink = mainWindow.locator('.sidebar').locator('a, [role="button"]').nth(2)
    if (await projectLink.isVisible().catch(() => false)) {
      const text = await projectLink.textContent()
      console.log(`  Clicking: "${text?.trim()}"`)
      await projectLink.click()
      await mainWindow.waitForTimeout(1000)
    }
    await mainWindow.screenshot({ path: 'test-results/screenshots/05-project-view.png' })

    // --- Step 3: Find chat and send ---
    console.log('Step 3: Chat...')

    const textareas = await mainWindow.locator('textarea').all()
    console.log(`  Found ${textareas.length} textareas`)

    for (const ta of textareas) {
      const ph = await ta.getAttribute('placeholder')
      const vis = await ta.isVisible().catch(() => false)
      console.log(`    textarea: placeholder="${ph}", visible=${vis}`)
    }

    let chatInput = null
    for (const ta of textareas) {
      if (await ta.isVisible().catch(() => false)) {
        chatInput = ta
        break
      }
    }

    if (!chatInput) {
      console.log('  No visible textarea found!')
      await mainWindow.screenshot({ path: 'test-results/screenshots/06-no-chat-input.png' })
      const bodyHtml = await mainWindow.evaluate(() => document.body.innerHTML.substring(0, 5000))
      console.log('  Body HTML (5000 chars):', bodyHtml)
      expect(chatInput, 'Expected to find a chat input textarea').toBeTruthy()
      return
    }

    await chatInput.fill('Say hello and tell me what tools you have available. Keep it brief.')
    console.log('  Message typed')
    await mainWindow.screenshot({ path: 'test-results/screenshots/06-typed.png' })

    // Send — try submit button or Enter key
    const sendBtn = mainWindow.locator('button').filter({ hasText: 'Send' })
    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click()
      console.log('  Clicked Send button')
    } else {
      const submitBtn = mainWindow.locator('button[type="submit"]').first()
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click()
        console.log('  Clicked submit button')
      } else {
        await chatInput.press('Enter')
        console.log('  Pressed Enter')
      }
    }

    // --- Step 4: Wait for assistant response ---
    console.log('Step 4: Waiting for assistant response (up to 90s)...')
    let gotResponse = false

    for (let i = 0; i < 90; i++) {
      await mainWindow.waitForTimeout(1000)

      // Look specifically for assistant message content (NOT sidebar text)
      const assistantMessages = mainWindow.locator('.chat-message.assistant')
      const assistantCount = await assistantMessages.count()

      if (assistantCount > 0) {
        // Check if any assistant message has actual content in .markdown-body
        const lastAssistant = assistantMessages.last()
        const markdownBody = lastAssistant.locator('.markdown-body')

        if (await markdownBody.isVisible().catch(() => false)) {
          const responseText = (await markdownBody.textContent()) || ''

          // Check for meaningful response (more than just whitespace)
          if (responseText.trim().length > 10) {
            gotResponse = true
            console.log(`  Got response at ${i + 1}s! (${responseText.trim().length} chars)`)
            console.log(`  Response preview: "${responseText.trim().substring(0, 200)}"`)
            break
          }
        }

        // Also check for errors in assistant message
        const messageText = (await lastAssistant.textContent()) || ''
        if (messageText.includes('Error') || messageText.includes('error') || messageText.includes('failed')) {
          console.log(`  Error in assistant message at ${i + 1}s: "${messageText.trim().substring(0, 300)}"`)
          await mainWindow.screenshot({ path: 'test-results/screenshots/07-error.png' })
          break
        }
      }

      // Also check for page-level errors
      const pageText = (await mainWindow.locator('body').textContent()) || ''
      if (pageText.includes('AI_APICallError') || pageText.includes('Claude Code process exited')) {
        console.log(`  Fatal error detected at ${i + 1}s`)
        await mainWindow.screenshot({ path: 'test-results/screenshots/07-fatal-error.png' })
        break
      }

      if (i % 10 === 9) {
        await mainWindow.screenshot({ path: `test-results/screenshots/07-wait-${i + 1}s.png` })
        console.log(`  ...${i + 1}s (${assistantCount} assistant messages found)`)
      }
    }

    await mainWindow.screenshot({ path: 'test-results/screenshots/08-final.png' })
    console.log(`  Response received: ${gotResponse}`)
    expect(gotResponse, 'Expected to receive a chat response from Claude Code').toBe(true)
  })
})

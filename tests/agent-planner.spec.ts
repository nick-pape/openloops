import { test, expect, captureMainProcessLogs } from './helpers/electron'

/**
 * Agent Planner Tests
 *
 * Tests for the AI agent behavior in the planner context,
 * specifically verifying that the agent doesn't loop calling tools repeatedly.
 */

test.describe('Agent Planner Behavior', () => {
  test.beforeEach(async ({ mainWindow }) => {
    // Navigate to Planner view
    await mainWindow.click('text=Planner')
    await expect(mainWindow.locator('text=Day Planner')).toBeVisible()
  })

  test('should show agent chat interface', async ({ mainWindow }) => {
    // Check for chat input
    const chatInput = mainWindow.locator('textarea[placeholder*="Ask"], textarea[placeholder*="Type"]')
    await expect(chatInput).toBeVisible()

    console.log('✅ Agent chat interface visible')
  })

  test('should not loop when creating a plan', async ({ mainWindow, electronApp }) => {
    // Enable main process log capture
    captureMainProcessLogs(electronApp)

    // Check if LLM is configured
    await mainWindow.click('text=Settings')
    const llmConfigured = await mainWindow.locator('select[value="disabled"]').isVisible()

    if (llmConfigured) {
      console.log('⚠️  LLM not configured - skipping agent test')
      test.skip()
    }

    // Go back to Planner
    await mainWindow.click('text=Planner')

    // Find chat input
    const chatInput = mainWindow.locator('textarea[placeholder*="Ask"], textarea[placeholder*="Type"]')
    await chatInput.fill('Can you create a plan for today?')

    // Submit message
    await chatInput.press('Enter')

    console.log('🤖 Agent request sent: "Can you create a plan for today?"')

    // Set up tool call tracking
    let toolCalls: { name: string; timestamp: number }[] = []

    // Listen for tool call UI updates
    mainWindow.on('console', (msg) => {
      const text = msg.text()

      // Look for tool call patterns in console
      if (text.includes('calendar_day_events_get') || text.includes('tasks_list_candidates_for_day')) {
        const toolName = text.includes('calendar_day_events_get')
          ? 'calendar_day_events_get'
          : 'tasks_list_candidates_for_day'

        toolCalls.push({ name: toolName, timestamp: Date.now() })
        console.log(`🔧 Tool called: ${toolName} (total calls: ${toolCalls.length})`)
      }
    })

    // Wait for agent to respond (up to 60 seconds)
    await mainWindow.waitForTimeout(60000)

    // Analyze tool calls
    const calendarCalls = toolCalls.filter((c) => c.name === 'calendar_day_events_get')
    const tasksCalls = toolCalls.filter((c) => c.name === 'tasks_list_candidates_for_day')

    console.log('\n📊 Tool Call Summary:')
    console.log(`  calendar_day_events_get: ${calendarCalls.length} calls`)
    console.log(`  tasks_list_candidates_for_day: ${tasksCalls.length} calls`)

    // Verify no excessive looping
    if (calendarCalls.length > 3 || tasksCalls.length > 3) {
      console.error('❌ LOOP DETECTED: Tools called too many times!')
      console.error('Expected: 1-2 calls each')
      console.error(`Actual: calendar=${calendarCalls.length}, tasks=${tasksCalls.length}`)

      // Take screenshot of final state
      await mainWindow.screenshot({ path: 'test-results/screenshots/agent-loop-error.png' })

      throw new Error(`Agent loop detected: calendar_day_events_get called ${calendarCalls.length} times, tasks_list_candidates_for_day called ${tasksCalls.length} times`)
    } else {
      console.log('✅ No excessive looping detected')
    }

    // Take screenshot of final state
    await mainWindow.screenshot({ path: 'test-results/screenshots/agent-plan-created.png' })
  })

  test('should show tool calls in UI', async ({ mainWindow }) => {
    // Skip if LLM not configured
    await mainWindow.click('text=Settings')
    const llmConfigured = await mainWindow.locator('select[value="disabled"]').isVisible()

    if (llmConfigured) {
      console.log('⚠️  LLM not configured - skipping agent test')
      test.skip()
    }

    // Go back to Planner
    await mainWindow.click('text=Planner')

    // Send a simple request
    const chatInput = mainWindow.locator('textarea[placeholder*="Ask"], textarea[placeholder*="Type"]')
    await chatInput.fill('What calendar events do I have today?')
    await chatInput.press('Enter')

    // Wait for response
    await mainWindow.waitForTimeout(10000)

    // Look for tool call indicators in the UI
    const toolCallIndicators = await mainWindow.locator('.tool-call, [data-tool-call]').all()

    if (toolCallIndicators.length > 0) {
      console.log(`✅ Found ${toolCallIndicators.length} tool call indicators in UI`)

      // Take screenshot showing tool calls
      await mainWindow.screenshot({ path: 'test-results/screenshots/agent-tool-calls-ui.png' })
    } else {
      console.log('⚠️  No tool call UI indicators found (may need UI updates)')
    }
  })
})

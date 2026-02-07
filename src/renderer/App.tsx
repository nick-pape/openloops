import { useState, useEffect, useCallback } from 'react'
import confetti from 'canvas-confetti'
import { Sidebar } from './components/Sidebar'
import { ChatPane } from './components/ChatPane'
import { ErrorNotification } from './components/ErrorNotification'
import { ProjectView } from './views/ProjectView'
import { PlannerView } from './views/PlannerView'
import { SettingsView } from './views/SettingsView'
import { JobsView } from './views/JobsView'
import { TasksView } from './views/TasksView'
import { HotkeysView } from './views/HotkeysView'
import { WorkModeView } from './views/WorkModeView'
import { TextCaptureView } from './views/TextCaptureView'
import { AgentsPage } from './pages/AgentsPage'
import { McpServersPage } from './pages/McpServersPage'
import { JobsProvider } from './contexts/JobsContext'
import { useDomainEvents } from './hooks/useDomainEvents'
import { Project, ChatContext } from '../types'
import './App.css'

type View =
  | { type: 'welcome' }
  | { type: 'project'; projectId: string }
  | { type: 'tasks' }
  | { type: 'planner' }
  | { type: 'jobs' }
  | { type: 'hotkeys' }
  | { type: 'settings' }
  | { type: 'agents' }
  | { type: 'mcp-servers' }

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentView, setCurrentView] = useState<View>({ type: 'welcome' })
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [chatContext, setChatContext] = useState<ChatContext>({
    general: { projects: [], openTaskCount: 0 },
    active: { type: 'general', label: 'General', color: 'gray' }
  })

  // Check if this is the Work Mode window
  const isWorkModeWindow = window.location.hash === '#/work-mode'
  const isTextCaptureWindow = window.location.hash === '#/text-capture'

  const fireConfetti = useCallback(() => {
    const duration = 1500
    const end = Date.now() + duration

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#f472b6'],
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#f472b6'],
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  }, [])

  useEffect(() => {
    if (!isWorkModeWindow && !isTextCaptureWindow) {
      loadProjects()
      fireConfetti()
    }
  }, [])

  const loadProjects = async () => {
    const allProjects = await window.electron.projects.getAll()
    setProjects(allProjects)
  }

  // Build chat context based on current view
  const buildChatContext = async (view: View, allProjects: Project[]): Promise<ChatContext> => {
    // General context (always present)
    const openTasks = await window.electron.tasks.getOpen()
    const general = {
      projects: allProjects.map(p => ({ id: p.id, name: p.name })),
      openTaskCount: openTasks.length
    }

    // Active context (changes with navigation)
    let active: ChatContext['active']

    switch (view.type) {
      case 'project': {
        const project = allProjects.find(p => p.id === view.projectId)
        const projectTasks = await window.electron.tasks.getOpen(view.projectId)
        const captures = await window.electron.captures.getByProject(view.projectId)
        active = {
          type: 'project',
          label: `Project: ${project?.name || 'Unknown'}`,
          color: 'blue',
          data: {
            projectId: view.projectId,
            projectName: project?.name,
            recentCaptureCount: captures.length,
            openTaskCount: projectTasks.length
          }
        }
        break
      }
      case 'planner':
        active = {
          type: 'planner',
          label: 'Day Planner',
          color: 'green',
          data: {}
        }
        break
      case 'tasks':
        active = {
          type: 'tasks',
          label: 'All Tasks',
          color: 'orange',
          data: {}
        }
        break
      case 'agents':
        active = {
          type: 'agents',
          label: 'Agents',
          color: 'teal',
          data: {}
        }
        break
      case 'mcp-servers':
        active = {
          type: 'mcp-servers',
          label: 'MCP Servers',
          color: 'teal',
          data: {}
        }
        break
      case 'settings':
        active = {
          type: 'settings',
          label: 'Settings',
          color: 'purple',
          data: {}
        }
        break
      default:
        active = {
          type: 'general',
          label: 'General',
          color: 'gray',
          data: {}
        }
    }

    return { general, active }
  }

  // Update chat context when view changes
  useEffect(() => {
    if (!isWorkModeWindow && !isTextCaptureWindow) {
      buildChatContext(currentView, projects).then(setChatContext)
    }
  }, [currentView, projects, isWorkModeWindow, isTextCaptureWindow])

  // Listen for domain events to update UI when external agents (MCP) make changes
  useDomainEvents((event) => {
    if (event.type === 'project.created' || event.type === 'project.updated' || event.type === 'project.deleted') {
      loadProjects()
    }
  })

  // Dev mode: Periodically log listener counts to detect memory leaks
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !isWorkModeWindow && !isTextCaptureWindow) {
      const interval = setInterval(() => {
        const counts = window.electron.debug.getListenerCounts()
        const totalListeners = Object.values(counts).reduce((sum, count) => sum + count, 0)

        if (totalListeners > 0) {
          console.log('[Listener Debug] Current listener counts:', counts, '| Total:', totalListeners)
        }
      }, 10000) // Log every 10 seconds in dev mode

      return () => clearInterval(interval)
    }
  }, [isWorkModeWindow, isTextCaptureWindow])

  const handleCreateProject = async (name: string) => {
    const project = await window.electron.projects.create(name)
    setProjects([project, ...projects])
    setCurrentView({ type: 'project', projectId: project.id })
  }

  const handleDeleteProject = async (id: string) => {
    await window.electron.projects.delete(id)
    setProjects(projects.filter(p => p.id !== id))
    if (currentView.type === 'project' && currentView.projectId === id) {
      setCurrentView({ type: 'welcome' })
    }
  }

  // Render Work Mode window separately (no sidebar, different layout)
  if (isWorkModeWindow) {
    return <WorkModeView />
  }

  // Render Text Capture window separately
  if (isTextCaptureWindow) {
    return <TextCaptureView />
  }

  return (
    <JobsProvider>
      <div className={`app ${chatCollapsed ? 'chat-collapsed' : ''}`}>
        <ErrorNotification />
        <Sidebar
          projects={projects}
          currentView={currentView}
          onSelectProject={(id) => setCurrentView({ type: 'project', projectId: id })}
          onSelectTasks={() => setCurrentView({ type: 'tasks' })}
          onSelectPlanner={() => setCurrentView({ type: 'planner' })}
          onSelectJobs={() => setCurrentView({ type: 'jobs' })}
          onSelectHotkeys={() => setCurrentView({ type: 'hotkeys' })}
          onSelectSettings={() => setCurrentView({ type: 'settings' })}
          onSelectAgents={() => setCurrentView({ type: 'agents' })}
          onSelectMcpServers={() => setCurrentView({ type: 'mcp-servers' })}
          onCreateProject={handleCreateProject}
        />
        <main className="main-content">
          {currentView.type === 'welcome' && (
            <div className="welcome">
              <h1>🤹‍♂️ Welcome to Open Loops</h1>
              <p>Create a project or open the planner to get started.</p>
            </div>
          )}
          {currentView.type === 'project' && (
            <ProjectView
              projectId={currentView.projectId}
              onDeleteProject={handleDeleteProject}
            />
          )}
          {currentView.type === 'tasks' && <TasksView />}
          {currentView.type === 'planner' && <PlannerView />}
          {currentView.type === 'jobs' && <JobsView />}
          {currentView.type === 'hotkeys' && <HotkeysView />}
          {currentView.type === 'settings' && <SettingsView />}
          {currentView.type === 'agents' && <AgentsPage />}
          {currentView.type === 'mcp-servers' && <McpServersPage />}
        </main>
        <ChatPane
          context={chatContext}
          isCollapsed={chatCollapsed}
          onToggle={() => setChatCollapsed(!chatCollapsed)}
        />
      </div>
    </JobsProvider>
  )
}

export default App

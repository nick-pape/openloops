import { useState, useEffect } from 'react'
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
import { JobsProvider } from './contexts/JobsContext'
import { useDomainEvents } from './hooks/useDomainEvents'
import { Project } from '../types'
import './App.css'

type View =
  | { type: 'welcome' }
  | { type: 'project'; projectId: string }
  | { type: 'tasks' }
  | { type: 'planner' }
  | { type: 'jobs' }
  | { type: 'hotkeys' }
  | { type: 'settings' }

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentView, setCurrentView] = useState<View>({ type: 'welcome' })
  const [chatCollapsed, setChatCollapsed] = useState(false)

  // Check if this is the Work Mode window
  const isWorkModeWindow = window.location.hash === '#/work-mode'
  const isTextCaptureWindow = window.location.hash === '#/text-capture'

  useEffect(() => {
    if (!isWorkModeWindow && !isTextCaptureWindow) {
      loadProjects()
    }
  }, [])

  const loadProjects = async () => {
    const allProjects = await window.electron.projects.getAll()
    setProjects(allProjects)
  }

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

  // Get current project ID for chat context
  const currentProjectId = currentView.type === 'project' ? currentView.projectId : null

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
        </main>
        {currentProjectId && (
          <ChatPane
            projectId={currentProjectId}
            isCollapsed={chatCollapsed}
            onToggle={() => setChatCollapsed(!chatCollapsed)}
          />
        )}
      </div>
    </JobsProvider>
  )
}

export default App
